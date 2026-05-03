export function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

function isAnnotatedValueWrapper(raw) {
    return !!raw
        && typeof raw === 'object'
        && !Array.isArray(raw)
        && Object.prototype.hasOwnProperty.call(raw, 'value');
}

export function unwrapAnnotatedValue(raw) {
    if (isAnnotatedValueWrapper(raw)) {
        return raw.value;
    }
    return raw;
}

const ANNOTATION_META_KEYS = new Set([
    '_comment',
    '_type',
    '_enum',
    '_range',
    '_example',
    '_risk',
    '_default',
]);

export function stripAnnotationStructure(raw) {
    const value = unwrapAnnotatedValue(raw);

    if (Array.isArray(value)) {
        return value.map(item => stripAnnotationStructure(item));
    }

    if (!value || typeof value !== 'object') {
        return value;
    }

    const result = {};
    Object.entries(value).forEach(([key, item]) => {
        const safeKey = String(key || '');
        if (safeKey.startsWith('_') && ANNOTATION_META_KEYS.has(safeKey)) return;
        result[key] = stripAnnotationStructure(item);
    });

    return result;
}

export function toAnnotatedValue(rawValue, comment = '') {
    if (isAnnotatedValueWrapper(rawValue)) {
        return rawValue;
    }

    return {
        value: deepClone(rawValue),
        _comment: normalizeString(comment, 240),
    };
}

export function clampNumber(value, min, max, fallback) {
    const n = Number(unwrapAnnotatedValue(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
}

export function nowTs() {
    return Date.now();
}

export function normalizeString(value, maxLength = 120) {
    return String(unwrapAnnotatedValue(value) ?? '').trim().slice(0, maxLength);
}

export function sanitizeId(rawId, fallback = '') {
    const text = normalizeString(rawId, 120)
        .replace(/[^a-zA-Z0-9_.-]/g, '_')
        .replace(/_{2,}/g, '_');
    return text || fallback;
}

export function uniqueStringArray(raw, maxCount = 32, maxLength = 80) {
    const source = unwrapAnnotatedValue(raw);
    if (!Array.isArray(source)) return [];

    const result = [];
    const seen = new Set();

    source.forEach((item) => {
        if (result.length >= maxCount) return;
        const text = normalizeString(item, maxLength);
        if (!text || seen.has(text)) return;
        seen.add(text);
        result.push(text);
    });

    return result;
}

export function normalizeEnumValue(value, allowedValues, fallback) {
    const text = normalizeString(value, 48);
    if (!text) return fallback;
    return allowedValues.includes(text) ? text : fallback;
}

export function normalizeBooleanLike(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;

    const text = normalizeString(value, 16).toLowerCase();
    if (!text) return fallback;
    if (['1', 'true', 'yes', 'on', 'y'].includes(text)) return true;
    if (['0', 'false', 'no', 'off', 'n'].includes(text)) return false;
    return fallback;
}

export function normalizeStyleTokens(raw) {
    const source = unwrapAnnotatedValue(raw);
    if (!source || typeof source !== 'object' || Array.isArray(source)) return {};

    const tokens = {};
    Object.entries(source).forEach(([key, value]) => {
        if (String(key || '').startsWith('_')) return;

        const safeKey = normalizeString(key, 48).replace(/[^a-zA-Z0-9_-]/g, '');
        if (!safeKey) return;

        const textValue = normalizeString(value, 120);
        if (!textValue) return;

        const lower = textValue.toLowerCase();
        if (lower.includes('<') || lower.includes('>') || lower.includes('javascript:') || lower.includes('url(')) {
            return;
        }

        tokens[safeKey] = textValue;
    });

    return tokens;
}

export function normalizeFieldBindingCandidates(rawCandidates) {
    const unwrapped = unwrapAnnotatedValue(rawCandidates);
    const source = Array.isArray(unwrapped)
        ? unwrapped
        : (unwrapped === undefined || unwrapped === null ? [] : [unwrapped]);

    const result = [];
    const seen = new Set();

    source.forEach((item) => {
        const text = normalizeString(item, 80);
        if (!text) return;
        if (/[<>]/.test(text)) return;
        if (text.toLowerCase().includes('javascript:')) return;

        if (seen.has(text)) return;
        seen.add(text);
        result.push(text);
    });

    return result;
}
