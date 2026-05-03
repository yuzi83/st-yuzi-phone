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

    check(results, 'runtime', 'generic runtime 继续通过 createTableViewerState() 创建状态容器', has(contents.runtime, 'const state = createTableViewerState(sheetKey);'));
    check(results, 'listController', '列表页搜索继续通过 state.set() 写入 listSearchQuery', has(contents.listController, "nextContext.state.set('listSearchQuery', nextValue);"));
    check(results, 'listController', '列表页删除继续通过 state.set() 写入 deletingRowIndex', has(contents.listController, "context.state.set('deletingRowIndex', idx);"));
    check(results, 'listController', '列表页删除完成继续通过 batchUpdate() 清理状态', has(contents.listController, 'nextContext.state.batchUpdate({'));
    check(results, 'detailController', '详情编辑继续使用显式状态动作 API', has(contents.detailController, 'state.setEditMode(!state.editMode);'));
    check(results, 'rowDeleteController', '删除控制器继续通过 reconcileAfterRowDelete() 修正详情索引', has(contents.rowDeleteController, 'state.reconcileAfterRowDelete(rowIndex, rows.length);'));

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
