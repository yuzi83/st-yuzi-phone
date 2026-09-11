const elementIds = [
  'disclaimer', 'build-status', 'reload', 'cleanup', 'item', 'table', 'width', 'scenario', 'image-scenario', 'device', 'frame',
  'mock-meta', 'mock-notice', 'mock-head', 'mock-body', 'apply', 'reset', 'add-column', 'add-row', 'log', 'clear-log',
];
const elements = Object.fromEntries(elementIds.map(id => [id, document.getElementById(id)]));
const actions = ['back', 'previousTable', 'nextTable', 'editCurrentTable'];
const scenarios = Object.fromEntries(actions.map(action => [action, 'navigated']));
const mockTables = new Map();
let session = null;
let draft = null;
let frameReady = false;
let frameBridgeId = null;
let version = 1;
let saveTimer = null;
let saveInFlight = null;
let eventSource = null;
let eventRefresh = null;
let pendingSessionRevision = 0;

function clone(value) {
  return structuredClone(value);
}

function normalized(value) {
  return String(value ?? '').normalize('NFKC').trim();
}

function sameTableName(left, right) {
  return normalized(left) === normalized(right);
}

function appendLog(level, message, details = null) {
  let suffix = '';
  if (details) {
    try {
      suffix = ` ${JSON.stringify(details)}`;
    } catch {
      suffix = ' {"details":"无法序列化"}';
    }
  }
  const line = `[${new Date().toLocaleTimeString()}] ${String(level).toUpperCase()} ${message}${suffix}`;
  elements.log.textContent = `${elements.log.textContent}${line}\n`;
  elements.log.scrollTop = elements.log.scrollHeight;
}

function fillSelect(select, values, selected, label) {
  select.replaceChildren();
  for (const value of values) {
    const option = document.createElement('option');
    option.value = value.id;
    option.textContent = label(value);
    select.append(option);
  }
  const available = new Set(values.map(value => value.id));
  if (selected && available.has(selected)) select.value = selected;
  else if (values[0]) select.value = values[0].id;
}

function currentTable() {
  return session?.tables.find(table => table.sheetKey === elements.table.value) || null;
}

function currentMockTable() {
  const table = currentTable();
  if (!table) return null;
  if (draft?.sheetKey === table.sheetKey) return draft;
  return mockTables.get(table.sheetKey) || null;
}

function matchingItem(table) {
  if (!session || !table) return null;
  const selected = session.bundle.manifest.items.find(item => item.id === elements.item.value);
  if (selected && sameTableName(selected.target.tableName, table.tableName)) return selected;
  return session.bundle.manifest.items.find(item => sameTableName(item.target.tableName, table.tableName)) || selected || null;
}

function matchingRenderable(table) {
  const display = session?.selectedDisplayId
    ? session.bundle.manifest.displays?.find(entry => entry.id === session.selectedDisplayId)
    : null;
  if (display) {
    return {
      kind: 'display',
      entry: display.targets.some(target => sameTableName(target.tableName, table?.tableName)) ? display : null,
    };
  }
  return { kind: 'item', entry: matchingItem(table) };
}

function createDraft(record) {
  return {
    ...clone(record),
    expectedRevision: record.revision,
    unsaved: false,
    saving: false,
    saveError: '',
    sequence: 0,
  };
}

function loadDraft(sheetKey, { preserve = false } = {}) {
  if (preserve && draft?.sheetKey === sheetKey) return;
  const record = mockTables.get(sheetKey);
  draft = record ? createDraft(record) : null;
}

function stateForSelection(nextVersion = version) {
  const table = currentTable();
  const mock = currentMockTable();
  if (!table || !mock) return null;
  const index = session.tables.findIndex(entry => entry.sheetKey === table.sheetKey);
  return {
    ...table.state,
    version: nextVersion,
    headers: clone(mock.headers),
    rows: clone(mock.rows),
    canPrevious: index > 0,
    canNext: index < session.tables.length - 1,
  };
}

function post(type, payload = {}) {
  elements.frame.contentWindow?.postMessage({ source: 'yuzi-beautify-panel', type, ...payload }, '*');
}

function renderBuildStatus(build = session?.build) {
  if (!build) {
    elements['build-status'].textContent = '';
    elements['build-status'].dataset.status = 'idle';
    return;
  }
  const status = build.status || 'ready';
  elements['build-status'].dataset.status = status;
  if (status === 'building') {
    elements['build-status'].textContent = '正在根据项目源码重构建内存 Bundle…';
    return;
  }
  if (status === 'error') {
    elements['build-status'].textContent = `最近一次构建失败，仍显示上一成功版本：${build.lastError?.message || '未知错误'}`;
    return;
  }
  elements['build-status'].textContent = `内存 Bundle 已就绪 · revision ${session?.revision ?? 0} · 源码监听 ${build.watching ? '已开启' : '未开启'}`;
}

function renderMockStatus() {
  if (!draft) {
    elements['mock-meta'].textContent = '当前没有可编辑的模拟表。';
    elements['mock-notice'].textContent = '请先选择包含表数据的项目。';
    elements['mock-notice'].dataset.tone = 'neutral';
    elements.apply.disabled = true;
    elements.reset.disabled = true;
    elements['add-column'].disabled = true;
    elements['add-row'].disabled = true;
    return;
  }
  const flags = [
    `Mock revision ${draft.revision}`,
    draft.dirty ? '已偏离真实基线' : '与真实基线一致',
    `进程内存 #${session?.mock?.revision ?? 0}`,
  ];
  elements['mock-meta'].textContent = flags.join(' · ');
  elements.apply.disabled = !draft.unsaved || draft.saving;
  elements.reset.disabled = draft.saving;
  elements['add-column'].disabled = draft.saving;
  elements['add-row'].disabled = draft.saving;
  if (draft.schemaDiverged) {
    elements['mock-notice'].textContent = '真实 generated 表结构已改变；当前 Mock 保留你的编辑。重置当前表后才会采用新的真实字段。';
    elements['mock-notice'].dataset.tone = 'warning';
  } else if (draft.saveError) {
    elements['mock-notice'].textContent = `内存保存失败：${draft.saveError}。当前 iframe 仍显示本地草稿，可再次点击“应用到内存”。`;
    elements['mock-notice'].dataset.tone = 'error';
  } else if (draft.saving) {
    elements['mock-notice'].textContent = '正在保存到当前预览进程内存。';
    elements['mock-notice'].dataset.tone = 'neutral';
  } else if (draft.unsaved) {
    elements['mock-notice'].textContent = '数值已即时推送给 iframe，正在等待写入当前预览进程内存。';
    elements['mock-notice'].dataset.tone = 'neutral';
  } else {
    elements['mock-notice'].textContent = '只存于本地预览进程内存；停止 preview 后自动丢弃，不会写表或打包。';
    elements['mock-notice'].dataset.tone = 'success';
  }
}

function makeButton(text, className, dataset, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = text;
  button.setAttribute('aria-label', label);
  Object.assign(button.dataset, dataset);
  return button;
}

function makeInput(value, dataset, label) {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = String(value ?? '');
  input.className = 'mock-input';
  input.setAttribute('aria-label', label);
  Object.assign(input.dataset, dataset);
  return input;
}

function renderMockEditor() {
  elements['mock-head'].replaceChildren();
  elements['mock-body'].replaceChildren();
  if (!draft) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.className = 'mock-empty';
    cell.colSpan = 1;
    cell.textContent = '没有可编辑的 Mock 表。';
    row.append(cell);
    elements['mock-body'].append(row);
    renderMockStatus();
    return;
  }
  const headerRow = document.createElement('tr');
  draft.headers.forEach((header, columnIndex) => {
    const cell = document.createElement('th');
    cell.scope = 'col';
    const field = document.createElement('div');
    field.className = 'mock-header-field';
    field.append(
      makeInput(header, { mockHeader: String(columnIndex) }, `第 ${columnIndex + 1} 列的表头`),
      makeButton('×', 'icon-button', { removeColumn: String(columnIndex) }, `删除第 ${columnIndex + 1} 列`),
    );
    cell.append(field);
    headerRow.append(cell);
  });
  const actionHeader = document.createElement('th');
  actionHeader.scope = 'col';
  actionHeader.className = 'mock-row-action';
  actionHeader.textContent = '行操作';
  headerRow.append(actionHeader);
  elements['mock-head'].append(headerRow);

  if (draft.rows.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.className = 'mock-empty';
    cell.colSpan = Math.max(draft.headers.length + 1, 1);
    cell.textContent = '当前 Mock 没有数据行，可点击“新增行”。';
    row.append(cell);
    elements['mock-body'].append(row);
  } else {
    draft.rows.forEach((rowValues, rowIndex) => {
      const row = document.createElement('tr');
      draft.headers.forEach((_header, columnIndex) => {
        const cell = document.createElement('td');
        cell.append(makeInput(rowValues[columnIndex], {
          mockCellRow: String(rowIndex),
          mockCellColumn: String(columnIndex),
        }, `第 ${rowIndex + 1} 行第 ${columnIndex + 1} 列`));
        row.append(cell);
      });
      const actionsCell = document.createElement('td');
      actionsCell.className = 'mock-row-action';
      actionsCell.append(makeButton('删除行', 'mini-button', { removeRow: String(rowIndex) }, `删除第 ${rowIndex + 1} 行`));
      row.append(actionsCell);
      elements['mock-body'].append(row);
    });
  }
  renderMockStatus();
}

function pushDraftState() {
  if (!frameReady) return;
  const nextVersion = version + 1;
  const state = stateForSelection(nextVersion);
  if (!state) return;
  version = nextVersion;
  post('update-state', { state, reason: 'table-data' });
}

function onDraftChanged() {
  if (!draft) return;
  draft.unsaved = true;
  draft.saveError = '';
  draft.sequence += 1;
  pushDraftState();
  renderMockStatus();
  scheduleSave();
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void flushSave();
  }, 180);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, { cache: 'no-store', ...options });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.message || `预览服务返回 ${response.status}`);
    error.payload = payload;
    error.status = response.status;
    throw error;
  }
  return payload;
}

function currentSessionRevision() {
  const revision = Number(session?.revision);
  return Number.isInteger(revision) && revision >= 0 ? revision : 0;
}

async function refreshConflictRevision(target) {
  const latestSession = await requestJson('/api/session');
  const latestTable = latestSession.mock?.tables?.find(table => table.sheetKey === target.sheetKey);
  if (!latestTable) throw new Error(`冲突后未找到 Mock 表：${target.sheetKey}`);
  mockTables.set(latestTable.sheetKey, clone(latestTable));
  if (session && latestSession.mock) session.mock = clone(latestSession.mock);
  if (draft !== target) return;
  target.revision = latestTable.revision;
  target.expectedRevision = latestTable.revision;
  target.dirty = latestTable.dirty;
  target.schemaDiverged = latestTable.schemaDiverged;
  target.unsaved = true;
  target.saveError = 'Mock 已被另一处面板更新。已取得最新版本；本地草稿未覆盖，请再次点击“应用到内存”。';
  appendLog('warn', `Mock 版本冲突：${target.tableName}，已保留本地草稿。`, { revision: latestTable.revision });
}

function queueSessionRefresh(revision) {
  const requestedRevision = Number(revision);
  if (!Number.isInteger(requestedRevision) || requestedRevision <= currentSessionRevision()) return;
  pendingSessionRevision = Math.max(pendingSessionRevision, requestedRevision);
  if (eventRefresh) return;
  eventRefresh = (async () => {
    let refreshFailed = false;
    try {
      while (pendingSessionRevision > currentSessionRevision()) {
        const targetRevision = pendingSessionRevision;
        await fetchSession({ preserveSelection: true, preserveDraft: true });
        const appliedRevision = currentSessionRevision();
        appendLog('info', '源码变化已应用到 iframe。', { requestedRevision: targetRevision, revision: appliedRevision });
        if (appliedRevision >= pendingSessionRevision) pendingSessionRevision = 0;
      }
    } catch (error) {
      refreshFailed = true;
      appendLog('error', '读取自动重构建结果失败', { message: error.message });
    } finally {
      eventRefresh = null;
      if (!refreshFailed && pendingSessionRevision > currentSessionRevision()) {
        queueSessionRefresh(pendingSessionRevision);
      }
    }
  })();
}

async function flushSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (saveInFlight) return saveInFlight;
  if (!draft?.unsaved || draft.saveError) return undefined;
  const target = draft;
  const sequence = target.sequence;
  target.saving = true;
  renderMockStatus();
  saveInFlight = (async () => {
    try {
      const result = await requestJson(`/api/mock/tables/${encodeURIComponent(target.sheetKey)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ headers: target.headers, rows: target.rows, expectedRevision: target.expectedRevision }),
      });
      mockTables.set(result.table.sheetKey, clone(result.table));
      if (session && result.session?.mock) session.mock = clone(result.session.mock);
      if (draft === target) {
        target.revision = result.table.revision;
        target.expectedRevision = result.table.revision;
        target.dirty = result.table.dirty;
        target.schemaDiverged = result.table.schemaDiverged;
        if (target.sequence === sequence) target.unsaved = false;
        appendLog('info', `Mock 已保存：${target.tableName}`, { revision: result.table.revision });
      }
    } catch (error) {
      if (draft === target) {
        if (error.status === 409) {
          try {
            await refreshConflictRevision(target);
          } catch (refreshError) {
            target.saveError = `版本冲突后无法读取最新 Mock：${refreshError.message}`;
            appendLog('error', `Mock 冲突同步失败：${target.tableName}`, { message: refreshError.message, status: refreshError.status });
          }
        } else {
          target.saveError = error.message;
          appendLog('error', `Mock 保存失败：${target.tableName}`, { message: error.message, status: error.status });
        }
      }
    } finally {
      if (draft === target) {
        target.saving = false;
        renderMockStatus();
        if (target.unsaved && !target.saveError) scheduleSave();
      }
      saveInFlight = null;
    }
  })();
  return saveInFlight;
}

function mountSelection({ preserveDraft = false, log = true } = {}) {
  const table = currentTable();
  if (!session || !table) {
    renderMockEditor();
    return;
  }
  loadDraft(table.sheetKey, { preserve: preserveDraft });
  renderMockEditor();
  if (!frameReady) return;
  const renderable = matchingRenderable(table);
  const item = renderable.kind === 'item' ? renderable.entry : null;
  if (item) elements.item.value = item.id;
  const nextVersion = version + 1;
  const state = stateForSelection(nextVersion);
  version = nextVersion;
  post('mount', {
    payload: {
      bundle: session.bundle,
      renderableKind: renderable.kind,
      renderableId: renderable.entry?.id || null,
      state,
      scenarios,
      imageScenario: elements['image-scenario'].value,
    },
  });
  if (log) appendLog('info', `挂载 ${renderable.entry?.id || '占位页'} / ${table.tableName}`, { revision: session.revision });
}

async function fetchSession({ reload = false, preserveSelection = true, preserveDraft = true } = {}) {
  const previousItem = preserveSelection ? elements.item.value : null;
  const previousTable = preserveSelection ? elements.table.value : null;
  const previousDraft = draft;
  if (preserveDraft) await flushSave();
  const nextSession = await requestJson(reload ? '/api/reload' : '/api/session', { method: reload ? 'POST' : 'GET' });
  session = nextSession;
  mockTables.clear();
  for (const record of session.mock?.tables || []) mockTables.set(record.sheetKey, clone(record));
  elements.disclaimer.textContent = session.disclaimer;
  fillSelect(elements.item, session.bundle.manifest.items.map(item => ({ ...item, id: item.id })), previousItem || session.selectedItemId, item => `${item.name || item.id} · ${item.target.tableName}`);
  fillSelect(elements.table, session.tables.map(table => ({ ...table, id: table.sheetKey })), previousTable || session.selectedSheetKey, table => `${table.tableName} · ${table.sheetKey}`);
  if (previousDraft?.sheetKey === elements.table.value && previousDraft.unsaved) draft = previousDraft;
  else loadDraft(elements.table.value);
  renderBuildStatus(session.build);
  mountSelection({ preserveDraft: true, log: false });
  appendLog('info', reload ? 'Bundle 已重新构建' : '预览会话已加载', { revision: session.revision, builtAt: session.builtAt });
  return session;
}

async function selectTable(sheetKey, { preserveDraft = false } = {}) {
  if (!session?.tables.some(table => table.sheetKey === sheetKey)) return;
  if (draft?.sheetKey !== sheetKey) await flushSave();
  elements.table.value = sheetKey;
  mountSelection({ preserveDraft });
}

function nextColumnName() {
  let index = draft.headers.length + 1;
  while (draft.headers.includes(`列${index}`)) index += 1;
  return `列${index}`;
}

function handleMockInput(event) {
  if (!draft) return;
  const headerIndex = event.target.dataset.mockHeader;
  if (headerIndex !== undefined) {
    draft.headers[Number(headerIndex)] = event.target.value;
    onDraftChanged();
    return;
  }
  const rowIndex = event.target.dataset.mockCellRow;
  const columnIndex = event.target.dataset.mockCellColumn;
  if (rowIndex === undefined || columnIndex === undefined) return;
  draft.rows[Number(rowIndex)][Number(columnIndex)] = event.target.value;
  onDraftChanged();
}

async function resetCurrentMock() {
  if (!draft) return;
  await flushSave();
  const target = draft;
  const result = await requestJson(`/api/mock/tables/${encodeURIComponent(target.sheetKey)}/reset`, { method: 'POST' });
  mockTables.set(result.table.sheetKey, clone(result.table));
  if (session && result.session?.mock) session.mock = clone(result.session.mock);
  if (draft === target) draft = createDraft(result.table);
  renderMockEditor();
  pushDraftState();
  appendLog('info', `Mock 已重置：${result.table.tableName}`, { revision: result.table.revision });
}

function connectEvents() {
  if (!globalThis.EventSource || eventSource) return;
  eventSource = new EventSource('/api/events');
  eventSource.addEventListener('build-started', event => {
    const payload = JSON.parse(event.data);
    renderBuildStatus(payload.build);
    appendLog('info', '检测到项目源码变化，开始重构建。', { revision: payload.revision });
  });
  eventSource.addEventListener('session-updated', event => {
    const payload = JSON.parse(event.data);
    queueSessionRefresh(payload.revision);
  });
  eventSource.addEventListener('build-error', event => {
    const payload = JSON.parse(event.data);
    renderBuildStatus(payload.build);
    appendLog('error', '源码构建失败，已保留上一成功 iframe。', { message: payload.message, code: payload.code });
  });
  eventSource.addEventListener('watch-error', event => {
    const payload = JSON.parse(event.data);
    appendLog('warn', '源码监听器报告错误', { message: payload.message, code: payload.code });
  });
  eventSource.onerror = () => {
    appendLog('warn', '实时源码通知暂时断开，浏览器会自动重连。');
  };
}

addEventListener('message', event => {
  if (event.source !== elements.frame.contentWindow || event.data?.source !== 'yuzi-beautify-frame') return;
  const message = event.data;
  if (message.type === 'ready') {
    if (frameReady && message.bridgeId && message.bridgeId === frameBridgeId) return;
    frameBridgeId = message.bridgeId || null;
    frameReady = true;
    mountSelection();
  }
  if (message.type === 'log') appendLog(message.entry?.level || 'info', message.entry?.message || 'Runtime log', message.entry?.details);
  if (message.type === 'action-result') {
    appendLog(message.result?.ok ? 'info' : 'warn', `${message.action} → ${message.result?.status}`, message.result);
    if (message.result?.status === 'navigated' && message.action === 'previousTable') void selectTable(session.tables[session.tables.findIndex(table => table.sheetKey === elements.table.value) - 1]?.sheetKey);
    if (message.result?.status === 'navigated' && message.action === 'nextTable') void selectTable(session.tables[session.tables.findIndex(table => table.sheetKey === elements.table.value) + 1]?.sheetKey);
  }
});

elements.item.addEventListener('change', () => {
  const item = session?.bundle.manifest.items.find(value => value.id === elements.item.value);
  const table = session?.tables.find(value => sameTableName(value.tableName, item?.target.tableName));
  if (table) void selectTable(table.sheetKey);
  else mountSelection();
});
elements.table.addEventListener('change', () => { void selectTable(elements.table.value); });
elements.width.addEventListener('change', () => { elements.device.style.setProperty('--device-width', `${elements.width.value}px`); });
elements['image-scenario'].addEventListener('change', () => post('image-scenario', { scenario: elements['image-scenario'].value }));
elements.scenario.addEventListener('change', () => {
  for (const action of actions) {
    scenarios[action] = elements.scenario.value;
    post('scenario', { action, scenario: scenarios[action] });
  }
  appendLog('info', `Action 场景 → ${elements.scenario.selectedOptions[0].textContent}`);
});
document.querySelector('.device-toolbar').addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (button) post('action', { action: button.dataset.action });
});
elements['mock-head'].addEventListener('input', handleMockInput);
elements['mock-body'].addEventListener('input', handleMockInput);
elements['mock-head'].addEventListener('click', event => {
  const button = event.target.closest('[data-remove-column]');
  if (!button || !draft) return;
  const index = Number(button.dataset.removeColumn);
  if (!Number.isInteger(index) || index < 0 || index >= draft.headers.length) return;
  draft.headers.splice(index, 1);
  for (const row of draft.rows) row.splice(index, 1);
  onDraftChanged();
  renderMockEditor();
});
elements['mock-body'].addEventListener('click', event => {
  const button = event.target.closest('[data-remove-row]');
  if (!button || !draft) return;
  const index = Number(button.dataset.removeRow);
  if (!Number.isInteger(index) || index < 0 || index >= draft.rows.length) return;
  draft.rows.splice(index, 1);
  onDraftChanged();
  renderMockEditor();
});
elements['add-column'].addEventListener('click', () => {
  if (!draft) return;
  draft.headers.push(nextColumnName());
  for (const row of draft.rows) row.push('');
  onDraftChanged();
  renderMockEditor();
});
elements['add-row'].addEventListener('click', () => {
  if (!draft) return;
  draft.rows.push(Array.from({ length: draft.headers.length }, () => ''));
  onDraftChanged();
  renderMockEditor();
});
elements.apply.addEventListener('click', () => {
  if (draft?.saveError) {
    draft.saveError = '';
    renderMockStatus();
  }
  void flushSave();
});
elements.reset.addEventListener('click', () => { void resetCurrentMock().catch(error => appendLog('error', '重置 Mock 失败', { message: error.message })); });
elements.reload.addEventListener('click', () => {
  void fetchSession({ reload: true, preserveSelection: true, preserveDraft: true })
    .catch(error => {
      if (error.payload?.session?.build) renderBuildStatus(error.payload.session.build);
      appendLog('error', 'Bundle 重构建失败，已保留上一成功版本。', { message: error.message, status: error.status });
    });
});
elements.cleanup.addEventListener('click', () => post('cleanup'));
elements['clear-log'].addEventListener('click', () => { elements.log.textContent = ''; });
elements.frame.addEventListener('load', () => post('ping'));
addEventListener('pagehide', () => {
  eventSource?.close();
  eventSource = null;
}, { once: true });

post('ping');
connectEvents();
void fetchSession().catch(error => appendLog('error', error.message));
