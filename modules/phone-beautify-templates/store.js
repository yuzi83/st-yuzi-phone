import { getPhoneSettings, savePhoneSetting } from '../settings.js';
import { PHONE_BEAUTIFY_STORE_KEY, PHONE_BEAUTIFY_TEMPLATE_SCHEMA_VERSION } from './constants.js';
import { BUILTIN_TEMPLATES } from './defaults.js';
import { normalizeTemplate } from './normalize.js';
import {
    deepClone,
    normalizeString,
    nowTs,
    sanitizeId,
    unwrapAnnotatedValue,
} from './core.js';

function getBuiltinTemplateMap() {
    const map = new Map();
    BUILTIN_TEMPLATES.forEach((template) => {
        map.set(template.id, deepClone(template));
    });
    return map;
}

function normalizeBindings(rawBindings, validTemplateIdSet) {
    const source = unwrapAnnotatedValue(rawBindings);
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
        return {};
    }

    const bindings = {};

    Object.entries(source).forEach(([sheetKey, templateId]) => {
        const safeSheetKey = normalizeString(sheetKey, 80);
        if (!safeSheetKey) return;

        const safeTemplateId = sanitizeId(templateId, '');
        if (!safeTemplateId) return;

        if (validTemplateIdSet && !validTemplateIdSet.has(safeTemplateId)) return;
        bindings[safeSheetKey] = safeTemplateId;
    });

    return bindings;
}

function normalizeTemplateStore(rawStore) {
    const source = unwrapAnnotatedValue(rawStore);
    const src = source && typeof source === 'object' ? source : {};
    const builtinMap = getBuiltinTemplateMap();

    const userTemplates = [];
    const userIdSet = new Set();

    if (Array.isArray(src.templates)) {
        src.templates.forEach((rawTemplate, idx) => {
            const normalized = normalizeTemplate(rawTemplate, {
                sourceFallback: 'user',
                idFallback: `user.template.${idx + 1}.${nowTs().toString(36)}`,
            });
            if (!normalized) return;

            if (builtinMap.has(normalized.id)) {
                normalized.id = sanitizeId(`${normalized.id}.user`, `user.template.${idx + 1}`);
            }

            if (!normalized.id || userIdSet.has(normalized.id)) return;

            normalized.source = 'user';
            normalized.readOnly = false;
            normalized.enabled = normalized.enabled !== false;

            userIdSet.add(normalized.id);
            userTemplates.push(normalized);
        });
    }

    const validTemplateIdSet = new Set([...builtinMap.keys(), ...userIdSet]);

    const updatedAt = Number(unwrapAnnotatedValue(src.updatedAt));

    return {
        schemaVersion: PHONE_BEAUTIFY_TEMPLATE_SCHEMA_VERSION,
        updatedAt: Number.isFinite(updatedAt) ? updatedAt : nowTs(),
        templates: userTemplates,
        bindings: normalizeBindings(src.bindings, validTemplateIdSet),
    };
}

export function saveTemplateStore(nextStore) {
    const normalized = normalizeTemplateStore(nextStore);
    normalized.updatedAt = nowTs();
    savePhoneSetting(PHONE_BEAUTIFY_STORE_KEY, normalized);
    return normalized;
}

export function readTemplateStore() {
    const raw = getPhoneSettings()?.[PHONE_BEAUTIFY_STORE_KEY];
    return normalizeTemplateStore(raw);
}
