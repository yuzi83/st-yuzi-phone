const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const load = file => import(`${pathToFileURL(path.resolve(file)).href}?t=${Date.now()}-${Math.random()}`);

const combo = {
    displayId: 'combo',
    display: {
        id: 'combo', kind: 'popup',
        targets: [
            { tableName: '人物表', fields: ['ID'] },
            { tableName: '任务表', fields: ['ID'] },
        ],
    },
};
function table(sheetKey, tableName, presetId = 'preset-combo') {
    return {
        sheetKey, tableName, headers: ['ID'], pageCandidates: [],
        popupCandidates: [{ presetId, preset: { id: presetId }, displays: [combo] }],
    };
}

async function makeService(initialBindings = new Map()) {
    const { __test__createContentPresetWorkshopService } = await load('modules/content-presets/workshop-service.js');
    let snapshot = { status: 'ready', error: null, metadata: new Map(), pageByTable: new Map(), popupByTable: new Map(initialBindings), activeByTable: new Map(), revision: 0 };
    const writes = [];
    const service = __test__createContentPresetWorkshopService({
        isContentPresetFullPageRuntimeEnabled: () => true,
        getContentPresetIndexSnapshot: () => snapshot,
        subscribeContentPresetIndex: () => () => {},
        listPresetRecords: async () => [],
        buildContentPresetCatalog: () => [table('sheet_people', '人物表'), table('sheet_tasks', '任务表')],
        setPopupActiveBindings: async bindings => { writes.push(bindings); return bindings.map(({ sheetKey, presetId }) => ({ sheetKey, presetId })); },
        enqueueContentPresetMutation: async (operation, buildPatch, afterCommit) => {
            const current = snapshot;
            const result = await operation();
            const patch = buildPatch(result, current);
            snapshot = { ...current, ...patch.indexPatch, activeByTable: patch.indexPatch.activeByTable || current.activeByTable, revision: current.revision + 1 };
            await afterCommit?.(result, current, patch);
            return result;
        },
        invalidateContentPresetInstances: async () => {},
        convergeCurrentContentPresetRoute: async () => {},
    }, { getTableData: () => ({}) });
    return { service, writes: () => writes, snapshot: () => snapshot };
}

async function main() {
    const fresh = await makeService();
    await fresh.service.setPopupActive('sheet_people', 'preset-combo');
    assert.deepEqual(fresh.writes().map(batch => batch.map(({ sheetKey, presetId }) => ({ sheetKey, presetId }))), [[
        { sheetKey: 'sheet_people', presetId: 'preset-combo' },
        { sheetKey: 'sheet_tasks', presetId: 'preset-combo' },
    ]], '组合应用必须在一次仓储操作中同时绑定所有参与表');
    assert.deepEqual([...fresh.snapshot().popupByTable.keys()].sort(), ['sheet_people', 'sheet_tasks']);

    const conflicted = await makeService(new Map([
        ['sheet_tasks', { sheetKey: 'sheet_tasks', presetId: 'other-preset', displays: [] }],
    ]));
    await assert.rejects(
        () => conflicted.service.setPopupActive('sheet_people', 'preset-combo'),
        error => error?.code === 'CONTENT_PRESET_POPUP_REPLACE_CONFIRMATION_REQUIRED'
            && error?.conflicts?.[0]?.sheetKey === 'sheet_tasks',
        '组合抢占已有来源时必须先要求确认',
    );
    assert.equal(conflicted.writes().length, 0, '确认前不得写入任何半组合绑定');
    await conflicted.service.setPopupActive('sheet_people', 'preset-combo', { replace: true });
    assert.equal(conflicted.writes().length, 1, '确认后组合必须仍然一次性提交');
    console.log('[content-presets-popup-combination-application] 通过');
}
main().catch(error => {
    console.error('[content-presets-popup-combination-application] 失败');
    console.error(error);
    process.exitCode = 1;
});
