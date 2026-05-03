import { Logger } from '../error-handler.js';

let stContext = null;

export function getSillyTavernContext() {
    if (stContext) {
        return stContext;
    }

    try {
        if (typeof getContext !== 'undefined' && typeof getContext === 'function') {
            stContext = getContext();
            return stContext;
        }

        if (typeof window !== 'undefined') {
            if (typeof window.getContext === 'function') {
                stContext = window.getContext();
                return stContext;
            }

            if (window.SillyTavern && typeof window.SillyTavern.getContext === 'function') {
                stContext = window.SillyTavern.getContext();
                return stContext;
            }
        }

        return null;
    } catch (error) {
        Logger.debug('[玉子手机] 获取 SillyTavern 上下文失败:', error);
        return null;
    }
}

export function clearSillyTavernContextCache() {
    stContext = null;
}
