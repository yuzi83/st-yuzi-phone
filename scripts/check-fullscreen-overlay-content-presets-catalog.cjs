const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const load = file => import(`${pathToFileURL(path.resolve(file)).href}?t=${Date.now()}-${Math.random()}`);

const rawData = {
    sheet_profile: { name: '人物表', content: [['角色ID', '姓名'], ['a', 'Alice']] },
    sheet_task: { name: '任务表', content: [['任务ID', '标题'], ['t', '找猫']] },
};

async function main() {
    const { buildActiveContentPresetDisplayDirectory } = await load('modules/content-presets/display-directory.js');
    const { buildOverlaySourceCatalog } = await load('modules/fullscreen-overlay/source-catalog.js');
    const single = {
        id: 'single', name: '人物正文', kind: 'inline',
        targets: [{ tableName: '人物表', fields: ['角色ID', '姓名'] }], entry: { mount: 'x.mjs' }, assets: [], activatable: true,
    };
    const combo = {
        id: 'combo', name: '人物任务总览', kind: 'popup',
        targets: [
            { tableName: '人物表', fields: ['角色ID', '姓名'] },
            { tableName: '任务表', fields: ['任务ID', '标题'] },
        ], entry: { mount: 'y.mjs' }, assets: [], activatable: true,
    };
    const directory = buildActiveContentPresetDisplayDirectory(rawData, new Map([
        ['sheet_profile', { sheetKey: 'sheet_profile', presetId: 'preset', displays: [single, combo] }],
        ['sheet_task', { sheetKey: 'sheet_task', presetId: 'preset', displays: [combo] }],
    ]));
    const registry = {
        get(id) {
            if (id === 'content-preset-display') return {
                id, modelId: 'content-preset-display', modelIds: [], defaultEnabled: true,
                matches: () => true, getSignature: () => 'custom', readEvents: () => [{ custom: true }],
            };
            return null;
        },
        match(context) {
            if (context.sheetKey === 'sheet_profile' || context.sheetKey === 'sheet_task') return {
                id: 'generic-table', modelId: 'table-popup', modelIds: ['table-popup', 'inline-table-popup'],
                defaultEnabled: true, matches: () => true, getSignature: () => 'generic', readEvents: () => [{ cells: [] }],
            };
            return null;
        },
    };
    const singleModel = directory.singleBySheetKey.get('sheet_profile')[0].modelId;
    const comboModel = directory.virtualSources[0].modelId;
    const catalog = buildOverlaySourceCatalog(rawData, {
        sourceModelBySheetKey: { sheet_profile: singleModel, [comboModel]: comboModel },
    }, registry, { contentPresetDisplayDirectory: directory });

    const profile = catalog.find(entry => entry.sheetKey === 'sheet_profile');
    assert.ok(profile.modelIds.includes(singleModel), '单表自定义展示必须追加到原表模型选项');
    assert.equal(profile.modelId, singleModel, '用户选择的单表自定义样式必须保留');
    assert.equal(profile.customDisplay.modelId, singleModel);
    assert.equal(profile.modelLabels[singleModel], '人物正文', '下拉框必须拥有作者可见的自定义样式名称');

    const combined = catalog.find(entry => entry.sheetKey === comboModel);
    assert.ok(combined, '有效组合展示必须作为独立来源进入设置目录');
    assert.equal(combined.sourceId, 'content-preset-display');
    assert.equal(combined.modelId, comboModel);
    assert.deepEqual(combined.targetSheetKeys, ['sheet_profile', 'sheet_task']);
    assert.equal(combined.customDisplay.modelId, comboModel);
    assert.equal(combined.modelLabels[comboModel], '人物任务总览');
    console.log('[fullscreen-overlay-content-presets-catalog] 通过');
}
main().catch(error => {
    console.error('[fullscreen-overlay-content-presets-catalog] 失败');
    console.error(error);
    process.exitCode = 1;
});
