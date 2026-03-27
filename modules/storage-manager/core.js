import { Logger } from '../error-handler.js';

export const STORE_PREFIX = 'yzp:v2';
export const INDEX_KEY = `${STORE_PREFIX}:index`;

export const DEFAULT_OPTIONS = {
    maxEntries: 600,
    maxBytes: 512 * 1024,
    defaultTTL: 1000 * 60 * 60 * 24 * 14,
};

export const StorageErrorType = {
    QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
    ACCESS_DENIED: 'ACCESS_DENIED',
    INVALID_DATA: 'INVALID_DATA',
    UNKNOWN: 'UNKNOWN',
};

export const LOG_PREFIX = '[玉子手机][存储]';

export function detectStorageErrorType(error) {
    const message = error?.message || '';
    const name = error?.name || '';

    if (name === 'QuotaExceededError' || message.includes('quota') || message.includes('QUOTA')) {
        return StorageErrorType.QUOTA_EXCEEDED;
    }
    if (name === 'SecurityError' || message.includes('access') || message.includes('denied')) {
        return StorageErrorType.ACCESS_DENIED;
    }
    if (name === 'SyntaxError' || message.includes('JSON') || message.includes('parse')) {
        return StorageErrorType.INVALID_DATA;
    }
    return StorageErrorType.UNKNOWN;
}

export function handleStorageError(error, operation, context = {}) {
    const errorType = detectStorageErrorType(error);
    const message = error?.message || '未知错误';

    Logger.warn(`${LOG_PREFIX} ${operation} 失败 [${errorType}]:`, message, context);

    if (errorType === StorageErrorType.QUOTA_EXCEEDED) {
        Logger.warn(`${LOG_PREFIX} 存储配额超出，建议执行清理操作`);
    }

    return {
        success: false,
        error: errorType,
        message,
    };
}

export function nowTs() {
    return Date.now();
}

export function safeJsonParse(text, fallback) {
    if (!text || typeof text !== 'string') return fallback;
    try {
        return JSON.parse(text);
    } catch (error) {
        Logger.warn(`${LOG_PREFIX} JSON 解析失败:`, error?.message);
        return fallback;
    }
}

export function estimateSize(value) {
    try {
        const text = typeof value === 'string' ? value : JSON.stringify(value);
        if (!text) return 0;
        return Math.max(0, text.length * 2);
    } catch {
        return 0;
    }
}

export function toStorageKey(namespace, key) {
    return `${STORE_PREFIX}:${String(namespace || 'default').trim()}:${String(key || '').trim()}`;
}

export function loadIndex() {
    try {
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
    } catch (error) {
        Logger.warn(`${LOG_PREFIX} 加载索引失败:`, error?.message);
        return {
            entries: {},
            totalBytes: 0,
        };
    }
}

export function saveIndex(index) {
    try {
        const data = JSON.stringify(index);
        localStorage.setItem(INDEX_KEY, data);
        return { success: true };
    } catch (error) {
        const errorType = detectStorageErrorType(error);

        if (errorType === StorageErrorType.QUOTA_EXCEEDED) {
            Logger.warn(`${LOG_PREFIX} 索引保存配额超出，尝试清理...`);
            try {
                pruneExpired(index);
                evictByLRU(index, { maxEntries: 300, maxBytes: 256 * 1024 });
                localStorage.setItem(INDEX_KEY, JSON.stringify(index));
                Logger.info(`${LOG_PREFIX} 清理后索引保存成功`);
                return { success: true };
            } catch (retryError) {
                Logger.error(`${LOG_PREFIX} 清理后仍无法保存索引:`, retryError?.message);
            }
        }

        return handleStorageError(error, 'saveIndex', { indexSize: Object.keys(index?.entries || {}).length });
    }
}

export function pruneExpired(index) {
    const ts = nowTs();
    let changed = false;

    Object.entries(index.entries).forEach(([storageKey, meta]) => {
        const expiresAt = Number(meta?.expiresAt || 0);
        if (expiresAt > 0 && expiresAt <= ts) {
            try {
                localStorage.removeItem(storageKey);
            } catch {}
            delete index.entries[storageKey];
            changed = true;
        }
    });

    if (changed) {
        recomputeIndexStats(index);
    }
}

export function recomputeIndexStats(index) {
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

export function evictByLRU(index, options) {
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

        try {
            localStorage.removeItem(row.storageKey);
        } catch {}
        if (index.entries[row.storageKey]) {
            delete index.entries[row.storageKey];
            index.totalBytes = Math.max(0, Number(index.totalBytes || 0) - Math.max(0, row.size));
        }
    }
}

export function readRaw(storageKey, index) {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;

    const meta = index.entries[storageKey];
    if (meta) {
        meta.lastAccessAt = nowTs();
    }

    return raw;
}

export function writeRaw(storageKey, payload, index) {
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
