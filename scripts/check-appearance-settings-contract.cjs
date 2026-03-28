const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    facade: 'modules/settings-app/services/appearance-settings.js',
    background: 'modules/settings-app/services/appearance-settings/background-service.js',
    iconUpload: 'modules/settings-app/services/appearance-settings/icon-upload-service.js',
    visibility: 'modules/settings-app/services/appearance-settings/visibility-settings.js',
    layout: 'modules/settings-app/services/appearance-settings/layout-settings.js',
    phoneSettings: 'modules/phone-settings.js',
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

    check(results, 'phoneSettings', '继续从 façade 导入 appearance settings 服务', has(contents.phoneSettings, "from './settings-app/services/appearance-settings.js';"));
    check(results, 'appearancePage', '继续调用 setupBgUpload()', has(contents.appearancePage, 'setupBgUpload(container);'));
    check(results, 'appearancePage', '继续调用 renderIconUploadList()', has(contents.appearancePage, "renderIconUploadList(container.querySelector('#phone-icon-upload-list'));"));
    check(results, 'appearancePage', '继续调用 renderHiddenTableAppsList()', has(contents.appearancePage, "renderHiddenTableAppsList(container.querySelector('#phone-hidden-table-apps'));"));
    check(results, 'appearancePage', '继续调用 setupIconLayoutSettings()', has(contents.appearancePage, 'setupIconLayoutSettings(container);'));

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
