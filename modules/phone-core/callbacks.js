import { Logger } from '../error-handler.js';
import { getDB } from './db-bridge.js';
import { getPhoneCoreState, markPhoneRouteRefreshPending } from './state.js';

const logger = Logger.withScope({ scope: 'phone-core/callbacks', feature: 'callbacks' });
const tableUpdateSubscribers = new Set();
const tableFillStartSubscribers = new Set();
let registeredTableUpdateApi = null;
let registeredTableUpdateNativeCallback = null;
let registeredTableFillStartApi = null;
let registeredTableFillStartNativeCallback = null;
let viewingSheetOwnerCounter = 0;
let activeViewingSheetOwner = null;

function clearRegisteredTableUpdateCallback(state = getPhoneCoreState()) {
    state.registeredTableUpdateCallback = null;
}

function releaseTableUpdateNativeListener(options = {}) {
    const state = getPhoneCoreState();
    const api = registeredTableUpdateApi;
    const callback = registeredTableUpdateNativeCallback;
    const allowLocalDetach = options.allowLocalDetach === true;
    if (!callback) {
        registeredTableUpdateApi = null;
        registeredTableUpdateNativeCallback = null;
        clearRegisteredTableUpdateCallback(state);
        return true;
    }
    if (!api || typeof api.unregisterTableUpdateCallback !== 'function') {
        if (allowLocalDetach) {
            registeredTableUpdateApi = null;
            registeredTableUpdateNativeCallback = null;
            clearRegisteredTableUpdateCallback(state);
            logger.debug({
                action: 'table-update.unregister.best-effort',
                message: '旧表格更新 owner 不支持注销，已清理本地 owner 以允许重绑',
            });
            return true;
        }
        return false;
    }

    try {
        api.unregisterTableUpdateCallback(callback);
        registeredTableUpdateApi = null;
        registeredTableUpdateNativeCallback = null;
        clearRegisteredTableUpdateCallback(state);
        logger.debug({
            action: 'table-update.unregister',
            message: '表格更新底层回调已注销',
        });
        return true;
    } catch (error) {
        logger.warn({
            action: 'table-update.unregister',
            message: '注销表格更新底层回调失败',
            error,
        });
        return false;
    }
}

function clearRegisteredTableFillStartCallback(state = getPhoneCoreState()) {
    state.registeredTableFillStartCallback = null;
}

function dispatchTableUpdateToSubscribers(newData) {
    for (const subscriber of Array.from(tableUpdateSubscribers)) {
        try {
            subscriber(newData);
        } catch (error) {
            logger.warn({
                action: 'table-update.subscriber-error',
                message: '表格更新订阅回调执行失败',
                error,
            });
        }
    }
}

function dispatchTableFillStartToSubscribers() {
    for (const subscriber of Array.from(tableFillStartSubscribers)) {
        try {
            subscriber();
        } catch (error) {
            logger.warn({
                action: 'table-fill-start.subscriber-error',
                message: '填表开始订阅回调执行失败',
                error,
            });
        }
    }
}

function ensureTableUpdateNativeListener() {
    const state = getPhoneCoreState();
    const api = getDB();
    if (registeredTableUpdateNativeCallback && registeredTableUpdateApi === api) {
        state.registeredTableUpdateCallback = registeredTableUpdateNativeCallback;
        return true;
    }
    if (registeredTableUpdateNativeCallback && registeredTableUpdateApi !== api) {
        if (!releaseTableUpdateNativeListener({ allowLocalDetach: true })) return false;
    } else if (state.registeredTableUpdateCallback) {
        clearRegisteredTableUpdateCallback(state);
    }

    if (!api || typeof api.registerTableUpdateCallback !== 'function') {
        logger.debug({
            action: 'table-update.register',
            message: '表格更新回调API不可用（可选 API 缺失，已降级）',
        });
        return false;
    }

    const nativeCallback = (newData) => dispatchTableUpdateToSubscribers(newData);

    try {
        api.registerTableUpdateCallback(nativeCallback);
        registeredTableUpdateApi = api;
        registeredTableUpdateNativeCallback = nativeCallback;
        state.registeredTableUpdateCallback = nativeCallback;
        logger.debug({
            action: 'table-update.register',
            message: '表格更新底层回调已注册',
        });
        return true;
    } catch (error) {
        logger.warn({
            action: 'table-update.register',
            message: '注册表格更新底层回调失败',
            error,
        });
        registeredTableUpdateApi = null;
        registeredTableUpdateNativeCallback = null;
        clearRegisteredTableUpdateCallback(state);
        return false;
    }
}

export function ensureTableUpdateListenerCurrent() {
    if (tableUpdateSubscribers.size === 0) return false;
    return ensureTableUpdateNativeListener();
}

export function subscribeTableUpdate(callback) {
    if (typeof callback !== 'function') {
        logger.warn({
            action: 'table-update.subscribe',
            message: '表格更新订阅失败：回调必须是函数',
        });
        return null;
    }

    tableUpdateSubscribers.add(callback);
    const registered = ensureTableUpdateNativeListener();
    if (!registered) {
        tableUpdateSubscribers.delete(callback);
        return null;
    }

    logger.debug({
        action: 'table-update.subscribe',
        message: '表格更新订阅已注册',
        context: { subscriberCount: tableUpdateSubscribers.size },
    });

    let active = true;
    return () => {
        if (!active) return;
        active = false;
        tableUpdateSubscribers.delete(callback);
        logger.debug({
            action: 'table-update.unsubscribe',
            message: '表格更新订阅已移除',
            context: { subscriberCount: tableUpdateSubscribers.size },
        });
    };
}

export function registerTableUpdateListener(callback) {
    if (typeof callback !== 'function') {
        logger.warn({
            action: 'table-update.register',
            message: '表格更新回调注册失败：回调必须是函数',
        });
        return false;
    }

    if (typeof registerTableUpdateListener.unsubscribe === 'function') {
        registerTableUpdateListener.unsubscribe();
        registerTableUpdateListener.unsubscribe = null;
    }

    const unsubscribe = subscribeTableUpdate(callback);
    registerTableUpdateListener.unsubscribe = unsubscribe;
    return tableUpdateSubscribers.has(callback);
}

export function unregisterTableUpdateListener() {
    if (typeof registerTableUpdateListener.unsubscribe === 'function') {
        registerTableUpdateListener.unsubscribe();
        registerTableUpdateListener.unsubscribe = null;
    }
    if (tableUpdateSubscribers.size === 0) {
        releaseTableUpdateNativeListener();
    }
}
registerTableUpdateListener.unsubscribe = null;

function ensureTableFillStartNativeListener() {
    const state = getPhoneCoreState();
    const api = getDB();
    if (registeredTableFillStartNativeCallback && registeredTableFillStartApi === api) {
        state.registeredTableFillStartCallback = registeredTableFillStartNativeCallback;
        return true;
    }
    if (!api || typeof api.registerTableFillStartCallback !== 'function') {
        logger.debug({
            action: 'table-fill-start.register',
            message: '填表开始回调API不可用（可选 API 缺失，已降级）',
        });
        return false;
    }

    const nativeCallback = () => dispatchTableFillStartToSubscribers();

    try {
        registeredTableFillStartApi = api;
        registeredTableFillStartNativeCallback = nativeCallback;
        state.registeredTableFillStartCallback = nativeCallback;
        api.registerTableFillStartCallback(nativeCallback);
        logger.debug({
            action: 'table-fill-start.register',
            message: '填表开始底层回调已注册',
        });
        return true;
    } catch (error) {
        logger.warn({
            action: 'table-fill-start.register',
            message: '注册填表开始底层回调失败',
            error,
        });
        registeredTableFillStartApi = null;
        registeredTableFillStartNativeCallback = null;
        clearRegisteredTableFillStartCallback(state);
        return false;
    }
}

export function subscribeTableFillStart(callback) {
    if (typeof callback !== 'function') {
        logger.warn({
            action: 'table-fill-start.subscribe',
            message: '填表开始订阅失败：回调必须是函数',
        });
        return null;
    }

    tableFillStartSubscribers.add(callback);
    const registered = ensureTableFillStartNativeListener();
    if (!registered) {
        tableFillStartSubscribers.delete(callback);
        return null;
    }

    logger.debug({
        action: 'table-fill-start.subscribe',
        message: '填表开始订阅已注册',
        context: { subscriberCount: tableFillStartSubscribers.size },
    });

    return () => {
        tableFillStartSubscribers.delete(callback);
        logger.debug({
            action: 'table-fill-start.unsubscribe',
            message: '填表开始订阅已移除',
            context: { subscriberCount: tableFillStartSubscribers.size },
        });
    };
}

export function registerTableFillStartListener(callback) {
    if (typeof callback !== 'function') {
        logger.warn({
            action: 'table-fill-start.register',
            message: '填表开始回调注册失败：回调必须是函数',
        });
        return false;
    }

    if (typeof registerTableFillStartListener.unsubscribe === 'function') {
        registerTableFillStartListener.unsubscribe();
        registerTableFillStartListener.unsubscribe = null;
    }

    const unsubscribe = subscribeTableFillStart(callback);
    registerTableFillStartListener.unsubscribe = unsubscribe;
    return tableFillStartSubscribers.has(callback);
}

export function unregisterTableFillStartListener() {
    const api = getDB();
    const state = getPhoneCoreState();
    const callback = state.registeredTableFillStartCallback || registeredTableFillStartNativeCallback;

    if (typeof registerTableFillStartListener.unsubscribe === 'function') {
        registerTableFillStartListener.unsubscribe();
        registerTableFillStartListener.unsubscribe = null;
    }

    if (!api || typeof api.unregisterTableFillStartCallback !== 'function') {
        // 8.9.1 只提供注册接口；保留唯一 native dispatcher，避免再次注册造成重复通知。
        return;
    }

    if (!callback) return;

    try {
        api.unregisterTableFillStartCallback(callback);
        clearRegisteredTableFillStartCallback(state);
        registeredTableFillStartApi = null;
        registeredTableFillStartNativeCallback = null;
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
}
registerTableFillStartListener.unsubscribe = null;

export function setCurrentViewingSheet(sheetKey) {
    const normalizedSheetKey = String(sheetKey ?? '').trim();
    getPhoneCoreState().currentViewingSheetKey = normalizedSheetKey || null;
    if (!normalizedSheetKey) activeViewingSheetOwner = null;
}

export function getCurrentViewingSheet() {
    return getPhoneCoreState().currentViewingSheetKey;
}

export function acquireCurrentViewingSheet(sheetKey) {
    const normalizedSheetKey = String(sheetKey ?? '').trim();
    if (!normalizedSheetKey) return null;
    const owner = Object.freeze({
        id: ++viewingSheetOwnerCounter,
        sheetKey: normalizedSheetKey,
    });
    activeViewingSheetOwner = owner;
    getPhoneCoreState().currentViewingSheetKey = normalizedSheetKey;
    return owner;
}

export function releaseCurrentViewingSheet(owner) {
    if (!owner || activeViewingSheetOwner !== owner) return false;
    activeViewingSheetOwner = null;
    getPhoneCoreState().currentViewingSheetKey = null;
    return true;
}

export function isCurrentViewingSheetOwner(owner) {
    return !!owner && activeViewingSheetOwner === owner;
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

function resolveUpdatedSheetData(newData, sheetKey) {
    if (!newData || typeof newData !== 'object') return null;
    if (Object.prototype.hasOwnProperty.call(newData, sheetKey)) {
        return newData[sheetKey];
    }
    if (Array.isArray(newData?.content)) {
        return newData;
    }
    return null;
}

function shouldSkipSmartRefresh(state, sheetKey, newVersion) {
    if (!sheetKey) {
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
                sheetKey,
                version: newVersion,
            },
        });
        return true;
    }

    return false;
}

function dispatchSmartRefreshEvent(sheetKey, newVersion) {
    const detail = {
        sheetKey,
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
        if (state.isPhoneActive === false) {
            markPhoneRouteRefreshPending('table-update', state);
            return;
        }

        const sheetKey = String(state.currentViewingSheetKey || '').trim();
        if (!sheetKey) {
            shouldSkipSmartRefresh(state, sheetKey, '');
            return;
        }

        const sheetData = resolveUpdatedSheetData(newData, sheetKey);
        const newVersion = computeDataVersion(sheetData);
        if (shouldSkipSmartRefresh(state, sheetKey, newVersion)) return;

        state.lastDataVersion = newVersion;
        dispatchSmartRefreshEvent(sheetKey, newVersion);
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
