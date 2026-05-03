import { BUILTIN_TEMPLATES } from './defaults.js';
import {
    deepClone,
    sanitizeId,
} from './core.js';
import { normalizeTemplateType } from './normalize.js';
import { readTemplateStore } from './store.js';

const storeCache = {
    key: '',
    value: null,
};

const builtinCache = {
    value: null,
};

const derivedCache = {
    allTemplates: new Map(),
    templatesByType: new Map(),
    templateById: new Map(),
    sourceRuntime: new Map(),
    generation: 0,
};

function resetDerivedCache() {
    derivedCache.allTemplates.clear();
    derivedCache.templatesByType.clear();
    derivedCache.templateById.clear();
    derivedCache.sourceRuntime.clear();
    derivedCache.generation += 1;
}

function getStoreVersion(store) {
    const templatesCount = Array.isArray(store?.templates) ? store.templates.length : 0;
    const bindingsCount = store?.bindings && typeof store.bindings === 'object'
        ? Object.keys(store.bindings).length
        : 0;

    return `${Number(store?.updatedAt || 0)}:${templatesCount}:${bindingsCount}`;
}

function ensureBuiltinSource() {
    if (!Array.isArray(builtinCache.value)) {
        builtinCache.value = BUILTIN_TEMPLATES.map((template) => deepClone(template));
    }
    return builtinCache.value;
}

function ensureStoreSource() {
    const store = readTemplateStore();
    const nextKey = getStoreVersion(store);

    if (storeCache.key !== nextKey) {
        storeCache.key = nextKey;
        storeCache.value = deepClone(store);
        resetDerivedCache();
    }

    return storeCache.value;
}

function getAllTemplatesCacheKey(includeDisabled) {
    return includeDisabled ? 'all' : 'enabled';
}

function getCachedAllPhoneBeautifyTemplatesSource(options = {}) {
    const includeDisabled = options.includeDisabled !== false;
    const cacheKey = getAllTemplatesCacheKey(includeDisabled);

    if (!derivedCache.allTemplates.has(cacheKey)) {
        const store = ensureStoreSource();
        const merged = [
            ...ensureBuiltinSource(),
            ...(Array.isArray(store?.templates) ? store.templates : []),
        ];
        const result = includeDisabled
            ? merged
            : merged.filter((template) => template?.enabled !== false);
        derivedCache.allTemplates.set(cacheKey, result);
    }

    return derivedCache.allTemplates.get(cacheKey) || [];
}

function getCachedPhoneBeautifyTemplatesByTypeSource(templateType, options = {}) {
    const type = normalizeTemplateType(templateType, '');
    if (!type) return [];

    const includeBuiltin = options.includeBuiltin !== false;
    const includeUser = options.includeUser !== false;
    const enabledOnly = options.enabledOnly === true;
    const cacheKey = JSON.stringify([type, includeBuiltin, includeUser, enabledOnly]);

    if (!derivedCache.templatesByType.has(cacheKey)) {
        const all = getCachedAllPhoneBeautifyTemplatesSource({
            includeDisabled: !enabledOnly,
        });

        const filtered = all
            .filter((template) => {
                if (template?.templateType !== type) return false;
                if (!includeBuiltin && template?.source === 'builtin') return false;
                if (!includeUser && template?.source !== 'builtin') return false;
                if (enabledOnly && template?.enabled === false) return false;
                return true;
            })
            .sort((a, b) => {
                if (a?.source !== b?.source) {
                    return a?.source === 'builtin' ? -1 : 1;
                }
                return Number(b?.meta?.updatedAt || 0) - Number(a?.meta?.updatedAt || 0);
            });

        derivedCache.templatesByType.set(cacheKey, filtered);
    }

    return derivedCache.templatesByType.get(cacheKey) || [];
}

export function invalidatePhoneBeautifyTemplateCache() {
    storeCache.key = '';
    storeCache.value = null;
    resetDerivedCache();
}

export function getPhoneBeautifyTemplateCacheVersion() {
    ensureStoreSource();
    return storeCache.key;
}

export function getCachedBuiltinPhoneBeautifyTemplates() {
    return deepClone(ensureBuiltinSource());
}

export function getCachedPhoneBeautifyTemplateStore() {
    return deepClone(ensureStoreSource());
}

export function getCachedAllPhoneBeautifyTemplates(options = {}) {
    return deepClone(getCachedAllPhoneBeautifyTemplatesSource(options));
}

export function getCachedPhoneBeautifyTemplatesByType(templateType, options = {}) {
    return deepClone(getCachedPhoneBeautifyTemplatesByTypeSource(templateType, options));
}

export function getCachedPhoneBeautifyTemplateById(templateId, options = {}) {
    const safeId = sanitizeId(templateId, '');
    if (!safeId) return null;

    const includeDisabled = options.includeDisabled !== false;
    const cacheKey = JSON.stringify([safeId, includeDisabled]);

    if (!derivedCache.templateById.has(cacheKey)) {
        const templates = getCachedAllPhoneBeautifyTemplatesSource({ includeDisabled });
        const hit = templates.find((template) => template?.id === safeId) || null;
        derivedCache.templateById.set(cacheKey, hit);
    }

    return deepClone(derivedCache.templateById.get(cacheKey));
}

export function getCachedBeautifyTemplateSourceRuntime(cacheKey, producer) {
    ensureStoreSource();

    const safeKey = String(cacheKey || 'default');
    if (!derivedCache.sourceRuntime.has(safeKey)) {
        const generationBeforeProducer = derivedCache.generation;
        const result = typeof producer === 'function' ? producer() : null;
        const clonedResult = deepClone(result);

        if (derivedCache.generation === generationBeforeProducer) {
            derivedCache.sourceRuntime.set(safeKey, clonedResult);
        } else {
            return clonedResult;
        }
    }

    return deepClone(derivedCache.sourceRuntime.get(safeKey));
}
