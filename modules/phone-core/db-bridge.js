import { Logger } from '../error-handler.js';

export const DEFAULT_API_TIMEOUT = 5000;
export const DEFAULT_MUTATION_WATCHDOG_MS = 30000;
const logger = Logger.withScope({ scope: 'phone-core/db-bridge', feature: 'db-api' });

export function getDB() {
    const windows = [];
    let cursor = window;

    try {
        while (cursor && !windows.includes(cursor)) {
            windows.push(cursor);
            if (!cursor.parent || cursor.parent === cursor) break;
            cursor = cursor.parent;
        }
    } catch {
        // 跨域边界外不可继续向上时，保留已经收集到的同源窗口。
    }

    for (let index = windows.length - 1; index >= 0; index -= 1) {
        try {
            const api = /** @type {any} */ (windows[index]).AutoCardUpdaterAPI;
            if (api) return api;
        } catch {
            // 跳过不可访问的窗口，继续回退到更靠近当前脚本的窗口。
        }
    }

    return null;
}

export function isThenable(result) {
    return result !== null
        && (typeof result === 'object' || typeof result === 'function')
        && typeof result.then === 'function';
}

export function hasDbApiMethod(api, methodName) {
    return !!api && typeof methodName === 'string' && typeof api[methodName] === 'function';
}

export function isDbBooleanSuccess(value) {
    return value === true;
}

export function normalizeDbInsertedRowIndex(value) {
    const rowIndex = Number(value);
    return Number.isInteger(rowIndex) && rowIndex >= 0 ? rowIndex : -1;
}

/**
 * @template T
 * @param {() => T | Promise<T>} apiCall
 * @param {number} timeout
 * @param {string} apiName
 * @returns {Promise<T | null>}
 */
export async function callApiWithTimeout(apiCall, timeout = DEFAULT_API_TIMEOUT, apiName = 'API') {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(value);
        };

        const timer = setTimeout(() => {
            logger.warn({
                action: `${apiName}.timeout`,
                message: '数据库 API 调用超时',
                context: { apiName, timeout },
            });
            finish(null);
        }, timeout);

        try {
            const result = apiCall();

            if (isThenable(result)) {
                Promise.resolve(result)
                    .then((data) => {
                        finish(data);
                    })
                    .catch((error) => {
                        logger.warn({
                            action: `${apiName}.reject`,
                            message: '数据库 API 调用失败',
                            context: { apiName },
                            error,
                        });
                        finish(null);
                    });
                return;
            }

            finish(result);
        } catch (error) {
            logger.warn({
                action: `${apiName}.exception`,
                message: '数据库 API 调用异常',
                context: { apiName },
                error,
            });
            finish(null);
        }
    });
}

/**
 * Invoke a mutating database API and wait for its real settlement.
 *
 * The watchdog is diagnostic only. A mutation cannot be treated as timed out
 * while its underlying Promise may still be changing SQLite/chat/worldbook
 * state, because doing so would release the shared mutation queue too early.
 *
 * @template T
 * @param {() => T | Promise<T>} apiCall
 * @param {string} apiName
 * @param {{ watchdogMs?: number }} options
 * @returns {Promise<T>}
 */
export async function callMutationApiToSettlement(apiCall, apiName = 'API', options = {}) {
    const safeApiName = String(apiName || 'API').trim() || 'API';
    const configuredWatchdogMs = Number(options?.watchdogMs);
    const watchdogMs = Number.isFinite(configuredWatchdogMs) && configuredWatchdogMs > 0
        ? configuredWatchdogMs
        : DEFAULT_MUTATION_WATCHDOG_MS;
    let invoked = false;
    let watchdogLogged = false;

    const watchdogTimer = setTimeout(() => {
        if (watchdogLogged) return;
        watchdogLogged = true;
        logger.warn({
            action: `${safeApiName}.mutation_pending_long`,
            message: '数据库写入仍在等待底层 API 完成',
            context: { apiName: safeApiName, watchdogMs },
        });
    }, watchdogMs);
    watchdogTimer?.unref?.();

    try {
        const result = apiCall();
        invoked = true;
        return isThenable(result) ? await Promise.resolve(result) : result;
    } catch (error) {
        logger.warn({
            action: `${safeApiName}.${invoked ? 'mutation_reject' : 'mutation_exception'}`,
            message: invoked ? '数据库写入 API 调用失败' : '数据库写入 API 调用异常',
            context: { apiName: safeApiName },
            error,
        });
        throw error;
    } finally {
        clearTimeout(watchdogTimer);
    }
}

export function withTimeout(taskPromise, timeoutMs = 4000, timeoutMessage = '请求超时') {
    const timeout = Number(timeoutMs);
    const ms = Number.isFinite(timeout) && timeout > 0 ? timeout : 4000;

    return Promise.race([
        Promise.resolve(taskPromise),
        new Promise((_, reject) => {
            setTimeout(() => reject(new Error(timeoutMessage)), ms);
        }),
    ]);
}

export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function clampNonNegativeInteger(value, fallback = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.round(n));
}

export function clampPositiveInteger(value, fallback = 1) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(1, Math.round(n));
}
