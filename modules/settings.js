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
    cloneSettingsValue,
    validateSetting,
    validateSettings,
} from './settings/schema.js';
import { createSettingsRepository } from './settings/repository.js';
import { migrateLegacyPhoneSettingsWith } from './settings/migration.js';
import { createSettingsPersistenceTools } from './settings/persistence.js';

class SettingsError extends Error {
    constructor(message, key, value) {
        super(message);
        this.name = 'SettingsError';
        this.key = key;
        this.value = value;
    }
}

function getContext() {
    return getSettingsContext();
}

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
};

export { SettingsError };
