import { Logger } from '../error-handler.js';
import { getDB } from './db-bridge.js';
import { getPhoneCoreState } from './state.js';

const logger = Logger.withScope({ scope: 'phone-core/callbacks', feature: 'callbacks' });

function clearRegisteredTableUpdateCallback(state = getPhoneCoreState()) {
    state.registeredTableUpdateCallback = null;
}

function clearRegisteredTableFillStartCallback(state = getPhoneCoreState()) {
    state.registeredTableFillStartCallback = null;
}

export function registerTableUpdateListener(callback) {
    if (typeof callback !== 'function') {
        logger.warn({
            action: 'table-update.register',
            message: '表格更新回调注册失败：回调必须是函数',
        });
        return false;
    }

    const api = getDB();
    if (!api || typeof api.registerTableUpdateCallback !== 'function') {
        logger.debug({
            action: 'table-update.register',
            message: '表格更新回调API不可用（可选 API 缺失，已降级）',
        });
        return false;
    }

    unregisterTableUpdateListener();

    try {
        const state = getPhoneCoreState();
        state.registeredTableUpdateCallback = callback;
        api.registerTableUpdateCallback(callback);
        logger.debug({
            action: 'table-update.register',
            message: '表格更新回调已注册',
        });
        return true;
    } catch (error) {
        logger.warn({
            action: 'table-update.register',
            message: '注册表格更新回调失败',
            error,
        });
        clearRegisteredTableUpdateCallback();
        return false;
    }
}

export function unregisterTableUpdateListener() {
    const api = getDB();
    const state = getPhoneCoreState();
    const callback = state.registeredTableUpdateCallback;

    if (!api || typeof api.unregisterTableUpdateCallback !== 'function') {
        clearRegisteredTableUpdateCallback(state);
        return;
    }

    if (!callback) return;

    try {
        api.unregisterTableUpdateCallback(callback);
        logger.debug({
            action: 'table-update.unregister',
            message: '表格更新回调已注销',
        });
    } catch (error) {
        logger.warn({
            action: 'table-update.unregister',
            message: '注销表格更新回调失败',
            error,
        });
    }
    clearRegisteredTableUpdateCallback(state);
}

export function registerTableFillStartListener(callback) {
    if (typeof callback !== 'function') {
        logger.warn({
            action: 'table-fill-start.register',
            message: '填表开始回调注册失败：回调必须是函数',
        });
        return false;
    }

    const api = getDB();
    if (!api || typeof api.registerTableFillStartCallback !== 'function') {
        logger.warn({
            action: 'table-fill-start.register',
            message: '填表开始回调API不可用',
        });
        return false;
    }

    unregisterTableFillStartListener();

    try {
        const state = getPhoneCoreState();
        state.registeredTableFillStartCallback = callback;
        api.registerTableFillStartCallback(callback);
        logger.debug({
            action: 'table-fill-start.register',
            message: '填表开始回调已注册',
        });
        return true;
    } catch (error) {
        logger.warn({
            action: 'table-fill-start.register',
            message: '注册填表开始回调失败',
            error,
        });
        clearRegisteredTableFillStartCallback();
        return false;
    }
}

export function unregisterTableFillStartListener() {
    const api = getDB();
    const state = getPhoneCoreState();
    const callback = state.registeredTableFillStartCallback;

    if (!api || typeof api.unregisterTableFillStartCallback !== 'function') {
        clearRegisteredTableFillStartCallback(state);
        return;
    }

    if (!callback) return;

    try {
        api.unregisterTableFillStartCallback(callback);
        logger.debug({
            action: 'table-fill-start.unregister',
            message: '填表开始回调已注销',
        });
    } catch (error) {
        logger.warn({
            action: 'table-fill-start.unregister',
            message: '注销填表开始回调失败',
            error,
        });
    }
    clearRegisteredTableFillStartCallback(state);
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

function shouldSkipSmartRefresh(state, newVersion) {
    if (!state.currentViewingSheetKey) {
        logger.debug({
            action: 'smart-refresh.skip',
            message: 'smart refresh 跳过：当前无查看表',
            context: { reason: 'no-viewing-sheet' },
        });
        return true;
    }

    if (newVersion === state.lastDataVersion) {
        logger.debug({
            action: 'smart-refresh.skip',
            message: 'smart refresh 跳过：数据版本未变化',
            context: {
                reason: 'same-version',
                sheetKey: state.currentViewingSheetKey,
                version: newVersion,
            },
        });
        return true;
    }

    return false;
}

function dispatchSmartRefreshEvent(state, newData, newVersion) {
    const detail = {
        sheetKey: state.currentViewingSheetKey,
        data: newData,
        version: newVersion,
    };

    window.dispatchEvent(new CustomEvent('yuzi-phone-table-updated', { detail }));
    logger.debug({
        action: 'smart-refresh.dispatch',
        message: 'smart refresh 事件已派发',
        context: {
            sheetKey: detail.sheetKey,
            version: detail.version,
        },
    });
}

export function initSmartRefreshListener() {
    logger.debug({
        action: 'smart-refresh.setup',
        message: '开始注册 smart refresh 监听器',
    });

    const registered = registerTableUpdateListener((newData) => {
        const state = getPhoneCoreState();
        const newVersion = computeDataVersion(newData);
        if (shouldSkipSmartRefresh(state, newVersion)) return;

        state.lastDataVersion = newVersion;
        dispatchSmartRefreshEvent(state, newData, newVersion);
    });

    if (!registered) {
        logger.debug({
            action: 'smart-refresh.setup',
            message: 'smart refresh 监听器注册失败（可选 API 缺失，已降级）',
        });
        return false;
    }

    logger.debug({
        action: 'smart-refresh.setup',
        message: 'smart refresh 监听器已注册',
    });
    return true;
}

export function resetDataVersion() {
    getPhoneCoreState().lastDataVersion = null;
}
