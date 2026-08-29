const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = process.cwd();
const REVIEW_DEBOUNCE_MS = 500;

function toModuleUrl(relativePath) {
    return pathToFileURL(path.join(ROOT, relativePath)).href;
}

function waitForTurn() {
    return new Promise(resolve => setImmediate(resolve));
}

async function waitForState(label, predicate, timeoutMs = 2500) {
    const deadline = Date.now() + timeoutMs;
    let lastError = null;
    while (Date.now() <= deadline) {
        try {
            const value = predicate();
            if (value) return value;
        } catch (error) {
            lastError = error;
        }
        await waitForTurn();
    }
    const suffix = lastError ? `：${lastError.message}` : '';
    throw new Error(`等待状态超时：${label}${suffix}`);
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

class FakeClock {
    constructor() {
        this.now = 0;
        this.nextId = 1;
        this.timers = new Map();
    }

    setTimeout(callback, delay = 0) {
        const id = this.nextId++;
        this.timers.set(id, {
            callback,
            dueAt: this.now + Math.max(0, Number(delay) || 0),
        });
        return id;
    }

    clearTimeout(id) {
        this.timers.delete(id);
    }

    async tick(duration) {
        const target = this.now + Math.max(0, Number(duration) || 0);
        while (true) {
            const next = [...this.timers.entries()]
                .filter(([, timer]) => timer.dueAt <= target)
                .sort((left, right) => (
                    left[1].dueAt - right[1].dueAt
                    || left[0] - right[0]
                ))[0];
            if (!next) break;
            const [id, timer] = next;
            this.timers.delete(id);
            this.now = timer.dueAt;
            await timer.callback();
        }
        this.now = target;
    }

    get pendingCount() {
        return this.timers.size;
    }
}

function createManagedRuntime(clock) {
    const ownedTimers = new Set();
    const cleanups = new Set();
    let disposed = false;

    return {
        setTimeout(callback, delay) {
            let id = null;
            id = clock.setTimeout(() => {
                ownedTimers.delete(id);
                return callback();
            }, delay);
            ownedTimers.add(id);
            return id;
        },
        clearTimeout(id) {
            ownedTimers.delete(id);
            clock.clearTimeout(id);
        },
        registerCleanup(callback) {
            if (typeof callback !== 'function') return () => {};
            cleanups.add(callback);
            return () => cleanups.delete(callback);
        },
        isDisposed() {
            return disposed;
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            for (const id of ownedTimers) clock.clearTimeout(id);
            ownedTimers.clear();
            for (const cleanup of [...cleanups].reverse()) {
                try {
                    cleanup();
                } catch {
                    // 集成契约继续检查剩余公共资源。
                }
            }
            cleanups.clear();
        },
        getState() {
            return {
                disposed,
                timerCount: ownedTimers.size,
                cleanupCount: cleanups.size,
            };
        },
    };
}

class FakeEventSource {
    constructor() {
        this.listeners = new Map();
    }

    on(eventType, callback) {
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, new Set());
        }
        this.listeners.get(eventType).add(callback);
    }

    off(eventType, callback) {
        this.listeners.get(eventType)?.delete(callback);
        if (this.listeners.get(eventType)?.size === 0) {
            this.listeners.delete(eventType);
        }
    }

    removeListener(eventType, callback) {
        this.off(eventType, callback);
    }

    emit(eventType, payload) {
        for (const callback of [...(this.listeners.get(eventType) || [])]) {
            callback(payload);
        }
    }

    listenerCount(eventType) {
        return this.listeners.get(eventType)?.size || 0;
    }

    get totalListenerCount() {
        return [...this.listeners.values()]
            .reduce((total, listeners) => total + listeners.size, 0);
    }
}

function createFakeDatabaseApi(initialSnapshot) {
    const nativeCallbacks = new Set();
    let currentSnapshot = initialSnapshot;
    let registerCount = 0;
    let unregisterCount = 0;

    return {
        api: {
            registerTableUpdateCallback(callback) {
                registerCount += 1;
                nativeCallbacks.add(callback);
            },
            unregisterTableUpdateCallback(callback) {
                unregisterCount += 1;
                nativeCallbacks.delete(callback);
            },
            exportTableAsJson() {
                return currentSnapshot;
            },
        },
        setSnapshot(snapshot) {
            currentSnapshot = snapshot;
        },
        getSnapshot() {
            return currentSnapshot;
        },
        emitTableUpdate(payload) {
            for (const callback of [...nativeCallbacks]) callback(payload);
        },
        getState() {
            return {
                nativeCallbackCount: nativeCallbacks.size,
                registerCount,
                unregisterCount,
            };
        },
    };
}

function createRawSnapshot({
    plot = '旧剧情',
    character = '旧推角',
    conflict = '旧对线',
    diary = '旧日记',
    liveRows = null,
} = {}) {
    const normalizedLiveRows = Array.isArray(liveRows)
        ? liveRows.map(row => [...row])
        : [[1, plot, character, conflict]];
    return {
        sheet_live: {
            name: '直播表',
            content: [
                ['row_id', '剧情弹幕串', '推角弹幕串', '对线弹幕串'],
                ...normalizedLiveRows,
            ],
        },
        sheet_diary: {
            name: '小日记表',
            content: [
                ['row_id', '内容'],
                [1, diary],
            ],
        },
    };
}

function createSyntheticReadyResult({
    sessionKey,
    chatKey,
    floorId,
    text,
}) {
    return {
        status: 'ready',
        sessionKey,
        chatKey,
        floorId,
        tableCount: 1,
        changeCount: 1,
        tables: [{
            sheetKey: 'sheet_live',
            tableName: '直播表',
            changeCount: 1,
            changes: [{
                type: 'update',
                sheetKey: 'sheet_live',
                tableName: '直播表',
                rowId: '1',
                rowIndex: 0,
                rowKey: '1',
                fields: [{
                    field: '剧情弹幕串',
                    before: '旧剧情',
                    after: text,
                }],
            }],
        }],
    };
}

function createFakeScheduler() {
    const replacements = [];
    let disposed = false;

    return {
        async replace(batches) {
            if (disposed) return false;
            replacements.push(Array.isArray(batches) ? batches : []);
            return true;
        },
        clear() {},
        dispose() {
            disposed = true;
        },
        getState() {
            return {
                disposed,
                replacementCount: replacements.length,
            };
        },
        getNonEmptyBatches() {
            return replacements.filter(batches => batches.length > 0);
        },
    };
}

async function main() {
    const previousWindow = global.window;
    const previousDocument = global.document;
    const clock = new FakeClock();
    const eventSource = new FakeEventSource();
    const baselineSnapshot = createRawSnapshot();
    const database = createFakeDatabaseApi(baselineSnapshot);
    const fakeWindow = {
        AutoCardUpdaterAPI: database.api,
        eventSource,
        TavernHelper: {
            chatId: 'review-pipeline-integration-chat',
            getCharData: () => ({
                name: 'review-pipeline-integration-character',
                avatar: 'review-pipeline-integration-character.png',
            }),
        },
        setTimeout,
        clearTimeout,
    };
    fakeWindow.parent = fakeWindow;
    global.window = fakeWindow;

    let serviceModule = null;
    let callbacksModule = null;
    let eventBridgeModule = null;
    let activeOverlay = null;
    let activeServiceRuntime = null;
    const schedulers = [];

    try {
        const [
            loadedServiceModule,
            loadedCallbacksModule,
            loadedEventBridgeModule,
            storeModule,
            resultChannelModule,
            { createFullscreenOverlayRuntime },
            { createReviewResultCoordinator },
            {
                normalizeFullscreenOverlaySettings,
                SCROLLING_BARRAGE_MODEL_ID,
            },
            { createOverlaySourceRegistry },
            { buildOverlaySourceCatalog },
            { createLiveTableSourceAdapter },
        ] = await Promise.all([
            import(toModuleUrl('modules/table-update-review/service.js')),
            import(toModuleUrl('modules/phone-core/callbacks.js')),
            import(toModuleUrl('modules/integration/event-bridge.js')),
            import(toModuleUrl('modules/table-update-review/store.js')),
            import(toModuleUrl('modules/table-update-review/result-channel.js')),
            import(toModuleUrl('modules/fullscreen-overlay/runtime.js')),
            import(toModuleUrl('modules/fullscreen-overlay/review-result-coordinator.js')),
            import(toModuleUrl('modules/fullscreen-overlay/settings.js')),
            import(toModuleUrl('modules/fullscreen-overlay/source-registry.js')),
            import(toModuleUrl('modules/fullscreen-overlay/source-catalog.js')),
            import(toModuleUrl('modules/fullscreen-overlay/sources/live-table.js')),
        ]);
        serviceModule = loadedServiceModule;
        callbacksModule = loadedCallbacksModule;
        eventBridgeModule = loadedEventBridgeModule;

        const registry = createOverlaySourceRegistry([
            createLiveTableSourceAdapter(),
        ]);
        const overlaySettings = {
            enabled: true,
            sourceEnabledBySheetKey: {
                sheet_live: true,
            },
            sourceOrder: ['sheet_live', 'sheet_diary'],
            sourceModelBySheetKey: {
                sheet_live: SCROLLING_BARRAGE_MODEL_ID,
            },
            models: {
                [SCROLLING_BARRAGE_MODEL_ID]: {},
            },
        };

        const startReviewService = async () => {
            activeServiceRuntime = createManagedRuntime(clock);
            assert.strictEqual(
                serviceModule.startTableUpdateReviewService({
                    createRuntimeScope: () => activeServiceRuntime,
                }),
                true,
                '真实 callbacks broker 可用时审核服务必须立即订阅成功',
            );
            await waitForState(
                '审核服务与楼层窗口完成宿主事件注册',
                () => (
                    eventSource.listenerCount('generation_started') >= 1
                    && eventSource.listenerCount('message_received') >= 2
                ),
            );
            assert.strictEqual(
                database.getState().nativeCallbackCount,
                1,
                '真实 callbacks broker 应只注册一个共享 native table-update callback',
            );
        };

        const createOverlay = (readSnapshot) => {
            let scheduler = null;
            const overlay = createFullscreenOverlayRuntime({
                settingKey: 'fullscreenOverlay',
                normalizeSettings: normalizeFullscreenOverlaySettings,
                getSettings: () => ({
                    fullscreenOverlay: overlaySettings,
                }),
                readSnapshot,
                registry,
                buildSourceCatalog: buildOverlaySourceCatalog,
                createLayerRuntime: () => ({
                    clear() {},
                    dispose() {},
                    isMounted: () => true,
                    isDisposed: () => false,
                    getState: () => ({ mounted: true, disposed: false }),
                }),
                createRendererRegistry: () => new Map([
                    [SCROLLING_BARRAGE_MODEL_ID, {
                        refreshSettings() {},
                        pause() {},
                        resume() {},
                        clear() {},
                        dispose() {},
                    }],
                ]),
                createScheduler: () => {
                    scheduler = createFakeScheduler();
                    schedulers.push(scheduler);
                    return scheduler;
                },
                createCoordinator: ({ onStableSnapshot }) => createReviewResultCoordinator({
                    subscribeResults: callback => (
                        resultChannelModule.subscribeTableUpdateReviewResults(callback)
                    ),
                    onStableSnapshot,
                    setTimeout: clock.setTimeout.bind(clock),
                    clearTimeout: clock.clearTimeout.bind(clock),
                }),
                coordinatorRetryDelaysMs: [1000, 2000, 5000],
                setTimeoutFn: clock.setTimeout.bind(clock),
                clearTimeoutFn: clock.clearTimeout.bind(clock),
                logger: {
                    debug() {},
                    warn() {},
                },
            });
            return {
                overlay,
                getScheduler: () => scheduler,
            };
        };

        const openAiFloor = (floorId) => {
            eventSource.emit('generation_started');
            eventSource.emit('message_received', { messageId: floorId });
        };

        const emitAndDebounce = async (snapshot) => {
            database.setSnapshot(snapshot);
            database.emitTableUpdate(snapshot);
            await clock.tick(REVIEW_DEBOUNCE_MS);
        };

        const cleanupScenario = async () => {
            activeOverlay?.stop?.('integration-scenario-finished');
            activeOverlay = null;
            if (serviceModule.getTableUpdateReviewServiceStatus().running) {
                serviceModule.stopTableUpdateReviewService();
            }
            await waitForState(
                '审核服务停止后宿主事件监听全部释放',
                () => eventSource.totalListenerCount === 0,
            );
            assert.deepStrictEqual(
                activeServiceRuntime?.getState(),
                {
                    disposed: true,
                    timerCount: 0,
                    cleanupCount: 0,
                },
                '审核 service runtime 必须释放 timer 与 cleanup',
            );
            assert.strictEqual(
                serviceModule.getTableUpdateReviewServiceStatus().running,
                false,
            );
            activeServiceRuntime = null;
        };

        // 场景零：table-update payload 与审核结果已经是新直播表，
        // 但 export/readSnapshot 仍停留在结构完整的旧空直播表。
        // 自动路径必须直接消费审核 ready 携带的 changedSnapshot，
        // 不得再次读取旧 export，并且只能播放审核标记的当前楼变化行。
        const reviewBaselineWithUnchangedRow = createRawSnapshot({
            liveRows: [
                [1, '', '', ''],
                [2, '未变化行剧情', '未变化行推角', '未变化行对线'],
            ],
        });
        const staleEmptyExportSnapshot = createRawSnapshot({
            liveRows: [
                [1, '', '', ''],
                [2, '', '', ''],
            ],
        });
        const readyPayloadWithOneChangedRow = createRawSnapshot({
            liveRows: [
                [1, '本楼新剧情', '本楼新推角', '本楼新对线'],
                [2, '未变化行剧情', '未变化行推角', '未变化行对线'],
            ],
        });

        database.setSnapshot(reviewBaselineWithUnchangedRow);
        await startReviewService();
        {
            let overlayReadCount = 0;
            let publishedReadyResult = null;
            const unsubscribeResultProbe = resultChannelModule.subscribeTableUpdateReviewResults((result) => {
                if (result?.status === 'ready' && result?.floorId === 30) {
                    publishedReadyResult = result;
                }
            });

            try {
                const harness = createOverlay(() => {
                    overlayReadCount += 1;
                    return database.getSnapshot();
                });
                activeOverlay = harness.overlay;
                assert.strictEqual(activeOverlay.start('review-changed-snapshot-race'), true);
                await waitForState(
                    '竞态场景 Overlay 完成初始基线同步',
                    () => activeOverlay.getState().coordinatorStatus === 'ready',
                );
                const baselineOverlayReadCount = overlayReadCount;
                assert.ok(
                    baselineOverlayReadCount >= 1,
                    'Overlay 启动时必须读取一次初始基线',
                );

                // generation_started 先捕获包含第 2 行既有内容的审核基线；
                // 随后把数据库 export 故意停在结构完整、但直播表内容全空的旧投影。
                openAiFloor(30);
                database.setSnapshot(staleEmptyExportSnapshot);
                database.emitTableUpdate(readyPayloadWithOneChangedRow);
                await clock.tick(REVIEW_DEBOUNCE_MS);

                const readyStore = await waitForState(
                    'table-update payload 已提交为当前楼 ready Store',
                    () => {
                        const state = storeModule.getReviewState();
                        return state.status === 'ready' && state.floorId === 30
                            ? state
                            : null;
                    },
                );
                assert.deepStrictEqual(
                    readyStore.tables[0]?.updatedRowIndexes,
                    [0],
                    '审核 Store 必须只标记当前楼实际变化的第 1 行',
                );
                assert.deepStrictEqual(
                    readyStore.tables[0]?.changes.map(change => change.rowId),
                    ['1'],
                    '审核 Store 不得把同表未变化的第 2 行标记为本楼更新',
                );

                const publishedReady = await waitForState(
                    'ready result 通过公共 seam 携带 changedSnapshot',
                    () => publishedReadyResult,
                );
                assert.deepStrictEqual(
                    publishedReady.changedSnapshot,
                    {
                        sheet_live: readyPayloadWithOneChangedRow.sheet_live,
                    },
                    'ready result 必须只携带本楼变化表的权威 changedSnapshot',
                );
                assert.deepStrictEqual(
                    database.getSnapshot(),
                    staleEmptyExportSnapshot,
                    '调度发生前数据库 export 必须仍保持结构完整的旧空直播表',
                );

                const scheduler = harness.getScheduler();
                await waitForState(
                    'changedSnapshot 立即产生当前楼直播批次',
                    () => scheduler.getNonEmptyBatches().length === 1,
                );
                assert.strictEqual(
                    overlayReadCount,
                    baselineOverlayReadCount,
                    '审核 ready 自动路径必须直接消费 changedSnapshot，不得再次读取旧 export/readSnapshot',
                );
                assert.deepStrictEqual(
                    scheduler.getNonEmptyBatches()[0][0].items.map(item => ({
                        rowIndex: item.rowIndex,
                        text: item.text,
                    })),
                    [
                        { rowIndex: 0, text: '本楼新剧情' },
                        { rowIndex: 0, text: '本楼新推角' },
                        { rowIndex: 0, text: '本楼新对线' },
                    ],
                    '自动路径只能播放审核标记的当前楼变化行，不得播放同表未变化行',
                );
            } finally {
                unsubscribeResultProbe();
            }
        }
        await cleanupScenario();

        // 场景 A：同一审核 session 的 ready 是相对楼层前基线的累计结果。
        // 第一次只有 row_id=1 变化；第二次累计结果包含 row_id=1 的旧变化
        // 与 row_id=2 的新变化。第二次自动批次只能播放新增差异 row_id=2。
        const cumulativeBaseline = createRawSnapshot({
            liveRows: [
                [1, '', '', ''],
                [2, '', '', ''],
            ],
        });
        database.setSnapshot(cumulativeBaseline);
        await startReviewService();
        {
            const harness = createOverlay(() => database.getSnapshot());
            activeOverlay = harness.overlay;
            assert.strictEqual(activeOverlay.start('cumulative-session-row-delta'), true);
            await waitForState(
                '累计差异场景 Overlay 完成初始基线同步',
                () => activeOverlay.getState().coordinatorStatus === 'ready',
            );

            openAiFloor(301);
            const firstCumulativeUpdate = createRawSnapshot({
                liveRows: [
                    [1, '第一批 row1 剧情', '第一批 row1 推角', '第一批 row1 对线'],
                    [2, '', '', ''],
                ],
            });
            await emitAndDebounce(firstCumulativeUpdate);

            const scheduler = harness.getScheduler();
            await waitForState(
                '累计差异场景第一次 row_id=1 更新产生批次',
                () => scheduler.getNonEmptyBatches().length === 1,
            );
            assert.deepStrictEqual(
                scheduler.getNonEmptyBatches()[0][0].items.map(item => ({
                    rowIndex: item.rowIndex,
                    text: item.text,
                })),
                [
                    { rowIndex: 0, text: '第一批 row1 剧情' },
                    { rowIndex: 0, text: '第一批 row1 推角' },
                    { rowIndex: 0, text: '第一批 row1 对线' },
                ],
                '同一 session 第一次 ready 只能播放 row_id=1',
            );

            const firstSessionKey = storeModule.getReviewState().sessionKey;
            const secondCumulativeUpdate = createRawSnapshot({
                liveRows: [
                    [1, '第一批 row1 剧情', '第一批 row1 推角', '第一批 row1 对线'],
                    [2, '第二批 row2 剧情', '第二批 row2 推角', '第二批 row2 对线'],
                ],
            });
            await emitAndDebounce(secondCumulativeUpdate);

            const cumulativeReady = await waitForState(
                '同一 session 第二次 ready 包含 row1 旧变化与 row2 新变化',
                () => {
                    const state = storeModule.getReviewState();
                    const rowIds = state.tables[0]?.changes.map(change => change.rowId);
                    return state.status === 'ready'
                        && state.sessionKey === firstSessionKey
                        && rowIds?.includes('1')
                        && rowIds?.includes('2')
                        ? state
                        : null;
                },
            );
            assert.deepStrictEqual(
                cumulativeReady.tables[0].changes.map(change => change.rowId).sort(),
                ['1', '2'],
                '第二次审核 ready 必须保持相对楼层前基线的累计差异，确保场景真实',
            );
            await waitForState(
                '同一 session 第二次累计 ready 产生第二个自动批次',
                () => scheduler.getNonEmptyBatches().length === 2,
            );
            assert.deepStrictEqual(
                scheduler.getNonEmptyBatches()[1][0].items.map(item => ({
                    rowIndex: item.rowIndex,
                    text: item.text,
                })),
                [
                    { rowIndex: 1, text: '第二批 row2 剧情' },
                    { rowIndex: 1, text: '第二批 row2 推角' },
                    { rowIndex: 1, text: '第二批 row2 对线' },
                ],
                '同一 session 的累计 ready 只能播放相对上次已接受结果新增的 row_id=2，不得重播 row_id=1',
            );
        }
        await cleanupScenario();

        // 场景 B：没有稳定 row id 时删除原第 0 行，原第 1 行会在当前快照中前移到第 0 行。
        // 删除差异的旧 rowIndex 绝不能用于查询更新后的当前快照，否则会误播下一行。
        const noStableRowIdBaseline = {
            sheet_live: {
                name: '直播表',
                content: [
                    ['剧情弹幕串', '推角弹幕串', '对线弹幕串'],
                    ['将被删除剧情', '将被删除推角', '将被删除对线'],
                    ['保留行剧情', '保留行推角', '保留行对线'],
                ],
            },
            sheet_diary: createRawSnapshot().sheet_diary,
        };
        const noStableRowIdAfterDelete = {
            sheet_live: {
                name: '直播表',
                content: [
                    ['剧情弹幕串', '推角弹幕串', '对线弹幕串'],
                    ['保留行剧情', '保留行推角', '保留行对线'],
                ],
            },
            sheet_diary: createRawSnapshot().sheet_diary,
        };
        database.setSnapshot(noStableRowIdBaseline);
        await startReviewService();
        {
            const harness = createOverlay(() => database.getSnapshot());
            activeOverlay = harness.overlay;
            assert.strictEqual(activeOverlay.start('delete-without-stable-row-id'), true);
            await waitForState(
                '无稳定 row id 删除场景 Overlay 完成初始基线同步',
                () => activeOverlay.getState().coordinatorStatus === 'ready',
            );

            openAiFloor(302);
            await emitAndDebounce(noStableRowIdAfterDelete);
            await waitForState(
                '无稳定 row id 的第 0 行删除已形成审核 ready',
                () => {
                    const state = storeModule.getReviewState();
                    return state.status === 'ready'
                        && state.floorId === 302
                        && state.tables[0]?.changes.some(change => change.type === 'delete')
                        ? state
                        : null;
                },
            );
            await waitForTurn();
            await waitForTurn();

            assert.deepStrictEqual(
                harness.getScheduler().getNonEmptyBatches(),
                [],
                '删除无稳定 row id 的第 0 行后，不得误播更新后前移到第 0 行的下一行',
            );
        }
        await cleanupScenario();

        // 场景 C：ready 声称直播表发生 update，但 changedSnapshot 缺少该表。
        // 这是不可消费的残缺权威输入，自动路径必须失败关闭，不能调用 Scheduler。
        database.setSnapshot(baselineSnapshot);
        await startReviewService();
        {
            const harness = createOverlay(() => database.getSnapshot());
            activeOverlay = harness.overlay;
            assert.strictEqual(activeOverlay.start('ready-missing-changed-snapshot-table'), true);
            await waitForState(
                '缺表 changedSnapshot 场景 Overlay 完成初始基线同步',
                () => activeOverlay.getState().coordinatorStatus === 'ready',
            );

            const scheduler = harness.getScheduler();
            const replacementCountBeforeMalformedReady = scheduler.getState().replacementCount;
            resultChannelModule.publishTableUpdateReviewResult({
                ...createSyntheticReadyResult({
                    sessionKey: 'missing-snapshot-table:1',
                    chatKey: 'review-pipeline-integration-chat',
                    floorId: 303,
                    text: '不应被调度',
                }),
                changedSnapshot: {},
            });
            await waitForTurn();
            await waitForTurn();

            assert.strictEqual(
                scheduler.getState().replacementCount,
                replacementCountBeforeMalformedReady,
                'ready update 的 changedSnapshot 缺少声明变化的表时必须不调度，连空 replace 也不得调用',
            );
        }
        await cleanupScenario();

        // 场景一：正常 AI 楼基线 + 完整 table-update payload；
        // 同一 session 再覆盖 ready A → empty → ready A。
        database.setSnapshot(baselineSnapshot);
        await startReviewService();
        {
            const harness = createOverlay(() => database.getSnapshot());
            activeOverlay = harness.overlay;
            assert.strictEqual(activeOverlay.start('normal-pipeline'), true);
            await waitForState(
                '正常 Overlay 完成初始基线同步',
                () => activeOverlay.getState().coordinatorStatus === 'ready',
            );

            openAiFloor(31);
            const differenceA = createRawSnapshot({
                plot: '差异 A 剧情',
                character: '差异 A 推角',
                conflict: '差异 A 对线',
            });
            await emitAndDebounce(differenceA);

            const firstReady = await waitForState(
                '完整 payload 提交 ready Store',
                () => {
                    const state = storeModule.getReviewState();
                    return state.status === 'ready' && state.floorId === 31
                        ? state
                        : null;
                },
            );
            const scheduler = harness.getScheduler();
            await waitForState(
                '完整 payload 最终产生直播批次',
                () => scheduler.getNonEmptyBatches().length === 1,
            );
            assert.ok(firstReady.sessionKey);
            assert.deepStrictEqual(
                scheduler.getNonEmptyBatches()[0][0].items.map(item => item.text),
                ['差异 A 剧情', '差异 A 推角', '差异 A 对线'],
            );

            const visualCountBeforeEmpty = scheduler.getNonEmptyBatches().length;
            await emitAndDebounce(baselineSnapshot);
            await waitForState(
                '同 session 净差异恢复为空',
                () => {
                    const state = storeModule.getReviewState();
                    return state.status === 'empty'
                        && state.sessionKey === firstReady.sessionKey
                        ? state
                        : null;
                },
            );
            await waitForState(
                'Overlay 消费 empty 并清理同 session 去重签名',
                () => {
                    const coordinator = activeOverlay.getState().coordinator;
                    return coordinator
                        && coordinator.processing === false
                        && coordinator.hasPendingResult === false
                        && coordinator.acceptedSignatureCount === 0;
                },
            );
            assert.strictEqual(
                scheduler.getNonEmptyBatches().length,
                visualCountBeforeEmpty,
                'empty 只清理审核去重状态，不得触发视觉批次',
            );

            await emitAndDebounce(differenceA);
            await waitForState(
                '同 session 完全相同差异 A 再次产生直播批次',
                () => scheduler.getNonEmptyBatches().length === visualCountBeforeEmpty + 1,
            );
            assert.deepStrictEqual(
                scheduler.getNonEmptyBatches()[1][0].items.map(item => item.text),
                ['差异 A 剧情', '差异 A 推角', '差异 A 对线'],
            );
        }
        await cleanupScenario();

        // 场景二：Overlay 初始基线同步仍暂停时，审核 ready 先到；
        // coordinator 必须保留结果，并在基线恢复后产生批次。
        database.setSnapshot(baselineSnapshot);
        await startReviewService();
        {
            const deferredBaseline = createDeferred();
            let readCount = 0;
            const harness = createOverlay(() => {
                readCount += 1;
                return readCount === 1
                    ? deferredBaseline.promise
                    : database.getSnapshot();
            });
            activeOverlay = harness.overlay;
            assert.strictEqual(activeOverlay.start('deferred-initial-baseline'), true);
            await waitForState(
                'Overlay 保持初始基线同步暂停',
                () => {
                    const state = activeOverlay.getState();
                    return state.coordinatorStatus === 'synchronizing'
                        && state.coordinator?.suspended === true
                        && state.coordinator?.suspensionMode === 'initial';
                },
            );

            openAiFloor(32);
            const updateDuringInitialSuspend = createRawSnapshot({
                plot: '暂停期间剧情',
                character: '暂停期间推角',
                conflict: '暂停期间对线',
            });
            await emitAndDebounce(updateDuringInitialSuspend);

            await waitForState(
                '暂停期间审核 ready 已成功提交 Store',
                () => {
                    const state = storeModule.getReviewState();
                    return state.status === 'ready' && state.floorId === 32
                        ? state
                        : null;
                },
            );
            await waitForState(
                '暂停期间 ready 已由 coordinator 暂存',
                () => activeOverlay.getState().coordinator?.hasPendingResult === true,
            );
            assert.strictEqual(
                harness.getScheduler().getNonEmptyBatches().length,
                0,
                '初始基线未恢复前不得提前播放',
            );

            deferredBaseline.resolve(updateDuringInitialSuspend);
            await waitForState(
                '初始基线恢复后 Overlay ready',
                () => activeOverlay.getState().coordinatorStatus === 'ready',
            );
            await waitForState(
                '恢复后的 pending 结果进入消费或受控重试',
                () => {
                    const coordinator = activeOverlay.getState().coordinator;
                    return harness.getScheduler().getNonEmptyBatches().length === 1
                        || coordinator?.hasRetryTimer === true;
                },
            );
            if (harness.getScheduler().getNonEmptyBatches().length === 0) {
                const retryDelay = activeOverlay.getState().coordinator?.nextRetryDelayMs;
                assert.strictEqual(
                    retryDelay,
                    1000,
                    '初始恢复竞态被 runtime 拒绝时必须进入首个 1 秒受控重试',
                );
                await clock.tick(retryDelay);
            }
            await waitForState(
                '初始暂停期间的审核结果恢复后产生批次',
                () => harness.getScheduler().getNonEmptyBatches().length === 1,
            );
            assert.deepStrictEqual(
                harness.getScheduler().getNonEmptyBatches()[0][0].items.map(item => item.text),
                ['暂停期间剧情', '暂停期间推角', '暂停期间对线'],
            );
        }
        await cleanupScenario();

        // 场景三：聊天切换屏障只缓存 expected chat 的审核结果。
        // old/空 chatKey 结果必须丢弃，真实 service 产出的 chat-b ready
        // 在暂停期间缓存，并在恢复后播放。
        fakeWindow.TavernHelper.chatId = 'chat-a';
        database.setSnapshot(baselineSnapshot);
        await startReviewService();
        {
            const harness = createOverlay(() => database.getSnapshot());
            activeOverlay = harness.overlay;
            assert.strictEqual(activeOverlay.start('chat-barrier-pipeline'), true);
            await waitForState(
                '聊天屏障场景 Overlay 完成初始基线同步',
                () => activeOverlay.getState().coordinatorStatus === 'ready',
            );

            assert.strictEqual(
                activeOverlay.suspendForChatChange('chat-b'),
                true,
                'Overlay 必须接受 expected chatKey 并进入聊天切换暂停',
            );
            await waitForState(
                'Overlay 进入 chat-b 切换暂停',
                () => {
                    const coordinator = activeOverlay.getState().coordinator;
                    return coordinator?.suspended === true
                        && coordinator?.suspensionMode === 'chat';
                },
            );

            resultChannelModule.publishTableUpdateReviewResult(createSyntheticReadyResult({
                sessionKey: 'chat-a:old-ready',
                chatKey: 'chat-a',
                floorId: 40,
                text: '旧聊天不得播放',
            }));
            resultChannelModule.publishTableUpdateReviewResult(createSyntheticReadyResult({
                sessionKey: 'empty-chat-key:ready',
                chatKey: '',
                floorId: 41,
                text: '空聊天标识不得播放',
            }));
            assert.strictEqual(
                activeOverlay.getState().coordinator?.hasPendingResult,
                false,
                '聊天切换暂停期间 old/空 chatKey 的 ready 不得进入 pending',
            );
            assert.strictEqual(
                harness.getScheduler().getNonEmptyBatches().length,
                0,
                '聊天切换暂停期间 old/空 chatKey 的 ready 不得触发视觉',
            );

            fakeWindow.TavernHelper.chatId = 'chat-b';
            eventSource.emit('chat_id_changed', '  chat-b  ');
            await waitForState(
                '审核服务保存规范化后的 chat-b',
                () => storeModule.getReviewState().chatKey === 'chat-b',
            );

            openAiFloor(42);
            const chatBUpdate = createRawSnapshot({
                plot: 'chat-b 剧情',
                character: 'chat-b 推角',
                conflict: 'chat-b 对线',
            });
            await emitAndDebounce(chatBUpdate);

            const chatBReady = await waitForState(
                '真实审核服务提交 chat-b ready',
                () => {
                    const state = storeModule.getReviewState();
                    return state.status === 'ready'
                        && state.floorId === 42
                        && state.chatKey === 'chat-b'
                        ? state
                        : null;
                },
            );
            assert.ok(chatBReady.sessionKey);
            await waitForState(
                'chat-b ready 在聊天暂停期间进入 coordinator pending',
                () => activeOverlay.getState().coordinator?.hasPendingResult === true,
            );
            assert.strictEqual(
                harness.getScheduler().getNonEmptyBatches().length,
                0,
                'chat-b ready 在恢复前不得提前播放',
            );

            await activeOverlay.resumeAfterChatChange(chatBUpdate);
            await waitForState(
                'chat-b 恢复后的 pending 结果进入消费或受控重试',
                () => {
                    const coordinator = activeOverlay.getState().coordinator;
                    return harness.getScheduler().getNonEmptyBatches().length === 1
                        || coordinator?.hasRetryTimer === true;
                },
            );
            if (harness.getScheduler().getNonEmptyBatches().length === 0) {
                const retryDelay = activeOverlay.getState().coordinator?.nextRetryDelayMs;
                assert.strictEqual(
                    retryDelay,
                    1000,
                    'chat-b 恢复竞态被 runtime 拒绝时必须进入首个 1 秒受控重试',
                );
                await clock.tick(retryDelay);
            }
            await waitForState(
                'chat-b ready 在恢复后产生直播批次',
                () => harness.getScheduler().getNonEmptyBatches().length === 1,
            );
            assert.deepStrictEqual(
                harness.getScheduler().getNonEmptyBatches()[0][0].items.map(item => item.text),
                ['chat-b 剧情', 'chat-b 推角', 'chat-b 对线'],
            );
        }
        await cleanupScenario();

        // callback broker 的 subscriber disposer 不拥有共享 native callback；
        // 所有 service/runtime 都停下后，通过公共 broker cleanup 释放真实 native owner。
        callbacksModule.unregisterTableUpdateListener();
        assert.deepStrictEqual(
            database.getState(),
            {
                nativeCallbackCount: 0,
                registerCount: 1,
                unregisterCount: 1,
            },
            '测试结束后共享 native callback 必须从真实 API owner 注销',
        );
        assert.strictEqual(eventSource.totalListenerCount, 0);
        assert.strictEqual(clock.pendingCount, 0, '测试结束不得残留受控 timer');
        assert.ok(
            schedulers.every(scheduler => scheduler.getState().disposed),
            '所有 Overlay scheduler 必须完成 dispose',
        );

        console.log('[通过] 审核结果真实公共 seam → 全屏浮层 pipeline 集成契约');
    } finally {
        try {
            activeOverlay?.stop?.('integration-finally');
        } catch {}
        try {
            if (serviceModule?.getTableUpdateReviewServiceStatus?.().running) {
                serviceModule.stopTableUpdateReviewService();
            }
        } catch {}
        try {
            callbacksModule?.unregisterTableUpdateListener?.();
        } catch {}
        try {
            eventBridgeModule?.clearEventBridgeState?.();
        } catch {}
        if (previousWindow === undefined) {
            delete global.window;
        } else {
            global.window = previousWindow;
        }
        if (previousDocument === undefined) {
            delete global.document;
        } else {
            global.document = previousDocument;
        }
    }
}

main().catch((error) => {
    console.error('[失败] 审核结果真实公共 seam → 全屏浮层 pipeline 集成契约');
    console.error(error);
    process.exitCode = 1;
});
