const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    facade: 'modules/settings-app/services/api-prompt-worldbook-runtime.js',
    renderers: 'modules/settings-app/services/api-prompt-worldbook-runtime/renderers.js',
    stateActions: 'modules/settings-app/services/api-prompt-worldbook-runtime/state-actions.js',
    subscription: 'modules/settings-app/services/api-prompt-worldbook-runtime/subscription.js',
    page: 'modules/settings-app/pages/api-prompt-config.js',
    pageShell: 'modules/settings-app/ui/page-shell.js',
    controller: 'modules/settings-app/services/api-prompt-config-controller.js',
    editorBuilders: 'modules/settings-app/layout/page-builders/editor-builders.js',
};

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function has(content, snippet) {
    return content.includes(snippet);
}

function lacks(content, snippet) {
    return !has(content, snippet);
}

function countOccurrences(content, snippet) {
    return content.split(snippet).length - 1;
}

function check(results, fileKey, description, ok) {
    results.push({ file: FILES[fileKey], description, ok });
}

function main() {
    const contents = Object.fromEntries(
        Object.entries(FILES).map(([key, relativePath]) => [key, read(relativePath)])
    );

    const results = [];

    check(results, 'facade', '继续暴露 createApiPromptWorldbookRuntime()', has(contents.facade, 'export function createApiPromptWorldbookRuntime('));
    check(results, 'facade', '继续组合 createWorldbookRenderers()', has(contents.facade, 'createWorldbookRenderers('));
    check(results, 'facade', '继续组合 createWorldbookStateActions()', has(contents.facade, 'createWorldbookStateActions('));
    check(results, 'facade', '继续组合 createWorldbookSubscription()', has(contents.facade, 'createWorldbookSubscription('));

    check(results, 'renderers', '存在 createWorldbookRenderers()', has(contents.renderers, 'export function createWorldbookRenderers('));
    check(results, 'renderers', 'worldbook entries 使用稳定委托宿主键防重复绑定', has(contents.renderers, "const WORLDBOOK_ENTRIES_DELEGATED_CHANGE_KEY = '__stYuziPhoneWorldbookEntriesDelegatedChange';"));
    check(results, 'renderers', 'worldbook entries 使用容器级 change 委托且优先走 pageRuntime', has(contents.renderers, 'const bindDelegatedChangeListener = (entriesContainer, listener) => {')
        && has(contents.renderers, "return pageRuntime.addEventListener(entriesContainer, 'change', listener);")
        && has(contents.renderers, "entriesContainer.addEventListener('change', listener);"));
    check(results, 'renderers', 'worldbook entries 委托只处理 `.phone-worldbook-entry-checkbox`', has(contents.renderers, "target.classList.contains('phone-worldbook-entry-checkbox')"));
    check(results, 'renderers', 'worldbook entries 不再每次 render 后逐 checkbox 绑定监听器', lacks(contents.renderers, "querySelectorAll('.phone-worldbook-entry-checkbox').forEach") && countOccurrences(contents.renderers, "addEventListener('change'") === 1);
    check(results, 'renderers', 'worldbook entries 勾选仍调用 setEntrySelectionState 并刷新状态文本', has(contents.renderers, 'setEntrySelectionState(worldbookName, uid, checked, { sourceMode });') && has(contents.renderers, 'updateWorldbookStatus();'));
    check(results, 'stateActions', '存在 createWorldbookStateActions()', has(contents.stateActions, 'export function createWorldbookStateActions('));
    check(results, 'subscription', '存在 createWorldbookSubscription()', has(contents.subscription, 'export function createWorldbookSubscription('));
    check(results, 'subscription', 'worldbook subscription 继续使用 token 防过期 cleanup', has(contents.subscription, 'let subscriptionToken = 0;') && has(contents.subscription, 'currentToken !== subscriptionToken || disposed'));

    check(results, 'editorBuilders', 'API Prompt 模板继续导入 buildShellRegionHtml()', has(contents.editorBuilders, "import { buildShellRegionHtml } from '../../../view-regions.js';"));
    check(results, 'editorBuilders', 'API Prompt 模板声明 hero region', has(contents.editorBuilders, "region: 'api-prompt-hero'"));
    check(results, 'editorBuilders', 'API Prompt 模板声明 api status region', has(contents.editorBuilders, "region: 'api-prompt-api-status'"));
    check(results, 'editorBuilders', 'API Prompt 模板声明 api presets region', has(contents.editorBuilders, "region: 'api-prompt-api-presets'"));
    check(results, 'editorBuilders', 'API Prompt 模板声明 story context region', has(contents.editorBuilders, "region: 'api-prompt-story-context'"));
    check(results, 'editorBuilders', 'API Prompt 模板声明 runtime params region', has(contents.editorBuilders, "region: 'api-prompt-runtime-params'"));
    check(results, 'editorBuilders', 'API Prompt 模板声明 worldbook workbench region', has(contents.editorBuilders, "region: 'api-prompt-worldbook-workbench'"));
    check(results, 'editorBuilders', 'API Prompt frame 使用 hero region 与分区 bodyHtml', has(contents.editorBuilders, 'heroHtml: heroRegionHtml,') && has(contents.editorBuilders, '${apiStatusRegionHtml}') && has(contents.editorBuilders, '${apiPresetsSectionHtml}') && has(contents.editorBuilders, '${storyContextSectionHtml}') && has(contents.editorBuilders, '${runtimeParamsSectionHtml}') && has(contents.editorBuilders, '${worldbookWorkbenchSectionHtml}'));

    check(results, 'pageShell', '共享 page-shell 暴露 createPageShellSnapshot()', has(contents.pageShell, 'export function createPageShellSnapshot('));
    check(results, 'pageShell', '共享 page-shell 暴露 ensurePageShell()', has(contents.pageShell, 'export function ensurePageShell('));
    check(results, 'pageShell', '共享 page-shell 暴露 normalizePageShellRefreshPlan()', has(contents.pageShell, 'export function normalizePageShellRefreshPlan('));
    check(results, 'pageShell', '共享 page-shell 暴露 patchPageShell()', has(contents.pageShell, 'export function patchPageShell('));
    check(results, 'pageShell', '共享 page-shell patch 通过 replaceWith() 定向替换 region', has(contents.pageShell, 'currentRegion.replaceWith(nextRegion);'));

    check(results, 'page', '继续从 façade 导入 createApiPromptWorldbookRuntime()', has(contents.page, "from '../services/api-prompt-worldbook-runtime.js';"));
    check(results, 'page', '继续调用 createApiPromptWorldbookRuntime()', has(contents.page, 'createApiPromptWorldbookRuntime({'));
    check(results, 'page', '继续解构 bindWorldbookSubscription', has(contents.page, 'bindWorldbookSubscription,'));
    check(results, 'page', '继续解构 initWorldbook', has(contents.page, 'initWorldbook,'));
    check(results, 'page', '继续解构 refreshWorldbook', has(contents.page, 'refreshWorldbook,'));
    check(results, 'page', 'API Prompt 页面定义 stable shell root selector', has(contents.page, "const API_PROMPT_PAGE_ROOT_SELECTOR = '.phone-settings-page';"));
    check(results, 'page', 'API Prompt 页面定义完整 region selector 集合', has(contents.page, "hero: '[data-shell-region=\"api-prompt-hero\"]'") && has(contents.page, "apiStatus: '[data-shell-region=\"api-prompt-api-status\"]'") && has(contents.page, "apiPresets: '[data-shell-region=\"api-prompt-api-presets\"]'") && has(contents.page, "storyContext: '[data-shell-region=\"api-prompt-story-context\"]'") && has(contents.page, "runtimeParams: '[data-shell-region=\"api-prompt-runtime-params\"]'") && has(contents.page, "worldbookWorkbench: '[data-shell-region=\"api-prompt-worldbook-workbench\"]'"));
    check(results, 'page', 'API Prompt 页面抽出安全 option builder 并使用 escapeHtml / escapeHtmlAttr', has(contents.page, "function buildOptionHtml({ value = '', label = '', selected = false }) {") && has(contents.page, 'escapeHtmlAttr(value)') && has(contents.page, 'escapeHtml(label)'));
    check(results, 'page', 'API Prompt 页面移除旧的无效 replace 转义链', lacks(contents.page, "replace(/&/g, '&')"));
    check(results, 'page', 'API Prompt 页面抽出 buildApiPromptConfigPayload()', has(contents.page, 'function buildApiPromptConfigPayload({ apiPromptService, state }) {'));
    check(results, 'page', 'API Prompt 页面使用共享 shell snapshot / ensure / patch', has(contents.page, 'function createApiPromptShellSnapshot(framePayload) {')
        && has(contents.page, 'return createPageShellSnapshot({')
        && has(contents.page, 'const shellState = ensurePageShell(container, shellSnapshot,')
        && has(contents.page, 'patchPageShell(shellState.pageRoot, shellSnapshot,'));
    check(results, 'page', 'API Prompt 页面使用共享 refresh plan normalizer，默认不 patch worldbookWorkbench', has(contents.page, 'function normalizeApiPromptRefreshPlan(refreshPlan) {')
        && has(contents.page, 'return normalizePageShellRefreshPlan(refreshPlan, {')
        && has(contents.page, 'hero: true,')
        && has(contents.page, 'apiStatus: true,')
        && has(contents.page, 'apiPresets: true,')
        && has(contents.page, 'storyContext: true,')
        && has(contents.page, 'runtimeParams: true,')
        && has(contents.page, 'worldbookWorkbench: false,'));
    check(results, 'page', 'API Prompt 页面不再直接整页 container.innerHTML = buildApiPromptConfigPageHtml(...)', lacks(contents.page, 'container.innerHTML = buildApiPromptConfigPageHtml({'));
    check(results, 'page', 'API Prompt 页面向 controller 注入 refreshApiPromptConfigPage()', has(contents.page, 'refreshApiPromptConfigPage(refreshOptions = {}) {') && has(contents.page, 'renderApiPromptConfigPage(ctx, refreshOptions);'));

    check(results, 'controller', 'API Prompt controller 建立幂等 cleanup 宿主键', has(contents.controller, "const API_PROMPT_INTERACTION_CLEANUP_KEY = '__stYuziPhoneApiPromptConfigCleanup';"));
    check(results, 'controller', 'API Prompt controller 在重复绑定前执行上次 cleanup', has(contents.controller, 'const previousCleanup = container[API_PROMPT_INTERACTION_CLEANUP_KEY];') && has(contents.controller, "if (typeof previousCleanup === 'function') {") && has(contents.controller, 'previousCleanup();'));
    check(results, 'controller', 'API Prompt controller 接收 refreshApiPromptConfigPage 入口', has(contents.controller, 'refreshApiPromptConfigPage,'));
    check(results, 'controller', 'API Prompt controller 提供 refreshPage 包装', has(contents.controller, 'const refreshPage = (refreshOptions = {}) => {') && has(contents.controller, 'refreshApiPromptConfigPage(refreshOptions);'));
    check(results, 'controller', 'API Prompt controller 配置项保存使用定向 refreshPlan，且不刷新 worldbookWorkbench', countOccurrences(contents.controller, 'worldbookWorkbench: false') >= 5);
    check(results, 'controller', 'API Prompt controller 搜索仍只调用 renderWorldbookEntriesList()', has(contents.controller, 'const onWorldbookSearchInput = () => {') && has(contents.controller, "state.worldbookSearchQuery = String(worldbookSearchInput.value || '');") && has(contents.controller, 'renderWorldbookEntriesList();') && lacks(contents.controller, 'worldbookWorkbench: true'));
    check(results, 'controller', 'API Prompt controller 返回 cleanupInteractions', has(contents.controller, 'return cleanupInteractions;'));

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[api-prompt-worldbook-runtime-contract-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[api-prompt-worldbook-runtime-contract-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
