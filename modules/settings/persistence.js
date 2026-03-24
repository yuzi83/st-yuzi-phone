import { Logger } from '../error-handler.js';

export function createSettingsPersistenceTools(options = {}) {
    const {
        getContext,
        ensureNamespace,
        validateSetting,
        defaultSettings,
        extensionName,
        clone,
        showNotification,
    } = options;

    const SAVE_SETTINGS_DEBOUNCE_CONFIG = {
        delay: 300,
        maxWait: 2000,
        leading: false,
        trailing: true,
    };

    let saveSettingsDebounceTimer = null;
    let saveSettingsMaxWaitTimer = null;
    let saveSettingsPendingCtx = null;

    function executeSaveSettings(ctx) {
        if (saveSettingsDebounceTimer !== null) {
            window.clearTimeout(saveSettingsDebounceTimer);
            saveSettingsDebounceTimer = null;
        }
        if (saveSettingsMaxWaitTimer !== null) {
            window.clearTimeout(saveSettingsMaxWaitTimer);
            saveSettingsMaxWaitTimer = null;
        }

        if (!ctx || typeof ctx.saveSettingsDebounced !== 'function') {
            Logger.warn('[玉子手机] 无法保存设置：上下文不可用');
            return;
        }

        try {
            ctx.saveSettingsDebounced();
            Logger.debug('[玉子手机] 设置已保存');
        } catch (error) {
            Logger.error('[玉子手机] 保存设置失败:', error);
            showNotification?.('保存设置失败', 'error');
        }
    }

    function schedulePersistSettings(ctx, delay = SAVE_SETTINGS_DEBOUNCE_CONFIG.delay) {
        if (!ctx || typeof ctx.saveSettingsDebounced !== 'function') {
            Logger.warn('[玉子手机] 无法保存设置：上下文不可用');
            return;
        }

        saveSettingsPendingCtx = ctx;

        if (saveSettingsDebounceTimer !== null) {
            window.clearTimeout(saveSettingsDebounceTimer);
        }

        saveSettingsDebounceTimer = window.setTimeout(() => {
            saveSettingsDebounceTimer = null;
            executeSaveSettings(saveSettingsPendingCtx);
        }, delay);

        if (saveSettingsMaxWaitTimer === null) {
            saveSettingsMaxWaitTimer = window.setTimeout(() => {
                saveSettingsMaxWaitTimer = null;
                if (saveSettingsPendingCtx) {
                    executeSaveSettings(saveSettingsPendingCtx);
                }
            }, SAVE_SETTINGS_DEBOUNCE_CONFIG.maxWait);
        }
    }

    function flushPhoneSettingsSave() {
        const ctx = typeof getContext === 'function' ? getContext() : null;
        if (!ctx || typeof ctx.saveSettingsDebounced !== 'function') {
            Logger.warn('[玉子手机] 无法立即保存设置：上下文不可用');
            return;
        }

        if (saveSettingsDebounceTimer !== null) {
            window.clearTimeout(saveSettingsDebounceTimer);
            saveSettingsDebounceTimer = null;
        }

        try {
            ctx.saveSettingsDebounced();
            Logger.info('[玉子手机] 设置已立即保存');
        } catch (error) {
            Logger.error('[玉子手机] 立即保存设置失败:', error);
            showNotification?.('保存设置失败', 'error');
        }
    }

    function savePhoneSetting(key, value) {
        try {
            const ctx = typeof getContext === 'function' ? getContext() : null;
            const settings = typeof ensureNamespace === 'function' ? ensureNamespace() : null;

            if (!ctx?.extensionSettings || !settings) {
                Logger.warn('[玉子手机] 无法保存设置：上下文或命名空间不可用');
                return false;
            }

            const result = validateSetting(key, value);
            if (!result.valid) {
                Logger.warn(`[玉子手机] 设置验证失败: ${result.error}`);
                showNotification?.(`设置验证失败: ${result.error}`, 'warning');
            }

            settings[key] = result.value;
            schedulePersistSettings(ctx);
            return true;
        } catch (error) {
            Logger.error('[玉子手机] 保存设置失败:', error);
            showNotification?.('保存设置失败', 'error');
            return false;
        }
    }

    function savePhoneSettingsPatch(patch = {}) {
        const ctx = typeof getContext === 'function' ? getContext() : null;
        const settings = typeof ensureNamespace === 'function' ? ensureNamespace() : null;
        if (!ctx?.extensionSettings || !settings) return;

        Object.assign(settings, patch);
        schedulePersistSettings(ctx);
    }

    function resetPhoneSettingsToDefault() {
        try {
            const ctx = typeof getContext === 'function' ? getContext() : null;
            if (!ctx?.extensionSettings) {
                Logger.warn('[玉子手机] 无法重置设置：上下文不可用');
                return false;
            }

            ctx.extensionSettings[extensionName] = clone(defaultSettings);
            schedulePersistSettings(ctx);
            return true;
        } catch (error) {
            Logger.error('[玉子手机] 重置设置失败:', error);
            showNotification?.('重置设置失败', 'error');
            return false;
        }
    }

    return {
        flushPhoneSettingsSave,
        savePhoneSetting,
        savePhoneSettingsPatch,
        resetPhoneSettingsToDefault,
    };
}
