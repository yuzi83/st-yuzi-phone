const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    return import(`${href}?contract=${Date.now()}-${Math.random()}`);
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((nextResolve, nextReject) => {
        resolve = nextResolve;
        reject = nextReject;
    });
    return { promise, resolve, reject };
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
    let collections = new Map();
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
            const cards = [];
            const tableSelects = [];
            const nameSelects = [];
            const promptInputs = [];
            const cardPattern = /<article class="phone-settings-card phone-image-generation-mapping-card"[\s\S]*?data-image-generation-mapping-id="([^"]*)" data-mapping-index="(\d+)">([\s\S]*?)<\/article>/gu;
            for (const match of html.matchAll(cardPattern)) {
                const mappingId = match[1];
                const mappingIndex = match[2];
                const cardHtml = match[3];
                const selectedTable = cardHtml.match(
                    /phone-image-generation-table[\s\S]*?<option value="([^"]*)" selected/iu,
                )?.[1] ?? '';
                const selectedName = cardHtml.match(
                    /phone-image-generation-name-column[\s\S]*?<option value="([^"]*)" selected/iu,
                )?.[1] ?? '';
                const tableSelect = new FakeElement({
                    value: selectedTable,
                    dataset: { mappingIndex },
                });
                const nameSelect = new FakeElement({
                    value: selectedName,
                    dataset: { mappingIndex },
                });
                const prompts = [];
                const promptPattern = /<input type="checkbox" class="phone-settings-switch phone-image-generation-prompt-column"([\s\S]*?)>/gu;
                for (const promptMatch of cardHtml.matchAll(promptPattern)) {
                    const attributes = promptMatch[1];
                    const dataset = {
                        mappingIndex,
                        columnState: attributes.match(/data-column-state="([^"]*)"/u)?.[1] ?? '',
                        headerSnapshot: attributes.match(/data-header-snapshot="([^"]*)"/u)?.[1] ?? '',
                    };
                    prompts.push(new FakeElement({
                        value: attributes.match(/value="([^"]*)"/u)?.[1] ?? '',
                        checked: /\schecked(?:\s|$)/u.test(attributes),
                        disabled: /\sdisabled(?:\s|$)/u.test(attributes),
                        dataset,
                    }));
                }
                const card = {
                    dataset: {
                        mappingIndex,
                        imageGenerationMappingId: mappingId,
                    },
                    querySelector(selector) {
                        if (selector === '.phone-image-generation-table') return tableSelect;
                        if (selector === '.phone-image-generation-name-column') return nameSelect;
                        return null;
                    },
                    querySelectorAll(selector) {
                        if (selector === '.phone-image-generation-prompt-column') return prompts;
                        return [];
                    },
                };
                cards.push(card);
                tableSelects.push(tableSelect);
                nameSelects.push(nameSelect);
                promptInputs.push(...prompts);
            }
            collections = new Map([
                ['.phone-image-generation-mapping-card', cards],
                ['.phone-image-generation-table', tableSelects],
                ['.phone-image-generation-name-column', nameSelects],
                ['.phone-image-generation-prompt-column', promptInputs],
            ]);
        },
        querySelector(selector) {
            return elements.get(selector) ?? null;
        },
        querySelectorAll(selector) {
            return collections.get(selector) ?? [];
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
    };
}

async function flushAsyncWork() {
    await Promise.resolve();
    await new Promise(resolve => setImmediate(resolve));
}

async function testLateInitialLoadCannotOverwriteANewerSavedConfig() {
    const { createImageGenerationPage } = await importModule(
        'modules/settings-app/pages/image-generation.js',
    );
    const initialLoad = deferred();
    const saveCalls = [];
    const container = createFakeContainer();
    const page = createImageGenerationPage({
        container,
        state: { mode: 'image_generation' },
        render() {},
        pageRuntime: createFakePageRuntime(),
        rerenderImageGenerationKeepScroll() {},
        showToast() {},
        imageGenerationSettingsService: {
            loadViewModel() {
                return initialLoad.promise;
            },
            async saveConfig(config) {
                saveCalls.push(config);
                return { ok: true, status: 'saved', config };
            },
            async testGenerate() {
                return { ok: false, status: 'unavailable' };
            },
        },
    });

    page.mount();
    const enabled = container.querySelector('#phone-image-generation-enabled');
    enabled.checked = true;
    enabled.dispatchEvent(new Event('change'));
    await flushAsyncWork();
    assert.equal(saveCalls.at(-1)?.enabled, true);

    initialLoad.resolve({
        config: { enabled: false, timeoutMs: 300000, roleMappings: [] },
        tables: [],
        resolvedMappings: [],
    });
    await flushAsyncWork();

    assert.equal(
        container.querySelector('#phone-image-generation-enabled')?.checked,
        true,
        '迟到的初始读取不能把已经保存的新总开关覆盖回旧值',
    );
    page.dispose();
}

async function testConcurrentAutoSavesUseTheLatestConfig() {
    const { createImageGenerationPage } = await importModule(
        'modules/settings-app/pages/image-generation.js',
    );
    const saves = [];
    const container = createFakeContainer();
    const page = createImageGenerationPage({
        container,
        state: { mode: 'image_generation' },
        render() {},
        pageRuntime: createFakePageRuntime(),
        rerenderImageGenerationKeepScroll() {},
        showToast() {},
        imageGenerationSettingsService: {
            async loadViewModel() {
                return {
                    config: { enabled: false, timeoutMs: 300000, roleMappings: [] },
                    tables: [],
                    resolvedMappings: [],
                };
            },
            saveConfig(config) {
                const pending = deferred();
                saves.push({ config, pending });
                return pending.promise;
            },
            async testGenerate() {
                return { ok: false, status: 'unavailable' };
            },
        },
    });

    page.mount();
    await flushAsyncWork();
    const enabled = container.querySelector('#phone-image-generation-enabled');
    enabled.checked = true;
    enabled.dispatchEvent(new Event('change'));
    enabled.checked = false;
    enabled.dispatchEvent(new Event('change'));
    await Promise.resolve();
    assert.equal(saves.length, 2, '两次自动保存都应进入设置服务');

    saves[1].pending.resolve({
        ok: true,
        status: 'saved',
        config: saves[1].config,
    });
    await flushAsyncWork();
    saves[0].pending.resolve({
        ok: true,
        status: 'saved',
        config: saves[0].config,
    });
    await flushAsyncWork();

    page.update();
    assert.equal(
        container.querySelector('#phone-image-generation-enabled')?.checked,
        false,
        '较早保存即使更晚返回，也不能覆盖最后一次用户设置',
    );
    page.dispose();
}

async function testLatestFailedSaveRollsBackToTheNewestSuccessfulSave() {
    const { createImageGenerationPage } = await importModule(
        'modules/settings-app/pages/image-generation.js',
    );
    const saves = [];
    const container = createFakeContainer();
    let page;
    page = createImageGenerationPage({
        container,
        state: { mode: 'image_generation' },
        render() {},
        pageRuntime: createFakePageRuntime(),
        rerenderImageGenerationKeepScroll() {
            page.update();
        },
        showToast() {},
        imageGenerationSettingsService: {
            async loadViewModel() {
                return {
                    config: { enabled: false, timeoutMs: 300000, roleMappings: [] },
                    tables: [],
                    resolvedMappings: [],
                };
            },
            saveConfig(config) {
                const pending = deferred();
                saves.push({ config, pending });
                return pending.promise;
            },
            async testGenerate() {
                return { ok: false, status: 'unavailable' };
            },
        },
    });

    page.mount();
    await flushAsyncWork();
    const enabled = container.querySelector('#phone-image-generation-enabled');
    enabled.checked = true;
    enabled.dispatchEvent(new Event('change'));
    enabled.checked = false;
    enabled.dispatchEvent(new Event('change'));
    await Promise.resolve();

    saves[0].pending.resolve({
        ok: true,
        status: 'saved',
        config: saves[0].config,
    });
    await flushAsyncWork();
    saves[1].pending.resolve({
        ok: false,
        status: 'failed',
        config: saves[1].config,
    });
    await flushAsyncWork();

    assert.equal(
        container.querySelector('#phone-image-generation-enabled')?.checked,
        true,
        '最后一次保存失败时应回退到最近一次真正保存成功的配置',
    );
    page.dispose();
}

async function testFailedSaveRestoresCommittedUiAndShowsShortError() {
    const { createImageGenerationPage } = await importModule(
        'modules/settings-app/pages/image-generation.js',
    );
    const container = createFakeContainer();
    const toasts = [];
    const page = createImageGenerationPage({
        container,
        state: { mode: 'image_generation' },
        render() {},
        pageRuntime: createFakePageRuntime(),
        rerenderImageGenerationKeepScroll() {
            page.update();
        },
        showToast(_host, message, isError) {
            toasts.push({ message, isError });
        },
        imageGenerationSettingsService: {
            async loadViewModel() {
                return {
                    config: { enabled: false, timeoutMs: 300000, roleMappings: [] },
                    tables: [],
                    resolvedMappings: [],
                };
            },
            async saveConfig(config) {
                return { ok: false, status: 'failed', config };
            },
            async testGenerate() {
                return { ok: false, status: 'unavailable' };
            },
        },
    });

    page.mount();
    await flushAsyncWork();
    const enabled = container.querySelector('#phone-image-generation-enabled');
    enabled.checked = true;
    enabled.dispatchEvent(new Event('change'));
    await flushAsyncWork();

    assert.equal(
        container.querySelector('#phone-image-generation-enabled')?.checked,
        false,
        '持久化失败后必须恢复最后一次成功提交的界面状态',
    );
    assert.deepEqual(toasts, [{
        message: '生图设置保存失败',
        isError: true,
    }]);
    page.dispose();
}

async function testResolvedMappingsKeepRenamedColumnsUnavailable() {
    const { buildImageGenerationPageHtml } = await importModule(
        'modules/settings-app/pages/image-generation.js',
    );
    const html = buildImageGenerationPageHtml({
        config: {
            enabled: false,
            timeoutMs: 300000,
            roleMappings: [{
                mappingId: 'mapping-1',
                sheetKey: 'sheet_people',
                tableNameSnapshot: '角色资料',
                nameColumn: { columnIndex: 0, headerSnapshot: '姓名' },
                promptColumns: [{ columnIndex: 1, headerSnapshot: '外貌' }],
            }],
        },
        tables: [{
            sheetKey: 'sheet_people',
            tableName: '角色资料',
            status: 'available',
            headers: [
                { columnIndex: 0, rawName: '代号', displayName: '代号' },
                { columnIndex: 1, rawName: '备注', displayName: '备注' },
            ],
        }],
        resolvedMappings: [{
            mappingId: 'mapping-1',
            sheetKey: 'sheet_people',
            status: 'missing_name_column',
            nameColumn: {
                columnIndex: 0,
                headerSnapshot: '姓名',
                currentHeader: '',
                status: 'missing',
            },
            promptColumns: [{
                columnIndex: 1,
                headerSnapshot: '外貌',
                currentHeader: '',
                status: 'missing',
            }],
            missingFields: [
                { kind: 'name_column', columnIndex: 0, headerSnapshot: '姓名' },
                { kind: 'prompt_column', columnIndex: 1, headerSnapshot: '外貌' },
            ],
        }],
    });

    assert.match(html, /映射 1 · 当前不可用/u);
    assert.match(html, /姓名（当前不可用）/u);
    assert.match(html, /外貌（当前不可用）/u);
    assert.doesNotMatch(
        html,
        /<option value="0" selected>代号<\/option>/u,
        '同索引的新名字字段不能冒充原来的失效字段',
    );
    assert.doesNotMatch(
        html,
        /value="1" checked[^>]*>[\s\S]*?备注/u,
        '同索引的新提示词字段不能冒充原来的失效字段',
    );
}

async function testEmptyTableRefreshReplacesPreviouslyLoadedTables() {
    const { createImageGenerationPage } = await importModule(
        'modules/settings-app/pages/image-generation.js',
    );
    const config = {
        enabled: false,
        timeoutMs: 300000,
        roleMappings: [{
            mappingId: 'mapping-1',
            sheetKey: 'sheet_people',
            tableNameSnapshot: '角色资料',
            nameColumn: { columnIndex: 0, headerSnapshot: '姓名' },
            promptColumns: [],
        }],
    };
    let loadCount = 0;
    const container = createFakeContainer();
    const page = createImageGenerationPage({
        container,
        state: { mode: 'image_generation' },
        render() {},
        pageRuntime: createFakePageRuntime(),
        rerenderImageGenerationKeepScroll() {},
        showToast() {},
        imageGenerationSettingsService: {
            async loadViewModel(request = {}) {
                loadCount += 1;
                if (loadCount === 1) {
                    return {
                        config,
                        tables: [{
                            sheetKey: 'sheet_people',
                            tableName: '角色资料',
                            status: 'available',
                            headers: [{ columnIndex: 0, rawName: '姓名', displayName: '姓名' }],
                        }],
                        resolvedMappings: [{
                            mappingId: 'mapping-1',
                            sheetKey: 'sheet_people',
                            status: 'available',
                            nameColumn: {
                                columnIndex: 0,
                                headerSnapshot: '姓名',
                                currentHeader: '姓名',
                                status: 'available',
                            },
                            promptColumns: [],
                            missingFields: [],
                        }],
                    };
                }
                return {
                    config: request.config || config,
                    tables: [],
                    resolvedMappings: [{
                        mappingId: 'mapping-1',
                        sheetKey: 'sheet_people',
                        status: 'missing_sheet',
                        nameColumn: {
                            columnIndex: 0,
                            headerSnapshot: '姓名',
                            currentHeader: '',
                            status: 'missing',
                        },
                        promptColumns: [],
                        missingFields: [{ kind: 'sheet', sheetKey: 'sheet_people' }],
                    }],
                    testInput: {
                        names: request.testInput?.names || '',
                        description: '',
                        finalPrompt: request.testInput?.names || '',
                    },
                };
            },
            async saveConfig(nextConfig) {
                return { ok: true, status: 'saved', config: nextConfig };
            },
            async testGenerate() {
                return { ok: false, status: 'unavailable' };
            },
        },
    });

    page.mount();
    await flushAsyncWork();
    const names = container.querySelector('#phone-image-generation-test-names');
    names.value = '星野铃';
    names.dispatchEvent(new Event('input'));
    await flushAsyncWork();
    page.update();

    assert.match(
        container.innerHTML,
        /角色资料（当前不可用）/u,
        '数据库刷新为空时必须立即把原映射显示为失效，不能继续使用旧 tables',
    );
    page.dispose();
}

async function testInvalidColumnSnapshotsChangeOnlyAfterExplicitReselection() {
    const { createImageGenerationPage } = await importModule(
        'modules/settings-app/pages/image-generation.js',
    );
    const config = {
        enabled: false,
        timeoutMs: 300000,
        roleMappings: [{
            mappingId: 'mapping-1',
            sheetKey: 'sheet_people',
            tableNameSnapshot: '角色资料',
            nameColumn: { columnIndex: 0, headerSnapshot: '姓名' },
            promptColumns: [{ columnIndex: 1, headerSnapshot: '外貌' }],
        }],
    };
    const viewModel = {
        config,
        tables: [{
            sheetKey: 'sheet_people',
            tableName: '角色资料',
            status: 'available',
            headers: [
                { columnIndex: 0, rawName: '代号', displayName: '代号' },
                { columnIndex: 1, rawName: '备注', displayName: '备注' },
            ],
        }],
        resolvedMappings: [{
            mappingId: 'mapping-1',
            sheetKey: 'sheet_people',
            status: 'missing_name_column',
            nameColumn: {
                columnIndex: 0,
                headerSnapshot: '姓名',
                currentHeader: '',
                status: 'missing',
            },
            promptColumns: [{
                columnIndex: 1,
                headerSnapshot: '外貌',
                currentHeader: '',
                status: 'missing',
            }],
            missingFields: [],
        }],
    };
    const saveCalls = [];
    const container = createFakeContainer();
    let page;
    page = createImageGenerationPage({
        container,
        state: { mode: 'image_generation' },
        render() {},
        pageRuntime: createFakePageRuntime(),
        rerenderImageGenerationKeepScroll() {
            page.update();
        },
        showToast() {},
        imageGenerationSettingsService: {
            async loadViewModel() {
                return viewModel;
            },
            async saveConfig(nextConfig) {
                saveCalls.push(nextConfig);
                return { ok: true, status: 'saved', config: nextConfig };
            },
            async testGenerate() {
                return { ok: false, status: 'unavailable' };
            },
        },
    });

    page.mount();
    await flushAsyncWork();
    const timeout = container.querySelector('#phone-image-generation-timeout');
    timeout.value = '600';
    timeout.dispatchEvent(new Event('change'));
    await flushAsyncWork();
    assert.equal(saveCalls.at(-1).roleMappings[0].nameColumn.headerSnapshot, '姓名');
    assert.equal(saveCalls.at(-1).roleMappings[0].promptColumns[0].headerSnapshot, '外貌');

    const nameSelect = container.querySelectorAll('.phone-image-generation-name-column')[0];
    nameSelect.value = 'column:0';
    nameSelect.dispatchEvent(new Event('change'));
    await flushAsyncWork();
    assert.equal(
        saveCalls.at(-1).roleMappings[0].nameColumn.headerSnapshot,
        '代号',
        '只有用户明确重新选择当前字段时才更新名字字段快照',
    );
    assert.doesNotMatch(
        container.innerHTML,
        /代号（当前不可用）/u,
        '明确重选并保存后不能继续套用旧 resolvedMappings 的失效状态',
    );
    page.dispose();
}

async function testTestPreviewAcceptsOnlyGeneratedImageDirectoryPaths() {
    const {
        buildImageGenerationPageHtml,
        createImageGenerationPage,
    } = await importModule('modules/settings-app/pages/image-generation.js');
    const unsafeHtml = buildImageGenerationPageHtml({
        config: { enabled: false, timeoutMs: 300000, roleMappings: [] },
        testInput: { imagePath: 'https://attacker.example/pixel.png' },
    });
    assert.doesNotMatch(unsafeHtml, /attacker\.example/u);
    const traversalHtml = buildImageGenerationPageHtml({
        config: { enabled: false, timeoutMs: 300000, roleMappings: [] },
        testInput: { imagePath: 'user/images/yuzi-phone-generated/../outside.png' },
    });
    assert.doesNotMatch(traversalHtml, /\.\.\/outside/u);
    const safeHtml = buildImageGenerationPageHtml({
        config: { enabled: false, timeoutMs: 300000, roleMappings: [] },
        testInput: { imagePath: 'user/images/yuzi-phone-generated/test.png' },
    });
    assert.match(safeHtml, /user\/images\/yuzi-phone-generated\/test\.png/u);

    const container = createFakeContainer();
    const toasts = [];
    const page = createImageGenerationPage({
        container,
        state: { mode: 'image_generation' },
        render() {},
        pageRuntime: createFakePageRuntime(),
        rerenderImageGenerationKeepScroll() {},
        showToast(_host, message, isError) {
            toasts.push({ message, isError });
        },
        imageGenerationSettingsService: {
            async loadViewModel() {
                return {
                    config: { enabled: false, timeoutMs: 300000, roleMappings: [] },
                    tables: [],
                    resolvedMappings: [],
                };
            },
            async saveConfig(config) {
                return { ok: true, status: 'saved', config };
            },
            async testGenerate() {
                return {
                    ok: true,
                    path: 'https://attacker.example/pixel.png',
                    imageData: 'AAAA',
                };
            },
        },
    });
    page.mount();
    await flushAsyncWork();
    container.querySelector('#phone-image-generation-test-description').value = '测试场景';
    container.querySelector('#phone-image-generation-test-generate')
        .dispatchEvent(new Event('click'));
    await flushAsyncWork();
    assert.equal(container.querySelector('#phone-image-generation-test-preview').innerHTML, '');
    assert.deepEqual(toasts, [{
        message: '智慧姬没有返回可显示的图片',
        isError: true,
    }]);
    page.dispose();
}

async function testLatePreviewCannotOverwriteANewerSavedConfig() {
    const { createImageGenerationPage } = await importModule(
        'modules/settings-app/pages/image-generation.js',
    );
    const preview = deferred();
    let loadCount = 0;
    const container = createFakeContainer();
    const page = createImageGenerationPage({
        container,
        state: { mode: 'image_generation' },
        render() {},
        pageRuntime: createFakePageRuntime(),
        rerenderImageGenerationKeepScroll() {},
        showToast() {},
        imageGenerationSettingsService: {
            loadViewModel(request = {}) {
                loadCount += 1;
                if (loadCount === 1) {
                    return Promise.resolve({
                        config: { enabled: false, timeoutMs: 300000, roleMappings: [] },
                        tables: [],
                        resolvedMappings: [],
                    });
                }
                return preview.promise.then(() => ({
                    config: request.config,
                    tables: [],
                    resolvedMappings: [],
                    testInput: {
                        names: request.testInput?.names || '',
                        description: '',
                        finalPrompt: request.testInput?.names || '',
                    },
                }));
            },
            async saveConfig(config) {
                return { ok: true, status: 'saved', config };
            },
            async testGenerate() {
                return { ok: false, status: 'unavailable' };
            },
        },
    });
    page.mount();
    await flushAsyncWork();
    const names = container.querySelector('#phone-image-generation-test-names');
    names.value = '星野铃';
    names.dispatchEvent(new Event('input'));
    const enabled = container.querySelector('#phone-image-generation-enabled');
    enabled.checked = true;
    enabled.dispatchEvent(new Event('change'));
    await flushAsyncWork();
    preview.resolve();
    await flushAsyncWork();
    page.update();
    assert.equal(
        container.querySelector('#phone-image-generation-enabled')?.checked,
        true,
        '保存后的新配置不能被更早发出的提示词预览结果覆盖',
    );
    page.dispose();
}

async function testDisposedPageIgnoresLateTestGenerationResult() {
    const { createImageGenerationPage } = await importModule(
        'modules/settings-app/pages/image-generation.js',
    );
    const generation = deferred();
    const container = createFakeContainer();
    const toasts = [];
    const page = createImageGenerationPage({
        container,
        state: { mode: 'image_generation' },
        render() {},
        pageRuntime: createFakePageRuntime(),
        rerenderImageGenerationKeepScroll() {},
        showToast(_host, message) {
            toasts.push(message);
        },
        imageGenerationSettingsService: {
            async loadViewModel() {
                return {
                    config: { enabled: false, timeoutMs: 300000, roleMappings: [] },
                    tables: [],
                    resolvedMappings: [],
                };
            },
            async saveConfig(config) {
                return { ok: true, status: 'saved', config };
            },
            testGenerate() {
                return generation.promise;
            },
        },
    });
    page.mount();
    await flushAsyncWork();
    container.querySelector('#phone-image-generation-test-description').value = '测试场景';
    container.querySelector('#phone-image-generation-test-generate')
        .dispatchEvent(new Event('click'));
    page.dispose();
    generation.resolve({
        ok: true,
        path: 'user/images/yuzi-phone-generated/late.png',
    });
    await flushAsyncWork();
    assert.equal(container.querySelector('#phone-image-generation-test-preview')?.innerHTML, '');
    assert.deepEqual(toasts, []);
}

async function main() {
    await testLateInitialLoadCannotOverwriteANewerSavedConfig();
    await testConcurrentAutoSavesUseTheLatestConfig();
    await testLatestFailedSaveRollsBackToTheNewestSuccessfulSave();
    await testFailedSaveRestoresCommittedUiAndShowsShortError();
    await testResolvedMappingsKeepRenamedColumnsUnavailable();
    await testEmptyTableRefreshReplacesPreviouslyLoadedTables();
    await testInvalidColumnSnapshotsChangeOnlyAfterExplicitReselection();
    await testTestPreviewAcceptsOnlyGeneratedImageDirectoryPaths();
    await testLatePreviewCannotOverwriteANewerSavedConfig();
    await testDisposedPageIgnoresLateTestGenerationResult();
    console.log('[image-generation-settings-resilience] passed');
}

main().catch((error) => {
    console.error('[image-generation-settings-resilience] failed');
    console.error(error);
    process.exitCode = 1;
});
