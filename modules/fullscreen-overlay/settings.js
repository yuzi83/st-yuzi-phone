export const FULLSCREEN_OVERLAY_SETTING_KEY = 'fullscreenOverlay';
export const SCROLLING_BARRAGE_MODEL_ID = 'scrolling-barrage';

const DEFAULT_OVERLAY_COLOR = '#FFFFFF';
const MAX_OVERLAY_PALETTE_SIZE = 16;
const OVERLAY_HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/i;

export const FULLSCREEN_OVERLAY_DEFAULTS = Object.freeze({
    enabled: false,
    sourceEnabledBySheetKey: Object.freeze({}),
    sourceOrder: Object.freeze([]),
    sourceModelBySheetKey: Object.freeze({}),
    models: Object.freeze({
        [SCROLLING_BARRAGE_MODEL_ID]: Object.freeze({
            maxConcurrent: 3,
            intervalMs: 1600,
            durationMs: 8000,
            fontSizePx: 14,
            opacity: 0.86,
            eternalEnabled: false,
            palette: Object.freeze(['#FFFFFF']),
        }),
    }),
});

function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneDefaults() {
    const barrageDefaults = FULLSCREEN_OVERLAY_DEFAULTS.models[SCROLLING_BARRAGE_MODEL_ID];
    return {
        enabled: FULLSCREEN_OVERLAY_DEFAULTS.enabled,
        sourceEnabledBySheetKey: {},
        sourceOrder: [],
        sourceModelBySheetKey: {},
        models: {
            [SCROLLING_BARRAGE_MODEL_ID]: {
                ...barrageDefaults,
                palette: [...barrageDefaults.palette],
            },
        },
    };
}

function normalizeBooleanMap(value) {
    if (!isRecord(value)) return {};
    const normalized = {};
    for (const [rawKey, rawEnabled] of Object.entries(value)) {
        const sheetKey = String(rawKey).trim();
        if (!sheetKey || typeof rawEnabled !== 'boolean') continue;
        normalized[sheetKey] = rawEnabled;
    }
    return normalized;
}

function normalizeSourceOrder(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const normalized = [];
    for (const rawSheetKey of value) {
        if (typeof rawSheetKey !== 'string') continue;
        const sheetKey = rawSheetKey.trim();
        if (!sheetKey || seen.has(sheetKey)) continue;
        seen.add(sheetKey);
        normalized.push(sheetKey);
    }
    return normalized;
}

function normalizeStringMap(value) {
    if (!isRecord(value)) return {};
    const normalized = {};
    for (const [rawKey, rawValue] of Object.entries(value)) {
        if (typeof rawValue !== 'string') continue;
        const sheetKey = String(rawKey).trim();
        const modelId = rawValue.trim();
        if (!sheetKey || !modelId) continue;
        normalized[sheetKey] = modelId;
    }
    return normalized;
}

function normalizeBoundedNumber(value, { min, max, fallback, integer = false }) {
    if (
        value === null
        || value === undefined
        || typeof value === 'boolean'
        || (typeof value === 'string' && !value.trim())
    ) {
        return fallback;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    const normalized = integer ? Math.round(parsed) : parsed;
    return Math.max(min, Math.min(max, normalized));
}

function asOverlayHexColor(value) {
    if (typeof value !== 'string') return '';
    const normalized = value.trim().toUpperCase();
    return OVERLAY_HEX_COLOR_PATTERN.test(normalized) ? normalized : '';
}

export function normalizeOverlayHexColor(value, fallback) {
    return asOverlayHexColor(value)
        || asOverlayHexColor(fallback)
        || DEFAULT_OVERLAY_COLOR;
}

function normalizeOverlayPalette(value) {
    if (!Array.isArray(value)) return [DEFAULT_OVERLAY_COLOR];
    const normalized = [];
    for (const rawColor of value) {
        const color = asOverlayHexColor(rawColor);
        if (!color) continue;
        normalized.push(color);
        if (normalized.length >= MAX_OVERLAY_PALETTE_SIZE) break;
    }
    return normalized.length > 0 ? normalized : [DEFAULT_OVERLAY_COLOR];
}

function pickPaletteEntry(palette, randomFn) {
    const randomValue = Number(randomFn());
    const unit = Number.isFinite(randomValue)
        ? Math.max(0, Math.min(1 - Number.EPSILON, randomValue))
        : 0;
    return palette[Math.floor(unit * palette.length)];
}

export function pickOverlayPaletteColor(palette, previousColor, randomFn = Math.random) {
    const normalizedPalette = normalizeOverlayPalette(palette);
    const sample = typeof randomFn === 'function' ? randomFn : Math.random;
    const selected = pickPaletteEntry(normalizedPalette, sample);
    const previous = asOverlayHexColor(previousColor);
    if (!previous || selected !== previous) return selected;

    const alternatives = normalizedPalette.filter(color => color !== previous);
    return alternatives.length > 0
        ? pickPaletteEntry(alternatives, sample)
        : selected;
}

function normalizeScrollingBarrageModel(value) {
    const source = isRecord(value) ? value : {};
    const defaults = FULLSCREEN_OVERLAY_DEFAULTS.models[SCROLLING_BARRAGE_MODEL_ID];
    return {
        maxConcurrent: normalizeBoundedNumber(source.maxConcurrent, {
            min: 1,
            max: 6,
            fallback: defaults.maxConcurrent,
            integer: true,
        }),
        intervalMs: normalizeBoundedNumber(source.intervalMs, {
            min: 500,
            max: 10000,
            fallback: defaults.intervalMs,
            integer: true,
        }),
        durationMs: normalizeBoundedNumber(source.durationMs, {
            min: 4000,
            max: 20000,
            fallback: defaults.durationMs,
            integer: true,
        }),
        fontSizePx: normalizeBoundedNumber(source.fontSizePx, {
            min: 12,
            max: 28,
            fallback: defaults.fontSizePx,
            integer: true,
        }),
        opacity: normalizeBoundedNumber(source.opacity, {
            min: 0.3,
            max: 1,
            fallback: defaults.opacity,
        }),
        eternalEnabled: source.eternalEnabled === true,
        palette: normalizeOverlayPalette(source.palette),
    };
}

export function normalizeFullscreenOverlaySettings(value) {
    if (!isRecord(value)) return cloneDefaults();
    const models = isRecord(value.models) ? value.models : {};
    return {
        enabled: value.enabled === true,
        sourceEnabledBySheetKey: normalizeBooleanMap(value.sourceEnabledBySheetKey),
        sourceOrder: normalizeSourceOrder(value.sourceOrder),
        sourceModelBySheetKey: normalizeStringMap(value.sourceModelBySheetKey),
        models: {
            [SCROLLING_BARRAGE_MODEL_ID]: normalizeScrollingBarrageModel(
                models[SCROLLING_BARRAGE_MODEL_ID],
            ),
        },
    };
}
