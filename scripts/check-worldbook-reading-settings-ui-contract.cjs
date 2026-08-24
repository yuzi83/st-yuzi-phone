const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    return import(`${href}?contract=${Date.now()}-${Math.random()}`);
}

class FakeElement extends EventTarget {
    constructor({ value = '', checked = false, disabled = false, dataset = {} } = {}) {
        super();
        this.value = value;
        this.checked = checked;
        this.disabled = disabled;
        this.dataset = dataset;
        this.innerHTML = '';
        this.textContent = '';
    }
}

function createFakeContainer() {
    let html = '';
    let elements = new Map();
    let checkboxes = [];
    const parseCheckboxes = value => [...String(value ?? '').matchAll(/<input type="checkbox" class="phone-worldbook-entry-checkbox"[\s\S]*?data-worldbook="([^"]*)" data-uid="([^"]*)"[\s\S]*?>/gu)]
        .map((match) => new FakeElement({
            checked: /\bchecked\b/u.test(match[0]),
            disabled: /\bdisabled\b/u.test(match[0]),
            dataset: { worldbook: match[1], uid: match[2] },
        }));
    const container = {
        get innerHTML() { return html; },
        set innerHTML(value) {
            html = String(value ?? '');
            elements = new Map([
                ['.phone-nav-back', new FakeElement()],
                ['#phone-worldbook-reading-refresh', new FakeElement()],
                ['#phone-worldbook-reading-select-all', new FakeElement()],
                ['#phone-worldbook-reading-deselect-all', new FakeElement()],
            ]);
            const searchValue = html.match(/id="phone-worldbook-reading-search"[^>]*value="([^"]*)"/u)?.[1] ?? '';
            elements.set('#phone-worldbook-reading-search', new FakeElement({ value: searchValue }));
            const blockedKeywordsValue = html.match(/<textarea id="phone-worldbook-reading-blocked-keywords"[^>]*>([\s\S]*?)<\/textarea>/u)?.[1] ?? '';
            elements.set('#phone-worldbook-reading-blocked-keywords', new FakeElement({ value: blockedKeywordsValue }));
            elements.set('#phone-worldbook-reading-blocked-keywords-save', new FakeElement());
            const entries = new FakeElement();
            Object.defineProperty(entries, 'innerHTML', {
                configurable: true,
                get() { return this.renderedHtml ?? ''; },
                set(value) {
                    this.renderedHtml = String(value ?? '');
                    checkboxes = parseCheckboxes(this.renderedHtml);
                },
            });
            elements.set('#phone-worldbook-reading-entries', entries);
            elements.set('#phone-worldbook-reading-status', new FakeElement());
            checkboxes = parseCheckboxes(html);
        },
        querySelector(selector) {
            if (selector === '.phone-worldbook-entry-checkbox') return checkboxes[0] ?? null;
            return elements.get(selector) ?? null;
        },
        querySelectorAll(selector) {
            return selector === '.phone-worldbook-entry-checkbox' ? checkboxes : [];
        },
    };
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
        get activeListenerCount() {
            return listenerRecords.size;
        },
    };
}

async function flushAsyncWork() {
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
}

async function testSettingsHomeExposesWorldbookReadingAsTopLevelPage() {
    const { buildSettingsHomePageHtml } = await importModule(
        'modules/settings-app/layout/page-builders/overview-builders.js',
    );

    const html = buildSettingsHomePageHtml({ contentPresetFullPageRuntimeEnabled: false });

    assert.match(html, /data-entry="worldbook_reading"/u);
    assert.match(html, />读取世界书</u);
}

async function testWorldbookReadingPageShowsBookSourceAndSparseSelection() {
    const { buildWorldbookReadingPageHtml } = await importModule(
        'modules/settings-app/pages/worldbook-reading.js',
    );
    const html = buildWorldbookReadingPageHtml({
        query: '',
        loading: false,
        error: '',
        snapshot: {
            books: [
                { name: '角色主书', sourceRole: 'primary' },
                { name: '角色附加书', sourceRole: 'additional' },
            ],
            entries: [
                {
                    ref: { bookName: '角色主书', uid: '1' },
                    sourceRole: 'primary',
                    enabled: true,
                    selected: true,
                    value: { comment: '主书启用条目' },
                },
                {
                    ref: { bookName: '角色附加书', uid: '7' },
                    sourceRole: 'additional',
                    enabled: true,
                    selected: false,
                    value: { comment: '附加书已取消条目' },
                },
                {
                    ref: { bookName: '角色主书', uid: '9' },
                    sourceRole: 'primary',
                    enabled: false,
                    selected: false,
                    value: { comment: '酒馆禁用条目' },
                },
            ],
        },
    });

    assert.match(html, /角色主书 · 主世界书/u);
    assert.match(html, /角色附加书 · 附加世界书/u);
    assert.match(html, /data-worldbook="角色主书" data-uid="1"[^>]*checked/u);
    assert.doesNotMatch(html, /data-worldbook="角色附加书" data-uid="7"[^>]*checked/u);
    assert.match(html, /data-worldbook="角色主书" data-uid="9"[^>]*disabled/u);
    assert.doesNotMatch(html, /总开关|手选世界书|关闭读取/u);
}

async function testWorldbookReadingPageEditsBlockedKeywords() {
    const { createWorldbookReadingPage } = await importModule(
        'modules/settings-app/pages/worldbook-reading.js',
    );
    const container = createFakeContainer();
    const calls = [];
    let blockedKeywords = ['MVU'];
    const catalog = {
        async load() {
            return {
                books: [],
                entries: [],
                blockedKeywords,
            };
        },
        async setSelected() {},
        async setBlockedKeywords(next) {
            calls.push(next);
            blockedKeywords = [...next];
        },
        async subscribe() { return () => {}; },
    };
    const page = createWorldbookReadingPage({
        container,
        state: { mode: 'worldbook_reading' },
        render() {},
        pageRuntime: createFakePageRuntime(),
        worldbookReadingCatalog: catalog,
    });

    page.mount();
    await flushAsyncWork();

    const textarea = container.querySelector('#phone-worldbook-reading-blocked-keywords');
    assert.equal(textarea.value, 'MVU');
    textarea.value = 'MVU\n规则\nMVU';
    container.querySelector('#phone-worldbook-reading-blocked-keywords-save')
        .dispatchEvent(new Event('click'));
    await flushAsyncWork();

    assert.deepEqual(calls, [['MVU', '规则', 'MVU']]);
    page.dispose();
}

async function testWorldbookReadingPageSearchesAndExposesBulkActions() {
    const { buildWorldbookReadingPageHtml } = await importModule(
        'modules/settings-app/pages/worldbook-reading.js',
    );
    const html = buildWorldbookReadingPageHtml({
        query: '附加',
        loading: false,
        error: '',
        snapshot: {
            entries: [
                {
                    ref: { bookName: '角色主书', uid: '1' },
                    sourceRole: 'primary', enabled: true, selected: true,
                    value: { comment: '主书人设' },
                },
                {
                    ref: { bookName: '角色附加书', uid: '7' },
                    sourceRole: 'additional', enabled: true, selected: true,
                    value: { comment: '附加剧情' },
                },
            ],
        },
    });

    assert.match(html, /id="phone-worldbook-reading-search"[^>]*value="附加"/u);
    assert.match(html, /id="phone-worldbook-reading-refresh"/u);
    assert.match(html, /id="phone-worldbook-reading-select-all"/u);
    assert.match(html, /id="phone-worldbook-reading-deselect-all"/u);
    assert.match(html, /附加剧情/u);
    assert.doesNotMatch(html, /主书人设/u);
}

async function testWorldbookReadingPagePersistsSelectionAndRefreshesOnHostUpdate() {
    const { createWorldbookReadingPage } = await importModule(
        'modules/settings-app/pages/worldbook-reading.js',
    );
    const container = createFakeContainer();
    const calls = [];
    let selected = true;
    let invalidated = null;
    let disposed = false;
    let keepScrollRerenderCount = 0;
    let page;
    const catalog = {
        async load() {
            calls.push(['load']);
            return {
                books: [{ name: '角色主书', sourceRole: 'primary' }],
                entries: [{
                    ref: { bookName: '角色主书', uid: '1' },
                    sourceRole: 'primary', enabled: true, selected,
                    value: { comment: '主书人设' },
                }],
            };
        },
        async setSelected(refs, nextSelected) {
            calls.push(['setSelected', refs, nextSelected]);
            selected = nextSelected;
        },
        async subscribe(listener) {
            invalidated = listener;
            return () => { disposed = true; };
        },
    };
    const state = { mode: 'worldbook_reading' };
    page = createWorldbookReadingPage({
        container,
        state,
        render() {},
        rerenderWorldbookReadingKeepScroll() {
            keepScrollRerenderCount += 1;
            page?.update();
        },
        pageRuntime: createFakePageRuntime(),
        worldbookReadingCatalog: catalog,
    });

    page.mount();
    await flushAsyncWork();
    const rerenderCountBeforeSelection = keepScrollRerenderCount;
    const checkbox = container.querySelector('.phone-worldbook-entry-checkbox');
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));
    await flushAsyncWork();

    assert.deepEqual(calls.find(call => call[0] === 'setSelected'), [
        'setSelected',
        [{ bookName: '角色主书', uid: '1' }],
        false,
    ]);
    assert.doesNotMatch(container.innerHTML, /data-worldbook="角色主书" data-uid="1"[^>]*checked/u);
    assert.equal(keepScrollRerenderCount, rerenderCountBeforeSelection + 1);

    const loadCountBeforeInvalidation = calls.filter(call => call[0] === 'load').length;
    invalidated();
    await flushAsyncWork();
    assert.equal(calls.filter(call => call[0] === 'load').length, loadCountBeforeInvalidation + 1);

    page.dispose();
    await flushAsyncWork();
    assert.equal(disposed, true);
}

async function testWorldbookReadingSearchKeepsFocusTargetAndDoesNotAccumulateListeners() {
    const { createWorldbookReadingPage } = await importModule(
        'modules/settings-app/pages/worldbook-reading.js',
    );
    const container = createFakeContainer();
    const pageRuntime = createFakePageRuntime();
    const page = createWorldbookReadingPage({
        container,
        state: { mode: 'worldbook_reading' },
        render() {},
        pageRuntime,
        worldbookReadingCatalog: {
            async load() {
                return {
                    books: [{ name: '角色主书', sourceRole: 'primary' }],
                    entries: [{
                        ref: { bookName: '角色主书', uid: '1' },
                        sourceRole: 'primary', enabled: true, selected: true,
                        value: { comment: '主书人设' },
                    }],
                };
            },
            async setSelected() {},
            async subscribe() { return () => {}; },
        },
    });

    page.mount();
    await flushAsyncWork();
    const search = container.querySelector('#phone-worldbook-reading-search');
    const listenerCount = pageRuntime.activeListenerCount;
    search.value = '主书';
    search.dispatchEvent(new Event('input'));

    assert.equal(
        container.querySelector('#phone-worldbook-reading-search'),
        search,
        '搜索过滤应保留当前输入框节点，避免真实浏览器丢失焦点',
    );
    assert.equal(pageRuntime.activeListenerCount, listenerCount);

    page.update();
    assert.equal(pageRuntime.activeListenerCount, listenerCount);
    page.dispose();
    assert.equal(pageRuntime.activeListenerCount, 0);
}

async function testWorldbookReadingRefreshDoesNotCancelPendingSubscription() {
    const { createWorldbookReadingPage } = await importModule(
        'modules/settings-app/pages/worldbook-reading.js',
    );
    const container = createFakeContainer();
    let loadCount = 0;
    let hostListener = null;
    let settleSubscription = null;
    let subscriptionDisposed = false;
    const page = createWorldbookReadingPage({
        container,
        state: { mode: 'worldbook_reading' },
        render() {},
        pageRuntime: createFakePageRuntime(),
        worldbookReadingCatalog: {
            async load() {
                loadCount += 1;
                return { books: [], entries: [], issues: [] };
            },
            async setSelected() {},
            subscribe(listener) {
                hostListener = listener;
                return new Promise((resolve) => {
                    settleSubscription = () => resolve(() => {
                        subscriptionDisposed = true;
                    });
                });
            },
        },
    });

    page.mount();
    await flushAsyncWork();
    container.querySelector('#phone-worldbook-reading-refresh').dispatchEvent(new Event('click'));
    await flushAsyncWork();
    settleSubscription();
    await flushAsyncWork();

    assert.equal(
        subscriptionDisposed,
        false,
        '刷新只应推进 load generation，不应让尚在建立的页面订阅失效',
    );
    const loadCountBeforeHostUpdate = loadCount;
    hostListener();
    await flushAsyncWork();
    assert.equal(loadCount, loadCountBeforeHostUpdate + 1);

    page.dispose();
    assert.equal(subscriptionDisposed, true);
}

async function testSettingsPageRegistryCreatesWorldbookReadingPage() {
    const { createPersonalizationPageRenderers } = await importModule(
        'modules/settings-app/page-renderers/personalization-renderers.js',
    );
    const container = createFakeContainer();
    const renderers = createPersonalizationPageRenderers({
        pageContexts: {
            home: {},
            appearance: {},
            buttonStyle: {},
            worldbookReading: {
                container,
                state: { mode: 'worldbook_reading' },
                render() {},
                pageRuntime: createFakePageRuntime(),
                worldbookReadingCatalog: {
                    async load() { return { books: [], entries: [], issues: [] }; },
                    async setSelected() {},
                    async subscribe() { return () => {}; },
                },
            },
        },
    });

    const page = renderers.pages.worldbook_reading.createPage();

    assert.equal(typeof page.mount, 'function');
    assert.equal(typeof page.dispose, 'function');
}

async function testWorldbookReadingUsesSharedScrollPreservingRerender() {
    const renderSource = fs.readFileSync(path.join(ROOT, 'modules/settings-app/render.js'), 'utf8');
    const rendererSource = fs.readFileSync(path.join(ROOT, 'modules/settings-app/page-renderers.js'), 'utf8');
    const contextSource = fs.readFileSync(path.join(ROOT, 'modules/settings-app/page-renderers/page-context-builders.js'), 'utf8');
    const pageSource = fs.readFileSync(path.join(ROOT, 'modules/settings-app/pages/worldbook-reading.js'), 'utf8');

    assert.match(renderSource, /createRerenderWithScroll\('worldbookReadingScrollTop', render\)/u);
    assert.match(renderSource, /rerenderWorldbookReadingKeepScroll,\s*\n\s*\}/u);
    assert.match(rendererSource, /'rerenderWorldbookReadingKeepScroll'/u);
    assert.match(contextSource, /rerenderWorldbookReadingKeepScroll:\s*services\.scroll\.rerenderWorldbookReadingKeepScroll/u);
    assert.match(pageSource, /ctx\.rerenderWorldbookReadingKeepScroll\(\)/u);
}

async function testSettingsRuntimeInjectsTheSharedWorldbookReadingCatalog() {
    const source = fs.readFileSync(path.join(ROOT, 'modules/settings-app/render.js'), 'utf8');

    assert.match(source, /sillyTavernWorldbookReadingCatalog/u);
    assert.match(source, /worldbookReading:\s*sillyTavernWorldbookReadingCatalog/u);
}

async function testSettingsTypesExposeWorldbookReadingPageAndCatalog() {
    const source = fs.readFileSync(path.join(ROOT, 'types.d.ts'), 'utf8');

    assert.match(source, /\| 'worldbook_reading'/u);
    assert.match(source, /worldbookReading\?: SettingsWorldbookReadingCatalog/u);
    assert.match(source, /interface SettingsWorldbookReadingCatalog/u);
    assert.match(source, /worldbookReadingBlockedKeywords: WorldbookReadingBlockedKeywords/u);
    assert.match(source, /setBlockedKeywords:/u);
}

async function main() {
    await testSettingsHomeExposesWorldbookReadingAsTopLevelPage();
    await testWorldbookReadingPageShowsBookSourceAndSparseSelection();
    await testWorldbookReadingPageEditsBlockedKeywords();
    await testWorldbookReadingPageSearchesAndExposesBulkActions();
    await testWorldbookReadingPagePersistsSelectionAndRefreshesOnHostUpdate();
    await testWorldbookReadingSearchKeepsFocusTargetAndDoesNotAccumulateListeners();
    await testWorldbookReadingRefreshDoesNotCancelPendingSubscription();
    await testSettingsPageRegistryCreatesWorldbookReadingPage();
    await testWorldbookReadingUsesSharedScrollPreservingRerender();
    await testSettingsRuntimeInjectsTheSharedWorldbookReadingCatalog();
    await testSettingsTypesExposeWorldbookReadingPageAndCatalog();
    console.log('[worldbook-reading-settings-ui-contract] passed');
}

main().catch((error) => {
    console.error('[worldbook-reading-settings-ui-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
