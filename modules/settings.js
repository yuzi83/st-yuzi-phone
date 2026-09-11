// modules/settings.js
/**
 * Yuzi Phone - 设置与存储 facade
 * 增强版：类型安全、错误处理、验证机制
 */

import { Logger } from './error-handler.js';
import { showNotification } from './integration/toast-bridge.js';
import { getSettingsContext } from './settings/context.js';
import {
    extensionName,
    defaultSettings,
    REMOVED_SETTING_KEYS,
    PHONE_CONTAINER_SIZE_LIMITS,
    APPEARANCE_RESOURCE_POOL_DEFAULTS,
    APPEARANCE_FONT_LIBRARY_DEFAULTS,
    APPEARANCE_FONT_LIBRARY_LIMITS,
    IMAGE_GENERATION_DEFAULTS,
    IMAGE_GENERATION_LIMITS,
    cloneSettingsValue,
    validateSetting,
    validateSettings,
    normalizeAppearanceResourcePoolSettings,
    normalizeAppearanceFontLibrarySettings,
    normalizeWorldbookReadingSelectionSettings,
    normalizeWorldbookReadingBlockedKeywordsSettings,
    normalizeImageGenerationSettings,
    computeAppearanceFontHash,
    normalizeAppearanceFontFamilyName,
} from './settings/schema.js';
import { createSettingsRepository } from './settings/repository.js';
import { migrateLegacyPhoneSettingsWith } from './settings/migration.js';
import { createSettingsPersistenceTools } from './settings/persistence.js';
import { createAppearanceSettingsContext } from './settings/appearance-context.js';

class SettingsError extends Error {
    constructor(message, key, value) {
        super(message);
        this.name = 'SettingsError';
        this.key = key;
        this.value = value;
    }
}

const appearanceContext = createAppearanceSettingsContext({
    getHostContext: getSettingsContext,
    extensionName,
    onError: error => {
        Logger.error('[玉子手机] 外观资源或设置保存失败，原设置已保留:', error);
        showNotification('外观资源保存失败，原设置已保留。请检查浏览器存储空间后重试。', 'error');
    },
    onMissing: () => showNotification('本浏览器缺少部分外观资源，已显示默认外观。请重新导入美化包；原资源引用仍保留。', 'warning'),
});
export const PHONE_SETTINGS_UPDATED_EVENT = 'yuzi-phone-settings-updated';

function notifyPhoneSettingsUpdated(key = '') {
    try {
        globalThis.window?.dispatchEvent?.(new CustomEvent(PHONE_SETTINGS_UPDATED_EVENT, {
            detail: { key: String(key ?? '') },
        }));
    } catch {
        // 设置持久化成功不依赖外观订阅者；无 DOM 的测试/运行环境安全降级。
    }
}

export function subscribePhoneSettingsUpdates(listener) {
    if (typeof listener !== 'function' || !globalThis.window?.addEventListener) return () => {};
    const handle = event => listener(event?.detail || {});
    globalThis.window.addEventListener(PHONE_SETTINGS_UPDATED_EVENT, handle);
    return () => globalThis.window?.removeEventListener?.(PHONE_SETTINGS_UPDATED_EVENT, handle);
}

const getContext = appearanceContext.getContext;
export const initializePhoneSettings = appearanceContext.initialize;
export const waitForPhoneSettingsSave = appearanceContext.whenSaved;

const clone = cloneSettingsValue;

const settingsRepository = createSettingsRepository({
    getContext,
    extensionName,
    defaultSettings,
    clone,
    validateSettings,
});

const ensureNamespace = settingsRepository.ensureNamespace;

export function migrateLegacyPhoneSettings() {
    return migrateLegacyPhoneSettingsWith({
        getContext,
        extensionName,
        defaultSettings,
        removedSettingKeys: REMOVED_SETTING_KEYS,
        clone,
        validateSettings,
        showNotification,
    });
}

export function getPhoneSettings() {
    try {
        const settings = ensureNamespace();
        return settings || clone(defaultSettings);
    } catch (error) {
        Logger.error('[玉子手机] 获取设置失败:', error);
        return clone(defaultSettings);
    }
}

const persistenceTools = createSettingsPersistenceTools({
    getContext,
    ensureNamespace,
    onSettingChanged(key) {
        appearanceContext.markChanged(key);
        notifyPhoneSettingsUpdated(key);
    },
    validateSetting,
    defaultSettings,
    extensionName,
    clone,
    showNotification,
});

export const flushPhoneSettingsSave = persistenceTools.flushPhoneSettingsSave;
export const savePhoneSetting = persistenceTools.savePhoneSetting;
export const savePhoneSettingsPatch = persistenceTools.savePhoneSettingsPatch;
export const resetPhoneSettingsToDefault = persistenceTools.resetPhoneSettingsToDefault;

export {
    isMobileDevice,
    getDefaultPhoneTogglePosition,
    constrainPosition,
} from './settings/layout.js';

export {
    extensionName,
    defaultSettings,
    PHONE_CONTAINER_SIZE_LIMITS,
    APPEARANCE_RESOURCE_POOL_DEFAULTS,
    APPEARANCE_FONT_LIBRARY_DEFAULTS,
    APPEARANCE_FONT_LIBRARY_LIMITS,
    IMAGE_GENERATION_DEFAULTS,
    IMAGE_GENERATION_LIMITS,
    normalizeAppearanceResourcePoolSettings,
    normalizeAppearanceFontLibrarySettings,
    normalizeWorldbookReadingSelectionSettings,
    normalizeWorldbookReadingBlockedKeywordsSettings,
    normalizeImageGenerationSettings,
    computeAppearanceFontHash,
    normalizeAppearanceFontFamilyName,
};

export { SettingsError };
