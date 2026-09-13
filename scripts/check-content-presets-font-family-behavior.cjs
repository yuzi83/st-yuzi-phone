const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const load = file => import(pathToFileURL(path.resolve(__dirname, '..', file)).href);

async function main() {
    const original = Object.fromEntries(['window', 'document', 'HTMLElement', 'CustomEvent', 'getContext'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    const { extensionName } = await load('modules/settings/schema.js');
    const host = { extensionSettings: { [extensionName]: {} } };
    globalThis.getContext = () => host;
    globalThis.window = new EventTarget();
    globalThis.CustomEvent = class extends Event { constructor(type, init = {}) { super(type); this.detail = init.detail; } };
    class Element {
        constructor(id = '') {
            this.id = id;
            this.values = new Map();
            this.style = { setProperty: (key, value) => this.values.set(key, value), removeProperty: key => this.values.delete(key) };
        }
        setAttribute(key, value) { this[key] = value; }
        querySelector() { return null; }
    }
    globalThis.HTMLElement = Element;
    const phone = new Element('yuzi-phone-standalone');
    const elements = new Map([[phone.id, phone]]);
    globalThis.document = {
        getElementById: id => elements.get(id) || null,
        createElement: () => new Element(),
        head: { appendChild: element => elements.set(element.id, element) },
    };
    try {
        const settings = await load('modules/settings.js');
        const fonts = await load('modules/settings-app/services/appearance-settings/font-library-service.js');
        const { createContentPresetHostAppearance, createContentPresetAppearanceBridge } = await load('modules/content-presets/host-appearance.js');
        const local = { id: 'user.local', name: '本地测试字体', family: 'Local Test', format: 'woff2', mime: 'font/woff2', dataUrl: 'data:font/woff2;base64,AAAA', bytes: 3, hash: 'local', createdAt: 1 };
        const remote = { id: 'user.remote', name: '远程测试字体', family: 'Remote Test', sourceType: 'css-url', cssUrl: 'https://example.invalid/font.css', hash: 'remote', createdAt: 1 };
        // 仅内存设置和假 DOM；不保存资源，不加载字体，不请求网络。
        const setLibrary = library => { settings.getPhoneSettings().appearanceFontLibrary = library; };
        const appearance = createContentPresetHostAppearance();
        const root = new Element();
        const variable = '--yuzi-content-preset-font-family';
        const stop = createContentPresetAppearanceBridge(root, { integrations: { font: true } }, appearance);
        const cases = [
            ...fonts.getAppearanceBuiltinFonts().map(font => ({ activeFontId: font.id, userFonts: [] })),
            { activeFontId: local.id, userFonts: [local, remote] },
            { activeFontId: remote.id, userFonts: [local, remote] },
            { activeFontId: 'missing', userFonts: [local] },
            { activeFontId: local.id, userFonts: [remote] }, // 当前字体已删除。
            { activeFontId: 'broken', userFonts: [{ id: 'broken', dataUrl: 'invalid' }] },
        ];
        for (const library of cases) {
            setLibrary(library);
            const expected = fonts.getAppearanceFontLibraryViewModel().activeFont.cssFamily;
            assert.equal(fonts.getAppearanceFontFamily(), expected, library.activeFontId);
            assert.deepEqual(appearance.font.getState(), { family: expected });
            assert.equal(fonts.applyAppearanceFontLibrary(phone), true);
            assert.equal(phone.values.get('--yuzi-phone-font-family'), expected);
            window.dispatchEvent(new CustomEvent(settings.PHONE_SETTINGS_UPDATED_EVENT, { detail: { key: 'appearanceFontLibrary' } }));
            assert.equal(root.values.get(variable), expected, '真实解析、手机应用和内容预设必须一致');
        }
        stop();
        setLibrary({ activeFontId: remote.id, userFonts: [remote] });
        window.dispatchEvent(new CustomEvent(settings.PHONE_SETTINGS_UPDATED_EVENT));
        assert.equal(root.values.has(variable), false, '销毁后清理变量且停止更新');

        setLibrary({ activeFontId: local.id, userFonts: [local, remote] });
        const stringify = JSON.stringify;
        let fontListCopies = 0;
        JSON.stringify = function(value, ...args) {
            if (Array.isArray(value) && value.some(item => item?.id === local.id && item?.dataUrl)) fontListCopies += 1;
            return stringify.call(this, value, ...args);
        };
        try {
            fonts.getAppearanceFontLibraryViewModel();
            assert.equal(fontListCopies, 1, '对照路径确实复制完整字体列表');
            fontListCopies = 0;
            appearance.font.getState();
            assert.equal(fontListCopies, 0, '生产字体读取路径不得再 JSON 深复制字体列表');
        } finally { JSON.stringify = stringify; }
        console.log('[content-presets-font-family-behavior] 通过：真实解析一致、联动与销毁、无字体列表深复制');

        if (process.argv.includes('--benchmark')) {
            const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
            const measure = fn => {
                const started = performance.now();
                for (let i = 0; i < 50; i += 1) fn();
                return (performance.now() - started) / 50;
            };
            for (const [name, library] of [
                ['无用户字体', { activeFontId: 'builtin.system-ui', userFonts: [] }],
                ['1MiB模拟字体DataURL', { activeFontId: local.id, userFonts: [{ ...local, dataUrl: 'data:font/woff2;base64,' + 'A'.repeat(1024 * 1024), bytes: 786432 }] }],
            ]) {
                setLibrary(library);
                const oldRead = () => fonts.getAppearanceFontLibraryViewModel().activeFont.cssFamily;
                const newRead = () => fonts.getAppearanceFontFamily();
                for (let i = 0; i < 20; i += 1) { oldRead(); newRead(); }
                const oldTimes = [], newTimes = [];
                for (let i = 0; i < 7; i += 1) {
                    if (i % 2) { newTimes.push(measure(newRead)); oldTimes.push(measure(oldRead)); }
                    else { oldTimes.push(measure(oldRead)); newTimes.push(measure(newRead)); }
                }
                console.log(JSON.stringify({ scenario: name, oldMedianMs: median(oldTimes), newMedianMs: median(newTimes), note: 'Node内存微基准，不代表浏览器整页性能；不作为通过门槛' }));
            }
        }
    } finally {
        for (const [key, descriptor] of Object.entries(original)) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete globalThis[key];
        }
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
