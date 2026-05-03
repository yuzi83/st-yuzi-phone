import {
    DEFAULT_GENERIC_MIN_SCORE,
    DEFAULT_SPECIAL_MIN_SCORE,
    PHONE_TEMPLATE_TYPE_GENERIC,
    PHONE_TEMPLATE_TYPE_SPECIAL,
    RENDERER_KEY_TO_SPECIAL_TYPE,
} from './constants.js';
import {
    clampNumber,
    deepClone,
    normalizeString,
    sanitizeId,
} from './core.js';
import {
    inferSpecialRendererKeyByTableName,
    normalizeHeadersSet,
    scoreTemplateMatcher,
} from './matcher-helpers.js';
import { saveTemplateStore } from './store.js';
import {
    getCachedPhoneBeautifyTemplateById,
    getCachedPhoneBeautifyTemplateStore,
    invalidatePhoneBeautifyTemplateCache,
} from './cache.js';
import {
    getActiveBeautifyTemplateIdsForSpecial,
    getActiveBeautifyTemplateIdByType,
    getBeautifyTemplateSourceModeRuntime,
} from './repository.js';

function getTemplateById(templateId) {
    const safeId = sanitizeId(templateId, '');
    if (!safeId) return null;
    return getCachedPhoneBeautifyTemplateById(safeId, { includeDisabled: true });
}

export function detectSpecialTemplateForTable({ sheetKey, tableName, headers = [] } = /** @type {any} */ ({}) ) {
    const safeSheetKey = normalizeString(sheetKey, 80);
    if (!safeSheetKey) return null;

    const safeTableName = normalizeString(tableName, 80);
    const headerSet = normalizeHeadersSet(headers);

    const activeMap = getActiveBeautifyTemplateIdsForSpecial({
        withFallback: true,
        persist: false,
    });
    const sourceRuntime = getBeautifyTemplateSourceModeRuntime(PHONE_TEMPLATE_TYPE_SPECIAL, {
        enabledOnly: true,
    });
    const specialTemplates = sourceRuntime.templates;

    if (specialTemplates.length <= 0) return null;

    const templateMap = new Map(specialTemplates.map(t => [t.id, t]));
    const store = getCachedPhoneBeautifyTemplateStore();

    const boundTemplateId = sanitizeId(store.bindings?.[safeSheetKey], '');
    if (boundTemplateId) {
        const boundTemplate = getTemplateById(boundTemplateId);
        const specialType = RENDERER_KEY_TO_SPECIAL_TYPE[boundTemplate?.render?.rendererKey];
        if (boundTemplate?.enabled !== false
            && boundTemplate?.templateType === PHONE_TEMPLATE_TYPE_SPECIAL
            && specialType) {
            return {
                sheetKey: safeSheetKey,
                tableName: safeTableName,
                template: deepClone(boundTemplate),
                specialType,
                score: 999,
                reason: 'manual_binding',
            };
        }
    }

    const hintedRendererKey = inferSpecialRendererKeyByTableName(safeTableName);
    if (hintedRendererKey) {
        const activeTemplateId = sanitizeId(activeMap[hintedRendererKey], '');
        const activeTemplate = activeTemplateId ? templateMap.get(activeTemplateId) : null;
        const specialType = RENDERER_KEY_TO_SPECIAL_TYPE[activeTemplate?.render?.rendererKey];
        if (activeTemplate && specialType) {
            return {
                sheetKey: safeSheetKey,
                tableName: safeTableName,
                template: deepClone(activeTemplate),
                specialType,
                score: 999,
                reason: 'active_template',
                sourceMode: sourceRuntime.effectiveMode,
                sourceModePreferred: sourceRuntime.preferredMode,
                sourceModeFallbackApplied: sourceRuntime.fallbackApplied,
            };
        }
    }

    const scored = [];

    specialTemplates.forEach((template) => {
        const score = scoreTemplateMatcher(template.matcher, safeTableName, headerSet);
        const threshold = clampNumber(
            template.matcher?.minScore,
            0,
            100,
            DEFAULT_SPECIAL_MIN_SCORE,
        );

        if (score < threshold) return;

        const specialType = RENDERER_KEY_TO_SPECIAL_TYPE[template.render?.rendererKey];
        if (!specialType) return;

        scored.push({
            template,
            score,
            threshold,
            sourcePriority: template.source === 'user' ? 2 : 1,
            updatedAt: Number(template.meta?.updatedAt || 0),
            specialType,
        });
    });

    if (scored.length <= 0) return null;

    scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.sourcePriority !== a.sourcePriority) return b.sourcePriority - a.sourcePriority;
        return b.updatedAt - a.updatedAt;
    });

    const best = scored[0];
    return {
        sheetKey: safeSheetKey,
        tableName: safeTableName,
        template: deepClone(best.template),
        specialType: best.specialType,
        score: best.score,
        threshold: best.threshold,
        reason: sourceRuntime.fallbackApplied ? 'matcher_builtin_fallback' : 'matcher',
        sourceMode: sourceRuntime.effectiveMode,
        sourceModePreferred: sourceRuntime.preferredMode,
        sourceModeFallbackApplied: sourceRuntime.fallbackApplied,
    };
}

export function detectGenericTemplateForTable({ sheetKey, tableName, headers = [] } = /** @type {any} */ ({}) ) {
    const safeSheetKey = normalizeString(sheetKey, 80);
    if (!safeSheetKey) return null;

    const safeTableName = normalizeString(tableName, 80);
    const headerSet = normalizeHeadersSet(headers);

    const activeTemplateId = getActiveBeautifyTemplateIdByType(PHONE_TEMPLATE_TYPE_GENERIC, {
        withFallback: true,
        persist: false,
    });
    const sourceRuntime = getBeautifyTemplateSourceModeRuntime(PHONE_TEMPLATE_TYPE_GENERIC, {
        enabledOnly: true,
    });
    const genericTemplates = sourceRuntime.templates;

    if (genericTemplates.length <= 0) return null;

    const templateMap = new Map(genericTemplates.map(t => [t.id, t]));
    const store = getCachedPhoneBeautifyTemplateStore();

    const boundTemplateId = sanitizeId(store.bindings?.[safeSheetKey], '');
    if (boundTemplateId) {
        const boundTemplate = getTemplateById(boundTemplateId);
        if (boundTemplate?.enabled !== false
            && boundTemplate?.templateType === PHONE_TEMPLATE_TYPE_GENERIC
            && boundTemplate?.render?.rendererKey === 'generic_table') {
            return {
                sheetKey: safeSheetKey,
                tableName: safeTableName,
                template: deepClone(boundTemplate),
                score: 999,
                reason: 'manual_binding',
            };
        }
    }

    if (activeTemplateId && templateMap.has(activeTemplateId)) {
        const activeTemplate = templateMap.get(activeTemplateId);
        if (activeTemplate?.render?.rendererKey === 'generic_table') {
            return {
                sheetKey: safeSheetKey,
                tableName: safeTableName,
                template: deepClone(activeTemplate),
                score: 999,
                threshold: 0,
                reason: 'active_template',
                sourceMode: sourceRuntime.effectiveMode,
                sourceModePreferred: sourceRuntime.preferredMode,
                sourceModeFallbackApplied: sourceRuntime.fallbackApplied,
            };
        }
    }

    const scored = [];

    genericTemplates.forEach((template) => {
        if (template?.render?.rendererKey !== 'generic_table') return;

        const score = scoreTemplateMatcher(template.matcher, safeTableName, headerSet);
        const threshold = clampNumber(
            template.matcher?.minScore,
            0,
            100,
            DEFAULT_GENERIC_MIN_SCORE,
        );

        if (score < threshold) return;

        scored.push({
            template,
            score,
            threshold,
            sourcePriority: template.source === 'user' ? 2 : 1,
            updatedAt: Number(template.meta?.updatedAt || 0),
        });
    });

    if (scored.length <= 0) return null;

    scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.sourcePriority !== a.sourcePriority) return b.sourcePriority - a.sourcePriority;
        return b.updatedAt - a.updatedAt;
    });

    const best = scored[0];
    return {
        sheetKey: safeSheetKey,
        tableName: safeTableName,
        template: deepClone(best.template),
        score: best.score,
        threshold: best.threshold,
        reason: sourceRuntime.fallbackApplied ? 'matcher_builtin_fallback' : 'matcher',
        sourceMode: sourceRuntime.effectiveMode,
        sourceModePreferred: sourceRuntime.preferredMode,
        sourceModeFallbackApplied: sourceRuntime.fallbackApplied,
    };
}

export function bindSheetToBeautifyTemplate(sheetKey, templateId) {
    const safeSheetKey = normalizeString(sheetKey, 80);
    const safeTemplateId = sanitizeId(templateId, '');
    if (!safeSheetKey || !safeTemplateId) {
        return { success: false, message: '绑定参数无效' };
    }

    const template = getTemplateById(safeTemplateId);
    if (!template) {
        return { success: false, message: '模板不存在' };
    }

    const store = getCachedPhoneBeautifyTemplateStore();
    const nextBindings = {
        ...store.bindings,
        [safeSheetKey]: safeTemplateId,
    };

    saveTemplateStore({
        ...store,
        bindings: nextBindings,
    });
    invalidatePhoneBeautifyTemplateCache();

    return { success: true, message: '绑定已保存' };
}

export function clearSheetBeautifyBinding(sheetKey) {
    const safeSheetKey = normalizeString(sheetKey, 80);
    if (!safeSheetKey) {
        return { success: false, message: '表格标识无效' };
    }

    const store = getCachedPhoneBeautifyTemplateStore();
    if (!store.bindings[safeSheetKey]) {
        return { success: true, message: '当前无绑定' };
    }

    const nextBindings = { ...store.bindings };
    delete nextBindings[safeSheetKey];

    saveTemplateStore({
        ...store,
        bindings: nextBindings,
    });
    invalidatePhoneBeautifyTemplateCache();

    return { success: true, message: '绑定已清除' };
}
