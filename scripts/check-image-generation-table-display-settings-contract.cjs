const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    return import(`${href}?contract=${Date.now()}-${Math.random()}`);
}

async function flushAsyncWork() {
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
}

class FakeElement extends EventTarget {
    constructor({ value = '', checked = false, dataset = {} } = {}) {
        super();
        this.value = value;
        this.checked = checked;
        this.dataset = dataset;
        this.disabled = false;
        this.innerHTML = '';
        this.textContent = '';
    }
}

function createFakeContainer() {
    let html = '';
    let elements = new Map();
    let tableDisplaySwitches = [];
    return {
        get innerHTML() {
            return html;
        },
        set innerHTML(value) {
            html = String(value ?? '');
            tableDisplaySwitches = [...html.matchAll(
                /<input[^>]*class="[^"]*\bphone-image-generation-table-display-enabled\b[^"]*"[^>]*>/gu,
            )].map((match) => {
                const tag = match[0];
                return new FakeElement({
                    checked: /\schecked(?:\s|>)/u.test(tag),
                    dataset: {
                        sheetKey: tag.match(/data-sheet-key="([^"]*)"/u)?.[1] ?? '',
                    },
                });
            });
            elements = new Map([
                ['.phone-nav-back', new FakeElement()],
                ['#phone-image-generation-enabled', new FakeElement({
                    checked: /id="phone-image-generation-enabled"[^>]*checked/u.test(html),
                })],
                ['#phone-image-generation-test-names', new FakeElement()],
                ['#phone-image-generation-test-description', new FakeElement()],
                ['#phone-image-generation-prompt-preview', new FakeElement()],
                ['#phone-image-generation-test-generate', new FakeElement()],
                ['#phone-image-generation-test-status', new FakeElement()],
                ['#phone-image-generation-test-preview', new FakeElement()],
                ['#phone-image-generation-add-mapping', new FakeElement()],
                ['#phone-image-generation-clear-mappings', new FakeElement()],
                ['#phone-image-generation-timeout', new FakeElement({ value: '300' })],
            ]);
        },
        querySelector(selector) {
            return elements.get(selector) ?? null;
        },
        querySelectorAll(selector) {
            if (selector === '.phone-image-generation-table-display-enabled') {
                return tableDisplaySwitches;
            }
            return [];
        },
    };
}

function createFakePageRuntime() {
    const records = new Set();
    return {
        addEventListener(target, type, listener) {
            target?.addEventListener(type, listener);
            const record = { target, type, listener };
            records.add(record);
            return () => {
                if (!records.delete(record)) return;
                target?.removeEventListener(type, listener);
            };
        },
        isDisposed() {
            return false;
        },
    };
}

async function testSettingsKeepOnlySafeFalseTableDisplayPreferences() {
    const { normalizeImageGenerationSettings } = await importModule('modules/settings/schema.js');

    assert.deepEqual(normalizeImageGenerationSettings({
        tableDisplayEnabledBySheetKey: {
            sheet_square: false,
            sheet_enabled: true,
            '  sheet_timeline  ': 'false',
            __proto__: false,
            constructor: false,
            prototype: false,
            '': false,
        },
    }).tableDisplayEnabledBySheetKey, {
        sheet_square: false,
        sheet_timeline: false,
    });
}

async function testSettingsServiceListsOnlyEffectiveTableDisplaySources() {
    const { createImageGenerationSettingsService } = await importModule(
        'modules/image-generation/settings-service.js',
    );
    const sourceCalls = [];
    const service = createImageGenerationSettingsService({
        getPhoneSettings: () => ({
            imageGeneration: {
                enabled: false,
                timeoutMs: 300000,
                roleMappings: [],
                tableDisplayEnabledBySheetKey: { sheet_square: false },
            },
        }),
        tableReader: async () => ({ chatSheets: [] }),
        getTableDisplaySources({ rawData }) {
            sourceCalls.push(rawData);
            return {
                bySheetKey: new Map([
                    ['sheet_square', [{ canvas: { tableName: '广场表' } }]],
                    ['sheet_timeline', [{ canvas: { tableName: '时间线表' } }]],
                    ['invalid', []],
                ]),
            };
        },
        characterMapping: {},
        imageGenerationService: {},
    });

    const viewModel = await service.loadViewModel({ includeSharedResources: false });

    assert.equal(sourceCalls.length, 1);
    assert.deepEqual(viewModel.tableDisplaySources, [
        { sheetKey: 'sheet_square', tableName: '广场表', enabled: false },
        { sheetKey: 'sheet_timeline', tableName: '时间线表', enabled: true },
    ]);
    assert.deepEqual(viewModel.config.tableDisplayEnabledBySheetKey, {
        sheet_square: false,
    });
}

async function testSettingsRuntimeWiresContentPresetDirectory() {
    const { __test__settingsGate } = await importModule('modules/settings-app/render.js');
    const calls = [];
    const service = __test__settingsGate.createImageGenerationSettingsRuntime({
        getPhoneSettings: () => ({
            imageGeneration: {
                enabled: true,
                timeoutMs: 300000,
                roleMappings: [],
                tableDisplayEnabledBySheetKey: {},
            },
        }),
        tableReader: async () => ({ chatSheets: [{ id: 'sheet_square' }] }),
        contentPresetImageGenerationHost: {
            async getTableDisplaySources({ rawData }) {
                calls.push(rawData);
                return [{
                    sheetKey: 'sheet_square',
                    tableName: '广场表',
                    usageCount: 2,
                }];
            },
        },
        characterMapping: {},
        imageGenerationService: {},
        qqV2PresetService: null,
    });

    const viewModel = await service.loadViewModel({ includeSharedResources: false });

    assert.equal(calls.length, 1, '设置页运行时必须向内容预设目录询问已实际应用的生图来源');
    assert.deepEqual(calls[0], { chatSheets: [{ id: 'sheet_square' }] });
    assert.deepEqual(viewModel.tableDisplaySources, [{
        sheetKey: 'sheet_square',
        tableName: '广场表',
        enabled: true,
    }]);
}

async function testAppliedPageCanvasFlowsIntoSettingsViewModel() {
    const [
        { __test__settingsGate },
        { createContentPresetImageGenerationHost },
    ] = await Promise.all([
        importModule('modules/settings-app/render.js'),
        importModule('modules/content-presets/image-generation-host.js'),
    ]);
    const rawData = {
        sheet_square: {
            name: '广场表',
            content: [
                ['帖子ID', '标题', '图片描述'],
                ['post-1', '第一帖', '雨夜咖啡店'],
            ],
        },
    };
    const item = {
        id: 'square-page',
        target: { tableName: '广场表', fields: ['帖子ID', '标题', '图片描述'] },
        entry: { mount: 'pages/square-page/mount.js' },
        activatable: true,
        imageGeneration: {
            canvases: [{
                tableName: '广场表',
                stableIdentityFields: ['帖子ID'],
                canvas: '帖子封面',
                promptFields: ['标题', '图片描述'],
            }],
        },
    };
    const host = createContentPresetImageGenerationHost({
        getPhoneSettings: () => ({
            imageGeneration: {
                enabled: true,
                timeoutMs: 300000,
                roleMappings: [],
                tableDisplayEnabledBySheetKey: {},
            },
        }),
        getContentPresetIndexSnapshot: () => ({
            pageByTable: new Map([[
                'sheet_square',
                { sheetKey: 'sheet_square', presetId: 'square-preset', itemId: 'square-page' },
            ]]),
            popupByTable: new Map(),
        }),
        getRawData: () => rawData,
        getChatScope: () => 'chat-alpha',
        listPresetRecords: async () => [{
            id: 'square-preset',
            items: [item],
            displays: [],
        }],
        imageGenerationService: {
            async generate() { return { ok: false, status: 'unavailable' }; },
            async read() { return null; },
        },
    });
    const service = __test__settingsGate.createImageGenerationSettingsRuntime({
        getPhoneSettings: () => ({
            imageGeneration: {
                enabled: true,
                timeoutMs: 300000,
                roleMappings: [],
                tableDisplayEnabledBySheetKey: {},
            },
        }),
        tableReader: async () => rawData,
        contentPresetImageGenerationHost: host,
        characterMapping: {},
        imageGenerationService: {},
        qqV2PresetService: null,
    });

    const viewModel = await service.loadViewModel({ includeSharedResources: false });

    assert.deepEqual(viewModel.tableDisplaySources, [{
        sheetKey: 'sheet_square',
        tableName: '广场表',
        enabled: true,
    }], '已应用页面的作者画布必须经真实目录显示在小手机生图设置中');
}

async function testPageHidesEmptyDirectoryAndSavesOnlyTableDisplayPreference() {
    const [
        { buildImageGenerationPageHtml, createImageGenerationPage },
    ] = await Promise.all([
        importModule('modules/settings-app/pages/image-generation.js'),
    ]);

    assert.doesNotMatch(
        buildImageGenerationPageHtml({ config: { tableDisplayEnabledBySheetKey: {} } }),
        /表格美化生图/u,
    );

    const visibleHtml = buildImageGenerationPageHtml({
        config: {
            enabled: false,
            timeoutMs: 300000,
            roleMappings: [{ mappingId: 'keep-me' }],
            tableDisplayEnabledBySheetKey: { sheet_square: false },
        },
        tableDisplaySources: [
            { sheetKey: 'sheet_square', tableName: '广场表', enabled: false },
            { sheetKey: 'sheet_timeline', tableName: '时间线表', enabled: true },
        ],
    });
    assert.match(visibleHtml, /表格美化生图/u);
    assert.match(visibleHtml, /广场表/u);
    assert.match(visibleHtml, /时间线表/u);
    assert.match(
        visibleHtml,
        /data-sheet-key="sheet_square"[^>]*>/u,
    );
    assert.doesNotMatch(
        visibleHtml.match(/data-sheet-key="sheet_square"[^>]*>/u)?.[0] || '',
        /\schecked(?:\s|>)/u,
    );
    assert.match(
        visibleHtml.match(/data-sheet-key="sheet_timeline"[^>]*>/u)?.[0] || '',
        /\schecked(?:\s|>)/u,
    );

    const saves = [];
    const sourceViewModel = {
        config: {
            enabled: false,
            timeoutMs: 300000,
            roleMappings: [{ mappingId: 'keep-me' }],
            tableDisplayEnabledBySheetKey: { sheet_square: false },
        },
        tables: [],
        tableDisplaySources: [
            { sheetKey: 'sheet_square', tableName: '广场表', enabled: false },
            { sheetKey: 'sheet_timeline', tableName: '时间线表', enabled: true },
        ],
    };
    const container = createFakeContainer();
    const page = createImageGenerationPage({
        container,
        state: { mode: 'image_generation' },
        render() {},
        pageRuntime: createFakePageRuntime(),
        imageGenerationSettingsService: {
            async loadViewModel() {
                return sourceViewModel;
            },
            async saveConfig(config) {
                saves.push(config);
                return { ok: true, status: 'saved', config };
            },
            async testGenerate() {
                return { ok: false, status: 'unavailable' };
            },
        },
        showToast() {},
    });

    page.mount();
    await flushAsyncWork();
    const switches = container.querySelectorAll('.phone-image-generation-table-display-enabled');
    assert.equal(switches.length, 2);
    assert.equal(switches[0].checked, false);
    assert.equal(switches[1].checked, true);

    switches[0].checked = true;
    switches[0].dispatchEvent(new Event('change'));
    await flushAsyncWork();

    assert.deepEqual(saves.at(-1), {
        enabled: false,
        timeoutMs: 300000,
        roleMappings: [{ mappingId: 'keep-me' }],
        promptTranslationEnabled: false,
        promptTranslationApiPresetId: '',
        promptTranslationPresetId: '',
        promptTranslationExtractTag: '',
        promptTranslationExcludeTags: [],
        tableDisplayEnabledBySheetKey: {},
    });

    page.dispose();
}

async function testOpenPageRefreshesWhenContentPresetDirectoryChanges() {
    const [{ createImageGenerationPage }] = await Promise.all([
        importModule('modules/settings-app/pages/image-generation.js'),
    ]);
    let directoryVisible = false;
    let indexListener = null;
    const container = createFakeContainer();
    const page = createImageGenerationPage({
        container,
        state: { mode: 'image_generation' },
        render() {},
        pageRuntime: createFakePageRuntime(),
        subscribeContentPresetIndex(listener) {
            indexListener = listener;
            return () => { indexListener = null; };
        },
        imageGenerationSettingsService: {
            async loadViewModel() {
                return {
                    config: {
                        enabled: false,
                        timeoutMs: 300000,
                        roleMappings: [],
                        tableDisplayEnabledBySheetKey: {},
                    },
                    tables: [],
                    tableDisplaySources: directoryVisible
                        ? [{ sheetKey: 'sheet_square', tableName: '广场表', enabled: true }]
                        : [],
                };
            },
            async saveConfig(config) {
                return { ok: true, status: 'saved', config };
            },
            async testGenerate() {
                return { ok: false, status: 'unavailable' };
            },
        },
        showToast() {},
    });

    page.mount();
    await flushAsyncWork();
    assert.equal(typeof indexListener, 'function', '生图设置页打开时必须订阅美化应用索引');
    assert.doesNotMatch(container.innerHTML, /表格美化生图/u);

    directoryVisible = true;
    indexListener();
    await flushAsyncWork();
    assert.match(container.innerHTML, /表格美化生图/u);
    assert.match(container.innerHTML, /广场表/u);

    directoryVisible = false;
    indexListener();
    await flushAsyncWork();
    assert.doesNotMatch(container.innerHTML, /表格美化生图/u);

    page.dispose();
    assert.equal(indexListener, null, '关闭生图设置页必须释放美化应用索引订阅');
}

async function main() {
    await testSettingsKeepOnlySafeFalseTableDisplayPreferences();
    await testSettingsServiceListsOnlyEffectiveTableDisplaySources();
    await testSettingsRuntimeWiresContentPresetDirectory();
    await testAppliedPageCanvasFlowsIntoSettingsViewModel();
    await testPageHidesEmptyDirectoryAndSavesOnlyTableDisplayPreference();
    await testOpenPageRefreshesWhenContentPresetDirectoryChanges();
    console.log('[image-generation-table-display-settings] passed');
}

main().catch((error) => {
    console.error('[image-generation-table-display-settings] failed');
    console.error(error);
    process.exitCode = 1;
});
