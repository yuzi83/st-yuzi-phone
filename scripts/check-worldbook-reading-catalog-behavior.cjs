const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    return import(`${href}?contract=${Date.now()}-${Math.random()}`);
}

async function testBoundCatalogSelectsEveryEnabledEntryByDefault() {
    const { createWorldbookReadingCatalog } = await importModule(
        'modules/worldbook-reading/catalog.js',
    );
    const catalog = createWorldbookReadingCatalog({
        source: {
            async load() {
                return [
                    {
                        name: '角色主书',
                        sourceRole: 'primary',
                        entries: [
                            { uid: 1, comment: '主书启用条目' },
                            { uid: 2, comment: '主书禁用条目', disable: true },
                        ],
                    },
                    {
                        name: '角色附加书',
                        sourceRole: 'additional',
                        entries: [{ uid: 7, comment: '附加书启用条目' }],
                    },
                ];
            },
        },
        preferences: {
            async read() {
                return {};
            },
            async write() {},
        },
    });

    const snapshot = await catalog.load();

    assert.deepEqual(snapshot.entries.map((entry) => ({
        ref: entry.ref,
        sourceRole: entry.sourceRole,
        enabled: entry.enabled,
        selected: entry.selected,
    })), [
        {
            ref: { bookName: '角色主书', uid: '1' },
            sourceRole: 'primary',
            enabled: true,
            selected: true,
        },
        {
            ref: { bookName: '角色主书', uid: '2' },
            sourceRole: 'primary',
            enabled: false,
            selected: false,
        },
        {
            ref: { bookName: '角色附加书', uid: '7' },
            sourceRole: 'additional',
            enabled: true,
            selected: true,
        },
    ]);
}

async function testBlockedCommentKeywordsUnselectEntriesButIgnoreContentKeywords() {
    const { createWorldbookReadingCatalog } = await importModule(
        'modules/worldbook-reading/catalog.js',
    );
    const catalog = createWorldbookReadingCatalog({
        source: {
            async load() {
                return [{
                    name: '角色主书',
                    sourceRole: 'primary',
                    entries: [
                        { uid: 1, comment: 'MVU 阶段开关', content: '应被排除' },
                        { uid: 2, comment: '普通剧情条目', content: '正文包含 MVU，但不应被排除' },
                        { uid: 3, comment: '规则说明', content: '应被排除' },
                    ],
                }];
            },
        },
        preferences: {
            async read() {
                return {};
            },
            async write() {},
        },
        blockedKeywords: {
            async read() {
                return ['MVU', '规则'];
            },
        },
    });

    const snapshot = await catalog.load();

    assert.deepEqual(snapshot.entries.map((entry) => ({
        uid: entry.ref.uid,
        selected: entry.selected,
    })), [
        { uid: '1', selected: false },
        { uid: '2', selected: true },
        { uid: '3', selected: false },
    ]);
    assert.deepEqual(snapshot.blockedKeywords, ['MVU', '规则']);
}

async function testBlockedKeywordsPersistAsNormalizedSettings() {
    const { createWorldbookReadingCatalog } = await importModule(
        'modules/worldbook-reading/catalog.js',
    );
    let stored = ['MVU'];
    const catalog = createWorldbookReadingCatalog({
        source: { async load() { return []; } },
        preferences: {
            async read() { return {}; },
            async write() {},
        },
        blockedKeywords: {
            async read() { return stored; },
            async write(next) { stored = [...next]; },
        },
    });

    await catalog.setBlockedKeywords([' MVU ', '规则', 'MVU', '', '自定义阶段']);

    assert.deepEqual(stored, ['MVU', '规则', '自定义阶段']);
}

async function testDeselectPersistsOnlySparseFalseOverride() {
    const { createWorldbookReadingCatalog } = await importModule(
        'modules/worldbook-reading/catalog.js',
    );
    let stored = {};
    const catalog = createWorldbookReadingCatalog({
        source: { async load() { return []; } },
        preferences: {
            async read() {
                return structuredClone(stored);
            },
            async write(next) {
                stored = structuredClone(next);
            },
        },
    });

    await catalog.setSelected([{ bookName: '角色主书', uid: 12 }], false);

    assert.deepEqual(stored, { 角色主书: { 12: false } });
}

async function testReselectRemovesSparseOverrideAndEmptyBook() {
    const { createWorldbookReadingCatalog } = await importModule(
        'modules/worldbook-reading/catalog.js',
    );
    let stored = { 角色主书: { 12: false } };
    const catalog = createWorldbookReadingCatalog({
        source: { async load() { return []; } },
        preferences: {
            async read() {
                return structuredClone(stored);
            },
            async write(next) {
                stored = structuredClone(next);
            },
        },
    });

    await catalog.setSelected([{ bookName: '角色主书', uid: 12 }], true);

    assert.deepEqual(stored, {});
}

async function testLoadForwardsScopeRequestToCatalogAdapters() {
    const { createWorldbookReadingCatalog } = await importModule(
        'modules/worldbook-reading/catalog.js',
    );
    const request = Object.freeze({ scopeId: 'scope-a', scopeSession: 9 });
    const received = [];
    const catalog = createWorldbookReadingCatalog({
        source: {
            async load(input) {
                received.push(['source', input]);
                return [];
            },
        },
        preferences: {
            async read(input) {
                received.push(['preferences', input]);
                return {};
            },
            async write() {},
        },
    });

    await catalog.load(request);

    assert.deepEqual(received, [
        ['source', request],
        ['preferences', request],
    ]);
}

async function testSelectionWriteForwardsScopeRequestToPreferences() {
    const { createWorldbookReadingCatalog } = await importModule(
        'modules/worldbook-reading/catalog.js',
    );
    const request = Object.freeze({ scopeId: 'scope-a', scopeSession: 9 });
    const received = [];
    const catalog = createWorldbookReadingCatalog({
        source: { async load() { return []; } },
        preferences: {
            async read(input) {
                received.push(['read', input]);
                return {};
            },
            async write(next, input) {
                received.push(['write', next, input]);
            },
        },
    });

    await catalog.setSelected([{ bookName: '角色主书', uid: 12 }], false, request);

    assert.deepEqual(received, [
        ['read', request],
        ['write', { 角色主书: { 12: false } }, request],
    ]);
}

async function testSillyTavernAdapterLoadsPrimaryAndAdditionalBooks() {
    const { createSillyTavernWorldbookReadingCatalog } = await importModule(
        'modules/worldbook-reading/st-catalog-adapter.js',
    );
    const request = Object.freeze({ scopeId: 'scope-a', scopeSession: 9 });
    const calls = [];
    const catalog = createSillyTavernWorldbookReadingCatalog({
        async getCurrentCharacterWorldbooks(options) {
            calls.push(['bindings', options]);
            return {
                primary: '角色主书',
                additional: ['角色附加书', '角色主书', '角色附加书'],
            };
        },
        async getWorldbook(bookName, options) {
            calls.push(['book', bookName, options]);
            return [{ uid: bookName === '角色主书' ? 1 : 7, comment: `${bookName}条目` }];
        },
        getPhoneSettings() {
            return { worldbookReadingSelection: {} };
        },
        savePhoneSetting() {
            return true;
        },
        async onWorldInfoUpdated() {
            return () => {};
        },
    });

    const snapshot = await catalog.load(request);

    assert.deepEqual(snapshot.books, [
        { name: '角色主书', sourceRole: 'primary' },
        { name: '角色附加书', sourceRole: 'additional' },
    ]);
    assert.deepEqual(calls, [
        ['bindings', { strict: true, silent: true, request }],
        ['book', '角色主书', { strict: true, silent: true, request }],
        ['book', '角色附加书', { strict: true, silent: true, request }],
    ]);
}

async function testSillyTavernAdapterReadsAndPersistsBlockedKeywords() {
    const { createSillyTavernWorldbookReadingCatalog } = await importModule(
        'modules/worldbook-reading/st-catalog-adapter.js',
    );
    const calls = [];
    let storedKeywords = ['MVU'];
    const catalog = createSillyTavernWorldbookReadingCatalog({
        async getCurrentCharacterWorldbooks() {
            return { primary: '角色主书', additional: [] };
        },
        async getWorldbook() {
            return [
                { uid: 1, comment: 'MVU 阶段开关' },
                { uid: 2, comment: '普通剧情条目' },
            ];
        },
        getPhoneSettings() {
            return {
                worldbookReadingSelection: {},
                worldbookReadingBlockedKeywords: storedKeywords,
            };
        },
        savePhoneSetting(key, value) {
            calls.push([key, value]);
            if (key === 'worldbookReadingBlockedKeywords') storedKeywords = [...value];
            return true;
        },
        async onWorldInfoUpdated() {
            return () => {};
        },
    });

    const snapshot = await catalog.load();
    assert.deepEqual(snapshot.blockedKeywords, ['MVU']);
    assert.deepEqual(snapshot.entries.map((entry) => entry.selected), [false, true]);

    await catalog.setBlockedKeywords([' MVU ', '规则', 'MVU']);
    assert.deepEqual(calls, [
        ['worldbookReadingBlockedKeywords', ['MVU', '规则']],
    ]);
}

async function testSillyTavernAdapterPersistsOnlySparseFalseOverrides() {
    const { createSillyTavernWorldbookReadingCatalog } = await importModule(
        'modules/worldbook-reading/st-catalog-adapter.js',
    );
    const writes = [];
    const catalog = createSillyTavernWorldbookReadingCatalog({
        async getCurrentCharacterWorldbooks() {
            return { primary: null, additional: [] };
        },
        async getWorldbook() {
            return [];
        },
        getPhoneSettings() {
            return {
                worldbookReadingSelection: {
                    角色主书: { 1: false, 2: true, ' ': false },
                    空覆盖书: { 9: true },
                },
            };
        },
        savePhoneSetting(key, value) {
            writes.push([key, value]);
            return true;
        },
    });

    await catalog.setSelected([{ bookName: '角色附加书', uid: 7 }], false);

    assert.deepEqual(writes, [[
        'worldbookReadingSelection',
        {
            角色主书: { 1: false },
            角色附加书: { 7: false },
        },
    ]]);
}

async function testSillyTavernAdapterPublishesWorldbookInvalidation() {
    const { createSillyTavernWorldbookReadingCatalog } = await importModule(
        'modules/worldbook-reading/st-catalog-adapter.js',
    );
    let hostListener = null;
    let disposeCount = 0;
    const received = [];
    const catalog = createSillyTavernWorldbookReadingCatalog({
        async getCurrentCharacterWorldbooks() {
            return { primary: null, additional: [] };
        },
        async getWorldbook() {
            return [];
        },
        getPhoneSettings() {
            return { worldbookReadingSelection: {} };
        },
        savePhoneSetting() {
            return true;
        },
        async onWorldInfoUpdated(listener) {
            hostListener = listener;
            return () => {
                disposeCount += 1;
            };
        },
    });

    const dispose = await catalog.subscribe((event) => received.push(event));
    hostListener({ bookName: '角色主书' });
    dispose();

    assert.deepEqual(received, [{ bookName: '角色主书' }]);
    assert.equal(disposeCount, 1);
}

async function testSillyTavernAdapterSilentlyDegradesWhenWorldbookApiIsMissing() {
    const [{ createSillyTavernWorldbookReadingCatalog }, { clearTavernHelperCache }, { Logger }] = await Promise.all([
        importModule('modules/worldbook-reading/st-catalog-adapter.js'),
        import(pathToFileURL(path.join(ROOT, 'modules/integration/tavern-helper-bridge.js')).href),
        import(pathToFileURL(path.join(ROOT, 'modules/error-handler.js')).href),
    ]);
    const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, 'window');
    const originalWindow = globalThis.window;
    const originalWarn = Logger.warn;
    const warnings = [];

    try {
        delete globalThis.window;
        clearTavernHelperCache();
        Logger.warn = (...args) => warnings.push(args);
        const catalog = createSillyTavernWorldbookReadingCatalog({
            getPhoneSettings: () => ({ worldbookReadingSelection: {} }),
            savePhoneSetting: () => true,
            onWorldInfoUpdated: async () => () => {},
        });

        await assert.rejects(catalog.load(), /getCharWorldbookNames API unavailable/);

        assert.deepEqual(warnings, []);
    } finally {
        Logger.warn = originalWarn;
        clearTavernHelperCache();
        if (hadWindow) globalThis.window = originalWindow;
        else delete globalThis.window;
    }
}

async function main() {
    await testBoundCatalogSelectsEveryEnabledEntryByDefault();
    await testBlockedCommentKeywordsUnselectEntriesButIgnoreContentKeywords();
    await testBlockedKeywordsPersistAsNormalizedSettings();
    await testDeselectPersistsOnlySparseFalseOverride();
    await testReselectRemovesSparseOverrideAndEmptyBook();
    await testLoadForwardsScopeRequestToCatalogAdapters();
    await testSelectionWriteForwardsScopeRequestToPreferences();
    await testSillyTavernAdapterLoadsPrimaryAndAdditionalBooks();
    await testSillyTavernAdapterReadsAndPersistsBlockedKeywords();
    await testSillyTavernAdapterPersistsOnlySparseFalseOverrides();
    await testSillyTavernAdapterPublishesWorldbookInvalidation();
    await testSillyTavernAdapterSilentlyDegradesWhenWorldbookApiIsMissing();
    console.log('[worldbook-reading-catalog-behavior] passed');
}

main().catch((error) => {
    console.error('[worldbook-reading-catalog-behavior] failed');
    console.error(error);
    process.exitCode = 1;
});
