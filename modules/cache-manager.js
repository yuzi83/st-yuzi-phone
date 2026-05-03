// modules/cache-manager.js
/**
 * Yuzi Phone - IndexedDB 缓存管理
 */

const DB_NAME = 'yuzi-phone-cache';
const DB_VERSION = 1;
const STORE_TEMPLATES = 'templates';
const STORE_IMAGES = 'images';
const STORE_SETTINGS = 'settings';

let dbPromise = null;

function initializeStores(db) {
    if (!db.objectStoreNames.contains(STORE_TEMPLATES)) {
        db.createObjectStore(STORE_TEMPLATES);
    }
    if (!db.objectStoreNames.contains(STORE_IMAGES)) {
        db.createObjectStore(STORE_IMAGES);
    }
    if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS);
    }
}

function clearCachedDbPromise(promise) {
    if (dbPromise === promise) {
        dbPromise = null;
    }
}

function openDb() {
    if (dbPromise) {
        return dbPromise;
    }

    let nextPromise;
    nextPromise = new Promise((resolve, reject) => {
        let request;
        try {
            request = indexedDB.open(DB_NAME, DB_VERSION);
        } catch (error) {
            reject(error);
            return;
        }

        request.onerror = () => {
            reject(request.error);
        };
        request.onupgradeneeded = () => {
            initializeStores(request.result);
        };
        request.onsuccess = () => {
            const db = request.result;
            db.onversionchange = () => {
                db.close();
                clearCachedDbPromise(nextPromise);
            };
            resolve(db);
        };
    });

    nextPromise.catch(() => {
        clearCachedDbPromise(nextPromise);
    });
    dbPromise = nextPromise;
    return dbPromise;
}

function isIdbRequestLike(value) {
    return Boolean(value)
        && typeof value === 'object'
        && 'onsuccess' in value
        && 'onerror' in value
        && 'result' in value;
}

function withStore(storeName, mode, handler) {
    return openDb().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        let result;
        let settled = false;

        const rejectOnce = (error) => {
            if (settled) return;
            settled = true;
            reject(error);
        };

        try {
            const operation = handler(store);
            if (isIdbRequestLike(operation)) {
                operation.addEventListener('success', () => {
                    result = operation.result;
                }, { once: true });
                operation.addEventListener('error', () => {
                    rejectOnce(operation.error || tx.error);
                }, { once: true });
            } else {
                result = operation;
            }
        } catch (e) {
            rejectOnce(e);
            return;
        }

        tx.oncomplete = () => {
            if (settled) return;
            settled = true;
            resolve(result);
        };
        tx.onerror = () => rejectOnce(tx.error);
        tx.onabort = () => rejectOnce(tx.error);
    }));
}

export async function cacheSet(storeName, key, value, ttlMs = 0) {
    const payload = {
        v: value,
        expiresAt: ttlMs > 0 ? Date.now() + ttlMs : 0,
    };
    await withStore(storeName, 'readwrite', store => store.put(payload, key));
    return true;
}

export async function cacheGet(storeName, key) {
    const data = await withStore(storeName, 'readonly', store => store.get(key));
    if (!data) return undefined;
    const expiresAt = Number(data.expiresAt || 0);
    if (expiresAt > 0 && expiresAt <= Date.now()) {
        await cacheRemove(storeName, key);
        return undefined;
    }
    return data.v;
}

export async function cacheRemove(storeName, key) {
    await withStore(storeName, 'readwrite', store => store.delete(key));
    return true;
}

export async function cacheClear(storeName) {
    await withStore(storeName, 'readwrite', store => store.clear());
    return true;
}

export const CACHE_STORES = Object.freeze({
    templates: STORE_TEMPLATES,
    images: STORE_IMAGES,
    settings: STORE_SETTINGS,
});
