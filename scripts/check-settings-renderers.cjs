const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    settingsRender: 'modules/settings-app/render.js',
    pageRuntime: 'modules/settings-app/page-runtime.js',
    pageRenderers: 'modules/settings-app/page-renderers.js',
    personalization: 'modules/settings-app/page-renderers/personalization-renderers.js',
    dataConfig: 'modules/settings-app/page-renderers/data-config-renderers.js',
    editor: 'modules/settings-app/page-renderers/editor-renderers.js',
    homePage: 'modules/settings-app/pages/home.js',
    appearancePage: 'modules/settings-app/pages/appearance.js',
    databasePage: 'modules/settings-app/pages/database.js',
    apiPromptPage: 'modules/settings-app/pages/api-prompt-config.js',
    aiInstructionPage: 'modules/settings-app/pages/ai-instruction-presets.js',
    buttonStylePage: 'modules/settings-app/pages/button-style.js',
    promptEditorPage: 'modules/settings-app/pages/prompt-editor.js',
    beautifyPage: 'modules/settings-app/pages/beautify.js',
    databaseController: 'modules/settings-app/services/database-page-controller.js',
    apiPromptController: 'modules/settings-app/services/api-prompt-config-controller.js',
    types: 'types.d.ts',
};

function read(relativePath) {
    const fullPath = path.join(ROOT, relativePath);
    return fs.readFileSync(fullPath, 'utf8');
}

function has(content, snippet) {
    return content.includes(snippet);
}

function pushCheck(results, fileKey, description, ok) {
    results.push({
        file: FILES[fileKey],
        description,
        ok,
    });
}

function main() {
    const contents = Object.fromEntries(
        Object.entries(FILES).map(([key, relativePath]) => [key, read(relativePath)])
    );

    const results = [];

    pushCheck(results, 'settingsRender', 'settings render 继续声明 `pageRendererDeps` grouped contract', has(contents.settingsRender, 'const pageRendererDeps = {'));
    pushCheck(results, 'settingsRender', 'settings render 通过 [`createSettingsPageRenderers()`](modules/settings-app/page-renderers.js:111) 注入 grouped deps', has(contents.settingsRender, 'createSettingsPageRenderers(pageRendererDeps)'));
    pushCheck(results, 'settingsRender', 'settings render 包含 `common` 分组', has(contents.settingsRender, 'common: {'));
    pushCheck(results, 'settingsRender', 'common 分组暴露 `pageRuntime`', has(contents.settingsRender, 'pageRuntime,'));
    pushCheck(results, 'pageRuntime', 'settings page-runtime 声明稳定代理对象', has(contents.pageRuntime, 'const pageRuntime = {'));
    pushCheck(results, 'settingsRender', 'settings render 声明 `currentPageSession` 页面会话记录', has(contents.settingsRender, 'let currentPageSession = null;'));
    pushCheck(results, 'settingsRender', 'settings render 声明 `disposeCurrentPageSession()` 统一回收入口', has(contents.settingsRender, 'const disposeCurrentPageSession = () => {'));
    pushCheck(results, 'settingsRender', 'settings render 声明 legacy 页面回退渲染器', has(contents.settingsRender, 'const renderLegacyPageByMode = (mode) => {'));
    pushCheck(results, 'settingsRender', 'render 优先读取 `pageRenderers.pages` registry', has(contents.settingsRender, 'const pageDefinition = pageRenderers?.pages'));
    pushCheck(results, 'settingsRender', 'render 基于 lifecycleMethod 分发 mount/update', has(contents.settingsRender, "const lifecycleMethod = canUpdateInPlace ? 'update' : 'mount';"));
    pushCheck(results, 'settingsRender', 'render 在生命周期分发后继续重绑滚动守卫', has(contents.settingsRender, 'bindPhoneScrollGuards(container);'));
    pushCheck(results, 'settingsRender', 'settings render 包含 `dataConfig` 分组', has(contents.settingsRender, 'dataConfig: {'));
    pushCheck(results, 'settingsRender', 'settings render 包含 `apiPrompt` 分组', has(contents.settingsRender, 'apiPrompt: {'));

    pushCheck(results, 'pageRenderers', '聚合入口创建 rendererScope', has(contents.pageRenderers, 'const rendererScope = {'));
    pushCheck(results, 'pageRenderers', '聚合入口解构个性化 pages registry', has(contents.pageRenderers, 'const { pages: personalizationPages = {}, ...personalizationRenderers } = createPersonalizationPageRenderers(rendererScope);'));
    pushCheck(results, 'pageRenderers', '聚合入口解构数据配置 pages registry', has(contents.pageRenderers, 'const { pages: dataConfigPages = {}, ...dataConfigRenderers } = createDataConfigPageRenderers(rendererScope);'));
    pushCheck(results, 'pageRenderers', '聚合入口解构编辑器 pages registry', has(contents.pageRenderers, 'const { pages: editorPages = {}, ...editorRenderers } = createEditorPageRenderers(rendererScope);'));
    pushCheck(results, 'pageRenderers', '聚合入口返回统一 pages registry', has(contents.pageRenderers, 'pages: {'));
    pushCheck(results, 'pageRenderers', '运行时断言保护存在', has(contents.pageRenderers, 'validateSettingsRendererDeps(deps);'));

    pushCheck(results, 'personalization', '个性化 renderer 继续解析 pageContexts', has(contents.personalization, 'const pageContexts = rendererScope?.pageContexts'));
    pushCheck(results, 'personalization', '个性化 renderer 继续解析 deps', has(contents.personalization, 'const deps = rendererScope?.deps'));
    pushCheck(results, 'personalization', '个性化 renderer 输出 pages registry', has(contents.personalization, 'pages: {'));
    pushCheck(results, 'personalization', 'home registry 直接消费 [`createHomePage()`](modules/settings-app/pages/home.js:4)', has(contents.personalization, 'return createHomePage(homeContext);'));
    pushCheck(results, 'personalization', 'appearance registry 直接消费 [`createAppearancePage()`](modules/settings-app/pages/appearance.js:3)', has(contents.personalization, 'return createAppearancePage(appearanceContext);'));
    pushCheck(results, 'personalization', 'button-style registry 直接消费 [`createButtonStylePage()`](modules/settings-app/pages/button-style.js:7)', has(contents.personalization, 'return createButtonStylePage(buttonStyleContext);'));

    pushCheck(results, 'dataConfig', '数据配置 renderer 继续解析 pageContexts', has(contents.dataConfig, 'const pageContexts = rendererScope?.pageContexts'));
    pushCheck(results, 'dataConfig', '数据配置 renderer 继续解析 deps', has(contents.dataConfig, 'const deps = rendererScope?.deps'));
    pushCheck(results, 'dataConfig', '数据配置 renderer 输出 pages registry', has(contents.dataConfig, 'pages: {'));
    pushCheck(results, 'dataConfig', 'database registry 直接消费 [`createDatabasePage()`](modules/settings-app/pages/database.js:97)', has(contents.dataConfig, 'return createDatabasePage(databaseContext);'));
    pushCheck(results, 'dataConfig', 'api-prompt registry 直接消费 [`createApiPromptConfigPage()`](modules/settings-app/pages/api-prompt-config.js:138)', has(contents.dataConfig, 'return createApiPromptConfigPage(apiPromptConfigContext);'));
    pushCheck(results, 'dataConfig', 'ai-instruction registry 直接消费 [`createAiInstructionPresetsPage()`](modules/settings-app/pages/ai-instruction-presets.js:17)', has(contents.dataConfig, 'return createAiInstructionPresetsPage(aiInstructionPresetsContext);'));

    pushCheck(results, 'editor', '编辑器 renderer 继续解析 pageContexts', has(contents.editor, 'const pageContexts = rendererScope?.pageContexts'));
    pushCheck(results, 'editor', '编辑器 renderer 继续解析 deps', has(contents.editor, 'const deps = rendererScope?.deps'));
    pushCheck(results, 'editor', '编辑器 renderer 输出 pages registry', has(contents.editor, 'pages: {'));
    pushCheck(results, 'editor', 'prompt-editor registry 直接消费 [`createPromptEditorPage()`](modules/settings-app/pages/prompt-editor.js:65)', has(contents.editor, 'return createPromptEditorPage(promptEditorContext);'));
    pushCheck(results, 'editor', 'beautify registry 直接消费 [`createBeautifyTemplatePage()`](modules/settings-app/pages/beautify.js:25)', has(contents.editor, 'return createBeautifyTemplatePage(beautifyTemplateContext);'));

    pushCheck(results, 'homePage', 'home 页面导出显式页面工厂', has(contents.homePage, 'export function createHomePage(ctx) {'));
    pushCheck(results, 'homePage', 'home 页面接收 `pageRuntime`', has(contents.homePage, 'pageRuntime,'));
    pushCheck(results, 'homePage', 'home 页面通过 runtime.addEventListener() 绑定事件', has(contents.homePage, 'if (!runtime?.addEventListener) {'));
    pushCheck(results, 'homePage', 'home 页面直接消费 databasePresetService', has(contents.homePage, 'const getDbConfigApiAvailability = databasePresetService.getDbConfigApiAvailability;'));
    pushCheck(results, 'homePage', 'home 页面不再回退到 ctx 顶层数据库方法', !has(contents.homePage, 'ctx.getDbConfigApiAvailability'));

    pushCheck(results, 'appearancePage', 'appearance 页面导出显式页面工厂', has(contents.appearancePage, 'export function createAppearancePage(ctx) {'));
    pushCheck(results, 'appearancePage', 'appearance 页面接收 `pageRuntime`', has(contents.appearancePage, 'pageRuntime,'));
    pushCheck(results, 'appearancePage', 'appearance 页面通过 runtime.addEventListener() 绑定事件', has(contents.appearancePage, 'if (!runtime?.addEventListener) {'));
    pushCheck(results, 'appearancePage', 'appearance 页面直接消费 appearancePageService', has(contents.appearancePage, 'const getLayoutValue = appearancePageService.getLayoutValue;'));
    pushCheck(results, 'appearancePage', 'appearance 页面不再回退到 ctx 顶层 appearance 方法', !has(contents.appearancePage, 'ctx.getLayoutValue'));

    pushCheck(results, 'databasePage', 'database 页面导出显式页面工厂', has(contents.databasePage, 'export function createDatabasePage(ctx) {'));
    pushCheck(results, 'databasePage', 'database 页面向 controller 透传 `pageRuntime`', has(contents.databasePage, 'pageRuntime,'));
    pushCheck(results, 'databasePage', 'database 页面直接消费 databaseConfigService', has(contents.databasePage, 'const getTableData = databaseConfigService.getTableData;'));
    pushCheck(results, 'databasePage', 'database 页面不再回退到 ctx 顶层 database 方法', !has(contents.databasePage, 'ctx.getTableData'));

    pushCheck(results, 'apiPromptPage', 'api-prompt 页面导出显式页面工厂', has(contents.apiPromptPage, 'export function createApiPromptConfigPage(ctx) {'));
    pushCheck(results, 'apiPromptPage', 'api-prompt 页面接收 `pageRuntime`', has(contents.apiPromptPage, 'pageRuntime,'));
    pushCheck(results, 'apiPromptPage', 'api-prompt 页面向 controller 透传 `pageRuntime`', has(contents.apiPromptPage, 'bindApiPromptConfigInteractions({') && has(contents.apiPromptPage, 'pageRuntime,'));
    pushCheck(results, 'apiPromptPage', 'api-prompt 页面直接消费 apiPromptService', has(contents.apiPromptPage, 'const setTableApiPreset = apiPromptService.setTableApiPreset;'));
    pushCheck(results, 'apiPromptPage', 'api-prompt 页面不再回退到 ctx 顶层 apiPrompt 方法', !has(contents.apiPromptPage, 'ctx.getDbConfigApiAvailability'));

    pushCheck(results, 'aiInstructionPage', 'ai-instruction 页面导出显式页面工厂', has(contents.aiInstructionPage, 'export function createAiInstructionPresetsPage(ctx) {'));
    pushCheck(results, 'aiInstructionPage', 'ai-instruction 页面接收 `pageRuntime`', has(contents.aiInstructionPage, 'pageRuntime,'));
    pushCheck(results, 'aiInstructionPage', 'ai-instruction 页面移除 runtimeAdapter 兼容层', !has(contents.aiInstructionPage, 'const runtimeAdapter = {'));
    pushCheck(results, 'aiInstructionPage', 'ai-instruction 页面直接向 controller 透传 runtime', has(contents.aiInstructionPage, 'runtime,'));
    pushCheck(results, 'aiInstructionPage', 'ai-instruction 页面直接消费 aiInstructionPresetService', has(contents.aiInstructionPage, 'const getPhoneAiInstructionPresets = aiInstructionPresetService.getPhoneAiInstructionPresets;'));
    pushCheck(results, 'aiInstructionPage', 'ai-instruction 页面不再回退到 ctx 顶层 ai-instruction 方法', !has(contents.aiInstructionPage, 'ctx.getPhoneAiInstructionPresets'));

    pushCheck(results, 'buttonStylePage', 'button-style 页面导出显式页面工厂', has(contents.buttonStylePage, 'export function createButtonStylePage(ctx) {'));
    pushCheck(results, 'buttonStylePage', 'button-style 页面改为解析 `pageRuntime`', has(contents.buttonStylePage, "const runtime = pageRuntime && typeof pageRuntime === 'object' ? pageRuntime : null;"));
    pushCheck(results, 'buttonStylePage', 'button-style 页面通过 runtime.addEventListener() 绑定事件', has(contents.buttonStylePage, 'if (runtime?.addEventListener) {'));
    pushCheck(results, 'buttonStylePage', 'button-style 页面直接消费 buttonStylePageService', has(contents.buttonStylePage, 'const getPhoneSettings = buttonStylePageService.getPhoneSettings;'));
    pushCheck(results, 'buttonStylePage', 'button-style 页面不再回退到 ctx 顶层 buttonStyle 方法', !has(contents.buttonStylePage, 'ctx.getPhoneSettings'));

    pushCheck(results, 'promptEditorPage', 'prompt-editor 页面导出显式页面工厂', has(contents.promptEditorPage, 'export function createPromptEditorPage(ctx) {'));
    pushCheck(results, 'promptEditorPage', 'prompt-editor 页面接收 `pageRuntime`', has(contents.promptEditorPage, 'pageRuntime,'));
    pushCheck(results, 'promptEditorPage', 'prompt-editor 页面通过 addListener 统一绑定事件', has(contents.promptEditorPage, 'const addListener = (target, type, listener, options) => {'));
    pushCheck(results, 'promptEditorPage', 'prompt-editor 页面直接消费 promptEditorService', has(contents.promptEditorPage, 'const getPhoneAiInstructionPreset = promptEditorService.getPhoneAiInstructionPreset;'));
    pushCheck(results, 'promptEditorPage', 'prompt-editor 页面不再回退到 ctx 顶层 promptEditor 方法', !has(contents.promptEditorPage, 'ctx.getPhoneAiInstructionPreset'));

    pushCheck(results, 'beautifyPage', 'beautify 页面导出显式页面工厂', has(contents.beautifyPage, 'export function createBeautifyTemplatePage(ctx) {'));
    pushCheck(results, 'beautifyPage', 'beautify 页面不再导入 createManagedPageRuntime()', !has(contents.beautifyPage, 'createManagedPageRuntime'));
    pushCheck(results, 'beautifyPage', 'beautify 页面改为消费外层 `pageRuntime`', has(contents.beautifyPage, 'const { container, registerCleanup, pageRuntime, state } = ctx;'));
    pushCheck(results, 'beautifyPage', 'beautify 页面通过 runtime 统一驱动行为层', has(contents.beautifyPage, 'runtime,'));

    pushCheck(results, 'databaseController', 'database controller 接收 `pageRuntime`', has(contents.databaseController, 'pageRuntime,'));
    pushCheck(results, 'databaseController', 'database controller 通过 runtime.addEventListener() 绑定事件', has(contents.databaseController, 'if (runtime?.addEventListener) {'));
    pushCheck(results, 'databaseController', 'database controller 移除空洞 cleanup', !has(contents.databaseController, 'registerControllerCleanup(() => {});'));
    pushCheck(results, 'apiPromptController', 'api-prompt controller 接收 `pageRuntime`', has(contents.apiPromptController, 'pageRuntime,'));
    pushCheck(results, 'apiPromptController', 'api-prompt controller 优先使用 runtime.addEventListener()', has(contents.apiPromptController, 'if (runtime?.addEventListener) {'));

    pushCheck(results, 'types', '存在 [`SettingsAppState`](types.d.ts:593)', has(contents.types, 'export interface SettingsAppState'));
    pushCheck(results, 'types', '存在 [`SettingsPageRuntime`](types.d.ts:635)', has(contents.types, 'export interface SettingsPageRuntime'));
    pushCheck(results, 'types', '存在 [`SettingsPageRuntimeHandle`](types.d.ts:649)', has(contents.types, 'export interface SettingsPageRuntimeHandle extends SettingsPageRuntime'));
    pushCheck(results, 'types', 'SettingsPageRendererCommonDeps 暴露 `pageRuntime`', has(contents.types, 'pageRuntime?: SettingsPageRuntime;'));
    pushCheck(results, 'types', '存在 [`SettingsPageRendererGroupedDeps`](types.d.ts:757)', has(contents.types, 'export interface SettingsPageRendererGroupedDeps'));
    pushCheck(results, 'types', '存在 [`SettingsPageInstance`](types.d.ts:770)', has(contents.types, 'export interface SettingsPageInstance'));
    pushCheck(results, 'types', '存在 [`SettingsPageDefinition`](types.d.ts:776)', has(contents.types, 'export interface SettingsPageDefinition'));
    pushCheck(results, 'types', 'SettingsPageDefinition 使用无参 `createPage`', has(contents.types, 'createPage: () => SettingsPageInstance;'));
    pushCheck(results, 'types', '存在 [`SettingsPageRegistry`](types.d.ts:780)', has(contents.types, 'export type SettingsPageRegistry = Record<SettingsPageMode, SettingsPageDefinition>;'));
    pushCheck(results, 'types', '存在 [`SettingsPageRenderers`](types.d.ts:782)', has(contents.types, 'export interface SettingsPageRenderers'));
    pushCheck(results, 'types', 'SettingsPageRenderers 暴露 `pages` registry', has(contents.types, 'pages: SettingsPageRegistry;'));

    const failed = results.filter((item) => !item.ok);

    if (failed.length > 0) {
        console.error('[settings-renderer-check] 检查失败：');
        failed.forEach((item) => {
            console.error(`- ${item.file}: ${item.description}`);
        });
        process.exitCode = 1;
        return;
    }

    console.log('[settings-renderer-check] 检查通过');
    results.forEach((item) => {
        console.log(`- OK | ${item.file} | ${item.description}`);
    });
}

main();
