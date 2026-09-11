const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const load = file => import(`${pathToFileURL(path.resolve(file)).href}?t=${Date.now()}-${Math.random()}`);

async function main() {
    const { __test__createContentPresetWorkshopService } = await load('modules/content-presets/workshop-service.js');
    let snapshot = {
        status: 'ready', error: null, metadata: new Map(),
        pageByTable: new Map(), popupByTable: new Map(), activeByTable: new Map(), revision: 0,
    };
    const calls = [];
    const service = __test__createContentPresetWorkshopService({
        isContentPresetFullPageRuntimeEnabled: () => true,
        getContentPresetIndexSnapshot: () => snapshot,
        subscribeContentPresetIndex: () => () => {},
        listPresetRecords: async () => [],
        buildContentPresetCatalog: () => [{
            sheetKey: 'sheet-square',
            tableName: '广场表',
            pageCandidates: [],
            popupCandidates: [{
                presetId: 'preset-square',
                preset: { id: 'preset-square', name: '广场展示' },
                displays: [
                    { id: 'inline-card', name: '正文卡片', kind: 'inline' },
                    { id: 'floating-card', name: '浮窗', kind: 'popup' },
                ],
            }],
        }],
        setPopupActiveBinding: async (...args) => {
            calls.push(args);
            return { sheetKey: args[0], presetId: args[1] };
        },
        enqueueContentPresetMutation: async (operation, buildPatch, afterCommit) => {
            const current = snapshot;
            const result = await operation();
            const patch = buildPatch(result, current);
            snapshot = {
                ...current,
                ...patch.indexPatch,
                activeByTable: patch.indexPatch.activeByTable || patch.indexPatch.pageByTable || current.activeByTable,
                revision: current.revision + 1,
            };
            await afterCommit?.(result, current, patch);
            return result;
        },
        invalidateContentPresetInstances: async () => {},
        convergeCurrentContentPresetRoute: async () => {},
    }, { getTableData: () => ({}) });

    await service.setPopupActive('sheet-square', 'preset-square');

    assert.deepEqual(calls, [['sheet-square', 'preset-square']], '弹窗应用应只绑定预设来源，具体展示样式留给弹幕设置');
    assert.deepEqual(
        snapshot.popupByTable.get('sheet-square'),
        {
            sheetKey: 'sheet-square',
            presetId: 'preset-square',
            displays: [
                { id: 'inline-card', name: '正文卡片', kind: 'inline' },
                { id: 'floating-card', name: '浮窗', kind: 'popup' },
            ],
        },
        '持久化绑定不固定 displayId，但内存目录必须保留来源的可用样式',
    );
    console.log('[content-presets-popup-source-binding] 通过');
}

main().catch(error => {
    console.error('[content-presets-popup-source-binding] 失败');
    console.error(error);
    process.exitCode = 1;
});
