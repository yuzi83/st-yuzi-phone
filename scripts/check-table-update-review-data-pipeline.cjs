const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const vm = require('node:vm');

const ROOT = process.cwd();

function toModuleUrl(relativePath) {
    return pathToFileURL(path.join(ROOT, relativePath)).href;
}

function createFakeRuntime() {
    let nextTimerId = 1;
    const timers = new Map();
    const cleanups = [];
    let disposed = false;

    return {
        setTimeout(callback, delay) {
            const id = nextTimerId++;
            timers.set(id, { callback, delay });
            return id;
        },
        clearTimeout(id) {
            timers.delete(id);
        },
        registerCleanup(callback) {
            cleanups.push(callback);
            return callback;
        },
        isDisposed() {
            return disposed;
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            timers.clear();
            while (cleanups.length > 0) {
                try {
                    cleanups.pop()?.();
                } catch {
                    // 测试 runtime 的 cleanup 继续执行。
                }
            }
        },
        getDelays() {
            return Array.from(timers.values(), timer => timer.delay);
        },
        runNext(delay) {
            const entry = Array.from(timers.entries())
                .find(([, timer]) => timer.delay === delay);
            assert.ok(entry, `应存在 ${delay}ms timer`);
            const [id, timer] = entry;
            timers.delete(id);
            timer.callback();
        },
        getTimerCount() {
            return timers.size;
        },
    };
}

function createHostEvents() {
    const callbacks = {};
    const subscribe = key => (callback) => {
        callbacks[key] = callback;
        return () => {
            if (callbacks[key] === callback) delete callbacks[key];
        };
    };
    return {
        callbacks,
        onGenerationStarted: subscribe('generationStarted'),
        onMessageReceived: subscribe('messageReceived'),
        onCharacterMessageRendered: subscribe('characterMessageRendered'),
        onMessageSent: subscribe('messageSent'),
        onChatChanged: subscribe('chatChanged'),
    };
}

function createRawSnapshot(liveText = '旧直播', diaryText = '旧日记') {
    return {
        sheet_live: {
            name: '直播表',
            content: [
                ['row_id', '剧情弹幕串', '推角弹幕串', '对线弹幕串'],
                [1, liveText, '', ''],
            ],
        },
        sheet_diary: {
            name: '小日记表',
            content: [
                ['row_id', '内容'],
                [1, diaryText],
            ],
        },
    };
}

function createNormalizedSnapshot(liveText = '旧直播', diaryText = '旧日记') {
    return {
        capturedAt: 1,
        sheets: [
            {
                sheetKey: 'sheet_live',
                tableName: '直播表',
                headers: ['row_id', '剧情弹幕串', '推角弹幕串', '对线弹幕串'],
                rows: [{
                    rowId: '1',
                    rowIndex: 0,
                    rowKey: '1',
                    rowTitle: liveText,
                    cells: {
                        row_id: '1',
                        剧情弹幕串: liveText,
                        推角弹幕串: '',
                        对线弹幕串: '',
                    },
                }],
            },
            {
                sheetKey: 'sheet_diary',
                tableName: '小日记表',
                headers: ['row_id', '内容'],
                rows: [{
                    rowId: '1',
                    rowIndex: 0,
                    rowKey: '1',
                    rowTitle: diaryText,
                    cells: {
                        row_id: '1',
                        内容: diaryText,
                    },
                }],
            },
        ],
    };
}

function createReadyReviewState({
    sessionKey = 'authoritative-snapshot-session',
    changeType = 'update',
} = {}) {
    return {
        status: 'ready',
        sessionKey,
        floorId: 30,
        tableCount: 1,
        changeCount: 1,
        message: '本楼检测到 1 处表格更新',
        tables: [{
            sheetKey: 'sheet_live',
            tableName: '直播表',
            insertCount: changeType === 'insert' ? 1 : 0,
            updateCount: changeType === 'update' ? 1 : 0,
            deleteCount: changeType === 'delete' ? 1 : 0,
            changeCount: 1,
            updatedRowIndexes: [0],
            updatedRowIds: ['1'],
            changes: [{
                type: changeType,
                sheetKey: 'sheet_live',
                tableName: '直播表',
                rowIndex: 0,
                rowId: '1',
                rowKey: '1',
                fields: [{
                    field: '剧情弹幕串',
                    before: changeType === 'insert' ? '' : '旧直播',
                    after: changeType === 'delete' ? '' : '新直播',
                }],
            }],
        }],
        error: null,
    };
}

function checkMergeFallbackRequiresCompleteCurrent(snapshotModule) {
    const lastComplete = createRawSnapshot('最近完整直播', '最近完整日记');
    const mergedFromEmptyCurrent = snapshotModule.mergeTableUpdatePayload(
        { type: 'malformed-update' },
        {},
        lastComplete,
    );

    assert.deepStrictEqual(
        mergedFromEmptyCurrent,
        lastComplete,
        '异常 currentRawSnapshot 即使是普通对象，也不得遮蔽最近完整快照',
    );
    assert.notStrictEqual(
        mergedFromEmptyCurrent,
        lastComplete,
        'fallback 必须返回审核模块拥有的防御性克隆',
    );
    mergedFromEmptyCurrent.sheet_live.content[1][1] = '被修改';
    assert.strictEqual(
        lastComplete.sheet_live.content[1][1],
        '最近完整直播',
        'fallback 结果不得污染最近完整快照',
    );

    const partiallyBrokenCurrent = createRawSnapshot('不完整 current 直播', '不完整 current 日记');
    partiallyBrokenCurrent.sheet_diary.content = {};
    assert.deepStrictEqual(
        snapshotModule.mergeTableUpdatePayload(
            { type: 'malformed-update' },
            partiallyBrokenCurrent,
            lastComplete,
        ),
        lastComplete,
        '只要任一物理表缺少合法 content/header，currentRawSnapshot 就不是完整快照',
    );
}

function checkResultChannelCloneBudget(resultChannelModule) {
    let deepTraversalCount = 0;
    const createProbeResult = sessionKey => {
        const sheet = {
            name: '直播表',
            content: [
                ['row_id', '剧情弹幕串'],
                [1, '克隆预算弹幕'],
            ],
        };
        Object.defineProperty(sheet, 'metadata', {
            enumerable: true,
            configurable: true,
            get() {
                deepTraversalCount += 1;
                return { source: 'clone-budget-probe' };
            },
        });
        return {
            status: 'ready',
            sessionKey,
            chatKey: 'clone-budget-chat',
            floorId: 31,
            tables: [{
                sheetKey: 'sheet_live',
                tableName: '直播表',
                changes: [],
            }],
            changedSnapshot: {
                sheet_live: sheet,
            },
        };
    };

    assert.strictEqual(
        resultChannelModule.publishTableUpdateReviewResult(
            createProbeResult('clone-budget-no-subscriber'),
        ),
        true,
    );
    assert.strictEqual(
        deepTraversalCount,
        0,
        '没有订阅者时 result-channel 不得预先深克隆 changedSnapshot',
    );

    const received = [];
    const unsubscribeFirst = resultChannelModule.subscribeTableUpdateReviewResults(
        result => received.push(result),
    );
    const unsubscribeSecond = resultChannelModule.subscribeTableUpdateReviewResults(
        result => received.push(result),
    );
    try {
        deepTraversalCount = 0;
        assert.strictEqual(
            resultChannelModule.publishTableUpdateReviewResult(
                createProbeResult('clone-budget-two-subscribers'),
            ),
            true,
        );
        assert.strictEqual(received.length, 2);
        assert.strictEqual(
            deepTraversalCount,
            2,
            'changedSnapshot 应仅为每个订阅者各深克隆一次，不得先做通道级重复深克隆',
        );
    } finally {
        unsubscribeFirst();
        unsubscribeSecond();
    }
}

function checkChangedSnapshotSubscriberIsolation(resultChannelModule) {
    const expectedChangedSnapshot = {
        sheet_live: {
            name: '直播表',
            content: [
                ['row_id', '剧情弹幕串'],
                [1, '原始弹幕'],
            ],
            metadata: {
                source: {
                    kind: 'table-update-payload',
                },
            },
        },
    };
    const sourceResult = {
        status: 'ready',
        sessionKey: 'changed-snapshot-clone-session',
        chatKey: 'changed-snapshot-clone-chat',
        floorId: 30,
        tables: [{
            sheetKey: 'sheet_live',
            tableName: '直播表',
            changes: [],
        }],
        changedSnapshot: structuredClone(expectedChangedSnapshot),
    };
    let secondSubscriberResult = null;
    const unsubscribeFirst = resultChannelModule.subscribeTableUpdateReviewResults((result) => {
        result.changedSnapshot.sheet_live.name = '被第一个订阅者污染';
        result.changedSnapshot.sheet_live.content[1][1] = '被第一个订阅者修改';
        result.changedSnapshot.sheet_live.metadata.source.kind = 'mutated';
    });
    const unsubscribeSecond = resultChannelModule.subscribeTableUpdateReviewResults((result) => {
        secondSubscriberResult = result;
    });

    try {
        assert.strictEqual(
            resultChannelModule.publishTableUpdateReviewResult(sourceResult),
            true,
        );
        assert.deepStrictEqual(
            secondSubscriberResult?.changedSnapshot,
            expectedChangedSnapshot,
            '每个 result-channel 订阅者必须收到 changedSnapshot 的独立深克隆',
        );
        assert.deepStrictEqual(
            sourceResult.changedSnapshot,
            expectedChangedSnapshot,
            '订阅者修改 changedSnapshot 不得污染发布源对象',
        );
    } finally {
        unsubscribeFirst();
        unsubscribeSecond();
    }
}

async function checkComputeUsesOneAuthoritativeRawSnapshot(serviceModule) {
    const fakeRuntime = createFakeRuntime();
    const hostEvents = createHostEvents();
    const authoritativeRaw = createRawSnapshot('同一时刻权威直播', '同一时刻权威日记');
    let tableUpdateCallback = null;
    let readRawCount = 0;
    let normalizedRawSnapshot = null;
    let selectedRawSnapshot = null;
    let receivedSnapshotOverride = null;
    const publishedResults = [];

    try {
        assert.strictEqual(serviceModule.startTableUpdateReviewService({
            createRuntimeScope: () => fakeRuntime,
            createFloorWindow: () => ({ dispose() {} }),
            createSession(options) {
                return {
                    beginPreSnapshot() {},
                    openAiFloor() {},
                    closeReceivingWindow() {},
                    resetReviewSession() {},
                    getReviewSessionStatus() {
                        return null;
                    },
                    applyTableUpdate(_reason, snapshotOverride) {
                        receivedSnapshotOverride = snapshotOverride === undefined
                            ? options.readSnapshot()
                            : snapshotOverride;
                        return createReadyReviewState();
                    },
                };
            },
            subscribeTableUpdate(callback) {
                tableUpdateCallback = callback;
                return () => {
                    if (tableUpdateCallback === callback) tableUpdateCallback = null;
                };
            },
            mergeUpdatePayload: () => null,
            readRawSnapshot() {
                readRawCount += 1;
                return authoritativeRaw;
            },
            normalizeSnapshot(rawSnapshot) {
                normalizedRawSnapshot = rawSnapshot;
                return {
                    capturedAt: 1,
                    sheets: [],
                };
            },
            selectChangedRawSnapshot(rawSnapshot) {
                selectedRawSnapshot = rawSnapshot;
                return rawSnapshot
                    ? { sheet_live: rawSnapshot.sheet_live }
                    : {};
            },
            publishResult(result) {
                publishedResults.push(result);
                return true;
            },
            ...hostEvents,
        }), true);

        tableUpdateCallback(createRawSnapshot('事件内容不会成为 pending', '旧日记'));
        fakeRuntime.runNext(500);

        assert.strictEqual(
            readRawCount,
            1,
            'pending 为空时 computeAndPublish 必须只读取一次 raw snapshot',
        );
        assert.ok(normalizedRawSnapshot, 'computeAndPublish 必须解析出唯一 raw snapshot');
        assert.strictEqual(
            selectedRawSnapshot,
            normalizedRawSnapshot,
            'normalize/diff/select 必须使用同一个权威 raw snapshot 对象',
        );
        assert.deepStrictEqual(
            receivedSnapshotOverride,
            {
                capturedAt: 1,
                sheets: [],
            },
            'applyTableUpdate 必须收到显式 snapshotOverride，不得触发 Session 内部另一轮读取',
        );
        assert.strictEqual(publishedResults.length, 1);
        assert.strictEqual(
            publishedResults[0].changedSnapshot.sheet_live.content[1][1],
            '同一时刻权威直播',
        );
    } finally {
        serviceModule.stopTableUpdateReviewService();
    }
}

async function checkInvalidChangedSnapshotDoesNotPublishOrClearPending(
    serviceModule,
    storeModule,
) {
    const fakeRuntime = createFakeRuntime();
    const hostEvents = createHostEvents();
    const authoritativeRaw = createRawSnapshot('权威新直播', '旧日记');
    const invalidSnapshots = [
        {},
        { sheet_live: null },
        { sheet_live: { name: '直播表', content: {} } },
        { sheet_live: { name: '直播表', content: ['不是表头数组'] } },
    ];
    let invalidIndex = 0;
    let tableUpdateCallback = null;
    let rawReadCount = 0;
    const publishedResults = [];

    try {
        assert.strictEqual(serviceModule.startTableUpdateReviewService({
            createRuntimeScope: () => fakeRuntime,
            createFloorWindow: () => ({ dispose() {} }),
            createSession: () => ({
                beginPreSnapshot() {},
                openAiFloor() {},
                closeReceivingWindow() {},
                resetReviewSession() {},
                getReviewSessionStatus() {
                    return null;
                },
                applyTableUpdate() {
                    return createReadyReviewState({
                        sessionKey: `invalid-changed-snapshot-${invalidIndex}`,
                        changeType: invalidIndex === 1 ? 'insert' : 'update',
                    });
                },
            }),
            subscribeTableUpdate(callback) {
                tableUpdateCallback = callback;
                return () => {
                    if (tableUpdateCallback === callback) tableUpdateCallback = null;
                };
            },
            readRawSnapshot() {
                rawReadCount += 1;
                return authoritativeRaw;
            },
            selectChangedRawSnapshot() {
                return invalidIndex < invalidSnapshots.length
                    ? invalidSnapshots[invalidIndex]
                    : {
                        sheet_live: authoritativeRaw.sheet_live,
                    };
            },
            publishResult(result) {
                publishedResults.push(result);
                return true;
            },
            ...hostEvents,
        }), true);

        tableUpdateCallback(authoritativeRaw);
        fakeRuntime.runNext(500);
        assert.strictEqual(storeModule.getReviewState().status, 'ready');
        assert.strictEqual(
            publishedResults.length,
            0,
            'changedSnapshot 缺少变化表时 UI Store 可更新，但 ready 不得发布',
        );

        for (invalidIndex = 1; invalidIndex < invalidSnapshots.length; invalidIndex += 1) {
            tableUpdateCallback({ type: `invalid-retry-${invalidIndex}` });
            fakeRuntime.runNext(500);
            assert.strictEqual(
                publishedResults.length,
                0,
                'changedSnapshot 的 sheet/content/header 不合法时不得发布 ready',
            );
        }

        assert.strictEqual(
            rawReadCount,
            0,
            '验证失败后必须保留 pending，后续通知不得为了恢复它而重新读取数据库',
        );

        invalidIndex = invalidSnapshots.length;
        tableUpdateCallback({ type: 'valid-retry' });
        fakeRuntime.runNext(500);
        assert.strictEqual(
            publishedResults.length,
            1,
            '同一 pending 在 changedSnapshot 合同恢复有效后应允许发布',
        );
    } finally {
        serviceModule.stopTableUpdateReviewService();
    }
}

async function checkPureDeleteMayPublishWithoutCurrentSheet(serviceModule) {
    const fakeRuntime = createFakeRuntime();
    const hostEvents = createHostEvents();
    let tableUpdateCallback = null;
    const publishedResults = [];

    try {
        assert.strictEqual(serviceModule.startTableUpdateReviewService({
            createRuntimeScope: () => fakeRuntime,
            createFloorWindow: () => ({ dispose() {} }),
            createSession: () => ({
                beginPreSnapshot() {},
                openAiFloor() {},
                closeReceivingWindow() {},
                resetReviewSession() {},
                getReviewSessionStatus() {
                    return null;
                },
                applyTableUpdate() {
                    return createReadyReviewState({
                        sessionKey: 'pure-delete-session',
                        changeType: 'delete',
                    });
                },
            }),
            subscribeTableUpdate(callback) {
                tableUpdateCallback = callback;
                return () => {
                    if (tableUpdateCallback === callback) tableUpdateCallback = null;
                };
            },
            selectChangedRawSnapshot: () => ({}),
            publishResult(result) {
                publishedResults.push(result);
                return true;
            },
            ...hostEvents,
        }), true);

        tableUpdateCallback(createRawSnapshot());
        fakeRuntime.runNext(500);
        assert.strictEqual(publishedResults.length, 1);
        assert.deepStrictEqual(
            publishedResults[0].changedSnapshot,
            {},
            '纯 delete 变化允许当前 changedSnapshot 中不存在已删除表',
        );
    } finally {
        serviceModule.stopTableUpdateReviewService();
    }
}

async function checkOwnedMergedSnapshotAvoidsDuplicateServiceClones(serviceModule) {
    const fakeRuntime = createFakeRuntime();
    const hostEvents = createHostEvents();
    const ownedMergedSnapshot = createRawSnapshot('owned 新直播', '旧日记');
    let tableUpdateCallback = null;
    let serviceCloneCount = 0;

    try {
        assert.strictEqual(serviceModule.startTableUpdateReviewService({
            createRuntimeScope: () => fakeRuntime,
            createFloorWindow: () => ({ dispose() {} }),
            createSession: () => ({
                beginPreSnapshot() {},
                openAiFloor() {},
                closeReceivingWindow() {},
                resetReviewSession() {},
                getReviewSessionStatus() {
                    return null;
                },
                applyTableUpdate() {
                    return createReadyReviewState({
                        sessionKey: 'owned-merge-clone-budget',
                    });
                },
            }),
            subscribeTableUpdate(callback) {
                tableUpdateCallback = callback;
                return () => {
                    if (tableUpdateCallback === callback) tableUpdateCallback = null;
                };
            },
            mergeUpdatePayload: () => ownedMergedSnapshot,
            cloneRawSnapshot(value) {
                serviceCloneCount += 1;
                return structuredClone(value);
            },
            selectChangedRawSnapshot: rawSnapshot => ({
                sheet_live: structuredClone(rawSnapshot.sheet_live),
            }),
            publishResult: () => true,
            ...hostEvents,
        }), true);

        tableUpdateCallback(ownedMergedSnapshot);
        fakeRuntime.runNext(500);
        assert.strictEqual(
            serviceCloneCount,
            0,
            'merge 返回值已由审核模块拥有，保存 baseline 与 compute 时不得重复深克隆完整数据库',
        );
    } finally {
        serviceModule.stopTableUpdateReviewService();
    }
}

async function checkSameFloorNewGenerationCreatesNewSession(sessionModule) {
    const session = sessionModule.createTableUpdateReviewSession();
    const firstBaseline = createNormalizedSnapshot('第一代基线');
    const secondBaseline = createNormalizedSnapshot('第二代基线');
    const secondLatest = createNormalizedSnapshot('第二代更新');
    const floorPayload = {
        floorId: 7,
        messageRef: 'same-floor-message',
    };

    session.beginPreSnapshot('generation-started:first', firstBaseline);
    const firstSession = session.openAiFloor(
        floorPayload,
        'message-received:first',
    );
    assert.ok(firstSession.sessionKey);

    session.beginPreSnapshot('generation-started:second', secondBaseline);
    const secondSession = session.openAiFloor(
        floorPayload,
        'message-received:second',
    );
    assert.notStrictEqual(
        secondSession.sessionKey,
        firstSession.sessionKey,
        '同楼层/同 messageRef 的新 generation 已捕获 pre snapshot 时必须创建新 sessionKey',
    );
    assert.ok(
        secondSession.version > firstSession.version,
        '同楼层新 generation 必须推进 Session version',
    );
    assert.strictEqual(
        secondSession.baselineSnapshot.sheets[0].rows[0].cells.剧情弹幕串,
        '第二代基线',
        '新 Session 必须使用刚捕获的 preAiSnapshot 作为 baseline',
    );
    assert.strictEqual(secondSession.preAiSnapshot, null, '新 Session 建立后必须消费并清空 pre snapshot');

    const duplicateRenderedEvent = session.openAiFloor(
        floorPayload,
        'character-message-rendered:second',
        secondLatest,
    );
    assert.strictEqual(
        duplicateRenderedEvent.sessionKey,
        secondSession.sessionKey,
        'pre 已清空后的 MESSAGE_RECEIVED/CHARACTER_RENDERED 重复事件必须保持同 Session',
    );
    assert.strictEqual(duplicateRenderedEvent.version, secondSession.version);

    const reviewResult = session.applyTableUpdate('table-update', secondLatest);
    const liveField = reviewResult.tables[0].changes[0].fields
        .find(field => field.field === '剧情弹幕串');
    assert.strictEqual(liveField.before, '第二代基线');
    assert.strictEqual(liveField.after, '第二代更新');
}

async function checkSubscriptionRecovery(serviceModule) {
    const fakeRuntime = createFakeRuntime();
    const hostEvents = createHostEvents();
    let apiAvailable = false;
    let subscribeAttempts = 0;
    let activeTableUpdateCallback = null;

    const started = serviceModule.startTableUpdateReviewService({
        createRuntimeScope: () => fakeRuntime,
        createFloorWindow: () => ({ dispose() {} }),
        subscribeTableUpdate(callback) {
            subscribeAttempts += 1;
            if (!apiAvailable) return null;
            activeTableUpdateCallback = callback;
            return () => {
                if (activeTableUpdateCallback === callback) {
                    activeTableUpdateCallback = null;
                }
            };
        },
        ...hostEvents,
    });

    assert.strictEqual(started, false, '首次 table-update 订阅失败时不得假装 ready');
    assert.strictEqual(subscribeAttempts, 1, '启动时应立即尝试一次 table-update 订阅');
    assert.deepStrictEqual(fakeRuntime.getDelays(), [1000], '首次失败应安排 1 秒恢复重试');

    for (let index = 0; index < 5; index += 1) {
        assert.strictEqual(
            serviceModule.startTableUpdateReviewService(),
            false,
            '等待恢复时重复启动不得假装 ready',
        );
    }
    assert.strictEqual(subscribeAttempts, 1, '等待 timer 期间重复渲染不得绕过低频退避');
    assert.deepStrictEqual(fakeRuntime.getDelays(), [1000], '重复启动不得创建额外 retry timer');

    fakeRuntime.runNext(1000);
    assert.strictEqual(subscribeAttempts, 2, '第一次恢复应再次尝试订阅');
    assert.deepStrictEqual(fakeRuntime.getDelays(), [2000], '第二次失败应退避到 2 秒');

    fakeRuntime.runNext(2000);
    assert.strictEqual(subscribeAttempts, 3, '第二次恢复应再次尝试订阅');
    assert.deepStrictEqual(fakeRuntime.getDelays(), [5000], '第三次失败应退避到 5 秒');

    fakeRuntime.runNext(5000);
    assert.strictEqual(subscribeAttempts, 4, '第三次恢复应再次尝试订阅');
    assert.deepStrictEqual(fakeRuntime.getDelays(), [5000], '达到上限后应保持低频 5 秒重试');

    apiAvailable = true;
    fakeRuntime.runNext(5000);

    assert.strictEqual(subscribeAttempts, 5, 'API 可用后应自动重新绑定');
    assert.strictEqual(typeof activeTableUpdateCallback, 'function', '恢复后必须持有有效 table-update 订阅');
    assert.deepStrictEqual(
        fakeRuntime.getDelays(),
        [5000],
        '绑定成功后必须停止恢复 timer，并只保留 broker 健康检查',
    );

    serviceModule.stopTableUpdateReviewService();
    assert.strictEqual(activeTableUpdateCallback, null, '服务停止必须注销恢复后的 table-update 订阅');
    assert.strictEqual(fakeRuntime.getTimerCount(), 0, '服务停止必须清理全部 retry timer');
}

async function checkStopCancelsPendingSubscriptionRetry(serviceModule) {
    const fakeRuntime = createFakeRuntime();
    const hostEvents = createHostEvents();
    let subscribeAttempts = 0;

    assert.strictEqual(serviceModule.startTableUpdateReviewService({
        createRuntimeScope: () => fakeRuntime,
        createFloorWindow: () => ({ dispose() {} }),
        subscribeTableUpdate() {
            subscribeAttempts += 1;
            return null;
        },
        ...hostEvents,
    }), false);
    assert.deepStrictEqual(fakeRuntime.getDelays(), [1000], '等待 API 时应存在 1 秒恢复 timer');

    assert.strictEqual(serviceModule.stopTableUpdateReviewService(), true);
    assert.strictEqual(fakeRuntime.getTimerCount(), 0, '等待恢复期间 stop 必须清理 retry timer');
    assert.strictEqual(subscribeAttempts, 1, 'stop 本身不得触发额外订阅');
    assert.strictEqual(serviceModule.getTableUpdateReviewServiceStatus().running, false);
    assert.strictEqual(serviceModule.getTableUpdateReviewServiceStatus().hasSubscriptionRetryTimer, false);
}

async function checkSubscribedBrokerHealthRebind(serviceModule) {
    const fakeRuntime = createFakeRuntime();
    const hostEvents = createHostEvents();
    let subscribeAttempts = 0;
    let ensureAttempts = 0;
    let rebindCount = 0;
    let rawSnapshotReads = 0;
    let currentApiOwner = 'api-a';
    let boundApiOwner = 'api-a';

    try {
        assert.strictEqual(serviceModule.startTableUpdateReviewService({
            createRuntimeScope: () => fakeRuntime,
            createFloorWindow: () => ({ dispose() {} }),
            subscribeTableUpdate() {
                subscribeAttempts += 1;
                return () => {};
            },
            ensureTableUpdateListenerCurrent() {
                ensureAttempts += 1;
                if (boundApiOwner !== currentApiOwner) {
                    boundApiOwner = currentApiOwner;
                    rebindCount += 1;
                }
                return true;
            },
            readRawSnapshot() {
                rawSnapshotReads += 1;
                return createRawSnapshot();
            },
            ...hostEvents,
        }), true);

        assert.deepStrictEqual(
            fakeRuntime.getDelays(),
            [5000],
            '订阅成功后必须只安排一个 5 秒 broker 健康检查',
        );
        assert.deepStrictEqual(
            {
                hasTimer: serviceModule.getTableUpdateReviewServiceStatus().hasSubscriptionHealthTimer,
                intervalMs: serviceModule.getTableUpdateReviewServiceStatus().subscriptionHealthCheckIntervalMs,
                count: serviceModule.getTableUpdateReviewServiceStatus().subscriptionHealthCheckCount,
                lastOk: serviceModule.getTableUpdateReviewServiceStatus().lastSubscriptionHealthCheckOk,
            },
            {
                hasTimer: true,
                intervalMs: 5000,
                count: 0,
                lastOk: null,
            },
            'broker 健康状态必须可观测',
        );

        fakeRuntime.runNext(5000);
        assert.strictEqual(ensureAttempts, 1, '首个 5 秒周期必须执行一次 broker ensure');
        assert.strictEqual(rebindCount, 0, 'API 身份相同时不得重复原生绑定');
        assert.strictEqual(subscribeAttempts, 1, '健康检查不得创建新 subscriber');
        assert.strictEqual(rawSnapshotReads, 0, '健康检查不得读取完整表格快照');
        assert.deepStrictEqual(fakeRuntime.getDelays(), [5000], '健康检查后必须保持单一 5 秒 timer');

        currentApiOwner = 'api-b';
        fakeRuntime.runNext(5000);
        assert.strictEqual(ensureAttempts, 2);
        assert.strictEqual(rebindCount, 1, 'API A→B 后必须由 broker ensure 迁移原生绑定');
        assert.strictEqual(boundApiOwner, 'api-b');
        assert.strictEqual(subscribeAttempts, 1, 'API owner 迁移不得新增 service subscriber');
        assert.strictEqual(rawSnapshotReads, 0);

        currentApiOwner = 'api-c';
        hostEvents.callbacks.chatChanged(' chat-c ');
        assert.strictEqual(
            ensureAttempts,
            3,
            '聊天切换必须清理旧 timer 并立即执行一次 broker ensure',
        );
        assert.strictEqual(rebindCount, 2);
        assert.strictEqual(boundApiOwner, 'api-c');
        assert.deepStrictEqual(fakeRuntime.getDelays(), [5000], '聊天切换后只能重建一个 5 秒健康 timer');

        const status = serviceModule.getTableUpdateReviewServiceStatus();
        assert.strictEqual(status.subscriptionHealthCheckCount, 3);
        assert.strictEqual(status.lastSubscriptionHealthCheckOk, true);
        assert.strictEqual(status.lastSubscriptionHealthCheckReason, 'chat-changed');
        assert.ok(status.lastSubscriptionHealthCheckAt > 0);
    } finally {
        serviceModule.stopTableUpdateReviewService();
    }

    assert.strictEqual(fakeRuntime.getTimerCount(), 0, 'stop 必须清理 broker 健康 timer');
    assert.strictEqual(serviceModule.getTableUpdateReviewServiceStatus().hasSubscriptionHealthTimer, false);
}

async function checkFullPayloadPublishesCommittedResult(serviceModule, storeModule, resultChannelModule) {
    const fakeRuntime = createFakeRuntime();
    const hostEvents = createHostEvents();
    let tableUpdateCallback = null;
    const baselineRaw = createRawSnapshot();
    const baselineNormalized = createNormalizedSnapshot();
    let allowRawRead = true;
    const emittedResults = [];
    const storeSnapshotsAtEmission = [];
    const unsubscribeResult = resultChannelModule.subscribeTableUpdateReviewResults((result) => {
        emittedResults.push(result);
        storeSnapshotsAtEmission.push(storeModule.getReviewState());
    });

    try {
        const started = serviceModule.startTableUpdateReviewService({
            createRuntimeScope: () => fakeRuntime,
            createFloorWindow: () => ({ dispose() {} }),
            subscribeTableUpdate(callback) {
                tableUpdateCallback = callback;
                return () => {
                    if (tableUpdateCallback === callback) tableUpdateCallback = null;
                };
            },
            readRawSnapshot: () => {
                if (!allowRawRead) {
                    throw new Error('完整 payload 路径不得重新盲读 export');
                }
                return baselineRaw;
            },
            readSnapshot: () => baselineNormalized,
            ...hostEvents,
        });
        assert.strictEqual(started, true, 'API 可用时审核服务应立即完成订阅');

        hostEvents.callbacks.generationStarted();
        hostEvents.callbacks.messageReceived({ messageId: 8 });

        allowRawRead = false;
        tableUpdateCallback(createRawSnapshot('payload 中的新直播', '旧日记'));
        fakeRuntime.runNext(500);

        assert.strictEqual(emittedResults.length, 1, '完整 table-update payload 应产生一条结构化 ready result');
        const result = emittedResults[0];
        assert.ok(result.sessionKey, '结构化审核结果必须包含 sessionKey');
        assert.strictEqual(
            result.chatKey,
            'table-update-review-test-chat',
            '正常审核结果必须携带服务启动时的当前 chatKey',
        );
        assert.strictEqual(result.floorId, 8);
        assert.strictEqual(result.status, 'ready');
        assert.deepStrictEqual(
            result.tables.map(table => table.sheetKey),
            ['sheet_live'],
            'payload 中只变化直播表时不得误报未变化的小日记表',
        );
        assert.strictEqual(result.tables[0].tableName, '直播表');
        assert.strictEqual(
            result.tables[0].changes[0].fields.find(field => field.field === '剧情弹幕串')?.after,
            'payload 中的新直播',
            '审核结果必须优先使用回调 payload，而不是重新盲读旧 export',
        );
        assert.deepStrictEqual(
            result.changedSnapshot,
            {
                sheet_live: {
                    name: '直播表',
                    content: [
                        ['row_id', '剧情弹幕串', '推角弹幕串', '对线弹幕串'],
                        [1, 'payload 中的新直播', '', ''],
                    ],
                },
            },
            'ready result 必须携带只含本次变化表的 payload 权威快照',
        );
        assert.strictEqual(
            Object.hasOwn(storeModule.getReviewState(), 'changedSnapshot'),
            false,
            '审核 Store/UI 不得保存 changedSnapshot',
        );
        assert.deepStrictEqual(
            storeSnapshotsAtEmission[0],
            storeModule.getReviewState(),
            'result channel 回调执行时 Store 必须已经提交同一份 ready 结果',
        );
    } finally {
        unsubscribeResult();
        serviceModule.stopTableUpdateReviewService();
    }
}

async function checkChatKeyFollowsChatChanged(
    serviceModule,
    storeModule,
    resultChannelModule,
) {
    const fakeRuntime = createFakeRuntime();
    const hostEvents = createHostEvents();
    const baselineRaw = createRawSnapshot();
    let tableUpdateCallback = null;
    const emittedResults = [];
    const unsubscribeResult = resultChannelModule.subscribeTableUpdateReviewResults(
        result => emittedResults.push(result),
    );

    try {
        assert.strictEqual(serviceModule.startTableUpdateReviewService({
            createRuntimeScope: () => fakeRuntime,
            createFloorWindow: () => ({ dispose() {} }),
            subscribeTableUpdate(callback) {
                tableUpdateCallback = callback;
                return () => {
                    if (tableUpdateCallback === callback) tableUpdateCallback = null;
                };
            },
            ensureTableUpdateListenerCurrent: () => true,
            readRawSnapshot: () => baselineRaw,
            ...hostEvents,
        }), true);

        hostEvents.callbacks.chatChanged('  chat-b  ');
        assert.strictEqual(
            storeModule.getReviewState().chatKey,
            'chat-b',
            'handleChatChanged(chatId) 必须保存规范化 chatKey 到 Store reset 状态',
        );

        hostEvents.callbacks.generationStarted();
        hostEvents.callbacks.messageReceived({ messageId: 21 });
        tableUpdateCallback(createRawSnapshot('chat-b 新直播', '旧日记'));
        fakeRuntime.runNext(500);

        assert.strictEqual(emittedResults.length, 1);
        assert.strictEqual(emittedResults[0].chatKey, 'chat-b');
        assert.strictEqual(storeModule.getReviewState().chatKey, 'chat-b');
        const {
            changedSnapshot: _changedSnapshot,
            ...publishedCommittedState
        } = emittedResults[0];
        assert.deepStrictEqual(
            publishedCommittedState,
            storeModule.getReviewState(),
            '除通道专用 changedSnapshot 外，chatKey 必须随 committed Store 状态克隆并发布',
        );
    } finally {
        unsubscribeResult();
        serviceModule.stopTableUpdateReviewService();
    }
}

async function checkSameSessionReadyEmptyReadyPublishesTransitions(
    serviceModule,
    storeModule,
    resultChannelModule,
) {
    const fakeRuntime = createFakeRuntime();
    const hostEvents = createHostEvents();
    const baselineRaw = createRawSnapshot();
    let tableUpdateCallback = null;
    const emittedResults = [];
    const storeSnapshotsAtEmission = [];
    const unsubscribeResult = resultChannelModule.subscribeTableUpdateReviewResults((result) => {
        emittedResults.push(result);
        storeSnapshotsAtEmission.push(storeModule.getReviewState());
    });

    try {
        assert.strictEqual(
            resultChannelModule.publishTableUpdateReviewResult({
                status: 'empty',
                sessionKey: '',
                floorId: -1,
                tables: [],
            }),
            false,
            '普通 reset 没有 sessionKey 时不得进入审核结果通道',
        );
        assert.strictEqual(
            resultChannelModule.publishTableUpdateReviewResult({
                status: 'error',
                sessionKey: 'error-session',
                floorId: 20,
                tables: [],
            }),
            false,
            'error 状态不得进入审核结果通道',
        );

        assert.strictEqual(serviceModule.startTableUpdateReviewService({
            createRuntimeScope: () => fakeRuntime,
            createFloorWindow: () => ({ dispose() {} }),
            subscribeTableUpdate(callback) {
                tableUpdateCallback = callback;
                return () => {
                    if (tableUpdateCallback === callback) tableUpdateCallback = null;
                };
            },
            readRawSnapshot: () => baselineRaw,
            ...hostEvents,
        }), true);

        hostEvents.callbacks.generationStarted();
        hostEvents.callbacks.messageReceived({ messageId: 20 });

        tableUpdateCallback(createRawSnapshot('差异 A', '旧日记'));
        fakeRuntime.runNext(500);
        assert.deepStrictEqual(
            emittedResults.map(result => result.status),
            ['ready'],
            '首次净差异 A 应发布 ready',
        );

        tableUpdateCallback(createRawSnapshot('旧直播', '旧日记'));
        fakeRuntime.runNext(500);
        assert.deepStrictEqual(
            emittedResults.map(result => result.status),
            ['ready', 'empty'],
            '同 session 净差异恢复为空时必须发布带 sessionKey 的 empty',
        );
        assert.strictEqual(emittedResults[1].tables.length, 0);
        assert.strictEqual(emittedResults[1].changeCount, 0);

        tableUpdateCallback(createRawSnapshot('差异 A', '旧日记'));
        fakeRuntime.runNext(500);
        assert.deepStrictEqual(
            emittedResults.map(result => result.status),
            ['ready', 'empty', 'ready'],
            'empty 清空去重基线后，同 session 完全相同的差异 A 必须允许再次发布',
        );

        const sessionKeys = new Set(emittedResults.map(result => result.sessionKey));
        assert.strictEqual(sessionKeys.size, 1, 'ready→empty→ready 必须属于同一个审核 session');
        assert.ok(emittedResults[0].sessionKey, 'session-scoped empty 必须复用非空 sessionKey');
        assert.deepStrictEqual(
            storeSnapshotsAtEmission.map(state => state.status),
            ['ready', 'empty', 'ready'],
            '每次结构化状态都必须在 Store 成功提交后再发布',
        );
        assert.deepStrictEqual(
            storeSnapshotsAtEmission[1],
            emittedResults[1],
            'empty 发布时必须与已提交 Store 状态一致',
        );
    } finally {
        unsubscribeResult();
        serviceModule.stopTableUpdateReviewService();
    }
}

async function checkSingleSheetPayloadMergeAndLifecycleCleanup(
    serviceModule,
    storeModule,
    resultChannelModule,
) {
    const fakeRuntime = createFakeRuntime();
    const hostEvents = createHostEvents();
    const baselineRaw = createRawSnapshot();
    let currentRawSnapshot = baselineRaw;
    let rawReadError = null;
    let tableUpdateCallback = null;
    const emittedResults = [];
    const unsubscribeResult = resultChannelModule.subscribeTableUpdateReviewResults(
        result => emittedResults.push(result),
    );

    try {
        assert.strictEqual(serviceModule.startTableUpdateReviewService({
            createRuntimeScope: () => fakeRuntime,
            createFloorWindow: () => ({ dispose() {} }),
            subscribeTableUpdate(callback) {
                tableUpdateCallback = callback;
                return () => {
                    if (tableUpdateCallback === callback) tableUpdateCallback = null;
                };
            },
            readRawSnapshot: () => {
                if (rawReadError) throw rawReadError;
                return currentRawSnapshot;
            },
            ...hostEvents,
        }), true);

        hostEvents.callbacks.generationStarted();
        hostEvents.callbacks.messageReceived({ messageId: 10 });

        rawReadError = new Error('单表 payload 到达时 export 暂不可用');
        tableUpdateCallback({
            sheetKey: 'sheet_live',
            name: '直播表',
            content: [
                ['row_id', '剧情弹幕串', '推角弹幕串', '对线弹幕串'],
                [1, '单表 payload 新直播', '', ''],
            ],
        });
        fakeRuntime.runNext(500);

        assert.strictEqual(emittedResults.length, 1, '单表 payload 应产生审核 ready result');
        assert.deepStrictEqual(
            emittedResults[0].tables.map(table => table.sheetKey),
            ['sheet_live'],
            '单表 payload 必须与最近完整快照合并，不得把其他表误判为删除',
        );
        assert.strictEqual(
            emittedResults[0].tables[0].changes[0].fields
                .find(field => field.field === '剧情弹幕串')?.after,
            '单表 payload 新直播',
        );
        assert.deepStrictEqual(
            emittedResults[0].changedSnapshot,
            {
                sheet_live: {
                    name: '直播表',
                    content: [
                        ['row_id', '剧情弹幕串', '推角弹幕串', '对线弹幕串'],
                        [1, '单表 payload 新直播', '', ''],
                    ],
                },
            },
            '单表 payload 与最近完整快照合并后，只发布本次变化表的 changedSnapshot',
        );

        rawReadError = null;
        currentRawSnapshot = baselineRaw;
        hostEvents.callbacks.generationStarted();
        hostEvents.callbacks.messageReceived({ messageId: 12 });
        tableUpdateCallback({
            sheetKey: 'sheet_live',
            content: [
                ['row_id', '剧情弹幕串', '推角弹幕串', '对线弹幕串'],
                [1, '聊天切换前的待处理内容', '', ''],
            ],
        });
        assert.ok(fakeRuntime.getDelays().includes(500), '更新后应存在待处理 debounce');

        hostEvents.callbacks.chatChanged();

        assert.ok(!fakeRuntime.getDelays().includes(500), '聊天切换必须清理 pending payload 的 debounce');
        assert.strictEqual(emittedResults.length, 1, '聊天切换后不得发布旧聊天的 pending 结果');
        assert.strictEqual(storeModule.getReviewState().status, 'empty');
        assert.strictEqual(storeModule.getReviewState().tables.length, 0);
    } finally {
        unsubscribeResult();
        serviceModule.stopTableUpdateReviewService();
    }
}

async function checkCrossRealmRawSnapshotPipeline(
    serviceModule,
    storeModule,
    resultChannelModule,
    snapshotModule,
) {
    const createForeignSnapshot = liveText => vm.runInNewContext(`({
        sheet_live: {
            name: '直播表',
            content: [
                ['row_id', '剧情弹幕串', '推角弹幕串', '对线弹幕串'],
                [1, ${JSON.stringify(liveText)}, '', ''],
            ],
        },
        sheet_diary: {
            name: '小日记表',
            content: [
                ['row_id', '内容'],
                [1, '跨窗口日记'],
            ],
        },
    })`);
    const baselineRaw = createForeignSnapshot('跨窗口旧直播');
    const latestRaw = createForeignSnapshot('跨窗口新直播');

    assert.strictEqual(
        snapshotModule.isCompleteRawTableSnapshot(latestRaw),
        true,
        '父窗口/iframe 创建的完整表格快照也必须被识别为完整快照',
    );
    const clonedRaw = snapshotModule.cloneRawTableSnapshot(latestRaw);
    assert.notStrictEqual(clonedRaw, latestRaw, '跨窗口快照必须克隆为本模块拥有的数据');
    assert.notStrictEqual(
        clonedRaw.sheet_live,
        latestRaw.sheet_live,
        '跨窗口表对象不得按引用穿透审核与浮层边界',
    );
    assert.deepStrictEqual(
        snapshotModule.selectChangedRawTableSnapshot(latestRaw, [{
            sheetKey: 'sheet_live',
        }]),
        {
            sheet_live: {
                name: '直播表',
                content: [
                    ['row_id', '剧情弹幕串', '推角弹幕串', '对线弹幕串'],
                    [1, '跨窗口新直播', '', ''],
                ],
            },
        },
        '变化快照提取不得因父窗口对象原型不同而丢失直播表',
    );

    const fakeRuntime = createFakeRuntime();
    const hostEvents = createHostEvents();
    let currentRawSnapshot = baselineRaw;
    let tableUpdateCallback = null;
    const emittedResults = [];
    const unsubscribeResult = resultChannelModule.subscribeTableUpdateReviewResults(
        result => emittedResults.push(result),
    );

    try {
        assert.strictEqual(serviceModule.startTableUpdateReviewService({
            createRuntimeScope: () => fakeRuntime,
            createFloorWindow: () => ({ dispose() {} }),
            subscribeTableUpdate(callback) {
                tableUpdateCallback = callback;
                return () => {
                    if (tableUpdateCallback === callback) tableUpdateCallback = null;
                };
            },
            readRawSnapshot: () => currentRawSnapshot,
            ...hostEvents,
        }), true);

        hostEvents.callbacks.generationStarted();
        hostEvents.callbacks.messageReceived({ messageId: 14 });
        currentRawSnapshot = latestRaw;
        tableUpdateCallback(latestRaw);
        fakeRuntime.runNext(500);

        const committedState = storeModule.getReviewState();
        assert.strictEqual(committedState.status, 'ready');
        assert.strictEqual(committedState.changeCount, 1);
        assert.deepStrictEqual(
            committedState.tables.map(table => table.sheetKey),
            ['sheet_live'],
            '跨窗口表格更新必须正常进入审核 Store，而不是被合并成空数据库',
        );
        assert.strictEqual(emittedResults.length, 1);
        assert.strictEqual(
            emittedResults[0].changedSnapshot.sheet_live.content[1][1],
            '跨窗口新直播',
            '审核发布给浮层的权威快照必须保留跨窗口直播表更新',
        );
    } finally {
        unsubscribeResult();
        serviceModule.stopTableUpdateReviewService();
    }
}

async function main() {
    const previousWindow = global.window;
    const fakeWindow = {};
    fakeWindow.parent = fakeWindow;
    fakeWindow.TavernHelper = {
        chatId: 'table-update-review-test-chat',
        getCharData: () => ({
            name: 'table-update-review-test-character',
            avatar: 'table-update-review-test-character.png',
        }),
    };
    global.window = fakeWindow;

    try {
        const serviceModule = await import(
            `${toModuleUrl('modules/table-update-review/service.js')}?data-pipeline=${Date.now()}`
        );
        const storeModule = await import(toModuleUrl('modules/table-update-review/store.js'));
        const resultChannelModule = await import(
            toModuleUrl('modules/table-update-review/result-channel.js')
        );
        const snapshotModule = await import(
            toModuleUrl('modules/table-update-review/snapshot.js')
        );
        const sessionModule = await import(
            toModuleUrl('modules/table-update-review/session.js')
        );
        checkMergeFallbackRequiresCompleteCurrent(snapshotModule);
        checkResultChannelCloneBudget(resultChannelModule);
        checkChangedSnapshotSubscriberIsolation(resultChannelModule);
        await checkComputeUsesOneAuthoritativeRawSnapshot(serviceModule);
        await checkInvalidChangedSnapshotDoesNotPublishOrClearPending(
            serviceModule,
            storeModule,
        );
        await checkPureDeleteMayPublishWithoutCurrentSheet(serviceModule);
        await checkOwnedMergedSnapshotAvoidsDuplicateServiceClones(serviceModule);
        await checkSameFloorNewGenerationCreatesNewSession(sessionModule);
        await checkSubscriptionRecovery(serviceModule);
        await checkStopCancelsPendingSubscriptionRetry(serviceModule);
        await checkFullPayloadPublishesCommittedResult(serviceModule, storeModule, resultChannelModule);
        await checkChatKeyFollowsChatChanged(
            serviceModule,
            storeModule,
            resultChannelModule,
        );
        await checkSubscribedBrokerHealthRebind(serviceModule);
        await checkSameSessionReadyEmptyReadyPublishesTransitions(
            serviceModule,
            storeModule,
            resultChannelModule,
        );
        await checkSingleSheetPayloadMergeAndLifecycleCleanup(
            serviceModule,
            storeModule,
            resultChannelModule,
        );
        await checkCrossRealmRawSnapshotPipeline(
            serviceModule,
            storeModule,
            resultChannelModule,
            snapshotModule,
        );
        console.log('[通过] 表格更新审核数据链与结构化结果通道');
    } finally {
        if (previousWindow === undefined) {
            delete global.window;
        } else {
            global.window = previousWindow;
        }
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
