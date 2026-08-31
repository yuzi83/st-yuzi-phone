const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    return import(`${href}?contract=${Date.now()}-${Math.random()}`);
}

function image(label) {
    return new Blob([label], { type: 'image/png' });
}

function containsBlob(value, seen = new Set()) {
    if (value instanceof Blob) return true;
    if (!value || typeof value !== 'object' || seen.has(value)) return false;
    seen.add(value);
    return Object.values(value).some((item) => containsBlob(item, seen));
}

async function main() {
    const {
        createMemoryQQV2StateStore,
        createQQV2SharedResourceStorage,
    } = await importModule('modules/qq-v2/storage/state-store.js');
    const { createQQV2Repository } = await importModule('modules/qq-v2/domain/repository.js');
    const { createQQV2ResourceService } = await importModule('modules/qq-v2/resources/service.js');

    const stateStore = createMemoryQQV2StateStore();
    const repository = createQQV2Repository({ stateStore });
    const resources = createQQV2ResourceService({
        storage: createQQV2SharedResourceStorage({ stateStore }),
        readMedia: (key) => stateStore.readMedia(key),
    });

    await repository.ensureScope('scope-a');
    const scopeAsset = await repository.saveScopeAsset('scope-a', {
        kind: 'avatar',
        blob: image('scope'),
    });
    const libraryAsset = await repository.saveImageLibraryAsset('scope-a', {
        library: 'avatar',
        blob: image('library'),
    });
    const sticker = await resources.saveSticker({
        description: '挥手',
        blob: image('sticker'),
    });

    const state = await stateStore.read();
    const storedScopeAsset = state.scopes['scope-a'].assets[scopeAsset.assetId];
    const storedLibraryAsset = state.sharedResources.imageLibraryAssets[libraryAsset.assetId];
    const storedSticker = state.sharedResources['qq-v2.resources.stickers'].stickers
        .find((item) => item.id === sticker.id);
    assert.equal(containsBlob(state), false, 'QQ 根状态不得包含任何图片 Blob');
    assert.equal(Boolean(storedScopeAsset.mediaKey), true);
    assert.equal(Boolean(storedLibraryAsset.mediaKey), true);
    assert.equal(Boolean(storedSticker.mediaKey), true);
    assert.equal(await (await stateStore.readMedia(storedScopeAsset.mediaKey)).text(), 'scope');
    assert.equal(await (await repository.getMediaAsset('scope-a', libraryAsset.assetId)).blob.text(), 'library');
    assert.equal(await (await resources.getStickerBlob(sticker.id)).text(), 'sticker');

    await repository.deleteImageLibraryAssets('scope-a', [libraryAsset.assetId]);
    await resources.deleteSticker(sticker.id);
    await stateStore.transact((draft) => {
        delete draft.scopes['scope-a'].assets[scopeAsset.assetId];
    });
    assert.equal(await stateStore.readMedia(storedScopeAsset.mediaKey), null, '删除作用域图片后必须释放媒体实体');
    assert.equal(await stateStore.readMedia(storedLibraryAsset.mediaKey), null, '删除图片资料后必须释放媒体实体');
    assert.equal(await stateStore.readMedia(storedSticker.mediaKey), null, '删除表情后必须释放媒体实体');

    const rollbackKey = 'scope:scope-a:asset:rollback';
    await assert.rejects(stateStore.transact((draft) => {
        draft.scopes['scope-a'].assets.rollback = {
            assetId: 'rollback',
            scopeId: 'scope-a',
            kind: 'avatar',
            blob: image('never-written'),
        };
        throw new Error('rollback');
    }));
    assert.equal(await stateStore.readMedia(rollbackKey), null, '失败事务不得留下孤立媒体');
    assert.equal(Boolean((await stateStore.read()).scopes['scope-a'].assets.rollback), false);

    const source = fs.readFileSync(path.join(ROOT, 'modules/qq-v2/storage/state-store.js'), 'utf8');
    assert.match(source, /const DB_VERSION = 2;/u);
    assert.match(source, /const MEDIA_STORE_NAME = 'media';/u);
    assert.match(source, /Number\(event\.oldVersion\) < 2[\s\S]*prepareStateForPersistence/u,
        'IndexedDB v1 升级必须在升级事务中迁移旧 Blob');
    assert.match(source, /db\.transaction\(\[STORE_NAME, MEDIA_STORE_NAME\], 'readwrite'\)/u,
        '根状态与媒体实体必须在同一个 IndexedDB 事务中提交');

    console.log('[qq-media-storage-contract] passed');
}

main().catch((error) => {
    console.error('[qq-media-storage-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
