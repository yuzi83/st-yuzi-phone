const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function importModule(relativePath) {
    return import(pathToFileURL(path.join(ROOT, relativePath)).href);
}

async function main() {
    const primitives = read('modules/settings-app/layout/primitives.js');
    const overview = read('modules/settings-app/layout/page-builders/overview-builders.js');
    const frame = read('modules/settings-app/layout/frame.js');
    const render = read('modules/settings-app/render.js');
    const contexts = read('modules/settings-app/page-renderers/page-context-builders.js');
    const renderers = read('modules/settings-app/page-renderers.js');
    const personalization = read('modules/settings-app/page-renderers/table-content-replacement-renderers.js');
    const state = read('modules/settings-app/state-machine.js');
    const types = read('types.d.ts');
    const background = read('modules/phone-core/background-services.js');
    const page = read('modules/settings-app/pages/table-content-replacement.js');

    assert.match(primitives, /table_content_replacement:\s*\{/u);
    assert.match(overview, /'table_content_replacement'/u);
    assert.match(overview, /entries\.slice\(0, 2\)/u);
    assert.match(overview, /remainingEntries\.slice\(0, 5\)/u);
    assert.match(overview, /remainingEntries\.slice\(5\)/u);
    assert.match(frame, /buildTableContentReplacementPageHtml,/u);
    assert.match(render, /createTableContentReplacementSettingsService/u);
    assert.match(render, /rerenderTableContentReplacementKeepScroll/u);
    assert.match(render, /mode === 'table_content_replacement'/u);
    assert.match(contexts, /tableContentReplacementSettingsService/u);
    assert.match(contexts, /navigateBack: services\.navigation\.navigateBack/u);
    assert.match(contexts, /tableContentReplacement:/u);
    assert.match(renderers, /createTableContentReplacementPageRenderers/u);
    assert.match(personalization, /table_content_replacement/u);
    assert.match(state, /tableContentReplacementScrollTop/u);
    assert.match(types, /'table_content_replacement'/u);
    assert.match(types, /tableContentReplacement:\s*TableContentReplacementSettings/u);
    assert.match(background, /startTableContentReplacement/u);
    assert.match(background, /stopTableContentReplacement/u);
    assert.match(background, /低优先级、故障隔离的旁路服务/u);
    assert.match(background, /runtime\.running = chronicleStarted && smallStarted/u);
    assert.match(background, /export function applyTableContentReplacementArea/u);
    assert.match(page, /activeConfig/u, '设置页必须单独保留已保存的运行规则配置');
    assert.match(page, /state\.activeConfig\s*=\s*cloneConfig\(viewModel\?\.config/u, '页面加载后运行规则总览必须使用已保存配置');
    assert.match(page, /state\.activeConfig\s*=\s*mergeSavedScope/u, '局部保存成功后运行规则总览必须只更新对应区域');

    const { buildSettingsHomePageHtml } = await importModule(
        'modules/settings-app/layout/page-builders/overview-builders.js',
    );
    const homeHtml = buildSettingsHomePageHtml({ contentPresetFullPageRuntimeEnabled: true });
    const order = [
        'appearance',
        'beautify',
        'button_style',
        'worldbook_reading',
        'image_generation',
        'api_presets',
        'ai_instruction_presets',
        'table_content_replacement',
    ].map(entry => homeHtml.indexOf(`data-entry="${entry}"`));
    assert.ok(order.every(index => index >= 0), '设置首页必须渲染全部入口');
    assert.deepEqual([...order].sort((a, b) => a - b), order, '设置入口必须按 2-5-1 顺序渲染');
    assert.equal((homeHtml.match(/phone-settings-profile-action-group"/g) || []).length, 3, '设置首页必须有三组入口');
    const disabledHomeHtml = buildSettingsHomePageHtml({ contentPresetFullPageRuntimeEnabled: false });
    assert.equal((disabledHomeHtml.match(/phone-settings-profile-action-group"/g) || []).length, 3, '模板工坊关闭时新增入口仍需单独成组');
    assert.match(disabledHomeHtml, /data-entry="table_content_replacement"/u);

    console.log('[通过] 表格内容词汇替换设置页集成 seam');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
