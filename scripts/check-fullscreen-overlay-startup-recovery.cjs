const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const vm = require('node:vm');

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

    tick(duration) {
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
        }
        this.now = target;
    }

    get pendingCount() {
        return this.timers.size;
    }

    get nextDelay() {
        const nextDueAt = [...this.timers.values()]
            .map(timer => timer.dueAt)
            .sort((left, right) => left - right)[0];
        return Number.isFinite(nextDueAt) ? nextDueAt - this.now : null;
    }
}

async function flushMicrotasks(turns = 8) {
    for (let index = 0; index < turns; index += 1) {
        await Promise.resolve();
    }
}

function createHarness(createFullscreenOverlayRuntime, outcomes, options = {}) {
    const clock = new FakeClock();
    const startOutcomes = [...outcomes];
    const resumeOutcomes = [...(options.resumeOutcomes || [true])];
    const snapshotOutcomes = [...(options.snapshotOutcomes || [{}])];
    const events = [];
    let startAttempts = 0;
    let resumeCount = 0;

    const coordinator = {
        start() {
            startAttempts += 1;
            const outcome = startOutcomes.length > 0
                ? startOutcomes.shift()
                : false;
            events.push(`coordinator.start:${outcome}`);
            return outcome;
        },
        suspendForChatChange() {
            events.push('coordinator.suspend');
            return true;
        },
        async resumeWithBaseline() {
            resumeCount += 1;
            const outcome = resumeOutcomes.length > 0
                ? resumeOutcomes.shift()
                : true;
            events.push(`coordinator.resume:${outcome}`);
            return outcome;
        },
        stop() {
            events.push('coordinator.stop');
        },
        getState() {
            return { started: startAttempts > 0 };
        },
    };

    const runtime = createFullscreenOverlayRuntime({
        getSettings: () => ({
            fullscreenOverlay: {
                enabled: true,
                sourceOrder: [],
                enabledSourceSheetKeys: [],
            },
        }),
        normalizeSettings: value => value,
        readSnapshot: async () => (
            snapshotOutcomes.length > 0 ? snapshotOutcomes.shift() : {}
        ),
        getSnapshotSignature: snapshot => JSON.stringify(snapshot),
        buildSourceCatalog: () => [],
        registry: {
            get() {
                return null;
            },
        },
        createLayerRuntime: () => ({
            clear() {},
            dispose() {
                events.push('layer.dispose');
            },
            getState() {
                return { mounted: true, disposed: false };
            },
        }),
        createRendererRegistry: () => new Map(),
        createScheduler: () => ({
            replace() {
                return true;
            },
            clear() {},
            dispose() {
                events.push('scheduler.dispose');
            },
            getState() {
                return { disposed: false };
            },
        }),
        createCoordinator: () => coordinator,
        coordinatorRetryDelaysMs: [1000, 2000, 5000],
        setTimeoutFn: clock.setTimeout.bind(clock),
        clearTimeoutFn: clock.clearTimeout.bind(clock),
    });

    return {
        clock,
        events,
        runtime,
        get startAttempts() {
            return startAttempts;
        },
        get resumeCount() {
            return resumeCount;
        },
    };
}

async function testUnavailableCoordinatorRecoversWithoutDuplicateStart(
    createFullscreenOverlayRuntime,
) {
    const harness = createHarness(createFullscreenOverlayRuntime, [false, false, true]);

    assert.equal(harness.runtime.start('initial-enable'), true);
    assert.equal(harness.runtime.start('duplicate-enable'), true);
    assert.equal(
        harness.startAttempts,
        1,
        '重复 start 不得绕过退避或制造第二条审核结果协调器启动恢复链',
    );
    assert.equal(harness.clock.pendingCount, 1);
    assert.equal(harness.clock.nextDelay, 1000);
    assert.deepEqual(
        {
            started: harness.runtime.getState().started,
            coordinatorStarted: harness.runtime.getState().coordinatorStarted,
            coordinatorStatus: harness.runtime.getState().coordinatorStatus,
            retryAttempt: harness.runtime.getState().coordinatorRetryAttempt,
            hasRetryTimer: harness.runtime.getState().hasCoordinatorRetryTimer,
            nextRetryDelayMs: harness.runtime.getState().nextCoordinatorRetryDelayMs,
        },
        {
            started: true,
            coordinatorStarted: false,
            coordinatorStatus: 'waiting',
            retryAttempt: 1,
            hasRetryTimer: true,
            nextRetryDelayMs: 1000,
        },
    );

    harness.clock.tick(1000);
    assert.equal(harness.startAttempts, 2);
    assert.equal(harness.clock.pendingCount, 1);
    assert.equal(harness.clock.nextDelay, 2000);

    harness.clock.tick(2000);
    await flushMicrotasks();
    assert.equal(harness.startAttempts, 3);
    assert.equal(harness.runtime.getState().coordinatorStarted, true);
    assert.equal(harness.runtime.getState().coordinatorStatus, 'ready');
    assert.equal(harness.runtime.getState().hasCoordinatorRetryTimer, false);
    assert.equal(harness.runtime.getState().nextCoordinatorRetryDelayMs, null);
    assert.equal(
        harness.clock.pendingCount,
        0,
        '审核结果协调器启动恢复成功后必须终止重试链',
    );
    assert.ok(
        harness.resumeCount >= 1,
        '审核结果协调器恢复后必须建立当前表格基线',
    );

    harness.clock.tick(30000);
    assert.equal(
        harness.startAttempts,
        3,
        '审核结果协调器启动恢复成功后不得再调用 coordinator.start()',
    );
}

async function testRetryBackoffIsCappedAndKeepsSingleTimer(
    createFullscreenOverlayRuntime,
) {
    const harness = createHarness(
        createFullscreenOverlayRuntime,
        [false, false, false, false, false],
    );
    harness.runtime.start('initial-enable');

    assert.equal(harness.clock.nextDelay, 1000);
    harness.clock.tick(1000);
    assert.equal(harness.clock.pendingCount, 1);
    assert.equal(harness.clock.nextDelay, 2000);

    harness.clock.tick(2000);
    assert.equal(harness.clock.pendingCount, 1);
    assert.equal(harness.clock.nextDelay, 5000);

    harness.clock.tick(5000);
    assert.equal(harness.clock.pendingCount, 1);
    assert.equal(
        harness.clock.nextDelay,
        5000,
        '达到退避上限后应低频持续自恢复，而不是永久放弃或无限增大延迟',
    );
    assert.equal(harness.runtime.getState().coordinatorRetryAttempt, 4);
}

async function testRecoveredSubscriptionCannotCrossExternalChatBarrier(
    createFullscreenOverlayRuntime,
) {
    const harness = createHarness(createFullscreenOverlayRuntime, [false, true]);
    harness.runtime.start('initial-enable');
    await flushMicrotasks();
    assert.equal(harness.runtime.getState().suspended, false);
    assert.equal(harness.resumeCount, 0);

    assert.equal(harness.runtime.suspendForChatChange('chat-b'), true);
    assert.equal(harness.runtime.getState().suspended, true);
    assert.equal(harness.runtime.getState().awaitingExternalChatResume, true);

    harness.clock.tick(1000);
    await flushMicrotasks();
    assert.equal(
        harness.startAttempts,
        2,
        '聊天切换屏障期间允许审核结果协调器完成启动恢复',
    );
    assert.equal(harness.runtime.getState().coordinatorStarted, true);
    assert.equal(
        harness.resumeCount,
        0,
        'API 恢复不得冒充公开 resumeAfterChatChange 越过聊天切换屏障',
    );
    assert.equal(harness.runtime.getState().suspended, true);
    assert.equal(harness.runtime.getState().coordinatorStatus, 'suspended');
    assert.equal(harness.clock.pendingCount, 0, '等待外部恢复时不得安排基线同步 timer');

    harness.clock.tick(30000);
    await flushMicrotasks();
    assert.equal(harness.resumeCount, 0);
    assert.equal(harness.runtime.getState().suspended, true);

    assert.equal(await harness.runtime.resumeAfterChatChange({}), true);
    assert.equal(harness.resumeCount, 1);
    assert.equal(harness.runtime.getState().awaitingExternalChatResume, false);
    assert.equal(harness.runtime.getState().suspended, false);
    assert.equal(harness.runtime.getState().coordinatorStatus, 'ready');
}

async function testBaselineSynchronizationRetriesUntilReady(
    createFullscreenOverlayRuntime,
) {
    const harness = createHarness(createFullscreenOverlayRuntime, [true], {
        resumeOutcomes: [false, false, false, false, true],
    });
    harness.runtime.start('initial-enable');
    await flushMicrotasks();

    assert.equal(harness.resumeCount, 1);
    assert.equal(harness.runtime.getState().suspended, true);
    assert.equal(
        harness.runtime.getState().coordinatorStatus,
        'synchronizing',
        '订阅成功但基线未同步时不得伪装 ready',
    );
    assert.equal(harness.runtime.getState().hasBaselineSyncRetryTimer, true);
    assert.equal(harness.runtime.getState().nextBaselineSyncRetryDelayMs, 1000);
    assert.equal(harness.clock.nextDelay, 1000);

    harness.clock.tick(1000);
    await flushMicrotasks();
    assert.equal(harness.resumeCount, 2);
    assert.equal(harness.runtime.getState().coordinatorStatus, 'synchronizing');
    assert.equal(harness.runtime.getState().nextBaselineSyncRetryDelayMs, 2000);

    harness.clock.tick(2000);
    await flushMicrotasks();
    assert.equal(harness.resumeCount, 3);
    assert.equal(harness.runtime.getState().coordinatorStatus, 'synchronizing');
    assert.equal(harness.runtime.getState().nextBaselineSyncRetryDelayMs, 5000);

    harness.clock.tick(5000);
    await flushMicrotasks();
    assert.equal(harness.resumeCount, 4);
    assert.equal(harness.runtime.getState().coordinatorStatus, 'synchronizing');
    assert.equal(
        harness.runtime.getState().nextBaselineSyncRetryDelayMs,
        5000,
        '基线同步退避达到上限后必须保持低频封顶重试',
    );

    harness.clock.tick(5000);
    await flushMicrotasks();
    assert.equal(harness.resumeCount, 5);
    assert.equal(harness.runtime.getState().coordinatorStatus, 'ready');
    assert.equal(harness.runtime.getState().suspended, false);
    assert.equal(harness.runtime.getState().hasBaselineSyncRetryTimer, false);
    assert.equal(harness.runtime.getState().nextBaselineSyncRetryDelayMs, null);
    assert.equal(harness.clock.pendingCount, 0);
}

async function testNonPlainSnapshotsStaySynchronizingUntilValid(
    createFullscreenOverlayRuntime,
) {
    const harness = createHarness(createFullscreenOverlayRuntime, [true], {
        snapshotOutcomes: [
            null,
            undefined,
            [],
            new Map(),
            new Date('2026-08-29T00:00:00.000Z'),
            {},
        ],
    });
    harness.runtime.start('initial-enable');
    await flushMicrotasks();

    assert.equal(harness.resumeCount, 0, 'null 快照不得提交给协调器作为有效基线');
    assert.equal(harness.runtime.getState().coordinatorBaselineReady, false);
    assert.equal(harness.runtime.getState().coordinatorStatus, 'synchronizing');
    assert.equal(harness.runtime.getState().nextBaselineSyncRetryDelayMs, 1000);

    const retryDelays = [1000, 2000, 5000, 5000];
    for (const delayMs of retryDelays) {
        harness.clock.tick(delayMs);
        await flushMicrotasks();
        assert.equal(
            harness.resumeCount,
            0,
            'undefined、数组、Map、Date 等非普通对象不得把基线伪装为 ready',
        );
        assert.equal(harness.runtime.getState().coordinatorBaselineReady, false);
        assert.equal(harness.runtime.getState().coordinatorStatus, 'synchronizing');
    }

    assert.equal(harness.runtime.getState().nextBaselineSyncRetryDelayMs, 5000);
    harness.clock.tick(5000);
    await flushMicrotasks();
    assert.equal(harness.resumeCount, 1, '合法空普通对象必须允许作为真实空数据库基线');
    assert.equal(harness.runtime.getState().coordinatorBaselineReady, true);
    assert.equal(harness.runtime.getState().coordinatorStatus, 'ready');
    assert.equal(harness.runtime.getState().hasBaselineSyncRetryTimer, false);
}

async function testCrossRealmSnapshotResumesAutomaticRuntime(
    createFullscreenOverlayRuntime,
) {
    const parentWindowSnapshot = vm.runInNewContext(`({
        sheet_live: {
            name: '直播表',
            content: [
                ['row_id', '剧情弹幕串', '推角弹幕串', '对线弹幕串'],
                [1, '父窗口直播内容', '', ''],
            ],
        },
    })`);
    const harness = createHarness(createFullscreenOverlayRuntime, [true], {
        snapshotOutcomes: [parentWindowSnapshot],
    });

    harness.runtime.start('initial-enable');
    await flushMicrotasks();

    assert.equal(
        harness.resumeCount,
        1,
        'window.parent/iframe 创建的合法数据库快照必须恢复审核结果协调器',
    );
    assert.equal(harness.runtime.getState().suspended, false);
    assert.equal(harness.runtime.getState().coordinatorBaselineReady, true);
    assert.equal(harness.runtime.getState().coordinatorStatus, 'ready');
    assert.equal(
        harness.runtime.getState().hasBaselineSyncRetryTimer,
        false,
        '跨窗口合法快照不得让自动浮层永久停留在 synchronizing 重试',
    );
    assert.equal(harness.clock.pendingCount, 0);
}

async function testChatSuspendAndStopClearBaselineSynchronizationTimer(
    createFullscreenOverlayRuntime,
) {
    const chatHarness = createHarness(createFullscreenOverlayRuntime, [true], {
        resumeOutcomes: [false, true],
    });
    chatHarness.runtime.start('initial-enable');
    await flushMicrotasks();
    assert.equal(chatHarness.clock.pendingCount, 1);
    assert.equal(chatHarness.runtime.getState().hasBaselineSyncRetryTimer, true);

    chatHarness.runtime.suspendForChatChange('chat-b');
    assert.equal(
        chatHarness.clock.pendingCount,
        0,
        '外部 chat suspend 必须清理待执行的基线同步 timer',
    );
    assert.equal(chatHarness.runtime.getState().hasBaselineSyncRetryTimer, false);
    chatHarness.clock.tick(30000);
    await flushMicrotasks();
    assert.equal(chatHarness.resumeCount, 1);

    assert.equal(await chatHarness.runtime.resumeAfterChatChange({}), true);
    assert.equal(chatHarness.resumeCount, 2);
    assert.equal(chatHarness.runtime.getState().coordinatorStatus, 'ready');

    const stopHarness = createHarness(createFullscreenOverlayRuntime, [true], {
        resumeOutcomes: [false, true],
    });
    stopHarness.runtime.start('initial-enable');
    await flushMicrotasks();
    assert.equal(stopHarness.clock.pendingCount, 1);

    stopHarness.runtime.stop('extension-disabled');
    assert.equal(
        stopHarness.clock.pendingCount,
        0,
        'stop 必须清理待执行的基线同步 timer',
    );
    stopHarness.clock.tick(30000);
    await flushMicrotasks();
    assert.equal(stopHarness.resumeCount, 1);
}

async function testStopClearsPendingRecoveryTimer(createFullscreenOverlayRuntime) {
    const harness = createHarness(createFullscreenOverlayRuntime, [false, true]);
    harness.runtime.start('initial-enable');
    assert.equal(harness.clock.pendingCount, 1);

    assert.equal(harness.runtime.stop('extension-disabled'), true);
    assert.equal(
        harness.clock.pendingCount,
        0,
        'disabled/stop 必须清理审核结果协调器启动恢复 timer',
    );
    assert.deepEqual(
        {
            started: harness.runtime.getState().started,
            coordinatorStarted: harness.runtime.getState().coordinatorStarted,
            coordinatorStatus: harness.runtime.getState().coordinatorStatus,
            hasRetryTimer: harness.runtime.getState().hasCoordinatorRetryTimer,
        },
        {
            started: false,
            coordinatorStarted: false,
            coordinatorStatus: 'stopped',
            hasRetryTimer: false,
        },
    );

    harness.clock.tick(30000);
    await flushMicrotasks();
    assert.equal(
        harness.startAttempts,
        1,
        'stop 后过期 timer 不得复活审核结果协调器',
    );
}

async function main() {
    const modulePath = path.resolve(
        __dirname,
        '..',
        'modules',
        'fullscreen-overlay',
        'runtime.js',
    );
    const { createFullscreenOverlayRuntime } = await import(
        `${pathToFileURL(modulePath).href}?t=${Date.now()}`
    );

    await testUnavailableCoordinatorRecoversWithoutDuplicateStart(
        createFullscreenOverlayRuntime,
    );
    await testRetryBackoffIsCappedAndKeepsSingleTimer(
        createFullscreenOverlayRuntime,
    );
    await testRecoveredSubscriptionCannotCrossExternalChatBarrier(
        createFullscreenOverlayRuntime,
    );
    await testBaselineSynchronizationRetriesUntilReady(
        createFullscreenOverlayRuntime,
    );
    await testNonPlainSnapshotsStaySynchronizingUntilValid(
        createFullscreenOverlayRuntime,
    );
    await testCrossRealmSnapshotResumesAutomaticRuntime(
        createFullscreenOverlayRuntime,
    );
    await testChatSuspendAndStopClearBaselineSynchronizationTimer(
        createFullscreenOverlayRuntime,
    );
    await testStopClearsPendingRecoveryTimer(createFullscreenOverlayRuntime);

    console.log('[通过] 全屏浮层审核结果协调器启动恢复检查');
}

main().catch((error) => {
    console.error('[失败] 全屏浮层审核结果协调器启动恢复检查');
    console.error(error);
    process.exitCode = 1;
});
