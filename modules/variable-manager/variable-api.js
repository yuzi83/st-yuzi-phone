/**
 * 变量管理器 - 变量接口封装层
 * 自动检测 MVU 框架，提供统一的变量读写接口
 */

import { Logger } from '../error-handler.js';
import { getTavernHelper } from '../integration/tavern-helper-bridge.js';

const logger = Logger.withScope ? Logger.withScope({ scope: 'variable-manager/api' }) : Logger;

const DEFAULT_MVU_READ_OPTIONS = Object.freeze({
    waitMvu: true,
    timeoutMs: 1200,
    retryIntervalMs: 120,
});

/**
 * 检测 MVU 变量框架是否可用
 */
export function isMvuAvailable() {
    try {
        return !!(typeof window !== 'undefined'
            && window.Mvu
            && typeof window.Mvu.getMvuData === 'function');
    } catch {
        return false;
    }
}

/**
 * 获取最新楼层 ID
 * @returns {number} 最新楼层号，失败返回 -1
 */
export function getLastMessageId() {
    const helper = getTavernHelper();
    if (!helper || typeof helper.getLastMessageId !== 'function') {
        return -1;
    }
    try {
        return helper.getLastMessageId();
    } catch (error) {
        logger.error?.({ action: 'getLastMessageId', message: '获取最新楼层号失败', error });
        return -1;
    }
}

function normalizeMessageId(messageId = 'latest') {
    const resolvedId = messageId === 'latest' ? getLastMessageId() : Number(messageId);
    return Number.isFinite(resolvedId) ? Math.trunc(resolvedId) : -1;
}

function normalizePlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function hasUsableVariableData(value) {
    return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;
}

function delay(ms) {
    const safeMs = Number.isFinite(Number(ms)) && Number(ms) >= 0 ? Number(ms) : 0;
    return new Promise((resolve) => {
        globalThis.setTimeout(resolve, safeMs);
    });
}

function resolveWaitGlobalInitialized() {
    if (typeof globalThis !== 'undefined' && typeof globalThis.waitGlobalInitialized === 'function') {
        return globalThis.waitGlobalInitialized.bind(globalThis);
    }
    if (typeof window !== 'undefined' && typeof window.waitGlobalInitialized === 'function') {
        return window.waitGlobalInitialized.bind(window);
    }
    return null;
}

async function waitForMvuInitialized(timeoutMs) {
    const waitGlobalInitialized = resolveWaitGlobalInitialized();
    if (typeof waitGlobalInitialized !== 'function') return false;

    const safeTimeout = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0
        ? Number(timeoutMs)
        : DEFAULT_MVU_READ_OPTIONS.timeoutMs;

    try {
        await Promise.race([
            Promise.resolve().then(() => waitGlobalInitialized('Mvu')),
            delay(safeTimeout).then(() => {
                throw new Error(`等待 MVU 初始化超时: ${safeTimeout}ms`);
            }),
        ]);
        return true;
    } catch (error) {
        logger.warn?.({ action: 'waitForMvuInitialized', message: '等待 MVU 初始化失败，将继续使用有限重试', error });
        return false;
    }
}

async function readMvuDataWithRetry(messageId, options = {}) {
    const opts = {
        ...DEFAULT_MVU_READ_OPTIONS,
        ...(options && typeof options === 'object' ? options : {}),
    };
    const timeoutMs = Number.isFinite(Number(opts.timeoutMs)) && Number(opts.timeoutMs) >= 0
        ? Number(opts.timeoutMs)
        : DEFAULT_MVU_READ_OPTIONS.timeoutMs;
    const retryIntervalMs = Number.isFinite(Number(opts.retryIntervalMs)) && Number(opts.retryIntervalMs) > 0
        ? Number(opts.retryIntervalMs)
        : DEFAULT_MVU_READ_OPTIONS.retryIntervalMs;
    const maxAttempts = Math.max(1, Math.ceil(Math.max(timeoutMs, retryIntervalMs) / retryIntervalMs));
    const waitedMvu = opts.waitMvu === true ? await waitForMvuInitialized(timeoutMs) : false;

    let lastMvuData = null;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        if (!isMvuAvailable()) break;

        try {
            const mvuData = window.Mvu.getMvuData({ type: 'message', message_id: messageId });
            lastMvuData = mvuData || null;
            if (hasUsableVariableData(mvuData?.stat_data)) {
                return { mvuData, waitedMvu, attempts: attempt, error: null };
            }
        } catch (error) {
            lastError = error;
            logger.warn?.({ action: 'readMvuDataWithRetry.read', message: '读取 MVU 数据失败，将继续有限重试', error });
        }

        if (attempt < maxAttempts) {
            await delay(retryIntervalMs);
        }
    }

    return { mvuData: lastMvuData, waitedMvu, attempts: maxAttempts, error: lastError };
}

function buildReadResult(status, data, isMvu, raw, messageId, meta = {}, error = undefined) {
    return {
        status,
        data: normalizePlainObject(data),
        isMvu: !!isMvu,
        raw: raw || {},
        messageId,
        meta: {
            source: 'none',
            waitedMvu: false,
            attempts: 0,
            ...meta,
        },
        ...(error ? { error } : {}),
    };
}

function readTavernHelperVariables(messageId, fallbackError = null, meta = {}) {
    const helper = getTavernHelper();
    if (!helper || typeof helper.getVariables !== 'function') {
        return buildReadResult(
            fallbackError ? 'error' : 'unavailable',
            {},
            false,
            {},
            messageId,
            { source: 'none', ...meta },
            fallbackError || undefined,
        );
    }

    try {
        const vars = helper.getVariables({ type: 'message', message_id: messageId });
        const data = normalizePlainObject(vars);
        return buildReadResult(
            Object.keys(data).length > 0 ? 'ready' : 'empty',
            data,
            false,
            vars || {},
            messageId,
            { source: 'tavern-helper', ...meta },
        );
    } catch (error) {
        logger.error?.({ action: 'readTavernHelperVariables', message: '获取楼层变量失败', error });
        return buildReadResult('error', {}, false, {}, messageId, { source: 'tavern-helper', ...meta }, error);
    }
}

/**
 * 获取指定楼层的变量数据
 * @param {number|'latest'} messageId 楼层号
 * @returns {{ data: object, isMvu: boolean, raw: object }}
 */
export function getFloorVariables(messageId = 'latest') {
    const resolvedId = normalizeMessageId(messageId);
    if (resolvedId < 0) {
        return { data: {}, isMvu: false, raw: {}, status: 'unavailable', messageId: resolvedId };
    }

    if (isMvuAvailable()) {
        try {
            const mvuData = window.Mvu.getMvuData({ type: 'message', message_id: resolvedId });
            const data = normalizePlainObject(mvuData?.stat_data);
            return {
                data,
                isMvu: true,
                raw: mvuData || {},
                messageId: resolvedId,
                status: Object.keys(data).length > 0 ? 'ready' : 'empty',
                meta: { source: 'mvu', waitedMvu: false, attempts: 1 },
            };
        } catch (error) {
            logger.warn?.({ action: 'getFloorVariables.mvu', message: 'MVU 获取失败，降级到通用接口', error });
        }
    }

    return readTavernHelperVariables(resolvedId);
}

/**
 * 异步获取指定楼层变量数据。
 * 首次打开变量管理器时必须走该入口，以等待 MVU 初始化或有限重试，避免把瞬时空数据当成最终状态。
 * @param {number|'latest'} messageId 楼层号
 * @param {{ waitMvu?: boolean, timeoutMs?: number, retryIntervalMs?: number }} options 读取选项
 * @returns {Promise<{ status: string, data: object, isMvu: boolean, raw: object, messageId: number, meta: object, error?: unknown }>}
 */
export async function getFloorVariablesAsync(messageId = 'latest', options = {}) {
    const resolvedId = normalizeMessageId(messageId);
    if (resolvedId < 0) {
        return buildReadResult('unavailable', {}, false, {}, resolvedId, { source: 'none' });
    }

    const opts = {
        ...DEFAULT_MVU_READ_OPTIONS,
        ...(options && typeof options === 'object' ? options : {}),
    };
    const mvuInitiallyAvailable = isMvuAvailable();
    let waitedMvu = false;
    let mvuAvailableAfterWait = mvuInitiallyAvailable;

    if (!mvuInitiallyAvailable && opts.waitMvu !== false) {
        waitedMvu = await waitForMvuInitialized(opts.timeoutMs);
        mvuAvailableAfterWait = isMvuAvailable();
    }

    const availabilityMeta = {
        waitedMvu,
        mvuInitiallyAvailable,
        mvuAvailableAfterWait,
    };

    if (mvuInitiallyAvailable || mvuAvailableAfterWait) {
        const result = await readMvuDataWithRetry(resolvedId, {
            ...options,
            waitMvu: mvuInitiallyAvailable && opts.waitMvu === true,
        });
        if (result.mvuData) {
            const data = normalizePlainObject(result.mvuData.stat_data);
            if (Object.keys(data).length > 0) {
                return buildReadResult('ready', data, true, result.mvuData, resolvedId, {
                    source: 'mvu',
                    waitedMvu: waitedMvu || result.waitedMvu,
                    attempts: result.attempts,
                    mvuInitiallyAvailable,
                    mvuAvailableAfterWait,
                });
            }

            const fallback = readTavernHelperVariables(resolvedId, result.error, availabilityMeta);
            if (fallback.status === 'ready') return fallback;

            return buildReadResult('empty', data, true, result.mvuData, resolvedId, {
                source: 'mvu',
                waitedMvu: waitedMvu || result.waitedMvu,
                attempts: result.attempts,
                mvuInitiallyAvailable,
                mvuAvailableAfterWait,
            }, result.error || undefined);
        }

        if (result.error) {
            const fallback = readTavernHelperVariables(resolvedId, result.error, availabilityMeta);
            if (fallback.status !== 'unavailable') return fallback;
            return buildReadResult('error', {}, true, {}, resolvedId, {
                source: 'mvu',
                waitedMvu: waitedMvu || result.waitedMvu,
                attempts: result.attempts,
                mvuInitiallyAvailable,
                mvuAvailableAfterWait,
            }, result.error);
        }
    }

    return readTavernHelperVariables(resolvedId, null, availabilityMeta);
}

/**
 * 设置指定楼层的单个变量
 * @param {number} messageId 楼层号
 * @param {string} path 变量路径（如 '角色.络络.好感度'）
 * @param {any} newValue 新值
 * @returns {Promise<boolean>} 是否成功
 */
export async function setFloorVariable(messageId, path, newValue) {
    if (messageId < 0 || !path) return false;

    if (isMvuAvailable()) {
        try {
            const mvuData = window.Mvu.getMvuData({ type: 'message', message_id: messageId });
            if (mvuData) {
                const oldValue = getNestedValue(mvuData.stat_data, path);
                const oldDescription = isMvuTupleLeafValue(oldValue) && typeof oldValue[1] === 'string'
                    ? oldValue[1]
                    : '';

                await window.Mvu.setMvuVariable(mvuData, path, newValue, { reason: '变量管理器手动修改' });

                if (oldDescription) {
                    const updatedValue = getNestedValue(mvuData.stat_data, path);
                    if (!isMvuTupleLeafValue(updatedValue) || updatedValue[1] !== oldDescription) {
                        setNestedValue(mvuData.stat_data, path, [newValue, oldDescription]);
                    }
                }

                await window.Mvu.replaceMvuData(mvuData, { type: 'message', message_id: messageId });
                return true;
            }
        } catch (error) {
            logger.warn?.({ action: 'setFloorVariable.mvu', message: 'MVU 设置失败，降级到通用接口', error });
        }
    }

    const helper = getTavernHelper();
    if (!helper || typeof helper.updateVariablesWith !== 'function') {
        return false;
    }

    try {
        await helper.updateVariablesWith(
            (vars) => {
                if (typeof _ !== 'undefined' && typeof _.set === 'function') {
                    _.set(vars, path, newValue);
                } else {
                    setNestedValue(vars, path, newValue);
                }
                return vars;
            },
            { type: 'message', message_id: messageId },
        );
        return true;
    } catch (error) {
        logger.error?.({ action: 'setFloorVariable', message: '设置变量失败', error });
        return false;
    }
}

/**
 * 删除指定楼层的变量
 * @param {number} messageId 楼层号
 * @param {string} path 变量路径
 * @returns {Promise<boolean>} 是否成功
 */
export async function deleteFloorVariable(messageId, path) {
    if (messageId < 0 || !path) return false;

    if (isMvuAvailable()) {
        try {
            const mvuData = window.Mvu.getMvuData({ type: 'message', message_id: messageId });
            if (mvuData && mvuData.stat_data) {
                if (typeof _ !== 'undefined' && typeof _.unset === 'function') {
                    _.unset(mvuData.stat_data, path);
                    _.unset(mvuData.display_data, path);
                    _.unset(mvuData.delta_data, path);
                } else {
                    deleteMvuVariablePath(mvuData, path);
                }
                await window.Mvu.replaceMvuData(mvuData, { type: 'message', message_id: messageId });
                return true;
            }
        } catch (error) {
            logger.warn?.({ action: 'deleteFloorVariable.mvu', message: 'MVU 删除失败，降级到通用接口', error });
        }
    }

    const helper = getTavernHelper();
    if (!helper || typeof helper.deleteVariable !== 'function') {
        return false;
    }

    try {
        await helper.deleteVariable(path, { type: 'message', message_id: messageId });
        return true;
    } catch (error) {
        logger.error?.({ action: 'deleteFloorVariable', message: '删除变量失败', error });
        return false;
    }
}

/**
 * 添加新变量到指定楼层
 * @param {number} messageId 楼层号
 * @param {string} path 变量路径
 * @param {any} value 值
 * @returns {Promise<boolean>}
 */
export async function addFloorVariable(messageId, path, value) {
    return setFloorVariable(messageId, path, value);
}

// ---- 辅助函数 ----

function isMvuTupleLeafValue(value) {
    return Array.isArray(value)
        && value.length >= 1
        && value.length <= 2
        && (value.length === 1 || typeof value[1] === 'string');
}

function getNestedValue(obj, path) {
    if (!obj || typeof obj !== 'object' || !path) return undefined;
    if (typeof _ !== 'undefined' && typeof _.get === 'function') {
        return _.get(obj, path);
    }

    const keys = path.split('.');
    let current = obj;
    for (const key of keys) {
        if (!current || typeof current !== 'object') return undefined;
        current = current[key];
    }
    return current;
}

function setNestedValue(obj, path, value) {
    if (!obj || typeof obj !== 'object' || !path) return;

    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (current[key] === undefined || current[key] === null || typeof current[key] !== 'object') {
            current[key] = {};
        }
        current = current[key];
    }
    current[keys[keys.length - 1]] = value;
}

function deleteMvuVariablePath(mvuData, path) {
    deleteNestedValue(mvuData?.stat_data, path);
    deleteNestedValue(mvuData?.display_data, path);
    deleteNestedValue(mvuData?.delta_data, path);
}

function deleteNestedValue(obj, path) {
    if (!obj || typeof obj !== 'object') return;

    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (!current[key] || typeof current[key] !== 'object') return;
        current = current[key];
    }
    delete current[keys[keys.length - 1]];
}
