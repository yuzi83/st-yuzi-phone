import { Logger } from '../error-handler.js';

export function getSettingsContext() {
    try {
        if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
            return SillyTavern.getContext();
        }

        if (typeof window !== 'undefined' && window.SillyTavern && window.SillyTavern.getContext) {
            return window.SillyTavern.getContext();
        }

        return null;
    } catch (error) {
        Logger.error('[玉子手机] 获取上下文失败:', error);
        return null;
    }
}
