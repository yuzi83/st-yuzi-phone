const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const load = file => import(`${pathToFileURL(path.resolve(file)).href}?t=${Date.now()}-${Math.random()}`);

async function main() {
    const { createContentPresetDisplaySourceAdapter } = await load('modules/fullscreen-overlay/sources/content-preset-display.js');
    const adapter = createContentPresetDisplaySourceAdapter();
    const context = {
        sheetKey: 'content-preset-display:preset:combo',
        sourceId: 'content-preset-display',
        sourceKind: 'content-preset-display',
        rawData: {
            sheet_people: { name: '人物表', content: [['ID', '姓名'], ['p1', 'Alice']] },
            sheet_tasks: { name: '任务表', content: [['ID', '标题'], ['t1', '找猫']] },
        },
        customDisplay: {
            modelId: 'content-preset-display:preset:combo', presetId: 'preset', displayId: 'combo',
            display: { id: 'combo', kind: 'popup', name: '人物任务总览' },
            targetSheetKeys: ['sheet_people', 'sheet_tasks'],
        },
    };
    assert.equal(adapter.matches(context), true, '组合虚拟来源必须由自定义展示 Adapter 接管');
    const events = adapter.readEvents(context);
    assert.equal(events.length, 1, '组合展示一次调度只交付一个完整事件');
    assert.deepEqual(events[0].tables.map(table => table.sheetKey), ['sheet_people', 'sheet_tasks']);
    assert.deepEqual(events[0].tables[0].headers, ['ID', '姓名']);
    assert.equal(events[0].customDisplay, context.customDisplay);
    const before = adapter.getSignature(context);
    const changed = structuredClone(context);
    changed.rawData.sheet_tasks.content[1][1] = '找狗';
    assert.notEqual(adapter.getSignature(changed), before, '任一依赖表变化都必须改变组合签名');
    assert.equal(adapter.readEvents({ ...context, customDisplay: null }).length, 0, '缺少展示定义时不得产生伪事件');
    console.log('[fullscreen-overlay-content-preset-display-source] 通过');
}
main().catch(error => {
    console.error('[fullscreen-overlay-content-preset-display-source] 失败');
    console.error(error);
    process.exitCode = 1;
});