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
    console.log('[fullscreen-overlay-review-row-scope] passed');
}

main().catch((error) => {
    console.error('[fullscreen-overlay-review-row-scope] failed:', error);
    process.exitCode = 1;
});
