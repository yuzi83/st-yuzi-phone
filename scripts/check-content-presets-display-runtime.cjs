const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const load = file => import(`${pathToFileURL(path.resolve(file)).href}?t=${Date.now()}-${Math.random()}`);

class FakeBlob {
    constructor(parts, options = {}) {
        this.parts = parts;
        this.type = options.type || '';
    }
}

class FakeStyle {
    constructor() {
        this.values = new Map();
    }

    setProperty(name, value) {
        this.values.set(name, String(value));
    }

    removeProperty(name) {
        this.values.delete(name);
    }

    getPropertyValue(name) {
        return this.values.get(name) || '';
    }
}

function createRoot() {
    const root = {
        innerHTML: '',
        style: new FakeStyle(),
        children: [],
        created: [],
        ownerDocument: {
            createElement(tagName) {
                const node = {
                    tagName,
                    textContent: '',
                    removed: false,
                    remove() { this.removed = true; },
                };
                root.created.push(node);
                return node;
            },
        },
        prepend(node) {
            this.children.unshift(node);
        },
        replaceChildren(...nodes) {
            this.children = nodes;
            this.innerHTML = '';
        },
    };
    return root;
}

function createSource(initialState) {
    let state = initialState;
    const listeners = new Set();
    let subscribed = 0;
    let unsubscribed = 0;
    return {
        get subscribed() { return subscribed; },
        get unsubscribed() { return unsubscribed; },
        getState: () => state,
        subscribe(listener) {
            subscribed += 1;
            listeners.add(listener);
            return () => {
                if (!listeners.delete(listener)) return;
                unsubscribed += 1;
            };
        },
        emit(nextState) {
            state = nextState;
            for (const listener of [...listeners]) listener(nextState);
        },
    };
}

function record(kind = 'inline', integrations) {
    if (arguments.length < 2) integrations = { theme: true, font: true };
    const display = {
        id: `${kind}-profile`,
        kind,
        integrations,
        interactions: kind === 'inline' ? ['expand', 'tabs', 'append-input'] : [],
        entry: {
            html: 'displays/profile.html',
            css: 'displays/profile.css',
            mount: 'displays/profile.mjs',
        },
    };
    return {
        id: 'display-runtime-test',
        files: {
            'displays/profile.html': { content: '<img src="../images/avatar.svg">', mimeType: 'text/html' },
            'displays/profile.css': { content: '.avatar{background:url("../images/avatar.svg")}', mimeType: 'text/css' },
            'displays/profile.mjs': { content: 'export function mount(context) {}', mimeType: 'text/javascript' },
            'images/avatar.svg': { content: '<svg/>', mimeType: 'image/svg+xml' },
        },
        displays: [display],
    };
}

function createUrls(prefix) {
    const created = [];
    const revoked = [];
    return {
        created,
        revoked,
        createObjectURL() {
            const url = `blob:${prefix}-${created.length + 1}`;
            created.push(url);
            return url;
        },
        revokeObjectURL(url) {
            revoked.push(url);
        },
    };
}

function createRuntimeOptions({ preset, root, mount, theme, font, signal, interactions, assetUrls, moduleUrls, importModule }) {
    return {
        record: preset,
        display: preset.displays[0],
        root,
        initialState: Object.freeze({ version: 1, rows: [] }),
        signal,
        inlineInteractions: interactions,
        theme,
        font,
        assetRuntimeOptions: {
            BlobCtor: FakeBlob,
            ...assetUrls,
        },
        moduleOptions: {
            BlobCtor: FakeBlob,
            ...moduleUrls,
            importModule: importModule || (async () => ({ mount })),
        },
    };
}

async function testMountAssetsContextAppearanceAndInlineInteractions(factory) {
    const root = createRoot();
    root.style.setProperty('--author-card-color', '#bada55');
    const theme = createSource({ mode: 'dark' });
    const font = createSource({ family: 'YuZi Test Font' });
    const assetUrls = createUrls('asset');
    const moduleUrls = createUrls('module');
    const calls = [];
    let context = null;
    const preset = record();
    const runtime = factory(createRuntimeOptions({
        preset,
        root,
        theme,
        font,
        assetUrls,
        moduleUrls,
        interactions: {
            expand: (...args) => calls.push(['expand', ...args]),
            tab: (...args) => calls.push(['tab', ...args]),
            appendToComposer: (...args) => calls.push(['append', ...args]),
        },
        mount(nextContext) {
            context = nextContext;
            nextContext.subscribe((state, meta) => calls.push(['state', state.version, meta.reason]));
            return () => calls.push(['author-dispose']);
        },
    }));

    const mounted = await runtime.mount();
    assert.equal(mounted, true, '成功挂载必须返回 true');
    assert.match(root.innerHTML, /blob:asset-1/, 'HTML 内的相对资源必须通过 asset runtime 改写');
    assert.equal(root.children.length, 1, 'CSS 必须作为独立 style 节点挂入 root');
    assert.match(root.children[0].textContent, /blob:asset-1/, 'CSS 内的相对资源必须通过 asset runtime 改写');
    assert.equal(root.style.getPropertyValue('--yuzi-content-preset-theme-mode'), 'dark', '接入主题时必须暴露只读主题模式变量');
    assert.equal(root.style.getPropertyValue('--yuzi-content-preset-font-family'), 'YuZi Test Font', '接入字体时必须暴露只读字体变量');
    assert.equal(root.style.getPropertyValue('--author-card-color'), '#bada55', '全局接入不得覆盖作者布局或颜色变量');
    assert.equal(theme.subscribed, 1, '接入主题时才订阅主题源');
    assert.equal(font.subscribed, 1, '接入字体时才订阅字体源');
    assert.deepEqual(Object.keys(context.actions).sort(), ['appendToComposer', 'expand', 'tab'], 'inline 只能暴露本地三类交互 helper');

    context.actions.expand('detail');
    context.actions.tab('profile');
    context.actions.appendToComposer('你好');
    assert.deepEqual(calls.slice(0, 3), [
        ['expand', 'detail'],
        ['tab', 'profile'],
        ['append', '你好'],
    ], 'inline helper 必须只转发宿主明确注入的本地交互');

    assert.equal(runtime.update(Object.freeze({ version: 2, rows: [] })), true, '运行时必须提供最小状态更新桥接');
    assert.deepEqual(calls.at(-1), ['state', 2, 'table-data'], '状态更新必须经公开 runtime context 投递');
    theme.emit({ mode: 'light' });
    font.emit({ family: 'Second Font' });
    assert.equal(root.style.getPropertyValue('--yuzi-content-preset-theme-mode'), 'light', '主题订阅更新必须刷新变量');
    assert.equal(root.style.getPropertyValue('--yuzi-content-preset-font-family'), 'Second Font', '字体订阅更新必须刷新变量');

    runtime.dispose();
    runtime.dispose();
    assert.deepEqual(calls.at(-1), ['author-dispose'], '作者 disposer 必须在销毁时且只在销毁时调用一次');
    assert.equal(root.innerHTML, '', '销毁必须清空由运行时放入 root 的 HTML');
    assert.equal(root.created[0]?.removed, true, '销毁必须移除运行时 style 节点');
    assert.deepEqual(assetUrls.revoked, ['blob:asset-1'], '销毁必须回收 asset URL');
    assert.deepEqual(moduleUrls.revoked, ['blob:module-1'], '销毁必须回收 module URL');
    assert.equal(theme.unsubscribed, 1, '销毁必须取消主题订阅');
    assert.equal(font.unsubscribed, 1, '销毁必须取消字体订阅');
}

async function testInlineExposesAuthorImageGenerationState(factory) {
    const root = createRoot();
    const assetUrls = createUrls('image-state-asset');
    const moduleUrls = createUrls('image-state-module');
    const preset = record();
    preset.displays[0].interactions.push('image-generate');
    let context = null;
    const expectedState = Object.freeze({ available: true, status: 'ready' });
    const unsubscribe = () => {};
    const runtime = factory(createRuntimeOptions({
        preset,
        root,
        assetUrls,
        moduleUrls,
        interactions: {
            getImageGenerationState: async () => expectedState,
            subscribeImageGeneration: () => unsubscribe,
        },
        mount(nextContext) { context = nextContext; },
    }));
    await runtime.mount();
    assert.equal(typeof context.actions.getImageGenerationState, 'function', '声明生图的正文作者必须能读取按钮可用状态');
    assert.equal(typeof context.actions.subscribeImageGeneration, 'function', '声明生图的正文作者必须能订阅设置变化');
    assert.strictEqual(await context.actions.getImageGenerationState('封面'), expectedState, '状态读取必须只转发宿主提供的生图状态 seam');
    assert.strictEqual(context.actions.subscribeImageGeneration(() => {}), unsubscribe, '订阅动作必须只转发宿主提供的生图状态 seam');
    runtime.dispose();
}

async function testNonInlineDoesNotExposeAppearanceOrInteractions(factory) {
    for (const kind of ['popup', 'barrage']) {
        const root = createRoot();
        const theme = createSource({ mode: 'dark' });
        const font = createSource({ family: 'Ignored Font' });
        const assetUrls = createUrls(`${kind}-asset`);
        const moduleUrls = createUrls(`${kind}-module`);
        const preset = record(kind, undefined);
        preset.displays[0].interactions = ['image-generate'];
        let context = null;
        const runtime = factory(createRuntimeOptions({
            preset,
            root,
            theme,
            font,
            assetUrls,
            moduleUrls,
            interactions: {
                expand() { throw new Error(`${kind} 不应获得交互`); },
                getImageGenerationState() { throw new Error(`${kind} 不应获得生图状态`); },
                subscribeImageGeneration() { throw new Error(`${kind} 不应获得生图订阅`); },
            },
            mount(nextContext) { context = nextContext; },
        }));
        await runtime.mount();
        assert.deepEqual(Object.keys(context.actions), [], `${kind} 不得暴露 inline interaction helper`);
        assert.equal(theme.subscribed, 0, `${kind} 未声明主题接入不得订阅主题源`);
        assert.equal(font.subscribed, 0, `${kind} 未声明字体接入不得订阅字体源`);
        assert.equal(root.style.getPropertyValue('--yuzi-content-preset-theme-mode'), '', `${kind} 未接入主题不得写入主题变量`);
        assert.equal(root.style.getPropertyValue('--yuzi-content-preset-font-family'), '', `${kind} 未接入字体不得写入字体变量`);
        runtime.dispose();
    }
}

async function testMountFailureCleansEveryResource(factory) {
    const root = createRoot();
    const assetUrls = createUrls('failure-asset');
    const moduleUrls = createUrls('failure-module');
    const preset = record();
    const runtime = factory(createRuntimeOptions({
        preset,
        root,
        assetUrls,
        moduleUrls,
        mount() {
            throw new Error('author mount failed');
        },
    }));
    await assert.rejects(runtime.mount(), /author mount failed/, '作者 mount 异常必须向调用方显式失败');
    assert.equal(root.innerHTML, '', '挂载异常必须回滚 HTML');
    assert.equal(root.created[0]?.removed, true, '挂载异常必须回滚 style');
    assert.deepEqual(assetUrls.revoked, ['blob:failure-asset-1'], '挂载异常必须回收 asset URL');
    assert.deepEqual(moduleUrls.revoked, ['blob:failure-module-1'], '挂载异常必须回收 module URL');
}

async function testAbortCleansPendingModuleAndNeverMounts(factory) {
    const root = createRoot();
    const controller = new AbortController();
    const assetUrls = createUrls('abort-asset');
    const moduleUrls = createUrls('abort-module');
    let resolveImport;
    let mounted = false;
    const preset = record();
    const runtime = factory(createRuntimeOptions({
        preset,
        root,
        signal: controller.signal,
        assetUrls,
        moduleUrls,
        importModule: () => new Promise(resolve => { resolveImport = resolve; }),
        mount() { mounted = true; },
    }));
    const pending = runtime.mount();
    controller.abort();
    await assert.rejects(pending, error => error?.name === 'AbortError', '外部 AbortSignal 必须取消挂载');
    resolveImport({ mount() { mounted = true; } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(mounted, false, 'abort 后不得再执行作者 mount');
    assert.equal(root.innerHTML, '', 'abort 必须回滚 HTML');
    assert.deepEqual(assetUrls.revoked, ['blob:abort-asset-1'], 'abort 必须回收已创建的 asset URL');
    assert.deepEqual(moduleUrls.revoked, ['blob:abort-module-1'], 'abort 必须回收待导入的 module URL');
}

async function main() {
    const { createContentPresetDisplayRuntime } = await load('modules/content-presets/display-runtime.js');
    assert.equal(typeof createContentPresetDisplayRuntime, 'function', '展示运行时必须暴露公开工厂 seam');
    await testMountAssetsContextAppearanceAndInlineInteractions(createContentPresetDisplayRuntime);
    await testInlineExposesAuthorImageGenerationState(createContentPresetDisplayRuntime);
    await testNonInlineDoesNotExposeAppearanceOrInteractions(createContentPresetDisplayRuntime);
    await testMountFailureCleansEveryResource(createContentPresetDisplayRuntime);
    await testAbortCleansPendingModuleAndNeverMounts(createContentPresetDisplayRuntime);
    console.log('[content-presets-display-runtime-check] 检查通过');
}

main().catch(error => {
    console.error('[content-presets-display-runtime-check] 检查失败');
    console.error(error);
    process.exitCode = 1;
});
