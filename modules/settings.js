// modules/settings.js
/**
 * Yuzi Phone - 设置与存储
 */

export const extensionName = 'YuziPhone';

export const defaultSettings = {
    enabled: true,
    phoneToggleX: null,
    phoneToggleY: null,
    phoneContainerX: null,
    phoneContainerY: null,
    phoneContainerWidth: 320,
    phoneContainerHeight: 640,
    backgroundImage: null,
    appIcons: {},
    hideTableCountBadge: false,
    hiddenTableApps: {},
    beautifyTemplateSourceModeSpecial: 'builtin',
    beautifyTemplateSourceModeGeneric: 'builtin',
    beautifyActiveTemplateIdsSpecial: {
        special_message: 'builtin.special.message.v1',
        special_moments: 'builtin.special.moments.v1',
        special_forum: 'builtin.special.forum.v1',
    },
    beautifyActiveTemplateIdGeneric: 'builtin.generic.table.v1',
    dockIconSize: 48,
    phoneToggleStyleSize: 44,
    phoneToggleStyleShape: 'rounded',
    phoneToggleCoverImage: null,
};

function getContext() {
    try {
        return SillyTavern?.getContext?.() || null;
    } catch {
        return null;
    }
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function ensureNamespace() {
    const ctx = getContext();
    if (!ctx?.extensionSettings) return null;

    if (!ctx.extensionSettings[extensionName] || typeof ctx.extensionSettings[extensionName] !== 'object') {
        ctx.extensionSettings[extensionName] = clone(defaultSettings);
    }

    const s = ctx.extensionSettings[extensionName];
    if (typeof s.appIcons !== 'object' || Array.isArray(s.appIcons) || !s.appIcons) s.appIcons = {};
    if (typeof s.hiddenTableApps !== 'object' || Array.isArray(s.hiddenTableApps) || !s.hiddenTableApps) s.hiddenTableApps = {};
    if (s.enabled === undefined) s.enabled = true;

    const toggleSize = Number(s.phoneToggleStyleSize);
    s.phoneToggleStyleSize = Number.isFinite(toggleSize)
        ? Math.max(32, Math.min(72, Math.round(toggleSize)))
        : defaultSettings.phoneToggleStyleSize;

    const shape = String(s.phoneToggleStyleShape || '').trim();
    s.phoneToggleStyleShape = (shape === 'circle' || shape === 'rounded')
        ? shape
        : defaultSettings.phoneToggleStyleShape;

    if (typeof s.phoneToggleCoverImage !== 'string' || !s.phoneToggleCoverImage.trim()) {
        s.phoneToggleCoverImage = null;
    }

    const dockIconSize = Number(s.dockIconSize);
    s.dockIconSize = Number.isFinite(dockIconSize)
        ? Math.max(32, Math.min(72, Math.round(dockIconSize)))
        : defaultSettings.dockIconSize;

    return s;
}

export function migrateLegacyPhoneSettings() {
    const ctx = getContext();
    if (!ctx?.extensionSettings) return;

    const current = ctx.extensionSettings[extensionName];
    if (current && typeof current === 'object' && Object.keys(current).length > 0) {
        return;
    }

    const legacy = ctx.extensionSettings?.TamakoMarket?.phone;
    if (legacy && typeof legacy === 'object') {
        ctx.extensionSettings[extensionName] = {
            ...clone(defaultSettings),
            ...clone(legacy),
            __migratedFromTamako: true,
        };
    } else {
        ctx.extensionSettings[extensionName] = clone(defaultSettings);
    }

    ctx.saveSettingsDebounced?.();
}

export function getPhoneSettings() {
    const settings = ensureNamespace();
    return settings || clone(defaultSettings);
}

let saveSettingsDebounceTimer = null;

function schedulePersistSettings(ctx) {
    if (!ctx || typeof ctx.saveSettingsDebounced !== 'function') return;

    if (saveSettingsDebounceTimer !== null) {
        window.clearTimeout(saveSettingsDebounceTimer);
    }

    saveSettingsDebounceTimer = window.setTimeout(() => {
        saveSettingsDebounceTimer = null;
        try {
            ctx.saveSettingsDebounced?.();
        } catch (e) {
            console.warn('[玉子手机] saveSettingsDebounced 调用失败:', e);
        }
    }, 120);
}

export function flushPhoneSettingsSave() {
    const ctx = getContext();
    if (!ctx || typeof ctx.saveSettingsDebounced !== 'function') return;

    if (saveSettingsDebounceTimer !== null) {
        window.clearTimeout(saveSettingsDebounceTimer);
        saveSettingsDebounceTimer = null;
    }

    try {
        ctx.saveSettingsDebounced?.();
    } catch (e) {
        console.warn('[玉子手机] flush saveSettingsDebounced 调用失败:', e);
    }
}

export function savePhoneSetting(key, value) {
    const ctx = getContext();
    const settings = ensureNamespace();
    if (!ctx?.extensionSettings || !settings) return;

    settings[key] = value;
    schedulePersistSettings(ctx);
}

export function savePhoneSettingsPatch(patch = {}) {
    const ctx = getContext();
    const settings = ensureNamespace();
    if (!ctx?.extensionSettings || !settings) return;

    Object.assign(settings, patch);
    schedulePersistSettings(ctx);
}

export function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
        || window.innerWidth <= 768
        || ('ontouchstart' in window);
}

export function getDefaultPhoneTogglePosition() {
    const isMobile = isMobileDevice();
    return isMobile
        ? { x: Math.max(10, window.innerWidth - 130), y: Math.max(10, window.innerHeight - 220) }
        : { x: Math.max(10, window.innerWidth - 330), y: 60 };
}

export function constrainPosition(x, y, width, height) {
    return {
        x: Math.max(0, Math.min(x, Math.max(0, window.innerWidth - width))),
        y: Math.max(0, Math.min(y, Math.max(0, window.innerHeight - height))),
    };
}
