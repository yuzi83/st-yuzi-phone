const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    phoneSettings: 'modules/phone-settings.js',
    pageRenderers: 'modules/settings-app/page-renderers.js',
    personalization: 'modules/settings-app/page-renderers/personalization-renderers.js',
    dataConfig: 'modules/settings-app/page-renderers/data-config-renderers.js',
    editor: 'modules/settings-app/page-renderers/editor-renderers.js',
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

    pushCheck(results, 'phoneSettings', '继续声明 `pageRendererDeps` grouped contract', has(contents.phoneSettings, 'const pageRendererDeps = {'));
    pushCheck(results, 'phoneSettings', '通过 [`createSettingsPageRenderers()`](modules/settings-app/page-renderers.js:9) 注入 grouped deps', has(contents.phoneSettings, 'createSettingsPageRenderers(pageRendererDeps)'));
    pushCheck(results, 'phoneSettings', '包含 `common` 分组', has(contents.phoneSettings, 'common: {'));
    pushCheck(results, 'phoneSettings', '包含 `dataConfig` 分组', has(contents.phoneSettings, 'dataConfig: {'));
    pushCheck(results, 'phoneSettings', '包含 `apiPrompt` 分组', has(contents.phoneSettings, 'apiPrompt: {'));

    pushCheck(results, 'pageRenderers', '聚合入口继续组合个性化 renderer', has(contents.pageRenderers, 'createPersonalizationPageRenderers({'));
    pushCheck(results, 'pageRenderers', '聚合入口继续组合数据配置 renderer', has(contents.pageRenderers, 'createDataConfigPageRenderers({'));
    pushCheck(results, 'pageRenderers', '聚合入口继续组合编辑器 renderer', has(contents.pageRenderers, 'createEditorPageRenderers({'));
    pushCheck(results, 'pageRenderers', '运行时断言保护存在', has(contents.pageRenderers, 'validateSettingsRendererDeps(deps);'));

    pushCheck(results, 'personalization', '个性化 renderer 使用 grouped deps', has(contents.personalization, 'const common =') && has(contents.personalization, 'const appearance ='));
    pushCheck(results, 'dataConfig', '数据配置 renderer 使用 grouped deps', has(contents.dataConfig, 'const dataConfig =') && has(contents.dataConfig, 'const apiPrompt ='));
    pushCheck(results, 'editor', '编辑器 renderer 使用 grouped deps', has(contents.editor, 'const promptEditor =') && has(contents.editor, 'const scroll ='));

    pushCheck(results, 'types', '存在 [`SettingsAppState`](types.d.ts:394)', has(contents.types, 'export interface SettingsAppState'));
    pushCheck(results, 'types', '存在 [`SettingsPageRendererGroupedDeps`](types.d.ts:516)', has(contents.types, 'export interface SettingsPageRendererGroupedDeps'));
    pushCheck(results, 'types', '存在 [`SettingsPageRenderers`](types.d.ts:529)', has(contents.types, 'export interface SettingsPageRenderers'));

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
