import { Logger } from '../error-handler.js';

export function createSettingsRepository(options = {}) {
    const {
        getContext,
        extensionName,
        defaultSettings,
        clone,
        validateSettings,
    } = options;

    function ensureNamespace() {
        const ctx = typeof getContext === 'function' ? getContext() : null;
        if (!ctx?.extensionSettings) {
            Logger.warn('[玉子手机] 扩展设置不可用');
            return null;
        }

        if (!ctx.extensionSettings[extensionName] || typeof ctx.extensionSettings[extensionName] !== 'object') {
            ctx.extensionSettings[extensionName] = clone(defaultSettings);
            Logger.info('[玉子手机] 创建新的设置命名空间');
        }

        const settings = ctx.extensionSettings[extensionName];

        try {
            const validated = validateSettings(settings);
            ctx.extensionSettings[extensionName] = validated;
            return validated;
        } catch (error) {
            Logger.error('[玉子手机] 设置验证失败，使用默认值:', error);
            ctx.extensionSettings[extensionName] = clone(defaultSettings);
            return ctx.extensionSettings[extensionName];
        }
    }

    return {
        ensureNamespace,
    };
}
