import { Logger } from '../error-handler.js';

export const DEFAULT_API_TIMEOUT = 5000;
const logger = Logger.withScope({ scope: 'phone-core/db-bridge', feature: 'db-api' });

export function getDB() {
    const w = window.parent || window;
    const parentApi = /** @type {any} */ (w).AutoCardUpdaterAPI;
    const selfApi = /** @type {any} */ (window).AutoCardUpdaterAPI;
    return parentApi || selfApi || null;
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
