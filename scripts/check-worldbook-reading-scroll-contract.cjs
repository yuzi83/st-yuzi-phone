const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    return import(`${href}?scroll-contract=${Date.now()}-${Math.random()}`);
}

class FakeHTMLElement extends EventTarget {
    constructor({ value = '', checked = false, disabled = false, dataset = {}, scrollHeight = 600, clientHeight = 200 } = {}) {
        super();
        this.value = value;
        this.checked = checked;
        this.disabled = disabled;
        this.dataset = dataset;
        this.innerHTML = '';
        this.textContent = '';
        this.scrollTop = 0;
        this.scrollHeight = scrollHeight;
        this.clientHeight = clientHeight;
        this.offsetHeight = 800;
        this.isConnected = true;
        this.style = {
            minHeight: '',
            removeProperty(name) {
                delete this[name];
            },
        };
    }
}

function createFakeContainer() {
    let html = '';
    let elements = new Map();
    let checkboxes = [];
    const parseCheckboxes = value => [...String(value ?? '').matchAll(/<input type="checkbox" class="phone-worldbook-entry-checkbox"[\s\S]*?data-worldbook="([^"]*)" data-uid="([^"]*)"[\s\S]*?>/gu)]
        .map((match) => new FakeHTMLElement({
            checked: /\bchecked\b/u.test(match[0]),
            disabled: /\bdisabled\b/u.test(match[0]),
            dataset: { worldbook: match[1], uid: match[2] },
        }));

    const container = new FakeHTMLElement();
    Object.defineProperty(container, 'innerHTML', {
        configurable: true,
        get() {
            return html;
        },
        set(value) {
            html = String(value ?? '');
            elements = new Map([
                ['.phone-nav-back', new FakeHTMLElement()],
                ['#phone-worldbook-reading-refresh', new FakeHTMLElement()],
                ['#phone-worldbook-reading-select-all', new FakeHTMLElement()],
                ['#phone-worldbook-reading-deselect-all', new FakeHTMLElement()],
                ['#phone-worldbook-reading-search', new FakeHTMLElement()],
                ['#phone-worldbook-reading-blocked-keywords', new FakeHTMLElement()],
                ['#phone-worldbook-reading-blocked-keywords-save', new FakeHTMLElement()],
                ['#phone-worldbook-reading-status', new FakeHTMLElement()],
            ]);
            const isLoadingEntries = /phone-worldbook-(?:loading|error)/u.test(html);
            elements.set('.phone-app-body.phone-settings-scroll', new FakeHTMLElement({
                scrollHeight: isLoadingEntries ? 320 : 1200,
                clientHeight: 320,
            }));
            const entries = new FakeHTMLElement({
                scrollHeight: isLoadingEntries ? 320 : 613,
                clientHeight: 320,
            });
            Object.defineProperty(entries, 'innerHTML', {
                configurable: true,
                get() {
                    return this.renderedHtml ?? '';
                },
                set(nextHtml) {
                    this.renderedHtml = String(nextHtml ?? '');
                    checkboxes = parseCheckboxes(this.renderedHtml);
                },
            });
            entries.innerHTML = html;
            elements.set('#phone-worldbook-reading-entries', entries);
            checkboxes = parseCheckboxes(html);
        },
    });

    container.querySelector = (selector) => {
        if (selector === '.phone-worldbook-entry-checkbox') return checkboxes[0] ?? null;
        return elements.get(selector) ?? null;
    };
    container.querySelectorAll = (selector) => selector === '.phone-worldbook-entry-checkbox' ? checkboxes : [];
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
    };
}

async function main() {
    const originalHTMLElement = global.HTMLElement;
    global.HTMLElement = FakeHTMLElement;

    try {
        const [
            { createWorldbookReadingPage },
            { createRuntimeScrollPreserver },
        ] = await Promise.all([
            importModule('modules/settings-app/pages/worldbook-reading.js'),
            importModule('modules/ui-runtime/scroll-preserver-core.js'),
        ]);
        const container = createFakeContainer();
        const pageRuntime = createFakePageRuntime();
        const scrollState = {};
        let page;
        const rerenderWorldbookReadingKeepScroll = createRuntimeScrollPreserver(
            container,
            scrollState,
            '.phone-app-body.phone-settings-scroll',
            pageRuntime,
        ).createRerenderWithScroll('worldbookReadingScrollTop', () => page.update());
        page = createWorldbookReadingPage({
            container,
            state: { mode: 'worldbook_reading' },
            render() {},
            pageRuntime,
            rerenderWorldbookReadingKeepScroll,
            worldbookReadingCatalog: {
                async load() {
                    return {
                        books: [{ name: '角色主书', sourceRole: 'primary' }],
                        entries: [{
                            ref: { bookName: '角色主书', uid: '1' },
                            sourceRole: 'primary',
                            enabled: true,
                            selected: true,
                            value: { comment: '主书人设' },
                        }],
                    };
                },
                async setSelected() {},
                async subscribe() { return () => {}; },
            },
        });

        page.mount();
        await new Promise(resolve => setImmediate(resolve));
        await new Promise(resolve => setImmediate(resolve));
        const pageBodyBeforeRefresh = container.querySelector('.phone-app-body.phone-settings-scroll');
        pageBodyBeforeRefresh.scrollTop = 157;

        container.querySelector('#phone-worldbook-reading-refresh')
            .dispatchEvent(new Event('click'));
        await new Promise(resolve => setImmediate(resolve));
        await new Promise(resolve => setImmediate(resolve));

        const pageBodyAfterRefresh = container.querySelector('.phone-app-body.phone-settings-scroll');
        assert.equal(
            pageBodyAfterRefresh.scrollTop,
            157,
            '点击刷新后，读取世界书设置页应复用统一保滚逻辑并保持整页滚动位置',
        );
        page.dispose();
    } finally {
        if (originalHTMLElement === undefined) delete global.HTMLElement;
        else global.HTMLElement = originalHTMLElement;
    }

    console.log('[worldbook-reading-scroll] passed');
}

main().catch((error) => {
    console.error('[worldbook-reading-scroll] failed');
    console.error(error);
    process.exitCode = 1;
});