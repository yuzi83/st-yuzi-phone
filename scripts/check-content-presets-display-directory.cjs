const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const load = file => import(`${pathToFileURL(path.resolve(file)).href}?t=${Date.now()}-${Math.random()}`);

const rawData = {
    sheet_profile: { name: '人物表', content: [['角色ID', '姓名', '描述'], ['a', 'Alice', '勇者']] },
    sheet_task: { name: '任务表', content: [['任务ID', '标题', '状态'], ['t1', '找猫', '进行中']] },
};
const inline = {
    id: 'profile-card', name: '人物卡片', kind: 'inline',
    targets: [{ tableName: '人物表', fields: ['角色ID', '姓名', '描述'] }],
    entry: { mount: 'displays/profile.mjs' }, assets: [], activatable: true,
};
const combo = {
    id: 'profile-task', name: '人物任务总览', kind: 'popup',
    targets: [
        { tableName: '人物表', fields: ['角色ID', '姓名', '描述'] },
        { tableName: '任务表', fields: ['任务ID', '标题', '状态'] },
    ],
    entry: { mount: 'displays/combo.mjs' }, assets: [], activatable: true,
};
const barrage = {
    id: 'task-barrage', name: '任务弹幕', kind: 'barrage',
    targets: [{ tableName: '任务表', fields: ['任务ID', '标题', '状态'] }],
    entry: { mount: 'displays/barrage.mjs' }, assets: [], activatable: true,
};
function binding(sheetKey, presetId, displays) { return { sheetKey, presetId, displays }; }

async function main() {
    const {
        CONTENT_PRESET_DISPLAY_SOURCE_ID,
        buildActiveContentPresetDisplayDirectory,
        contentPresetDisplayModelId,
    } = await load('modules/content-presets/display-directory.js');

    const directory = buildActiveContentPresetDisplayDirectory(rawData, new Map([
        ['sheet_profile', binding('sheet_profile', 'preset-a', [inline, combo])],
        ['sheet_task', binding('sheet_task', 'preset-a', [combo, barrage])],
    ]));
    const inlineModel = contentPresetDisplayModelId('preset-a', 'profile-card');
    const comboModel = contentPresetDisplayModelId('preset-a', 'profile-task');
    const barrageModel = contentPresetDisplayModelId('preset-a', 'task-barrage');

    assert.equal(directory.singleBySheetKey.get('sheet_profile').length, 1, '单表展示必须加入对应真实表的样式候选');
    assert.equal(directory.singleBySheetKey.get('sheet_profile')[0].modelId, inlineModel);
    assert.equal(directory.singleBySheetKey.get('sheet_task')[0].modelId, barrageModel);
    assert.equal(directory.virtualSources.length, 1, '多表展示必须作为独立来源而非在每张表重复播放');
    assert.equal(directory.virtualSources[0].sourceId, CONTENT_PRESET_DISPLAY_SOURCE_ID);
    assert.equal(directory.virtualSources[0].modelId, comboModel);
    assert.deepEqual(directory.virtualSources[0].targetSheetKeys, ['sheet_profile', 'sheet_task']);
    assert.equal(directory.byModelId.get(comboModel).display, combo, '目录必须保留作者 display 声明供 renderer 挂载');

    const invalid = buildActiveContentPresetDisplayDirectory(rawData, new Map([
        ['sheet_profile', binding('sheet_profile', 'preset-a', [inline, combo])],
        ['sheet_task', binding('sheet_task', 'preset-b', [combo, barrage])],
    ]));
    assert.equal(invalid.virtualSources.length, 0, '组合的任一参与表换来源后，组合必须立即退出设置目录');
    assert.equal(invalid.singleBySheetKey.get('sheet_profile').length, 1, '组合失效不应误伤该表仍有效的单表展示');

    console.log('[content-presets-display-directory] 通过');
}
main().catch(error => {
    console.error('[content-presets-display-directory] 失败');
    console.error(error);
    process.exitCode = 1;
});