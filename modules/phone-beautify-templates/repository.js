import { getPhoneSettings, savePhoneSetting } from '../settings.js';
import {
    BEAUTIFY_ACTIVE_TEMPLATE_IDS_SETTING_KEY_SPECIAL,
    BEAUTIFY_ACTIVE_TEMPLATE_ID_SETTING_KEY_GENERIC,
    BEAUTIFY_SOURCE_MODE_BUILTIN,
    BEAUTIFY_SOURCE_MODE_SETTING_KEY_SPECIAL,
    BEAUTIFY_SOURCE_MODE_SETTING_KEY_GENERIC,
    BEAUTIFY_SOURCE_MODE_USER,
    PHONE_TEMPLATE_TYPE_SPECIAL,
    PHONE_TEMPLATE_TYPE_GENERIC,
    SPECIAL_RENDERER_KEYS,
} from './constants.js';
import {
    deepClone,
    nowTs,
    normalizeString,
    sanitizeId,
} from './core.js';
import {
    normalizeTemplate,
    normalizeTemplateMeta,
    normalizeTemplateType,
} from './normalize.js';
import { saveTemplateStore } from './store.js';
import { ensureUniqueTemplateId } from './template-id.js';
import {
    getCachedAllPhoneBeautifyTemplates,
    getCachedBeautifyTemplateSourceRuntime,
    getCachedBuiltinPhoneBeautifyTemplates,
    getCachedPhoneBeautifyTemplateById,
    getCachedPhoneBeautifyTemplatesByType,
    getCachedPhoneBeautifyTemplateStore,
    getPhoneBeautifyTemplateCacheVersion,
    invalidatePhoneBeautifyTemplateCache,
} from './cache.js';

const ALLOWED_TEMPLATE_TYPES = new Set([
    PHONE_TEMPLATE_TYPE_SPECIAL,
    PHONE_TEMPLATE_TYPE_GENERIC,
]);

const ALLOWED_RENDERER_KEYS = new Set([
    ...SPECIAL_RENDERER_KEYS,
    'generic_table',
]);

function getTemplateById(templateId) {
    const id = sanitizeId(templateId, '');
    if (!id) return null;

    return getCachedPhoneBeautifyTemplateById(id, { includeDisabled: true });
}

function buildSourceRuntimeCacheKey(templateType, options = {}) {
    const safeType = normalizeTemplateType(templateType, '');
    const settings = getPhoneSettings() || {};
    const enabledOnly = options.enabledOnly === true ? 'enabled' : 'all';
    const storeVersion = getPhoneBeautifyTemplateCacheVersion();

    if (safeType === PHONE_TEMPLATE_TYPE_SPECIAL) {
        const rawMap = settings?.[BEAUTIFY_ACTIVE_TEMPLATE_IDS_SETTING_KEY_SPECIAL];
        const sortedMap = rawMap && typeof rawMap === 'object' && !Array.isArray(rawMap)
            ? Object.entries(rawMap)
                .filter(([key, value]) => !!key && !!value)
                .sort(([a], [b]) => String(a).localeCompare(String(b)))
            : [];

        return JSON.stringify([
            safeType,
            enabledOnly,
            String(settings?.[BEAUTIFY_SOURCE_MODE_SETTING_KEY_SPECIAL] || ''),
            sortedMap,
            storeVersion,
        ]);
    }

    return JSON.stringify([
        safeType,
        enabledOnly,
        String(settings?.[BEAUTIFY_SOURCE_MODE_SETTING_KEY_GENERIC] || ''),
        String(settings?.[BEAUTIFY_ACTIVE_TEMPLATE_ID_SETTING_KEY_GENERIC] || ''),
        storeVersion,
    ]);
}

function normalizeBeautifySourceMode(rawMode, fallback = BEAUTIFY_SOURCE_MODE_BUILTIN) {
    const mode = normalizeString(rawMode, 24).toLowerCase();
    if (mode === BEAUTIFY_SOURCE_MODE_BUILTIN || mode === BEAUTIFY_SOURCE_MODE_USER) {
        return mode;
    }
    return fallback === BEAUTIFY_SOURCE_MODE_USER ? BEAUTIFY_SOURCE_MODE_USER : BEAUTIFY_SOURCE_MODE_BUILTIN;
}

function normalizeSourceModeForTemplateType(templateType, sourceMode) {
    const safeType = normalizeTemplateType(templateType, '');
    if (!safeType) return BEAUTIFY_SOURCE_MODE_BUILTIN;

    if (safeType === PHONE_TEMPLATE_TYPE_SPECIAL || safeType === PHONE_TEMPLATE_TYPE_GENERIC) {
        return normalizeBeautifySourceMode(sourceMode, BEAUTIFY_SOURCE_MODE_BUILTIN);
    }

    return BEAUTIFY_SOURCE_MODE_BUILTIN;
}

function getSourceModeSettingKey(templateType) {
    const safeType = normalizeTemplateType(templateType, '');
    if (safeType === PHONE_TEMPLATE_TYPE_SPECIAL) return BEAUTIFY_SOURCE_MODE_SETTING_KEY_SPECIAL;
    if (safeType === PHONE_TEMPLATE_TYPE_GENERIC) return BEAUTIFY_SOURCE_MODE_SETTING_KEY_GENERIC;
    return '';
}

function saveBeautifyTemplateSettingAndInvalidate(settingKey, value) {
    savePhoneSetting(settingKey, value);
    invalidatePhoneBeautifyTemplateCache();
}

function normalizeSpecialActiveTemplateIds(rawMap) {
    const src = rawMap && typeof rawMap === 'object' && !Array.isArray(rawMap)
        ? rawMap
        : {};

    const normalized = {};
    Object.entries(src).forEach(([rendererKey, templateId]) => {
        const safeRendererKey = normalizeString(rendererKey, 48);
        if (!SPECIAL_RENDERER_KEYS.has(safeRendererKey)) return;

        const safeTemplateId = sanitizeId(templateId, '');
        if (!safeTemplateId) return;

        normalized[safeRendererKey] = safeTemplateId;
    });

    return normalized;
}

function normalizeGenericActiveTemplateId(rawTemplateId) {
    return sanitizeId(rawTemplateId, '');
}

function getSpecialActiveTemplateIdsRaw() {
    const raw = getPhoneSettings()?.[BEAUTIFY_ACTIVE_TEMPLATE_IDS_SETTING_KEY_SPECIAL];
    return normalizeSpecialActiveTemplateIds(raw);
}

function getGenericActiveTemplateIdRaw() {
    const raw = getPhoneSettings()?.[BEAUTIFY_ACTIVE_TEMPLATE_ID_SETTING_KEY_GENERIC];
    return normalizeGenericActiveTemplateId(raw);
}

function resolveActiveCleanupValue(deletedTemplateId, fallbackTemplateId) {
    const safeDeletedId = sanitizeId(deletedTemplateId, '');
    const safeFallbackId = sanitizeId(fallbackTemplateId, '');
    return safeFallbackId && safeFallbackId !== safeDeletedId ? safeFallbackId : '';
}

function areSpecialActiveTemplateIdsEqual(leftMap, rightMap) {
    const left = normalizeSpecialActiveTemplateIds(leftMap);
    const right = normalizeSpecialActiveTemplateIds(rightMap);
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();

    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key]);
}

function cleanupActiveSettingsForDeletedTemplate(template) {
    const safeDeletedId = sanitizeId(template?.id, '');
    const safeType = normalizeTemplateType(template?.templateType, '');
    if (!safeDeletedId || !safeType) {
        return {
            activeSettingsUpdated: false,
            genericActiveTemplateId: '',
            specialActiveTemplateIds: null,
        };
    }

    if (safeType === PHONE_TEMPLATE_TYPE_GENERIC) {
        const currentActiveId = getGenericActiveTemplateIdRaw();
        if (currentActiveId !== safeDeletedId) {
            return {
                activeSettingsUpdated: false,
                genericActiveTemplateId: currentActiveId,
                specialActiveTemplateIds: null,
            };
        }

        const nextActiveId = resolveActiveCleanupValue(safeDeletedId, getDefaultGenericTemplateId());
        saveBeautifyTemplateSettingAndInvalidate(BEAUTIFY_ACTIVE_TEMPLATE_ID_SETTING_KEY_GENERIC, nextActiveId);
        return {
            activeSettingsUpdated: true,
            genericActiveTemplateId: nextActiveId,
            specialActiveTemplateIds: null,
        };
    }

    if (safeType === PHONE_TEMPLATE_TYPE_SPECIAL) {
        const currentMap = getSpecialActiveTemplateIdsRaw();
        let changed = false;
        const nextMap = { ...currentMap };

        Object.entries(currentMap).forEach(([rendererKey, activeTemplateId]) => {
            if (activeTemplateId !== safeDeletedId) return;

            const fallbackId = resolveActiveCleanupValue(
                safeDeletedId,
                getDefaultSpecialTemplateIdByRenderer(rendererKey),
            );
            if (fallbackId) {
                nextMap[rendererKey] = fallbackId;
            } else {
                delete nextMap[rendererKey];
            }
            changed = true;
        });

        if (!changed) {
            return {
                activeSettingsUpdated: false,
                genericActiveTemplateId: '',
                specialActiveTemplateIds: currentMap,
            };
        }

        saveBeautifyTemplateSettingAndInvalidate(BEAUTIFY_ACTIVE_TEMPLATE_IDS_SETTING_KEY_SPECIAL, nextMap);
        return {
            activeSettingsUpdated: true,
            genericActiveTemplateId: '',
            specialActiveTemplateIds: nextMap,
        };
    }

    return {
        activeSettingsUpdated: false,
        genericActiveTemplateId: '',
        specialActiveTemplateIds: null,
    };
}

function getSpecialTemplatesByRendererKey(rendererKey, options = {}) {
    const safeRendererKey = normalizeString(rendererKey, 48);
    if (!SPECIAL_RENDERER_KEYS.has(safeRendererKey)) return [];

    return getPhoneBeautifyTemplatesByType(PHONE_TEMPLATE_TYPE_SPECIAL, {
        includeBuiltin: options.includeBuiltin !== false,
        includeUser: options.includeUser !== false,
        enabledOnly: options.enabledOnly === true,
    }).filter(t => t?.render?.rendererKey === safeRendererKey);
}

function getDefaultSpecialTemplateIdByRenderer(rendererKey) {
    const candidates = getSpecialTemplatesByRendererKey(rendererKey, {
        includeBuiltin: true,
        includeUser: false,
        enabledOnly: true,
    });
    return sanitizeId(candidates[0]?.id, '');
}

function getDefaultGenericTemplateId() {
    const templates = getPhoneBeautifyTemplatesByType(PHONE_TEMPLATE_TYPE_GENERIC, {
        includeBuiltin: true,
        includeUser: false,
        enabledOnly: true,
    }).filter(t => t?.render?.rendererKey === 'generic_table');

    return sanitizeId(templates[0]?.id, '');
}

function ensureValidSpecialActiveTemplateIds(rawMap) {
    const normalized = normalizeSpecialActiveTemplateIds(rawMap);
    const result = { ...normalized };

    SPECIAL_RENDERER_KEYS.forEach((rendererKey) => {
        const currentId = sanitizeId(result[rendererKey], '');
        if (!currentId) return;

        const exists = getSpecialTemplatesByRendererKey(rendererKey, {
            includeBuiltin: true,
            includeUser: true,
            enabledOnly: true,
        }).some(t => t.id === currentId);

        if (!exists) {
            delete result[rendererKey];
        }
    });

    return result;
}

function ensureValidGenericActiveTemplateId(rawTemplateId) {
    const id = normalizeGenericActiveTemplateId(rawTemplateId);
    if (!id) return '';

    const exists = getPhoneBeautifyTemplatesByType(PHONE_TEMPLATE_TYPE_GENERIC, {
        includeBuiltin: true,
        includeUser: true,
        enabledOnly: true,
    }).some(t => t.id === id && t?.render?.rendererKey === 'generic_table');

    return exists ? id : '';
}

function getEffectiveTemplatesBySourceMode(templates, sourceMode) {
    const safeTemplates = Array.isArray(templates) ? templates : [];
    const mode = normalizeBeautifySourceMode(sourceMode, BEAUTIFY_SOURCE_MODE_BUILTIN);

    const builtin = safeTemplates.filter(t => t?.source === 'builtin');
    const user = safeTemplates.filter(t => t?.source !== 'builtin');

    if (mode === BEAUTIFY_SOURCE_MODE_USER) {
        if (user.length > 0) {
            return {
                templates: user,
                fallbackApplied: false,
                mode: BEAUTIFY_SOURCE_MODE_USER,
            };
        }

        return {
            templates: builtin,
            fallbackApplied: true,
            mode: BEAUTIFY_SOURCE_MODE_BUILTIN,
        };
    }

    return {
        templates: builtin,
        fallbackApplied: false,
        mode: BEAUTIFY_SOURCE_MODE_BUILTIN,
    };
}

export function getBeautifyTemplateSourceMode(templateType) {
    const settingKey = getSourceModeSettingKey(templateType);
    if (!settingKey) return BEAUTIFY_SOURCE_MODE_BUILTIN;

    const raw = getPhoneSettings()?.[settingKey];
    return normalizeSourceModeForTemplateType(templateType, raw);
}

export function setBeautifyTemplateSourceMode(templateType, sourceMode) {
    const settingKey = getSourceModeSettingKey(templateType);
    if (!settingKey) {
        return { success: false, message: '模板类型无效' };
    }

    const normalized = normalizeSourceModeForTemplateType(templateType, sourceMode);
    saveBeautifyTemplateSettingAndInvalidate(settingKey, normalized);
    return {
        success: true,
        mode: normalized,
        message: normalized === BEAUTIFY_SOURCE_MODE_USER ? '已切换到自定义导入模板' : '已切换到默认模板',
    };
}

export function getActiveBeautifyTemplateIdByType(templateType, options = {}) {
    const safeType = normalizeTemplateType(templateType, '');
    if (!safeType) return '';

    if (safeType === PHONE_TEMPLATE_TYPE_GENERIC) {
        const valid = ensureValidGenericActiveTemplateId(getGenericActiveTemplateIdRaw());
        if (valid) return valid;

        return options.withFallback === false ? '' : getDefaultGenericTemplateId();
    }

    return '';
}

export function getActiveBeautifyTemplateIdsForSpecial(options = {}) {
    const valid = ensureValidSpecialActiveTemplateIds(getSpecialActiveTemplateIdsRaw());
    const withFallback = options.withFallback !== false;

    if (!withFallback) return valid;

    const merged = { ...valid };

    SPECIAL_RENDERER_KEYS.forEach((rendererKey) => {
        if (merged[rendererKey]) return;
        const fallbackId = getDefaultSpecialTemplateIdByRenderer(rendererKey);
        if (!fallbackId) return;
        merged[rendererKey] = fallbackId;
    });

    return merged;
}

export function repairActiveBeautifyTemplateSettings() {
    const result = {
        genericUpdated: false,
        specialUpdated: false,
        genericActiveTemplateId: '',
        specialActiveTemplateIds: {},
    };

    const rawGenericId = getGenericActiveTemplateIdRaw();
    const validGenericId = ensureValidGenericActiveTemplateId(rawGenericId);
    const nextGenericId = validGenericId || getDefaultGenericTemplateId();
    result.genericActiveTemplateId = nextGenericId;

    if (rawGenericId !== nextGenericId) {
        saveBeautifyTemplateSettingAndInvalidate(BEAUTIFY_ACTIVE_TEMPLATE_ID_SETTING_KEY_GENERIC, nextGenericId);
        result.genericUpdated = true;
    }

    const rawSpecialMap = getSpecialActiveTemplateIdsRaw();
    const nextSpecialMap = getActiveBeautifyTemplateIdsForSpecial({
        withFallback: true,
        persist: false,
    });
    result.specialActiveTemplateIds = nextSpecialMap;

    if (!areSpecialActiveTemplateIdsEqual(rawSpecialMap, nextSpecialMap)) {
        saveBeautifyTemplateSettingAndInvalidate(BEAUTIFY_ACTIVE_TEMPLATE_IDS_SETTING_KEY_SPECIAL, nextSpecialMap);
        result.specialUpdated = true;
    }

    return result;
}

export function setActiveBeautifyTemplateIdByType(templateType, templateId) {
    const safeType = normalizeTemplateType(templateType, '');
    const safeTemplateId = sanitizeId(templateId, '');
    if (!safeType || !safeTemplateId) {
        return { success: false, message: '模板类型或模板 ID 无效' };
    }

    const template = getTemplateById(safeTemplateId);
    if (!template || template.enabled === false) {
        return { success: false, message: '模板不存在或未启用' };
    }

    if (template.templateType !== safeType) {
        return { success: false, message: '模板类型不匹配' };
    }

    if (safeType === PHONE_TEMPLATE_TYPE_GENERIC) {
        if (template?.render?.rendererKey !== 'generic_table') {
            return { success: false, message: '通用模板渲染器无效' };
        }

        saveBeautifyTemplateSettingAndInvalidate(BEAUTIFY_ACTIVE_TEMPLATE_ID_SETTING_KEY_GENERIC, safeTemplateId);
        return {
            success: true,
            templateId: safeTemplateId,
            message: '通用模板已启用',
        };
    }

    if (safeType === PHONE_TEMPLATE_TYPE_SPECIAL) {
        const rendererKey = normalizeString(template?.render?.rendererKey, 48);
        if (!SPECIAL_RENDERER_KEYS.has(rendererKey)) {
            return { success: false, message: '专属模板渲染器无效' };
        }

        const currentMap = getActiveBeautifyTemplateIdsForSpecial({ withFallback: false, persist: false });
        const nextMap = {
            ...currentMap,
            [rendererKey]: safeTemplateId,
        };

        saveBeautifyTemplateSettingAndInvalidate(BEAUTIFY_ACTIVE_TEMPLATE_IDS_SETTING_KEY_SPECIAL, nextMap);
        return {
            success: true,
            rendererKey,
            templateId: safeTemplateId,
            message: '专属模板已启用',
        };
    }

    return { success: false, message: '模板类型无效' };
}

export function getBeautifyTemplateSourceModeRuntime(templateType, options = {}) {
    return getCachedBeautifyTemplateSourceRuntime(
        buildSourceRuntimeCacheKey(templateType, options),
        () => {
            const mode = getBeautifyTemplateSourceMode(templateType);
            const templates = getPhoneBeautifyTemplatesByType(templateType, {
                includeBuiltin: true,
                includeUser: true,
                enabledOnly: options.enabledOnly === true,
            });

            const safeType = normalizeTemplateType(templateType, '');

            if (safeType === PHONE_TEMPLATE_TYPE_SPECIAL) {
                const activeMap = getActiveBeautifyTemplateIdsForSpecial({
                    withFallback: true,
                    persist: false,
                });
                const selected = templates.filter((t) => {
                    const rendererKey = normalizeString(t?.render?.rendererKey, 48);
                    if (!SPECIAL_RENDERER_KEYS.has(rendererKey)) return false;
                    return sanitizeId(activeMap[rendererKey], '') === t.id;
                });

                if (selected.length > 0) {
                    return {
                        preferredMode: mode,
                        effectiveMode: 'active_template',
                        fallbackApplied: false,
                        hasUserTemplates: templates.some(t => t?.source !== 'builtin'),
                        templates: selected,
                    };
                }
            }

            if (safeType === PHONE_TEMPLATE_TYPE_GENERIC) {
                const activeTemplateId = getActiveBeautifyTemplateIdByType(PHONE_TEMPLATE_TYPE_GENERIC, {
                    withFallback: true,
                    persist: false,
                });

                const selected = activeTemplateId
                    ? templates.filter(t => t.id === activeTemplateId && t?.render?.rendererKey === 'generic_table')
                    : [];

                if (selected.length > 0) {
                    return {
                        preferredMode: mode,
                        effectiveMode: 'active_template',
                        fallbackApplied: false,
                        hasUserTemplates: templates.some(t => t?.source !== 'builtin'),
                        templates: selected,
                    };
                }
            }

            const filtered = getEffectiveTemplatesBySourceMode(templates, mode);
            return {
                preferredMode: mode,
                effectiveMode: filtered.mode,
                fallbackApplied: filtered.fallbackApplied,
                hasUserTemplates: templates.some(t => t?.source !== 'builtin'),
                templates: filtered.templates,
            };
        },
    );
}

export function getBuiltinPhoneBeautifyTemplates() {
    return getCachedBuiltinPhoneBeautifyTemplates();
}

export function getPhoneBeautifyTemplateStore() {
    return getCachedPhoneBeautifyTemplateStore();
}

export function getAllPhoneBeautifyTemplates(options = {}) {
    return getCachedAllPhoneBeautifyTemplates(options);
}

export function getPhoneBeautifyTemplatesByType(templateType, options = {}) {
    return getCachedPhoneBeautifyTemplatesByType(templateType, options);
}

export function validatePhoneBeautifyTemplate(rawTemplate) {
    const errors = [];
    const warnings = [];

    const normalized = normalizeTemplate(rawTemplate, {
        sourceFallback: 'user',
    });

    if (!normalized) {
        errors.push('模板不是有效对象');
        return { ok: false, errors, warnings, template: null };
    }

    if (!normalized.id) {
        errors.push('模板缺少 id');
    }

    if (!normalized.name) {
        errors.push('模板缺少 name');
    }

    if (!ALLOWED_TEMPLATE_TYPES.has(normalized.templateType)) {
        errors.push(`不支持的 templateType：${normalized.templateType}`);
    }

    if (!ALLOWED_RENDERER_KEYS.has(normalized.render?.rendererKey)) {
        errors.push(`不支持的 rendererKey：${normalized.render?.rendererKey || ''}`);
    }

    if (normalized.templateType === PHONE_TEMPLATE_TYPE_SPECIAL) {
        const rendererKey = normalizeString(normalized.render?.rendererKey, 48);
        if (!SPECIAL_RENDERER_KEYS.has(rendererKey)) {
            errors.push('专属模板的 rendererKey 必须是 special_message');
        }
    }

    if ((normalized.matcher?.requiredHeaders || []).length === 0
        && (normalized.matcher?.tableNameExact || []).length === 0
        && (normalized.matcher?.tableNameIncludes || []).length === 0) {
        warnings.push('模板未配置明显匹配特征，可能无法稳定识别');
    }

    return {
        ok: errors.length === 0,
        errors,
        warnings,
        template: normalized,
    };
}

export function savePhoneBeautifyUserTemplate(rawTemplate, options = {}) {
    const overwrite = options.overwrite !== false;

    const validated = validatePhoneBeautifyTemplate(rawTemplate);
    if (!validated.ok || !validated.template) {
        return {
            success: false,
            warnings: validated.warnings || [],
            errors: validated.errors?.length > 0 ? validated.errors : ['模板校验失败'],
            message: validated.errors?.[0] || '模板校验失败',
            template: null,
        };
    }

    const template = deepClone(validated.template);
    template.source = 'user';
    template.readOnly = false;
    template.exportable = true;
    template.enabled = template.enabled !== false;
    template.meta = normalizeTemplateMeta(template.meta);
    template.meta.updatedAt = nowTs();

    const store = getCachedPhoneBeautifyTemplateStore();
    const userTemplates = deepClone(store.templates || []);
    const userMap = new Map(userTemplates.map((t, idx) => [t.id, idx]));
    const builtinIds = new Set(getBuiltinPhoneBeautifyTemplates().map(t => t.id));
    const usedIds = new Set([
        ...builtinIds,
        ...userTemplates.map(t => t.id),
    ]);

    const warnings = [];

    if (builtinIds.has(template.id)) {
        const nextId = ensureUniqueTemplateId(`user.edited.${template.id}`, usedIds);
        warnings.push(`内置模板 ID 不可直接覆盖，已自动转存为 ${nextId}`);
        template.id = nextId;
    }

    let replaced = false;

    if (userMap.has(template.id)) {
        if (overwrite) {
            const idx = Number(userMap.get(template.id));
            if (Number.isInteger(idx) && idx >= 0) {
                userTemplates[idx] = template;
                replaced = true;
            } else {
                userTemplates.push(template);
            }
        } else {
            const nextId = ensureUniqueTemplateId(template.id, usedIds);
            warnings.push(`模板 ID 冲突，已自动改为 ${nextId}`);
            template.id = nextId;
            userTemplates.push(template);
        }
    } else {
        if (usedIds.has(template.id)) {
            template.id = ensureUniqueTemplateId(template.id, usedIds);
        } else {
            usedIds.add(template.id);
        }
        userTemplates.push(template);
    }

    saveTemplateStore({
        ...store,
        templates: userTemplates,
    });
    invalidatePhoneBeautifyTemplateCache();

    return {
        success: true,
        warnings,
        errors: [],
        replaced,
        template: deepClone(template),
        message: replaced ? '模板已覆盖保存' : '模板已保存为用户模板',
    };
}

export function deletePhoneBeautifyUserTemplate(templateId) {
    const safeId = sanitizeId(templateId, '');
    if (!safeId) {
        return { success: false, message: '模板 ID 无效' };
    }

    const store = getCachedPhoneBeautifyTemplateStore();
    const removedTemplate = store.templates.find((template) => template.id === safeId) || null;
    if (!removedTemplate) {
        return { success: false, message: '未找到可删除的用户模板' };
    }

    const nextTemplates = store.templates.filter((template) => template.id !== safeId);
    const nextBindings = { ...store.bindings };
    Object.entries(nextBindings).forEach(([sheetKey, bindTemplateId]) => {
        if (bindTemplateId === safeId) {
            delete nextBindings[sheetKey];
        }
    });

    saveTemplateStore({
        ...store,
        templates: nextTemplates,
        bindings: nextBindings,
    });
    invalidatePhoneBeautifyTemplateCache();

    const activeCleanup = cleanupActiveSettingsForDeletedTemplate(removedTemplate);

    return {
        success: true,
        message: '模板已删除',
        templateId: safeId,
        templateType: normalizeTemplateType(removedTemplate?.templateType, ''),
        rendererKey: normalizeString(removedTemplate?.render?.rendererKey, 48),
        activeSettingsUpdated: activeCleanup.activeSettingsUpdated,
        genericActiveTemplateId: activeCleanup.genericActiveTemplateId,
        specialActiveTemplateIds: activeCleanup.specialActiveTemplateIds,
    };
}
