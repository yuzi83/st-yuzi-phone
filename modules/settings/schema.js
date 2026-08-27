import { Logger } from '../error-handler.js';
import { normalizeTableContentReplacementSettings } from '../table-content-replacement/config.js';

export const extensionName = 'YuziPhone';

export const PHONE_CONTAINER_SIZE_LIMITS = Object.freeze({
    width: Object.freeze({ min: 200, max: 800 }),
    height: Object.freeze({ min: 400, max: 1200 }),
});

export const APPEARANCE_RESOURCE_POOL_DEFAULTS = Object.freeze({
    wallpapers: Object.freeze([]),
    icons: Object.freeze([]),
});

export const APPEARANCE_FONT_LIBRARY_DEFAULTS = Object.freeze({
    activeFontId: 'builtin.system-ui',
    userFonts: Object.freeze([]),
});

export const WORLDBOOK_READING_BLOCKED_KEYWORDS_DEFAULTS = Object.freeze([
    '规则',
    '思维链',
    'cot',
    '变量',
    '状态',
    'Status',
    'Rule',
    'rule',
    '检定',
    '判断',
    '叙事',
    '文风',
    'InitVar',
    '格式',
]);

export const IMAGE_GENERATION_LIMITS = Object.freeze({
    timeoutMs: Object.freeze({ min: 10_000, max: 1_800_000 }),
    roleMappings: 32,
    promptColumns: 64,
    mappingIdLength: 96,
    sheetKeyLength: 160,
    tableNameLength: 160,
    headerLength: 160,
    columnIndex: 4095,
});

export const IMAGE_GENERATION_DEFAULTS = Object.freeze({
    enabled: false,
    timeoutMs: 300_000,
    roleMappings: Object.freeze([]),
    promptTranslationEnabled: false,
    promptTranslationApiPresetId: '',
    promptTranslationPresetId: '',
});

const APPEARANCE_RESOURCE_IMAGE_MIME_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/svg+xml',
]);
const APPEARANCE_FONT_MIME_BY_FORMAT = Object.freeze({
    woff2: 'font/woff2',
    woff: 'font/woff',
    ttf: 'font/ttf',
    otf: 'font/otf',
});
const APPEARANCE_FONT_MIME_ALIASES = Object.freeze({
    'application/font-woff': 'font/woff',
    'application/x-font-woff': 'font/woff',
    'application/font-woff2': 'font/woff2',
    'application/x-font-woff2': 'font/woff2',
    'application/x-font-ttf': 'font/ttf',
    'application/x-font-truetype': 'font/ttf',
    'font/truetype': 'font/ttf',
    'application/x-font-otf': 'font/otf',
    'font/opentype': 'font/otf',
});
const APPEARANCE_FONT_BUILTIN_IDS = new Set([
    'builtin.system-ui',
    'builtin.modern-sans',
    'builtin.chill-round',
    'builtin.basic-sans',
]);
const APPEARANCE_RESOURCE_POOL_LIMITS = Object.freeze({
    wallpapers: 48,
    icons: 512,
    idLength: 96,
    nameLength: 120,
    hashLength: 160,
    mimeLength: 64,
    sourceLength: 48,
});
export const APPEARANCE_FONT_LIBRARY_LIMITS = Object.freeze({
    userFonts: 12,
    singleFontBytes: 15 * 1024 * 1024,
    totalFontBytes: 30 * 1024 * 1024,
    idLength: 96,
    nameLength: 120,
    familyLength: 120,
    hashLength: 160,
    mimeLength: 64,
    urlLength: 2048,
    formatLength: 16,
    sourceLength: 48,
});

export const defaultSettings = {
    enabled: true,
    floatingToggleEnabled: true,
    phoneToggleX: null,
    phoneToggleY: null,
    phoneContainerX: null,
    phoneContainerY: null,
    phoneContainerWidth: 280,
    phoneContainerHeight: 596,
    backgroundImage: null,
    appIcons: {},
    appIconOrigins: {},
    appGridColumns: 4,
    appIconSize: 64,
    appIconRadius: 14,
    appGridGap: 20.667,
    hideTableCountBadge: false,
    homeAppLabelColorMode: 'white',
    phoneThemeMode: 'light',
    hiddenTableApps: {},
    beautifyTemplateSourceModeGeneric: 'builtin',
    beautifyActiveTemplateIdGeneric: 'builtin.generic.table.v1',
    dockIconSize: 64,
    phoneToggleStyleSize: 40,
    phoneToggleStyleShape: 'circle',
    appearanceActivePackId: '',
    phoneToggleCoverImage: null,
    appearanceResourcePool: {
        wallpapers: [],
        icons: [],
    },
    appearanceFontLibrary: {
        activeFontId: 'builtin.system-ui',
        userFonts: [],
    },
    phoneReadableTextScalePercent: 100,
    worldbookReadingSelection: {},
    worldbookReadingBlockedKeywords: [...WORLDBOOK_READING_BLOCKED_KEYWORDS_DEFAULTS],
    imageGeneration: {
        enabled: IMAGE_GENERATION_DEFAULTS.enabled,
        timeoutMs: IMAGE_GENERATION_DEFAULTS.timeoutMs,
        roleMappings: [],
        promptTranslationEnabled: IMAGE_GENERATION_DEFAULTS.promptTranslationEnabled,
        promptTranslationApiPresetId: IMAGE_GENERATION_DEFAULTS.promptTranslationApiPresetId,
        promptTranslationPresetId: IMAGE_GENERATION_DEFAULTS.promptTranslationPresetId,
    },
    tableContentReplacement: normalizeTableContentReplacementSettings(null),
};

export const REMOVED_SETTING_KEYS = new Set([
    'notificationBubblesEnabled',
    'dbConfigPresets',
    'activeDbConfigPreset',
    'phoneChat',
    'phoneAiInstruction',
    'worldbookSelection',
    'beautifyTemplateSourceModeSpecial',
    'beautifyActiveTemplateIdsSpecial',
]);

const validationRules = {
    phoneContainerWidth: { ...PHONE_CONTAINER_SIZE_LIMITS.width, type: 'number' },
    phoneContainerHeight: { ...PHONE_CONTAINER_SIZE_LIMITS.height, type: 'number' },
    phoneToggleX: { min: 0, max: 10000, type: 'number', nullable: true },
    phoneToggleY: { min: 0, max: 10000, type: 'number', nullable: true },
    phoneContainerX: { min: 0, max: 10000, type: 'number', nullable: true },
    phoneContainerY: { min: 0, max: 10000, type: 'number', nullable: true },
    dockIconSize: { min: 32, max: 72, type: 'number' },
    phoneToggleStyleSize: { min: 32, max: 72, type: 'number' },
    phoneToggleStyleShape: { enum: ['circle', 'rounded'], type: 'string' },
    enabled: { type: 'boolean' },
    floatingToggleEnabled: { type: 'boolean' },
    hideTableCountBadge: { type: 'boolean' },
    homeAppLabelColorMode: { type: 'string', enum: ['white', 'black'] },
    phoneThemeMode: { type: 'string', enum: ['light', 'dark'] },
    backgroundImage: { type: 'string', nullable: true },
    phoneToggleCoverImage: { type: 'string', nullable: true },
    appearanceActivePackId: { type: 'string', maxLength: 160 },
    appIcons: { type: 'object' },
    appIconOrigins: { type: 'object' },
    hiddenTableApps: { type: 'object' },
    appearanceResourcePool: { type: 'object' },
    appearanceFontLibrary: { type: 'object' },
    phoneReadableTextScalePercent: { min: 80, max: 160, type: 'number' },
    worldbookReadingSelection: { type: 'object' },
    worldbookReadingBlockedKeywords: { type: 'array' },
    imageGeneration: { type: 'object' },
    tableContentReplacement: { type: 'object' },
};

export function cloneSettingsValue(value) {
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (error) {
        Logger.error('[玉子手机] 克隆对象失败:', error);
        return value;
    }
}

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value, fallback = '') {
    if (value === null || value === undefined) return fallback;
    return String(value).trim();
}

function isSafeRecordKey(value) {
    return value !== '__proto__' && value !== 'constructor' && value !== 'prototype';
}

function normalizeImageGenerationBoolean(value, fallback) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const normalized = normalizeString(value).toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0' || normalized === '') return false;
    return fallback;
}

function normalizeImageGenerationText(value, maxLength) {
    return normalizeString(value).slice(0, maxLength);
}

function normalizeImageGenerationColumn(raw, { allowUnselected = false } = {}) {
    const source = isPlainObject(raw) ? raw : {};
    const numericIndex = Number(source.columnIndex);
    const columnIndex = Number.isInteger(numericIndex)
        && numericIndex >= 0
        && numericIndex <= IMAGE_GENERATION_LIMITS.columnIndex
        ? numericIndex
        : -1;
    if (columnIndex < 0 && !allowUnselected) return null;
    return {
        columnIndex,
        headerSnapshot: normalizeImageGenerationText(
            source.headerSnapshot,
            IMAGE_GENERATION_LIMITS.headerLength,
        ),
    };
}

function normalizeImageGenerationPromptColumns(raw) {
    if (!Array.isArray(raw)) return [];
    const normalized = [];
    const usedColumnIndexes = new Set();

    for (const item of raw) {
        if (normalized.length >= IMAGE_GENERATION_LIMITS.promptColumns) break;
        const column = normalizeImageGenerationColumn(item);
        if (!column || usedColumnIndexes.has(column.columnIndex)) continue;
        usedColumnIndexes.add(column.columnIndex);
        normalized.push(column);
    }

    return normalized;
}

function normalizeImageGenerationRoleMappings(raw) {
    if (!Array.isArray(raw)) return [];
    const normalized = [];
    const usedMappingIds = new Set();

    for (const item of raw) {
        if (normalized.length >= IMAGE_GENERATION_LIMITS.roleMappings) break;
        if (!isPlainObject(item)) continue;
        const mappingId = normalizeImageGenerationText(
            item.mappingId,
            IMAGE_GENERATION_LIMITS.mappingIdLength,
        );
        if (!mappingId || usedMappingIds.has(mappingId)) continue;
        usedMappingIds.add(mappingId);
        normalized.push({
            mappingId,
            sheetKey: normalizeImageGenerationText(
                item.sheetKey,
                IMAGE_GENERATION_LIMITS.sheetKeyLength,
            ),
            tableNameSnapshot: normalizeImageGenerationText(
                item.tableNameSnapshot,
                IMAGE_GENERATION_LIMITS.tableNameLength,
            ),
            nameColumn: normalizeImageGenerationColumn(
                item.nameColumn,
                { allowUnselected: true },
            ),
            promptColumns: normalizeImageGenerationPromptColumns(item.promptColumns),
        });
    }

    return normalized;
}

export function normalizeImageGenerationSettings(raw) {
    const source = isPlainObject(raw) ? raw : {};
    const timeout = Number(source.timeoutMs);
    const timeoutMs = Number.isFinite(timeout)
        ? Math.max(
            IMAGE_GENERATION_LIMITS.timeoutMs.min,
            Math.min(IMAGE_GENERATION_LIMITS.timeoutMs.max, Math.round(timeout)),
        )
        : IMAGE_GENERATION_DEFAULTS.timeoutMs;

    return {
        enabled: normalizeImageGenerationBoolean(source.enabled, IMAGE_GENERATION_DEFAULTS.enabled),
        timeoutMs,
        roleMappings: normalizeImageGenerationRoleMappings(source.roleMappings),
        promptTranslationEnabled: normalizeImageGenerationBoolean(
            source.promptTranslationEnabled,
            IMAGE_GENERATION_DEFAULTS.promptTranslationEnabled,
        ),
        promptTranslationApiPresetId: normalizeImageGenerationText(
            source.promptTranslationApiPresetId,
            256,
        ),
        promptTranslationPresetId: normalizeImageGenerationText(
            source.promptTranslationPresetId,
            256,
        ),
    };
}

export function normalizeWorldbookReadingSelectionSettings(raw) {
    if (!isPlainObject(raw)) return {};
    const normalized = {};

    Object.entries(raw).forEach(([rawBookName, rawEntries]) => {
        const bookName = normalizeString(rawBookName);
        if (!bookName || !isSafeRecordKey(bookName) || !isPlainObject(rawEntries)) return;
        const entries = {};

        Object.entries(rawEntries).forEach(([rawUid, selected]) => {
            const uid = normalizeString(rawUid);
            if (!uid || !isSafeRecordKey(uid) || selected !== false) return;
            entries[uid] = false;
        });

        if (Object.keys(entries).length > 0) {
            normalized[bookName] = entries;
        }
    });

    return normalized;
}

export function normalizeWorldbookReadingBlockedKeywordsSettings(raw) {
    const source = Array.isArray(raw)
        ? raw
        : WORLDBOOK_READING_BLOCKED_KEYWORDS_DEFAULTS;
    return [...new Set(source
        .map((keyword) => normalizeString(keyword))
        .filter(Boolean))];
}

export function normalizeAppIconOriginsSettings(raw) {
    if (!isPlainObject(raw)) return {};
    const normalized = {};

    Object.entries(raw).forEach(([rawKey, rawPackId]) => {
        const key = normalizeString(rawKey).slice(0, 160);
        const packId = normalizeString(rawPackId).slice(0, 160);
        if (!key || !packId || key === '__proto__' || key === 'constructor' || key === 'prototype') return;
        normalized[key] = packId;
    });

    return normalized;
}

function createSettingsValidationResult(key, value, valid = true, error = '') {
    return error
        ? { valid, value, error }
        : { valid, value };
}

function computeAppearanceResourceHash(dataUrl) {
    const source = String(dataUrl || '');
    if (!source) return '';
    let hash = 5381;
    for (let i = 0; i < source.length; i += 1) {
        hash = ((hash << 5) + hash) ^ source.charCodeAt(i);
        hash >>>= 0;
    }
    return `djb2:${hash.toString(16).padStart(8, '0')}:${source.length}`;
}

export function computeAppearanceFontHash(dataUrl) {
    return computeAppearanceResourceHash(dataUrl);
}

function extractDataUrlMime(dataUrl) {
    const match = String(dataUrl || '').trim().match(/^data:([^;,]+)[;,]/i);
    return match?.[1] ? String(match[1]).trim().toLowerCase() : '';
}

function normalizeAppearanceFontMime(rawMime, rawFormat = '') {
    const mime = normalizeString(rawMime).slice(0, APPEARANCE_FONT_LIBRARY_LIMITS.mimeLength).toLowerCase();
    const format = normalizeString(rawFormat).slice(0, APPEARANCE_FONT_LIBRARY_LIMITS.formatLength).toLowerCase();
    const aliasedMime = APPEARANCE_FONT_MIME_ALIASES[mime] || mime;
    if (Object.values(APPEARANCE_FONT_MIME_BY_FORMAT).includes(aliasedMime)) {
        return aliasedMime;
    }
    return APPEARANCE_FONT_MIME_BY_FORMAT[format] || '';
}

function normalizeAppearanceFontFormat(rawFormat, rawMime = '') {
    const format = normalizeString(rawFormat).slice(0, APPEARANCE_FONT_LIBRARY_LIMITS.formatLength).toLowerCase();
    if (APPEARANCE_FONT_MIME_BY_FORMAT[format]) return format;

    const mime = normalizeAppearanceFontMime(rawMime, format);
    const entry = Object.entries(APPEARANCE_FONT_MIME_BY_FORMAT).find(([, value]) => value === mime);
    return entry?.[0] || '';
}

function normalizeAppearanceFontCssUrl(value) {
    const source = normalizeString(value).slice(0, APPEARANCE_FONT_LIBRARY_LIMITS.urlLength).trim();
    if (!source) return '';

    try {
        const url = new URL(source);
        if (url.protocol !== 'https:') return '';
        return url.href.slice(0, APPEARANCE_FONT_LIBRARY_LIMITS.urlLength);
    } catch {
        return '';
    }
}

export function normalizeAppearanceFontFamilyName(value, fallback = '') {
    const source = normalizeString(value, fallback)
        .replace(/[\u0000-\u001f\u007f"'\\;]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return source.slice(0, APPEARANCE_FONT_LIBRARY_LIMITS.familyLength) || fallback;
}

function normalizeAppearanceFontSourceType(value, { hasDataUrl = false, hasCssUrl = false } = {}) {
    const sourceType = normalizeString(value).trim().toLowerCase();
    if (sourceType === 'data-url' || sourceType === 'css-url') return sourceType;
    if (hasDataUrl) return 'data-url';
    if (hasCssUrl) return 'css-url';
    return '';
}

function normalizeAppearanceDataUrlFontItem(src, index = 0) {
    const rawDataUrl = typeof src.dataUrl === 'string' ? src.dataUrl.trim() : '';
    const format = normalizeAppearanceFontFormat(src.format, src.mime || extractDataUrlMime(rawDataUrl));
    const mime = normalizeAppearanceFontMime(src.mime || extractDataUrlMime(rawDataUrl), format);

    if (!rawDataUrl || !format || !mime || !rawDataUrl.startsWith('data:')) {
        return null;
    }

    const normalizedDataUrl = rawDataUrl.replace(/^data:([^;,]+)([;,])/i, `data:${mime}$2`);
    if (!normalizedDataUrl.startsWith(`data:${mime}`)) {
        return null;
    }

    const bytes = Number.isFinite(Number(src.bytes)) && Number(src.bytes) >= 0
        ? Math.round(Number(src.bytes))
        : 0;
    if (bytes > APPEARANCE_FONT_LIBRARY_LIMITS.singleFontBytes) {
        return null;
    }

    const hash = normalizeString(src.hash).slice(0, APPEARANCE_FONT_LIBRARY_LIMITS.hashLength)
        || computeAppearanceFontHash(normalizedDataUrl);
    const fallbackId = `user_font_${index + 1}`;
    const id = normalizeString(src.id, fallbackId).slice(0, APPEARANCE_FONT_LIBRARY_LIMITS.idLength) || fallbackId;
    const name = normalizeString(src.name, id).slice(0, APPEARANCE_FONT_LIBRARY_LIMITS.nameLength) || id;
    const fallbackFamily = `YuziPhoneUserFont_${hash.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const family = normalizeAppearanceFontFamilyName(src.family, fallbackFamily);
    const source = normalizeString(src.source || 'user').slice(0, APPEARANCE_FONT_LIBRARY_LIMITS.sourceLength) || 'user';
    const createdAt = Number.isFinite(Number(src.createdAt)) ? Math.round(Number(src.createdAt)) : Date.now();

    return { id, name, family, mime, format, dataUrl: normalizedDataUrl, hash, bytes, source, sourceType: 'data-url', createdAt };
}

function normalizeAppearanceCssUrlFontItem(src, index = 0) {
    const cssUrl = normalizeAppearanceFontCssUrl(src.cssUrl);
    const family = normalizeAppearanceFontFamilyName(src.family);
    if (!cssUrl || !family) {
        return null;
    }

    const hash = normalizeString(src.hash).slice(0, APPEARANCE_FONT_LIBRARY_LIMITS.hashLength)
        || computeAppearanceFontHash(`${cssUrl}#${family}`);
    const fallbackId = `user_font_${index + 1}`;
    const id = normalizeString(src.id, fallbackId).slice(0, APPEARANCE_FONT_LIBRARY_LIMITS.idLength) || fallbackId;
    const name = normalizeString(src.name, family).slice(0, APPEARANCE_FONT_LIBRARY_LIMITS.nameLength) || family;
    const source = normalizeString(src.source || 'user').slice(0, APPEARANCE_FONT_LIBRARY_LIMITS.sourceLength) || 'user';
    const createdAt = Number.isFinite(Number(src.createdAt)) ? Math.round(Number(src.createdAt)) : Date.now();

    return { id, name, family, format: 'css', cssUrl, hash, bytes: 0, source, sourceType: 'css-url', createdAt };
}

function normalizeAppearanceFontItem(item, index = 0) {
    const src = isPlainObject(item) ? item : {};
    const hasDataUrl = typeof src.dataUrl === 'string' && src.dataUrl.trim().startsWith('data:');
    const hasCssUrl = typeof src.cssUrl === 'string' && src.cssUrl.trim().length > 0;
    const sourceType = normalizeAppearanceFontSourceType(src.sourceType, { hasDataUrl, hasCssUrl });

    if (sourceType === 'css-url') {
        return normalizeAppearanceCssUrlFontItem(src, index);
    }
    if (sourceType === 'data-url') {
        return normalizeAppearanceDataUrlFontItem(src, index);
    }
    return null;
}

function normalizeAppearanceFontList(rawList) {
    if (!Array.isArray(rawList)) return [];
    const usedIds = new Set();
    const usedHashes = new Set();
    const normalized = [];
    let totalBytes = 0;

    rawList.slice(0, APPEARANCE_FONT_LIBRARY_LIMITS.userFonts * 2).forEach((item, index) => {
        if (normalized.length >= APPEARANCE_FONT_LIBRARY_LIMITS.userFonts) return;
        const normalizedItem = normalizeAppearanceFontItem(item, index);
        if (!normalizedItem) return;

        const dedupeKey = normalizedItem.hash || normalizedItem.cssUrl || normalizedItem.dataUrl;
        if (dedupeKey && usedHashes.has(dedupeKey)) return;
        if (totalBytes + normalizedItem.bytes > APPEARANCE_FONT_LIBRARY_LIMITS.totalFontBytes) return;
        if (usedIds.has(normalizedItem.id)) {
            normalizedItem.id = `${normalizedItem.id}_${index + 1}`.slice(0, APPEARANCE_FONT_LIBRARY_LIMITS.idLength);
        }

        usedIds.add(normalizedItem.id);
        if (dedupeKey) usedHashes.add(dedupeKey);
        totalBytes += normalizedItem.bytes;
        normalized.push(normalizedItem);
    });

    return normalized;
}

export function normalizeAppearanceFontLibrarySettings(raw) {
    const src = isPlainObject(raw) ? raw : {};
    const userFonts = normalizeAppearanceFontList(src.userFonts);
    const fontIds = new Set([
        ...APPEARANCE_FONT_BUILTIN_IDS,
        ...userFonts.map((font) => font.id),
    ]);
    const rawActiveFontId = normalizeString(src.activeFontId, APPEARANCE_FONT_LIBRARY_DEFAULTS.activeFontId);
    const activeFontId = fontIds.has(rawActiveFontId)
        ? rawActiveFontId
        : APPEARANCE_FONT_LIBRARY_DEFAULTS.activeFontId;

    return {
        activeFontId,
        userFonts,
    };
}

function normalizeAppearanceResourceImageItem(item, index = 0, kind = 'resource') {
    const src = isPlainObject(item) ? item : {};
    const rawDataUrl = typeof src.dataUrl === 'string' ? src.dataUrl.trim() : '';
    const mimeMatch = rawDataUrl.match(/^data:([^;,]+)[;,]/i);
    const mime = normalizeString(src.mime || mimeMatch?.[1]).slice(0, APPEARANCE_RESOURCE_POOL_LIMITS.mimeLength).toLowerCase();
    const normalizedDataUrl = rawDataUrl.replace(/^data:([^;,]+)([;,])/i, `data:${mime}$2`);

    if (!normalizedDataUrl || !mime || !APPEARANCE_RESOURCE_IMAGE_MIME_TYPES.has(mime) || !normalizedDataUrl.startsWith(`data:${mime}`)) {
        return null;
    }

    const fallbackId = `${kind}_${index + 1}`;
    const id = normalizeString(src.id, fallbackId).slice(0, APPEARANCE_RESOURCE_POOL_LIMITS.idLength) || fallbackId;
    const name = normalizeString(src.name, id).slice(0, APPEARANCE_RESOURCE_POOL_LIMITS.nameLength) || id;
    const hash = normalizeString(src.hash).slice(0, APPEARANCE_RESOURCE_POOL_LIMITS.hashLength)
        || computeAppearanceResourceHash(normalizedDataUrl);
    const source = normalizeString(src.source || 'user').slice(0, APPEARANCE_RESOURCE_POOL_LIMITS.sourceLength) || 'user';
    const bytes = Number.isFinite(Number(src.bytes)) && Number(src.bytes) >= 0
        ? Math.round(Number(src.bytes))
        : 0;
    const width = Number.isFinite(Number(src.width)) && Number(src.width) > 0
        ? Math.round(Number(src.width))
        : 0;
    const height = Number.isFinite(Number(src.height)) && Number(src.height) > 0
        ? Math.round(Number(src.height))
        : 0;

    return {
        id,
        name,
        mime,
        dataUrl: normalizedDataUrl,
        hash,
        bytes,
        width,
        height,
        source,
    };
}

function normalizeAppearanceResourceImageList(rawList, kind, limit) {
    if (!Array.isArray(rawList)) return [];
    const usedIds = new Set();
    const usedHashes = new Set();
    const normalized = [];

    rawList.slice(0, limit * 2).forEach((item, index) => {
        if (normalized.length >= limit) return;
        const normalizedItem = normalizeAppearanceResourceImageItem(item, index, kind);
        if (!normalizedItem) return;

        const dedupeKey = normalizedItem.hash || normalizedItem.dataUrl;
        if (dedupeKey && usedHashes.has(dedupeKey)) return;
        if (usedIds.has(normalizedItem.id)) {
            normalizedItem.id = `${normalizedItem.id}_${index + 1}`.slice(0, APPEARANCE_RESOURCE_POOL_LIMITS.idLength);
        }
        usedIds.add(normalizedItem.id);
        if (dedupeKey) usedHashes.add(dedupeKey);
        normalized.push(normalizedItem);
    });

    return normalized;
}

export function normalizeAppearanceResourcePoolSettings(raw) {
    const src = isPlainObject(raw) ? raw : {};
    return {
        wallpapers: normalizeAppearanceResourceImageList(src.wallpapers, 'wallpaper', APPEARANCE_RESOURCE_POOL_LIMITS.wallpapers),
        icons: normalizeAppearanceResourceImageList(src.icons, 'icon', APPEARANCE_RESOURCE_POOL_LIMITS.icons),
    };
}

export function validateSetting(key, value) {
    if (REMOVED_SETTING_KEYS.has(key)) {
        return { valid: true, value: undefined, removed: true };
    }

    const rule = validationRules[key];

    if (!rule) {
        return { valid: true, value };
    }

    if (value === null || value === undefined) {
        if (rule.nullable) {
            return { valid: true, value: null };
        }
        if (key === 'imageGeneration') {
            return createSettingsValidationResult(key, normalizeImageGenerationSettings(value));
        }
        return { valid: true, value: defaultSettings[key] };
    }

    switch (rule.type) {
        case 'number': {
            const num = Number(value);
            if (!Number.isFinite(num)) {
                return {
                    valid: false,
                    value: defaultSettings[key],
                    error: `${key} 必须是有效数字`,
                };
            }
            const min = rule.min ?? -Infinity;
            const max = rule.max ?? Infinity;
            const clamped = Math.max(min, Math.min(max, Math.round(num)));
            return { valid: true, value: clamped };
        }

        case 'string': {
            const str = String(value).trim();
            if (rule.enum && !rule.enum.includes(str)) {
                return {
                    valid: false,
                    value: defaultSettings[key],
                    error: `${key} 必须是 ${rule.enum.join(' | ')} 之一`,
                };
            }
            const maxLength = Number.isFinite(Number(rule.maxLength)) ? Math.max(0, Math.floor(Number(rule.maxLength))) : 0;
            if (maxLength > 0 && str.length > maxLength) {
                return { valid: true, value: str.slice(0, maxLength) };
            }
            return { valid: true, value: str };
        }

        case 'boolean':
            return { valid: true, value: Boolean(value) };

        case 'array':
            return { valid: true, value: normalizeWorldbookReadingBlockedKeywordsSettings(value) };

        case 'object': {
            if (!isPlainObject(value)) {
                return {
                    valid: false,
                    value: cloneSettingsValue(defaultSettings[key] || {}),
                    error: `${key} 必须是对象`,
                };
            }

            if (key === 'appearanceResourcePool') {
                return createSettingsValidationResult(key, normalizeAppearanceResourcePoolSettings(value));
            }
            if (key === 'appearanceFontLibrary') {
                return createSettingsValidationResult(key, normalizeAppearanceFontLibrarySettings(value));
            }
            if (key === 'appIconOrigins') {
                return createSettingsValidationResult(key, normalizeAppIconOriginsSettings(value));
            }
            if (key === 'worldbookReadingSelection') {
                return createSettingsValidationResult(key, normalizeWorldbookReadingSelectionSettings(value));
            }
            if (key === 'imageGeneration') {
                return createSettingsValidationResult(key, normalizeImageGenerationSettings(value));
            }
            if (key === 'tableContentReplacement') {
                return createSettingsValidationResult(key, normalizeTableContentReplacementSettings(value));
            }

            return { valid: true, value: cloneSettingsValue(value) };
        }

        default:
            return { valid: true, value };
    }
}

export function validateSettings(settings) {
    const validated = {
        ...defaultSettings,
        imageGeneration: normalizeImageGenerationSettings(defaultSettings.imageGeneration),
        tableContentReplacement: normalizeTableContentReplacementSettings(defaultSettings.tableContentReplacement),
    };

    if (!settings || typeof settings !== 'object') {
        return validated;
    }

    for (const [key, value] of Object.entries(settings)) {
        const result = validateSetting(key, value);
        if (result.removed) {
            continue;
        }
        if (result.valid) {
            validated[key] = result.value;
        } else {
            Logger.warn(`[玉子手机] 设置验证失败: ${result.error}, 使用默认值`);
            validated[key] = result.value;
        }
    }

    if (typeof settings.appIcons === 'object' && !Array.isArray(settings.appIcons)) {
        validated.appIcons = { ...settings.appIcons };
    }

    validated.appIconOrigins = normalizeAppIconOriginsSettings(settings.appIconOrigins);

    if (typeof settings.hiddenTableApps === 'object' && !Array.isArray(settings.hiddenTableApps)) {
        validated.hiddenTableApps = { ...settings.hiddenTableApps };
    }

    validated.appearanceResourcePool = normalizeAppearanceResourcePoolSettings(settings.appearanceResourcePool);
    validated.appearanceFontLibrary = normalizeAppearanceFontLibrarySettings(settings.appearanceFontLibrary);
    validated.worldbookReadingSelection = normalizeWorldbookReadingSelectionSettings(settings.worldbookReadingSelection);
    validated.worldbookReadingBlockedKeywords = normalizeWorldbookReadingBlockedKeywordsSettings(
        settings.worldbookReadingBlockedKeywords,
    );
    validated.imageGeneration = normalizeImageGenerationSettings(settings.imageGeneration);
    validated.tableContentReplacement = normalizeTableContentReplacementSettings(settings.tableContentReplacement);

    return validated;
}
