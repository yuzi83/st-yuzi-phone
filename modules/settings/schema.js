import { Logger } from '../error-handler.js';
import {
    normalizePhoneAiInstructionSegmentMainSlot,
} from '../phone-core/chat-support/ai-instruction-slots.js';

export const extensionName = 'YuziPhone';

export const PHONE_CONTAINER_SIZE_LIMITS = Object.freeze({
    width: Object.freeze({ min: 200, max: 800 }),
    height: Object.freeze({ min: 400, max: 1200 }),
});

export const PHONE_CHAT_NUMERIC_LIMITS = Object.freeze({
    storyContextTurns: Object.freeze({ min: 0, max: 20 }),
    maxHistoryMessages: Object.freeze({ min: 0, max: 500 }),
    maxReplyTokens: Object.freeze({ min: 64, max: 4096 }),
    requestTimeoutMs: Object.freeze({ min: 15000, max: 300000 }),
    worldbookMaxEntries: Object.freeze({ min: 0, max: 1000 }),
    worldbookMaxChars: Object.freeze({ min: 0, max: 200000 }),
});

export const PHONE_AI_MEDIA_MARKER_DEFAULTS = Object.freeze({
    imagePrefix: '[图片]',
    videoPrefix: '[视频]',
});

export const WORLDBOOK_SELECTION_DEFAULTS = Object.freeze({
    sourceMode: 'manual',
    selectedWorldbook: '',
    entries: Object.freeze({}),
});

export const APPEARANCE_RESOURCE_POOL_DEFAULTS = Object.freeze({
    wallpapers: Object.freeze([]),
    icons: Object.freeze([]),
});

export const APPEARANCE_FONT_LIBRARY_DEFAULTS = Object.freeze({
    activeFontId: 'builtin.system-ui',
    userFonts: Object.freeze([]),
});

const WORLDBOOK_SOURCE_MODES = new Set(['off', 'manual', 'character_bound']);
const AI_SEGMENT_ROLES = new Set(['system', 'user', 'assistant']);
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
    singleFontBytes: 6 * 1024 * 1024,
    totalFontBytes: 24 * 1024 * 1024,
    idLength: 96,
    nameLength: 120,
    familyLength: 120,
    hashLength: 160,
    mimeLength: 64,
    formatLength: 16,
    sourceLength: 48,
});

export const defaultSettings = {
    enabled: true,
    floatingToggleEnabled: true,
    notificationBubblesEnabled: false,
    phoneToggleX: null,
    phoneToggleY: null,
    phoneContainerX: null,
    phoneContainerY: null,
    phoneContainerWidth: 320,
    phoneContainerHeight: 640,
    backgroundImage: null,
    appIcons: {},
    hideTableCountBadge: false,
    homeAppLabelColorMode: 'white',
    hiddenTableApps: {},
    beautifyTemplateSourceModeSpecial: 'builtin',
    beautifyTemplateSourceModeGeneric: 'builtin',
    beautifyActiveTemplateIdsSpecial: {
        special_message: 'builtin.special.message.v1',
    },
    beautifyActiveTemplateIdGeneric: 'builtin.generic.table.v1',
    dockIconSize: 48,
    phoneToggleStyleSize: 44,
    phoneToggleStyleShape: 'rounded',
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
    phoneChat: {
        useStoryContext: true,
        storyContextTurns: 3,
        apiPresetName: '',
        maxHistoryMessages: 12,
        maxReplyTokens: 900,
        requestTimeoutMs: 90000,
        worldbookMaxEntries: 24,
        worldbookMaxChars: 6000,
    },
    phoneAiInstruction: {
        currentPresetName: '',
        lastOpenedPresetName: '',
        migratedLegacyTemplates: false,
        presets: [],
    },
    worldbookSelection: {
        sourceMode: 'manual',
        selectedWorldbook: '',
        entries: {},
    },
};

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
    notificationBubblesEnabled: { type: 'boolean' },
    hideTableCountBadge: { type: 'boolean' },
    homeAppLabelColorMode: { type: 'string', enum: ['white', 'black'] },
    backgroundImage: { type: 'string', nullable: true },
    phoneToggleCoverImage: { type: 'string', nullable: true },
    appIcons: { type: 'object' },
    hiddenTableApps: { type: 'object' },
    beautifyActiveTemplateIdsSpecial: { type: 'object' },
    appearanceResourcePool: { type: 'object' },
    appearanceFontLibrary: { type: 'object' },
    phoneReadableTextScalePercent: { min: 80, max: 160, type: 'number' },
    phoneChat: { type: 'object' },
    phoneAiInstruction: { type: 'object' },
    worldbookSelection: { type: 'object' },
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

function clampInteger(value, fallback, limits = {}) {
    const fallbackValue = Number.isFinite(Number(fallback)) ? Math.round(Number(fallback)) : 0;
    const min = Number.isFinite(Number(limits.min)) ? Number(limits.min) : Number.MIN_SAFE_INTEGER;
    const max = Number.isFinite(Number(limits.max)) ? Number(limits.max) : Number.MAX_SAFE_INTEGER;
    const next = Number(value);
    const normalized = Number.isFinite(next) ? Math.round(next) : fallbackValue;
    return Math.max(min, Math.min(max, normalized));
}

function normalizeString(value, fallback = '') {
    if (value === null || value === undefined) return fallback;
    return String(value).trim();
}

function normalizeBoolean(value, fallback = false) {
    if (value === true || value === false) return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return fallback;
}

function createSettingsValidationResult(key, value, valid = true, error = '') {
    return error
        ? { valid, value, error }
        : { valid, value };
}

export function normalizePhoneChatSettings(raw) {
    const src = isPlainObject(raw) ? raw : {};
    const defaults = defaultSettings.phoneChat;
    return {
        useStoryContext: normalizeBoolean(src.useStoryContext, defaults.useStoryContext),
        storyContextTurns: clampInteger(src.storyContextTurns, defaults.storyContextTurns, PHONE_CHAT_NUMERIC_LIMITS.storyContextTurns),
        apiPresetName: normalizeString(src.apiPresetName, defaults.apiPresetName),
        maxHistoryMessages: clampInteger(src.maxHistoryMessages, defaults.maxHistoryMessages, PHONE_CHAT_NUMERIC_LIMITS.maxHistoryMessages),
        maxReplyTokens: clampInteger(src.maxReplyTokens, defaults.maxReplyTokens, PHONE_CHAT_NUMERIC_LIMITS.maxReplyTokens),
        requestTimeoutMs: clampInteger(src.requestTimeoutMs, defaults.requestTimeoutMs, PHONE_CHAT_NUMERIC_LIMITS.requestTimeoutMs),
        worldbookMaxEntries: clampInteger(src.worldbookMaxEntries, defaults.worldbookMaxEntries, PHONE_CHAT_NUMERIC_LIMITS.worldbookMaxEntries),
        worldbookMaxChars: clampInteger(src.worldbookMaxChars, defaults.worldbookMaxChars, PHONE_CHAT_NUMERIC_LIMITS.worldbookMaxChars),
    };
}

export function normalizeWorldbookSelectionSettings(raw) {
    const src = isPlainObject(raw) ? raw : {};
    const sourceMode = normalizeString(src.sourceMode, WORLDBOOK_SELECTION_DEFAULTS.sourceMode);
    const entries = {};

    if (isPlainObject(src.entries)) {
        Object.entries(src.entries).forEach(([worldbookName, selectionMap]) => {
            const safeWorldbookName = normalizeString(worldbookName);
            if (!safeWorldbookName || !isPlainObject(selectionMap)) return;

            const normalizedMap = {};
            Object.entries(selectionMap).forEach(([uid, selected]) => {
                const uidKey = normalizeString(uid);
                if (!uidKey) return;
                if (selected === true || selected === false) {
                    normalizedMap[uidKey] = selected;
                }
            });

            if (Object.keys(normalizedMap).length > 0) {
                entries[safeWorldbookName] = normalizedMap;
            }
        });
    }

    return {
        sourceMode: WORLDBOOK_SOURCE_MODES.has(sourceMode) ? sourceMode : WORLDBOOK_SELECTION_DEFAULTS.sourceMode,
        selectedWorldbook: normalizeString(src.selectedWorldbook, WORLDBOOK_SELECTION_DEFAULTS.selectedWorldbook),
        entries,
    };
}

export function normalizePhoneAiInstructionMediaMarkers(raw) {
    const src = isPlainObject(raw) ? raw : {};
    return {
        imagePrefix: Object.prototype.hasOwnProperty.call(src, 'imagePrefix')
            ? normalizeString(src.imagePrefix)
            : PHONE_AI_MEDIA_MARKER_DEFAULTS.imagePrefix,
        videoPrefix: Object.prototype.hasOwnProperty.call(src, 'videoPrefix')
            ? normalizeString(src.videoPrefix)
            : PHONE_AI_MEDIA_MARKER_DEFAULTS.videoPrefix,
    };
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

export function normalizeAppearanceFontFamilyName(value, fallback = '') {
    const source = normalizeString(value, fallback)
        .replace(/[\u0000-\u001f\u007f"'\\;]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return source.slice(0, APPEARANCE_FONT_LIBRARY_LIMITS.familyLength) || fallback;
}

function normalizeAppearanceFontItem(item, index = 0) {
    const src = isPlainObject(item) ? item : {};
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

    return {
        id,
        name,
        family,
        mime,
        format,
        dataUrl: normalizedDataUrl,
        hash,
        bytes,
        source,
        createdAt,
    };
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

        const dedupeKey = normalizedItem.hash || normalizedItem.dataUrl;
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

function normalizePhoneAiInstructionSegment(segment, index = 0) {
    const src = isPlainObject(segment) ? segment : {};
    const role = normalizeString(src.role, 'system').toLowerCase();
    const fallbackId = `segment_${index + 1}`;
    return {
        id: normalizeString(src.id, fallbackId) || fallbackId,
        name: normalizeString(src.name, `片段 ${index + 1}`) || `片段 ${index + 1}`,
        role: AI_SEGMENT_ROLES.has(role) ? role : 'system',
        content: String(src.content ?? ''),
        deletable: src.deletable !== false,
        mainSlot: normalizePhoneAiInstructionSegmentMainSlot('', src),
    };
}

function normalizePhoneAiInstructionPreset(preset, index = 0) {
    const src = isPlainObject(preset) ? preset : {};
    const fallbackName = index === 0 ? '默认实时回复预设' : `AI 指令预设 ${index + 1}`;
    const promptSource = Array.isArray(src.promptGroup) && src.promptGroup.length > 0
        ? src.promptGroup
        : (Array.isArray(src.segments) && src.segments.length > 0 ? src.segments : []);
    return {
        id: normalizeString(src.id, `phone_ai_preset_${index + 1}`) || `phone_ai_preset_${index + 1}`,
        name: normalizeString(src.name, fallbackName) || fallbackName,
        description: normalizeString(src.description),
        scope: 'phone_message_reply',
        updatedAt: Number.isFinite(Number(src.updatedAt)) ? Math.round(Number(src.updatedAt)) : Date.now(),
        promptGroup: promptSource.map((segment, segmentIndex) => normalizePhoneAiInstructionSegment(segment, segmentIndex)),
        mediaMarkers: normalizePhoneAiInstructionMediaMarkers(src.mediaMarkers),
    };
}

export function normalizePhoneAiInstructionSettings(raw) {
    const src = isPlainObject(raw) ? raw : {};
    const presets = Array.isArray(src.presets) && src.presets.length > 0
        ? src.presets.map((preset, index) => normalizePhoneAiInstructionPreset(preset, index))
        : [];
    const presetNames = new Set(presets.map((preset) => preset.name));
    const currentPresetNameRaw = normalizeString(src.currentPresetName);
    const lastOpenedPresetNameRaw = normalizeString(src.lastOpenedPresetName);
    const fallbackPresetName = presets[0]?.name || '';
    const currentPresetName = presetNames.has(currentPresetNameRaw) ? currentPresetNameRaw : fallbackPresetName;
    const lastOpenedPresetName = presetNames.has(lastOpenedPresetNameRaw) ? lastOpenedPresetNameRaw : currentPresetName;

    return {
        currentPresetName,
        lastOpenedPresetName,
        migratedLegacyTemplates: src.migratedLegacyTemplates === true,
        presets,
    };
}

export function validateSetting(key, value) {
    const rule = validationRules[key];

    if (!rule) {
        return { valid: true, value };
    }

    if (value === null || value === undefined) {
        if (rule.nullable) {
            return { valid: true, value: null };
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
            return { valid: true, value: str };
        }

        case 'boolean':
            return { valid: true, value: Boolean(value) };

        case 'object': {
            if (!isPlainObject(value)) {
                return {
                    valid: false,
                    value: cloneSettingsValue(defaultSettings[key] || {}),
                    error: `${key} 必须是对象`,
                };
            }

            if (key === 'phoneChat') {
                return createSettingsValidationResult(key, normalizePhoneChatSettings(value));
            }
            if (key === 'phoneAiInstruction') {
                return createSettingsValidationResult(key, normalizePhoneAiInstructionSettings(value));
            }
            if (key === 'worldbookSelection') {
                return createSettingsValidationResult(key, normalizeWorldbookSelectionSettings(value));
            }
            if (key === 'appearanceResourcePool') {
                return createSettingsValidationResult(key, normalizeAppearanceResourcePoolSettings(value));
            }
            if (key === 'appearanceFontLibrary') {
                return createSettingsValidationResult(key, normalizeAppearanceFontLibrarySettings(value));
            }

            return { valid: true, value: cloneSettingsValue(value) };
        }

        default:
            return { valid: true, value };
    }
}

export function validateSettings(settings) {
    const validated = { ...defaultSettings };

    if (!settings || typeof settings !== 'object') {
        return validated;
    }

    for (const [key, value] of Object.entries(settings)) {
        const result = validateSetting(key, value);
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

    if (typeof settings.hiddenTableApps === 'object' && !Array.isArray(settings.hiddenTableApps)) {
        validated.hiddenTableApps = { ...settings.hiddenTableApps };
    }

    if (typeof settings.beautifyActiveTemplateIdsSpecial === 'object' && !Array.isArray(settings.beautifyActiveTemplateIdsSpecial)) {
        validated.beautifyActiveTemplateIdsSpecial = { ...settings.beautifyActiveTemplateIdsSpecial };
    }

    validated.appearanceResourcePool = normalizeAppearanceResourcePoolSettings(settings.appearanceResourcePool);
    validated.appearanceFontLibrary = normalizeAppearanceFontLibrarySettings(settings.appearanceFontLibrary);

    return validated;
}
