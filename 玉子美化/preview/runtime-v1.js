import { createPreviewImageActions } from './image-actions.js';

const ACTIONS = Object.freeze(['back', 'previousTable', 'nextTable', 'editCurrentTable']);
const REASONS = new Set(['table-data', 'navigation-state']);
const RESULT_STATUSES = new Set(['navigated', 'unavailable', 'stale', 'failed']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function cloneState(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Runtime state 必须是对象');
  const version = Number(input.version);
  if (!Number.isFinite(version)) throw new Error('Runtime state.version 必须是有限数字');
  return deepFreeze({
    version,
    sheetKey: String(input.sheetKey || ''),
    tableName: String(input.tableName || ''),
    headers: Array.isArray(input.headers) ? input.headers.map(value => String(value ?? '')) : [],
    rows: Array.isArray(input.rows) ? input.rows.filter(Array.isArray).map(row => row.map(value => value)) : [],
    route: input.route && typeof input.route === 'object' ? structuredClone(input.route) : input.route ?? null,
    canPrevious: Boolean(input.canPrevious),
    canNext: Boolean(input.canNext),
  });
}

function splitSuffix(reference) {
  const index = String(reference).search(/[?#]/);
  return index < 0 ? [String(reference), ''] : [String(reference).slice(0, index), String(reference).slice(index)];
}

function normalizeAssetPath(reference) {
  const [rawPath, suffix] = splitSuffix(reference);
  const candidate = rawPath.startsWith('./') ? rawPath.slice(2) : rawPath;
  if (!candidate || candidate.startsWith('/') || candidate.includes('\\') || /^(?:[a-z]:|[a-z][a-z\d+.-]*:)/i.test(candidate)) {
    throw new Error(`资源路径必须是 Bundle 内相对路径：${reference}`);
  }
  const segments = candidate.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) throw new Error(`资源路径包含无效段：${reference}`);
  return { path: segments.join('/'), suffix };
}

function decodeBase64(value) {
  if (typeof atob === 'function') {
    const decoded = atob(value);
    return Uint8Array.from(decoded, character => character.charCodeAt(0));
  }
  if (typeof Buffer !== 'undefined') return Uint8Array.from(Buffer.from(value, 'base64'));
  throw new Error('当前环境无法解码 Base64 资源');
}

function fileContent(file) {
  if (file.encoding === 'base64') return decodeBase64(file.content);
  if (file.encoding === 'text') return String(file.content ?? '');
  throw new Error(`不支持的资源编码：${file.encoding}`);
}

function actionResult(action, scenario, state) {
  const base = { ok: scenario === 'navigated', action, status: scenario, fromRoute: state.route };
  if (scenario === 'navigated') return deepFreeze({ ...base, targetRoute: `preview:${action}` });
  if (scenario === 'stale') return deepFreeze({ ...base, errorCode: 'PREVIEW_STALE', message: '制作期模拟：页面状态已失效' });
  if (scenario === 'failed') return deepFreeze({ ...base, errorCode: 'PREVIEW_FAILED', message: '制作期模拟：动作失败' });
  return deepFreeze(base);
}

function timeoutError(timeoutMs) {
  const error = new Error(`mount 超过 ${timeoutMs}ms`);
  error.code = 'MOUNT_TIMEOUT';
  return error;
}

function presetAssetSlot(slot) {
  if (typeof slot !== 'string' || slot.length === 0) throw new TypeError('presetAssets slot 必须是非空字符串');
  return slot;
}

export function createRuntimeV1({
  root,
  files = {},
  initialState,
  declaration = null,
  timeoutMs = 10_000,
  onAction = null,
  onLog = null,
  urlApi = globalThis.URL,
  BlobCtor = globalThis.Blob,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
} = {}) {
  if (!root || typeof root !== 'object') throw new Error('Runtime root 缺失');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('timeoutMs 必须是正数');
  let state = cloneState(initialState);
  let destroyed = false;
  let mountGeneration = 0;
  let currentMount = null;
  const previewImages = new Map();
  let imageScenario = 'generated';
  let imageMock = null;
  const setImageScenario = value => { imageMock?.setScenario(value); imageScenario = value; };
  const subscriptions = new Set();
  const objectUrls = new Map();
  const presetAssetBlobs = new Map();
  const presetAssetUrls = new Map();
  const pendingActions = new Map();
  const actionScenarios = new Map(ACTIONS.map(action => [action, 'navigated']));

  const log = (level, message, details = null) => {
    onLog?.(deepFreeze({ level, message, details, timestamp: new Date().toISOString() }));
  };

  const getState = () => state;

  const subscribe = listener => {
    if (destroyed) throw new Error('Runtime 已销毁');
    if (typeof listener !== 'function') throw new TypeError('subscribe listener 必须是函数');
    const record = { listener, lastVersion: state.version, active: true };
    subscriptions.add(record);
    return () => {
      if (!record.active) return;
      record.active = false;
      subscriptions.delete(record);
    };
  };

  const updateState = (next, { reason = 'table-data' } = {}) => {
    if (destroyed) return false;
    if (!REASONS.has(reason)) throw new Error(`未知订阅 reason：${reason}`);
    const frozen = cloneState(next);
    if (frozen.version === state.version) return false;
    state = frozen;
    const metadata = deepFreeze({ reason });
    for (const record of [...subscriptions]) {
      if (!record.active || record.lastVersion === state.version) continue;
      record.lastVersion = state.version;
      try {
        record.listener(state, metadata);
      } catch (error) {
        log('error', 'subscribe listener 抛错', { message: error?.message || String(error) });
      }
    }
    return true;
  };

  const resolveAsset = reference => {
    if (destroyed) throw new Error('Runtime 已销毁');
    const normalized = normalizeAssetPath(reference);
    const file = files[normalized.path];
    if (!file) throw new Error(`Bundle 资源不存在：${normalized.path}`);
    if (!objectUrls.has(normalized.path)) {
      if (!urlApi?.createObjectURL || !BlobCtor) throw new Error('当前环境不支持 Blob URL');
      const blob = new BlobCtor([fileContent(file)], { type: file.mimeType || 'application/octet-stream' });
      objectUrls.set(normalized.path, urlApi.createObjectURL(blob));
    }
    return `${objectUrls.get(normalized.path)}${normalized.suffix}`;
  };

  const revokePresetAssetUrl = slot => {
    const url = presetAssetUrls.get(slot);
    if (!url) return;
    urlApi?.revokeObjectURL?.(url);
    presetAssetUrls.delete(slot);
  };

  const revokePresetAssetUrls = () => {
    for (const slot of [...presetAssetUrls.keys()]) revokePresetAssetUrl(slot);
  };

  const createPresetAssets = signal => {
    const assertActive = () => {
      if (destroyed) throw new Error('Runtime 已销毁');
      if (signal.aborted) throw new Error('页面实例已失效');
    };
    const createUrl = blob => {
      if (!urlApi?.createObjectURL) throw new Error('当前环境不支持 Blob URL');
      return urlApi.createObjectURL(blob);
    };
    return Object.freeze({
      async getUrl(slot) {
        assertActive();
        const key = presetAssetSlot(slot);
        const blob = presetAssetBlobs.get(key);
        if (!blob) return null;
        if (!presetAssetUrls.has(key)) presetAssetUrls.set(key, createUrl(blob));
        return presetAssetUrls.get(key);
      },
      async save(slot, image) {
        assertActive();
        const key = presetAssetSlot(slot);
        if (!BlobCtor || !(image instanceof BlobCtor)) throw new TypeError('presetAssets.save image 必须是 Blob');
        const url = createUrl(image);
        revokePresetAssetUrl(key);
        presetAssetBlobs.set(key, image);
        presetAssetUrls.set(key, url);
        return url;
      },
      async delete(slot) {
        assertActive();
        const key = presetAssetSlot(slot);
        revokePresetAssetUrl(key);
        presetAssetBlobs.delete(key);
      },
    });
  };

  const invokeAction = action => {
    if (pendingActions.has(action)) return pendingActions.get(action);
    const promise = Promise.resolve().then(async () => {
      if (destroyed) return actionResult(action, 'stale', state);
      let scenario = actionScenarios.get(action) || 'navigated';
      if ((action === 'previousTable' && !state.canPrevious) || (action === 'nextTable' && !state.canNext)) scenario = 'unavailable';
      let result = actionResult(action, scenario, state);
      if (typeof onAction === 'function') {
        const override = await onAction(action, result, state);
        if (override && typeof override === 'object') {
          if (!RESULT_STATUSES.has(override.status)) throw new Error(`onAction 返回未知状态：${override.status}`);
          result = deepFreeze({ ...result, ...override, action });
        }
      }
      log(result.ok ? 'info' : 'warn', `action ${action} → ${result.status}`, result);
      return result;
    }).catch(error => {
      const result = deepFreeze({
        ok: false,
        action,
        status: 'failed',
        fromRoute: state.route,
        errorCode: error?.code || 'PREVIEW_ACTION_ERROR',
        message: error?.message || String(error),
      });
      log('error', `action ${action} 抛错`, result);
      return result;
    }).finally(() => {
      if (pendingActions.get(action) === promise) pendingActions.delete(action);
    });
    pendingActions.set(action, promise);
    return promise;
  };

  const actions = Object.freeze(Object.fromEntries(ACTIONS.map(action => [action, () => invokeAction(action)])));

  const setActionScenario = (action, scenario) => {
    if (!ACTIONS.includes(action)) throw new Error(`未知 action：${action}`);
    if (!RESULT_STATUSES.has(scenario)) throw new Error(`未知 action 场景：${scenario}`);
    actionScenarios.set(action, scenario);
  };

  const cleanupMount = async mount => {
    if (!mount || mount.cleaned) return;
    mount.cleaned = true;
    for (const unsubscribe of mount.unsubscribers.splice(0)) unsubscribe();
    if (!mount.controller.signal.aborted) mount.controller.abort();
    if (mount.disposer && !mount.disposerCalled) {
      mount.disposerCalled = true;
      try {
        await mount.disposer();
      } catch (error) {
        log('error', '作者 disposer 抛错', { message: error?.message || String(error) });
      }
    }
    revokePresetAssetUrls();
    mount.moduleCleanup?.();
  };

  const unmount = async () => {
    const mount = currentMount;
    if (!mount) return;
    currentMount = null;
    await cleanupMount(mount);
  };

  const mountModule = async (module, { moduleCleanup = null } = {}) => {
    if (destroyed) throw new Error('Runtime 已销毁');
    if (!module || typeof module.mount !== 'function') throw new Error('入口模块必须导出 mount(context)');
    await unmount();
    const generation = ++mountGeneration;
    const controller = new AbortController();
    const mountSubscriptions = [];
    const presetAssets = createPresetAssets(controller.signal);
    imageMock = createPreviewImageActions({ declaration, getState, signal: controller.signal, images: previewImages, onLog: entry => log(entry.level, entry.message, entry.details) });
    imageMock.setScenario(imageScenario);
    const context = Object.freeze({
      apiVersion: 1,
      root,
      signal: controller.signal,
      getState,
      subscribe(listener) {
        const unsubscribe = subscribe(listener);
        mountSubscriptions.push(unsubscribe);
        return unsubscribe;
      },
      resolveAsset,
      presetAssets,
      actions: Object.freeze({ ...actions, ...imageMock.actions }),
    });
    const mount = {
      generation,
      controller,
      context,
      unsubscribers: mountSubscriptions,
      disposer: null,
      disposerCalled: false,
      moduleCleanup,
      cleaned: false,
    };
    currentMount = mount;
    let timer;
    const invocation = Promise.resolve().then(() => module.mount(context));
    invocation.then(disposer => {
      if (typeof disposer !== 'function') return;
      mount.disposer = disposer;
      if (mount.cleaned && !mount.disposerCalled) {
        mount.disposerCalled = true;
        Promise.resolve(disposer()).catch(error => log('error', '迟到 disposer 抛错', { message: error?.message || String(error) }));
      }
    }, () => {});
    const timeout = new Promise((_, reject) => {
      timer = setTimer(() => reject(timeoutError(timeoutMs)), timeoutMs);
    });
    try {
      const disposer = await Promise.race([invocation, timeout]);
      if (typeof disposer === 'function') mount.disposer = disposer;
      if (currentMount !== mount || mount.cleaned) {
        await cleanupMount(mount);
        throw new Error('mount 在完成前已被替换');
      }
      log('info', `mount 完成 #${generation}`);
      return context;
    } catch (error) {
      if (currentMount === mount) currentMount = null;
      await cleanupMount(mount);
      log('error', `mount 失败 #${generation}`, { code: error?.code, message: error?.message || String(error) });
      throw error;
    } finally {
      clearTimer(timer);
    }
  };

  const destroy = async () => {
    if (destroyed) return;
    destroyed = true;
    await unmount();
    subscriptions.clear();
    for (const url of objectUrls.values()) urlApi?.revokeObjectURL?.(url);
    objectUrls.clear();
    revokePresetAssetUrls();
    presetAssetBlobs.clear();
    previewImages.clear();
    pendingActions.clear();
    log('info', 'Runtime 已清理');
  };

  return Object.freeze({
    apiVersion: 1,
    actions,
    getState,
    subscribe,
    updateState,
    resolveAsset,
    setActionScenario,
    setImageScenario,
    mountModule,
    unmount,
    destroy,
    get destroyed() { return destroyed; },
    get activeObjectUrlCount() { return objectUrls.size; },
  });
}

export const RUNTIME_ACTIONS = ACTIONS;

async function startFrameBridge() {
  const root = document.querySelector('#mount-root');
  const status = document.querySelector('#frame-status');
  const bridgeId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  let runtime = null;
  let moduleUrl = null;

  const post = (type, payload = {}) => parent.postMessage({ source: 'yuzi-beautify-frame', bridgeId, type, ...payload }, '*');
  const showStatus = (message, tone = 'neutral') => {
    status.textContent = message;
    status.dataset.tone = tone;
  };
  const clear = async () => {
    if (runtime) await runtime.destroy();
    runtime = null;
    if (moduleUrl) URL.revokeObjectURL(moduleUrl);
    moduleUrl = null;
    root.replaceChildren();
    document.querySelector('#preset-style')?.remove();
  };
  const mountPayload = async payload => {
    await clear();
    const { bundle, renderableKind = 'item', renderableId, state, scenarios = {} } = payload;
    const renderable = (renderableKind === 'display' ? bundle?.manifest?.displays : bundle?.manifest?.items)
      ?.find(entry => entry.id === renderableId);
    if (!renderable) {
      const placeholder = document.createElement('section');
      placeholder.className = 'frame-placeholder';
      placeholder.textContent = '当前表没有匹配的美化页面或展示。';
      root.append(placeholder);
      showStatus('通用占位页', 'warning');
      return;
    }
    const htmlFile = renderable.entry.html ? bundle.files[renderable.entry.html] : null;
    const cssFile = renderable.entry.css ? bundle.files[renderable.entry.css] : null;
    const mountFile = bundle.files[renderable.entry.mount];
    if (htmlFile?.encoding === 'text') root.innerHTML = htmlFile.content;
    if (cssFile?.encoding === 'text') {
      const style = document.createElement('style');
      style.id = 'preset-style';
      style.textContent = cssFile.content;
      document.head.append(style);
    }
    if (!mountFile || mountFile.encoding !== 'text') throw new Error(`mount 文件不可用：${renderable.entry.mount}`);
    moduleUrl = URL.createObjectURL(new Blob([mountFile.content], { type: 'text/javascript' }));
    const module = await import(moduleUrl);
    runtime = createRuntimeV1({
      root,
      files: bundle.files,
      initialState: state,
      declaration: renderable,
      onAction(action, result) {
        post('action-result', { action, result });
        return result;
      },
      onLog(entry) { post('log', { entry }); },
    });
    for (const [action, scenario] of Object.entries(scenarios)) runtime.setActionScenario(action, scenario);
    await runtime.mountModule(module);
    runtime.setImageScenario(payload.imageScenario || 'generated');
    showStatus(`已挂载 ${renderable.name || renderable.id}`, 'success');
  };

  addEventListener('message', async event => {
    if (event.source !== parent || event.data?.source !== 'yuzi-beautify-panel') return;
    const message = event.data;
    try {
      if (message.type === 'ping') {
        post('ready');
        return;
      }
      if (message.type === 'mount') await mountPayload(message.payload);
      if (message.type === 'image-scenario') runtime?.setImageScenario(message.scenario);
      if (message.type === 'update-state') runtime?.updateState(message.state, { reason: message.reason || 'table-data' });
      if (message.type === 'scenario') runtime?.setActionScenario(message.action, message.scenario);
      if (message.type === 'action') {
        await runtime?.actions?.[message.action]?.();
      }
      if (message.type === 'cleanup') {
        await clear();
        showStatus('已清理', 'neutral');
        post('cleaned');
      }
    } catch (error) {
      showStatus(error?.message || String(error), 'error');
      post('log', { entry: { level: 'error', message: error?.message || String(error), timestamp: new Date().toISOString() } });
    }
  });
  addEventListener('pagehide', () => { void clear(); }, { once: true });
  post('ready');
}

if (typeof document !== 'undefined' && document.documentElement?.dataset?.yuziPreviewFrame === 'true') {
  void startFrameBridge();
}
