const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { webcrypto } = require('node:crypto');

const ROOT = process.cwd();
const IMAGE_LIBRARY_KEY = 'imageLibraryAssets';
const STICKERS_KEY = 'qq-v2.resources.stickers';
const INSTALLATION_KEY = 'qq-v2.resources.default-image-library-installed';

function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    return import(`${href}?contract=${Date.now()}-${Math.random()}`);
}

function imageResponse(url) {
    const blob = new Blob([url], { type: 'image/jpeg' });
    return {
        ok: true,
        headers: { get: (name) => name.toLowerCase() === 'content-type' ? 'image/jpeg' : '' },
        async blob() { return blob; },
    };
}

async function testCatalogAndOneTimeAtomicInstallation() {
    const { QQ_DEFAULT_IMAGE_LIBRARY, createQQDefaultImageLibraryInstaller } = await importModule(
        'modules/qq-v2/resources/default-image-library.js',
    );
    const { createMemoryQQV2StateStore } = await importModule('modules/qq-v2/storage/state-store.js');
    assert.deepEqual(
        QQ_DEFAULT_IMAGE_LIBRARY.images.reduce((counts, entry) => ({
            ...counts,
            [entry.library]: (counts[entry.library] || 0) + 1,
        }), {}),
        { avatar: 8, 'profile-background': 1, 'chat-background': 1 },
    );
    assert.deepEqual(QQ_DEFAULT_IMAGE_LIBRARY.stickers.map((entry) => entry.description), ['正经', '不正经']);
    assert.equal(
        [...QQ_DEFAULT_IMAGE_LIBRARY.images, ...QQ_DEFAULT_IMAGE_LIBRARY.stickers]
            .every((entry) => entry.url.startsWith('https://cdn.jsdelivr.net/gh/niccolecantdoit-rgb/pic-bed@main/')),
        true,
    );

    const store = createMemoryQQV2StateStore({
        version: 2,
        scopes: { keep: { value: '聊天数据不能改' } },
        sharedResources: {
            keep: { value: '其他共享资源不能改' },
            [IMAGE_LIBRARY_KEY]: {
                existing: { assetId: 'existing', library: 'avatar', kind: 'avatar' },
            },
            [STICKERS_KEY]: {
                custom: '保留字段',
                stickers: [{ id: 'existing-sticker', order: 5, description: '已有表情' }],
            },
        },
    });
    let fetches = 0;
    const installer = createQQDefaultImageLibraryInstaller({
        stateStore: store,
        async fetchImpl(url) {
            fetches += 1;
            return imageResponse(url);
        },
    });

    assert.deepEqual(await installer.ensureInstalled(), { installed: true });
    const state = await store.read();
    assert.deepEqual(state.scopes, { keep: { value: '聊天数据不能改' } });
    assert.deepEqual(state.sharedResources.keep, { value: '其他共享资源不能改' });
    assert.equal(Object.keys(state.sharedResources[IMAGE_LIBRARY_KEY]).length, 11);
    assert.deepEqual(
        Object.values(state.sharedResources[IMAGE_LIBRARY_KEY])
            .filter((asset) => asset.library === 'avatar')
            .sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0))
            .map((asset) => asset.assetId),
        ['builtin-avatar-01', 'builtin-avatar-02', 'builtin-avatar-03', 'builtin-avatar-04',
            'builtin-avatar-05', 'builtin-avatar-06', 'builtin-avatar-07', 'builtin-avatar-08', 'existing'],
    );
    assert.deepEqual(state.sharedResources[STICKERS_KEY].stickers.map((entry) => [entry.id, entry.description, entry.order]), [
        ['existing-sticker', '已有表情', 5],
        ['builtin-sticker-serious', '正经', 6],
        ['builtin-sticker-playful', '不正经', 7],
    ]);
    assert.equal(state.sharedResources[STICKERS_KEY].custom, '保留字段');
    assert.deepEqual(state.sharedResources[INSTALLATION_KEY], { version: 1 });
    assert.equal(fetches, 12);

    await store.transact((draft) => {
        delete draft.sharedResources[IMAGE_LIBRARY_KEY]['builtin-avatar-01'];
        draft.sharedResources[STICKERS_KEY].stickers = draft.sharedResources[STICKERS_KEY].stickers
            .filter((entry) => entry.id !== 'builtin-sticker-serious');
    });
    assert.deepEqual(await installer.ensureInstalled(), { installed: false });
    const afterDeletion = await store.read();
    assert.equal(Object.hasOwn(afterDeletion.sharedResources[IMAGE_LIBRARY_KEY], 'builtin-avatar-01'), false);
    assert.equal(afterDeletion.sharedResources[STICKERS_KEY].stickers.some((entry) => entry.id === 'builtin-sticker-serious'), false);
    assert.equal(fetches, 12, '完成标记存在后不得重新下载或恢复用户删除的默认资源');
}

async function testFailureLeavesNoPartialStateAndCanRetry() {
    const { createQQDefaultImageLibraryInstaller } = await importModule(
        'modules/qq-v2/resources/default-image-library.js',
    );
    const { createMemoryQQV2StateStore } = await importModule('modules/qq-v2/storage/state-store.js');
    const store = createMemoryQQV2StateStore({
        version: 2,
        scopes: {},
        sharedResources: { keep: true },
    });
    let shouldFail = true;
    const installer = createQQDefaultImageLibraryInstaller({
        stateStore: store,
        async fetchImpl(url) {
            if (shouldFail && url.includes('fb9476fc-57e2-428f-ab60-b86784712979')) {
                return { ok: false };
            }
            return imageResponse(url);
        },
    });

    await assert.rejects(installer.ensureInstalled(), /默认图片下载失败/u);
    assert.deepEqual(await store.read(), {
        version: 2,
        scopes: {},
        sharedResources: { keep: true },
    });

    shouldFail = false;
    assert.deepEqual(await installer.ensureInstalled(), { installed: true });
    assert.deepEqual((await store.read()).sharedResources[INSTALLATION_KEY], { version: 1 });
}

async function testProductionRuntimeContinuesWhenInstallationFails() {
    const { createMemoryQQV2StateStore } = await importModule('modules/qq-v2/storage/state-store.js');
    const { createQQV2ProductionRuntime } = await importModule('modules/qq-v2/application/production-runtime.js');
    const warnings = [];
    let attempts = 0;
    const scope = {
        scopeId: 'st:character:default-images:chat',
        chatId: 'chat',
        chatFile: 'chat',
        hostType: 'character',
        hostId: 'default-images',
    };
    const runtime = createQQV2ProductionRuntime({
        host: {
            readScope() { return scope; },
            readUserIdentity() { return { name: '用户', avatar: '' }; },
            readStoryTime() { return ''; },
            readStoryMessages() { return []; },
            readRawContext() { return { getRequestHeaders: () => ({}) }; },
        },
        stateStore: createMemoryQQV2StateStore(),
        cryptoApi: webcrypto,
        defaultImageLibrary: {
            async ensureInstalled() {
                attempts += 1;
                throw new Error('CDN unavailable');
            },
        },
        logger: { warn(...args) { warnings.push(args); } },
        backend: { async generate() {}, async loadModels() { return []; } },
        worldbookGateway: {
            async getCurrentCharacterBookNames() { return { primary: '', additional: [] }; },
            async loadBook() { return { entries: {} }; },
            async saveBook() {},
        },
    });

    assert.deepEqual(await runtime.initialize(), scope);
    assert.equal(runtime.getStatus().phase, 'ready');
    assert.equal(attempts, 1);
    assert.equal(warnings.length, 1);
    runtime.destroy();
}

async function main() {
    await testCatalogAndOneTimeAtomicInstallation();
    await testFailureLeavesNoPartialStateAndCanRetry();
    await testProductionRuntimeContinuesWhenInstallationFails();
    console.log('[qq-default-image-library-contract] passed');
}

main().catch((error) => {
    console.error('[qq-default-image-library-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
