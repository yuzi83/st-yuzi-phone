const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const url = file => `${pathToFileURL(path.join(process.cwd(), file)).href}?t=${Date.now()}-${Math.random()}`;
const files = {
    'pages/page.html': { mimeType: 'text/html', encoding: 'text', content: '<main></main>' },
    'pages/page.css': { mimeType: 'text/css', encoding: 'text', content: ':host{}' },
    'pages/page.mjs': { mimeType: 'text/javascript', encoding: 'text', content: 'export function mount(context) {}' },
    'popups/card.html': { mimeType: 'text/html', encoding: 'text', content: '<article></article>' },
    'popups/card.css': { mimeType: 'text/css', encoding: 'text', content: ':host{}' },
    'popups/card.mjs': { mimeType: 'text/javascript', encoding: 'text', content: 'export function mount(context) {}' },
};
function bundle(formatVersion, apiVersion, manifest) {
    return { format: 'yuzi-beautify-preset', formatVersion, apiVersion, manifest, files };
}

async function main() {
    const { importContentPreset, exportContentPreset } = await import(url('modules/content-presets/import-export.js'));
    const matcher = await import(url('modules/content-presets/matcher.js'));
    const { buildContentPresetCatalog } = await import(url('modules/content-presets/catalog.js'));

    const legacy = importContentPreset(bundle(2, 1, {
        id: 'preset-legacy', name: '旧页面', version: '1.0.0', author: '测试者',
        items: [{ id: 'legacy-page', name: '旧页面', target: { tableName: '广场表', fields: ['内容'] }, entry: { html: 'pages/page.html', css: 'pages/page.css', mount: 'pages/page.mjs' }, assets: [] }],
    }));
    assert.equal(legacy.items[0].entry.mount, 'pages/page.mjs', 'v2 预设仍保留旧页面入口');
    assert.equal(matcher.listMatchingPageItems([legacy], { tableName: '广场表', headers: ['内容'] }).length, 1, '旧页面预设进入页面候选');
    assert.equal(matcher.listMatchingPopupDisplays([legacy], { tableName: '广场表', headers: ['内容'] }).length, 0, '旧页面预设不得伪装为弹窗候选');

    const popupOnly = importContentPreset(bundle(3, 2, {
        id: 'preset-popup', name: '正文卡片', version: '1.0.0', author: '测试者', items: [],
        displays: [
            { id: 'post-card', name: '帖子卡片', kind: 'inline', targets: [{ tableName: '广场表', fields: ['内容'] }], entry: { html: 'popups/card.html', css: 'popups/card.css', mount: 'popups/card.mjs' }, assets: [] },
            { id: 'post-detail', name: '帖子详情卡片', kind: 'inline', targets: [{ tableName: '广场表', fields: ['内容'] }], entry: { html: 'popups/card.html', css: 'popups/card.css', mount: 'popups/card.mjs' }, assets: [] },
        ],
    }));
    assert.equal(popupOnly.items.length, 0, '仅正文展示预设无需虚假页面 mount');
    assert.equal(matcher.listMatchingPageItems([popupOnly], { tableName: '广场表', headers: ['内容'] }).length, 0);
    assert.equal(matcher.listMatchingPopupDisplays([popupOnly], { tableName: '广场表', headers: ['内容'] }).length, 2, '预设可提供多个正文展示样式');
    const restored = importContentPreset(exportContentPreset(popupOnly));
    assert.deepEqual(restored.displays, popupOnly.displays, '展示-only 声明必须可打包并回读');

    const rawData = { sheet_a: { name: '广场表', content: [['内容']] } };
    const pageBinding = { sheetKey: 'sheet_a', presetId: legacy.id, itemId: 'legacy-page' };
    const popupBinding = { sheetKey: 'sheet_a', presetId: popupOnly.id };
    const [table] = buildContentPresetCatalog(rawData, [legacy, popupOnly], new Map([[pageBinding.sheetKey, pageBinding]]), new Map([[popupBinding.sheetKey, popupBinding]]));
    assert.deepEqual(table.pageCandidates.map(entry => entry.itemId), ['legacy-page']);
    assert.deepEqual(table.popupCandidates.map(entry => entry.presetId), ['preset-popup'], '弹窗应用只能选择一份美化来源');
    assert.deepEqual(table.popupCandidates[0].displays.map(entry => entry.displayId), ['post-card', 'post-detail'], '具体样式必须留给弹幕设置选择');
    assert.deepEqual(table.pageActive, pageBinding);
    assert.deepEqual(table.popupActive, popupBinding);

    const { __test__createContentPresetWorkshopService } = await import(url('modules/content-presets/workshop-service.js'));
    const indexState = await import(url('modules/content-presets/index-state.js'));
    indexState.commitContentPresetIndex({ status: 'ready', metadata: new Map(), pageByTable: new Map(), popupByTable: new Map() });
    const calls = [];
    const service = __test__createContentPresetWorkshopService({
        isContentPresetFullPageRuntimeEnabled: () => true,
enqueueContentPresetMutation: async (operation, buildPatch, afterCommit) => {
            const current = indexState.getContentPresetIndexSnapshot();
            const result = await operation();
            const patch = buildPatch(result, current);
            indexState.commitContentPresetIndex(patch.indexPatch);
            await afterCommit?.(result, current, patch);
            return result;
        },
        getContentPresetIndexSnapshot: indexState.getContentPresetIndexSnapshot,
        subscribeContentPresetIndex: indexState.subscribeContentPresetIndex,
        listPresetRecords: async () => [legacy, popupOnly],
        buildContentPresetCatalog,
        setPageActiveBinding: async (...args) => ({ sheetKey: args[0], presetId: args[1], itemId: args[2] }),
        setPopupActiveBinding: async (...args) => ({ sheetKey: args[0], presetId: args[1] }),
        clearPageActiveBinding: async () => true,
        clearPopupActiveBinding: async () => true,
        contentPresetScrollRegistry: { clearByBinding(binding) { calls.push(binding); }, clearByPreset() {} },
        invalidateContentPresetInstances: () => {},
        convergeCurrentContentPresetRoute: async () => {},
    }, { getTableData: () => rawData });
    await service.setPageActive('sheet_a', legacy.id, 'legacy-page');
    await service.setPopupActive('sheet_a', popupOnly.id);
    const applicationView = await service.getViewModel();
    assert.equal(applicationView.tables[0].pageActive.itemId, 'legacy-page', '页面应用与弹窗应用必须独立保存');
    assert.equal(applicationView.tables[0].popupActive.presetId, popupOnly.id, '展示-only 应用不得要求虚假页面');
    await service.clearPopupActive('sheet_a');
    assert.equal((await service.getViewModel()).tables[0].pageActive.itemId, 'legacy-page', '撤销弹窗应用不得覆盖页面应用');

    console.log('[content-presets-dual-applications-check] 检查通过');
}
main().catch(error => { console.error('[content-presets-dual-applications-check] 检查失败'); console.error(error); process.exitCode = 1; });
