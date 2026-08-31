const DB_NAME = 'yuzi-phone-qq-v2';
const DB_VERSION = 2;
const STORE_NAME = 'state';
const MEDIA_STORE_NAME = 'media';
const STATE_KEY = 'root';
const IMAGE_LIBRARY_KEY = 'imageLibraryAssets';
const STICKERS_KEY = 'qq-v2.resources.stickers';

function clone(value) {
    if (typeof globalThis.structuredClone === 'function') {
        return globalThis.structuredClone(value);
    }
    if (Array.isArray(value)) return value.map(clone);
    if (!value || typeof value !== 'object') return value;
    if (typeof Blob !== 'undefined' && value instanceof Blob) return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
}

export function createEmptyQQV2State() {
    return {
        version: 2,
        scopes: {},
        sharedResources: {},
    };
}

function normalizeState(value) {
    const state = value && typeof value === 'object' ? clone(value) : createEmptyQQV2State();
    if (!state.scopes || typeof state.scopes !== 'object' || Array.isArray(state.scopes)) {
        state.scopes = {};
    }
    if (!state.sharedResources || typeof state.sharedResources !== 'object' || Array.isArray(state.sharedResources)) {
        state.sharedResources = {};
    }
    state.version = 2;
    return state;
}

function isBlob(value) {
    return typeof globalThis.Blob === 'function' && value instanceof globalThis.Blob;
}

function mediaKey(value) {
    return String(value ?? '').trim();
}

function visitMediaRecords(state, visitor) {
    const sharedResources = state?.sharedResources;
    const imageAssets = sharedResources?.[IMAGE_LIBRARY_KEY];
    if (imageAssets && typeof imageAssets === 'object' && !Array.isArray(imageAssets)) {
        Object.entries(imageAssets).forEach(([assetId, asset]) => {
            if (asset && typeof asset === 'object' && !Array.isArray(asset)) {
                visitor(asset, `shared:image:${assetId}`);
            }
        });
    }

    const stickers = sharedResources?.[STICKERS_KEY]?.stickers;
    if (Array.isArray(stickers)) {
        stickers.forEach((sticker) => {
            if (sticker && typeof sticker === 'object' && !Array.isArray(sticker)) {
                visitor(sticker, `shared:sticker:${String(sticker.id ?? '').trim()}`);
            }
        });
    }

    Object.entries(state?.scopes || {}).forEach(([scopeId, scope]) => {
        const assets = scope?.assets;
        if (!assets || typeof assets !== 'object' || Array.isArray(assets)) return;
        Object.entries(assets).forEach(([assetId, asset]) => {
            if (asset && typeof asset === 'object' && !Array.isArray(asset)) {
                visitor(asset, `scope:${scopeId}:asset:${assetId}`);
            }
        });
    });
}

function collectMediaKeys(state) {
    const keys = new Set();
    visitMediaRecords(state, (record) => {
        const key = mediaKey(record.mediaKey);
        if (key) keys.add(key);
    });
    return keys;
}

function prepareStateForPersistence(value) {
    const state = normalizeState(value);
    const writes = new Map();
    visitMediaRecords(state, (record, fallbackKey) => {
        const blob = isBlob(record.blob) ? record.blob : null;
        const key = mediaKey(record.mediaKey) || fallbackKey;
        if (blob) writes.set(key, blob);
        if (blob || mediaKey(record.mediaKey)) {
            record.mediaKey = key;
            record.size = Math.max(0, Number(blob?.size ?? record.size) || 0);
        }
        if (Object.hasOwn(record, 'blob')) delete record.blob;
    });
    return {
        state,
        writes,
        keys: collectMediaKeys(state),
    };
}

function sharedResourceKey(value) {
    const key = String(value ?? '').trim();
    if (!key) throw new TypeError('QQ v2 shared resource storage needs a key');
    return key;
}

/**
 * Extension-wide key-value storage backed by the same atomic v2 IndexedDB
 * document. Its bucket is explicitly outside `scopes`, so an API preset or
 * sticker library never belongs to one SillyTavern chat.
 */
export function createQQV2SharedResourceStorage(options = {}) {
    const stateStore = options.stateStore;
    if (!stateStore || typeof stateStore.read !== 'function' || typeof stateStore.transact !== 'function') {
        throw new TypeError('QQ v2 shared resource storage needs a state store');
    }

    return Object.freeze({
        async get(key) {
            const state = await stateStore.read();
            return state.sharedResources?.[sharedResourceKey(key)];
        },
        async set(key, value) {
            const resourceKey = sharedResourceKey(key);
            await stateStore.transact((state) => {
                if (!state.sharedResources || typeof state.sharedResources !== 'object' || Array.isArray(state.sharedResources)) {
                    state.sharedResources = {};
                }
                state.sharedResources[resourceKey] = value;
            });
        },
        async delete(key) {
            const resourceKey = sharedResourceKey(key);
            return stateStore.transact((state) => {
                if (!state.sharedResources || typeof state.sharedResources !== 'object' || Array.isArray(state.sharedResources)) {
                    state.sharedResources = {};
                }
                if (!Object.hasOwn(state.sharedResources, resourceKey)) return false;
                delete state.sharedResources[resourceKey];
                return true;
            });
        },
    });
}

/** A test-friendly serial state store with the same public contract as IndexedDB. */
export function createMemoryQQV2StateStore(initialState = undefined) {
    const initial = prepareStateForPersistence(initialState);
    let state = initial.state;
    const media = new Map(initial.writes);
    let pending = Promise.resolve();

    return Object.freeze({
        async read() {
            await pending;
            return clone(state);
        },
        transact(mutator) {
            const task = pending.then(async () => {
                const draft = clone(state);
                const result = await mutator(draft);
                const previousKeys = collectMediaKeys(state);
                const prepared = prepareStateForPersistence(draft);
                prepared.writes.forEach((blob, key) => media.set(key, blob));
                previousKeys.forEach((key) => {
                    if (!prepared.keys.has(key)) media.delete(key);
                });
                state = prepared.state;
                return clone(result);
            });
            pending = task.catch(() => {});
            return task;
        },
        async readMedia(key) {
            await pending;
            return media.get(mediaKey(key)) || null;
        },
        async close() {},
    });
}

function requestResult(request, label) {
    return new Promise((resolve, reject) => {
        request.addEventListener('success', () => resolve(request.result), { once: true });
        request.addEventListener('error', () => reject(new Error(`${label}失败`)), { once: true });
    });
}

function transactionDone(transaction, label) {
    return new Promise((resolve, reject) => {
        transaction.addEventListener('complete', resolve, { once: true });
        transaction.addEventListener('abort', () => reject(new Error(`${label}已中止`)), { once: true });
        transaction.addEventListener('error', () => reject(new Error(`${label}失败`)), { once: true });
    });
}

function openDatabase(indexedDb) {
    return new Promise((resolve, reject) => {
        const request = indexedDb.open(DB_NAME, DB_VERSION);
        request.addEventListener('upgradeneeded', (event) => {
            const db = request.result;
            const transaction = request.transaction;
            const stateStore = db.objectStoreNames.contains(STORE_NAME)
                ? transaction.objectStore(STORE_NAME)
                : db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            const mediaStore = db.objectStoreNames.contains(MEDIA_STORE_NAME)
                ? transaction.objectStore(MEDIA_STORE_NAME)
                : db.createObjectStore(MEDIA_STORE_NAME, { keyPath: 'id' });

            if (Number(event.oldVersion) < 2) {
                const stateRequest = stateStore.get(STATE_KEY);
                stateRequest.addEventListener('success', () => {
                    if (!stateRequest.result?.value) return;
                    const prepared = prepareStateForPersistence(stateRequest.result.value);
                    prepared.writes.forEach((blob, id) => mediaStore.put({ id, blob }));
                    stateStore.put({ id: STATE_KEY, value: prepared.state });
                }, { once: true });
            }
        });
        request.addEventListener('success', () => resolve(request.result), { once: true });
        request.addEventListener('error', () => reject(new Error('打开 QQ v2 本地数据库失败')), { once: true });
    });
}

/**
 * Browser persistence for v2. One atomically written state document keeps a multi-entity
 * domain mutation together without v1 schema migration or compatibility reads.
 */
export function createIndexedDbQQV2StateStore(options = {}) {
    const indexedDb = options.indexedDB || globalThis.indexedDB;
    if (!indexedDb || typeof indexedDb.open !== 'function') {
        throw new Error('当前环境不支持 IndexedDB');
    }
    let databasePromise = null;
    let pending = Promise.resolve();

    const database = () => {
        if (!databasePromise) databasePromise = openDatabase(indexedDb);
        return databasePromise;
    };
    const readState = async () => {
        const db = await database();
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const record = await requestResult(transaction.objectStore(STORE_NAME).get(STATE_KEY), '读取 QQ v2 状态');
        await transactionDone(transaction, '读取 QQ v2 状态');
        return normalizeState(record?.value);
    };
    const writeState = async (state, previousState) => {
        const db = await database();
        const prepared = prepareStateForPersistence(state);
        const previousKeys = collectMediaKeys(previousState);
        const transaction = db.transaction([STORE_NAME, MEDIA_STORE_NAME], 'readwrite');
        transaction.objectStore(STORE_NAME).put({ id: STATE_KEY, value: prepared.state });
        const mediaStore = transaction.objectStore(MEDIA_STORE_NAME);
        prepared.writes.forEach((blob, id) => mediaStore.put({ id, blob }));
        previousKeys.forEach((id) => {
            if (!prepared.keys.has(id)) mediaStore.delete(id);
        });
        await transactionDone(transaction, '保存 QQ v2 状态');
    };
    const readMedia = async (key) => {
        const normalizedKey = mediaKey(key);
        if (!normalizedKey) return null;
        const db = await database();
        const transaction = db.transaction([MEDIA_STORE_NAME], 'readonly');
        const record = await requestResult(
            transaction.objectStore(MEDIA_STORE_NAME).get(normalizedKey),
            '读取 QQ v2 媒体',
        );
        await transactionDone(transaction, '读取 QQ v2 媒体');
        return isBlob(record?.blob) ? record.blob : null;
    };

    return Object.freeze({
        async read() {
            await pending;
            return readState();
        },
        transact(mutator) {
            const task = pending.then(async () => {
                const previousState = await readState();
                const draft = clone(previousState);
                const result = await mutator(draft);
                await writeState(draft, previousState);
                return clone(result);
            });
            pending = task.catch(() => {});
            return task;
        },
        async readMedia(key) {
            await pending;
            return readMedia(key);
        },
        async close() {
            if (!databasePromise) return;
            const db = await databasePromise;
            db.close();
            databasePromise = null;
        },
    });
}
