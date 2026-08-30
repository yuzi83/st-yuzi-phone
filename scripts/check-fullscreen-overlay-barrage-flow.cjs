const assert = require('assert/strict');
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
    constructor(tagName = 'div', measuredWidth = 0) {
        this.tagName = String(tagName).toUpperCase();
        this.className = '';
        this.dataset = {};
        this.style = new FakeStyle();
        this.children = [];
        this.parentNode = null;
        this.textContent = '';
        this.attributes = new Map();
        this.listeners = new Map();
        this.measuredWidth = measuredWidth;
        this.widthReadCount = 0;
    }

    appendChild(child) {
        child.parentNode?.removeChild(child);
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

    remove() {
        this.parentNode?.removeChild(this);
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
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
            if (record.once) this.removeEventListener(event.type, record.handler);
        }
        return true;
    }

    getBoundingClientRect() {
        this.widthReadCount += 1;
        return { width: this.measuredWidth };
    }
}

class FakeDocument {
    constructor(viewportWidth = 390, measuredWidths = []) {
        this.defaultView = { innerWidth: viewportWidth };
        this.measuredWidths = [...measuredWidths];
    }

    createElement(tagName) {
        return new FakeElement(tagName, this.measuredWidths.shift() || 0);
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

async function flushMicrotasks(rounds = 8) {
    for (let index = 0; index < rounds; index += 1) {
        await Promise.resolve();
    }
}

async function createHarness(settings, { measuredWidths = [], viewportWidth = 390 } = {}) {
    const { createScrollingBarrageRenderer } = await import(
        toModuleUrl('modules/fullscreen-overlay/renderers/scrolling-barrage.js')
    );
    const documentRef = new FakeDocument(viewportWidth, measuredWidths);
    const clock = new FakeClock();
    const layer = new FakeElement('div');
    let currentSettings = settings;
    const renderer = createScrollingBarrageRenderer({
        documentRef,
        layerRuntime: {
            mount: () => layer,
            getElement: () => layer,
        },
        getSettings: () => currentSettings,
        nowFn: () => clock.now,
        setTimeoutFn: clock.setTimeout.bind(clock),
        clearTimeoutFn: clock.clearTimeout.bind(clock),
        animationTimeoutPaddingMs: 50,
    });
    return {
        clock,
        layer,
        renderer,
        setSettings(nextSettings) {
            currentSettings = nextSettings;
        },
    };
}

async function testMeasuredWidthControlsTrackHandoff() {
    const harness = await createHarness(
        {
            maxConcurrent: 1,
            intervalMs: 500,
            durationMs: 20000,
            fontSizePx: 14,
            opacity: 0.86,
            palette: ['#FFFFFF'],
        },
        { measuredWidths: [300, 300], viewportWidth: 390 },
    );
    const playPromise = harness.renderer.play({
        sourceId: 'live',
        items: ['短字', '第二条'],
    });
    await flushMicrotasks();
    const first = harness.layer.children[0];

    assert.equal(
        first.widthReadCount,
        1,
        '每条弹幕 append 后应只读取一次实际宽度',
    );
    harness.clock.tick(500);
    await flushMicrotasks();
    harness.clock.tick(7833);
    await flushMicrotasks();
    assert.equal(
        harness.layer.children.length,
        1,
        '300px 元素沿 390px + 110% 元素宽度路径移动时，8333ms 尚未完整进入',
    );

    harness.clock.tick(1);
    await flushMicrotasks();
    assert.equal(
        harness.layer.children.length,
        2,
        '入口时长必须按实际 300px 宽度与 CSS 100vw→-110% 路径计算',
    );
    assert.equal(
        harness.layer.children[1].widthReadCount,
        1,
        '复用轨道后的新弹幕也只能读取一次实际宽度',
    );

    harness.renderer.clear();
    assert.equal((await playPromise).status, 'cleared');
    harness.renderer.dispose();
}

async function testDensityChangeKeepsStablePhysicalTrackOwners() {
    const baseSettings = {
        maxConcurrent: 6,
        intervalMs: 500,
        durationMs: 20000,
        fontSizePx: 14,
        opacity: 0.86,
        palette: ['#FFFFFF'],
    };
    const harness = await createHarness(
        baseSettings,
        { measuredWidths: Array(7).fill(300), viewportWidth: 390 },
    );
    const playPromise = harness.renderer.play({
        sourceId: 'live',
        items: Array.from({ length: 7 }, (_, index) => `固定轨道${index + 1}`),
    });
    await flushMicrotasks();
    for (let index = 0; index < 5; index += 1) {
        harness.clock.tick(500);
        await flushMicrotasks();
    }
    assert.equal(harness.layer.children.length, 6);
    assert.equal(
        harness.layer.children.filter((element) => (
            element.style.getPropertyValue('--yuzi-phone-fullscreen-overlay-track-top')
            === '78%'
        )).length,
        1,
    );

    harness.setSettings({ ...baseSettings, maxConcurrent: 3 });
    harness.layer.children[2].dispatchEvent({ type: 'animationend' });
    harness.renderer.refreshSettings();
    harness.clock.tick(500);
    await flushMicrotasks();

    assert.equal(
        harness.layer.children.length,
        5,
        '密度 6→3 后只释放旧物理槽 2，不得误认为分布槽 5 已空闲',
    );
    assert.equal(
        harness.layer.children.filter((element) => (
            element.style.getPropertyValue('--yuzi-phone-fullscreen-overlay-track-top')
            === '78%'
        )).length,
        1,
        '动态密度变化不得让不同 owner 同时占用相同的物理 top',
    );

    harness.renderer.clear();
    assert.deepEqual(await playPromise, { status: 'cleared', emittedCount: 6 });
    harness.renderer.dispose();
}

async function testTrackCanBeReusedBeforeFullTraversal() {
    const harness = await createHarness({
        maxConcurrent: 1,
        intervalMs: 500,
        durationMs: 20000,
        fontSizePx: 14,
        opacity: 0.86,
        palette: ['#FFFFFF'],
    });
    const playPromise = harness.renderer.play({
        sourceId: 'live',
        items: ['第一条弹幕', '第二条弹幕'],
    });
    await flushMicrotasks();
    assert.equal(harness.layer.children.length, 1);

    harness.clock.tick(500);
    await flushMicrotasks();
    harness.clock.tick(4500);
    await flushMicrotasks();
    assert.equal(
        harness.layer.children.length,
        2,
        '单轨弹幕完整进入右侧入口后必须复用轨道，不得等待 20 秒穿屏结束',
    );

    for (const element of [...harness.layer.children]) {
        element.dispatchEvent({ type: 'animationend' });
    }
    assert.deepEqual(await playPromise, { status: 'completed', emittedCount: 2 });
    harness.renderer.dispose();
}

async function testPlayHandsOffAfterLastItemEnters() {
    const harness = await createHarness({
        maxConcurrent: 2,
        intervalMs: 500,
        durationMs: 20000,
        fontSizePx: 14,
        opacity: 0.86,
        palette: ['#FFFFFF'],
    });
    let playResult = null;
    const playPromise = harness.renderer.play({
        sourceId: 'live',
        items: ['第一条弹幕', '第二条弹幕'],
    }).then((result) => {
        playResult = result;
        return result;
    });
    await flushMicrotasks();

    harness.clock.tick(500);
    await flushMicrotasks();
    harness.clock.tick(4500);
    await flushMicrotasks();
    assert.deepEqual(
        playResult,
        { status: 'completed', emittedCount: 2 },
        '最后一条完整进入右侧入口后 play() 必须交还调度权',
    );
    assert.equal(
        harness.renderer.getActiveCount(),
        2,
        'play() 交接后，已发出的弹幕应继续动画而不是被提前销毁',
    );

    for (const element of [...harness.layer.children]) {
        element.dispatchEvent({ type: 'animationend' });
    }
    await playPromise;
    assert.equal(harness.renderer.getActiveCount(), 0);
    harness.renderer.dispose();
}

async function testActiveDomHardCapIsIndependentFromVisualDensity() {
    const harness = await createHarness({
        maxConcurrent: 6,
        intervalMs: 500,
        durationMs: 20000,
        fontSizePx: 14,
        opacity: 0.86,
        palette: ['#FFFFFF'],
    });
    const playPromise = harness.renderer.play({
        sourceId: 'live',
        items: Array.from({ length: 30 }, (_, index) => `弹幕${index + 1}`),
    });
    await flushMicrotasks();

    let peakActiveCount = harness.renderer.getActiveCount();
    for (let step = 0; step < 38; step += 1) {
        harness.clock.tick(500);
        await flushMicrotasks();
        peakActiveCount = Math.max(peakActiveCount, harness.renderer.getActiveCount());
    }

    assert.equal(
        peakActiveCount,
        18,
        '视觉密度为 6 时允许轨道复用，但活动 DOM 必须受独立的 18 条硬上限保护',
    );
    assert.equal(harness.renderer.getActiveCount(), 18);

    harness.layer.children[0].dispatchEvent({ type: 'animationend' });
    await flushMicrotasks();
    assert.equal(
        harness.renderer.getActiveCount(),
        18,
        '活动记录完成后应立即释放硬上限名额并继续流式发射',
    );

    harness.renderer.clear();
    const result = await playPromise;
    assert.equal(result.status, 'cleared');
    assert.equal(result.emittedCount, 19);
    assert.equal(harness.renderer.getActiveCount(), 0);
    harness.renderer.dispose();
}

async function testPauseFreezesEntryHandoffAndClearStillSettles() {
    const harness = await createHarness({
        maxConcurrent: 1,
        intervalMs: 500,
        durationMs: 20000,
        fontSizePx: 14,
        opacity: 0.86,
        palette: ['#FFFFFF'],
    });
    let playResult = null;
    const playPromise = harness.renderer.play({
        sourceId: 'live',
        items: ['暂停中的弹幕'],
    }).then((result) => {
        playResult = result;
        return result;
    });
    await flushMicrotasks();

    harness.renderer.pause();
    harness.clock.tick(10000);
    await flushMicrotasks();
    assert.equal(playResult, null, '暂停期间不得完成入口交接');
    assert.equal(harness.renderer.getActiveCount(), 1);
    assert.equal(
        harness.layer.getAttribute('data-yuzi-phone-overlay-paused'),
        'true',
    );

    harness.renderer.clear();
    assert.deepEqual(await playPromise, { status: 'cleared', emittedCount: 1 });
    assert.equal(harness.renderer.getActiveCount(), 0);
    assert.equal(harness.layer.children.length, 0);
    harness.renderer.dispose();
}

async function testAbortStopsPendingEmissionWithoutDestroyingVisibleRecords() {
    const harness = await createHarness({
        maxConcurrent: 1,
        intervalMs: 500,
        durationMs: 20000,
        fontSizePx: 14,
        opacity: 0.86,
        palette: ['#FFFFFF'],
    });
    const controller = new AbortController();
    const playPromise = harness.renderer.play(
        {
            sourceId: 'old-live',
            items: ['已经出现', '不得再出现'],
        },
        { signal: controller.signal },
    );
    await flushMicrotasks();
    harness.clock.tick(500);
    await flushMicrotasks();

    controller.abort();
    assert.deepEqual(
        await playPromise,
        { status: 'replaced', emittedCount: 1 },
        'Abort 必须尽快结束旧批次并阻止尚未发射的弹幕',
    );
    assert.equal(
        harness.renderer.getActiveCount(),
        1,
        'Abort 不应销毁已经出现在屏幕上的弹幕',
    );

    harness.clock.tick(10000);
    await flushMicrotasks();
    assert.equal(harness.layer.children.length, 1);
    harness.layer.children[0].dispatchEvent({ type: 'animationend' });
    assert.equal(harness.renderer.getActiveCount(), 0);
    harness.renderer.dispose();
}

async function testEternalBarrageRepeatsWithoutBlockingAndReplacementKeepsVisibleItems() {
    const harness = await createHarness({
        maxConcurrent: 2,
        intervalMs: 500,
        durationMs: 4000,
        fontSizePx: 14,
        opacity: 0.86,
        eternalEnabled: true,
        palette: ['#FFFFFF'],
    });
    const oldPlay = harness.renderer.play({
        sourceId: 'live',
        sheetKey: 'sheet_live',
        items: ['旧内容'],
    });
    await flushMicrotasks();
    harness.clock.tick(1000);
    await flushMicrotasks();
    assert.deepEqual(
        await oldPlay,
        { status: 'completed', emittedCount: 1 },
        '永恒弹幕的首轮完成入口交接后必须正常 resolve，不能阻塞后续表格',
    );
    assert.equal(
        harness.layer.children.filter(item => item.textContent === '旧内容').length,
        2,
        '首轮交接后必须在后台开始下一轮，而不是把无限循环塞进 scheduler',
    );

    const newPlay = harness.renderer.play({
        sourceId: 'live',
        sheetKey: 'sheet_live',
        items: ['新内容'],
    });
    await flushMicrotasks();
    assert(
        harness.layer.children.some(item => item.textContent === '旧内容'),
        '新内容接管循环时，已经可见的旧弹幕必须自然飞完，不能被直接清空',
    );
    assert(
        harness.layer.children.some(item => item.textContent === '新内容'),
        '新内容必须立即进入自己的首轮发射',
    );

    harness.clock.tick(2000);
    await flushMicrotasks();
    assert.deepEqual(
        await newPlay,
        { status: 'completed', emittedCount: 1 },
        '新内容首轮同样必须按既有 handoff 规则完成',
    );
    assert.equal(
        harness.layer.children.filter(item => item.textContent === '旧内容').length,
        2,
        '新内容接管后，旧循环不得继续发射新的旧内容',
    );
    assert(
        harness.layer.children.filter(item => item.textContent === '新内容').length >= 2,
        '新内容首轮完成后必须接管为新的后台循环',
    );

    harness.renderer.clear();
    harness.clock.tick(10000);
    await flushMicrotasks();
    assert.equal(harness.layer.children.length, 0, '清空必须停止永恒循环并移除当前内容');
    assert.equal(harness.renderer.getActiveCount(), 0, '清空后不得残留活动弹幕记录');
    harness.renderer.dispose();
}

async function main() {
    await testMeasuredWidthControlsTrackHandoff();
    console.log('✓ measured element width controls the right-side handoff');
    await testDensityChangeKeepsStablePhysicalTrackOwners();
    console.log('✓ density changes keep stable physical track ownership');
    await testTrackCanBeReusedBeforeFullTraversal();
    console.log('✓ scrolling barrage reuses a visual track before full traversal');
    await testPlayHandsOffAfterLastItemEnters();
    console.log('✓ play hands off after the last item clears the right-side entrance');
    await testActiveDomHardCapIsIndependentFromVisualDensity();
    console.log('✓ active barrage DOM has an independent hard cap');
    await testPauseFreezesEntryHandoffAndClearStillSettles();
    console.log('✓ pause freezes handoff and clear still settles the batch');
    await testAbortStopsPendingEmissionWithoutDestroyingVisibleRecords();
    console.log('✓ abort stops pending emission while visible records finish naturally');
    await testEternalBarrageRepeatsWithoutBlockingAndReplacementKeepsVisibleItems();
    console.log('✓ eternal barrage repeats in background and hands over naturally');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
