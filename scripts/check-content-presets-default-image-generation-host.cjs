const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = file => import(`${pathToFileURL(path.resolve(file)).href}?t=${Date.now()}-${Math.random()}`);

function later() {
    let resolve;
    return {
        promise: new Promise(next => { resolve = next; }),
        resolve,
    };
}

function createFakeIndexedDb() {
    const records = new Map();
    const stores = new Set();
    let opened = false;
    const copy = value => value && JSON.parse(JSON.stringify(value));
    const enqueue = callback => setTimeout(callback, 0);

    const database = {
        objectStoreNames: {
            contains(name) {
                return stores.has(name);
            },
        },
        createObjectStore(name) {
            stores.add(name);
            return {};
        },
        transaction() {
            const transaction = {
                oncomplete: null,
                onerror: null,
                onabort: null,
                objectStore() {
                    return {
                        get(key) {
                            const request = {
                                onsuccess: null,
                                onerror: null,
                                result: undefined,
                                error: null,
                            };
                            enqueue(() => {
                                request.result = copy(records.get(key));
                                request.onsuccess?.();
                                enqueue(() => transaction.oncomplete?.());
                            });
                            return request;
                        },
                        put(record) {
                            records.set(record.key, copy(record));
                            enqueue(() => transaction.oncomplete?.());
                        },
                    };
                },
            };
            return transaction;
        },
    };

    return {
        open() {
            const request = {
                onsuccess: null,
                onerror: null,
                onupgradeneeded: null,
                result: database,
                error: null,
            };
            enqueue(() => {
                if (!opened) {
                    opened = true;
                    request.onupgradeneeded?.();
                }
                request.onsuccess?.();
            });
            return request;
        },
    };
}

const canvas = Object.freeze({
    tableName: '广场表',
    stableIdentityFields: ['帖子ID'],
    canvas: '封面',
    promptFields: ['标题', '图片描述'],
    promptSuffix: '1∶1正方形构图；用户补充：柔和光线',
});

const pageItem = Object.freeze({
    id: 'square-page',
    target: { tableName: '广场表', fields: ['帖子ID', '标题', '图片描述'] },
    entry: { mount: 'pages/square-page/mount.js' },
    activatable: true,
    imageGeneration: { canvases: [canvas] },
});

const inlineDisplay = Object.freeze({
    id: 'square-inline',
    name: '广场正文卡片',
    kind: 'inline',
    targets: [{ tableName: '广场表', fields: ['帖子ID', '标题', '图片描述'] }],
    entry: { mount: 'displays/square-inline/mount.js' },
    activatable: true,
    interactions: ['image-generate'],
    imageGeneration: { canvases: [canvas] },
});

const rawData = Object.freeze({
    sheet_square: {
        name: '广场表',
        content: [
            ['帖子ID', '标题', '图片描述'],
            ['post-1', '第一帖', '雨夜咖啡店'],
        ],
    },
});

function rowValues() {
    return { 帖子ID: 'post-1', 标题: '第一帖', 图片描述: '雨夜咖啡店' };
}

async function main() {
    const [
        { createContentPresetImageGenerationHost },
        { contentPresetDisplayModelId },
    ] = await Promise.all([
        load('modules/content-presets/image-generation-host.js'),
        load('modules/content-presets/display-directory.js'),
    ]);
    const indexedDB = createFakeIndexedDb();
    let settings = {
        imageGeneration: {
            enabled: true,
            timeoutMs: 300000,
            promptTranslationEnabled: true,
            promptTranslationApiPresetId: 'api-character',
            promptTranslationPresetId: 'preset-character',
            promptTranslationExtractTag: '',
            promptTranslationExcludeTags: [],
            tableDisplayEnabledBySheetKey: {},
        },
    };
    const index = {
        pageByTable: new Map([[
            'sheet_square',
            { sheetKey: 'sheet_square', presetId: 'square-preset', itemId: 'square-page' },
        ]]),
        popupByTable: new Map([[
            'sheet_square',
            { presetId: 'square-preset', displays: [inlineDisplay] },
        ]]),
    };
    const records = [{ id: 'square-preset', items: [pageItem], displays: [inlineDisplay] }];
    const composed = [];
    const translated = [];
    const generated = [];
    const runtime = {
        async composeCharacterImagePrompt(input) {
            composed.push(input);
            return { prompt: '角色解析后的自然提示词' };
        },
        async generateAndStore(input) {
            generated.push(input);
            return {
                ok: true,
                status: 'generated',
                path: 'user/images/yuzi-phone-generated/post-1.png',
            };
        },
    };
    const getQQV2Facade = () => ({
        intent: {
            async translateImagePrompt(input) {
                translated.push(input);
                return { ok: true, status: 'translated', content: 'translated square cover' };
            },
        },
    });
    const options = {
        indexedDB,
        now: () => 100,
        getPhoneSettings: () => settings,
        getContentPresetIndexSnapshot: () => index,
        getRawData: () => rawData,
        getChatScope: () => 'chat-alpha',
        listPresetRecords: async () => records,
        imageGenerationRuntime: runtime,
        getQQV2Facade,
    };
    const host = createContentPresetImageGenerationHost(options);
    const pageActions = host.createPageActions({
        item: pageItem,
        presetId: 'square-preset',
        itemId: 'square-page',
        sheetKey: 'sheet_square',
        isCurrent: () => true,
    });
    assert.deepEqual(await pageActions.getImageGenerationState('封面', rowValues()), {
        available: true,
        status: 'ready',
        canvasName: '封面',
        sheetKey: 'sheet_square',
    }, '默认宿主链在生成前必须确认页面来源、表和稳定标识仍有效');

    const first = await pageActions.generateImage('封面', rowValues());

    assert.equal(first.ok, true, `默认宿主链必须完成页面画布生图：${JSON.stringify(first)}`);
    assert.deepEqual(composed, [{
        explicitNames: [],
        description: '标题：第一帖\n图片描述：雨夜咖啡店\n1∶1正方形构图；用户补充：柔和光线',
        scanDescription: true,
    }], '默认链必须先复用 QQ 的人物扫描与自然提示词组合');
    assert.deepEqual(translated, [{
        prompt: '角色解析后的自然提示词',
        apiPresetId: 'api-character',
        imageGenerationPresetId: 'preset-character',
        timeoutMs: 300000,
    }], '开启转换时默认链必须调用 QQ 的提示词转换');
    assert.equal(generated.length, 1);
    assert.equal(generated[0].prompt, 'translated square cover');
    assert.equal(generated[0].folder, 'yuzi-phone-generated');
    assert.equal(generated[0].timeoutMs, 300000);

    const rehydratedHost = createContentPresetImageGenerationHost(options);
    const inlineActions = rehydratedHost.createInlineDisplayActions({
        display: inlineDisplay,
        presetId: 'square-preset',
        displayId: 'square-inline',
        modelId: contentPresetDisplayModelId('square-preset', 'square-inline'),
        isCurrent: () => true,
    });
    const sharedImage = await inlineActions.readImage('封面', rowValues());
    assert.equal(sharedImage.ok, true, '正文 inline 必须能读取页面生成的稳定图片');
    assert.equal(sharedImage.status, 'ready');
    assert.equal(sharedImage.imagePath, 'user/images/yuzi-phone-generated/post-1.png');

    settings = {
        imageGeneration: {
            ...settings.imageGeneration,
            tableDisplayEnabledBySheetKey: { sheet_square: false },
        },
    };
    const beforeDisabled = generated.length;
    const disabled = await pageActions.generateImage('封面', rowValues());
    assert.deepEqual(disabled, { ok: false, status: 'disabled', reason: 'table-disabled' });
    assert.equal(generated.length, beforeDisabled, '表级关闭后默认宿主链不得调用共享生成器');

    settings = {
        imageGeneration: {
            ...settings.imageGeneration,
            tableDisplayEnabledBySheetKey: {},
        },
    };
    const lateGeneration = later();
    let current = true;
    const lateHost = createContentPresetImageGenerationHost({
        ...options,
        imageGenerationRuntime: {
            ...runtime,
            async generateAndStore(input) {
                generated.push(input);
                return lateGeneration.promise;
            },
        },
    });
    const lateActions = lateHost.createPageActions({
        item: pageItem,
        presetId: 'square-preset',
        itemId: 'square-page',
        sheetKey: 'sheet_square',
        isCurrent: () => current,
    });
    const latePending = lateActions.generateImage('封面', rowValues());
    await new Promise(resolve => setTimeout(resolve, 0));
    current = false;
    lateGeneration.resolve({
        ok: true,
        status: 'generated',
        path: 'user/images/yuzi-phone-generated/post-1-late.png',
    });
    const late = await latePending;
    assert.equal(late.ok, false);
    assert.equal(late.status, 'stale');
    assert.equal(late.reason, 'ownership-changed', '实例失效后的晚到结果不得覆盖稳定图片归属');

    const afterLate = await rehydratedHost.createPageActions({
        item: pageItem,
        presetId: 'square-preset',
        itemId: 'square-page',
        sheetKey: 'sheet_square',
        isCurrent: () => true,
    }).readImage('封面', rowValues());
    assert.equal(afterLate.imagePath, 'user/images/yuzi-phone-generated/post-1.png', '晚到结果不得覆盖旧图');


    // New author mutations share persistence with generation, without invoking it.
    const uploads = [];
    const editOptions = { ...options, imageFiles: { async save(input) { uploads.push(input); return { ok: true, path: 'user/images/yuzi-phone-generated/manual.png' }; } } };
    const edits = createContentPresetImageGenerationHost(editOptions).createPageActions({ item: pageItem, presetId: 'square-preset', itemId: 'square-page', sheetKey: 'sheet_square', isCurrent: () => true });
    settings = { imageGeneration: { ...settings.imageGeneration, enabled: false } };
    const generationCount = generated.length;
    const uploaded = await edits.saveImage('封面', rowValues(), new Blob([Uint8Array.from([137,80,78,71,13,10,26,10])], { type: 'image/png' }));
    assert.equal(uploaded.status, 'saved');
    assert.equal(uploads.length, 1);
    assert.equal(uploads[0].format, 'png');
    assert.equal(uploads[0].imageData, 'iVBORw0KGgo=');
    const reopenActions = () => createContentPresetImageGenerationHost(editOptions).createPageActions({ item: pageItem, presetId: 'square-preset', itemId: 'square-page', sheetKey: 'sheet_square', isCurrent: () => true });
    assert.equal((await reopenActions().readImage('封面', rowValues())).imagePath, uploaded.imagePath);
    assert.equal((await edits.deleteImage('封面', rowValues())).status, 'deleted');
    assert.deepEqual(await reopenActions().readImage('封面', rowValues()), { ok: true, status: 'empty', cleared: true });
    assert.equal((await edits.deleteImage('封面', rowValues())).status, 'deleted', '重复清空幂等');
    assert.equal((await edits.saveImage('封面', rowValues(), 'not-a-blob')).status, 'invalid-input');
    assert.equal((await edits.deleteImage('封面', { ...rowValues(), 帖子ID: '' })).status, 'invalid-target');
    assert.equal(generated.length, generationCount, '上传/清空永远不触发生图，关闭生成仍能管理头像');

    console.log('[content-presets-default-image-generation-host] 通过');
}

main().catch(error => {
    console.error('[content-presets-default-image-generation-host] 失败');
    console.error(error);
    process.exitCode = 1;
});
