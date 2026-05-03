const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    tableViewerRender: 'modules/table-viewer/render.js',
    tableContext: 'modules/table-viewer/context.js',
    genericViewer: 'modules/table-viewer/generic-viewer.js',
    genericRuntime: 'modules/table-viewer/generic-runtime.js',
    specialRuntime: 'modules/table-viewer/special/runtime.js',
    viewerRuntime: 'modules/table-viewer/runtime.js',
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

    check(results, 'viewerRuntime', 'viewer-runtime 暴露 createViewerRuntime()', has(contents.viewerRuntime, 'export function createViewerRuntime('));
    check(results, 'viewerRuntime', 'viewer-runtime 暴露 bindExternalTableUpdate()', has(contents.viewerRuntime, 'const bindExternalTableUpdate = (handler) => {'));
    check(results, 'viewerRuntime', 'viewer-runtime 暴露 bindDraftPreview()', has(contents.viewerRuntime, 'const bindDraftPreview = () => {'));
    check(results, 'viewerRuntime', 'viewer-runtime 暴露 startViewerSession()', has(contents.viewerRuntime, 'const startViewerSession = (options = {}) => {'));
    check(results, 'viewerRuntime', 'viewer-runtime startViewerSession() 继续设置 currentViewingSheet', has(contents.viewerRuntime, 'resolvedRuntimeDeps.setCurrentViewingSheet(sheetKey);'));
    check(results, 'viewerRuntime', 'viewer-runtime startViewerSession() 继续重置数据版本', has(contents.viewerRuntime, 'resolvedRuntimeDeps.resetDataVersion();'));
    check(results, 'viewerRuntime', 'viewer-runtime 继续托管 cleanupObserver', has(contents.viewerRuntime, 'let cleanupObserver = null;'));
    check(results, 'viewerRuntime', 'viewer-runtime observeContainerRemoval() 通过 runtime scope 的 observeDisconnection() 收口', has(contents.viewerRuntime, 'cleanupObserver = viewerRuntimeScope.observeDisconnection(container, () => {')
        && has(contents.viewerRuntime, 'observerRoot,')
        && has(contents.viewerRuntime, 'childList: true,')
        && has(contents.viewerRuntime, 'subtree: true,'));

    check(results, 'tableContext', 'table-context 暴露 resolveTableViewerContext()', has(contents.tableContext, 'export function resolveTableViewerContext('));
    check(results, 'tableContext', 'table-context 暴露 renderTableViewerLoadError()', has(contents.tableContext, 'export function renderTableViewerLoadError('));

    check(results, 'tableViewerRender', 'table-viewer render 导入 table context', has(contents.tableViewerRender, './context.js'));
    check(results, 'tableViewerRender', 'table-viewer render 导入 createViewerRuntime()', has(contents.tableViewerRender, "import { createViewerRuntime } from './runtime.js';"));
    check(results, 'tableViewerRender', 'table-viewer render 导入 createSpecialTableViewerRuntime()', has(contents.tableViewerRender, 'createSpecialTableViewerRuntime'));
    check(results, 'tableViewerRender', 'table-viewer render 创建 viewerRuntime', has(contents.tableViewerRender, 'const viewerRuntime = createViewerRuntime({'));
    check(results, 'tableViewerRender', 'table-viewer render 在无效表格时清理 viewerRuntime', has(contents.tableViewerRender, 'viewerRuntime.dispose();'));
    check(results, 'tableViewerRender', 'table-viewer render 通过 viewerRuntime.startViewerSession() 启动会话', has(contents.tableViewerRender, 'viewerRuntime.startViewerSession();'));
    check(results, 'tableViewerRender', 'table-viewer render special 路径改为通过 specialRuntime.start() 启动', has(contents.tableViewerRender, 'specialRuntime?.start();'));
    check(results, 'tableViewerRender', 'table-viewer render 继续向 special runtime 注入 viewerRuntime', has(contents.tableViewerRender, 'viewerRuntime,'));
    check(results, 'tableViewerRender', 'table-viewer render 继续向 generic viewer 注入 viewerRuntime', has(contents.tableViewerRender, 'viewerRuntime,'));

    check(results, 'genericViewer', 'generic-viewer 导入 createGenericTableViewerRuntime()', has(contents.genericViewer, "import { createGenericTableViewerRuntime } from './generic-runtime.js';"));
    check(results, 'genericViewer', 'generic-viewer 接收 viewerRuntime', has(contents.genericViewer, 'const viewerRuntime = hooks.viewerRuntime;'));
    check(results, 'genericViewer', 'generic-viewer 改为委托 runtime.start()', has(contents.genericViewer, 'runtime.start();'));

    check(results, 'genericRuntime', 'generic-runtime 暴露 createGenericTableViewerRuntime()', has(contents.genericRuntime, 'export function createGenericTableViewerRuntime('));
    check(results, 'genericRuntime', 'generic-runtime 继续创建 table viewer state', has(contents.genericRuntime, 'const state = createTableViewerState(sheetKey);'));
    check(results, 'genericRuntime', 'generic-runtime 继续创建 scroll preserver 并注入 viewerRuntime', has(contents.genericRuntime, 'const scrollPreserver = createTableViewerScrollPreserver(container, state, undefined, viewerRuntime);'));
    check(results, 'genericRuntime', 'generic-runtime 暴露 start()', has(contents.genericRuntime, 'const start = () => {'));
    check(results, 'genericRuntime', 'generic-runtime start() 继续委托 bind()', has(contents.genericRuntime, 'bind();'));
    check(results, 'genericRuntime', 'generic-runtime start() 继续委托 render()', has(contents.genericRuntime, 'render();'));
    check(results, 'genericRuntime', 'generic-runtime 继续通过 viewerRuntime 处理 suppressExternalTableUpdate', has(contents.genericRuntime, 'viewerRuntime?.setSuppressExternalTableUpdate(next);'));
    check(results, 'genericRuntime', 'generic-runtime 继续通过 viewerRuntime 绑定外部表更新', has(contents.genericRuntime, 'viewerRuntime.bindExternalTableUpdate(handleTableUpdate);'));

    check(results, 'specialRuntime', 'special-runtime 暴露 createSpecialTableViewerRuntime()', has(contents.specialRuntime, 'export function createSpecialTableViewerRuntime('));
    check(results, 'specialRuntime', 'special-runtime 暴露 renderSpecialTableViewer()', has(contents.specialRuntime, 'export function renderSpecialTableViewer('));
    check(results, 'specialRuntime', 'special-runtime 从 viewerRuntime 解析 viewerEventManager', has(contents.specialRuntime, 'const viewerEventManager = deps.viewerEventManager || viewerRuntime?.viewerEventManager;'));
    check(results, 'specialRuntime', 'special-runtime 暴露 start()', has(contents.specialRuntime, 'const start = () => {'));
    check(results, 'specialRuntime', 'special-runtime renderSpecialTableViewer() 委托 runtime.start()', has(contents.specialRuntime, 'return runtime.start();'));

    check(results, 'viewerRuntime', 'viewer-runtime 移除手写 removedNodes observer 遍历', !has(contents.viewerRuntime, 'for (const mutation of mutations) {'));

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[viewer-runtime-contract-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[viewer-runtime-contract-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
