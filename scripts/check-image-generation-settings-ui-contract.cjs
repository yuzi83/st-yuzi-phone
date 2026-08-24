const assert = require('node:assert/strict');
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
    const container = {
        get innerHTML() {
            return html;
        },
        set innerHTML(value) {
            html = String(value ?? '');
            elements = new Map([
                ['.phone-nav-back', new FakeElement()],
                ['#phone-image-generation-enabled', new FakeElement({
                    checked: /id="phone-image-generation-enabled"[^>]*checked/u.test(html),
                })],
                ['#phone-image-generation-test-names', new FakeElement({
                    value: html.match(/id="phone-image-generation-test-names"[^>]*value="([^"]*)"/u)?.[1] ?? '',
                })],
                ['#phone-image-generation-test-description', new FakeElement({
                    value: html.match(/<textarea id="phone-image-generation-test-description"[^>]*>([\s\S]*?)<\/textarea>/u)?.[1] ?? '',
                })],
                ['#phone-image-generation-prompt-preview', new FakeElement()],
                ['#phone-image-generation-test-generate', new FakeElement()],
                ['#phone-image-generation-test-status', new FakeElement()],
                ['#phone-image-generation-test-preview', new FakeElement()],
                ['#phone-image-generation-add-mapping', new FakeElement()],
                ['#phone-image-generation-clear-mappings', new FakeElement()],
                ['#phone-image-generation-timeout', new FakeElement({
                    value: html.match(/id="phone-image-generation-timeout"[^>]*value="([^"]*)"/u)?.[1] ?? '300',
                })],
            ]);
        },
        querySelector(selector) {
            return elements.get(selector) ?? null;
        },
        querySelectorAll() {
            return [];
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
        isDisposed() {
            return false;
        },
        get activeListenerCount() {
            return listenerRecords.size;
        },
    };
}

function createRendererDeps() {
    const noop = () => {};
    const functions = names => Object.fromEntries(names.map(name => [name, noop]));
    return {
        common: {
            state: { mode: 'home' },
            render: noop,
        },
        navigation: functions(['navigateBack']),
        feedback: functions(['showToast']),
        scroll: functions([
            'captureScroll',
            'restoreScroll',
            'rerenderHomeKeepScroll',
            'rerenderAppearanceKeepScroll',
            'rerenderApiPresetsKeepScroll',
            'rerenderBeautifyKeepScroll',
            'rerenderAiInstructionPresetsKeepScroll',
            'rerenderWorldbookReadingKeepScroll',
            'rerenderImageGenerationKeepScroll',
        ]),
        appearance: functions([
            'getLayoutValue',
            'getPhoneSettings',
            'setupBgUpload',
            'setupIconLayoutSettings',
            'setupAppearanceToggles',
            'renderHiddenTableAppsList',
            'renderIconUploadList',
            'importAppearanceResourcePackFromData',
            'listAppearancePacks',
            'importAppearancePackToRepository',
            'applyAppearancePackFromRepository',
            'deleteAppearancePackFromRepository',
            'getAppearancePackRepositoryStats',
            'exportAppearanceResourcePack',
            'clearAppearanceResourcePoolIcons',
            'getAppearanceFontLibraryViewModel',
            'importAppearanceFontFile',
            'importAppearanceFontCssUrl',
            'selectAppearanceFont',
            'deleteAppearanceFont',
            'applyAppearanceFontLibrary',
            'getReadableTextScalePercentValue',
            'applyReadableTextScale',
            'setupReadableTextScaleSettings',
            'getHomeAppLabelColorModeValue',
            'setupHomeAppLabelColorSettings',
            'getPhoneThemeModeValue',
            'applyPhoneThemeMode',
            'setupPhoneThemeModeSettings',
        ]),
        qqV2Presets: functions([
            'readSharedResources',
            'saveApiPreset',
            'deleteApiPreset',
            'loadModels',
            'savePromptPreset',
            'deletePromptPreset',
            'restoreBuiltInPromptPreset',
            'restoreAllBuiltInPromptPresets',
            'importPromptPresets',
            'exportPromptPreset',
            'exportAllPromptPresets',
        ]),
        buttonStyle: functions(['getPhoneSettings', 'savePhoneSetting']),
        contentPresetWorkshop: functions([
            'getSnapshot',
            'subscribe',
            'getViewModel',
            'prepareImport',
            'importPrepared',
            'exportPreset',
            'deletePreset',
            'setActive',
            'clearActive',
            'clearAllActive',
        ]),
        worldbookReading: functions(['load', 'setSelected', 'subscribe']),
        imageGeneration: functions(['loadViewModel', 'saveConfig', 'testGenerate']),
    };
}

async function flushAsyncWork() {
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
}

async function testSettingsHomeAndImageGenerationPageExposeConfirmedControls() {
    const [
        { buildSettingsHomePageHtml },
        { buildImageGenerationPageHtml },
    ] = await Promise.all([
        importModule('modules/settings-app/layout/page-builders/overview-builders.js'),
        importModule('modules/settings-app/pages/image-generation.js'),
    ]);

    const homeHtml = buildSettingsHomePageHtml({ contentPresetFullPageRuntimeEnabled: false });
    assert.match(homeHtml, /data-entry="image_generation"/u);
    assert.match(homeHtml, />生图设置</u);

    const pageHtml = buildImageGenerationPageHtml({
        config: {
            enabled: true,
            timeoutMs: 300000,
            roleMappings: [{
                mappingId: 'mapping-1',
                sheetKey: 'sheet_roles',
                tableNameSnapshot: '重要角色表',
                nameColumn: { columnIndex: 0, headerSnapshot: '姓名' },
                promptColumns: [
                    { columnIndex: 1, headerSnapshot: '外貌' },
                    { columnIndex: 2, headerSnapshot: '穿着' },
                ],
            }],
        },
        tables: [{
            sheetKey: 'sheet_roles',
            tableName: '重要角色表',
            status: 'available',
            headers: [
                { columnIndex: 0, displayName: '姓名', rawName: '姓名' },
                { columnIndex: 1, displayName: '外貌', rawName: '外貌' },
                { columnIndex: 2, displayName: '穿着', rawName: '穿着' },
            ],
        }],
        testInput: {
            names: '星野铃；木下',
            description: '两个人坐在咖啡店聊天',
            finalPrompt: '星野铃，银色长发，木下，黑色短发，两个人坐在咖啡店聊天',
        },
    });

    assert.match(pageHtml, />生图设置</u);
    assert.match(pageHtml, /智慧姬/u);
    assert.match(pageHtml, /测试图片和之后的 QQ 生图会保存到：user\/images\/yuzi-phone-generated\//u);
    assert.match(pageHtml, /id="phone-image-generation-enabled"[^>]*checked/u);
    assert.match(pageHtml, /id="phone-image-generation-test-names"/u);
    assert.match(pageHtml, /id="phone-image-generation-test-description"/u);
    assert.match(pageHtml, /id="phone-image-generation-prompt-preview"/u);
    assert.match(pageHtml, /星野铃，银色长发/u);
    assert.match(pageHtml, /data-image-generation-mapping-id="mapping-1"/u);
    assert.match(pageHtml, /重要角色表/u);
    assert.match(pageHtml, /姓名/u);
    assert.match(pageHtml, /外貌/u);
    assert.match(pageHtml, /穿着/u);
    assert.match(pageHtml, />上移</u);
    assert.match(pageHtml, />下移</u);
    assert.match(pageHtml, />删除</u);
    assert.match(pageHtml, /id="phone-image-generation-timeout"/u);
    assert.match(pageHtml, /id="phone-image-generation-clear-mappings"/u);
}

async function testImageGenerationPageUsesInjectedServiceAndKeepsAsyncUpdatesLocal() {
    const { createImageGenerationPage } = await importModule(
        'modules/settings-app/pages/image-generation.js',
    );
    const container = createFakeContainer();
    const pageRuntime = createFakePageRuntime();
    const saveCalls = [];
    const loadCalls = [];
    const testCalls = [];
    let rerenderCalls = 0;
    const baseViewModel = {
        config: {
            enabled: false,
            timeoutMs: 300000,
            roleMappings: [],
        },
        tables: [{
            sheetKey: 'sheet_roles',
            tableName: '重要角色表',
            status: 'available',
            headers: [{ columnIndex: 0, displayName: '姓名', rawName: '姓名' }],
        }],
    };
    const service = {
        async loadViewModel(request = {}) {
            loadCalls.push(request);
            const names = String(request?.testInput?.names ?? '');
            const description = String(request?.testInput?.description ?? '');
            return {
                ...baseViewModel,
                config: request?.config || baseViewModel.config,
                testInput: {
                    names,
                    description,
                    finalPrompt: [names, description].filter(Boolean).join('，'),
                },
            };
        },
        async saveConfig(config) {
            saveCalls.push(config);
            return { ok: true, status: 'saved', ...baseViewModel, config };
        },
        async testGenerate(request) {
            testCalls.push(request);
            return {
                ok: true,
                path: 'user/images/yuzi-phone-generated/test.png',
            };
        },
    };
    const page = createImageGenerationPage({
        container,
        state: { mode: 'image_generation' },
        render() {},
        pageRuntime,
        rerenderImageGenerationKeepScroll() {
            rerenderCalls += 1;
        },
        imageGenerationSettingsService: service,
        showToast() {},
    });

    page.mount();
    await flushAsyncWork();

    assert.equal(loadCalls.length, 1);
    assert.match(container.innerHTML, /智慧姬/u);

    const enabled = container.querySelector('#phone-image-generation-enabled');
    enabled.checked = true;
    enabled.dispatchEvent(new Event('change'));
    await flushAsyncWork();
    assert.equal(saveCalls.at(-1).enabled, true);

    const names = container.querySelector('#phone-image-generation-test-names');
    const description = container.querySelector('#phone-image-generation-test-description');
    names.value = '星野铃；木下';
    description.value = '两个人坐在咖啡店聊天';
    names.dispatchEvent(new Event('input'));
    await flushAsyncWork();
    assert.equal(
        container.querySelector('#phone-image-generation-prompt-preview').textContent,
        '星野铃；木下，两个人坐在咖啡店聊天',
    );
    assert.equal(rerenderCalls, 0, '提示词预览应局部更新，不能整页重绘');

    container.querySelector('#phone-image-generation-test-generate')
        .dispatchEvent(new Event('click'));
    await flushAsyncWork();
    assert.equal(testCalls.length, 1);
    assert.match(
        container.querySelector('#phone-image-generation-test-preview').innerHTML,
        /user\/images\/yuzi-phone-generated\/test\.png/u,
    );
    assert.equal(rerenderCalls, 0, '测试生成结果应局部更新，不能整页重绘');

    container.querySelector('#phone-image-generation-add-mapping')
        .dispatchEvent(new Event('click'));
    await flushAsyncWork();
    assert.equal(saveCalls.at(-1).roleMappings.length, 1);
    assert.equal(rerenderCalls, 1, '添加映射必须走设置 App 现有保滚重渲染链');

    page.dispose();
    assert.equal(pageRuntime.activeListenerCount, 0);
}

async function testImageGenerationPageIsRegisteredWithItsInjectedContext() {
    const [
        { buildImageGenerationPageContext },
        { createPersonalizationPageRenderers },
    ] = await Promise.all([
        importModule('modules/settings-app/page-renderers/page-context-builders.js'),
        importModule('modules/settings-app/page-renderers/personalization-renderers.js'),
    ]);
    const imageGenerationSettingsService = {
        async loadViewModel() { return {}; },
        async saveConfig() { return {}; },
        async testGenerate() { return {}; },
    };
    const rerenderImageGenerationKeepScroll = () => {};
    const context = buildImageGenerationPageContext({
        common: {
            container: createFakeContainer(),
            state: { mode: 'image_generation' },
            render() {},
            pageRuntime: createFakePageRuntime(),
        },
        scroll: { rerenderImageGenerationKeepScroll },
        feedback: { showToast() {} },
        imageGeneration: imageGenerationSettingsService,
    });

    assert.equal(context.imageGenerationSettingsService, imageGenerationSettingsService);
    assert.equal(context.rerenderImageGenerationKeepScroll, rerenderImageGenerationKeepScroll);

    const renderers = createPersonalizationPageRenderers({
        pageContexts: {
            home: {},
            appearance: {},
            buttonStyle: {},
            worldbookReading: {},
            imageGeneration: context,
        },
    });
    assert.equal(typeof renderers.pages.image_generation?.createPage, 'function');
    const page = renderers.pages.image_generation.createPage();
    assert.equal(typeof page.mount, 'function');
    assert.equal(typeof page.update, 'function');
    assert.equal(typeof page.dispose, 'function');
}

async function testSettingsRendererValidatesImageGenerationDependencies() {
    const { createSettingsPageRenderers } = await importModule(
        'modules/settings-app/page-renderers.js',
    );
    const validDeps = createRendererDeps();
    const renderers = createSettingsPageRenderers(validDeps);
    assert.equal(typeof renderers.pages.image_generation?.createPage, 'function');

    const missingServiceMethod = createRendererDeps();
    delete missingServiceMethod.imageGeneration.testGenerate;
    assert.throws(
        () => createSettingsPageRenderers(missingServiceMethod),
        /imageGeneration\.testGenerate/u,
    );

    const missingScrollMethod = createRendererDeps();
    delete missingScrollMethod.scroll.rerenderImageGenerationKeepScroll;
    assert.throws(
        () => createSettingsPageRenderers(missingScrollMethod),
        /scroll\.rerenderImageGenerationKeepScroll/u,
    );
}

async function main() {
    await testSettingsHomeAndImageGenerationPageExposeConfirmedControls();
    await testImageGenerationPageUsesInjectedServiceAndKeepsAsyncUpdatesLocal();
    await testImageGenerationPageIsRegisteredWithItsInjectedContext();
    await testSettingsRendererValidatesImageGenerationDependencies();
    console.log('[image-generation-settings-ui] passed');
}

main().catch((error) => {
    console.error('[image-generation-settings-ui] failed');
    console.error(error);
    process.exitCode = 1;
});
