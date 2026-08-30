const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = process.cwd();

function moduleUrl(relativePath) {
    return `${pathToFileURL(path.join(ROOT, relativePath)).href}?t=${Date.now()}-${Math.random()}`;
}

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

async function flushAsync() {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(resolve => setImmediate(resolve));
}

function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function createRuntimeHarness(createFullscreenOverlayRuntime, options = {}) {
    let rawData = {
        sheet_a: {
            name: '表 A',
            content: [['内容'], ['A-1']],
        },
        sheet_b: {
            name: '表 B',
            content: [['内容'], ['B-1']],
        },
        sheet_unsupported: {
            name: '未适配表',
            content: [['内容'], ['X-1']],
        },
    };
    let settings = {
        enabled: false,
        sourceEnabledBySheetKey: {
            sheet_a: true,
            sheet_b: true,
        },
        sourceOrder: ['sheet_b', 'sheet_a', 'sheet_unsupported'],
        sourceModelBySheetKey: {},
        models: {
            barrage: { marker: 'current-model-settings' },
        },
    };

    const calls = [];
    let coordinatorCallbacks = null;
    let coordinatorStarted = false;
    let coordinatorSuspended = false;
    let coordinatorInvalidationCount = 0;
    let schedulerReplaceBehavior = () => true;
    const sourceSignatures = {
        sheet_a: () => rawData.sheet_a.content[1][0],
        sheet_b: () => rawData.sheet_b.content[1][0],
    };
    const sourceEventReaders = {
        sheet_a: () => [{ text: sourceSignatures.sheet_a() }],
        sheet_b: () => [{ text: sourceSignatures.sheet_b() }],
    };
    const adapters = new Map([
        ['source-a', {
            id: 'source-a',
            modelId: 'barrage',
            getSignature: () => sourceSignatures.sheet_a(),
            readEvents: (...args) => sourceEventReaders.sheet_a(...args),
        }],
        ['source-b', {
            id: 'source-b',
            modelId: 'barrage',
            getSignature: () => sourceSignatures.sheet_b(),
            readEvents: (...args) => sourceEventReaders.sheet_b(...args),
        }],
    ]);

    const coordinator = {
        start() {
            calls.push(['coordinator.start']);
            const accepted = typeof options.coordinatorStart === 'function'
                ? options.coordinatorStart()
                : true;
            coordinatorStarted = accepted === true;
            return coordinatorStarted;
        },
        stop() {
            coordinatorStarted = false;
            calls.push(['coordinator.stop']);
        },
        suspendForChatChange(chatKey) {
            coordinatorSuspended = true;
            calls.push(['coordinator.suspend', chatKey]);
            return coordinatorStarted;
        },
        async resumeWithBaseline(snapshot) {
            coordinatorSuspended = false;
            calls.push(['coordinator.resume', snapshot]);
            return coordinatorStarted;
        },
        invalidateBaseline() {
            coordinatorInvalidationCount += 1;
            calls.push(['coordinator.invalidate']);
            return coordinatorStarted;
        },
        getState() {
            return {
                started: coordinatorStarted,
                suspended: coordinatorSuspended,
            };
        },
    };
    const scheduler = {
        replace(batches) {
            calls.push(['scheduler.replace', batches]);
            return schedulerReplaceBehavior(batches);
        },
        clear() {
            calls.push(['scheduler.clear']);
        },
        dispose() {
            calls.push(['scheduler.dispose']);
        },
        getState() {
            return { disposed: false };
        },
    };
    const layerRuntime = {
        mount() {
            calls.push(['layer.mount']);
            return {};
        },
        clear() {
            calls.push(['layer.clear']);
        },
        dispose() {
            calls.push(['layer.dispose']);
        },
        getState() {
            return { mounted: true };
        },
    };

    const runtime = createFullscreenOverlayRuntime({
        settingKey: 'fullscreenOverlay',
        normalizeSettings(value) {
            return {
                enabled: value?.enabled === true,
                sourceEnabledBySheetKey: { ...(value?.sourceEnabledBySheetKey || {}) },
                sourceOrder: [...(value?.sourceOrder || [])],
                sourceModelBySheetKey: { ...(value?.sourceModelBySheetKey || {}) },
                models: { ...(value?.models || {}) },
            };
        },
        getSettings: () => ({ fullscreenOverlay: settings }),
        readSnapshot: async () => {
            calls.push(['snapshot.read']);
            return typeof options.readSnapshot === 'function'
                ? options.readSnapshot(rawData)
                : rawData;
        },
        getSnapshotSignature: snapshot => JSON.stringify(snapshot),
        registry: {
            get: sourceId => adapters.get(sourceId) || null,
        },
        buildSourceCatalog(_snapshot, currentSettings) {
            const ordered = currentSettings.sourceOrder;
            return ordered.map((sheetKey) => {
                const sourceId = sheetKey === 'sheet_a'
                    ? 'source-a'
                    : (sheetKey === 'sheet_b' ? 'source-b' : '');
                return {
                    sheetKey,
                    tableName: rawData[sheetKey]?.name || '',
                    sourceId,
                    modelId: sourceId ? 'barrage' : '',
                    supported: Boolean(sourceId),
                    enabled: Boolean(sourceId && currentSettings.sourceEnabledBySheetKey[sheetKey]),
                };
            });
        },
        createLayerRuntime: () => layerRuntime,
        createRendererRegistry: options.createRendererRegistry
            || (() => new Map([['barrage', { id: 'renderer' }]])),
        createScheduler: options.createScheduler
            || (() => scheduler),
        createCoordinator(callbacks) {
            coordinatorCallbacks = callbacks;
            return coordinator;
        },
        logger: {
            debug() {},
            warn() {},
        },
        setTimeout: options.setTimeout,
        clearTimeout: options.clearTimeout,
    });

    return {
        runtime,
        calls,
        getSettings: () => settings,
        setSettings(next) {
            settings = next;
        },
        getRawData: () => rawData,
        setRawData(next) {
            rawData = next;
        },
        setSchedulerReplaceBehavior(callback) {
            schedulerReplaceBehavior = typeof callback === 'function'
                ? callback
                : () => true;
        },
        setSourceEventReader(sheetKey, callback) {
            assert.equal(
                typeof sourceEventReaders[sheetKey],
                'function',
                `unknown source event reader: ${sheetKey}`,
            );
            sourceEventReaders[sheetKey] = callback;
        },
        setSourceSignatureReader(sheetKey, callback) {
            assert.equal(
                typeof sourceSignatures[sheetKey],
                'function',
                `unknown source signature reader: ${sheetKey}`,
            );
            sourceSignatures[sheetKey] = callback;
        },
        getCoordinatorInvalidationCount() {
            return coordinatorInvalidationCount;
        },
        async publishStableSnapshot(snapshot = rawData) {
            assert(coordinatorCallbacks, 'coordinator callbacks should exist after start');
            return coordinatorCallbacks.onStableSnapshot(snapshot, {
                signature: JSON.stringify(snapshot),
            });
        },
    };
}

async function testReadEventsFailureRetriesWithoutConfusingLegalEmptyEvents() {
    const {
        createFullscreenOverlayRuntime,
    } = await import(moduleUrl('modules/fullscreen-overlay/runtime.js'));
    const h = createRuntimeHarness(createFullscreenOverlayRuntime);
    const seam = h.runtime;

    assert.equal(seam.start(), true);
    await flushAsync();
    h.setSettings({
        ...h.getSettings(),
        enabled: true,
    });
    seam.refreshSettings();
    await flushAsync();

    const failedSnapshot = structuredClone(h.getRawData());
    failedSnapshot.sheet_a.content[1][0] = 'A-read-events-retry';
    h.setRawData(failedSnapshot);
    const signaturesBeforeFailure = seam.getState().sourceSignatures;
    let readAttempts = 0;
    h.setSourceEventReader('sheet_a', () => {
        readAttempts += 1;
        if (readAttempts === 1) {
            throw new Error('模拟 readEvents 瞬时失败');
        }
        return [{ text: 'A-read-events-retry' }];
    });

    assert.equal(
        await h.publishStableSnapshot(),
        false,
        '已启用且已变化来源读取失败时，稳定快照不得被接受',
    );
    assert.deepEqual(
        seam.getState().sourceSignatures,
        signaturesBeforeFailure,
        'readEvents 失败不得提交任何来源签名',
    );

    assert.equal(
        await h.publishStableSnapshot(),
        true,
        '下一次有效通知必须能重试完全相同的快照',
    );
    assert.equal(readAttempts, 2);
    assert.deepEqual(
        h.calls
            .filter(call => call[0] === 'scheduler.replace' && call[1].length > 0)
            .at(-1)[1]
            .map(batch => batch.items[0].text),
        ['A-read-events-retry'],
        '恢复后必须重新生成首次失败来源的完整批次',
    );

    const emptySnapshot = structuredClone(h.getRawData());
    emptySnapshot.sheet_a.content[1][0] = 'A-empty-events-signature';
    h.setRawData(emptySnapshot);
    h.setSettings({
        ...h.getSettings(),
        sourceModelBySheetKey: {
            ...h.getSettings().sourceModelBySheetKey,
            sheet_a: 'missing-model-must-not-matter-for-empty-events',
        },
    });
    seam.refreshSettings();
    let emptyReadCount = 0;
    h.setSourceEventReader('sheet_a', () => {
        emptyReadCount += 1;
        return [];
    });

    assert.equal(
        await h.publishStableSnapshot(),
        true,
        '合法空事件表示内容从有到无，仍必须接受并提交新签名',
    );
    assert.equal(
        seam.getState().sourceSignatures.sheet_a,
        'A-empty-events-signature',
    );
    assert.equal(await h.publishStableSnapshot(), true);
    assert.equal(
        emptyReadCount,
        1,
        '合法空事件签名提交后，同一快照不得反复读取和重试',
    );
    seam.stop('test-complete');
}

async function testRendererFailureInvalidatesOnlyFailedSourceAndRetries() {
    const [
        { createFullscreenOverlayRuntime },
        { createFullscreenOverlayScheduler },
    ] = await Promise.all([
        import(moduleUrl('modules/fullscreen-overlay/runtime.js')),
        import(moduleUrl('modules/fullscreen-overlay/scheduler.js')),
    ]);
    const firstPlay = createDeferred();
    const playedBatches = [];
    let schedulerRuntime = null;
    const renderer = {
        play(batch) {
            playedBatches.push(batch);
            if (playedBatches.length === 1) return firstPlay.promise;
            return Promise.resolve();
        },
        clear() {},
        dispose() {},
    };
    const h = createRuntimeHarness(createFullscreenOverlayRuntime, {
        createRendererRegistry: () => new Map([['barrage', renderer]]),
        createScheduler: schedulerOptions => {
            schedulerRuntime = createFullscreenOverlayScheduler({
                ...schedulerOptions,
                documentRef: {
                    hidden: false,
                    addEventListener() {},
                    removeEventListener() {},
                },
                sourceGapMs: 0,
            });
            return schedulerRuntime;
        },
    });
    const seam = h.runtime;

    assert.equal(seam.start(), true);
    await flushAsync();
    h.setSettings({
        ...h.getSettings(),
        enabled: true,
    });
    seam.refreshSettings();
    await flushAsync();

    const failedSnapshot = structuredClone(h.getRawData());
    failedSnapshot.sheet_a.content[1][0] = 'A-renderer-retry';
    h.setRawData(failedSnapshot);

    assert.equal(
        await h.publishStableSnapshot(),
        true,
        '队列接收不得等待整批视觉播放完成',
    );
    await flushAsync();
    assert.equal(playedBatches.length, 1);
    assert.equal(
        seam.getState().sourceSignatures.sheet_a,
        'A-renderer-retry',
        '队列接收后可先确认来源签名，后续播放失败再精确撤销',
    );

    firstPlay.reject(new Error('模拟 renderer.play 首次失败'));
    await schedulerRuntime.whenIdle();
    await flushAsync();

    assert.equal(
        h.getCoordinatorInvalidationCount(),
        1,
        '非 Abort 播放失败必须使 coordinator 的整库签名基线失效',
    );
    assert.equal(
        Object.prototype.hasOwnProperty.call(
            seam.getState().sourceSignatures,
            'sheet_a',
        ),
        false,
        '播放失败只能撤销对应来源的确认签名',
    );
    assert.equal(
        seam.getState().sourceSignatures.sheet_b,
        'B-1',
        '其他已成功确认来源不得被播放失败连带撤销',
    );

    assert.equal(
        await h.publishStableSnapshot(),
        true,
        '下一次有效通知必须重试完全相同的失败来源快照',
    );
    await schedulerRuntime.whenIdle();
    assert.equal(playedBatches.length, 2);
    assert.deepEqual(
        playedBatches[1].items.map(item => item.text),
        ['A-renderer-retry'],
        '恢复后只能重试失败来源，不得重复播放其他已确认来源',
    );
    assert.equal(
        seam.getState().sourceSignatures.sheet_a,
        'A-renderer-retry',
    );
    seam.stop('test-complete');
}

async function testImmediateRendererFailureCannotCommitPendingConfirmation() {
    const [
        { createFullscreenOverlayRuntime },
        { createFullscreenOverlayScheduler },
    ] = await Promise.all([
        import(moduleUrl('modules/fullscreen-overlay/runtime.js')),
        import(moduleUrl('modules/fullscreen-overlay/scheduler.js')),
    ]);
    let playAttempts = 0;
    let schedulerRuntime = null;
    const renderer = {
        play() {
            playAttempts += 1;
            if (playAttempts === 1) {
                return Promise.reject(new Error('同步排队后的立即播放失败'));
            }
            return Promise.resolve();
        },
        clear() {},
        dispose() {},
    };
    const h = createRuntimeHarness(createFullscreenOverlayRuntime, {
        createRendererRegistry: () => new Map([['barrage', renderer]]),
        createScheduler: schedulerOptions => {
            schedulerRuntime = createFullscreenOverlayScheduler({
                ...schedulerOptions,
                documentRef: {
                    hidden: false,
                    addEventListener() {},
                    removeEventListener() {},
                },
                sourceGapMs: 0,
            });
            return schedulerRuntime;
        },
    });
    const seam = h.runtime;

    assert.equal(seam.start(), true);
    await flushAsync();
    h.setSettings({
        ...h.getSettings(),
        enabled: true,
    });
    seam.refreshSettings();
    await flushAsync();
    const failedSnapshot = structuredClone(h.getRawData());
    failedSnapshot.sheet_a.content[1][0] = 'A-immediate-renderer-retry';
    h.setRawData(failedSnapshot);

    assert.equal(
        await h.publishStableSnapshot(),
        false,
        'renderer 若在来源确认提交前已失败，本次稳定快照必须直接拒绝',
    );
    await schedulerRuntime.whenIdle();
    assert.equal(h.getCoordinatorInvalidationCount(), 1);
    assert.equal(
        Object.prototype.hasOwnProperty.call(
            seam.getState().sourceSignatures,
            'sheet_a',
        ),
        false,
        '立即失败的待确认批次不得留下来源签名',
    );

    assert.equal(await h.publishStableSnapshot(), true);
    await schedulerRuntime.whenIdle();
    assert.equal(playAttempts, 2);
    assert.equal(
        seam.getState().sourceSignatures.sheet_a,
        'A-immediate-renderer-retry',
    );
    seam.stop('test-complete');
}

async function testSignatureAndModelResolutionFailuresRemainRetryable() {
    const {
        createFullscreenOverlayRuntime,
    } = await import(moduleUrl('modules/fullscreen-overlay/runtime.js'));
    const h = createRuntimeHarness(createFullscreenOverlayRuntime);
    const seam = h.runtime;

    assert.equal(seam.start(), true);
    await flushAsync();
    h.setSettings({
        ...h.getSettings(),
        enabled: true,
    });
    seam.refreshSettings();
    await flushAsync();

    const signatureSnapshot = structuredClone(h.getRawData());
    signatureSnapshot.sheet_a.content[1][0] = 'A-signature-retry';
    h.setRawData(signatureSnapshot);
    const signaturesBeforeSignatureFailure = seam.getState().sourceSignatures;
    let signatureAttempts = 0;
    h.setSourceSignatureReader('sheet_a', () => {
        signatureAttempts += 1;
        if (signatureAttempts === 1) {
            throw new Error('模拟来源签名瞬时失败');
        }
        return h.getRawData().sheet_a.content[1][0];
    });
    h.setSourceEventReader('sheet_a', () => [{
        text: h.getRawData().sheet_a.content[1][0],
    }]);

    assert.equal(await h.publishStableSnapshot(), false);
    assert.deepEqual(
        seam.getState().sourceSignatures,
        signaturesBeforeSignatureFailure,
        '来源签名失败不得提交部分来源基线',
    );
    assert.equal(await h.publishStableSnapshot(), true);
    assert.equal(signatureAttempts, 2);
    assert.equal(
        seam.getState().sourceSignatures.sheet_a,
        'A-signature-retry',
    );

    const modelSnapshot = structuredClone(h.getRawData());
    modelSnapshot.sheet_a.content[1][0] = 'A-model-retry';
    h.setRawData(modelSnapshot);
    h.setSettings({
        ...h.getSettings(),
        sourceModelBySheetKey: {
            ...h.getSettings().sourceModelBySheetKey,
            sheet_a: 'missing-model',
        },
    });
    seam.refreshSettings();
    const signaturesBeforeModelFailure = seam.getState().sourceSignatures;

    assert.equal(
        await h.publishStableSnapshot(),
        false,
        '非空事件无法解析到可用模型时不得接受稳定快照',
    );
    assert.deepEqual(
        seam.getState().sourceSignatures,
        signaturesBeforeModelFailure,
        '模型解析失败不得提交来源签名',
    );

    h.setSettings({
        ...h.getSettings(),
        sourceModelBySheetKey: {
            ...h.getSettings().sourceModelBySheetKey,
            sheet_a: 'barrage',
        },
    });
    seam.refreshSettings();
    assert.equal(await h.publishStableSnapshot(), true);
    assert.deepEqual(
        h.calls
            .filter(call => call[0] === 'scheduler.replace' && call[1].length > 0)
            .at(-1)[1]
            .map(batch => batch.items[0].text),
        ['A-model-retry'],
        '模型恢复后必须重建同一来源快照的完整批次',
    );
    seam.stop('test-complete');
}

async function testStaleBatchFailureCannotRollbackNewSignatureOrGeneration() {
    const {
        createFullscreenOverlayRuntime,
    } = await import(moduleUrl('modules/fullscreen-overlay/runtime.js'));
    const scheduledBatches = [];
    let reportBatchFailure = null;
    const scheduler = {
        replace(batches) {
            scheduledBatches.push(batches);
            return true;
        },
        clear() {},
        dispose() {},
        getState() {
            return { disposed: false };
        },
    };
    const h = createRuntimeHarness(createFullscreenOverlayRuntime, {
        createScheduler(options) {
            reportBatchFailure = options.onBatchFailure;
            return scheduler;
        },
    });
    const seam = h.runtime;

    assert.equal(seam.start(), true);
    await flushAsync();
    h.setSettings({
        ...h.getSettings(),
        enabled: true,
    });
    seam.refreshSettings();
    await flushAsync();

    const oldSnapshot = structuredClone(h.getRawData());
    oldSnapshot.sheet_a.content[1][0] = 'A-old-confirmation';
    h.setRawData(oldSnapshot);
    assert.equal(await h.publishStableSnapshot(), true);
    const oldBatch = scheduledBatches.findLast(batches => batches.length > 0)[0];

    const newSnapshot = structuredClone(h.getRawData());
    newSnapshot.sheet_a.content[1][0] = 'A-new-confirmation';
    h.setRawData(newSnapshot);
    assert.equal(await h.publishStableSnapshot(), true);
    const newBatch = scheduledBatches.findLast(batches => batches.length > 0)[0];
    const invalidationsBeforeStaleFailure = h.getCoordinatorInvalidationCount();

    assert.equal(
        reportBatchFailure(
            new Error('旧签名批次晚到失败'),
            oldBatch,
            { phase: 'play' },
        ),
        false,
        '旧批次签名与当前来源签名不一致时必须忽略',
    );
    assert.equal(
        seam.getState().sourceSignatures.sheet_a,
        'A-new-confirmation',
    );
    assert.equal(
        h.getCoordinatorInvalidationCount(),
        invalidationsBeforeStaleFailure,
        '旧签名失败不得使新整库基线失效',
    );

    assert.equal(seam.suspendForChatChange('next-chat'), true);
    assert.equal(await seam.resumeAfterChatChange(h.getRawData()), true);
    const invalidationsBeforeOldGenerationFailure = h.getCoordinatorInvalidationCount();
    assert.equal(
        reportBatchFailure(
            new Error('旧 generation 批次晚到失败'),
            newBatch,
            { phase: 'play' },
        ),
        false,
        '聊天切换后的旧 generation 失败必须忽略',
    );
    assert.equal(
        seam.getState().sourceSignatures.sheet_a,
        'A-new-confirmation',
    );
    assert.equal(
        h.getCoordinatorInvalidationCount(),
        invalidationsBeforeOldGenerationFailure,
    );

    seam.stop('test-complete');
    assert.equal(
        reportBatchFailure(
            new Error('stop 后旧批次晚到失败'),
            newBatch,
            { phase: 'play' },
        ),
        false,
        'stop 后旧失败不得污染已销毁运行时',
    );
}

async function testRuntimeStableSnapshotAcknowledgementSemantics() {
    const {
        createFullscreenOverlayRuntime,
    } = await import(moduleUrl('modules/fullscreen-overlay/runtime.js'));
    const h = createRuntimeHarness(createFullscreenOverlayRuntime);
    const seam = h.runtime;

    assert.equal(seam.start(), true);
    await flushAsync();

    const disabledSnapshot = structuredClone(h.getRawData());
    disabledSnapshot.sheet_a.content[1][0] = 'A-disabled-consumed';
    h.setRawData(disabledSnapshot);
    const signaturesBeforeDisabledReject = seam.getState().sourceSignatures;
    h.setSchedulerReplaceBehavior(() => false);
    assert.equal(
        await h.publishStableSnapshot(),
        false,
        '主开关关闭时，清空待队列被明确拒绝必须向 coordinator 返回拒绝',
    );
    assert.deepEqual(
        seam.getState().sourceSignatures,
        signaturesBeforeDisabledReject,
        '主开关关闭时清队失败不得提前提交来源签名',
    );

    const unhandledRejections = [];
    const captureUnhandledRejection = reason => unhandledRejections.push(reason);
    process.on('unhandledRejection', captureUnhandledRejection);
    try {
        h.setSchedulerReplaceBehavior(() => Promise.reject(
            new Error('模拟关闭状态清队异步失败'),
        ));
        assert.equal(
            await h.publishStableSnapshot(),
            false,
            '主开关关闭时，清空待队列 Promise reject 必须向 coordinator 返回拒绝',
        );
        await flushAsync();
        assert.deepEqual(
            seam.getState().sourceSignatures,
            signaturesBeforeDisabledReject,
            '主开关关闭时清队异步失败不得提前提交来源签名',
        );
        assert.deepEqual(
            unhandledRejections,
            [],
            '关闭状态清队 Promise reject 必须被 runtime 吸收并记录，不能泄漏未处理拒绝',
        );
    } finally {
        process.off('unhandledRejection', captureUnhandledRejection);
    }

    h.setSchedulerReplaceBehavior(() => true);
    assert.equal(
        await h.publishStableSnapshot(),
        true,
        '主开关关闭时，正确更新来源基线后必须明确确认快照已消费',
    );
    assert.equal(
        seam.getState().sourceSignatures.sheet_a,
        'A-disabled-consumed',
        '主开关关闭仍必须推进运行时来源签名基线',
    );

    h.setSettings({
        ...h.getSettings(),
        enabled: true,
    });
    seam.refreshSettings();
    await flushAsync();
    const rejectedSnapshot = structuredClone(h.getRawData());
    rejectedSnapshot.sheet_a.content[1][0] = 'A-rejected-once';
    h.setRawData(rejectedSnapshot);
    const signaturesBeforeReject = seam.getState().sourceSignatures;

    h.setSchedulerReplaceBehavior(() => false);
    assert.equal(
        await h.publishStableSnapshot(),
        false,
        '调度器明确拒绝批次时 runtime 必须向 coordinator 返回拒绝',
    );
    assert.deepEqual(
        seam.getState().sourceSignatures,
        signaturesBeforeReject,
        '调度失败不得提前提交运行时来源签名',
    );

    h.setSchedulerReplaceBehavior(() => true);
    assert.equal(
        await h.publishStableSnapshot(),
        true,
        '调度恢复后必须能重新接收完全相同的稳定快照',
    );
    assert.deepEqual(
        h.calls
            .filter(call => call[0] === 'scheduler.replace' && call[1].length > 0)
            .at(-1)[1]
            .map(batch => batch.items[0].text),
        ['A-rejected-once'],
        '重试时必须保留首次调度失败的原始变更批次',
    );
    assert.equal(seam.getState().sourceSignatures.sheet_a, 'A-rejected-once');

    const thrownSnapshot = structuredClone(h.getRawData());
    thrownSnapshot.sheet_b.content[1][0] = 'B-thrown-once';
    h.setRawData(thrownSnapshot);
    const signaturesBeforeThrow = seam.getState().sourceSignatures;
    h.setSchedulerReplaceBehavior(() => {
        throw new Error('模拟调度器异常');
    });
    assert.equal(
        await h.publishStableSnapshot(),
        false,
        '调度器抛错时 runtime 必须返回拒绝而不是假确认',
    );
    assert.deepEqual(
        seam.getState().sourceSignatures,
        signaturesBeforeThrow,
        '调度异常不得提前提交运行时来源签名',
    );

    h.setSchedulerReplaceBehavior(() => true);
    assert.equal(await h.publishStableSnapshot(), true);
    assert.deepEqual(
        h.calls
            .filter(call => call[0] === 'scheduler.replace' && call[1].length > 0)
            .at(-1)[1]
            .map(batch => batch.items[0].text),
        ['B-thrown-once'],
        '调度异常后的同签名快照必须可在下一次有效通知中重试',
    );
}

async function testRuntimePublicSeamAndSourceOrchestration() {
    const {
        createFullscreenOverlayRuntime,
    } = await import(moduleUrl('modules/fullscreen-overlay/runtime.js'));
    assert.equal(typeof createFullscreenOverlayRuntime, 'function');

    const h = createRuntimeHarness(createFullscreenOverlayRuntime);
    const seam = h.runtime;
    for (const methodName of [
        'start',
        'stop',
        'suspendForChatChange',
        'resumeAfterChatChange',
        'refreshSettings',
        'testSelectedSources',
        'clear',
        'getState',
    ]) {
        assert.equal(typeof seam[methodName], 'function', `runtime seam 缺少 ${methodName}`);
    }

    assert.equal(seam.start('extension-enabled'), true);
    await flushAsync();
    assert.equal(seam.getState().started, true);
    assert.equal(seam.getState().suspended, false);
    assert.equal(seam.getState().disabled, true);
    assert.equal(seam.getState().coordinatorStatus, 'disabled');
    assert.equal(
        h.calls.some(call => call[0] === 'coordinator.start' || call[0] === 'snapshot.read'),
        false,
        '主开关关闭时 Runtime 启动不得启动 coordinator 或读取 baseline',
    );
    assert.equal(
        h.calls.filter(call => call[0] === 'scheduler.replace' && call[1].length > 0).length,
        0,
        '初始基线不得播放已有表格内容',
    );

    const disabledSnapshot = structuredClone(h.getRawData());
    disabledSnapshot.sheet_a.content[1][0] = 'A-disabled-change';
    h.setRawData(disabledSnapshot);
    await h.publishStableSnapshot();
    assert.equal(
        h.calls.filter(call => call[0] === 'scheduler.replace' && call[1].length > 0).length,
        0,
        '浮层主开关关闭时自动更新不得播放',
    );

    h.setSettings({
        ...h.getSettings(),
        enabled: true,
    });
    seam.refreshSettings();
    await flushAsync();
    assert(h.calls.some(call => call[0] === 'coordinator.resume'), 'false→true 必须建立一次基线');
    const changedSnapshot = structuredClone(h.getRawData());
    changedSnapshot.sheet_a.content[1][0] = 'A-2';
    changedSnapshot.sheet_b.content[1][0] = 'B-2';
    h.setRawData(changedSnapshot);
    await h.publishStableSnapshot();

    const automaticBatchCall = h.calls
        .filter(call => call[0] === 'scheduler.replace' && call[1].length > 0)
        .at(-1);
    assert.deepEqual(
        automaticBatchCall[1].map(batch => batch.sheetKey),
        ['sheet_b', 'sheet_a'],
        '自动批次必须只取 enabled+supported 来源，并遵循 sourceOrder',
    );
    assert.deepEqual(
        automaticBatchCall[1].map(batch => batch.items[0].text),
        ['B-2', 'A-2'],
    );

    await h.publishStableSnapshot();
    assert.equal(
        h.calls.filter(call => call[0] === 'scheduler.replace' && call[1].length > 0).length,
        1,
        '来源签名未变化时不得重复播放',
    );

    const signatureStateBeforeTest = seam.getState().sourceSignatures;
    seam.refreshSettings({
        ...h.getSettings(),
        enabled: false,
    });
    const testResult = await seam.testSelectedSources();
    assert.equal(testResult.ok, true, '测试必须能绕过主开关');
    assert.equal(testResult.sourceCount, 2);
    assert.deepEqual(
        h.calls.filter(call => call[0] === 'scheduler.replace' && call[1].length > 0).at(-1)[1]
            .map(batch => batch.sheetKey),
        ['sheet_b', 'sheet_a'],
        '测试仍必须尊重来源勾选与排序',
    );
    assert.deepEqual(
        seam.getState().sourceSignatures,
        signatureStateBeforeTest,
        '测试不得改写自动触发签名基线',
    );
}

async function testChatAndStopLifecycle() {
    const {
        createFullscreenOverlayRuntime,
    } = await import(moduleUrl('modules/fullscreen-overlay/runtime.js'));
    const h = createRuntimeHarness(createFullscreenOverlayRuntime);
    const seam = h.runtime;

    h.setSettings({
        ...h.getSettings(),
        enabled: true,
    });
    seam.start();
    await flushAsync();
    h.calls.length = 0;

    assert.equal(seam.suspendForChatChange('chat-b'), true);
    assert(
        h.calls.some(call => (
            call[0] === 'coordinator.suspend'
            && call[1] === 'chat-b'
        )),
        'Runtime 必须把 chatId 原样传给 coordinator',
    );
    assert(h.calls.some(call => call[0] === 'scheduler.replace' && call[1].length === 0));
    assert.equal(
        h.calls.some(call => call[0] === 'scheduler.clear' || call[0] === 'layer.clear'),
        false,
        '聊天切换只能清未发射队列，不得强删已显示内容',
    );

    h.calls.length = 0;
    assert.equal(await seam.resumeAfterChatChange(), true);
    assert(h.calls.some(call => call[0] === 'coordinator.resume'));
    assert.equal(
        h.calls.some(call => call[0] === 'scheduler.replace' && call[1].length > 0),
        false,
        '聊天恢复只能建立新基线',
    );

    seam.clear();
    assert(h.calls.some(call => call[0] === 'scheduler.clear'));
    assert(h.calls.some(call => call[0] === 'layer.clear'));

    h.calls.length = 0;
    assert.equal(seam.stop('extension-disabled'), true);
    assert(h.calls.some(call => call[0] === 'coordinator.stop'));
    assert(h.calls.some(call => call[0] === 'scheduler.dispose'));
    assert(h.calls.some(call => call[0] === 'layer.dispose'));
    assert.equal(seam.getState().started, false);
}

async function testEternalLoopKeepsCurrentCycleWhenUpdateHasNoEvents() {
    const {
        createFullscreenOverlayRuntime,
    } = await import(moduleUrl('modules/fullscreen-overlay/runtime.js'));
    const loopCalls = [];
    const renderer = {
        id: 'renderer',
        refreshSettings() {},
        stopLoop() {
            loopCalls.push('stop');
        },
    };
    const h = createRuntimeHarness(createFullscreenOverlayRuntime, {
        createRendererRegistry: () => new Map([['barrage', renderer]]),
    });
    h.setSettings({
        ...h.getSettings(),
        enabled: true,
        models: {
            barrage: { eternalEnabled: true },
        },
    });
    const seam = h.runtime;
    assert.equal(seam.start(), true);
    await flushAsync();

    const firstSnapshot = structuredClone(h.getRawData());
    firstSnapshot.sheet_a.content[1][0] = 'A-永恒首轮';
    h.setRawData(firstSnapshot);
    assert.equal(await h.publishStableSnapshot(), true);
    assert.equal(loopCalls.length, 1, '有新有效内容时必须先终止旧循环，再交给新首轮接管');
    const scheduledCount = h.calls.filter(call => call[0] === 'scheduler.replace').length;

    h.setSourceEventReader('sheet_a', () => []);
    const emptySnapshot = structuredClone(h.getRawData());
    emptySnapshot.sheet_a.content[1][0] = 'A-空弹幕更新';
    h.setRawData(emptySnapshot);
    assert.equal(await h.publishStableSnapshot(), true);
    assert.equal(
        loopCalls.length,
        1,
        '审核确认表格变化但没有有效弹幕文本时，不能停止现有永恒循环',
    );
    assert.equal(
        h.calls.filter(call => call[0] === 'scheduler.replace').length,
        scheduledCount,
        '空弹幕更新不能清空 Scheduler，从而让正在发射的首轮或旧循环自然继续',
    );

    seam.clear();
    assert.equal(loopCalls.length, 2, '清空浮层必须停止永恒循环');
    seam.stop();
}

async function testDisabledRuntimeDefersAutomaticWorkButKeepsTestButton() {
    const {
        createFullscreenOverlayRuntime,
    } = await import(moduleUrl('modules/fullscreen-overlay/runtime.js'));
    const h = createRuntimeHarness(createFullscreenOverlayRuntime);
    const seam = h.runtime;

    assert.equal(seam.start('settings-disabled'), true);
    await flushAsync();
    assert.equal(seam.getState().disabled, true);
    assert.equal(seam.getState().coordinatorStatus, 'disabled');
    assert.equal(seam.getState().coordinatorStarted, false);
    assert.equal(seam.getState().hasPendingBaseline, false);
    assert.equal(seam.getState().hasCoordinatorRetryTimer, false);
    assert.equal(seam.getState().hasBaselineSyncRetryTimer, false);
    assert.equal(
        h.calls.some(call => call[0] === 'coordinator.start'),
        false,
        'disabled 启动不得订阅审核结果',
    );
    assert.equal(
        h.calls.some(call => call[0] === 'snapshot.read'),
        false,
        'disabled 启动不得读取 baseline',
    );

    const readsBeforeTest = h.calls.filter(call => call[0] === 'snapshot.read').length;
    const testResult = await seam.testSelectedSources();
    assert.equal(testResult.ok, true, 'disabled 状态测试按钮仍必须直接读取并播放');
    assert.equal(
        h.calls.filter(call => call[0] === 'snapshot.read').length,
        readsBeforeTest + 1,
    );
    assert(
        h.calls.some(call => call[0] === 'scheduler.replace' && call[1].length > 0),
        '测试按钮必须把直接读取结果交给 Scheduler',
    );

    const readsBeforeEnable = h.calls.filter(call => call[0] === 'snapshot.read').length;
    h.setSettings({
        ...h.getSettings(),
        enabled: true,
    });
    seam.refreshSettings();
    await flushAsync();
    assert.equal(seam.getState().disabled, false);
    assert.equal(seam.getState().coordinatorStarted, true);
    assert.equal(seam.getState().coordinatorStatus, 'ready');
    assert.equal(
        h.calls.filter(call => call[0] === 'coordinator.start').length,
        1,
        'false→true 只能启动一次 coordinator',
    );
    assert.equal(
        h.calls.filter(call => call[0] === 'snapshot.read').length,
        readsBeforeEnable + 1,
        'false→true 只能同步一次 baseline',
    );

    const callsBeforeDisable = h.calls.length;
    const readsBeforeDisable = h.calls.filter(call => call[0] === 'snapshot.read').length;
    h.setSettings({
        ...h.getSettings(),
        enabled: false,
    });
    seam.refreshSettings();
    await flushAsync();
    const disableCalls = h.calls.slice(callsBeforeDisable);
    assert(disableCalls.some(call => call[0] === 'coordinator.stop'));
    assert(
        disableCalls.some(call => call[0] === 'scheduler.replace' && call[1].length === 0),
        'true→false 必须清掉待播批次',
    );
    assert.equal(seam.getState().disabled, true);
    assert.equal(seam.getState().coordinatorStatus, 'disabled');
    assert.equal(seam.getState().coordinatorStarted, false);
    assert.equal(seam.getState().hasPendingBaseline, false);
    assert.equal(seam.getState().hasCoordinatorRetryTimer, false);
    assert.equal(seam.getState().hasBaselineSyncRetryTimer, false);
    assert.deepEqual(seam.getState().sourceSignatures, {});

    const callsBeforeDisabledChat = h.calls.length;
    assert.equal(seam.suspendForChatChange('chat-disabled'), true);
    assert.equal(await seam.resumeAfterChatChange(), true);
    await flushAsync();
    const disabledChatCalls = h.calls.slice(callsBeforeDisabledChat);
    assert.equal(
        disabledChatCalls.some(call => (
            call[0] === 'coordinator.suspend'
            || call[0] === 'coordinator.resume'
            || call[0] === 'snapshot.read'
        )),
        false,
        'disabled 状态聊天切换不得触发 coordinator 或 baseline',
    );
    assert.equal(
        h.calls.filter(call => call[0] === 'snapshot.read').length,
        readsBeforeDisable,
        '禁用后除测试按钮外不得继续读取快照',
    );
}

async function testDisablingClearsCoordinatorAndBaselineRetries() {
    const {
        createFullscreenOverlayRuntime,
    } = await import(moduleUrl('modules/fullscreen-overlay/runtime.js'));

    const coordinatorClock = new FakeClock();
    let coordinatorStartAttempts = 0;
    const unavailableHarness = createRuntimeHarness(createFullscreenOverlayRuntime, {
        coordinatorStart() {
            coordinatorStartAttempts += 1;
            return false;
        },
        setTimeout: coordinatorClock.setTimeout.bind(coordinatorClock),
        clearTimeout: coordinatorClock.clearTimeout.bind(coordinatorClock),
    });
    const unavailableRuntime = unavailableHarness.runtime;
    unavailableRuntime.start('disabled-no-retry');
    await flushAsync();
    assert.equal(coordinatorStartAttempts, 0);
    assert.equal(coordinatorClock.tasks.size, 0);

    unavailableHarness.setSettings({
        ...unavailableHarness.getSettings(),
        enabled: true,
    });
    unavailableRuntime.refreshSettings();
    await flushAsync();
    assert.equal(coordinatorStartAttempts, 1);
    assert.equal(unavailableRuntime.getState().hasCoordinatorRetryTimer, true);
    const readsBeforeCoordinatorDisable = unavailableHarness.calls
        .filter(call => call[0] === 'snapshot.read').length;

    unavailableHarness.setSettings({
        ...unavailableHarness.getSettings(),
        enabled: false,
    });
    unavailableRuntime.refreshSettings();
    assert.equal(unavailableRuntime.getState().hasCoordinatorRetryTimer, false);
    assert.equal(coordinatorClock.tasks.size, 0);
    await coordinatorClock.tick(5000);
    assert.equal(coordinatorStartAttempts, 1, '禁用后旧 coordinator retry 不得复活');
    assert.equal(
        unavailableHarness.calls.filter(call => call[0] === 'snapshot.read').length,
        readsBeforeCoordinatorDisable,
        '禁用后不得继续为旧 coordinator retry 读取 baseline',
    );
    unavailableRuntime.stop('retry-test-complete');

    const baselineClock = new FakeClock();
    let baselineReads = 0;
    const baselineHarness = createRuntimeHarness(createFullscreenOverlayRuntime, {
        readSnapshot() {
            baselineReads += 1;
            return null;
        },
        setTimeout: baselineClock.setTimeout.bind(baselineClock),
        clearTimeout: baselineClock.clearTimeout.bind(baselineClock),
    });
    const baselineRuntime = baselineHarness.runtime;
    baselineRuntime.start('disabled-no-baseline-retry');
    await flushAsync();
    assert.equal(baselineReads, 0);
    assert.equal(baselineClock.tasks.size, 0);

    baselineHarness.setSettings({
        ...baselineHarness.getSettings(),
        enabled: true,
    });
    baselineRuntime.refreshSettings();
    await flushAsync();
    assert.equal(baselineReads, 1);
    assert.equal(baselineRuntime.getState().hasBaselineSyncRetryTimer, true);

    baselineHarness.setSettings({
        ...baselineHarness.getSettings(),
        enabled: false,
    });
    baselineRuntime.refreshSettings();
    assert.equal(baselineRuntime.getState().hasBaselineSyncRetryTimer, false);
    assert.equal(baselineRuntime.getState().hasPendingBaseline, false);
    assert.equal(baselineClock.tasks.size, 0);
    await baselineClock.tick(5000);
    assert.equal(baselineReads, 1, '禁用后旧 baseline retry 不得继续读取');
    baselineRuntime.stop('baseline-retry-test-complete');
}

class FakeClock {
    constructor() {
        this.now = 0;
        this.nextId = 1;
        this.tasks = new Map();
    }

    setTimeout(callback, delay) {
        const id = this.nextId++;
        this.tasks.set(id, { at: this.now + delay, callback });
        return id;
    }

    clearTimeout(id) {
        this.tasks.delete(id);
    }

    async tick(ms) {
        const target = this.now + ms;
        while (this.tasks.size > 0) {
            const next = [...this.tasks.entries()]
                .filter(([, task]) => task.at <= target)
                .sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0];
            if (!next) break;
            this.now = next[1].at;
            this.tasks.delete(next[0]);
            next[1].callback();
            await flushAsync();
        }
        this.now = target;
        await flushAsync();
    }
}

async function testBackgroundSidecarIsolationAndBarrierReuse() {
    const mod = await import(moduleUrl('modules/phone-core/background-services.js'));
    const clock = new FakeClock();
    const subscribers = new Set();
    const calls = [];

    mod.__test__setPhoneBackgroundServiceDeps({
        startChronicle: () => {
            calls.push('chronicle.start');
            return true;
        },
        stopChronicle: () => {
            calls.push('chronicle.stop');
            return true;
        },
        startSmallCalendar: () => {
            calls.push('calendar.start');
            return true;
        },
        stopSmallCalendar: () => {
            calls.push('calendar.stop');
            return true;
        },
        startTableContentReplacement: () => true,
        stopTableContentReplacement: () => true,
        startFullscreenOverlay: () => {
            calls.push('overlay.start');
            throw new Error('overlay start failure must be isolated');
        },
        stopFullscreenOverlay: () => {
            calls.push('overlay.stop');
            return true;
        },
        suspendFullscreenOverlayForChatChange: () => {
            calls.push('overlay.suspend');
            return true;
        },
        resumeFullscreenOverlayAfterChatChange: async () => {
            calls.push('overlay.resume');
            return true;
        },
        subscribeTableUpdate(callback) {
            subscribers.add(callback);
            return () => subscribers.delete(callback);
        },
        setTimeout: clock.setTimeout.bind(clock),
        clearTimeout: clock.clearTimeout.bind(clock),
        logger: { debug() {}, warn() {} },
    });

    assert.equal(mod.startPhoneBackgroundServices('test-enabled'), true);
    assert.equal(mod.isPhoneBackgroundServicesStarted(), true);
    assert.deepEqual(
        calls.slice(0, 3),
        ['chronicle.start', 'calendar.start', 'overlay.start'],
        '浮层启动失败不得回滚纪要或小日历',
    );

    calls.length = 0;
    assert.equal(mod.handlePhoneBackgroundChatChanged('chat-b'), true);
    assert(calls.includes('overlay.suspend'), '聊天切换必须立即暂停浮层');
    [...subscribers].forEach(callback => callback());
    [...subscribers].forEach(callback => callback());
    await clock.tick(250);
    assert(calls.includes('overlay.resume'), '双通知 + 250ms 屏障完成后必须恢复并只建基线');

    calls.length = 0;
    mod.stopPhoneBackgroundServices('test-disabled');
    assert(calls.includes('overlay.stop'), 'enabled false / destroy 必须完整停止浮层');
    mod.__test__resetPhoneBackgroundServices();
}

function testStaticProductionWiring() {
    const overlayIndex = read('modules/fullscreen-overlay/index.js');
    const background = read('modules/phone-core/background-services.js');
    const rootIndex = read('index.js');

    for (const exportName of [
        'startFullscreenOverlayRuntime',
        'stopFullscreenOverlayRuntime',
        'suspendFullscreenOverlayForChatChange',
        'resumeFullscreenOverlayAfterChatChange',
        'refreshFullscreenOverlaySettings',
        'testFullscreenOverlaySelectedSources',
        'clearFullscreenOverlay',
        'getFullscreenOverlayRuntimeState',
    ]) {
        assert.match(overlayIndex, new RegExp(`export function ${exportName}\\b`, 'u'));
    }

    assert.match(background, /from '\.\.\/fullscreen-overlay\/index\.js'/u);
    assert.match(background, /startFullscreenOverlay/u);
    assert.match(background, /suspendFullscreenOverlay/u);
    assert.match(background, /resumeFullscreenOverlay/u);
    assert.match(background, /stopFullscreenOverlay/u);

    assert.match(
        rootIndex,
        /startPhoneBackgroundServices\('initialize-enabled'\)/u,
        '扩展初始化 enabled 路径必须启动包含浮层在内的后台服务',
    );
    assert.match(rootIndex, /startPhoneBackgroundServices\('settings-enabled'\)/u);
    assert.match(rootIndex, /stopPhoneBackgroundServices\('settings-disabled'\)/u);
    assert.match(rootIndex, /stopPhoneBackgroundServices\('extension-destroy'\)/u);
    assert.doesNotMatch(
        background,
        /togglePhoneBootstrapVisibility|onPhoneActivated|onPhoneDeactivated/u,
        '浮层后台生命周期不得依赖小手机窗口显示状态',
    );
}

async function main() {
    await testRendererFailureInvalidatesOnlyFailedSourceAndRetries();
    await testImmediateRendererFailureCannotCommitPendingConfirmation();
    await testReadEventsFailureRetriesWithoutConfusingLegalEmptyEvents();
    await testSignatureAndModelResolutionFailuresRemainRetryable();
    await testStaleBatchFailureCannotRollbackNewSignatureOrGeneration();
    await testRuntimeStableSnapshotAcknowledgementSemantics();
    await testRuntimePublicSeamAndSourceOrchestration();
    await testChatAndStopLifecycle();
    await testEternalLoopKeepsCurrentCycleWhenUpdateHasNoEvents();
    await testDisabledRuntimeDefersAutomaticWorkButKeepsTestButton();
    await testDisablingClearsCoordinatorAndBaselineRetries();
    await testBackgroundSidecarIsolationAndBarrierReuse();
    testStaticProductionWiring();
    console.log('[通过] 全屏浮层公共运行时与扩展生命周期集成');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
