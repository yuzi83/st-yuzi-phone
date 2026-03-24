import { Logger } from '../error-handler.js';

export const DEFAULT_API_TIMEOUT = 5000;

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
            Logger.warn(`[玉子的手机] ${apiName} 调用超时 (${timeout}ms)`);
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
                        Logger.warn(`[玉子的手机] ${apiName} 调用失败:`, error);
                        finish(null);
                    });
                return;
            }

            finish(result);
        } catch (error) {
            Logger.warn(`[玉子的手机] ${apiName} 调用异常:`, error);
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
