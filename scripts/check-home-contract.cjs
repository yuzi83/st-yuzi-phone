const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    facade: 'modules/phone-home.js',
    icons: 'modules/phone-home/icons.js',
    templates: 'modules/phone-home/templates.js',
    actions: 'modules/phone-home/actions.js',
    data: 'modules/phone-home/home-data.js',
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

    check(results, 'facade', '继续兼容导出 `PHONE_ICONS`', has(contents.facade, "export { PHONE_ICONS } from './phone-home/icons.js';"));
    check(results, 'facade', '继续暴露 `renderHomeScreen()`', has(contents.facade, 'export function renderHomeScreen(container)'));
    check(results, 'facade', '继续组合模板模块', has(contents.facade, "from './phone-home/templates.js'"));
    check(results, 'facade', '继续组合 view-model 模块', has(contents.facade, "from './phone-home/view-model.js'"));
    check(results, 'facade', '继续组合交互绑定模块', has(contents.facade, "from './phone-home/interactions.js'"));

    check(results, 'icons', '存在 `PHONE_ICONS`', has(contents.icons, 'export const PHONE_ICONS = {'));
    check(results, 'icons', '存在 `getIconForSheet()`', has(contents.icons, 'export function getIconForSheet(sheetName)'));
    check(results, 'icons', '存在 `getTextIcon()`', has(contents.icons, 'export function getTextIcon(letter, colorA, colorB)'));

    check(results, 'templates', '存在 `buildHomeShellStyleText()`', has(contents.templates, 'export function buildHomeShellStyleText('));
    check(results, 'templates', '存在 `buildHomeShellHtml()`', has(contents.templates, 'export function buildHomeShellHtml('));
    check(results, 'templates', '存在 `buildHomeAppItemHtml()`', has(contents.templates, 'export function buildHomeAppItemHtml('));
    check(results, 'templates', '存在 `buildDockItemHtml()`', has(contents.templates, 'export function buildDockItemHtml('));

    check(results, 'actions', '存在 `showHomeToast()`', has(contents.actions, 'export function showHomeToast('));
    check(results, 'actions', '存在 `handleDockAction()`', has(contents.actions, 'export async function handleDockAction('));

    check(results, 'data', '存在 `getHomeDockApps()`', has(contents.data, 'export function getHomeDockApps()'));
    check(results, 'data', '存在 `normalizeHiddenTableApps()`', has(contents.data, 'export function normalizeHiddenTableApps('));
    check(results, 'data', '存在 `formatTableCountBadge()`', has(contents.data, 'export function formatTableCountBadge('));
    check(results, 'data', '存在 `getSheetRowCount()`', has(contents.data, 'export function getSheetRowCount('));

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[home-contract-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[home-contract-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
