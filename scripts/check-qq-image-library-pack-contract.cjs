const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();
const IMAGE_LIBRARY_KEY = 'imageLibraryAssets';
const STICKERS_KEY = 'qq-v2.resources.stickers';
const FORMAT = 'yuzi-phone-qq-image-library-pack';

function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    return import(`${href}?contract=${Date.now()}-${Math.random()}`);
}

function imageAsset(id, library, kind, bytes, mimeType, createdAt) {
    return {
        assetId: id,
        scopeId: '',
        conversationId: '',
        library,
        kind,
        blob: new Blob([Uint8Array.from(bytes)], { type: mimeType }),
        mimeType,
        createdAt,
    };
}

function sticker(id, description, bytes, mimeType, order) {
    return {
        id,
        description,
        blob: new Blob([Uint8Array.from(bytes)], { type: mimeType }),
        mimeType,
        size: bytes.length,
        order,
    };
}

function packEntry(id = 'asset-next') {
    return {
        id,
        mimeType: 'image/png',
        createdAt: 42,
        dataUrl: 'data:image/png;base64,AQID',
    };
}

function validPack(overrides = {}) {
    return {
        format: FORMAT,
        schemaVersion: 1,
        libraries: {
            avatars: [],
            profileBackgrounds: [],
            chatBackgrounds: [],
            stickers: [],
            ...overrides,
        },
    };
}

async function bytes(blob) {
    return [...new Uint8Array(await blob.arrayBuffer())];
}

async function testRoundTripAndAtomicAppend() {
    const { createQQImageLibraryPackService } = await importModule('modules/qq-v2/resources/image-library-pack.js');
    const { createMemoryQQV2StateStore } = await importModule('modules/qq-v2/storage/state-store.js');
    const initialState = {
        version: 2,
        scopes: {
            'scope-a': { conversations: { keep: { name: '不得改动' } } },
        },
        sharedResources: {
            keepMe: { enabled: true },
            [IMAGE_LIBRARY_KEY]: {
                'avatar-1': imageAsset('avatar-1', 'avatar', 'avatar', [1, 2, 3], 'image/png', 30),
                'profile-1': imageAsset('profile-1', 'profile-background', 'profile-background', [4, 5], 'image/webp', 20),
                'chat-1': imageAsset('chat-1', 'chat-background', 'background', [6, 7, 8], 'image/jpeg', 10),
            },
            [STICKERS_KEY]: {
                stickers: [sticker('sticker-1', '挥手', [9, 10], 'image/gif', 0)],
            },
        },
    };
    const sourceStore = createMemoryQQV2StateStore(initialState);
    const pack = await createQQImageLibraryPackService({ stateStore: sourceStore }).exportPack();

    assert.equal(pack.format, FORMAT);
    assert.equal(pack.schemaVersion, 1);
    assert.match(pack.exportedAt, /^\d{4}-\d{2}-\d{2}T/u);
    assert.deepEqual(Object.keys(pack.libraries), [
        'avatars',
        'profileBackgrounds',
        'chatBackgrounds',
        'stickers',
    ]);
    assert.deepEqual(pack.libraries.avatars.map((item) => item.id), ['avatar-1']);
    assert.deepEqual(pack.libraries.profileBackgrounds.map((item) => item.id), ['profile-1']);
    assert.deepEqual(pack.libraries.chatBackgrounds.map((item) => item.id), ['chat-1']);
    assert.deepEqual(pack.libraries.stickers.map((item) => item.id), ['sticker-1']);

    const targetStore = createMemoryQQV2StateStore({
        version: 2,
        scopes: initialState.scopes,
        sharedResources: {
            keepMe: { enabled: true },
            [IMAGE_LIBRARY_KEY]: {
                old: imageAsset('old', 'avatar', 'avatar', [99], 'image/png', 1),
                'avatar-1': imageAsset('avatar-1', 'avatar', 'avatar', [98], 'image/png', 2),
            },
            [STICKERS_KEY]: { stickers: [
                sticker('old-sticker', '旧表情', [97], 'image/png', 0),
                sticker('sticker-1', '同 ID 表情', [98], 'image/png', 10),
            ] },
        },
    });
    const imported = await createQQImageLibraryPackService({ stateStore: targetStore }).importPack(JSON.stringify(pack));
    assert.deepEqual(imported, { avatars: 1, profileBackgrounds: 1, chatBackgrounds: 1, stickers: 1 });

    const state = await targetStore.read();
    assert.deepEqual(state.scopes, initialState.scopes, '导入不得修改任何聊天作用域');
    assert.deepEqual(state.sharedResources.keepMe, { enabled: true }, '导入不得修改其他共享资源');
    assert.deepEqual(Object.keys(state.sharedResources[IMAGE_LIBRARY_KEY]).sort(), [
        'avatar-1', 'avatar-1(1)', 'chat-1', 'old', 'profile-1',
    ]);
    assert.deepEqual(await bytes(state.sharedResources[IMAGE_LIBRARY_KEY]['avatar-1'].blob), [98], '同 ID 旧图片必须保留');
    assert.deepEqual(await bytes(state.sharedResources[IMAGE_LIBRARY_KEY]['avatar-1(1)'].blob), [1, 2, 3]);
    assert.equal(state.sharedResources[IMAGE_LIBRARY_KEY]['avatar-1(1)'].mimeType, 'image/png');
    assert.deepEqual(state.sharedResources[STICKERS_KEY].stickers.map((item) => item.id), [
        'old-sticker', 'sticker-1', 'sticker-1(1)',
    ]);
    assert.deepEqual(await bytes(state.sharedResources[STICKERS_KEY].stickers[1].blob), [98], '同 ID 旧表情必须保留');
    assert.deepEqual(await bytes(state.sharedResources[STICKERS_KEY].stickers[2].blob), [9, 10]);
    assert.equal(state.sharedResources[STICKERS_KEY].stickers[2].order, 11, '导入表情必须排在现有最大顺序之后');

    await createQQImageLibraryPackService({ stateStore: targetStore }).importPack(pack);
    const repeatedState = await targetStore.read();
    assert.equal(Object.hasOwn(repeatedState.sharedResources[IMAGE_LIBRARY_KEY], 'avatar-1(2)'), true);
    assert.equal(Object.hasOwn(repeatedState.sharedResources[IMAGE_LIBRARY_KEY], 'profile-1(1)'), true);
    assert.equal(Object.hasOwn(repeatedState.sharedResources[IMAGE_LIBRARY_KEY], 'chat-1(1)'), true);
    assert.equal(repeatedState.sharedResources[STICKERS_KEY].stickers.at(-1).id, 'sticker-1(2)');
}

async function testExportUsesOneNormalizedMimeType() {
    const { createQQImageLibraryPackService } = await importModule('modules/qq-v2/resources/image-library-pack.js');
    const { createMemoryQQV2StateStore } = await importModule('modules/qq-v2/storage/state-store.js');
    const asset = imageAsset('avatar-mime', 'avatar', 'avatar', [11, 12], 'image/png', 1);
    asset.mimeType = 'IMAGE/WEBP';
    const store = createMemoryQQV2StateStore({
        version: 2,
        scopes: {},
        sharedResources: { [IMAGE_LIBRARY_KEY]: { [asset.assetId]: asset } },
    });
    const service = createQQImageLibraryPackService({ stateStore: store });
    const pack = await service.exportPack();
    assert.equal(pack.libraries.avatars[0].mimeType, 'image/webp');
    assert.match(pack.libraries.avatars[0].dataUrl, /^data:image\/webp;base64,/u);

    await service.importPack(pack);
    const state = await store.read();
    assert.equal(state.sharedResources[IMAGE_LIBRARY_KEY]['avatar-mime'].blob.type, 'image/png');
    assert.equal(state.sharedResources[IMAGE_LIBRARY_KEY]['avatar-mime(1)'].blob.type, 'image/webp');
    assert.deepEqual(await bytes(state.sharedResources[IMAGE_LIBRARY_KEY]['avatar-mime(1)'].blob), [11, 12]);
}

async function testInvalidPacksNeverWrite() {
    const { createQQImageLibraryPackService } = await importModule('modules/qq-v2/resources/image-library-pack.js');
    const cases = [
        ['错误格式', { ...validPack(), format: 'wrong' }],
        ['缺少数组', { format: FORMAT, schemaVersion: 1, libraries: { avatars: [] } }],
        ['重复图片 ID', validPack({ avatars: [packEntry('same')], chatBackgrounds: [packEntry('same')] })],
        ['重复表情 ID', validPack({ stickers: [
            { ...packEntry('same-sticker'), description: '一' },
            { ...packEntry('same-sticker'), description: '二' },
        ] })],
        ['非图片 MIME', validPack({ avatars: [{ ...packEntry(), mimeType: 'text/plain', dataUrl: 'data:text/plain;base64,AQID' }] })],
        ['超过 8MB', validPack({ avatars: [{
            ...packEntry(),
            dataUrl: `data:image/png;base64,${'A'.repeat(Math.ceil((8 * 1024 * 1024) / 3) * 4 + 1)}`,
        }] })],
    ];

    for (const [label, candidate] of cases) {
        let writes = 0;
        const sentinel = { version: 2, scopes: { keep: { id: 1 } }, sharedResources: { keep: { id: 2 } } };
        const store = {
            async read() { return sentinel; },
            async transact() { writes += 1; },
        };
        await assert.rejects(
            createQQImageLibraryPackService({ stateStore: store }).importPack(candidate),
            undefined,
            label,
        );
        assert.equal(writes, 0, `${label}不得开始写入事务`);
    }
}

async function testFacadeAndRuntimeWiring() {
    const { createQQV2Facade } = await importModule('modules/qq-v2/application/facade.js');
    const calls = [];
    const facade = createQQV2Facade({
        runtime: {
            async exportImageLibraryPack() {
                calls.push(['export']);
                return validPack();
            },
            async importImageLibraryPack(input) {
                calls.push(['import', input]);
                return { avatars: 1, profileBackgrounds: 2, chatBackgrounds: 3, stickers: 4 };
            },
        },
    });
    assert.equal((await facade.query.imageLibraryPack()).pack.format, FORMAT);
    assert.deepEqual(await facade.intent.importImageLibraryPack({ source: '{"pack":true}' }), {
        ok: true,
        status: 'accepted',
        imported: { avatars: 1, profileBackgrounds: 2, chatBackgrounds: 3, stickers: 4 },
    });
    assert.deepEqual(calls, [['export'], ['import', { source: '{"pack":true}' }]]);

    const runtimeSource = fs.readFileSync(path.join(ROOT, 'modules/qq-v2/application/production-runtime.js'), 'utf8');
    assert.match(runtimeSource, /exportImageLibraryPack:\s*\(\)\s*=>\s*imageLibraryPacks\.exportPack\(\)/u);
    assert.match(runtimeSource, /await imageLibraryPacks\.importPack\(source\)[\s\S]*revokeAllMediaRenderLeases\(\)[\s\S]*revokeAllStickerRenderLeases\(\)[\s\S]*await notifySubscribers\(\)/u);

    const uiSource = fs.readFileSync(path.join(ROOT, 'modules/qq-v2/ui/app.js'), 'utf8');
    const selectionCleanupSource = uiSource.slice(
        uiSource.indexOf('const clearImageLibrarySelection'),
        uiSource.indexOf('const mediaRenderLeases'),
    );
    const deleteHandlerSource = uiSource.slice(
        uiSource.indexOf('const confirmImageLibraryDeletion'),
        uiSource.indexOf('const persistSettings'),
    );
    const backHandlerSource = uiSource.slice(
        uiSource.indexOf('const back ='),
        uiSource.indexOf('const openChat ='),
    );
    assert.match(uiSource, /facade\.query\.imageLibraryPack\(\)/u);
    assert.match(uiSource, /facade\.intent\.importImageLibraryPack\(\{ source \}\)/u);
    assert.match(uiSource, /data-qq-image-library-pack-menu/u, '图片资料页需要右上角资源包菜单入口');
    assert.match(uiSource, /导入会追加头像、资料背景、聊天背景和表情/u);
    assert.match(uiSource, /相同资源 ID 会自动添加 \(1\)、\(2\)/u);
    assert.doesNotMatch(uiSource, /覆盖图片资料|覆盖导入|导入会整体覆盖/u, '图片资料导入不得再表达覆盖语义');
    assert.match(uiSource, /status\.textContent\s*=\s*result\?\.error\?\.message/u,
        '导入校验错误必须留在确认弹窗内显示');
    assert.match(uiSource, /已导出 QQ 图片资料', false/u, '导出成功需要使用成功 toast');
    assert.match(uiSource, /已导入：头像[\s\S]*false\)/u, '导入成功需要使用成功 toast');
    assert.match(
        selectionCleanupSource,
        /selectedImageAssetIds\.clear\(\)[\s\S]*selectedStickerIds\.clear\(\)[\s\S]*imageLibrarySelectionMode = false/u,
        '图片资料选择态清理必须清空选择并退出删除模式',
    );
    assert.match(deleteHandlerSource, /clearImageLibrarySelection\(\)/u, '图片资料删除成功后必须退出删除模式');
    assert.match(deleteHandlerSource, /facade\.intent\.deleteStickers\(\{ stickerIds \}\)/u,
        '表情多选删除必须走批量 Facade 接口');
    assert.doesNotMatch(deleteHandlerSource, /Promise\.all\(stickerIds\.map/u,
        '表情多选删除不得并发调用单条删除');
    assert.match(
        backHandlerSource,
        /page\?\.type === 'settings' && page\.kind === 'image-library'[\s\S]*clearImageLibrarySelection\(\)/u,
        '从图片资料返回设置一级页时必须退出删除模式',
    );
    assert.doesNotMatch(uiSource, /indexedDB/u, 'QQ 图片资料页面不得绕过 Facade 访问 IndexedDB');

    const cssSource = fs.readFileSync(path.join(ROOT, 'styles/phone-base/12-qq-app.css'), 'utf8');
    assert.match(cssSource, /\.yuzi-qq-image-library-view\.is-selection-mode\s+\.yuzi-qq-image-library-pack-action\s*\{[\s\S]*display:\s*none/u,
        '长按选择模式必须隐藏资源包入口');
}

async function main() {
    await testRoundTripAndAtomicAppend();
    await testExportUsesOneNormalizedMimeType();
    await testInvalidPacksNeverWrite();
    await testFacadeAndRuntimeWiring();
    console.log('[qq-image-library-pack-contract] passed');
}

main().catch((error) => {
    console.error('[qq-image-library-pack-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
