const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    facade: 'modules/settings-app/services/appearance-settings.js',
    background: 'modules/settings-app/services/appearance-settings/background-service.js',
    iconUpload: 'modules/settings-app/services/appearance-settings/icon-upload-service.js',
    visibility: 'modules/settings-app/services/appearance-settings/visibility-settings.js',
    layout: 'modules/settings-app/services/appearance-settings/layout-settings.js',
    settingsRender: 'modules/settings-app/render.js',
    pageRenderers: 'modules/settings-app/page-renderers.js',
    contextBuilders: 'modules/settings-app/page-renderers/page-context-builders.js',
    appearancePage: 'modules/settings-app/pages/appearance.js',
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

    check(results, 'facade', '继续暴露 setupBgUpload()', has(contents.facade, 'export function setupBgUpload('));
    check(results, 'facade', '继续暴露 renderIconUploadList()', has(contents.facade, 'export function renderIconUploadList('));
    check(results, 'facade', '继续暴露 setupAppearanceToggles()', has(contents.facade, 'export function setupAppearanceToggles('));
    check(results, 'facade', '继续暴露 renderHiddenTableAppsList()', has(contents.facade, 'export function renderHiddenTableAppsList('));
    check(results, 'facade', '继续暴露 setupIconLayoutSettings()', has(contents.facade, 'export function setupIconLayoutSettings('));
    check(results, 'facade', '继续暴露 getLayoutValue()', has(contents.facade, 'export function getLayoutValue('));

    check(results, 'background', '存在 setupBgUpload()', has(contents.background, 'export function setupBgUpload('));
    check(results, 'iconUpload', '存在 createIconUploadService()', has(contents.iconUpload, 'export function createIconUploadService('));
    check(results, 'visibility', '存在 setupAppearanceToggles()', has(contents.visibility, 'export function setupAppearanceToggles('));
    check(results, 'visibility', '存在 renderHiddenTableAppsList()', has(contents.visibility, 'export function renderHiddenTableAppsList('));
    check(results, 'layout', '存在 setupIconLayoutSettings()', has(contents.layout, 'export function setupIconLayoutSettings('));
    check(results, 'layout', '存在 getLayoutValue()', has(contents.layout, 'export function getLayoutValue('));

    check(results, 'settingsRender', 'settings render 从 appearance-settings façade 导入服务', has(contents.settingsRender, "from './services/appearance-settings.js';"));
    check(results, 'settingsRender', 'settings render 将 appearance 服务注入 grouped deps', has(contents.settingsRender, 'appearance: {')
        && has(contents.settingsRender, 'setupBgUpload,')
        && has(contents.settingsRender, 'setupIconLayoutSettings,')
        && has(contents.settingsRender, 'setupAppearanceToggles,')
        && has(contents.settingsRender, 'renderHiddenTableAppsList,')
        && has(contents.settingsRender, 'renderIconUploadList,'));
    check(results, 'pageRenderers', 'page renderer 校验 appearance 服务依赖', has(contents.pageRenderers, "assertFunctionDeps('appearance', deps.appearance,")
        && has(contents.pageRenderers, "'setupBgUpload',")
        && has(contents.pageRenderers, "'renderIconUploadList',"));
    check(results, 'contextBuilders', 'appearance context 通过 appearancePageService 注入页面', has(contents.contextBuilders, 'function buildAppearancePageService(services)')
        && has(contents.contextBuilders, 'appearancePageService,')
        && has(contents.contextBuilders, 'setupBgUpload: services.appearance.setupBgUpload'));

    check(results, 'appearancePage', '外观页从 appearancePageService 读取 setupBgUpload()', has(contents.appearancePage, 'const setupBgUpload = appearancePageService.setupBgUpload;'));
    check(results, 'appearancePage', '外观页从 appearancePageService 读取 renderIconUploadList()', has(contents.appearancePage, 'const renderIconUploadList = appearancePageService.renderIconUploadList;'));
    check(results, 'appearancePage', '外观页通过 pageRuntime 托管背景上传 cleanup', has(contents.appearancePage, 'runtime.registerCleanup(setupBgUpload(container, { runtime }));'));
    check(results, 'appearancePage', '外观页通过 pageRuntime 托管图标上传 cleanup', has(contents.appearancePage, "runtime.registerCleanup(renderIconUploadList(container.querySelector('#phone-icon-upload-list'), { runtime }));"));
    check(results, 'appearancePage', '外观页保留 registerCleanup fallback', has(contents.appearancePage, "registerCleanup(setupBgUpload(container));")
        && has(contents.appearancePage, "registerCleanup(renderIconUploadList(container.querySelector('#phone-icon-upload-list')));"));
    check(results, 'appearancePage', '外观页继续渲染隐藏表格与布局设置入口', has(contents.appearancePage, "renderHiddenTableAppsList(container.querySelector('#phone-hidden-table-apps'))")
        && has(contents.appearancePage, 'setupIconLayoutSettings(container)'));

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[appearance-settings-contract-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[appearance-settings-contract-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
