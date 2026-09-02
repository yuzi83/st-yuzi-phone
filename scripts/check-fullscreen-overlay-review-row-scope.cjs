const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

async function importModule(relativePath) {
    return import(`${pathToFileURL(path.resolve(relativePath)).href}?t=${Date.now()}-${Math.random()}`);
}

async function flushMicrotasks(rounds = 8) {
    for (let index = 0; index < rounds; index += 1) {
        await Promise.resolve();
    }
}

async function main() {
    const { createFullscreenOverlayRuntime } = await importModule(
        'modules/fullscreen-overlay/runtime.js',
    );
    const { createGenericTableSourceAdapter } = await importModule(
        'modules/fullscreen-overlay/sources/generic-table.js',
    );

    const snapshot = {
        sheet_live: {
            name: '直播表',
            content: [
                ['剧情弹幕串', '推角弹幕串', '对线弹幕串'],
                ['第一行', '', ''],
                ['第二行', '', ''],
            ],
        },
    };
    const readContexts = [];
    const scheduledBatches = [];
    let onStableSnapshot = null;

    const adapter = {
        id: 'live-table',
        modelId: 'scrolling-barrage',
        getSignature(context) {
            return JSON.stringify(context.rows);
        },
        readEvents(context) {
            readContexts.push(context);
            return [{
                sourceId: 'live-table',
                sheetKey: context.sheetKey,
                text: '范围测试',
            }];
        },
    };
    const coordinator = {
        start: () => true,
        stop: () => true,
        suspendForChatChange: () => true,
        resumeWithBaseline: async () => true,
        getState: () => ({ started: true }),
    };
    const runtime = createFullscreenOverlayRuntime({
        getSettings: () => ({
            enabled: true,
            sourceEnabledBySheetKey: {
                sheet_live: true,
            },
            sourceModelBySheetKey: {},
            models: {
                'scrolling-barrage': {},
            },
        }),
        normalizeSettings: value => value,
        readSnapshot: async () => snapshot,
        registry: {
            get: sourceId => (sourceId === 'live-table' ? adapter : null),
        },
        buildSourceCatalog: () => [{
            sheetKey: 'sheet_live',
            tableName: '直播表',
            sourceId: 'live-table',
            modelId: 'scrolling-barrage',
            supported: true,
            enabled: true,
        }],
        createLayerRuntime: () => ({
            clear() {},
            dispose() {},
            getState: () => ({ mounted: true }),
        }),
        createRendererRegistry: () => new Map([
            ['scrolling-barrage', {
                refreshSettings() {},
                clear() {},
                dispose() {},
            }],
        ]),
        createScheduler: () => ({
            replace(batches) {
                scheduledBatches.push(batches);
                return true;
            },
            clear() {},
            dispose() {},
            getState: () => ({ status: 'idle' }),
        }),
        createCoordinator(options) {
            onStableSnapshot = options.onStableSnapshot;
            return coordinator;
        },
    });

    assert.equal(runtime.start('review-row-scope-contract'), true);
    await flushMicrotasks();
    assert.equal(typeof onStableSnapshot, 'function');
    assert.equal(runtime.getState().suspended, false);

    const accepted = await onStableSnapshot(snapshot, {
        changedSheetKeys: ['sheet_live'],
        changedRowsBySheetKey: {
            sheet_live: {
                rowIndexes: [1, 1],
                rowIds: [' 202 ', '202'],
            },
        },
    });
    assert.equal(accepted, true);
    assert.deepEqual(
        readContexts.at(-1)?.rowSelection,
        {
            rowIndexes: [1],
            rowIds: ['202'],
        },
        '审核自动路径必须把当前表的变化行范围放入来源 context',
    );
    assert.equal(scheduledBatches.at(-1)?.length, 1);

    const invalidAutomaticScopes = [
        {
            label: '缺少 changedRowsBySheetKey',
            metadata: {
                changedSheetKeys: ['sheet_live'],
            },
        },
        {
            label: 'changedRowsBySheetKey 不是对象',
            metadata: {
                changedSheetKeys: ['sheet_live'],
                changedRowsBySheetKey: [],
            },
        },
        {
            label: 'changedRowsBySheetKey 漏掉变化表',
            metadata: {
                changedSheetKeys: ['sheet_live', 'sheet_other'],
                changedRowsBySheetKey: {
                    sheet_live: {
                        rowIndexes: [1],
                        rowIds: ['202'],
                    },
                },
            },
        },
    ];

    for (const testCase of invalidAutomaticScopes) {
        const readCountBefore = readContexts.length;
        const scheduledCountBefore = scheduledBatches.length;
        const result = await onStableSnapshot(snapshot, testCase.metadata);

        assert.equal(
            result,
            false,
            `审核自动路径${testCase.label}时必须失败关闭`,
        );
        assert.equal(
            readContexts.length,
            readCountBefore,
            `审核自动路径${testCase.label}时不得进入 Adapter，更不能退化为整表读取`,
        );
        assert.equal(
            scheduledBatches.length,
            scheduledCountBefore,
            `审核自动路径${testCase.label}时不得进入 Scheduler`,
        );
    }

    const manualResult = await runtime.testSelectedSources(snapshot);
    assert.equal(manualResult.ok, true);
    assert.equal(
        readContexts.at(-1)?.rowSelection,
        null,
        '手动测试没有行范围，必须继续读取整张已勾选来源表',
    );

    runtime.stop('review-row-scope-contract-complete');

    const popupSnapshot = {
        sheet_diary: {
            name: '小日记表',
            content: [
                ['日期', '正文'],
                ['2026-09-01', '旧行'],
                ['2026-09-02', '本楼更新行'],
            ],
        },
    };
    const popupBatches = [];
    let popupStableSnapshot = null;
    const popupAdapter = createGenericTableSourceAdapter();
    const popupRuntime = createFullscreenOverlayRuntime({
        getSettings: () => ({
            enabled: true,
            sourceEnabledBySheetKey: { sheet_diary: true },
            sourceModelBySheetKey: { sheet_diary: 'table-popup' },
            models: { 'table-popup': {} },
        }),
        normalizeSettings: value => value,
        readSnapshot: async () => popupSnapshot,
        registry: {
            get: sourceId => (sourceId === popupAdapter.id ? popupAdapter : null),
        },
        buildSourceCatalog: () => [{
            sheetKey: 'sheet_diary',
            tableName: '小日记表',
            sourceId: popupAdapter.id,
            modelId: 'table-popup',
            supported: true,
            enabled: true,
        }],
        createLayerRuntime: () => ({
            clear() {},
            dispose() {},
            getState: () => ({ mounted: true }),
        }),
        createRendererRegistry: () => new Map([
            ['table-popup', {
                refreshSettings() {},
                clear() {},
                dispose() {},
            }],
        ]),
        createScheduler: () => ({
            replace(batches) {
                popupBatches.push(batches);
                return true;
            },
            clear() {},
            dispose() {},
            getState: () => ({ status: 'idle' }),
        }),
        createCoordinator(options) {
            popupStableSnapshot = options.onStableSnapshot;
            return coordinator;
        },
    });

    popupRuntime.start('generic-popup-review-row-scope');
    await flushMicrotasks();
    assert.equal(await popupStableSnapshot(popupSnapshot, {
        changedSheetKeys: ['sheet_diary'],
        changedRowsBySheetKey: {
            sheet_diary: {
                rowIndexes: [1],
                rowIds: [],
            },
        },
    }), true);
    assert.equal(popupBatches.at(-1)?.[0]?.rendererId, 'table-popup');
    assert.deepEqual(
        popupBatches.at(-1)?.[0]?.items,
        [{
            sourceId: 'generic-table',
            sheetKey: 'sheet_diary',
            rowIndex: 1,
            cells: [
                { label: '日期', value: '2026-09-02' },
                { label: '正文', value: '本楼更新行' },
            ],
        }],
        '审核结果必须把普通表格本楼更新行直接组装成 table-popup 批次',
    );

    const popupManual = await popupRuntime.testSelectedSources(popupSnapshot);
    assert.equal(popupManual.ok, true);
    assert.deepEqual(
        popupBatches.at(-1)?.[0]?.items.map(item => item.rowIndex),
        [0],
        '普通表格弹窗手动测试每张表只读取第一条可展示行',
    );
    popupRuntime.stop('generic-popup-review-row-scope-complete');

    console.log('[fullscreen-overlay-review-row-scope] passed');
}

main().catch((error) => {
    console.error('[fullscreen-overlay-review-row-scope] failed:', error);
    process.exitCode = 1;
});
