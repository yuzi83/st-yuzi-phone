import { Logger } from '../error-handler.js';
import { getDB } from './db-bridge.js';
import { getPhoneCoreState } from './state.js';

export function registerTableUpdateListener(callback) {
    if (typeof callback !== 'function') {
        Logger.warn('[玉子手机] registerTableUpdateListener: 回调必须是函数');
        return false;
    }

    const api = getDB();
    if (!api || typeof api.registerTableUpdateCallback !== 'function') {
        Logger.warn('[玉子手机] 表格更新回调API不可用');
        return false;
    }

    unregisterTableUpdateListener();

    try {
        const state = getPhoneCoreState();
        state.registeredTableUpdateCallback = callback;
        api.registerTableUpdateCallback(callback);
        return true;
    } catch (error) {
        Logger.warn('[玉子手机] 注册表格更新回调失败:', error);
        getPhoneCoreState().registeredTableUpdateCallback = null;
        return false;
    }
}

export function unregisterTableUpdateListener() {
    const api = getDB();
    const state = getPhoneCoreState();
    if (!api || typeof api.unregisterTableUpdateCallback !== 'function') {
        state.registeredTableUpdateCallback = null;
        return;
    }

    if (state.registeredTableUpdateCallback) {
        try {
            api.unregisterTableUpdateCallback(state.registeredTableUpdateCallback);
        } catch (error) {
            Logger.warn('[玉子手机] 注销表格更新回调失败:', error);
        }
        state.registeredTableUpdateCallback = null;
    }
}

export function registerTableFillStartListener(callback) {
    if (typeof callback !== 'function') {
        Logger.warn('[玉子手机] registerTableFillStartListener: 回调必须是函数');
        return false;
    }

    const api = getDB();
    if (!api || typeof api.registerTableFillStartCallback !== 'function') {
        return false;
    }

    unregisterTableFillStartListener();

    try {
        const state = getPhoneCoreState();
        state.registeredTableFillStartCallback = callback;
        api.registerTableFillStartCallback(callback);
        return true;
    } catch (error) {
        Logger.warn('[玉子手机] 注册填表开始回调失败:', error);
        getPhoneCoreState().registeredTableFillStartCallback = null;
        return false;
    }
}

export function unregisterTableFillStartListener() {
    const api = getDB();
    const state = getPhoneCoreState();
    if (!api || typeof api.unregisterTableFillStartCallback !== 'function') {
        state.registeredTableFillStartCallback = null;
        return;
    }

    if (state.registeredTableFillStartCallback) {
        try {
            api.unregisterTableFillStartCallback(state.registeredTableFillStartCallback);
        } catch (error) {
            Logger.warn('[玉子手机] 注销填表开始回调失败:', error);
        }
        state.registeredTableFillStartCallback = null;
    }
}

export function setCurrentViewingSheet(sheetKey) {
    getPhoneCoreState().currentViewingSheetKey = sheetKey;
}

export function getCurrentViewingSheet() {
    return getPhoneCoreState().currentViewingSheetKey;
}

function computeDataVersion(data) {
    if (!data || typeof data !== 'object') return '';

    try {
        const jsonStr = JSON.stringify(data);
        let hash = 0;
        for (let i = 0; i < jsonStr.length; i++) {
            const char = jsonStr.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash &= hash;
        }
        return String(hash);
    } catch {
        return '';
    }
}

export function initSmartRefreshListener() {
    registerTableUpdateListener((newData) => {
        const state = getPhoneCoreState();
        if (!state.currentViewingSheetKey) return;

        const newVersion = computeDataVersion(newData);
        if (newVersion === state.lastDataVersion) return;

        state.lastDataVersion = newVersion;

        window.dispatchEvent(new CustomEvent('yuzi-phone-table-updated', {
            detail: {
                sheetKey: state.currentViewingSheetKey,
                data: newData,
                version: newVersion,
            },
        }));
    });
}

export function resetDataVersion() {
    getPhoneCoreState().lastDataVersion = null;
}
