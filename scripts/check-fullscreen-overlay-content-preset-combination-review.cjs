const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = process.cwd();

function moduleUrl(relativePath) {
    return `${pathToFileURL(path.join(ROOT, relativePath)).href}?combination-review=${Date.now()}-${Math.random()}`;
}

async function flushAsync(turns = 12) {
    for (let index = 0; index < turns; index += 1) {
        await Promise.resolve();
    }
}

function createSnapshot() {
    return {
        sheet_alpha: {
            name: '甲表',
            header: ['id', '内容'],
            content: [['alpha-1', '甲表内容']],
        },
        sheet_beta: {
            name: '乙表',
            header: ['id', '内容'],
            content: [['beta-1', '乙表内容']],
        },
    };
}

function createReviewMetadata(sessionKey = 'floor-1') {
    return {
        reviewResult: {
            chatKey: 'chat-alpha',
            sessionKey,
        },
        changedSheetKeys: ['sheet_alpha', 'sheet_beta'],
        changedRowsBySheetKey: {
            sheet_alpha: { rowIndexes: [0], rowIds: ['alpha-1'] },
            sheet_beta: { rowIndexes: [0], rowIds: ['beta-1'] },
        },
    };
}

function createEntry({
    sheetKey,
    sourceId,
    targetSheetKeys,
    label,
    customDisplay = null,
}) {
    return {
        sheetKey,
        sourceId,
        tableName: label,
        enabled: true,
        supported: true,
        modelId: 'custom-preset-renderer',
        targetSheetKeys,
        customDisplay,
    };
}

async function createReviewRuntime(options) {
    const replacements = [];
    const adapters = new Map();
    let emitStableSnapshot = null;
    const snapshot = createSnapshot();

    function currentCatalog() {
        return options.catalog();
    }

    for (const entry of options.allEntries) {
        adapters.set(entry.sourceId, {
            id: entry.sourceId,
            modelId: 'custom-preset-renderer',
            getSignature(context) {
                return JSON.stringify(
                    (entry.targetSheetKeys || [entry.sheetKey])
                        .map(sheetKey => context.snapshot[sheetKey]?.content || []),
                );
            },
            readEvents() {
                return [{ text: `展示：${entry.tableName}` }];
            },
        });
    }

    const { createFullscreenOverlayRuntime } = await import(moduleUrl(
        'modules/fullscreen-overlay/runtime.js',
    ));
    const runtime = createFullscreenOverlayRuntime({
        getSettings: () => ({ enabled: true, models: {} }),
        normalizeSettings: value => value,
        readSnapshot: () => snapshot,
        buildSourceCatalog: () => currentCatalog(),
        registry: {
            get(sourceId) {
                return adapters.get(sourceId) || null;
            },
            list() {
                return [];
            },
        },
        createLayerRuntime: () => ({
            clear() {},
            dispose() {},
            isMounted: () => true,
            isDisposed: () => false,
            getState: () => ({ mounted: true, disposed: false }),
        }),
        createRendererRegistry: () => new Map([[
            'custom-preset-renderer',
            {
                clear() {},
                dispose() {},
                refreshSettings() {},
                pause() {},
                resume() {},
            },
        ]]),
        createScheduler: () => ({
            async replace(batches) {
                replacements.push(batches);
                return true;
            },
            clear() {},
            dispose() {},
            getState: () => ({}),
        }),
        createCoordinator: ({ onStableSnapshot }) => {
            emitStableSnapshot = onStableSnapshot;
            return {
                start: () => true,
                suspendForChatChange() {},
                async resumeWithBaseline() {
                    return true;
                },
                stop() {},
                getState: () => ({}),
            };
        },
        logger: { warn() {} },
    });
    runtime.start('combination-review-contract');
    await flushAsync();
    replacements.length = 0;

    return {
        replacements,
        runtime,
        async review(metadata = createReviewMetadata()) {
            const accepted = await emitStableSnapshot(snapshot, metadata);
            await flushAsync();
            return accepted;
        },
    };
}

async function testCombinationSchedulesOnceWhenBothTargetsChange() {
    const combination = createEntry({
        sheetKey: 'content-preset:weekly-summary',
        sourceId: 'content-preset:weekly-summary',
        targetSheetKeys: ['sheet_alpha', 'sheet_beta'],
        label: '甲乙组合弹窗',
        customDisplay: { display: { kind: 'popup' } },
    });
    const harness = await createReviewRuntime({
        allEntries: [combination],
        catalog: () => [combination],
    });

    try {
        assert.equal(await harness.review(), true);
        assert.equal(
            harness.replacements.length,
            1,
            '同一次审核同时变化两个参与表时，组合展示只能调度一次',
        );
        assert.deepEqual(
            harness.replacements[0].map(batch => batch.sheetKey),
            ['content-preset:weekly-summary'],
        );
    } finally {
        harness.runtime.stop('test-cleanup');
    }
}

async function testSingleAndCombinationEachScheduleOnce() {
    const single = createEntry({
        sheetKey: 'sheet_alpha',
        sourceId: 'content-preset:alpha',
        targetSheetKeys: ['sheet_alpha'],
        label: '甲表单表弹窗',
        customDisplay: { display: { kind: 'popup' } },
    });
    const combination = createEntry({
        sheetKey: 'content-preset:weekly-summary',
        sourceId: 'content-preset:weekly-summary',
        targetSheetKeys: ['sheet_alpha', 'sheet_beta'],
        label: '甲乙组合弹窗',
        customDisplay: { display: { kind: 'popup' } },
    });
    const harness = await createReviewRuntime({
        allEntries: [single, combination],
        catalog: () => [single, combination],
    });

    try {
        assert.equal(await harness.review(), true);
        assert.equal(harness.replacements.length, 1);
        assert.deepEqual(
            harness.replacements[0].map(batch => batch.sheetKey).sort(),
            ['content-preset:weekly-summary', 'sheet_alpha'],
            '同一次审核中，单表展示和组合展示应各自调度一次',
        );
    } finally {
        harness.runtime.stop('test-cleanup');
    }
}

async function testCombinationStopsAfterSourceReplacementOrRevocation() {
    const combination = createEntry({
        sheetKey: 'content-preset:weekly-summary',
        sourceId: 'content-preset:weekly-summary',
        targetSheetKeys: ['sheet_alpha', 'sheet_beta'],
        label: '甲乙组合弹窗',
        customDisplay: { display: { kind: 'popup' } },
    });
    const replacement = createEntry({
        sheetKey: 'sheet_beta',
        sourceId: 'content-preset:beta-replacement',
        targetSheetKeys: ['sheet_beta'],
        label: '乙表替换后的单表弹窗',
        customDisplay: { display: { kind: 'popup' } },
    });
    let activeCatalog = [combination];
    const harness = await createReviewRuntime({
        allEntries: [combination, replacement],
        catalog: () => activeCatalog,
    });

    try {
        activeCatalog = [replacement];
        assert.equal(await harness.review(createReviewMetadata('floor-replaced')), true);
        assert.deepEqual(
            harness.replacements[0].map(batch => batch.sheetKey),
            ['sheet_beta'],
            '任一参与表换用其他来源后，只能调度替换来源，旧组合展示不得再被调度',
        );

        activeCatalog = [];
        assert.equal(await harness.review(createReviewMetadata('floor-revoked')), true);
        assert.equal(
            harness.replacements.length,
            1,
            '任一参与表撤销弹窗应用后，组合展示不得再被调度',
        );
    } finally {
        harness.runtime.stop('test-cleanup');
    }
}

async function main() {
    await testCombinationSchedulesOnceWhenBothTargetsChange();
    await testSingleAndCombinationEachScheduleOnce();
    await testCombinationStopsAfterSourceReplacementOrRevocation();
    console.log('fullscreen-overlay-content-preset-combination-review=0');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
