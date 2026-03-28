// modules/cache-manager.js
/**
 * Yuzi Phone - IndexedDB 缓存管理
 */

const DB_NAME = 'yuzi-phone-cache';
const DB_VERSION = 1;
const STORE_TEMPLATES = 'templates';
const STORE_IMAGES = 'images';
const STORE_SETTINGS = 'settings';

function openDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_TEMPLATES)) {
                db.createObjectStore(STORE_TEMPLATES);
            }
            if (!db.objectStoreNames.contains(STORE_IMAGES)) {
                db.createObjectStore(STORE_IMAGES);
            }
            if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
                db.createObjectStore(STORE_SETTINGS);
            }
        };
        request.onsuccess = () => resolve(request.result);
    });
}

function withStore(storeName, mode, handler) {
    return openDb().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        let result;
        try {
            result = handler(store);
        } catch (e) {
            reject(e);
            return;
        }
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
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
