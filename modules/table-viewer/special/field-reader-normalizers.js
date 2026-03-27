import {
    DEFAULT_SPECIAL_FIELD_BINDINGS_BY_TYPE,
    DEFAULT_SPECIAL_STYLE_OPTIONS_BY_TYPE,
    SPECIAL_STYLE_OPTION_BOOLEAN_KEYS,
    SPECIAL_STYLE_OPTION_ENUM_ALLOWED_VALUES,
    SPECIAL_STYLE_OPTION_NUMERIC_RULES,
    SPECIAL_STYLE_OPTION_TEXT_LIMITS,
} from './field-reader-config.js';

export function normalizeFieldBindingCandidatesForViewer(rawCandidates) {
    const source = Array.isArray(rawCandidates)
        ? rawCandidates
        : (rawCandidates === undefined || rawCandidates === null ? [] : [rawCandidates]);

    const result = [];
    const seen = new Set();

    source.forEach((item) => {
        const text = String(item ?? '').trim().slice(0, 80);
        if (!text) return;
        if (/[<>]/.test(text)) return;
        if (text.toLowerCase().includes('javascript:')) return;
        if (seen.has(text)) return;
        seen.add(text);
        result.push(text);
    });

    return result;
}

export function normalizeSpecialFieldBindingsForViewer(rawFieldBindings, type) {
    const defaults = DEFAULT_SPECIAL_FIELD_BINDINGS_BY_TYPE[type]
        || DEFAULT_SPECIAL_FIELD_BINDINGS_BY_TYPE.message
        || {};

    const src = rawFieldBindings && typeof rawFieldBindings === 'object' && !Array.isArray(rawFieldBindings)
        ? rawFieldBindings
        : {};

    const merged = {};
    const keys = new Set([...Object.keys(defaults), ...Object.keys(src)]);

    keys.forEach((fieldKey) => {
        const rawValue = Object.prototype.hasOwnProperty.call(src, fieldKey)
            ? src[fieldKey]
            : defaults[fieldKey];

        const normalized = normalizeFieldBindingCandidatesForViewer(rawValue);
        if (normalized.length > 0) {
            merged[fieldKey] = normalized;
        }
    });

    return merged;
}

export function normalizeViewerEnumOption(value, allowedValues, fallback) {
    const text = String(value ?? '').trim();
    if (!text) return fallback;
    return Array.isArray(allowedValues) && allowedValues.includes(text) ? text : fallback;
}

export function normalizeViewerBooleanOption(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;

    const text = String(value ?? '').trim().toLowerCase();
    if (!text) return fallback;

    if (['1', 'true', 'yes', 'on', 'y'].includes(text)) return true;
    if (['0', 'false', 'no', 'off', 'n'].includes(text)) return false;
    return fallback;
}

export function normalizeSpecialStyleOptionsForViewer(rawStyleOptions, type) {
    const defaults = DEFAULT_SPECIAL_STYLE_OPTIONS_BY_TYPE[type]
        || DEFAULT_SPECIAL_STYLE_OPTIONS_BY_TYPE.message
        || {};

    const src = rawStyleOptions && typeof rawStyleOptions === 'object' && !Array.isArray(rawStyleOptions)
        ? rawStyleOptions
        : {};

    const clampViewerNumber = (value, min, max, fallback) => {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.max(min, Math.min(max, Math.round(n)));
    };

    const normalizeText = (value, maxLength = 80) => String(value ?? '').trim().slice(0, maxLength);

    const merged = {};

    Object.keys(defaults).forEach((optionKey) => {
        const fallbackValue = defaults[optionKey];
        const rawValue = Object.prototype.hasOwnProperty.call(src, optionKey)
            ? src[optionKey]
            : fallbackValue;

        if (Object.prototype.hasOwnProperty.call(SPECIAL_STYLE_OPTION_ENUM_ALLOWED_VALUES, optionKey)) {
            const allowed = SPECIAL_STYLE_OPTION_ENUM_ALLOWED_VALUES[optionKey] || [];
            merged[optionKey] = normalizeViewerEnumOption(rawValue, allowed, String(fallbackValue || ''));
            return;
        }

        if (Object.prototype.hasOwnProperty.call(SPECIAL_STYLE_OPTION_NUMERIC_RULES, optionKey)) {
            const rule = SPECIAL_STYLE_OPTION_NUMERIC_RULES[optionKey] || {};
            const min = Number.isFinite(Number(rule.min)) ? Number(rule.min) : 0;
            const max = Number.isFinite(Number(rule.max)) ? Number(rule.max) : 999;
            const fallback = Number.isFinite(Number(fallbackValue)) ? Number(fallbackValue) : min;
            merged[optionKey] = clampViewerNumber(rawValue, min, max, fallback);
            return;
        }

        if (SPECIAL_STYLE_OPTION_BOOLEAN_KEYS.has(optionKey)) {
            merged[optionKey] = normalizeViewerBooleanOption(rawValue, !!fallbackValue);
            return;
        }

        const maxLength = Number.isFinite(Number(SPECIAL_STYLE_OPTION_TEXT_LIMITS[optionKey]))
            ? Number(SPECIAL_STYLE_OPTION_TEXT_LIMITS[optionKey])
            : 80;

        merged[optionKey] = normalizeText(rawValue, maxLength)
            || normalizeText(fallbackValue, maxLength);
    });

    return merged;
}
