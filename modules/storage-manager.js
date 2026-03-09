// modules/storage-manager.js
/**
 * Yuzi Phone - 轻量存储治理器
 * - localStorage 分片
 * - TTL / LRU 清理
 * - 软容量预算
 */

const STORE_PREFIX = 'yzp:v2';
const INDEX_KEY = `${STORE_PREFIX}:index`;

const DEFAULT_OPTIONS = {
    maxEntries: 600,
    maxBytes: 512 * 1024,
    defaultTTL: 1000 * 60 * 60 * 24 * 14,
};

function nowTs() {
    return Date.now();
}

function safeJsonParse(text, fallback) {
    if (!text || typeof text !== 'string') return fallback;
    try {
        return JSON.parse(text);
    } catch {
        return fallback;
    }
}

function estimateSize(value) {
    try {
        const text = typeof value === 'string' ? value : JSON.stringify(value);
        if (!text) return 0;
        return Math.max(0, text.length * 2);
    } catch {
        return 0;
    }
}

function toStorageKey(namespace, key) {
    return `${STORE_PREFIX}:${String(namespace || 'default').trim()}:${String(key || '').trim()}`;
}

function loadIndex() {
    const raw = localStorage.getItem(INDEX_KEY);
    const parsed = safeJsonParse(raw, null);
    if (!parsed || typeof parsed !== 'object') {
        return {
            entries: {},
            totalBytes: 0,
        };
    }

    if (!parsed.entries || typeof parsed.entries !== 'object') {
        parsed.entries = {};
    }

    parsed.totalBytes = Number.isFinite(Number(parsed.totalBytes))
        ? Math.max(0, Math.round(Number(parsed.totalBytes)))
        : 0;

    return parsed;
}

function saveIndex(index) {
    try {
        localStorage.setItem(INDEX_KEY, JSON.stringify(index));
    } catch {
        // ignore
    }
}

function pruneExpired(index) {
    const ts = nowTs();
    let changed = false;

    Object.entries(index.entries).forEach(([storageKey, meta]) => {
        const expiresAt = Number(meta?.expiresAt || 0);
        if (expiresAt > 0 && expiresAt <= ts) {
            try { localStorage.removeItem(storageKey); } catch {}
            delete index.entries[storageKey];
            changed = true;
        }
    });

    if (changed) {
        recomputeIndexStats(index);
    }
}

function recomputeIndexStats(index) {
    let totalBytes = 0;
    Object.entries(index.entries).forEach(([storageKey, meta]) => {
        const raw = localStorage.getItem(storageKey);
        if (!raw) {
            delete index.entries[storageKey];
            return;
        }
        const size = estimateSize(raw);
        meta.size = size;
        totalBytes += size;
    });
    index.totalBytes = totalBytes;
}

function evictByLRU(index, options) {
    const maxEntries = Math.max(1, Number(options.maxEntries || DEFAULT_OPTIONS.maxEntries));
    const maxBytes = Math.max(16 * 1024, Number(options.maxBytes || DEFAULT_OPTIONS.maxBytes));

    const rows = Object.entries(index.entries)
        .map(([storageKey, meta]) => ({
            storageKey,
            lastAccessAt: Number(meta?.lastAccessAt || 0),
            size: Number(meta?.size || 0),
        }))
        .sort((a, b) => a.lastAccessAt - b.lastAccessAt);

    while (rows.length > 0 && (
        Object.keys(index.entries).length > maxEntries
        || Number(index.totalBytes || 0) > maxBytes
    )) {
        const row = rows.shift();
        if (!row) break;

        try { localStorage.removeItem(row.storageKey); } catch {}
        if (index.entries[row.storageKey]) {
            delete index.entries[row.storageKey];
            index.totalBytes = Math.max(0, Number(index.totalBytes || 0) - Math.max(0, row.size));
        }
    }
}

function readRaw(storageKey, index) {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;

    const meta = index.entries[storageKey];
    if (meta) {
        meta.lastAccessAt = nowTs();
    }

    return raw;
}

function writeRaw(storageKey, payload, index) {
    localStorage.setItem(storageKey, payload);
    const size = estimateSize(payload);

    if (!index.entries[storageKey]) {
        index.entries[storageKey] = {};
    }

    const prevSize = Number(index.entries[storageKey]?.size || 0);
    index.entries[storageKey].size = size;
    index.entries[storageKey].lastAccessAt = nowTs();
    index.totalBytes = Math.max(0, Number(index.totalBytes || 0) - prevSize + size);
}

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
        const ttl = Number(opts.ttl);
        const expiresAt = Number.isFinite(ttl) && ttl > 0
            ? nowTs() + ttl
            : (Number(mergedOptions.defaultTTL) > 0 ? nowTs() + Number(mergedOptions.defaultTTL) : 0);

        const payload = JSON.stringify({
            v: value,
            expiresAt,
        });

        try {
            writeRaw(storageKey, payload, index);
            index.entries[storageKey].namespace = ns;
            index.entries[storageKey].key = innerKey;
            index.entries[storageKey].expiresAt = expiresAt;
            evictByLRU(index, mergedOptions);
            saveIndex(index);
            return true;
        } catch (e) {
            if (String(e?.name || '') === 'QuotaExceededError') {
                pruneExpired(index);
                evictByLRU(index, mergedOptions);
                try {
                    writeRaw(storageKey, payload, index);
                    index.entries[storageKey].namespace = ns;
                    index.entries[storageKey].key = innerKey;
                    index.entries[storageKey].expiresAt = expiresAt;
                    evictByLRU(index, mergedOptions);
                    saveIndex(index);
                    return true;
                } catch {
                    return false;
                }
            }
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
            try { localStorage.removeItem(storageKey); } catch {}
            delete index.entries[storageKey];
            recomputeIndexStats(index);
            saveIndex(index);
            return undefined;
        }

        const expiresAt = Number(parsed.expiresAt || 0);
        if (expiresAt > 0 && expiresAt <= nowTs()) {
            try { localStorage.removeItem(storageKey); } catch {}
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

        try { localStorage.removeItem(storageKey); } catch {}
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
            try { localStorage.removeItem(storageKey); } catch {}
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
