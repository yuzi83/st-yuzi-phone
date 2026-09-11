import { createAssetRuntime } from './asset-runtime.js';
import { createContentPresetAppearanceBridge } from './host-appearance.js';
import { createContentPresetRuntimeContextController } from './runtime-context.js';
import { importContentPresetModule, invokeContentPresetMount } from './script-runtime.js';

function abortError() {
    const error = typeof DOMException === 'function'
        ? new DOMException('玉子美化展示挂载已取消', 'AbortError')
        : new Error('玉子美化展示挂载已取消');
    error.name = 'AbortError';
    return error;
}

function fileText(record, path) {
    const file = path ? record?.files?.[path] : null;
    if (!file) throw new Error(`展示资源不存在：${path}`);
    if (file.encoding !== 'base64') return String(file.content ?? '');
    const binary = atob(file.content);
    return new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
}

function createStyle(root, options) {
    if (typeof options.createStyleElement === 'function') return options.createStyleElement(root);
    const documentRef = root?.ownerDocument;
    if (typeof documentRef?.createElement !== 'function') throw new Error('展示根节点不支持创建 CSS 节点');
    return documentRef.createElement('style');
}

function attachStyle(root, style, options) {
    if (typeof options.attachStyle === 'function') return options.attachStyle(root, style);
    if (typeof root?.prepend === 'function') return root.prepend(style);
    if (typeof root?.appendChild === 'function') return root.appendChild(style);
    throw new Error('展示根节点不支持挂载 CSS 节点');
}

function detachStyle(root, style, options) {
    if (!style) return;
    try {
        if (typeof options.detachStyle === 'function') options.detachStyle(root, style);
        else if (typeof style.remove === 'function') style.remove();
        else if (typeof root?.removeChild === 'function') root.removeChild(style);
    } catch {}
}

function clearRoot(root, options) {
    try {
        if (typeof options.clearRoot === 'function') options.clearRoot(root);
        else if (typeof root?.replaceChildren === 'function') root.replaceChildren();
        else if (root && 'innerHTML' in root) root.innerHTML = '';
    } catch {}
}

function createInlineActions(display, handlers) {
    if (display?.kind !== 'inline') return Object.freeze({});
    const allowed = new Set(Array.isArray(display.interactions) ? display.interactions : []);
    const action = (declaration, handler) => allowed.has(declaration) && typeof handler === 'function'
        ? (...args) => handler(...args)
        : null;
    const actions = {
        expand: action('expand', handlers?.expand),
        tab: action('tabs', handlers?.tab),
        appendToComposer: action('append-input', handlers?.appendToComposer),
        generateImage: action('image-generate', handlers?.generateImage),
        readImage: action('image-generate', handlers?.readImage),
        saveImage: action('image-generate', handlers?.saveImage),
        deleteImage: action('image-generate', handlers?.deleteImage),
        getImageGenerationState: action('image-generate', handlers?.getImageGenerationState),
        subscribeImageGeneration: action('image-generate', handlers?.subscribeImageGeneration),
    };
    return Object.freeze(Object.fromEntries(Object.entries(actions).filter(([, value]) => value)));
}

function createLifecycleSignal(signal, AbortControllerCtor = globalThis.AbortController) {
    if (typeof AbortControllerCtor !== 'function') throw new Error('当前环境不支持 AbortController');
    const controller = new AbortControllerCtor();
    const abort = () => {
        if (!controller.signal.aborted) controller.abort();
    };
    if (signal?.aborted) abort();
    return Object.freeze({ controller, signal: controller.signal, abort });
}

/**
 * 已验证内容预设展示的独立挂载内核。
 *
 * 调用方拥有 root 与数据订阅；本内核只处理一份 display 的 HTML/CSS/ES module
 * 生命周期，并通过 update(nextState) 将最新快照转交给作者的 mount(context)。
 */
export function createContentPresetDisplayRuntime(options = {}) {
    const record = options.record;
    const display = options.display;
    const root = options.root;
    if (!record || !display || !root) throw new Error('展示运行时需要 record、display 与 root');
    if (!['inline', 'popup', 'barrage'].includes(display.kind)) throw new Error(`不支持的展示类型：${display.kind}`);
    if (!display.entry?.mount) throw new Error('展示缺少 ES Module mount 入口');

    const lifecycle = createLifecycleSignal(options.signal, options.AbortControllerCtor);
    const runtimeDeps = Object.freeze({
        createAssetRuntime: options.createAssetRuntime || createAssetRuntime,
        createContentPresetRuntimeContextController: options.createContentPresetRuntimeContextController || createContentPresetRuntimeContextController,
        importContentPresetModule: options.importContentPresetModule || importContentPresetModule,
        invokeContentPresetMount: options.invokeContentPresetMount || invokeContentPresetMount,
    });
    let disposed = false;
    let mountPromise = null;
    let assetRuntime = null;
    let moduleRuntime = null;
    let contextController = null;
    let authorDisposer = null;
    let style = null;
    let releaseAppearance = () => {};
    let removeExternalAbort = () => {};

    const disposeAuthor = () => {
        const disposer = authorDisposer;
        authorDisposer = null;
        if (typeof disposer !== 'function') return;
        try { disposer(); } catch {}
    };
    const setAuthorDisposer = disposer => {
        if (typeof disposer !== 'function') return;
        if (disposed) {
            try { disposer(); } catch {}
            return;
        }
        authorDisposer = disposer;
    };
    const dispose = () => {
        if (disposed) return;
        disposed = true;
        lifecycle.abort();
        removeExternalAbort(); removeExternalAbort = () => {};
        releaseAppearance(); releaseAppearance = () => {};
        contextController?.dispose(); contextController = null;
        disposeAuthor();
        moduleRuntime?.disposeModuleUrl(); moduleRuntime = null;
        assetRuntime?.dispose(); assetRuntime = null;
        detachStyle(root, style, options); style = null;
        clearRoot(root, options);
    };

    if (options.signal && typeof options.signal.addEventListener === 'function') {
        const onExternalAbort = () => dispose();
        options.signal.addEventListener('abort', onExternalAbort, { once: true });
        removeExternalAbort = () => options.signal.removeEventListener?.('abort', onExternalAbort);
    }

    const mount = async () => {
        if (mountPromise) return mountPromise;
        mountPromise = (async () => {
            if (disposed || lifecycle.signal.aborted) throw abortError();
            try {
                assetRuntime = runtimeDeps.createAssetRuntime(record, options.assetRuntimeOptions);
                const html = display.entry.html ? fileText(record, display.entry.html) : '';
                const css = display.entry.css ? fileText(record, display.entry.css) : '';
                if ('innerHTML' in root) root.innerHTML = html ? assetRuntime.rewriteHtml(html, display.entry.html) : '';
                else if (html) throw new Error('展示根节点不支持写入 HTML');
                if (css) {
                    style = createStyle(root, options);
                    style.textContent = assetRuntime.rewriteCss(css, display.entry.css);
                    attachStyle(root, style, options);
                }
                releaseAppearance = createContentPresetAppearanceBridge(root, display, options);
                contextController = runtimeDeps.createContentPresetRuntimeContextController({
                    root,
                    signal: lifecycle.signal,
                    initialState: options.initialState || null,
                    actions: createInlineActions(display, options.inlineInteractions),
                    presetAssets: options.presetAssets,
                    resolveAsset: assetRuntime.resolveAsset,
                });
                moduleRuntime = await runtimeDeps.importContentPresetModule({
                    ...options.moduleOptions,
                    source: fileText(record, display.entry.mount),
                    signal: lifecycle.signal,
                });
                if (disposed || lifecycle.signal.aborted) throw abortError();
                const disposer = await runtimeDeps.invokeContentPresetMount({
                    ...options.mountOptions,
                    mount: moduleRuntime.mount,
                    context: contextController.context,
                    signal: lifecycle.signal,
                    onLateDisposer: setAuthorDisposer,
                });
                setAuthorDisposer(disposer);
                if (disposed || lifecycle.signal.aborted) throw abortError();
                return true;
            } catch (error) {
                dispose();
                throw error;
            }
        })();
        return mountPromise;
    };

    return Object.freeze({
        mount,
        update(nextState, reason = 'table-data') {
            if (disposed || lifecycle.signal.aborted) return false;
            return contextController?.publish(nextState, reason) || false;
        },
        dispose,
        get signal() { return lifecycle.signal; },
        get isDisposed() { return disposed; },
    });
}
