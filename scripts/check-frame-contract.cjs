const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    frame: 'modules/settings-app/layout/frame.js',
    primitives: 'modules/settings-app/layout/primitives.js',
    pageBuilders: 'modules/settings-app/layout/page-builders.js',
};

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function has(content, snippet) {
    return content.includes(snippet);
}

function push(results, fileKey, description, ok) {
    results.push({ file: FILES[fileKey], description, ok });
}

function main() {
    const contents = Object.fromEntries(
        Object.entries(FILES).map(([key, relativePath]) => [key, read(relativePath)])
    );

    const results = [];

    push(results, 'frame', '继续 re-export [`buildSettingsPageFrame()`](modules/settings-app/layout/frame.js:1)', has(contents.frame, 'buildSettingsPageFrame,'));
    push(results, 'frame', '继续 re-export [`buildSettingsHomePageHtml()`](modules/settings-app/layout/frame.js:1)', has(contents.frame, 'buildSettingsHomePageHtml,'));
    push(results, 'frame', '继续 re-export [`buildAppearancePageHtml()`](modules/settings-app/layout/frame.js:1)', has(contents.frame, 'buildAppearancePageHtml,'));
    push(results, 'frame', '继续 re-export [`buildDatabasePageHtml()`](modules/settings-app/layout/frame.js:1)', has(contents.frame, 'buildDatabasePageHtml,'));
    push(results, 'frame', '继续 re-export [`buildApiPromptConfigPageHtml()`](modules/settings-app/layout/frame.js:1)', has(contents.frame, 'buildApiPromptConfigPageHtml,'));
    push(results, 'frame', '继续 re-export [`buildBeautifyTemplatePageHtml()`](modules/settings-app/layout/frame.js:1)', has(contents.frame, 'buildBeautifyTemplatePageHtml,'));

    push(results, 'primitives', '存在 [`SETTINGS_ENTRY_META`](modules/settings-app/layout/primitives.js:1)', has(contents.primitives, 'export const SETTINGS_ENTRY_META = {'));
    push(results, 'primitives', '存在 [`buildSettingsChipHtml()`](modules/settings-app/layout/primitives.js:1)', has(contents.primitives, 'export function buildSettingsChipHtml('));
    push(results, 'primitives', '存在 [`buildSettingsHeroHtml()`](modules/settings-app/layout/primitives.js:1)', has(contents.primitives, 'export function buildSettingsHeroHtml('));
    push(results, 'primitives', '存在 [`buildSettingsSectionHtml()`](modules/settings-app/layout/primitives.js:1)', has(contents.primitives, 'export function buildSettingsSectionHtml('));
    push(results, 'primitives', '存在 [`buildSettingsPageFrame()`](modules/settings-app/layout/primitives.js:1)', has(contents.primitives, 'export function buildSettingsPageFrame('));

    push(results, 'pageBuilders', '存在 [`buildSettingsHomePageHtml()`](modules/settings-app/layout/page-builders.js:1)', has(contents.pageBuilders, 'export function buildSettingsHomePageHtml('));
    push(results, 'pageBuilders', '存在 [`buildAppearancePageHtml()`](modules/settings-app/layout/page-builders.js:1)', has(contents.pageBuilders, 'export function buildAppearancePageHtml('));
    push(results, 'pageBuilders', '存在 [`buildDatabasePageHtml()`](modules/settings-app/layout/page-builders.js:1)', has(contents.pageBuilders, 'export function buildDatabasePageHtml('));
    push(results, 'pageBuilders', '存在 [`buildButtonStylePageHtml()`](modules/settings-app/layout/page-builders.js:1)', has(contents.pageBuilders, 'export function buildButtonStylePageHtml('));
    push(results, 'pageBuilders', '存在 [`buildPromptEditorPageHtml()`](modules/settings-app/layout/page-builders.js:1)', has(contents.pageBuilders, 'export function buildPromptEditorPageHtml('));
    push(results, 'pageBuilders', '存在 [`buildApiPromptConfigPageHtml()`](modules/settings-app/layout/page-builders.js:1)', has(contents.pageBuilders, 'export function buildApiPromptConfigPageHtml('));
    push(results, 'pageBuilders', '存在 [`buildBeautifyTemplatePageHtml()`](modules/settings-app/layout/page-builders.js:1)', has(contents.pageBuilders, 'export function buildBeautifyTemplatePageHtml('));

    const failed = results.filter((item) => !item.ok);
    if (failed.length > 0) {
        console.error('[frame-contract-check] 检查失败：');
        failed.forEach((item) => {
            console.error(`- ${item.file}: ${item.description}`);
        });
        process.exitCode = 1;
        return;
    }

    console.log('[frame-contract-check] 检查通过');
    results.forEach((item) => {
        console.log(`- OK | ${item.file} | ${item.description}`);
    });
}

main();
