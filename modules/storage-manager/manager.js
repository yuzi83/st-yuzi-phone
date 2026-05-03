import { Logger } from '../error-handler.js';
import {
    DEFAULT_OPTIONS,
    evictByLRU,
    loadIndex,
    nowTs,
    pruneExpired,
    readRaw,
    recomputeIndexStats,
    safeJsonParse,
    saveIndex,
    toStorageKey,
    writeRaw,
} from './core.js';

export function createStorageManager(options = {}) {
    const mergedOptions = {
        ...DEFAULT_OPTIONS,
        ...(options && typeof options === 'object' ? options : {}),
    };

    const runMaintenance = () => {
        const index = loadIndex();
        pruneExpired(index);
        evictByLRU(index, mergedOptions);
        saveIndex(index);
        return index;
    };

    const set = (namespace, key, value, opts = {}) => {
        const ns = String(namespace || 'default').trim() || 'default';
        const innerKey = String(key || '').trim();
        if (!innerKey) return false;

        const index = loadIndex();
        const storageKey = toStorageKey(ns, innerKey);
        let previousRaw = null;
        let previousMeta = null;
        try {
            previousRaw = localStorage.getItem(storageKey);
            previousMeta = index.entries[storageKey]
                ? { ...index.entries[storageKey] }
                : null;
        } catch (error) {
            Logger.warn('[玉子手机] 存储读取旧 payload 失败:', error);
            return false;
        }
        const ttl = Number(opts.ttl);
        const expiresAt = Number.isFinite(ttl) && ttl > 0
            ? nowTs() + ttl
            : (Number(mergedOptions.defaultTTL) > 0 ? nowTs() + Number(mergedOptions.defaultTTL) : 0);
        let payload = null;

        const rollbackWrittenPayload = () => {
            try {
                if (previousRaw === null) {
                    localStorage.removeItem(storageKey);
                    delete index.entries[storageKey];
                } else {
                    localStorage.setItem(storageKey, previousRaw);
                    index.entries[storageKey] = previousMeta ? { ...previousMeta } : {};
                }
                recomputeIndexStats(index);
                const rollbackSaveResult = saveIndex(index);
                if (rollbackSaveResult?.success !== true) {
                    Logger.warn('[玉子手机] 存储索引失败后回滚索引保存失败:', rollbackSaveResult);
                }
            } catch (rollbackError) {
                Logger.warn('[玉子手机] 存储索引失败后回滚 payload 失败:', rollbackError);
            }
        };

        const saveIndexOrRollback = () => {
            const saveResult = saveIndex(index);
            if (saveResult?.success === true) return true;
            rollbackWrittenPayload();
            return false;
        };

        try {
            payload = JSON.stringify({
                v: value,
                expiresAt,
            });
            writeRaw(storageKey, payload, index);
            index.entries[storageKey].namespace = ns;
            index.entries[storageKey].key = innerKey;
            index.entries[storageKey].expiresAt = expiresAt;
            evictByLRU(index, mergedOptions);
            return saveIndexOrRollback();
        } catch (error) {
            const errorName = String(error?.name || '').toLowerCase();
            const isQuotaError = errorName.includes('quota') || errorName.includes('exceeded');
            if (isQuotaError && typeof payload === 'string') {
                pruneExpired(index);
                evictByLRU(index, mergedOptions);
                try {
                    writeRaw(storageKey, payload, index);
                    index.entries[storageKey].namespace = ns;
                    index.entries[storageKey].key = innerKey;
                    index.entries[storageKey].expiresAt = expiresAt;
                    evictByLRU(index, mergedOptions);
                    return saveIndexOrRollback();
                } catch (retryError) {
                    Logger.warn('[玉子手机] 存储空间不足，写入失败:', retryError);
                    return false;
                }
            }
            Logger.warn('[玉子手机] 存储写入失败:', error);
            return false;
        }
    };

    const get = (namespace, key) => {
        const ns = String(namespace || 'default').trim() || 'default';
        const innerKey = String(key || '').trim();
        if (!innerKey) return undefined;

        const index = loadIndex();
        const storageKey = toStorageKey(ns, innerKey);
        const raw = readRaw(storageKey, index);

        if (!raw) {
            saveIndex(index);
            return undefined;
        }

        const parsed = safeJsonParse(raw, null);
        if (!parsed || typeof parsed !== 'object') {
            try {
                localStorage.removeItem(storageKey);
            } catch {}
            delete index.entries[storageKey];
            recomputeIndexStats(index);
            saveIndex(index);
            return undefined;
        }

        const expiresAt = Number(parsed.expiresAt || 0);
        if (expiresAt > 0 && expiresAt <= nowTs()) {
            try {
                localStorage.removeItem(storageKey);
            } catch {}
            delete index.entries[storageKey];
            recomputeIndexStats(index);
            saveIndex(index);
            return undefined;
        }

        if (index.entries[storageKey]) {
            index.entries[storageKey].lastAccessAt = nowTs();
        }
        saveIndex(index);

        return parsed.v;
    };

    const remove = (namespace, key) => {
        const ns = String(namespace || 'default').trim() || 'default';
        const innerKey = String(key || '').trim();
        if (!innerKey) return;

        const index = loadIndex();
        const storageKey = toStorageKey(ns, innerKey);
        const prevSize = Number(index.entries?.[storageKey]?.size || 0);

        try {
            localStorage.removeItem(storageKey);
        } catch {}
        if (index.entries[storageKey]) {
            delete index.entries[storageKey];
            index.totalBytes = Math.max(0, Number(index.totalBytes || 0) - Math.max(0, prevSize));
        }

        saveIndex(index);
    };

    const clearNamespace = (namespace) => {
        const ns = String(namespace || 'default').trim() || 'default';
        const index = loadIndex();

        Object.entries(index.entries).forEach(([storageKey, meta]) => {
            if (String(meta?.namespace || '') !== ns) return;
            try {
                localStorage.removeItem(storageKey);
            } catch {}
            delete index.entries[storageKey];
        });

        recomputeIndexStats(index);
        saveIndex(index);
    };

    const estimate = () => {
        const index = loadIndex();
        return {
            totalBytes: Number(index.totalBytes || 0),
            entryCount: Object.keys(index.entries || {}).length,
            maxBytes: Number(mergedOptions.maxBytes || DEFAULT_OPTIONS.maxBytes),
            maxEntries: Number(mergedOptions.maxEntries || DEFAULT_OPTIONS.maxEntries),
        };
    };

    return {
        set,
        get,
        remove,
        clearNamespace,
        maintenance: runMaintenance,
        estimate,
    };
}

export function getSessionStorageNamespace(prefix = 'default') {
    const safePrefix = String(prefix || 'default').trim() || 'default';

    try {
        const host = window;
        if (!host.__yuziPhoneRuntimeSessionId) {
            host.__yuziPhoneRuntimeSessionId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        }
        return `${safePrefix}:${host.__yuziPhoneRuntimeSessionId}`;
    } catch {
        return `${safePrefix}:fallback`;
    }
}
