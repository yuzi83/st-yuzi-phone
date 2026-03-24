import { Logger } from '../error-handler.js';

export function migrateLegacyPhoneSettingsWith(options = {}) {
    const {
        getContext,
        extensionName,
        defaultSettings,
        clone,
        validateSettings,
        showNotification,
    } = options;

    const ctx = typeof getContext === 'function' ? getContext() : null;
    if (!ctx?.extensionSettings) {
        Logger.warn('[玉子手机] 无法迁移设置：上下文不可用');
        return;
    }

    const current = ctx.extensionSettings[extensionName];
    if (current && typeof current === 'object' && Object.keys(current).length > 0) {
        Logger.info('[玉子手机] 设置已存在，跳过迁移');
        return;
    }

    try {
        const legacy = ctx.extensionSettings?.TamakoMarket?.phone;
        if (legacy && typeof legacy === 'object') {
            Logger.info('[玉子手机] 从 TamakoMarket.phone 迁移设置...');

            const migrated = {
                ...clone(defaultSettings),
                ...clone(legacy),
                __migratedFromTamako: true,
                __migratedAt: Date.now(),
            };

            ctx.extensionSettings[extensionName] = validateSettings(migrated);
            showNotification?.('设置已从旧版本迁移', 'success');
        } else {
            ctx.extensionSettings[extensionName] = clone(defaultSettings);
            Logger.info('[玉子手机] 创建新的默认设置');
        }

        if (typeof ctx.saveSettingsDebounced === 'function') {
            ctx.saveSettingsDebounced();
        }
    } catch (error) {
        Logger.error('[玉子手机] 迁移设置失败:', error);
        ctx.extensionSettings[extensionName] = clone(defaultSettings);
        showNotification?.('设置迁移失败，使用默认设置', 'warning');
    }
}
