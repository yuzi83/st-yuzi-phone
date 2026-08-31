const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const FILES = {
    tableViewerRender: 'modules/table-viewer/render.js',
    tableContext: 'modules/table-viewer/context.js',
    genericViewer: 'modules/table-viewer/generic-viewer.js',
    genericRuntime: 'modules/table-viewer/generic-runtime.js',
    listPageRenderer: 'modules/table-viewer/list-page-renderer.js',
    listPageTemplate: 'modules/table-viewer/list-page-template.js',
    detailPageTemplate: 'modules/table-viewer/detail-page-template.js',
    listPageController: 'modules/table-viewer/list-page-controller.js',
    viewerRuntime: 'modules/table-viewer/runtime.js',
    navigationUi: 'modules/phone-core/navigation-ui.js',
    genericCss: 'styles/05-phone-generic-template.css',
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
        Object.entries(FILES).map(([key, relativePath]) => [key, read(relativePath)]),
    );
    const results = [];

    check(results, 'viewerRuntime', 'exports createViewerRuntime()', has(contents.viewerRuntime, 'export function createViewerRuntime('));
    check(results, 'viewerRuntime', 'binds external table updates', has(contents.viewerRuntime, 'const bindExternalTableUpdate = (handler) => {'));
    check(results, 'viewerRuntime', 'binds draft previews', has(contents.viewerRuntime, 'const bindDraftPreview = () => {'));
    check(results, 'viewerRuntime', 'starts viewer sessions', has(contents.viewerRuntime, 'const startViewerSession = (options = {}) => {'));
    check(results, 'viewerRuntime', 'acquires the viewing-sheet lease', has(contents.viewerRuntime, 'resolvedRuntimeDeps.acquireCurrentViewingSheet(sheetKey);'));
    check(results, 'viewerRuntime', 'releases only its own viewing-sheet lease', has(contents.viewerRuntime, 'resolvedRuntimeDeps.releaseCurrentViewingSheet(viewingSheetOwner);'));
    check(results, 'viewerRuntime', 'resets the data version at session start', has(contents.viewerRuntime, 'resolvedRuntimeDeps.resetDataVersion();'));
    check(results, 'viewerRuntime', 'owns a cleanup observer', has(contents.viewerRuntime, 'let cleanupObserver = null;'));
    check(results, 'viewerRuntime', 'observes container disconnection through the runtime scope', has(contents.viewerRuntime, 'cleanupObserver = viewerRuntimeScope.observeDisconnection(container, () => {')
        && has(contents.viewerRuntime, 'observerRoot,')
        && has(contents.viewerRuntime, 'childList: true,')
        && has(contents.viewerRuntime, 'subtree: true,'));
    check(results, 'viewerRuntime', 'does not use a handwritten removed-node loop', !has(contents.viewerRuntime, 'for (const mutation of mutations) {'));

    check(results, 'tableContext', 'exports resolveTableViewerContext()', has(contents.tableContext, 'export function resolveTableViewerContext('));
    check(results, 'tableContext', 'exports renderTableViewerLoadError()', has(contents.tableContext, 'export function renderTableViewerLoadError('));
    check(results, 'tableContext', 'load error uses the shared icon-only navigation header', has(contents.tableContext, "from '../phone-core/navigation-ui.js'")
        && has(contents.tableContext, 'buildPhoneNavBar({')
        && has(contents.tableContext, 'buildPhoneBackButton()')
        && has(contents.tableContext, 'buildPhoneNavTitleSwitcher({')
        && !has(contents.tableContext, '<span>返回</span>'));

    check(results, 'tableViewerRender', 'imports table context', has(contents.tableViewerRender, './context.js'));
    check(results, 'tableViewerRender', 'imports createViewerRuntime()', has(contents.tableViewerRender, "import { createViewerRuntime } from './runtime.js';"));
    check(results, 'tableViewerRender', 'imports the generic viewer', has(contents.tableViewerRender, "import { renderGenericTableViewer } from './generic-viewer.js';"));
    check(results, 'tableViewerRender', 'creates a viewer runtime', has(contents.tableViewerRender, 'const viewerRuntime = createViewerRuntime({'));
    check(results, 'tableViewerRender', 'disposes an invalid viewer runtime', has(contents.tableViewerRender, 'viewerRuntime.dispose();'));
    check(results, 'tableViewerRender', 'starts the viewer session before rendering', has(contents.tableViewerRender, 'viewerRuntime.startViewerSession();'));
    check(results, 'tableViewerRender', 'passes the runtime to the generic viewer', has(contents.tableViewerRender, 'renderGenericTableViewer(container, {')
        && has(contents.tableViewerRender, 'viewerRuntime,'));
    check(results, 'tableViewerRender', 'passes physical navigation anchors into the generic viewer', has(contents.tableViewerRender, "const navigationSheetKey = String(options?.navigationSheetKey || sheetKey || '').trim();")
        && has(contents.tableViewerRender, 'navigationSheetKey,')
        && has(contents.tableViewerRender, 'forceListMode: forceGenericList,'));

    check(results, 'genericViewer', 'imports the generic runtime factory', has(contents.genericViewer, "import { createGenericTableViewerRuntime } from './generic-runtime.js';"));
    check(results, 'genericViewer', 'accepts the viewer runtime', has(contents.genericViewer, 'const viewerRuntime = hooks.viewerRuntime;'));
    check(results, 'genericViewer', 'delegates startup to runtime.start()', has(contents.genericViewer, 'runtime.start();'));

    check(results, 'genericRuntime', 'exports createGenericTableViewerRuntime()', has(contents.genericRuntime, 'export function createGenericTableViewerRuntime('));
    check(results, 'genericRuntime', 'creates table viewer state', has(contents.genericRuntime, 'const state = createTableViewerState(sheetKey);'));
    check(results, 'genericRuntime', 'builds the scroll preserver with the viewer runtime', has(contents.genericRuntime, 'const scrollPreserver = createTableViewerScrollPreserver(container, state, undefined, viewerRuntime);'));
    check(results, 'genericRuntime', 'provides start()', has(contents.genericRuntime, 'const start = () => {'));
    check(results, 'genericRuntime', 'binds before rendering at startup', has(contents.genericRuntime, 'bind();') && has(contents.genericRuntime, 'render();'));
    check(results, 'genericRuntime', 'uses the viewer runtime for update suppression', has(contents.genericRuntime, 'viewerRuntime?.setSuppressExternalTableUpdate(next);'));
    check(results, 'genericRuntime', 'binds external table updates through the viewer runtime', has(contents.genericRuntime, 'viewerRuntime.bindExternalTableUpdate(handleTableUpdate);'));
    check(results, 'genericRuntime', 'passes navigation only to the list page', has(contents.genericRuntime, 'navigationSheetKey = sheetKey,')
        && has(contents.genericRuntime, 'renderListPage({')
        && has(contents.genericRuntime, 'navigationSheetKey,')
        && !has(contents.genericRuntime, 'renderDetailPage({\n                navigationSheetKey,'));

    check(results, 'listPageRenderer', 'reuses route navigation context for generic navigation controls', has(contents.listPageRenderer, 'buildTableNavigationControlState(')
        && has(contents.listPageRenderer, 'navigationContext,')
        && !has(contents.listPageRenderer, 'rawData: getTableData(),'));
    check(results, 'listPageRenderer', 'refreshes the navigation region for management state changes', has(contents.listPageRenderer, "changedKeySet.has('deleteManageMode')")
        && has(contents.listPageRenderer, "changedKeySet.has('lockManageMode')")
        && has(contents.listPageRenderer, "changedKeySet.has('deletingRowIndex')")
        && has(contents.listPageRenderer, '|| deleteSelectionChanged'));

    const genericTitleNavigationSource = contents.listPageTemplate.slice(
        contents.listPageTemplate.indexOf('function buildGenericTitleNavigationHtml'),
        contents.listPageTemplate.indexOf('export function buildGenericListNavHtml'),
    );
    check(results, 'listPageTemplate', 'generic list navigation uses the shared header module', has(contents.listPageTemplate, "from '../phone-core/navigation-ui.js'")
        && has(contents.listPageTemplate, 'buildPhoneNavBar({')
        && has(contents.listPageTemplate, "buildPhoneBackButton({ action: 'nav-back' })")
        && has(contents.listPageTemplate, 'is-generic-delete-mode has-secondary-actions')
        && has(contents.listPageTemplate, 'phone-nav-secondary-actions phone-generic-nav-delete-actions')
        && !has(contents.listPageTemplate, '<span>返回</span>'));
    check(results, 'listPageTemplate', 'renders table switching through the shared title group', has(genericTitleNavigationSource, 'buildPhoneNavTitleSwitcher({')
        && has(genericTitleNavigationSource, 'phone-generic-table-navigation')
        && has(genericTitleNavigationSource, "buildPhoneSwitchButton('previous'")
        && has(genericTitleNavigationSource, "action: 'switch-table-previous'")
        && has(genericTitleNavigationSource, "buildPhoneSwitchButton('next'")
        && has(genericTitleNavigationSource, "action: 'switch-table-next'"));
    check(results, 'detailPageTemplate', 'generic detail uses shared back, title, and pager controls', has(contents.detailPageTemplate, "from '../phone-core/navigation-ui.js'")
        && has(contents.detailPageTemplate, "buildPhoneBackButton({ action: 'detail-back' })")
        && has(contents.detailPageTemplate, 'buildPhoneNavTitleSwitcher({ title })')
        && has(contents.detailPageTemplate, "buildPhoneSwitchButton('previous'")
        && has(contents.detailPageTemplate, "'data-pager': 'prev'")
        && has(contents.detailPageTemplate, "buildPhoneSwitchButton('next'")
        && has(contents.detailPageTemplate, "'data-pager': 'next'")
        && !has(contents.detailPageTemplate, '<span>返回</span>'));
    check(results, 'navigationUi', 'shared title switcher owns previous-title-next render order', contents.navigationUi.indexOf('${isTitleOnly ? \'\' : previousSlot}') < contents.navigationUi.indexOf('<span class="phone-nav-title">')
        && contents.navigationUi.indexOf('<span class="phone-nav-title">') < contents.navigationUi.indexOf('${isTitleOnly ? \'\' : nextSlot}'));
    check(results, 'listPageController', 'delegates generic table switching with management and lifecycle guards', has(contents.listPageController, 'requestTableNavigationSwitch(')
        && has(contents.listPageController, 'context.navigationSheetKey || context.sheetKey')
        && has(contents.listPageController, 'context.state.deletingRowIndex >= 0')
        && has(contents.listPageController, 'isActive: () => isGenericListContextActive(context)'));

    check(results, 'genericCss', 'generic page keeps only scoped navigation theme states', has(contents.genericCss, '.phone-generic-table-navigation-btn:disabled')
        && has(contents.genericCss, '.phone-generic-root.phone-generic-template-scope .phone-nav-title')
        && has(contents.genericCss, '.phone-generic-root.phone-generic-template-scope .phone-nav-back'));
    check(results, 'genericCss', 'generic title layout no longer overrides the shared responsive geometry', !['max-content', 'fit-content', 'overflow: visible', 'text-overflow: clip', '--phone-generic-nav-side-reserve'].some((snippet) => has(contents.genericCss, snippet))
        && !has(contents.genericCss, '.phone-generic-title-navigation {')
        && !has(contents.genericCss, '.phone-generic-nav-placeholder'));
    check(results, 'genericCss', 'generic header leaves secondary action geometry to the shared layer', !has(contents.genericCss, '.phone-generic-slot-nav.is-generic-delete-mode .phone-nav-trailing')
        && !has(contents.genericCss, 'grid-template-rows: var(--yuzi-phone-nav-content-height) auto')
        && !has(contents.genericCss, '@media screen and (max-width: 320px)'));

    const failed = results.filter((item) => !item.ok);
    if (failed.length > 0) {
        console.error('[viewer-runtime-contract-check] failed:');
        failed.forEach((item) => console.error(`- ${item.file}: ${item.description}`));
        process.exitCode = 1;
        return;
    }

    console.log('[viewer-runtime-contract-check] passed');
    results.forEach((item) => console.log(`- OK | ${item.file} | ${item.description}`));
}

main();
