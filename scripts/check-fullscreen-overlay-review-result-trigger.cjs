const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

class FakeClock {
    constructor() {
        this.now = 0;
        this.nextId = 1;
        this.timers = new Map();
    }

    setTimeout(callback, delay = 0) {
        const id = this.nextId;
        this.nextId += 1;
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
                    left[1].dueAt - right[1].dueAt || left[0] - right[0]
                ))[0];
            if (!next) break;
            const [id, timer] = next;
            this.timers.delete(id);
            this.now = timer.dueAt;
            timer.callback();
            await flushMicrotasks();
        }
        this.now = target;
        await flushMicrotasks();
    }
}

async function importModule(relativePath) {
    const modulePath = path.resolve(__dirname, '..', relativePath);
    return import(`${pathToFileURL(modulePath).href}?review-result=${Date.now()}-${Math.random()}`);
}

async function flushMicrotasks(turns = 16) {
    for (let index = 0; index < turns; index += 1) {
        await Promise.resolve();
    }
}

function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return {
        promise,
        resolve,
        reject,
    };
}

function makeRawSnapshot({
    plot = '新剧情',
    character = '新推角',
    conflict = '新对线',
    diary = '新日记',
} = {}) {
    return {
        sheet_live: {
            name: '直播表',
            content: [
                ['剧情弹幕串', '推角弹幕串', '对线弹幕串'],
                [plot, character, conflict],
            ],
        },
        sheet_diary: {
            name: '小日记表',
            content: [
                ['内容'],
                [diary],
            ],
        },
    };
}

function createReadyResult({
    sessionKey = 'chat-a:floor-12',
    chatKey = '',
    livePlot = '新剧情',
    liveCharacter = '新推角',
    liveConflict = '新对线',
    diaryAfter = '新日记',
    createdAt = 100,
    changedSnapshot = makeRawSnapshot({
        plot: livePlot,
        character: liveCharacter,
        conflict: liveConflict,
        diary: diaryAfter,
    }),
} = {}) {
    return {
        status: 'ready',
        sessionKey,
        chatKey,
        changedSnapshot,
        floorId: 12,
        createdAt,
        updatedAt: createdAt + 1,
        message: `本楼检测于 ${createdAt}`,
        tableCount: 2,
        changeCount: 2,
        tables: [
            {
                sheetKey: 'sheet_live',
                tableName: '直播表',
                changeCount: 1,
                changes: [{
                    type: 'update',
                    rowKey: 'live-row',
                    rowId: 'live-1',
                    rowIndex: 0,
                    createdAt,
                    fields: [{
                        field: '剧情弹幕串',
                        before: '旧剧情',
                        after: livePlot,
                    }],
                }],
            },
            {
                sheetKey: 'sheet_diary',
                tableName: '小日记表',
                changeCount: 1,
                changes: [{
                    type: 'update',
                    rowKey: 'diary-row',
                    rowId: 'diary-1',
                    rowIndex: 0,
                    createdAt,
                    fields: [{
                        field: '内容',
                        before: '旧日记',
                        after: diaryAfter,
                    }],
                }],
            },
        ],
    };
}

function createEmptyResult({
    sessionKey = 'chat-a:floor-12',
    chatKey = '',
    createdAt = 100,
} = {}) {
    return {
        status: 'empty',
        sessionKey,
        chatKey,
        floorId: 12,
        createdAt,
        updatedAt: createdAt + 1,
        message: '本楼没有审核差异',
        tableCount: 0,
        changeCount: 0,
        tables: [],
    };
}

function createCumulativeLiveResult({
    sessionKey = 'chat-a:floor-cumulative',
    chatKey = 'chat-a',
    changes = [],
    rows = [
        ['第一行剧情', '', ''],
        ['第二行剧情', '', ''],
    ],
} = {}) {
    return {
        status: 'ready',
        sessionKey,
        chatKey,
        changedSnapshot: {
            sheet_live: {
                name: '直播表',
                content: [
                    ['剧情弹幕串', '推角弹幕串', '对线弹幕串'],
                    ...rows,
                ],
            },
        },
        tables: [{
            sheetKey: 'sheet_live',
            tableName: '直播表',
            changes,
        }],
    };
}

function createLiveRowChange({
    rowIndex,
    rowId,
    after,
    type = 'update',
}) {
    return {
        type,
        rowKey: `live-row-${rowId}`,
        rowId,
        rowIndex,
        fields: [{
            field: '剧情弹幕串',
            before: `旧-${rowId}`,
            after,
        }],
    };
}

function keepReadyResultTables(result, sheetKeys) {
    const allowedSheetKeys = new Set(sheetKeys);
    return {
        ...result,
        changedSnapshot: Object.fromEntries(
            Object.entries(result.changedSnapshot ?? {})
                .filter(([sheetKey]) => allowedSheetKeys.has(sheetKey)),
        ),
        tables: result.tables.filter(table => allowedSheetKeys.has(table.sheetKey)),
    };
}

async function testReadyResultUsesAuthoritativeChangedSnapshotAndRowScope() {
    const { createReviewResultCoordinator } = await importModule(
        'modules/fullscreen-overlay/review-result-coordinator.js',
    );
    const clock = new FakeClock();
    let reviewCallback = null;
    const authoritativeSnapshot = {
        sheet_live: {
            name: '直播表',
            content: [
                ['剧情弹幕串', '推角弹幕串', '对线弹幕串'],
                ['本楼第一行', '', ''],
                ['', '本楼第二行', ''],
            ],
        },
        sheet_diary: {
            name: '小日记表',
            content: [
                ['内容'],
            ],
        },
    };
    const stableCalls = [];
    let acceptStableSnapshot = false;
    const coordinator = createReviewResultCoordinator({
        subscribeResults(callback) {
            reviewCallback = callback;
            return () => {
                reviewCallback = null;
            };
        },
        readSnapshot() {
            throw new Error('审核结果消费不得重新读取数据库快照');
        },
        async onStableSnapshot(snapshot, metadata) {
            stableCalls.push({ snapshot, metadata });
            return acceptStableSnapshot;
        },
        setTimeout: clock.setTimeout.bind(clock),
        clearTimeout: clock.clearTimeout.bind(clock),
    });

    const readyResult = {
        status: 'ready',
        sessionKey: 'chat-a:floor-authoritative',
        chatKey: 'chat-a',
        changedSnapshot: authoritativeSnapshot,
        tables: [
            {
                sheetKey: 'sheet_live',
                tableName: '直播表',
                changes: [
                    { type: 'update', rowIndex: 3, rowId: 'live-2', fields: [] },
                    { type: 'insert', rowIndex: 1, rowId: 'live-1', fields: [] },
                    { type: 'update', rowIndex: 3, rowId: 'live-2', fields: [] },
                    { type: 'update', rowIndex: '2', rowId: 'live-10', fields: [] },
                ],
            },
            {
                sheetKey: 'sheet_diary',
                tableName: '小日记表',
                changes: [
                    { type: 'delete', rowIndex: 0, rowId: 'diary-1', fields: [] },
                ],
            },
        ],
    };

    try {
        assert.equal(coordinator.start(), true);
        assert.equal(await coordinator.resumeWithBaseline({}), true);
        assert.equal(reviewCallback(readyResult), true);
        await flushMicrotasks();

        assert.equal(
            stableCalls.length,
            1,
            'ready result 必须直接进入统一播放 seam，不能依赖数据库重读',
        );
        assert.strictEqual(
            stableCalls[0].snapshot,
            authoritativeSnapshot,
            'changedSnapshot 必须作为同一份权威快照直接交给 onStableSnapshot',
        );
        assert.deepEqual(
            stableCalls[0].metadata.changedSheetKeys,
            ['sheet_live', 'sheet_diary'],
        );
        assert.deepEqual(
            stableCalls[0].metadata.changedRowsBySheetKey,
            {
                sheet_live: {
                    rowIndexes: [1, 2, 3],
                    rowIds: ['live-1', 'live-10', 'live-2'],
                },
                sheet_diary: {
                    rowIndexes: [],
                    rowIds: [],
                },
            },
            '行范围必须按物理表聚合、去重并排序；没有当前行的变化也必须保留空选择',
        );
        assert.equal(coordinator.getState().nextRetryDelayMs, 1000);

        acceptStableSnapshot = true;
        await clock.tick(1000);
        assert.equal(stableCalls.length, 2, 'runtime 拒绝时必须重试同一审核结果');
        assert.strictEqual(
            stableCalls[1].snapshot,
            authoritativeSnapshot,
            '失败重试必须继续使用原 ready result 携带的同一份权威快照',
        );
        assert.deepEqual(
            stableCalls[1].metadata.changedRowsBySheetKey,
            stableCalls[0].metadata.changedRowsBySheetKey,
        );
        assert.equal(coordinator.getState().acceptedSignatureCount, 2);
        assert.equal(coordinator.getState().hasRetryTimer, false);
    } finally {
        coordinator.stop();
    }
}

async function testReadyResultRequiresConsumableSnapshotForCurrentRows() {
    const { createReviewResultCoordinator } = await importModule(
        'modules/fullscreen-overlay/review-result-coordinator.js',
    );
    const clock = new FakeClock();
    let reviewCallback = null;
    const stableCalls = [];
    const coordinator = createReviewResultCoordinator({
        subscribeResults(callback) {
            reviewCallback = callback;
            return () => {
                reviewCallback = null;
            };
        },
        async onStableSnapshot(snapshot, metadata) {
            stableCalls.push({ snapshot, metadata });
            return true;
        },
        setTimeout: clock.setTimeout.bind(clock),
        clearTimeout: clock.clearTimeout.bind(clock),
    });

    const malformedSnapshots = [
        {},
        { sheet_live: null },
        { sheet_live: [] },
        { sheet_live: {} },
        { sheet_live: { content: {} } },
        { sheet_live: { content: [] } },
        { sheet_live: { content: ['剧情弹幕串'] } },
    ];

    try {
        coordinator.start();
        await coordinator.resumeWithBaseline({});

        for (const changedSnapshot of malformedSnapshots) {
            assert.equal(
                reviewCallback(keepReadyResultTables(createReadyResult({
                    changedSnapshot,
                }), ['sheet_live'])),
                false,
                '含 insert/update 的表缺少可消费 sheet/content/header 时必须立即拒绝',
            );
        }
        await flushMicrotasks();

        assert.equal(stableCalls.length, 0, '结构错误不得进入统一播放 seam');
        assert.equal(coordinator.getState().hasPendingResult, false);
        assert.equal(coordinator.getState().hasRetryTimer, false);
        assert.equal(coordinator.getState().retryAttempt, 0);
        assert.equal(coordinator.getState().acceptedSignatureCount, 0);
        assert.equal(clock.timers.size, 0, '结构错误不得进入失败重试');

        const pureDeleteResult = {
            status: 'ready',
            sessionKey: 'chat-a:floor-delete-only',
            chatKey: 'chat-a',
            tables: [{
                sheetKey: 'sheet_live',
                tableName: '直播表',
                changes: [{
                    type: 'delete',
                    rowKey: 'live-row',
                    rowId: 'live-1',
                    rowIndex: 0,
                    fields: [],
                }],
            }],
        };
        assert.equal(
            reviewCallback(pureDeleteResult),
            true,
            '纯 delete 的 ready 结果可以不携带当前表快照',
        );
        await flushMicrotasks();

        assert.equal(stableCalls.length, 1);
        assert.deepEqual(
            stableCalls[0].snapshot,
            {},
            '纯 delete 缺少 changedSnapshot 时应以空的当前快照进入统一 seam',
        );
        assert.deepEqual(stableCalls[0].metadata.changedSheetKeys, ['sheet_live']);
        assert.deepEqual(
            stableCalls[0].metadata.changedRowsBySheetKey,
            {
                sheet_live: {
                    rowIndexes: [],
                    rowIds: [],
                },
            },
            'delete 不得映射到更新后的当前快照行',
        );
        assert.equal(coordinator.getState().acceptedSignatureCount, 1);
    } finally {
        coordinator.stop();
    }
}

async function testInitialSuspensionBuffersLatestReadyResultOnly() {
    const { createReviewResultCoordinator } = await importModule(
        'modules/fullscreen-overlay/review-result-coordinator.js',
    );
    let reviewCallback = null;
    let snapshotReads = 0;
    const stableCalls = [];
    const coordinator = createReviewResultCoordinator({
        subscribeResults(callback) {
            reviewCallback = callback;
            return () => {
                reviewCallback = null;
            };
        },
        readSnapshot() {
            snapshotReads += 1;
            return makeRawSnapshot({ plot: '初始化期间最新剧情' });
        },
        async onStableSnapshot(_snapshot, metadata) {
            stableCalls.push(metadata);
            return true;
        },
    });

    try {
        assert.equal(coordinator.start(), true);
        assert.equal(
            coordinator.suspendForChatChange(),
            true,
            'Runtime 建立首次基线前的 suspend 调用必须保持初始化同步语义',
        );
        reviewCallback(createReadyResult({
            livePlot: '初始化期间旧剧情',
            createdAt: 100,
        }));
        reviewCallback(createReadyResult({
            livePlot: '初始化期间最新剧情',
            createdAt: 200,
        }));
        await flushMicrotasks();

        assert.equal(snapshotReads, 0, '初始化基线 suspended 期间不得提前读取快照');
        assert.equal(stableCalls.length, 0, '初始化基线 suspended 期间不得提前触发 runtime');
        assert.equal(
            coordinator.getState().hasPendingResult,
            true,
            '初始化基线 suspended 期间必须缓存最新 ready result',
        );

        assert.equal(await coordinator.resumeWithBaseline({}), true);
        await flushMicrotasks();
        assert.equal(snapshotReads, 0, '首次基线恢复后必须直接消费 ready result 携带的 changedSnapshot');
        assert.equal(stableCalls.length, 1);
        assert.equal(
            stableCalls[0].reviewResult.tables[0].changes[0].fields[0].after,
            '初始化期间最新剧情',
            '初始化 suspended 期间只能保留最新审核结果',
        );

        coordinator.suspendForChatChange();
        reviewCallback(createReadyResult({
            livePlot: '聊天切换期间不得保留',
            createdAt: 300,
        }));
        await flushMicrotasks();
        assert.equal(
            coordinator.getState().hasPendingResult,
            false,
            '聊天切换 suspended 期间必须丢弃旧会话审核结果',
        );
        await coordinator.resumeWithBaseline({});
        await flushMicrotasks();
        assert.equal(snapshotReads, 0, '聊天切换期间丢弃的结果不得在恢复后补播或重读数据库');
        assert.equal(stableCalls.length, 1);
    } finally {
        coordinator.stop();
    }

    let raceReviewCallback = null;
    let raceSnapshotReads = 0;
    let raceStableCalls = 0;
    const raceCoordinator = createReviewResultCoordinator({
        subscribeResults(callback) {
            raceReviewCallback = callback;
            return () => {
                raceReviewCallback = null;
            };
        },
        readSnapshot() {
            raceSnapshotReads += 1;
            return makeRawSnapshot();
        },
        async onStableSnapshot() {
            raceStableCalls += 1;
            return true;
        },
    });

    try {
        raceCoordinator.start();
        raceCoordinator.suspendForChatChange();
        raceReviewCallback(createReadyResult({ livePlot: '首次基线期间的旧聊天结果' }));
        assert.equal(raceCoordinator.getState().hasPendingResult, true);

        raceCoordinator.suspendForChatChange();
        assert.equal(
            raceCoordinator.getState().hasPendingResult,
            false,
            '首次基线尚未完成时发生真实聊天切换，也必须清掉旧聊天 pending',
        );
        raceReviewCallback(createReadyResult({ livePlot: '聊天切换暂停期间的新结果' }));
        await raceCoordinator.resumeWithBaseline({});
        await flushMicrotasks();
        assert.equal(raceSnapshotReads, 0);
        assert.equal(raceStableCalls, 0, '聊天切换暂停期间的结果不得因首次基线竞态而补播');
    } finally {
        raceCoordinator.stop();
    }
}

async function testAcceptedDuplicateDoesNotCancelDifferentPending() {
    const { createReviewResultCoordinator } = await importModule(
        'modules/fullscreen-overlay/review-result-coordinator.js',
    );
    const clock = new FakeClock();
    let reviewCallback = null;
    let acceptStableSnapshot = true;
    let stableAttempts = 0;
    const stableResults = [];
    const coordinator = createReviewResultCoordinator({
        subscribeResults(callback) {
            reviewCallback = callback;
            return () => {
                reviewCallback = null;
            };
        },
        async onStableSnapshot(_snapshot, metadata) {
            stableAttempts += 1;
            if (!acceptStableSnapshot) return false;
            stableResults.push(metadata.reviewResult);
            return true;
        },
        setTimeout: clock.setTimeout.bind(clock),
        clearTimeout: clock.clearTimeout.bind(clock),
    });

    try {
        coordinator.start();
        await coordinator.resumeWithBaseline({});
        reviewCallback(createReadyResult({ createdAt: 100 }));
        await flushMicrotasks();
        assert.equal(stableResults.length, 1);

        acceptStableSnapshot = false;
        reviewCallback(createReadyResult({
            livePlot: '等待快照的新剧情 B',
            createdAt: 200,
        }));
        await flushMicrotasks();
        assert.equal(stableAttempts, 2);
        assert.equal(coordinator.getState().hasPendingResult, true);
        assert.equal(coordinator.getState().retryAttempt, 1);
        assert.equal(coordinator.getState().nextRetryDelayMs, 1000);
        const [retryTimerId, retryTimer] = [...clock.timers.entries()][0];

        reviewCallback(createReadyResult({ createdAt: 300 }));
        await flushMicrotasks();
        assert.equal(
            stableAttempts,
            2,
            '旧 accepted A 重复发布不得让 pending B 立即重试',
        );
        assert.equal(
            coordinator.getState().hasPendingResult,
            true,
            '旧 accepted A 不得取消语义不同的 pending B',
        );
        assert.equal(coordinator.getState().retryAttempt, 1);
        assert.equal(coordinator.getState().nextRetryDelayMs, 1000);
        assert.equal(
            clock.timers.has(retryTimerId),
            true,
            '旧 accepted A 不得清除 pending B 已有的 retry timer',
        );
        assert.equal(
            clock.timers.get(retryTimerId)?.dueAt,
            retryTimer.dueAt,
            '旧 accepted A 不得重建或延后 pending B 的 retry timer',
        );

        acceptStableSnapshot = true;
        await clock.tick(1000);
        assert.equal(stableAttempts, 3);
        assert.equal(stableResults.length, 2, '原 pending B 必须按原退避计划继续消费');
        assert.equal(
            stableResults[1].tables[0].changes[0].fields[0].after,
            '等待快照的新剧情 B',
        );
    } finally {
        coordinator.stop();
    }
}

async function testEmptyResultResetsOnlyItsSessionWithoutSnapshot() {
    const { createReviewResultCoordinator } = await importModule(
        'modules/fullscreen-overlay/review-result-coordinator.js',
    );
    const clock = new FakeClock();
    let reviewCallback = null;
    let acceptStableSnapshot = true;
    let stableAttempts = 0;
    const stableResults = [];
    const coordinator = createReviewResultCoordinator({
        subscribeResults(callback) {
            reviewCallback = callback;
            return () => {
                reviewCallback = null;
            };
        },
        async onStableSnapshot(_snapshot, metadata) {
            stableAttempts += 1;
            if (!acceptStableSnapshot) return false;
            stableResults.push(metadata.reviewResult);
            return true;
        },
        setTimeout: clock.setTimeout.bind(clock),
        clearTimeout: clock.clearTimeout.bind(clock),
    });

    try {
        coordinator.start();
        await coordinator.resumeWithBaseline({});
        reviewCallback(createReadyResult({ createdAt: 100 }));
        await flushMicrotasks();
        assert.equal(stableAttempts, 1);
        assert.equal(stableResults.length, 1);
        assert.equal(coordinator.getState().acceptedSignatureCount, 2);

        assert.equal(
            reviewCallback(createEmptyResult({ createdAt: 200 })),
            true,
            '合法 empty 结果必须被协调器消费',
        );
        await flushMicrotasks();
        assert.equal(stableAttempts, 1, 'empty 不得触碰 changedSnapshot 消费 seam');
        assert.equal(stableResults.length, 1, 'empty 不得触碰 Runtime/Scheduler seam');
        assert.equal(coordinator.getState().acceptedSignatureCount, 0);
        assert.equal(coordinator.getState().acceptedSessionKey, '');

        reviewCallback(createReadyResult({ createdAt: 300 }));
        await flushMicrotasks();
        assert.equal(stableAttempts, 2);
        assert.equal(stableResults.length, 2, 'ready A → empty → ready A 必须再次触发');

        acceptStableSnapshot = false;
        reviewCallback(createReadyResult({
            livePlot: '将被 empty 取消的 pending B',
            createdAt: 400,
        }));
        await flushMicrotasks();
        assert.equal(stableAttempts, 3);
        assert.equal(coordinator.getState().hasPendingResult, true);
        assert.equal(coordinator.getState().nextRetryDelayMs, 1000);

        reviewCallback(createEmptyResult({ createdAt: 500 }));
        await flushMicrotasks();
        assert.equal(stableAttempts, 3);
        assert.equal(stableResults.length, 2);
        assert.equal(coordinator.getState().hasPendingResult, false);
        assert.equal(coordinator.getState().hasRetryTimer, false);
        assert.equal(coordinator.getState().retryAttempt, 0);
        assert.equal(clock.timers.size, 0, 'empty 必须清掉同 session pending 的 retry timer');

        await clock.tick(5000);
        assert.equal(stableAttempts, 3, '被 empty 取消的 pending 不得从旧 timer 恢复');
        assert.equal(stableResults.length, 2);
    } finally {
        coordinator.stop();
    }
}

async function testEmptyResultRespectsInitialAndChatSuspensionModes() {
    const { createReviewResultCoordinator } = await importModule(
        'modules/fullscreen-overlay/review-result-coordinator.js',
    );
    let reviewCallback = null;
    let snapshotReads = 0;
    let stableCalls = 0;
    const coordinator = createReviewResultCoordinator({
        subscribeResults(callback) {
            reviewCallback = callback;
            return () => {
                reviewCallback = null;
            };
        },
        readSnapshot() {
            snapshotReads += 1;
            return makeRawSnapshot();
        },
        async onStableSnapshot() {
            stableCalls += 1;
            return true;
        },
    });

    try {
        coordinator.start();
        coordinator.suspendForChatChange();
        reviewCallback(createReadyResult({ livePlot: '初始化期间待取消的 ready' }));
        assert.equal(coordinator.getState().hasPendingResult, true);
        assert.equal(
            reviewCallback(createEmptyResult()),
            true,
            'initial suspended 期间必须允许 empty 应用到缓存状态',
        );
        assert.equal(coordinator.getState().hasPendingResult, false);
        await coordinator.resumeWithBaseline({});
        await flushMicrotasks();
        assert.equal(snapshotReads, 0);
        assert.equal(stableCalls, 0, 'initial 期间被 empty 收敛掉的 ready 不得在恢复后播放');

        coordinator.suspendForChatChange('chat-next');
        assert.equal(reviewCallback(createEmptyResult()), false, 'chatKey 为空的 empty 必须丢弃');
        assert.equal(
            reviewCallback(createReadyResult({
                chatKey: 'chat-old',
                livePlot: '聊天暂停期间的旧 ready',
            })),
            false,
            '旧聊天 ready 必须丢弃',
        );
        assert.equal(
            reviewCallback(createEmptyResult({ chatKey: 'chat-next' })),
            true,
            'chat suspended 期间必须消费 expectedChatKey 匹配的 empty',
        );
        await coordinator.resumeWithBaseline({});
        await flushMicrotasks();
        assert.equal(snapshotReads, 0);
        assert.equal(stableCalls, 0, '匹配 empty 只收敛状态，不得读取快照或触碰 runtime');
    } finally {
        coordinator.stop();
    }
}

async function testChatKeyParticipatesInSemanticSignature() {
    const { createReviewResultCoordinator } = await importModule(
        'modules/fullscreen-overlay/review-result-coordinator.js',
    );
    let reviewCallback = null;
    const stableCalls = [];
    const coordinator = createReviewResultCoordinator({
        subscribeResults(callback) {
            reviewCallback = callback;
            return () => {
                reviewCallback = null;
            };
        },
        readSnapshot() {
            return makeRawSnapshot();
        },
        async onStableSnapshot(_snapshot, metadata) {
            stableCalls.push(metadata);
            return true;
        },
    });

    try {
        coordinator.start();
        await coordinator.resumeWithBaseline({});
        reviewCallback(createReadyResult({
            chatKey: 'chat-a',
            createdAt: 100,
        }));
        await flushMicrotasks();
        reviewCallback(createReadyResult({
            chatKey: 'chat-b',
            createdAt: 200,
        }));
        await flushMicrotasks();

        assert.equal(
            stableCalls.length,
            2,
            '同 session、同表差异但 chatKey 不同时必须视为不同审核语义',
        );
        assert.equal(stableCalls[0].reviewResult.chatKey, 'chat-a');
        assert.equal(stableCalls[1].reviewResult.chatKey, 'chat-b');
    } finally {
        coordinator.stop();
    }
}

async function testChatSuspensionCachesOnlyExpectedChatResult() {
    const { createReviewResultCoordinator } = await importModule(
        'modules/fullscreen-overlay/review-result-coordinator.js',
    );
    let reviewCallback = null;
    let snapshotReads = 0;
    const stableCalls = [];
    const coordinator = createReviewResultCoordinator({
        subscribeResults(callback) {
            reviewCallback = callback;
            return () => {
                reviewCallback = null;
            };
        },
        readSnapshot() {
            snapshotReads += 1;
            return makeRawSnapshot({ plot: '新聊天最终剧情' });
        },
        async onStableSnapshot(_snapshot, metadata) {
            stableCalls.push(metadata);
            return true;
        },
    });

    try {
        coordinator.start();
        await coordinator.resumeWithBaseline({});
        coordinator.suspendForChatChange('chat-new');
        assert.equal(coordinator.getState().suspensionMode, 'chat');
        assert.equal(
            coordinator.getState().expectedChatKey,
            'chat-new',
            'chat suspended 必须记录 Runtime 传入的新聊天键',
        );

        assert.equal(
            reviewCallback(createReadyResult({
                chatKey: '',
                livePlot: '空 chatKey',
            })),
            false,
        );
        assert.equal(
            reviewCallback(createReadyResult({
                chatKey: 'chat-old',
                livePlot: '旧聊天剧情',
            })),
            false,
        );
        assert.equal(
            reviewCallback(createEmptyResult({ chatKey: 'chat-old' })),
            false,
        );
        assert.equal(
            coordinator.getState().hasPendingResult,
            false,
            '空、旧聊天和 mismatch 结果都不得进入 pending',
        );

        assert.equal(
            reviewCallback(createReadyResult({
                chatKey: 'chat-new',
                livePlot: '将被匹配 empty 收敛的剧情',
                createdAt: 200,
            })),
            true,
        );
        assert.equal(coordinator.getState().hasPendingResult, true);
        assert.equal(
            reviewCallback(createEmptyResult({
                chatKey: 'chat-new',
                createdAt: 300,
            })),
            true,
            '匹配新聊天的 empty 必须成为最新状态并取消较早 ready',
        );
        assert.equal(coordinator.getState().hasPendingResult, false);
        assert.equal(snapshotReads, 0, 'chat suspended 期间不得提前读取快照');

        assert.equal(
            reviewCallback(createReadyResult({
                chatKey: 'chat-new',
                livePlot: '新聊天最终剧情',
                createdAt: 400,
            })),
            true,
        );
        assert.equal(coordinator.getState().hasPendingResult, true);

        await coordinator.resumeWithBaseline({});
        await flushMicrotasks();
        assert.equal(snapshotReads, 0);
        assert.equal(stableCalls.length, 1, 'resume 后必须只消费匹配新聊天的最新 ready');
        assert.equal(stableCalls[0].reviewResult.chatKey, 'chat-new');
        assert.equal(
            stableCalls[0].reviewResult.tables[0].changes[0].fields[0].after,
            '新聊天最终剧情',
        );
        assert.equal(coordinator.getState().expectedChatKey, '');
    } finally {
        coordinator.stop();
    }
}

async function testPendingSemanticDuplicatePreservesBackoff() {
    const { createReviewResultCoordinator } = await importModule(
        'modules/fullscreen-overlay/review-result-coordinator.js',
    );
    const clock = new FakeClock();
    let reviewCallback = null;
    let stableAttempts = 0;
    const coordinator = createReviewResultCoordinator({
        subscribeResults(callback) {
            reviewCallback = callback;
            return () => {
                reviewCallback = null;
            };
        },
        async onStableSnapshot() {
            stableAttempts += 1;
            return false;
        },
        setTimeout: clock.setTimeout.bind(clock),
        clearTimeout: clock.clearTimeout.bind(clock),
    });

    try {
        coordinator.start();
        await coordinator.resumeWithBaseline({});
        reviewCallback(createReadyResult({ createdAt: 100 }));
        await flushMicrotasks();
        assert.equal(stableAttempts, 1);
        assert.equal(coordinator.getState().retryAttempt, 1);
        assert.equal(coordinator.getState().nextRetryDelayMs, 1000);

        reviewCallback(createReadyResult({ createdAt: 200 }));
        await flushMicrotasks();
        assert.equal(
            stableAttempts,
            1,
            '与 pending 语义相同的重复结果不得立即重试权威快照',
        );
        assert.equal(
            coordinator.getState().retryAttempt,
            1,
            '与 pending 语义相同的重复结果不得重置 retryAttempt',
        );
        assert.equal(coordinator.getState().nextRetryDelayMs, 1000);
        assert.equal(clock.timers.size, 1, '语义重复结果不得清除或重建当前 retry timer');

        await clock.tick(1000);
        assert.equal(stableAttempts, 2);
        assert.equal(coordinator.getState().retryAttempt, 2);
        assert.equal(coordinator.getState().nextRetryDelayMs, 2000);

        reviewCallback(createReadyResult({ createdAt: 300 }));
        await flushMicrotasks();
        assert.equal(stableAttempts, 2);
        assert.equal(coordinator.getState().retryAttempt, 2);
        assert.equal(
            coordinator.getState().nextRetryDelayMs,
            2000,
            '重复发布不得把 2 秒退避打回 1 秒',
        );

        reviewCallback(createReadyResult({
            livePlot: '不同 pending 剧情',
            createdAt: 400,
        }));
        await flushMicrotasks();
        assert.equal(stableAttempts, 3, '不同语义的新结果必须替换旧 pending 并立即消费自身权威快照');
        assert.equal(coordinator.getState().retryAttempt, 1);
        assert.equal(
            coordinator.getState().nextRetryDelayMs,
            1000,
            '不同语义的新 pending 必须从 1 秒退避重新开始',
        );
        assert.equal(clock.timers.size, 1);
    } finally {
        coordinator.stop();
    }
}

async function testStopRestartKeepsProcessingTaskOwnershipIsolated() {
    const { createReviewResultCoordinator } = await importModule(
        'modules/fullscreen-overlay/review-result-coordinator.js',
    );
    const firstAcceptance = createDeferred();
    const restartedAcceptance = createDeferred();
    let reviewCallback = null;
    let stableAttempts = 0;
    const coordinator = createReviewResultCoordinator({
        subscribeResults(callback) {
            reviewCallback = callback;
            return () => {
                reviewCallback = null;
            };
        },
        async onStableSnapshot() {
            stableAttempts += 1;
            if (stableAttempts === 1) return firstAcceptance.promise;
            if (stableAttempts === 2) return restartedAcceptance.promise;
            throw new Error('不应发生重复 changedSnapshot 消费');
        },
    });

    try {
        coordinator.start();
        await coordinator.resumeWithBaseline({});
        reviewCallback(createReadyResult({ livePlot: '旧运行任务' }));
        await flushMicrotasks();
        assert.equal(stableAttempts, 1);
        assert.equal(coordinator.getState().processing, true);

        coordinator.stop();
        coordinator.start();
        await coordinator.resumeWithBaseline({});
        reviewCallback(createReadyResult({ livePlot: '重启后的新任务' }));
        await flushMicrotasks();
        assert.equal(stableAttempts, 2);
        assert.equal(coordinator.getState().processing, true);

        firstAcceptance.resolve(true);
        await flushMicrotasks();
        assert.equal(
            stableAttempts,
            2,
            'stop 前旧异步任务的 finally 不得释放重启后新任务的 processing 所有权并重复 process',
        );
        assert.equal(
            coordinator.getState().acceptedSignatureCount,
            0,
            'generation 失效的旧任务不得提交审核签名',
        );
        assert.equal(
            coordinator.getState().processing,
            true,
            '旧任务结束不得把重启后仍在消费权威快照的新任务标记为空闲',
        );

        restartedAcceptance.resolve(true);
        await flushMicrotasks();
        assert.equal(stableAttempts, 2);
        assert.equal(
            coordinator.getState().acceptedSignatureCount,
            2,
            '重启后的当前任务必须且只能提交一次完整审核签名',
        );
        assert.equal(coordinator.getState().processing, false);
    } finally {
        coordinator.stop();
    }
}

async function testAcceptedSignaturesConvergeToCompleteReadyResultSet() {
    const { createReviewResultCoordinator } = await importModule(
        'modules/fullscreen-overlay/review-result-coordinator.js',
    );
    let reviewCallback = null;
    const stableCalls = [];
    const coordinator = createReviewResultCoordinator({
        subscribeResults(callback) {
            reviewCallback = callback;
            return () => {
                reviewCallback = null;
            };
        },
        readSnapshot() {
            return makeRawSnapshot();
        },
        async onStableSnapshot(_snapshot, metadata) {
            stableCalls.push(metadata);
            return true;
        },
    });

    try {
        coordinator.start();
        await coordinator.resumeWithBaseline({});
        reviewCallback(createReadyResult({ createdAt: 100 }));
        await flushMicrotasks();
        assert.equal(stableCalls.length, 1);
        assert.equal(coordinator.getState().acceptedSignatureCount, 2);

        reviewCallback(keepReadyResultTables(
            createReadyResult({ createdAt: 200 }),
            ['sheet_diary'],
        ));
        await flushMicrotasks();
        assert.equal(
            stableCalls.length,
            2,
            'ready result 的表集合缩小时仍必须完成一次无播放确认以提交完整结果集合',
        );
        assert.deepEqual(
            stableCalls[1].changedSheetKeys,
            [],
            '仅差异消失不应把任何来源误报为本次新增变化',
        );
        assert.equal(
            coordinator.getState().acceptedSignatureCount,
            1,
            '成功接受后必须移除当前 ready result 已不再包含的表签名',
        );

        reviewCallback(createReadyResult({ createdAt: 300 }));
        await flushMicrotasks();
        assert.equal(stableCalls.length, 3, '消失的直播表差异再次出现时必须重新触发');
        assert.deepEqual(
            stableCalls[2].changedSheetKeys,
            ['sheet_live'],
            '重新出现时只应标记重新出现的直播表，不得重播未变化的小日记表',
        );
    } finally {
        coordinator.stop();
    }
}

async function testCumulativeReadyResultsEmitOnlyNewOrChangedRows() {
    const { createReviewResultCoordinator } = await importModule(
        'modules/fullscreen-overlay/review-result-coordinator.js',
    );
    let reviewCallback = null;
    const stableCalls = [];
    const coordinator = createReviewResultCoordinator({
        subscribeResults(callback) {
            reviewCallback = callback;
            return () => {
                reviewCallback = null;
            };
        },
        async onStableSnapshot(_snapshot, metadata) {
            stableCalls.push(metadata);
            return true;
        },
    });
    const row0V1 = createLiveRowChange({
        rowIndex: 0,
        rowId: 'live-1',
        after: '第一行第一版',
    });
    const row0V2 = createLiveRowChange({
        rowIndex: 0,
        rowId: 'live-1',
        after: '第一行第二版',
    });
    const row1V1 = createLiveRowChange({
        rowIndex: 1,
        rowId: 'live-2',
        after: '第二行第一版',
    });

    try {
        coordinator.start();
        await coordinator.resumeWithBaseline({});

        reviewCallback(createCumulativeLiveResult({
            changes: [row0V1],
        }));
        await flushMicrotasks();
        assert.deepEqual(
            stableCalls[0].changedRowsBySheetKey.sheet_live,
            {
                rowIndexes: [0],
                rowIds: ['live-1'],
            },
        );

        reviewCallback(createCumulativeLiveResult({
            changes: [row0V1, row1V1],
        }));
        await flushMicrotasks();
        assert.deepEqual(
            stableCalls[1].changedRowsBySheetKey.sheet_live,
            {
                rowIndexes: [1],
                rowIds: ['live-2'],
            },
            '累计审核结果第二次只能播放相对已接受基线新出现的行',
        );

        reviewCallback(createCumulativeLiveResult({
            changes: [row0V2, row1V1],
        }));
        await flushMicrotasks();
        assert.deepEqual(
            stableCalls[2].changedRowsBySheetKey.sheet_live,
            {
                rowIndexes: [0],
                rowIds: ['live-1'],
            },
            '同一行 after 内容签名再次变化时必须重新播放该行',
        );

        reviewCallback(createCumulativeLiveResult({
            changes: [row1V1],
        }));
        await flushMicrotasks();
        assert.deepEqual(
            stableCalls[3].changedRowsBySheetKey.sheet_live,
            {
                rowIndexes: [],
                rowIds: [],
            },
            '累计结果移除旧 change 时不得误播其他行，但仍需提交完整新基线',
        );

        reviewCallback(createCumulativeLiveResult({
            changes: [row0V2, row1V1],
        }));
        await flushMicrotasks();
        assert.deepEqual(
            stableCalls[4].changedRowsBySheetKey.sheet_live,
            {
                rowIndexes: [0],
                rowIds: ['live-1'],
            },
            '成功接受后必须替换完整 change 基线，已从基线消失的 change 再出现时应视为新增',
        );
    } finally {
        coordinator.stop();
    }
}

async function testDeleteWithoutStableRowIdFailsClosedForCurrentRowScope() {
    const { createReviewResultCoordinator } = await importModule(
        'modules/fullscreen-overlay/review-result-coordinator.js',
    );
    let reviewCallback = null;
    const stableCalls = [];
    const coordinator = createReviewResultCoordinator({
        subscribeResults(callback) {
            reviewCallback = callback;
            return () => {
                reviewCallback = null;
            };
        },
        async onStableSnapshot(_snapshot, metadata) {
            stableCalls.push(metadata.changedRowsBySheetKey.sheet_live);
            return true;
        },
    });

    try {
        coordinator.start();
        await coordinator.resumeWithBaseline({});

        reviewCallback(createCumulativeLiveResult({
            sessionKey: 'chat-a:floor-delete-without-row-id',
            changes: [
                {
                    type: 'update',
                    rowKey: 'row-index:0',
                    rowId: '',
                    rowIndex: 0,
                    fields: [{
                        field: '剧情弹幕串',
                        before: '将被删除剧情',
                        after: '保留行剧情',
                    }],
                },
                {
                    type: 'delete',
                    rowKey: 'row-index:1',
                    rowId: '',
                    rowIndex: 1,
                    fields: [],
                },
            ],
            rows: [
                ['保留行剧情', '保留行推角', '保留行对线'],
            ],
        }));
        await flushMicrotasks();

        assert.deepEqual(
            stableCalls[0],
            {
                rowIndexes: [],
                rowIds: [],
            },
            '同批存在无稳定 rowId 的 delete 时，当前快照行身份不可靠，必须整表失败关闭为空选择',
        );

        reviewCallback(createCumulativeLiveResult({
            sessionKey: 'chat-a:floor-delete-with-stable-row-id',
            changes: [
                createLiveRowChange({
                    type: 'delete',
                    rowIndex: 0,
                    rowId: 'live-1',
                    after: '',
                }),
                createLiveRowChange({
                    rowIndex: 1,
                    rowId: 'live-2',
                    after: '稳定更新行',
                }),
            ],
        }));
        await flushMicrotasks();

        assert.deepEqual(
            stableCalls[1],
            {
                rowIndexes: [1],
                rowIds: ['live-2'],
            },
            '稳定 rowId 的 delete 不应阻断同批其他稳定 update，只播放当前仍存在的 update 行',
        );
    } finally {
        coordinator.stop();
    }
}

async function testAcceptedChangeBaselineClearsOnEmptyStopAndChatReset() {
    const { createReviewResultCoordinator } = await importModule(
        'modules/fullscreen-overlay/review-result-coordinator.js',
    );
    let reviewCallback = null;
    const stableCalls = [];
    const coordinator = createReviewResultCoordinator({
        subscribeResults(callback) {
            reviewCallback = callback;
            return () => {
                reviewCallback = null;
            };
        },
        async onStableSnapshot(_snapshot, metadata) {
            stableCalls.push(metadata.changedRowsBySheetKey.sheet_live);
            return true;
        },
    });
    const readyResult = createCumulativeLiveResult({
        changes: [createLiveRowChange({
            rowIndex: 0,
            rowId: 'live-1',
            after: '相同累计变化',
        })],
    });
    const expectedFullRowScope = {
        rowIndexes: [0],
        rowIds: ['live-1'],
    };

    try {
        coordinator.start();
        await coordinator.resumeWithBaseline({});
        reviewCallback(readyResult);
        await flushMicrotasks();

        reviewCallback(createEmptyResult({
            sessionKey: readyResult.sessionKey,
            chatKey: readyResult.chatKey,
        }));
        reviewCallback(readyResult);
        await flushMicrotasks();
        assert.deepEqual(
            stableCalls[1],
            expectedFullRowScope,
            'empty 必须清理已接受 change 基线',
        );

        coordinator.suspendForChatChange(readyResult.chatKey);
        reviewCallback(readyResult);
        await coordinator.resumeWithBaseline({});
        await flushMicrotasks();
        assert.deepEqual(
            stableCalls[2],
            expectedFullRowScope,
            'chat reset 必须清理已接受 change 基线',
        );

        coordinator.stop();
        coordinator.start();
        await coordinator.resumeWithBaseline({});
        reviewCallback(readyResult);
        await flushMicrotasks();
        assert.deepEqual(
            stableCalls[3],
            expectedFullRowScope,
            'stop/restart 必须清理已接受 change 基线',
        );
    } finally {
        coordinator.stop();
    }
}

async function testBlockingCoordinatorRegressions() {
    const cases = [
        ['ready 权威快照合同与纯 delete 行范围', testReadyResultRequiresConsumableSnapshotForCurrentRows],
        ['初始化 suspended 缓存与聊天切换丢弃', testInitialSuspensionBuffersLatestReadyResultOnly],
        ['旧 accepted 不得取消不同 pending', testAcceptedDuplicateDoesNotCancelDifferentPending],
        ['empty 清除同 session 审核状态', testEmptyResultResetsOnlyItsSessionWithoutSnapshot],
        ['empty 遵守 initial/chat 暂停边界', testEmptyResultRespectsInitialAndChatSuspensionModes],
        ['chatKey 参与审核语义签名', testChatKeyParticipatesInSemanticSignature],
        ['chat suspended 只缓存匹配新聊天结果', testChatSuspensionCachesOnlyExpectedChatResult],
        ['pending 语义重复保持退避', testPendingSemanticDuplicatePreservesBackoff],
        ['stop/restart processing 所有权隔离', testStopRestartKeepsProcessingTaskOwnershipIsolated],
        ['acceptedSignatures 完整集合收敛', testAcceptedSignaturesConvergeToCompleteReadyResultSet],
        ['累计审核结果只发新增或内容变化行', testCumulativeReadyResultsEmitOnlyNewOrChangedRows],
        ['无稳定 rowId 删除位移失败关闭', testDeleteWithoutStableRowIdFailsClosedForCurrentRowScope],
        ['accepted change 基线在 empty/stop/chat reset 清理', testAcceptedChangeBaselineClearsOnEmptyStopAndChatReset],
    ];
    const failures = [];
    for (const [name, testCase] of cases) {
        try {
            await testCase();
        } catch (error) {
            error.message = `${name}: ${error.message}`;
            failures.push(error);
        }
    }
    if (failures.length > 0) {
        throw new AggregateError(failures, '全屏浮层审核结果协调器存在阻断回归');
    }
}

async function testReviewResultSemanticDeduplication() {
    const { createReviewResultCoordinator } = await importModule(
        'modules/fullscreen-overlay/review-result-coordinator.js',
    );

    let reviewCallback = null;
    const stableCalls = [];
    const coordinator = createReviewResultCoordinator({
        subscribeResults(callback) {
            reviewCallback = callback;
            return () => {
                reviewCallback = null;
            };
        },
        readSnapshot() {
            return {
                sheet_live: { name: '直播表', content: [['剧情弹幕串'], ['新剧情']] },
                sheet_diary: { name: '小日记表', content: [['内容'], ['新日记']] },
            };
        },
        async onStableSnapshot(snapshot, metadata) {
            stableCalls.push({ snapshot, metadata });
            return true;
        },
    });

    assert.equal(coordinator.start(), true);
    assert.equal(await coordinator.resumeWithBaseline({}), true);
    assert.equal(typeof reviewCallback, 'function');

    reviewCallback(createReadyResult());
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(stableCalls.length, 1, '首次审核结果必须触发一次稳定快照消费');
    assert.deepEqual(
        [...stableCalls[0].metadata.changedSheetKeys].sort(),
        ['sheet_diary', 'sheet_live'],
        '首次审核结果应携带所有发生语义差异的物理表',
    );

    reviewCallback(createReadyResult({
        createdAt: 999,
    }));
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(
        stableCalls.length,
        1,
        '仅时间、消息和统计变化的重复审核结果不得重播',
    );

    reviewCallback(createReadyResult({
        diaryAfter: '第二版日记',
        createdAt: 1200,
    }));
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(stableCalls.length, 2);
    assert.deepEqual(
        [...stableCalls[1].metadata.changedSheetKeys],
        ['sheet_diary'],
        '其他表的新差异不得让旧直播表再次进入 changedSheetKeys',
    );

    reviewCallback(createReadyResult({
        livePlot: '第二版剧情',
        diaryAfter: '第二版日记',
        createdAt: 1400,
    }));
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(stableCalls.length, 3);
    assert.deepEqual(
        [...stableCalls[2].metadata.changedSheetKeys],
        ['sheet_live'],
        '同楼同表出现新语义差异时必须允许再次触发',
    );

    reviewCallback(createReadyResult({
        sessionKey: 'chat-b:floor-2',
        livePlot: '第二版剧情',
        diaryAfter: '第二版日记',
        createdAt: 1600,
    }));
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(stableCalls.length, 4, '新审核会话必须允许相同表差异重新触发');
    assert.equal(
        coordinator.getState().acceptedSignatureCount,
        2,
        '协调器只保留当前审核会话签名，不能随楼层无限增长',
    );

    coordinator.stop();
    assert.equal(reviewCallback, null, '停止协调器必须注销审核结果订阅');
}

async function testSnapshotRetryAndCommitAfterAcceptance() {
    const { createReviewResultCoordinator } = await importModule(
        'modules/fullscreen-overlay/review-result-coordinator.js',
    );
    const clock = new FakeClock();
    let reviewCallback = null;
    let acceptStableSnapshot = false;
    let stableCalls = 0;
    const consumedSnapshots = [];

    const coordinator = createReviewResultCoordinator({
        subscribeResults(callback) {
            reviewCallback = callback;
            return () => {
                reviewCallback = null;
            };
        },
        async onStableSnapshot(snapshot) {
            stableCalls += 1;
            consumedSnapshots.push(snapshot);
            return acceptStableSnapshot;
        },
        setTimeout: clock.setTimeout.bind(clock),
        clearTimeout: clock.clearTimeout.bind(clock),
    });

    coordinator.start();
    await coordinator.resumeWithBaseline({});
    reviewCallback(createReadyResult());
    await flushMicrotasks();

    assert.equal(
        stableCalls,
        1,
        'ready result 必须立即尝试消费自身 changedSnapshot',
    );
    assert.equal(coordinator.getState().nextRetryDelayMs, 1000);

    await clock.tick(1000);
    assert.equal(stableCalls, 2, '首次 1 秒重试应重新消费相同审核结果');
    assert.equal(coordinator.getState().acceptedSignatureCount, 0, 'runtime 拒绝时不得提交签名');
    assert.equal(coordinator.getState().nextRetryDelayMs, 2000);

    await clock.tick(2000);
    assert.equal(stableCalls, 3);
    assert.equal(coordinator.getState().acceptedSignatureCount, 0);
    assert.equal(coordinator.getState().nextRetryDelayMs, 5000);

    acceptStableSnapshot = true;
    await clock.tick(5000);
    assert.equal(stableCalls, 4);
    assert.ok(
        consumedSnapshots.every(snapshot => snapshot === consumedSnapshots[0]),
        '所有失败重试必须复用首次 ready result 携带的同一 changedSnapshot',
    );
    assert.equal(coordinator.getState().acceptedSignatureCount, 2, '仅 runtime 接受成功后提交签名');
    assert.equal(coordinator.getState().hasRetryTimer, false);

    reviewCallback(createReadyResult({ createdAt: 9999 }));
    await flushMicrotasks();
    assert.equal(stableCalls, 4, '成功提交后的重复审核结果不得重播');
    coordinator.stop();
}

async function testLatestReviewResultSupersedesPendingRetry() {
    const { createReviewResultCoordinator } = await importModule(
        'modules/fullscreen-overlay/review-result-coordinator.js',
    );
    const clock = new FakeClock();
    let reviewCallback = null;
    const consumedResults = [];

    const coordinator = createReviewResultCoordinator({
        subscribeResults(callback) {
            reviewCallback = callback;
            return () => {
                reviewCallback = null;
            };
        },
        async onStableSnapshot(_snapshot, metadata) {
            if (metadata.reviewResult.tables[0].changes[0].fields[0].after === '将被替换的剧情') {
                return false;
            }
            consumedResults.push(metadata.reviewResult);
            return true;
        },
        setTimeout: clock.setTimeout.bind(clock),
        clearTimeout: clock.clearTimeout.bind(clock),
    });

    coordinator.start();
    await coordinator.resumeWithBaseline({});
    reviewCallback(createReadyResult({ livePlot: '将被替换的剧情' }));
    await flushMicrotasks();
    assert.equal(coordinator.getState().nextRetryDelayMs, 1000);

    reviewCallback(createReadyResult({
        livePlot: '最终剧情',
        diaryAfter: '最终日记',
        createdAt: 5000,
    }));
    await flushMicrotasks();

    assert.equal(consumedResults.length, 1, '新审核结果必须替换尚未成功消费的旧 pending');
    assert.equal(consumedResults[0].tables[0].changes[0].fields[0].after, '最终剧情');
    assert.equal(coordinator.getState().hasRetryTimer, false);
    assert.equal(clock.timers.size, 0, '被替换的旧审核结果不得残留 retry timer');
    coordinator.stop();
}

async function testRuntimeBuildsOnlyReviewChangedSources() {
    const [
        { createFullscreenOverlayRuntime },
        { createReviewResultCoordinator },
        {
            normalizeFullscreenOverlaySettings,
            SCROLLING_BARRAGE_MODEL_ID,
            TABLE_POPUP_MODEL_ID,
        },
        { createOverlaySourceRegistry },
        { buildOverlaySourceCatalog },
        { createLiveTableSourceAdapter },
        { createGenericTableSourceAdapter },
    ] = await Promise.all([
        importModule('modules/fullscreen-overlay/runtime.js'),
        importModule('modules/fullscreen-overlay/review-result-coordinator.js'),
        importModule('modules/fullscreen-overlay/settings.js'),
        importModule('modules/fullscreen-overlay/source-registry.js'),
        importModule('modules/fullscreen-overlay/source-catalog.js'),
        importModule('modules/fullscreen-overlay/sources/live-table.js'),
        importModule('modules/fullscreen-overlay/sources/generic-table.js'),
    ]);

    let snapshot = makeRawSnapshot();
    let reviewCallback = null;
    const replacements = [];
    const appends = [];
    const registry = createOverlaySourceRegistry([
        createLiveTableSourceAdapter(),
        createGenericTableSourceAdapter(),
    ]);
    let settings = normalizeFullscreenOverlaySettings({
        enabled: true,
        sourceOrder: ['sheet_live', 'sheet_diary'],
        sourceEnabledBySheetKey: {
            sheet_live: true,
            sheet_diary: false,
        },
    });

    const runtime = createFullscreenOverlayRuntime({
        settingKey: 'fullscreenOverlay',
        normalizeSettings: normalizeFullscreenOverlaySettings,
        getSettings: () => ({ fullscreenOverlay: settings }),
        readSnapshot: () => snapshot,
        getSnapshotSignature: value => JSON.stringify(value),
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
            [TABLE_POPUP_MODEL_ID, {
                refreshSettings() {},
                pause() {},
                resume() {},
                clear() {},
                dispose() {},
            }],
        ]),
        createScheduler: () => ({
            async replace(batches) {
                replacements.push(batches);
                return true;
            },
            async append(batches) {
                appends.push(batches);
                return true;
            },
            clear() {},
            dispose() {},
            getState() {
                return {};
            },
        }),
        createCoordinator: ({
            readSnapshot,
            onStableSnapshot,
        }) => createReviewResultCoordinator({
            subscribeResults(callback) {
                reviewCallback = callback;
                return () => {
                    reviewCallback = null;
                };
            },
            readSnapshot,
            onStableSnapshot,
        }),
        logger: {
            debug() {},
            warn() {},
        },
    });

    runtime.start('review-result-integration');
    await flushMicrotasks();
    replacements.length = 0;

    reviewCallback(createReadyResult());
    await flushMicrotasks();

    const firstNonEmpty = replacements.find(batches => batches.length > 0);
    assert.ok(firstNonEmpty, '审核结果明确直播表变化时必须构造非空来源批次');
    assert.equal(firstNonEmpty.length, 1);
    assert.equal(firstNonEmpty[0].sheetKey, 'sheet_live');
    assert.deepEqual(
        firstNonEmpty[0].items.map(item => item.text),
        ['新剧情', '新推角', '新对线'],
    );

    const nonEmptyCount = replacements.filter(batches => batches.length > 0).length;
    const replacementCountBeforeUnsupportedChange = replacements.length;
    snapshot = makeRawSnapshot({ diary: '第二版日记' });
    reviewCallback(createReadyResult({
        diaryAfter: '第二版日记',
        createdAt: 1200,
    }));
    await flushMicrotasks();
    assert.equal(
        replacements.filter(batches => batches.length > 0).length,
        nonEmptyCount,
        '只有其他表产生新审核差异时不得重播旧直播表',
    );
    assert.equal(
        replacements.length,
        replacementCountBeforeUnsupportedChange,
        '审核结果仅包含未勾选来源时必须确认结果但不得以 replace([]) 打断正在发射的来源',
    );

    settings = normalizeFullscreenOverlaySettings({
        ...settings,
        sourceEnabledBySheetKey: {
            ...settings.sourceEnabledBySheetKey,
            sheet_diary: true,
        },
    });
    runtime.refreshSettings(settings);
    snapshot = makeRawSnapshot({ diary: '第三版日记' });
    reviewCallback(createReadyResult({
        diaryAfter: '第三版日记',
        createdAt: 1300,
    }));
    await flushMicrotasks();
    assert.equal(appends.length, 1, '同一楼层后来出现的新来源必须累计到现有队列');
    assert.deepEqual(
        appends[0].map(batch => batch.sheetKey),
        ['sheet_diary'],
        '同楼累计只能追加本次首次出现的来源',
    );

    snapshot = makeRawSnapshot({ plot: '第二版剧情', diary: '第二版日记' });
    reviewCallback(createReadyResult({
        livePlot: '第二版剧情',
        diaryAfter: '第二版日记',
        createdAt: 1400,
    }));
    await flushMicrotasks();
    assert.equal(
        replacements.filter(batches => batches.length > 0).length,
        nonEmptyCount,
        '同楼已经排入播放状态的直播表不得因派生更新重新替换整条队列',
    );
    assert.equal(appends.length, 1, '同楼已排入的来源不得重复追加');

    const replacementCountBeforeEmptyEvents = replacements.length;
    snapshot = makeRawSnapshot({
        plot: '',
        character: '',
        conflict: '',
        diary: '第二版日记',
    });
    reviewCallback(createReadyResult({
        livePlot: '',
        liveCharacter: '',
        liveConflict: '',
        diaryAfter: '第二版日记',
        createdAt: 1600,
    }));
    await flushMicrotasks();
    assert.equal(
        replacements.length,
        replacementCountBeforeEmptyEvents,
        '同楼已累计来源后续变为空时不得清空其他尚未播放的来源',
    );

    const replacementCountBeforeUncheckedChange = replacements.length;
    settings = normalizeFullscreenOverlaySettings({
        ...settings,
        sourceEnabledBySheetKey: {
            ...settings.sourceEnabledBySheetKey,
            sheet_live: false,
            sheet_diary: false,
        },
    });
    runtime.refreshSettings(settings);
    snapshot = makeRawSnapshot({
        plot: '未勾选来源的新剧情',
        diary: '第二版日记',
    });
    reviewCallback(createReadyResult({
        livePlot: '未勾选来源的新剧情',
        diaryAfter: '第二版日记',
        createdAt: 1800,
    }));
    await flushMicrotasks();
    assert.equal(
        replacements.length,
        replacementCountBeforeUncheckedChange,
        '审核结果只命中未勾选来源时必须确认结果但不得触碰 Scheduler',
    );

    settings = normalizeFullscreenOverlaySettings({
        ...settings,
        sourceEnabledBySheetKey: {
            ...settings.sourceEnabledBySheetKey,
            sheet_live: true,
        },
    });
    runtime.refreshSettings(settings);
    snapshot = makeRawSnapshot({ plot: '新楼剧情', diary: '第二版日记' });
    reviewCallback(createReadyResult({
        sessionKey: 'chat-a:floor-13',
        livePlot: '新楼剧情',
        diaryAfter: '第二版日记',
        createdAt: 2000,
    }));
    await flushMicrotasks();
    assert.equal(
        replacements.length,
        replacementCountBeforeUncheckedChange + 1,
        '换楼层必须重新 replace，不能沿用上一楼的累计播放状态',
    );

    settings = normalizeFullscreenOverlaySettings({
        ...settings,
        sourceEnabledBySheetKey: {
            ...settings.sourceEnabledBySheetKey,
            sheet_live: false,
        },
    });
    runtime.refreshSettings(settings);
    const testResult = await runtime.testSelectedSources(snapshot);
    assert.equal(
        testResult.reason,
        'no-selected-supported-source',
        '测试按钮仍应直接读取当前快照，当前快照无可播放事件时返回既有空来源结果',
    );
    runtime.stop('review-result-integration-finished');
    assert.equal(reviewCallback, null);
}

function testProductionIndexUsesReviewResultChannel() {
    const indexPath = path.resolve(__dirname, '..', 'modules/fullscreen-overlay/index.js');
    const source = fs.readFileSync(indexPath, 'utf8');
    const createCoordinatorStart = source.indexOf('createCoordinator:');
    const createCoordinatorEnd = source.indexOf('\n    logger:', createCoordinatorStart);
    const createCoordinatorWiring = (
        createCoordinatorStart >= 0 && createCoordinatorEnd > createCoordinatorStart
            ? source.slice(createCoordinatorStart, createCoordinatorEnd)
            : ''
    );
    assert.equal(
        source.includes("from '../phone-core/callbacks.js'"),
        false,
        '生产 Overlay 不得再直接 import table-fill-start/table-update callbacks',
    );
    assert.equal(source.includes('subscribeTableFillStart'), false);
    assert.equal(/\bsubscribeTableUpdate\s*\(/.test(source), false);
    assert.equal(
        source.includes("subscribeTableUpdateReviewResults")
            && source.includes("from '../table-update-review/result-channel.js'"),
        true,
        '生产 Overlay 必须从审核 result-channel 订阅结构化审核结果',
    );
    assert.equal(
        source.includes("from './review-result-coordinator.js'"),
        true,
        '生产 Overlay 必须通过审核结果 coordinator 接入现有 createCoordinator seam',
    );
    assert.equal(
        /\bcreateTableUpdateCoordinator\b/.test(source)
            || /from\s+['"].*table-update-coordinator\.js['"]/.test(source),
        false,
        '旧 table-update coordinator 可以保留文件，但生产 index 禁止重新导入、创建或接回它',
    );
    assert.notEqual(
        createCoordinatorWiring,
        '',
        '生产 Overlay 必须保留可静态检查的 createCoordinator 接线',
    );
    assert.equal(
        /\breadSnapshot\b/.test(createCoordinatorWiring),
        false,
        '生产 createCoordinator 接线不得再向审核结果协调器传 readSnapshot',
    );
    assert.equal(
        /\bgetSnapshotSignature\b/.test(createCoordinatorWiring),
        false,
        '生产 createCoordinator 接线不得再向审核结果协调器传 getSnapshotSignature',
    );
}

async function testChronicleTodayRelationOnlyUpdatesAreSilent() {
    const { createReviewResultCoordinator } = await importModule(
        'modules/fullscreen-overlay/review-result-coordinator.js',
    );
    let reviewCallback = null;
    const stableCalls = [];
    const coordinator = createReviewResultCoordinator({
        subscribeResults(callback) {
            reviewCallback = callback;
            return () => {
                reviewCallback = null;
            };
        },
        async onStableSnapshot(_snapshot, metadata) {
            stableCalls.push(metadata);
            return true;
        },
    });

    try {
        coordinator.start();
        await coordinator.resumeWithBaseline({});
        reviewCallback({
            status: 'ready',
            sessionKey: 'chat-a:floor-chronicle',
            chatKey: 'chat-a',
            changedSnapshot: {
                sheet_chronicle: {
                    name: '纪要表',
                    content: [
                        ['row_id', '与今天的关系', '概览'],
                        ['1', '昨天', '旧纪要一'],
                        ['2', '3天前', '旧纪要二'],
                        ['3', '今天', '真实修改'],
                        ['4', '今天', '本楼新增'],
                    ],
                },
            },
            tables: [{
                sheetKey: 'sheet_chronicle',
                tableName: '纪要表',
                changes: [{
                    type: 'update',
                    rowKey: '1',
                    rowId: '1',
                    rowIndex: 0,
                    fields: [{ field: '与今天的关系', before: '前天', after: '昨天' }],
                }, {
                    type: 'update',
                    rowKey: '2',
                    rowId: '2',
                    rowIndex: 1,
                    fields: [{ field: 'today_relation', before: '2天前', after: '3天前' }],
                }, {
                    type: 'update',
                    rowKey: '3',
                    rowId: '3',
                    rowIndex: 2,
                    fields: [
                        { field: '与今天的关系', before: '昨天', after: '今天' },
                        { field: '概览', before: '旧内容', after: '真实修改' },
                    ],
                }, {
                    type: 'insert',
                    rowKey: '4',
                    rowId: '4',
                    rowIndex: 3,
                    fields: [{ field: '概览', before: '', after: '本楼新增' }],
                }],
            }],
        });
        await flushMicrotasks();

        assert.deepEqual(
            stableCalls[0].changedRowsBySheetKey.sheet_chronicle,
            {
                rowIndexes: [2, 3],
                rowIds: ['3', '4'],
            },
            '纪要仅更新“与今天的关系”的旧行必须静默，真实修改与新增仍需播放',
        );
    } finally {
        coordinator.stop();
    }
}

async function main() {
    await testReadyResultUsesAuthoritativeChangedSnapshotAndRowScope();
    await testChronicleTodayRelationOnlyUpdatesAreSilent();
    await testBlockingCoordinatorRegressions();
    await testReviewResultSemanticDeduplication();
    await testSnapshotRetryAndCommitAfterAcceptance();
    await testLatestReviewResultSupersedesPendingRetry();
    await testRuntimeBuildsOnlyReviewChangedSources();
    testProductionIndexUsesReviewResultChannel();
    console.log('[通过] 全屏浮层审核结果触发专项检查');
}

main().catch((error) => {
    console.error('[失败] 全屏浮层审核结果触发专项检查');
    console.error(error);
    process.exitCode = 1;
});
