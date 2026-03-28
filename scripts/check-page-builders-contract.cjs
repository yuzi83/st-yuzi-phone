const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    facade: 'modules/settings-app/layout/page-builders.js',
    overview: 'modules/settings-app/layout/page-builders/overview-builders.js',
    appearance: 'modules/settings-app/layout/page-builders/appearance-builders.js',
    data: 'modules/settings-app/layout/page-builders/data-builders.js',
    editor: 'modules/settings-app/layout/page-builders/editor-builders.js',
    frame: 'modules/settings-app/layout/frame.js',
    homePage: 'modules/settings-app/pages/home.js',
    appearancePage: 'modules/settings-app/pages/appearance.js',
    databasePage: 'modules/settings-app/pages/database.js',
    buttonStylePage: 'modules/settings-app/pages/button-style.js',
    promptEditorPage: 'modules/settings-app/pages/prompt-editor.js',
    apiPromptConfigPage: 'modules/settings-app/pages/api-prompt-config.js',
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

    check(results, 'facade', '继续暴露 buildSettingsHomePageHtml()', has(contents.facade, 'export function buildSettingsHomePageHtml('));
    check(results, 'facade', '继续暴露 buildAppearancePageHtml()', has(contents.facade, 'export function buildAppearancePageHtml('));
    check(results, 'facade', '继续暴露 buildDatabasePageHtml()', has(contents.facade, 'export function buildDatabasePageHtml('));
    check(results, 'facade', '继续暴露 buildButtonStylePageHtml()', has(contents.facade, 'export function buildButtonStylePageHtml('));
    check(results, 'facade', '继续暴露 buildPromptEditorPageHtml()', has(contents.facade, 'export function buildPromptEditorPageHtml('));
    check(results, 'facade', '继续暴露 buildApiPromptConfigPageHtml()', has(contents.facade, 'export function buildApiPromptConfigPageHtml('));
    check(results, 'facade', '继续暴露 buildBeautifyTemplatePageHtml()', has(contents.facade, 'export function buildBeautifyTemplatePageHtml('));

    check(results, 'overview', '存在 buildSettingsHomePageHtml()', has(contents.overview, 'export function buildSettingsHomePageHtml('));
    check(results, 'appearance', '存在 buildAppearancePageHtml()', has(contents.appearance, 'export function buildAppearancePageHtml('));
    check(results, 'appearance', '存在 buildButtonStylePageHtml()', has(contents.appearance, 'export function buildButtonStylePageHtml('));
    check(results, 'data', '存在 buildDatabaseTableChecklistHtml()', has(contents.data, 'export function buildDatabaseTableChecklistHtml('));
    check(results, 'data', '存在 buildDatabasePageHtml()', has(contents.data, 'export function buildDatabasePageHtml('));
    check(results, 'editor', '存在 buildPromptEditorPageHtml()', has(contents.editor, 'export function buildPromptEditorPageHtml('));
    check(results, 'editor', '存在 buildApiPromptConfigPageHtml()', has(contents.editor, 'export function buildApiPromptConfigPageHtml('));
    check(results, 'editor', '存在 buildBeautifyTemplatePageHtml()', has(contents.editor, 'export function buildBeautifyTemplatePageHtml('));

    check(results, 'frame', '继续从 page-builders façade 导入 settings builders', has(contents.frame, "from './page-builders.js';"));
    check(results, 'homePage', '继续使用 buildSettingsHomePageHtml()', has(contents.homePage, 'buildSettingsHomePageHtml('));
    check(results, 'appearancePage', '继续使用 buildAppearancePageHtml()', has(contents.appearancePage, 'buildAppearancePageHtml('));
    check(results, 'databasePage', '继续使用 buildDatabasePageHtml()', has(contents.databasePage, 'buildDatabasePageHtml('));
    check(results, 'buttonStylePage', '继续使用 buildButtonStylePageHtml()', has(contents.buttonStylePage, 'buildButtonStylePageHtml('));
    check(results, 'promptEditorPage', '继续使用 buildPromptEditorPageHtml()', has(contents.promptEditorPage, 'buildPromptEditorPageHtml('));
    check(results, 'apiPromptConfigPage', '继续使用 buildApiPromptConfigPageHtml()', has(contents.apiPromptConfigPage, 'buildApiPromptConfigPageHtml('));

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[page-builders-contract-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[page-builders-contract-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
