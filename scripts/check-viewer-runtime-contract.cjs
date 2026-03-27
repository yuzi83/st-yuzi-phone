const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    phoneTableViewer: 'modules/phone-table-viewer.js',
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
    check(results, 'viewerRuntime', 'viewer-runtime startViewerSession() 继续设置 currentViewingSheet', has(contents.viewerRuntime, 'setCurrentViewingSheet(sheetKey);'));
    check(results, 'viewerRuntime', 'viewer-runtime startViewerSession() 继续重置数据版本', has(contents.viewerRuntime, 'resetDataVersion();'));
    check(results, 'viewerRuntime', 'viewer-runtime 继续通过 runtimeDeps 创建 MutationObserver', has(contents.viewerRuntime, 'createMutationObserver: (callback) => new MutationObserver(callback),'));
    check(results, 'viewerRuntime', 'viewer-runtime 继续托管 cleanupObserver', has(contents.viewerRuntime, 'let cleanupObserver = null;'));

    check(results, 'tableContext', 'table-context 暴露 resolveTableViewerContext()', has(contents.tableContext, 'export function resolveTableViewerContext('));
    check(results, 'tableContext', 'table-context 暴露 renderTableViewerLoadError()', has(contents.tableContext, 'export function renderTableViewerLoadError('));

    check(results, 'phoneTableViewer', 'phone-table-viewer 导入 table context', has(contents.phoneTableViewer, "./table-viewer/context.js"));
    check(results, 'phoneTableViewer', 'phone-table-viewer 导入 createViewerRuntime()', has(contents.phoneTableViewer, "import { createViewerRuntime } from './table-viewer/runtime.js';"));
    check(results, 'phoneTableViewer', 'phone-table-viewer 导入 createSpecialTableViewerRuntime()', has(contents.phoneTableViewer, 'createSpecialTableViewerRuntime'));
    check(results, 'phoneTableViewer', 'phone-table-viewer 创建 viewerRuntime', has(contents.phoneTableViewer, 'const viewerRuntime = createViewerRuntime({'));
    check(results, 'phoneTableViewer', 'phone-table-viewer 在无效表格时清理 viewerRuntime', has(contents.phoneTableViewer, 'viewerRuntime.dispose();'));
    check(results, 'phoneTableViewer', 'phone-table-viewer 通过 viewerRuntime.startViewerSession() 启动会话', has(contents.phoneTableViewer, 'viewerRuntime.startViewerSession();'));
    check(results, 'phoneTableViewer', 'phone-table-viewer special 路径改为通过 specialRuntime.start() 启动', has(contents.phoneTableViewer, 'specialRuntime?.start();'));
    check(results, 'phoneTableViewer', 'phone-table-viewer 继续向 special runtime 注入 viewerRuntime', has(contents.phoneTableViewer, 'viewerRuntime,'));
    check(results, 'phoneTableViewer', 'phone-table-viewer 继续向 generic viewer 注入 viewerRuntime', has(contents.phoneTableViewer, 'viewerRuntime,'));

    check(results, 'genericViewer', 'generic-viewer 导入 createGenericTableViewerRuntime()', has(contents.genericViewer, "import { createGenericTableViewerRuntime } from './generic-runtime.js';"));
    check(results, 'genericViewer', 'generic-viewer 接收 viewerRuntime', has(contents.genericViewer, 'const viewerRuntime = hooks.viewerRuntime;'));
    check(results, 'genericViewer', 'generic-viewer 改为委托 runtime.start()', has(contents.genericViewer, 'runtime.start();'));

    check(results, 'genericRuntime', 'generic-runtime 暴露 createGenericTableViewerRuntime()', has(contents.genericRuntime, 'export function createGenericTableViewerRuntime('));
    check(results, 'genericRuntime', 'generic-runtime 继续创建 table viewer state', has(contents.genericRuntime, 'const state = createTableViewerState(sheetKey);'));
    check(results, 'genericRuntime', 'generic-runtime 继续创建 scroll preserver', has(contents.genericRuntime, 'const scrollPreserver = createTableViewerScrollPreserver(container, state);'));
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
