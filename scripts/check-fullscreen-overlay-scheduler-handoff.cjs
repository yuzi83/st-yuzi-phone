const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = process.cwd();

function moduleUrl(relativePath) {
    return `${pathToFileURL(path.join(ROOT, relativePath)).href}?t=${Date.now()}-${Math.random()}`;
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

async function flushAsync() {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(resolve => setImmediate(resolve));
}

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
            const dueTimer = [...this.timers.entries()]
                .filter(([, timer]) => timer.dueAt <= target)
                .sort((left, right) => {
                    const dueDifference = left[1].dueAt - right[1].dueAt;
                    return dueDifference || left[0] - right[0];
                })[0];
            if (!dueTimer) break;
            const [id, timer] = dueTimer;
            this.timers.delete(id);
            this.now = timer.dueAt;
            timer.callback();
        }
        this.now = target;
    }
}

async function testRendererResolveHandsOffAfterShortDefaultGap() {
    const { createFullscreenOverlayScheduler } = await import(
        moduleUrl('modules/fullscreen-overlay/scheduler.js')
    );
    const clock = new FakeClock();
    const handoffs = new Map();
    const visualCleanups = new Map();
    const visualCleanupSettled = new Map();
    const starts = [];
    const renderer = {
        play(batch) {
            starts.push(batch.sourceId);
            const handoff = createDeferred();
            const visualCleanup = createDeferred();
            handoffs.set(batch.sourceId, handoff);
            visualCleanups.set(batch.sourceId, visualCleanup);
            visualCleanupSettled.set(batch.sourceId, false);
            visualCleanup.promise.then(() => {
                visualCleanupSettled.set(batch.sourceId, true);
            });
            return handoff.promise;
        },
        clear() {},
        dispose() {},
    };
    const scheduler = createFullscreenOverlayScheduler({
        resolveRenderer: () => renderer,
        sourceGapMs: undefined,
        setTimeoutFn: clock.setTimeout.bind(clock),
        clearTimeoutFn: clock.clearTimeout.bind(clock),
    });

    scheduler.replace([
        { sourceId: 'live', rendererId: 'barrage', items: ['第一来源'] },
        { sourceId: 'diary', rendererId: 'popup', items: ['第二来源'] },
    ]);
    await flushAsync();
    assert.deepEqual(starts, ['live']);

    handoffs.get('live').resolve();
    await flushAsync();
    clock.tick(99);
    await flushAsync();
    assert.deepEqual(starts, ['live'], 'handoff 后的短来源间隔尚未结束时不得抢跑');

    clock.tick(1);
    await flushAsync();
    assert.deepEqual(
        starts,
        ['live', 'diary'],
        'renderer.play resolve 应直接交接来源，不得等待旧来源的视觉 DOM 清理',
    );

    handoffs.get('diary').resolve();
    await scheduler.whenIdle();
    assert.equal(
        visualCleanupSettled.get('live'),
        false,
        'whenIdle 只等待来源完成交接，不得等待旧来源视觉 DOM 清理',
    );
    visualCleanups.get('live').resolve();
    visualCleanups.get('diary').resolve();
    scheduler.dispose();
}

async function testReplaceKeepsOnlyNewestBatch() {
    const { createFullscreenOverlayScheduler } = await import(
        moduleUrl('modules/fullscreen-overlay/scheduler.js')
    );
    const starts = [];
    const abortReasons = [];
    const renderer = {
        play(batch, { signal }) {
            starts.push(batch.sourceId);
            if (batch.sourceId !== 'old-live') return Promise.resolve();
            return new Promise((resolve) => {
                signal.addEventListener('abort', () => {
                    abortReasons.push(signal.reason);
                    resolve();
                }, { once: true });
            });
        },
        clear() {},
        dispose() {},
    };
    const scheduler = createFullscreenOverlayScheduler({
        resolveRenderer: () => renderer,
        sourceGapMs: 0,
    });

    scheduler.replace([
        { sourceId: 'old-live', rendererId: 'barrage', items: ['旧直播'] },
        { sourceId: 'old-diary', rendererId: 'popup', items: ['旧日记'] },
    ]);
    await flushAsync();
    scheduler.replace([
        { sourceId: 'new-live', rendererId: 'barrage', items: ['新直播'] },
    ]);
    await scheduler.whenIdle();

    assert.deepEqual(starts, ['old-live', 'new-live'], 'replace 必须丢弃旧批次的未开始来源');
    assert.deepEqual(abortReasons, ['replace'], 'replace 必须通知当前来源停止继续发射');
    scheduler.dispose();
}

async function testAppendKeepsCurrentAndPendingBatches() {
    const { createFullscreenOverlayScheduler } = await import(
        moduleUrl('modules/fullscreen-overlay/scheduler.js')
    );
    const starts = [];
    const abortReasons = [];
    const currentHandoff = createDeferred();
    const renderer = {
        play(batch, { signal }) {
            starts.push(batch.sourceId);
            signal.addEventListener('abort', () => {
                abortReasons.push(signal.reason);
                currentHandoff.resolve();
            }, { once: true });
            return batch.sourceId === 'chronicle'
                ? currentHandoff.promise
                : Promise.resolve();
        },
        clear() {},
        dispose() {},
    };
    const scheduler = createFullscreenOverlayScheduler({
        resolveRenderer: () => renderer,
        sourceGapMs: 0,
    });

    scheduler.replace([
        { sourceId: 'chronicle', rendererId: 'popup', items: ['纪要'] },
        { sourceId: 'protagonist', rendererId: 'popup', items: ['主角'] },
        { sourceId: 'important', rendererId: 'popup', items: ['重要角色'] },
    ]);
    await flushAsync();
    scheduler.append([
        { sourceId: 'global', rendererId: 'popup', items: ['全局数据'] },
    ]);
    currentHandoff.resolve();
    await scheduler.whenIdle();

    assert.deepEqual(
        starts,
        ['chronicle', 'protagonist', 'important', 'global'],
        'append 必须保留当前来源与原待播来源，只在队尾累计同楼新来源',
    );
    assert.deepEqual(abortReasons, [], 'append 不得打断当前正在交接的来源');
    scheduler.dispose();
}

async function testClearAbortsQueueAndBecomesIdle() {
    const { createFullscreenOverlayScheduler } = await import(
        moduleUrl('modules/fullscreen-overlay/scheduler.js')
    );
    const starts = [];
    let clearCount = 0;
    const renderer = {
        play(batch, { signal }) {
            starts.push(batch.sourceId);
            return new Promise((resolve) => {
                signal.addEventListener('abort', resolve, { once: true });
            });
        },
        clear() {
            clearCount += 1;
        },
        dispose() {},
    };
    const scheduler = createFullscreenOverlayScheduler({
        resolveRenderer: () => renderer,
        sourceGapMs: 0,
    });

    scheduler.replace([
        { sourceId: 'live', rendererId: 'barrage', items: ['直播'] },
        { sourceId: 'diary', rendererId: 'popup', items: ['日记'] },
    ]);
    await flushAsync();
    scheduler.clear();
    await scheduler.whenIdle();

    assert.deepEqual(starts, ['live'], 'clear 后不得启动任何待播来源');
    assert.equal(clearCount, 1, 'clear 必须清理 renderer 已存在的视觉元素');
    assert.equal(scheduler.getState().pendingSourceCount, 0);
    scheduler.dispose();
}

async function testPauseAndResumeKeepCurrentSchedulingSemantics() {
    const { createFullscreenOverlayScheduler } = await import(
        moduleUrl('modules/fullscreen-overlay/scheduler.js')
    );
    const events = [];
    const handoff = createDeferred();
    const renderer = {
        play(batch) {
            events.push(`start:${batch.sourceId}`);
            return handoff.promise;
        },
        pause() {
            events.push('pause');
        },
        resume() {
            events.push('resume');
        },
        clear() {},
        dispose() {},
    };
    const scheduler = createFullscreenOverlayScheduler({
        resolveRenderer: () => renderer,
        sourceGapMs: 0,
    });

    scheduler.pause();
    scheduler.replace([
        { sourceId: 'live', rendererId: 'barrage', items: ['直播'] },
    ]);
    await flushAsync();
    assert.deepEqual(events, [], '暂停期间不得开始新来源');

    scheduler.resume();
    await flushAsync();
    assert.deepEqual(events, ['start:live']);

    scheduler.pause();
    scheduler.resume();
    assert.deepEqual(events, ['start:live', 'pause', 'resume'], '活动 renderer 必须同步暂停与继续');

    handoff.resolve();
    await scheduler.whenIdle();
    scheduler.dispose();
}

async function main() {
    await testRendererResolveHandsOffAfterShortDefaultGap();
    await testReplaceKeepsOnlyNewestBatch();
    await testAppendKeepsCurrentAndPendingBatches();
    await testClearAbortsQueueAndBecomesIdle();
    await testPauseAndResumeKeepCurrentSchedulingSemantics();
    console.log('fullscreen overlay scheduler handoff checks passed');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
