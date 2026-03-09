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

export function savePhoneSetting(key, value) {
    const ctx = getContext();
    const settings = ensureNamespace();
    if (!ctx?.extensionSettings || !settings) return;

    settings[key] = value;
    ctx.saveSettingsDebounced?.();
}

export function savePhoneSettingsPatch(patch = {}) {
    const ctx = getContext();
    const settings = ensureNamespace();
    if (!ctx?.extensionSettings || !settings) return;

    Object.assign(settings, patch);
    ctx.saveSettingsDebounced?.();
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
