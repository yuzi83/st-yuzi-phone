export {
    STORE_PREFIX,
    INDEX_KEY,
    DEFAULT_OPTIONS,
    StorageErrorType,
    LOG_PREFIX,
    detectStorageErrorType,
    handleStorageError,
    nowTs,
    safeJsonParse,
    estimateSize,
    toStorageKey,
    loadIndex,
    saveIndex,
    pruneExpired,
    recomputeIndexStats,
    evictByLRU,
    readRaw,
    writeRaw,
} from './storage-manager/core.js';

export {
    createStorageManager,
    getSessionStorageNamespace,
} from './storage-manager/manager.js';
