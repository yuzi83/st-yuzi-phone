const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const load = file => import(`${pathToFileURL(path.resolve(file)).href}?t=${Date.now()}-${Math.random()}`);

class Root {
    constructor() {
        this.children = [];
        this.style = { values: new Map(), setProperty: (key, value, priority = '') => this.style.values.set(key, [String(value), priority]) };
        this.dataset = {};
        this.parentNode = null;
        this.ownerDocument = { createElement: () => new Root() };
    }
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
    after(child) { this.parentNode?.appendChild(child); }
    remove() { if (!this.parentNode) return; this.parentNode.children = this.parentNode.children.filter(item => item !== this); this.parentNode = null; }
    setAttribute(key, value) { this[key] = String(value); }
}

async function main() {
    const { createContentPresetOverlayRenderer } = await load('modules/content-presets/overlay-renderer.js');
    const host = new Root();
    const inlineTarget = new Root();
    host.appendChild(inlineTarget);
    const display = { id: 'custom', name: '自定义展示', kind: 'popup', entry: { mount: 'd.mjs' }, integrations: { theme: true, font: true }, activatable: true };
    const record = { id: 'preset', displays: [display], files: {} };
    const mounted = [];
    const disposed = [];
    const createRuntime = options => {
        mounted.push(options);
        return { mount: async () => true, dispose: () => disposed.push(options.root) };
    };
    const appearance = { theme: { getState: () => ({ mode: 'dark' }), subscribe: () => () => {} }, font: { getState: () => ({ family: 'Demo' }), subscribe: () => () => {} } };
    const popup = createContentPresetOverlayRenderer({
        modelId: 'content-preset-display:preset:custom', documentRef: { createElement: () => new Root() },
        layerRuntime: { mount: () => host }, getPresetRecord: async () => record,
        createContentPresetDisplayRuntime: createRuntime, hostAppearance: appearance,
        waitForDuration: async () => true,
    });
    await popup.play({
        customDisplay: { modelId: 'content-preset-display:preset:custom', presetId: 'preset', displayId: 'custom', display, targetSheetKeys: ['sheet_a'] },
        snapshot: { sheet_a: { name: '表A', content: [['ID'], ['1']] } },
        targetSheetKeys: ['sheet_a'], modelSettings: { durationMs: 1, opacity: 0.5 }, items: [{}],
    });
    assert.equal(mounted.length, 1, '自定义浮窗必须通过展示内核挂载');
    assert.equal(mounted[0].theme, appearance.theme);
    assert.equal(mounted[0].font, appearance.font);
    assert.equal(mounted[0].root.style.values.get('pointer-events')[0], 'none', '浮窗必须强制点击穿透');
    assert.deepEqual(mounted[0].initialState.tables.map(table => table.sheetKey), ['sheet_a']);
    popup.clear();
    assert.equal(disposed.length, 1, '清理浮窗必须释放展示内核');

    const inlineDisplay = {
        ...display,
        id: 'inline',
        kind: 'inline',
        imageGeneration: {
            canvases: [{
                tableName: '表A',
                stableIdentityFields: ['ID'],
                canvas: '封面',
                promptFields: ['ID'],
            }],
        },
        interactions: ['expand', 'tabs', 'append-input', 'image-generate'],
    };
    let imageActionOptions = null;
    const inline = createContentPresetOverlayRenderer({
        modelId: 'content-preset-display:preset:inline', documentRef: { createElement: () => new Root() },
        getInlineTarget: () => ({ element: inlineTarget, messageId: 5 }), getInlineEpoch: () => 0,
        getPresetRecord: async () => ({ ...record, displays: [inlineDisplay] }),
        createContentPresetDisplayRuntime: createRuntime, hostAppearance: appearance,
        createInlineInteractions: () => ({ expand() {}, tab() {}, appendToComposer() {} }),
        contentPresetImageGenerationHost: {
            createInlineDisplayActions(options) {
                imageActionOptions = options;
                return {
                    generateImage() {},
                    readImage() {},
                    getImageGenerationState() {},
                    subscribeImageGeneration() {},
                };
            },
        },
    });
    await inline.play({
        inlineEpoch: 0,
        customDisplay: { modelId: 'content-preset-display:preset:inline', presetId: 'preset', displayId: 'inline', display: inlineDisplay, targetSheetKeys: ['sheet_a'] },
        snapshot: { sheet_a: { name: '表A', content: [['ID'], ['1']] } }, targetSheetKeys: ['sheet_a'], modelSettings: {}, items: [{}],
    });
    const inlineOptions = mounted.at(-1);
    assert.equal(inlineOptions.root.parentNode, host, '正文展示必须插入最新 AI 正文之后');
    assert.equal(typeof inlineOptions.inlineInteractions.expand, 'function', '正文展示才允许本地点击动作');
        assert.equal(typeof inlineOptions.inlineInteractions.generateImage, 'function', '正文声明生图时必须获得生成动作');
        assert.equal(typeof inlineOptions.inlineInteractions.readImage, 'function', '正文声明生图时必须获得回读动作');
        assert.equal(typeof inlineOptions.inlineInteractions.getImageGenerationState, 'function', '正文声明生图时必须获得按钮可用状态读取动作');
        assert.equal(typeof inlineOptions.inlineInteractions.subscribeImageGeneration, 'function', '正文声明生图时必须获得按钮状态订阅动作');
    assert.deepEqual(
        {
            presetId: imageActionOptions.presetId,
            displayId: imageActionOptions.displayId,
            modelId: imageActionOptions.modelId,
        },
        {
            presetId: 'preset',
            displayId: 'inline',
            modelId: 'content-preset-display:preset:inline',
        },
        '正文生图动作必须绑定当前实际展示来源',
    );
    assert.equal(inlineOptions.root.style.values.has('pointer-events'), false, '正文展示不能被强制点击穿透');
    inline.dispose();
    // Real renderer, controlled asynchronous seams; no browser or image service.
    const deferred = () => {
        let resolve;
        let reject;
        const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
        return { promise, resolve, reject };
    };
    const nextTurn = () => new Promise(resolve => setImmediate(resolve));
    function raceFixture(kind = 'inline', loadGate = null, mountGate = null) {
        const parent = new Root();
        const target = new Root();
        parent.appendChild(target);
        const shown = [];
        let cleanups = 0;
        let epoch = 0;
        const d = { ...inlineDisplay, kind };
        const r = createContentPresetOverlayRenderer({
            modelId: 'race', documentRef: { createElement: () => new Root() },
            getInlineEpoch: () => epoch, getInlineTarget: () => ({ element: target }),
            layerRuntime: { mount: () => parent }, hostAppearance: appearance,
            getPresetRecord: async () => { if (loadGate) await loadGate.promise; return { displays: [d] }; },
            contentPresetImageGenerationHost: {}, createInlineInteractions: () => ({}),
            createContentPresetDisplayRuntime: options => {
                shown.push(options.root);
                return { async mount() { if (mountGate) await mountGate.promise; }, dispose() { cleanups++; } };
            },
        });
        const batch = { inlineEpoch: 0, customDisplay: { modelId: 'race', presetId: 'p', displayId: d.id, display: d }, targetSheetKeys: [], items: [] };
        return { r, batch, parent, shown, invalidate() { epoch++; r.invalidateInline(); }, get cleanups() { return cleanups; } };
    }
    {
        const f = raceFixture();
        await f.r.play(f.batch);
        f.invalidate();
        assert.equal(f.parent.children.length, 1, '发送消息后删除自定义正文节点');
        assert.equal(f.cleanups, 1);
        f.r.dispose();
        assert.equal(f.cleanups, 1, '清理幂等');
    }
    for (const kind of ['popup', 'barrage']) {
        const f = raceFixture(kind);
        await f.r.play(f.batch);
        f.invalidate();
        assert.equal(f.parent.children.length, 2, '正文失效不得误清浮窗或弹幕');
        f.r.dispose();
    }
    {
        const gate = deferred();
        const f = raceFixture('inline', gate);
        const pending = f.r.play(f.batch);
        f.invalidate();
        gate.resolve();
        assert.equal((await pending).status, 'stale');
        assert.equal(f.shown.length, 0, '读取预设期间失效，不创建迟到节点');
        f.r.dispose();
    }
    for (const rejected of [false, true]) {
        const gate = deferred();
        const f = raceFixture('inline', null, gate);
        const pending = f.r.play(f.batch);
        await nextTurn();
        f.invalidate();
        assert.equal(f.cleanups, 1, '挂载尚未完成也必须立即销毁内核');
        assert.equal(f.parent.children.length, 1);
        if (rejected) gate.reject(new Error('cancelled mount'));
        else gate.resolve();
        assert.equal((await pending).status, 'stale');
        assert.equal(f.parent.children.length, 1, '迟到挂载不能复活');
        f.r.dispose();
    }
    {
        const gate = deferred();
        const f = raceFixture('inline', null, gate);
        const first = f.r.play(f.batch);
        await nextTurn();
        const second = f.r.play(f.batch);
        await nextTurn();
        gate.resolve();
        assert.equal((await first).status, 'stale');
        assert.equal((await second).status, 'completed');
        assert.equal(f.parent.children.length, 2, '旧请求不能删除新挂载');
        f.r.dispose();
    }
    console.log('[content-presets-overlay-renderer] 通过');
}
main().catch(error => {
    console.error('[content-presets-overlay-renderer] 失败');
    console.error(error);
    process.exitCode = 1;
});
