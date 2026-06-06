const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    state: 'modules/table-viewer/state.js',
    runtime: 'modules/table-viewer/generic-runtime.js',
    listController: 'modules/table-viewer/list-page-controller.js',
    detailController: 'modules/table-viewer/detail-edit-controller.js',
    rowDeleteController: 'modules/table-viewer/row-delete-controller.js',
    specialRuntime: 'modules/table-viewer/special/runtime.js',
    specialMessageViewer: 'modules/table-viewer/special/message-viewer.js',
};

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function has(content, snippet) {
    return content.includes(snippet);
}

function check(results, fileKey, description, ok) {
    results.push({ file: FILES[fileKey], description, ok });
}

function main() {
    const contents = Object.fromEntries(
        Object.entries(FILES).map(([key, relativePath]) => [key, read(relativePath)])
    );

    const results = [];

    check(results, 'state', 'state constructor 记录初始状态快照', has(contents.state, 'this._initialState = { ...initialState };'));
    check(results, 'state', 'state constructor 建立允许键集合', has(contents.state, 'this._allowedKeys = new Set(Object.keys(this._state));'));
    check(results, 'state', 'state.set() 会忽略未知状态键', has(contents.state, "Logger.warn('[TableViewerState] set: 忽略未知状态键', invalidKeys);"));
    check(results, 'state', 'state.set() 仅通知合法且实际变化的键', has(contents.state, 'const changedUpdates = Object.fromEntries('));
    check(results, 'state', 'state.reset() 默认回退到初始状态快照', has(contents.state, 'reset(initialState = this._initialState) {'));
    check(results, 'state', 'state.reset() 会忽略未知状态键', has(contents.state, "Logger.warn('[TableViewerState] reset: 忽略未知状态键', invalidKeys);"));
    check(results, 'state', 'state 继续暴露 Proxy 兼容顶层属性访问', has(contents.state, 'return new Proxy(stateManager, {'));
    check(results, 'state', 'state 初始字段包含批量删除选择集合', has(contents.state, 'selectedDeleteRowIndexes: [],'));
    check(results, 'state', 'state 初始字段包含批量删除中状态', has(contents.state, 'deletingSelection: false,'));
    check(results, 'state', 'state 暴露 setSelectedDeleteRowIndexes() 显式动作', has(contents.state, 'setSelectedDeleteRowIndexes(rowIndexes = []) {'));
    check(results, 'state', 'state 暴露 clearDeleteSelection() 显式动作', has(contents.state, 'clearDeleteSelection() {'));
    check(results, 'state', 'state 暴露 setDeletingSelection() 显式动作', has(contents.state, 'setDeletingSelection(enabled) {'));
    check(results, 'state', '进入详情模式会清理批量删除选择', has(contents.state, 'selectedDeleteRowIndexes: getClearedRowIndexList(this._state.selectedDeleteRowIndexes),'));
    check(results, 'state', '进入详情模式会清理批量删除中状态', has(contents.state, 'deletingSelection: false,'));

    check(results, 'runtime', 'generic runtime 继续通过 createTableViewerState() 创建状态容器', has(contents.runtime, 'const state = createTableViewerState(sheetKey);'));
    check(results, 'runtime', 'generic runtime 将批量删除选择纳入局部刷新键', has(contents.runtime, "'selectedDeleteRowIndexes',"));
    check(results, 'runtime', 'generic runtime 将批量删除中状态纳入局部刷新键', has(contents.runtime, "'deletingSelection',"));
    check(results, 'runtime', 'generic runtime 向列表页传入 deleteRowsFromList()', has(contents.runtime, 'const { deleteRowsFromList } = createRowDeleteController({') && has(contents.runtime, 'deleteRowsFromList,'));

    check(results, 'listController', '列表页搜索继续通过 state.set() 写入 listSearchQuery', has(contents.listController, 'listSearchQuery: nextValue'));
    check(results, 'listController', '列表页搜索在删除态约束批量删除选择集合', has(contents.listController, 'selectedDeleteRowIndexes: nextSelection'));
    check(results, 'listController', '列表页批量删除开始通过显式动作写入 deletingSelection', has(contents.listController, 'context.state.setDeletingSelection(true);'));
    check(results, 'listController', '列表页选择切换通过显式动作写入 selectedDeleteRowIndexes', has(contents.listController, 'context.state.setSelectedDeleteRowIndexes(Array.from(selectedRows));'));
    check(results, 'listController', '列表页全选通过显式动作写入 selectedDeleteRowIndexes', has(contents.listController, 'context.state.setSelectedDeleteRowIndexes(allSelected ? [] : visibleRows);'));
    check(results, 'listController', '列表页删除完成继续通过 batchUpdate() 清理批量删除状态', has(contents.listController, 'nextContext.state.batchUpdate({') && has(contents.listController, 'deletingSelection: false,'));
    check(results, 'listController', '列表页删除完成后同步锁状态', has(contents.listController, 'lockState: nextContext.getTableLockState(nextContext.sheetKey),'));

    check(results, 'detailController', '详情编辑继续使用显式状态动作 API', has(contents.detailController, 'state.setEditMode(!state.editMode);'));
    check(results, 'rowDeleteController', '删除控制器通过批量锁状态重排修正锁索引', has(contents.rowDeleteController, 'remapTableLockStateAfterRowsDelete(sheetKey, deletedRowIndexes);'));
    check(results, 'rowDeleteController', '删除控制器成功后维护批量删除选择状态', has(contents.rowDeleteController, 'state.setSelectedDeleteRowIndexes(notDeletedViewRowIndexes);') && has(contents.rowDeleteController, 'state.clearDeleteSelection();'));

    check(results, 'specialRuntime', 'special runtime 未引入 createTableViewerState() 依赖', !has(contents.specialRuntime, 'createTableViewerState('));
    check(results, 'specialMessageViewer', 'message special viewer 仍使用独立 plain object 状态', has(contents.specialMessageViewer, 'const state = {'));

    const failed = results.filter((item) => !item.ok);
    if (failed.length > 0) {
        console.error('[table-viewer-state-contract-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[table-viewer-state-contract-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
