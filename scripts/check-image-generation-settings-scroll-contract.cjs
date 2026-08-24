const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    return import(`${href}?contract=${Date.now()}-${Math.random()}`);
}

class FakeHTMLElement extends EventTarget {
    constructor() {
        super();
        this.dataset = {};
        this.value = '';
        this.checked = false;
        this.disabled = false;
        this.innerHTML = '';
        this.textContent = '';
        this.scrollTop = 0;
        this.scrollHeight = 1000;
        this.clientHeight = 200;
        this.offsetHeight = 600;
        this.isConnected = true;
        this.style = {
            minHeight: '',
            removeProperty: (name) => {
                if (name === 'min-height') this.style.minHeight = '';
            },
        };
    }
}

function createFakeContainer() {
    const container = new FakeHTMLElement();
    let html = '';
    let body = null;
    let elements = new Map();
    Object.defineProperty(container, 'innerHTML', {
        configurable: true,
        get() {
            return html;
        },
        set(value) {
            html = String(value ?? '');
            body = new FakeHTMLElement();
            elements = new Map([
                ['.phone-nav-back', new FakeHTMLElement()],
                ['#phone-image-generation-enabled', new FakeHTMLElement()],
                ['#phone-image-generation-test-names', new FakeHTMLElement()],
                ['#phone-image-generation-test-description', new FakeHTMLElement()],
                ['#phone-image-generation-prompt-preview', new FakeHTMLElement()],
                ['#phone-image-generation-test-generate', new FakeHTMLElement()],
                ['#phone-image-generation-test-status', new FakeHTMLElement()],
                ['#phone-image-generation-test-preview', new FakeHTMLElement()],
                ['#phone-image-generation-add-mapping', new FakeHTMLElement()],
                ['#phone-image-generation-clear-mappings', new FakeHTMLElement()],
                ['#phone-image-generation-timeout', new FakeHTMLElement()],
            ]);
            elements.get('#phone-image-generation-timeout').value = '300';
        },
    });
    container.querySelector = (selector) => {
        if (selector === '.phone-app-body.phone-settings-scroll') return body;
        return elements.get(selector) ?? null;
    };
    container.querySelectorAll = () => [];
    return container;
}

function createFakePageRuntime() {
    const listenerRecords = new Set();
    return {
        addEventListener(target, type, listener) {
            target?.addEventListener(type, listener);
            const record = { target, type, listener };
            listenerRecords.add(record);
            return () => {
                if (!listenerRecords.delete(record)) return;
                target?.removeEventListener(type, listener);
            };
        },
        requestAnimationFrame(callback) {
            callback();
            return 1;
        },
        isDisposed() {
            return false;
        },
    };
}

async function flushAsyncWork() {
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
}

async function testImageGenerationStructuralActionsReuseSettingsScrollPreserver() {
    const [
        { createSettingsAppState },
        { createImageGenerationPage },
        { createRuntimeScrollPreserver },
    ] = await Promise.all([
        importModule('modules/settings-app/state-machine.js'),
        importModule('modules/settings-app/pages/image-generation.js'),
        importModule('modules/ui-runtime/scroll-preserver-core.js'),
    ]);
    const state = createSettingsAppState();
    assert.equal(state.imageGenerationScrollTop, 0);

    const container = createFakeContainer();
    const pageRuntime = createFakePageRuntime();
    let page;
    const service = {
        async loadViewModel() {
            return {
                config: { enabled: false, timeoutMs: 300000, roleMappings: [] },
                tables: [],
            };
        },
        async saveConfig(config) {
            return { ok: true, config, tables: [] };
        },
        async testGenerate() {
            return { ok: false, status: 'unavailable' };
        },
    };
    const rerenderImageGenerationKeepScroll = createRuntimeScrollPreserver(
        container,
        state,
        '.phone-app-body.phone-settings-scroll',
        pageRuntime,
    ).createRerenderWithScroll('imageGenerationScrollTop', () => page.update());
    page = createImageGenerationPage({
        container,
        state,
        render() {},
        pageRuntime,
        rerenderImageGenerationKeepScroll,
        imageGenerationSettingsService: service,
        showToast() {},
    });

    page.mount();
    await flushAsyncWork();
    container.querySelector('.phone-app-body.phone-settings-scroll').scrollTop = 157;

    container.querySelector('#phone-image-generation-add-mapping')
        .dispatchEvent(new Event('click'));
    await flushAsyncWork();

    assert.equal(
        container.querySelector('.phone-app-body.phone-settings-scroll').scrollTop,
        157,
        '添加映射后必须复用设置 App 的 createRerenderWithScroll 并保持当前位置',
    );
    assert.equal(state.imageGenerationScrollTop, 157);
    page.dispose();
}

async function main() {
    const originalHTMLElement = global.HTMLElement;
    global.HTMLElement = FakeHTMLElement;
    try {
        await testImageGenerationStructuralActionsReuseSettingsScrollPreserver();
        console.log('[image-generation-settings-scroll] passed');
    } finally {
        if (originalHTMLElement === undefined) delete global.HTMLElement;
        else global.HTMLElement = originalHTMLElement;
    }
}

main().catch((error) => {
    console.error('[image-generation-settings-scroll] failed');
    console.error(error);
    process.exitCode = 1;
});
