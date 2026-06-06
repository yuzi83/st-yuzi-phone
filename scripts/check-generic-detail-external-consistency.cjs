const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function assertIncludes(source, snippet, message) {
    assert(source.includes(snippet), message);
}

function assertOrdered(source, snippets, label) {
    let cursor = -1;
    snippets.forEach((snippet) => {
        const next = source.indexOf(snippet, cursor + 1);
        assert(next !== -1, `${label} 缺少片段：${snippet}`);
        assert(next > cursor, `${label} 片段顺序错误：${snippet}`);
        cursor = next;
    });
}

const state = read('modules/table-viewer/state.js');
const runtime = read('modules/table-viewer/runtime.js');
const genericRuntime = read('modules/table-viewer/generic-runtime.js');
const detailPage = read('modules/table-viewer/detail-page-renderer.js');
const detailEdit = read('modules/table-viewer/detail-edit-controller.js');

assertIncludes(state, 'pendingExternalTableUpdate: null,', 'state 必须初始化 pendingExternalTableUpdate');
assertIncludes(state, 'setPendingExternalTableUpdate(update = {})', 'state 必须暴露 pending external update setter');
assertIncludes(state, 'clearPendingExternalTableUpdate()', 'state 必须暴露 pending external update clearer');
assertIncludes(state, 'pendingExternalTableUpdate: nextEnabled ? this._state.pendingExternalTableUpdate : null,', '退出 editMode 必须清理 pending external update');
assertIncludes(state, 'pendingExternalTableUpdate: nextEnabled ? null : this._state.pendingExternalTableUpdate,', '进入 cell lock 管理时必须清理 pending external update');

assertIncludes(runtime, 'let suppressExternalTableUpdateDepth = 0;', 'viewer runtime suppress 必须使用计数状态');
assertIncludes(runtime, 'suppressExternalTableUpdateDepth += 1;', 'viewer runtime suppress true 必须递增');
assertIncludes(runtime, 'suppressExternalTableUpdateDepth = Math.max(0, suppressExternalTableUpdateDepth - 1);', 'viewer runtime suppress false 必须防止下溢');

assertOrdered(genericRuntime, [
    'const hasDirtyDetailDraft = () => {',
    'const handleTableUpdate = (event) => {',
    'if (hasDirtyDetailDraft()) {',
    'state.setPendingExternalTableUpdate({',
    "showInlineToast(container, '表格已有外部更新，当前草稿保存或退出编辑后再刷新', true);",
    'return;',
    'if (!syncRowsFromSheet()) return;',
], 'generic-runtime dirty detail external update');
assertIncludes(genericRuntime, 'pendingExternalTableUpdate: null,', '普通 external update 同步后必须清理 pending 标记');
assertIncludes(genericRuntime, 'syncRowsFromSheet,', 'generic-runtime 必须向 detail page 传递 syncRowsFromSheet');

assertIncludes(detailPage, 'showInlineToast(container, \'当前详情行已不存在，已返回列表\', true);', 'detail page 行缺失时必须提示用户');
assertIncludes(detailPage, 'syncRowsFromSheet,', 'detail page 必须向 detail edit controller 透传 syncRowsFromSheet');

assertOrdered(detailEdit, [
    'function consumePendingExternalTableUpdateAfterLeavingEdit() {',
    'const synced = typeof syncRowsFromSheet === \'function\' && syncRowsFromSheet();',
    'if (!synced) {',
    'state.returnToListMode();',
    "showInlineToast(container, '外部表更新同步失败，已返回列表', true);",
    'state.syncLockState(getTableLockState(sheetKey));',
    'state.clearPendingExternalTableUpdate?.();',
    "showInlineToast(container, '外部表更新后当前行已不存在，已返回列表', true);",
    "showInlineToast(container, '已同步外部表更新');",
], 'detail edit pending external update consume');
assertOrdered(detailEdit, [
    'function handleToggleEditMode() {',
    'const shouldConsumePendingExternalUpdate = state.editMode && hasPendingExternalTableUpdate();',
    'state.setEditMode(!state.editMode);',
    'if (shouldConsumePendingExternalUpdate) {',
    'consumePendingExternalTableUpdateAfterLeavingEdit();',
], 'detail edit toggle consumes pending before stale render');
assertIncludes(detailEdit, 'function handleToggleCellLockManageMode() {', '进入字段锁管理的 edit 退出路径必须显式处理 pending external update');
assertIncludes(detailEdit, 'const shouldConsumePendingExternalUpdate = !state.cellLockManageMode && state.editMode && hasPendingExternalTableUpdate();', '字段锁管理入口必须消费 edit dirty pending external update');

assertIncludes(detailEdit, 'const refreshedFromSheet = typeof syncRowsFromSheet === \'function\' && syncRowsFromSheet();', 'detail 保存成功后必须从 sheet 对账');
assertIncludes(detailEdit, 'state.clearPendingExternalTableUpdate?.();', 'detail 保存对账后必须清理 pending external update');
assertIncludes(detailEdit, 'state.returnToListMode();', 'detail 保存后行缺失时必须返回列表');
assert(!detailEdit.includes('rows[saveRowIndex][rawColIndex] = draft;'), 'detail 保存成功后禁止直接 patch 本地 rows');
assertOrdered(detailEdit, [
    'runtime.setSuppressExternalTableUpdate(true);',
    'const result = await updateTableRow(liveTableName, dataRowIndex, updateData);',
    '} finally {',
    'runtime.setSuppressExternalTableUpdate(false);',
], 'detail save suppress lifecycle');

console.log('check-generic-detail-external-consistency: ok');
