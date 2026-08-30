const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = process.cwd();

function toModuleUrl(relativePath) {
    return `${pathToFileURL(path.join(ROOT, relativePath)).href}?t=${Date.now()}-${Math.random()}`;
}

class FakeStyle {
    constructor() {
        this.values = new Map();
    }

    setProperty(name, value) {
        this.values.set(name, String(value));
    }

    getPropertyValue(name) {
        return this.values.get(name) || '';
    }
}

class FakeElement {
    constructor(tagName = 'div') {
        this.tagName = String(tagName).toUpperCase();
        this.id = '';
        this.className = '';
        this.dataset = {};
        this.style = new FakeStyle();
        this.children = [];
        this.parentNode = null;
        this.textContent = '';
        this.attributes = new Map();
        this.listeners = new Map();
    }

    appendChild(child) {
        if (child.parentNode) {
            child.parentNode.removeChild(child);
        }
        child.parentNode = this;
        this.children.push(child);
        return child;
    }

    removeChild(child) {
        const index = this.children.indexOf(child);
        if (index >= 0) {
            this.children.splice(index, 1);
            child.parentNode = null;
        }
        return child;
    }

    replaceChildren(...children) {
        for (const child of [...this.children]) {
            this.removeChild(child);
        }
        for (const child of children) {
            this.appendChild(child);
        }
    }

    remove() {
        this.parentNode?.removeChild(this);
    }

    setAttribute(name, value) {
        const normalized = String(value);
        this.attributes.set(name, normalized);
        if (name === 'id') this.id = normalized;
        if (name === 'class') this.className = normalized;
    }

    getAttribute(name) {
        return this.attributes.get(name) ?? null;
    }

    removeAttribute(name) {
        this.attributes.delete(name);
    }

    addEventListener(type, handler, options = {}) {
        const records = this.listeners.get(type) || [];
        records.push({ handler, once: Boolean(options?.once) });
        this.listeners.set(type, records);
    }

    removeEventListener(type, handler) {
        const records = this.listeners.get(type) || [];
        this.listeners.set(type, records.filter((record) => record.handler !== handler));
    }

    dispatchEvent(event) {
        event.target ||= this;
        const records = [...(this.listeners.get(event.type) || [])];
        for (const record of records) {
            record.handler.call(this, event);
            if (record.once) {
                this.removeEventListener(event.type, record.handler);
            }
        }
        return true;
    }

    get firstChild() {
        return this.children[0] || null;
    }
}

class FakeDocument {
    constructor() {
        this.body = new FakeElement('body');
        this.hidden = false;
        this.listeners = new Map();
    }

    createElement(tagName) {
        return new FakeElement(tagName);
    }

    getElementById(id) {
        const visit = (node) => {
            if (node.id === id) return node;
            for (const child of node.children) {
                const found = visit(child);
                if (found) return found;
            }
            return null;
        };
        return visit(this.body);
    }

    addEventListener(type, handler) {
        const records = this.listeners.get(type) || [];
        records.push(handler);
        this.listeners.set(type, records);
    }

    removeEventListener(type, handler) {
        const records = this.listeners.get(type) || [];
        this.listeners.set(type, records.filter((record) => record !== handler));
    }

    dispatch(type) {
        for (const handler of [...(this.listeners.get(type) || [])]) {
            handler({ type, target: this });
        }
    }
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
            const next = [...this.timers.entries()]
                .filter(([, timer]) => timer.dueAt <= target)
                .sort((left, right) => left[1].dueAt - right[1].dueAt || left[0] - right[0])[0];
            if (!next) break;
            const [id, timer] = next;
            this.timers.delete(id);
            this.now = timer.dueAt;
            timer.callback();
        }
        this.now = target;
    }
}

class ControlledRenderer {
    constructor() {
        this.events = [];
        this.runs = new Map();
    }

    play(batch, { signal } = {}) {
        this.events.push(`start:${batch.sourceId}`);
        return new Promise((resolve) => {
            const run = {
                resolve,
                aborted: false,
                onAbort: () => {
                    run.aborted = true;
                    this.events.push(`abort:${batch.sourceId}`);
                },
            };
            signal?.addEventListener('abort', run.onAbort, { once: true });
            this.runs.set(batch.sourceId, run);
        });
    }

    finish(sourceId) {
        const run = this.runs.get(sourceId);
        if (!run) return;
        this.runs.delete(sourceId);
        run.resolve();
        this.events.push(`finish:${sourceId}`);
    }

    pause() {
        this.events.push('pause');
    }

    resume() {
        this.events.push('resume');
    }

    clear() {
        this.events.push('clear');
        for (const sourceId of [...this.runs.keys()]) {
            this.finish(sourceId);
        }
    }

    dispose() {
        this.events.push('dispose');
        this.clear();
    }
}

async function flushMicrotasks(turns = 8) {
    for (let index = 0; index < turns; index += 1) {
        await Promise.resolve();
    }
}

async function testLayerRuntimePublicSeam() {
    const { createFullscreenOverlayLayerRuntime } = await import(
        toModuleUrl('modules/fullscreen-overlay/layer-runtime.js')
    );
    const documentRef = new FakeDocument();
    const runtime = createFullscreenOverlayLayerRuntime({ documentRef });

    const layer = runtime.mount();
    assert.equal(layer.parentNode, documentRef.body);
    assert.equal(layer.id, 'yuzi-phone-fullscreen-overlay-layer');
    assert.equal(layer.className, 'yuzi-phone-fullscreen-overlay-layer');
    assert.equal(layer.getAttribute('aria-hidden'), 'true');
    assert.equal(runtime.mount(), layer, '重复 mount 必须复用宿主 body 下的单一图层');

    layer.appendChild(documentRef.createElement('span'));
    runtime.clear();
    assert.equal(layer.children.length, 0);

    runtime.dispose();
    assert.equal(documentRef.getElementById(layer.id), null);
    assert.equal(runtime.mount(), null, 'dispose 后不得复活图层');

    const staleDocument = new FakeDocument();
    const staleContainer = staleDocument.createElement('section');
    const staleLayer = staleDocument.createElement('div');
    staleLayer.id = 'yuzi-phone-fullscreen-overlay-layer';
    staleContainer.appendChild(staleLayer);
    staleDocument.body.appendChild(staleContainer);
    const staleRuntime = createFullscreenOverlayLayerRuntime({ documentRef: staleDocument });
    assert.equal(
        staleRuntime.mount().parentNode,
        staleDocument.body,
        '复用旧图层时也必须保证它是宿主 body 的直属子元素',
    );
    staleRuntime.dispose();
}

async function testSchedulerStrictSerialAndReplace() {
    const { createFullscreenOverlayScheduler } = await import(
        toModuleUrl('modules/fullscreen-overlay/scheduler.js')
    );
    const documentRef = new FakeDocument();
    const clock = new FakeClock();
    const renderer = new ControlledRenderer();
    const scheduler = createFullscreenOverlayScheduler({
        documentRef,
        resolveRenderer: () => renderer,
        sourceGapMs: 300,
        setTimeoutFn: clock.setTimeout.bind(clock),
        clearTimeoutFn: clock.clearTimeout.bind(clock),
    });

    scheduler.replace([
        { sourceId: 'live', rendererId: 'scrolling-barrage', items: ['一'] },
        { sourceId: 'diary', rendererId: 'popup', items: ['二'] },
    ]);
    await flushMicrotasks();
    assert.deepEqual(renderer.events, ['start:live']);

    renderer.finish('live');
    await flushMicrotasks();
    clock.tick(299);
    await flushMicrotasks();
    assert.ok(!renderer.events.includes('start:diary'), '来源间隔未满 300ms 前不得启动下一来源');
    clock.tick(1);
    await flushMicrotasks();
    assert.ok(renderer.events.includes('start:diary'));

    renderer.finish('diary');
    await scheduler.whenIdle();

    const replacementRenderer = new ControlledRenderer();
    const replacementScheduler = createFullscreenOverlayScheduler({
        documentRef: new FakeDocument(),
        resolveRenderer: () => replacementRenderer,
        sourceGapMs: 300,
        setTimeoutFn: clock.setTimeout.bind(clock),
        clearTimeoutFn: clock.clearTimeout.bind(clock),
    });
    replacementScheduler.replace([
        { sourceId: 'old-live', rendererId: 'scrolling-barrage', items: ['旧'] },
        { sourceId: 'old-diary', rendererId: 'popup', items: ['旧日记'] },
    ]);
    await flushMicrotasks();
    replacementScheduler.replace([
        { sourceId: 'new-live', rendererId: 'scrolling-barrage', items: ['新'] },
    ]);
    await flushMicrotasks();
    assert.ok(replacementRenderer.events.includes('abort:old-live'));
    assert.ok(!replacementRenderer.events.includes('start:new-live'), '已显示旧元素结束前不得启动新批次');

    replacementRenderer.finish('old-live');
    await flushMicrotasks();
    clock.tick(300);
    await flushMicrotasks();
    assert.ok(replacementRenderer.events.includes('start:new-live'));
    assert.ok(!replacementRenderer.events.includes('start:old-diary'), 'replace 必须丢弃旧批次未开始来源');

    replacementScheduler.clear();
    await flushMicrotasks();
    assert.ok(replacementRenderer.events.includes('clear'));
    assert.equal(replacementScheduler.getState().pendingSourceCount, 0);

    scheduler.dispose();
    replacementScheduler.dispose();
}

async function testSchedulerVisibilityLifecycle() {
    const { createFullscreenOverlayScheduler } = await import(
        toModuleUrl('modules/fullscreen-overlay/scheduler.js')
    );
    const documentRef = new FakeDocument();
    documentRef.hidden = true;
    const renderer = new ControlledRenderer();
    const scheduler = createFullscreenOverlayScheduler({
        documentRef,
        resolveRenderer: () => renderer,
        setTimeoutFn: global.setTimeout,
        clearTimeoutFn: global.clearTimeout,
    });

    scheduler.replace([
        { sourceId: 'live', rendererId: 'scrolling-barrage', items: ['一'] },
    ]);
    await flushMicrotasks();
    assert.ok(!renderer.events.includes('start:live'), '后台标签不得发射新来源');

    let clearedWhilePausedBecameIdle = false;
    const pausedIdlePromise = scheduler.whenIdle().then(() => {
        clearedWhilePausedBecameIdle = true;
    });
    scheduler.clear();
    await flushMicrotasks();
    assert.equal(clearedWhilePausedBecameIdle, true, '后台暂停期间 clear 也必须立即清空调度泵');
    await pausedIdlePromise;

    scheduler.replace([
        { sourceId: 'live', rendererId: 'scrolling-barrage', items: ['一'] },
    ]);
    documentRef.hidden = false;
    documentRef.dispatch('visibilitychange');
    await flushMicrotasks();
    assert.ok(renderer.events.includes('start:live'));

    documentRef.hidden = true;
    documentRef.dispatch('visibilitychange');
    assert.ok(renderer.events.includes('pause'));
    documentRef.hidden = false;
    documentRef.dispatch('visibilitychange');
    assert.ok(renderer.events.includes('resume'));

    scheduler.dispose();
    assert.ok(renderer.events.includes('dispose'));
    assert.equal((documentRef.listeners.get('visibilitychange') || []).length, 0);
}

async function testSchedulerClearActiveSourceWhileHiddenBecomesIdle() {
    const { createFullscreenOverlayScheduler } = await import(
        toModuleUrl('modules/fullscreen-overlay/scheduler.js')
    );
    const documentRef = new FakeDocument();
    const renderer = new ControlledRenderer();
    const scheduler = createFullscreenOverlayScheduler({
        documentRef,
        resolveRenderer: () => renderer,
    });

    scheduler.replace([
        { sourceId: 'live', rendererId: 'scrolling-barrage', items: ['一'] },
    ]);
    await flushMicrotasks();
    assert.ok(renderer.events.includes('start:live'));

    documentRef.hidden = true;
    documentRef.dispatch('visibilitychange');
    assert.ok(renderer.events.includes('pause'));

    let becameIdle = false;
    const idlePromise = scheduler.whenIdle().then(() => {
        becameIdle = true;
    });
    scheduler.clear();
    await flushMicrotasks();

    assert.equal(
        becameIdle,
        true,
        '活动来源进入后台后 clear，调度泵必须无需恢复前台即可立即空闲',
    );
    await idlePromise;
    scheduler.dispose();
}

async function testSchedulerDisposeHandlesAbortRejection() {
    const { createFullscreenOverlayScheduler } = await import(
        toModuleUrl('modules/fullscreen-overlay/scheduler.js')
    );
    const failures = [];
    const renderer = {
        play(_batch, { signal }) {
            return new Promise((_resolve, reject) => {
                signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
            });
        },
        clear() {},
        dispose() {},
    };
    const scheduler = createFullscreenOverlayScheduler({
        documentRef: new FakeDocument(),
        resolveRenderer: () => renderer,
        onBatchFailure: (...args) => failures.push(args),
    });
    scheduler.replace([
        { sourceId: 'live', rendererId: 'scrolling-barrage', items: ['一'] },
    ]);
    await flushMicrotasks();
    scheduler.dispose();
    await assert.doesNotReject(() => scheduler.whenIdle());
    assert.equal(
        failures.length,
        0,
        'dispose 引起的 Abort rejection 不得上报为来源播放失败',
    );
}

async function testSchedulerReplaceAbortDoesNotReportBatchFailure() {
    const { createFullscreenOverlayScheduler } = await import(
        toModuleUrl('modules/fullscreen-overlay/scheduler.js')
    );
    const failures = [];
    const playedSources = [];
    const renderer = {
        play(batch, { signal }) {
            playedSources.push(batch.sourceId);
            if (batch.sourceId !== 'old-source') return Promise.resolve();
            return new Promise((_resolve, reject) => {
                signal.addEventListener(
                    'abort',
                    () => reject(new Error('replace aborted old source')),
                    { once: true },
                );
            });
        },
        clear() {},
        dispose() {},
    };
    const scheduler = createFullscreenOverlayScheduler({
        documentRef: new FakeDocument(),
        resolveRenderer: () => renderer,
        sourceGapMs: 0,
        onBatchFailure: (...args) => failures.push(args),
    });

    scheduler.replace([{
        sourceId: 'old-source',
        rendererId: 'scrolling-barrage',
        sourceSignature: 'old',
        items: ['旧'],
    }]);
    await flushMicrotasks();
    scheduler.replace([{
        sourceId: 'new-source',
        rendererId: 'scrolling-barrage',
        sourceSignature: 'new',
        items: ['新'],
    }]);
    await scheduler.whenIdle();

    assert.deepEqual(playedSources, ['old-source', 'new-source']);
    assert.equal(
        failures.length,
        0,
        'replace 主动中止旧批次不得触发 onBatchFailure',
    );
    scheduler.dispose();
}

async function createBarrageHarness({
    initialSettings,
    randomValues = [0],
    animationTimeoutPaddingMs = 50,
} = {}) {
    const { createFullscreenOverlayLayerRuntime } = await import(
        toModuleUrl('modules/fullscreen-overlay/layer-runtime.js')
    );
    const { createScrollingBarrageRenderer } = await import(
        toModuleUrl('modules/fullscreen-overlay/renderers/scrolling-barrage.js')
    );
    const documentRef = new FakeDocument();
    const clock = new FakeClock();
    const layerRuntime = createFullscreenOverlayLayerRuntime({ documentRef });
    let settings = initialSettings;
    let randomIndex = 0;
    const renderer = createScrollingBarrageRenderer({
        layerRuntime,
        documentRef,
        getSettings: () => settings,
        random: () => {
            const value = randomValues[randomIndex % randomValues.length];
            randomIndex += 1;
            return value;
        },
        nowFn: () => clock.now,
        setTimeoutFn: clock.setTimeout.bind(clock),
        clearTimeoutFn: clock.clearTimeout.bind(clock),
        animationTimeoutPaddingMs,
    });

    return {
        documentRef,
        clock,
        layerRuntime,
        renderer,
        getLayer: () => layerRuntime.getElement(),
        setSettings(nextSettings) {
            settings = nextSettings;
        },
    };
}

async function testScrollingRendererUsesCanonicalSettingsRanges() {
    const { normalizeScrollingBarrageRuntimeSettings } = await import(
        toModuleUrl('modules/fullscreen-overlay/renderers/scrolling-barrage.js')
    );
    assert.deepEqual(
        normalizeScrollingBarrageRuntimeSettings({
            maxConcurrent: 99,
            intervalMs: 1,
            durationMs: 1,
            fontSizePx: 1,
            opacity: 0,
            palette: ['invalid'],
        }),
        {
            maxConcurrent: 6,
            intervalMs: 500,
            durationMs: 4000,
            fontSizePx: 12,
            opacity: 0.3,
            areaPercent: 75,
            eternalEnabled: false,
            palette: ['#FFFFFF'],
        },
        'renderer 必须复用全屏浮层共享设置的安全范围与调色板规范',
    );
}

async function testScrollingRendererReadsLatestSettingsAndClears() {
    const harness = await createBarrageHarness({
        initialSettings: {
            maxConcurrent: 1,
            intervalMs: 500,
            durationMs: 4000,
            fontSizePx: 14,
            opacity: 0.86,
            palette: ['#FFFFFF', '#FF0000'],
        },
    });
    const playPromise = harness.renderer.play({
        sourceId: 'live',
        rendererId: 'scrolling-barrage',
        items: ['第一条', { text: '第二条' }, '第三条'],
    });
    await flushMicrotasks();

    const first = harness.getLayer().children[0];
    assert.equal(harness.getLayer().children.length, 1);
    assert.equal(first.className, 'yuzi-phone-fullscreen-overlay-barrage');
    assert.equal(first.textContent, '第一条');
    assert.equal(
        first.style.getPropertyValue('--yuzi-phone-fullscreen-overlay-duration'),
        '4000ms',
    );
    assert.equal(
        first.style.getPropertyValue('--yuzi-phone-fullscreen-overlay-font-size'),
        '14px',
    );
    assert.equal(
        first.style.getPropertyValue('--yuzi-phone-fullscreen-overlay-opacity'),
        '0.86',
    );

    harness.setSettings({
        maxConcurrent: 1,
        intervalMs: 500,
        durationMs: 5000,
        fontSizePx: 20,
        opacity: 0.5,
        palette: ['#00FF00'],
    });
    harness.clock.tick(500);
    await flushMicrotasks();
    assert.equal(harness.getLayer().children.length, 1, '达到动态并发上限时不得继续创建 DOM');

    first.dispatchEvent({ type: 'animationend' });
    await flushMicrotasks();
    const second = harness.getLayer().children[0];
    assert.equal(second.textContent, '第二条');
    assert.equal(
        second.style.getPropertyValue('--yuzi-phone-fullscreen-overlay-duration'),
        '5000ms',
    );
    assert.equal(
        second.style.getPropertyValue('--yuzi-phone-fullscreen-overlay-font-size'),
        '20px',
    );
    assert.equal(
        second.style.getPropertyValue('--yuzi-phone-fullscreen-overlay-opacity'),
        '0.5',
    );
    assert.equal(
        second.style.getPropertyValue('--yuzi-phone-fullscreen-overlay-color'),
        '#00FF00',
    );

    harness.renderer.clear();
    const result = await playPromise;
    assert.equal(result.status, 'cleared');
    assert.equal(harness.getLayer().children.length, 0);
    assert.equal(harness.renderer.getActiveCount(), 0);
    harness.renderer.dispose();
    harness.layerRuntime.dispose();
}

async function testScrollingRendererRefreshSettingsReleasesConcurrencyWait() {
    const harness = await createBarrageHarness({
        initialSettings: {
            maxConcurrent: 1,
            intervalMs: 500,
            durationMs: 4000,
            fontSizePx: 14,
            opacity: 0.86,
            palette: ['#FFFFFF'],
        },
    });
    const playPromise = harness.renderer.play({
        sourceId: 'live',
        rendererId: 'scrolling-barrage',
        items: ['第一条', '第二条'],
    });
    await flushMicrotasks();
    assert.equal(harness.getLayer().children.length, 1);

    harness.clock.tick(500);
    await flushMicrotasks();
    assert.equal(
        harness.getLayer().children.length,
        1,
        '第二条应已完成发射间隔并受旧并发上限阻塞',
    );

    harness.setSettings({
        maxConcurrent: 2,
        intervalMs: 500,
        durationMs: 4000,
        fontSizePx: 14,
        opacity: 0.86,
        palette: ['#FFFFFF'],
    });
    assert.equal(
        typeof harness.renderer.refreshSettings,
        'function',
        'renderer 必须公开最小 refreshSettings seam',
    );
    harness.renderer.refreshSettings();
    await flushMicrotasks();

    assert.equal(
        harness.getLayer().children.length,
        2,
        '提高并发上限并刷新设置后，不应等待现有弹幕结束才继续发射',
    );

    harness.renderer.clear();
    const result = await playPromise;
    assert.equal(result.status, 'cleared');
    harness.renderer.dispose();
    harness.layerRuntime.dispose();
}

async function testScrollingRendererPauseFallbackAndPalette() {
    const harness = await createBarrageHarness({
        initialSettings: {
            maxConcurrent: 2,
            intervalMs: 500,
            durationMs: 4000,
            fontSizePx: 14,
            opacity: 1,
            palette: ['#FFFFFF', '#FF0000'],
        },
        randomValues: [0, 0],
        animationTimeoutPaddingMs: 50,
    });
    const playPromise = harness.renderer.play({
        sourceId: 'live',
        rendererId: 'scrolling-barrage',
        items: ['甲', '乙'],
    });
    await flushMicrotasks();
    const first = harness.getLayer().children[0];
    assert.equal(
        first.style.getPropertyValue('--yuzi-phone-fullscreen-overlay-color'),
        '#FFFFFF',
    );

    harness.renderer.pause();
    harness.clock.tick(1000);
    await flushMicrotasks();
    assert.equal(harness.getLayer().children.length, 1, '暂停时发射间隔和动画兜底计时都必须冻结');

    harness.renderer.resume();
    harness.clock.tick(500);
    await flushMicrotasks();
    assert.equal(harness.getLayer().children.length, 2);
    const second = harness.getLayer().children[1];
    assert.equal(
        second.style.getPropertyValue('--yuzi-phone-fullscreen-overlay-color'),
        '#FF0000',
        '存在替代色时应尽量避免连续同色',
    );

    first.dispatchEvent({ type: 'animationend' });
    harness.renderer.pause();
    harness.clock.tick(1000);
    await flushMicrotasks();
    assert.equal(harness.getLayer().children.length, 1);
    assert.equal(
        harness.getLayer().getAttribute('data-yuzi-phone-overlay-paused'),
        'true',
    );

    harness.renderer.resume();
    harness.clock.tick(4049);
    await flushMicrotasks();
    assert.equal(harness.getLayer().children.length, 1);
    harness.clock.tick(1);
    await flushMicrotasks();
    const result = await playPromise;
    assert.equal(result.status, 'completed');
    assert.equal(harness.getLayer().children.length, 0);

    harness.renderer.dispose();
    harness.layerRuntime.dispose();
}

function testOverlayCssContract() {
    const cssPath = path.join(ROOT, 'styles/fullscreen-overlay/00-runtime.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    assert.match(css, /\.yuzi-phone-fullscreen-overlay-layer\s*\{/);
    assert.match(css, /position:\s*fixed/);
    assert.match(css, /inset:\s*0/);
    assert.match(css, /overflow:\s*hidden/);
    assert.match(css, /pointer-events:\s*none/);
    assert.match(css, /z-index:\s*8998/);
    assert.match(css, /--yuzi-phone-fullscreen-overlay-safe-top:\s*8%/);
    assert.match(css, /--yuzi-phone-fullscreen-overlay-safe-bottom:\s*78%/);
    assert.doesNotMatch(css, /backdrop-filter|requestAnimationFrame|setInterval/i);

    const keyframes = css.match(
        /@keyframes\s+yuzi-phone-fullscreen-overlay-scroll\s*\{([\s\S]*?)\n\}/,
    );
    assert.ok(keyframes, '必须提供 Yuzi 独占命名的滚动动画');
    assert.match(keyframes[1], /transform:/);
    assert.match(keyframes[1], /opacity:/);
    assert.doesNotMatch(keyframes[1], /\b(?:left|right|top|bottom|width|height)\s*:/);
}

async function main() {
    await testLayerRuntimePublicSeam();
    await testSchedulerStrictSerialAndReplace();
    await testSchedulerVisibilityLifecycle();
    await testSchedulerClearActiveSourceWhileHiddenBecomesIdle();
    await testSchedulerDisposeHandlesAbortRejection();
    await testSchedulerReplaceAbortDoesNotReportBatchFailure();
    await testScrollingRendererUsesCanonicalSettingsRanges();
    await testScrollingRendererReadsLatestSettingsAndClears();
    await testScrollingRendererRefreshSettingsReleasesConcurrencyWait();
    await testScrollingRendererPauseFallbackAndPalette();
    testOverlayCssContract();
    await flushMicrotasks();

    console.log('[fullscreen-overlay-runtime-check] passed');
    console.log('- singleton layer runtime lifecycle');
    console.log('- strict serial scheduling, replacement, clearing and visibility lifecycle');
    console.log('- dynamic scrolling barrage settings, concurrency, pausing and cleanup');
    console.log('- fixed transparent Yuzi overlay CSS performance contract');
}

main().catch((error) => {
    console.error('[fullscreen-overlay-runtime-check] failed:');
    console.error(error);
    process.exitCode = 1;
});
