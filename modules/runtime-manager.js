// modules/runtime-manager.js
/**
 * Yuzi Phone - 运行时资源管理
 * 统一管理定时器、RAF、事件监听与清理逻辑，避免长会话泄漏。
 * @fix P1-016 统一错误处理，使用 Logger 替代 console
 */

import { Logger } from './error-handler.js';

function isFn(fn) {
    return typeof fn === 'function';
}

/**
 * 错误类型枚举
 */
const RuntimeErrorType = {
    TIMEOUT: 'timeout',
    INTERVAL: 'interval',
    RAF: 'requestAnimationFrame',
    LISTENER: 'listener',
    OBSERVER: 'observer',
    CLEANUP: 'cleanup',
};

/**
 * 格式化错误日志
 * @param {string} scopeName - 作用域名称
 * @param {string} type - 错误类型
 * @param {Error} error - 错误对象
 * @param {Object} [context] - 上下文信息
 */
function logError(scopeName, type, error, context = {}) {
    Logger.warn({
        scope: 'runtime-manager',
        feature: 'runtime',
        action: 'scope.invoke',
        message: '运行时任务执行失败',
        context: {
            scopeName,
            runtimeType: type,
            ...context,
        },
        error,
    });
}

export function createRuntimeScope(scopeName = 'yuzi-runtime') {
    const timeoutIds = new Set();
    const intervalIds = new Set();
    const rafIds = new Set();
    const listenerRecords = new Set();
    const cleanups = new Set();
    let disposed = false;

    const safeInvoke = (fn, type = RuntimeErrorType.CLEANUP) => {
        if (!isFn(fn)) return;
        try {
            fn();
        } catch (e) {
            logError(scopeName, type, e);
        }
    };

    const isDisposed = () => disposed;

    const setManagedTimeout = (callback, delay = 0) => {
        const timeout = Number(delay);
        const ms = Number.isFinite(timeout) && timeout >= 0 ? timeout : 0;
        const id = window.setTimeout(() => {
            timeoutIds.delete(id);
            try {
                callback?.();
            } catch (e) {
                logError(scopeName, RuntimeErrorType.TIMEOUT, e, { delay: ms });
            }
        }, ms);
        timeoutIds.add(id);
        return id;
    };

    const clearManagedTimeout = (id) => {
        if (id === undefined || id === null) return;
        window.clearTimeout(id);
        timeoutIds.delete(id);
    };

    const setManagedInterval = (callback, delay = 0) => {
        const timeout = Number(delay);
        const ms = Number.isFinite(timeout) && timeout >= 16 ? timeout : 16;
        const id = window.setInterval(() => {
            try {
                callback?.();
            } catch (e) {
                logError(scopeName, RuntimeErrorType.INTERVAL, e, { delay: ms });
            }
        }, ms);
        intervalIds.add(id);
        return id;
    };

    const clearManagedInterval = (id) => {
        if (id === undefined || id === null) return;
        window.clearInterval(id);
        intervalIds.delete(id);
    };

    const requestManagedAnimationFrame = (callback) => {
        if (typeof window.requestAnimationFrame !== 'function') {
            return setManagedTimeout(() => callback?.(Date.now()), 16);
        }

        const id = window.requestAnimationFrame((ts) => {
            rafIds.delete(id);
            try {
                callback?.(ts);
            } catch (e) {
                logError(scopeName, RuntimeErrorType.RAF, e);
            }
        });

        rafIds.add(id);
        return id;
    };

    const cancelManagedAnimationFrame = (id) => {
        if (id === undefined || id === null) return;
        if (typeof window.cancelAnimationFrame === 'function') {
            window.cancelAnimationFrame(id);
        } else {
            window.clearTimeout(id);
        }
        rafIds.delete(id);
    };

    const addManagedEventListener = (target, type, handler, options) => {
        if (!target || !isFn(target.addEventListener) || !isFn(target.removeEventListener) || !isFn(handler)) {
            return () => {};
        }

        target.addEventListener(type, handler, options);
        const record = { target, type, handler, options };
        listenerRecords.add(record);

        return () => {
            if (!listenerRecords.has(record)) return;
            listenerRecords.delete(record);
            target.removeEventListener(type, handler, options);
        };
    };

    const registerCleanup = (cleanup) => {
        if (!isFn(cleanup)) {
            return () => {};
        }
        cleanups.add(cleanup);
        return () => {
            cleanups.delete(cleanup);
        };
    };

    const observeManagedMutation = (target, callback, options = {}) => {
        if (typeof MutationObserver !== 'function' || !target || !isFn(callback)) {
            return null;
        }

        const observer = new MutationObserver((mutations, instance) => {
            try {
                callback(mutations, instance);
            } catch (e) {
                logError(scopeName, RuntimeErrorType.OBSERVER, e, { phase: 'callback' });
            }
        });

        try {
            observer.observe(target, options);
        } catch (e) {
            logError(scopeName, RuntimeErrorType.OBSERVER, e, { phase: 'observe' });
            return null;
        }

        const unregisterCleanup = registerCleanup(() => {
            try {
                observer.disconnect();
            } catch (e) {
                logError(scopeName, RuntimeErrorType.OBSERVER, e, { phase: 'disconnect' });
            }
        });

        return {
            observer,
            disconnect: () => {
                unregisterCleanup();
                try {
                    observer.disconnect();
                } catch (e) {
                    logError(scopeName, RuntimeErrorType.OBSERVER, e, { phase: 'manual-disconnect' });
                }
            },
        };
    };

    const observeManagedDisconnection = (target, callback, options = {}) => {
        if (!target || !isFn(callback)) {
            return null;
        }

        const observerRoot = options.observerRoot ?? document.body;
        if (target.isConnected === false) {
            try {
                callback(target);
            } catch (e) {
                logError(scopeName, RuntimeErrorType.OBSERVER, e, { phase: 'pre-disconnected' });
            }
            return {
                observer: null,
                disconnect: () => {},
            };
        }
        if (!observerRoot || !isFn(observerRoot.contains)) {
            return null;
        }

        let disconnected = false;
        /** @type {{ observer: MutationObserver | null, disconnect: Function } | null} */
        let observerHandle = null;

        const triggerDisconnect = (phase = 'disconnect') => {
            if (disconnected) return;
            disconnected = true;
            try {
                observerHandle?.disconnect?.();
            } catch (e) {
                logError(scopeName, RuntimeErrorType.OBSERVER, e, { phase: `${phase}.disconnect` });
            }
            try {
                callback(target);
            } catch (e) {
                logError(scopeName, RuntimeErrorType.OBSERVER, e, { phase });
            }
        };

        observerHandle = observeManagedMutation(observerRoot, (mutations) => {
            if (target.isConnected === false) {
                triggerDisconnect('disconnected-flag');
                return;
            }

            for (const mutation of mutations) {
                for (const node of mutation.removedNodes) {
                    if (node === target || node?.contains?.(target)) {
                        triggerDisconnect('removed-node');
                        return;
                    }
                }
            }
        }, {
            childList: options.childList !== false,
            subtree: options.subtree !== false,
        });

        return observerHandle;
    };

    const dispose = () => {
        if (disposed) {
            return;
        }
        disposed = true;

        timeoutIds.forEach((id) => window.clearTimeout(id));
        timeoutIds.clear();

        intervalIds.forEach((id) => window.clearInterval(id));
        intervalIds.clear();

        rafIds.forEach((id) => {
            if (typeof window.cancelAnimationFrame === 'function') {
                window.cancelAnimationFrame(id);
            } else {
                window.clearTimeout(id);
            }
        });
        rafIds.clear();

        listenerRecords.forEach((record) => {
            try {
                record.target.removeEventListener(record.type, record.handler, record.options);
            } catch {}
        });
        listenerRecords.clear();

        Array.from(cleanups).forEach((fn) => safeInvoke(fn));
        cleanups.clear();
    };

    return {
        setTimeout: setManagedTimeout,
        clearTimeout: clearManagedTimeout,
        setInterval: setManagedInterval,
        clearInterval: clearManagedInterval,
        requestAnimationFrame: requestManagedAnimationFrame,
        cancelAnimationFrame: cancelManagedAnimationFrame,
        addEventListener: addManagedEventListener,
        observeMutation: observeManagedMutation,
        observeDisconnection: observeManagedDisconnection,
        registerCleanup,
        dispose,
        isDisposed,
    };
}

export function createManagedPageRuntime(scopeName = 'yuzi-page-runtime', registerCleanup) {
    const runtime = createRuntimeScope(scopeName);

    if (typeof registerCleanup === 'function') {
        registerCleanup(() => {
            runtime.dispose();
        });
    }

    return runtime;
}

export function scheduleIdleTask(task, options = {}) {
    const timeout = Number(options.timeout);
    const timeoutMs = Number.isFinite(timeout) && timeout > 0 ? timeout : 600;

    if (typeof window.requestIdleCallback === 'function') {
        const id = window.requestIdleCallback(() => {
            try {
                task?.();
            } catch (e) {
                Logger.warn({
                    scope: 'runtime-manager',
                    feature: 'runtime',
                    action: 'idle-task.execute',
                    message: '空闲任务执行失败',
                    context: { timeoutMs, fallback: false },
                    error: e,
                });
            }
        }, { timeout: timeoutMs });

        return () => {
            if (typeof window.cancelIdleCallback === 'function') {
                window.cancelIdleCallback(id);
            }
        };
    }

    const timerId = window.setTimeout(() => {
        try {
            task?.();
        } catch (e) {
            Logger.warn({
                scope: 'runtime-manager',
                feature: 'runtime',
                action: 'idle-task.execute',
                message: '空闲任务执行失败',
                context: { timeoutMs, fallback: true },
                error: e,
            });
        }
    }, Math.min(timeoutMs, 120));

    return () => window.clearTimeout(timerId);
}

export function createDebouncedTask(task, wait = 200) {
    const delayNum = Number(wait);
    const delay = Number.isFinite(delayNum) && delayNum >= 0 ? delayNum : 200;
    let timerId = null;
    let pendingArgs = [];

    const run = () => {
        const args = pendingArgs;
        pendingArgs = [];
        timerId = null;
        try {
            task?.(...args);
        } catch (e) {
            Logger.warn({
                scope: 'runtime-manager',
                feature: 'runtime',
                action: 'debounce-task.execute',
                message: '防抖任务执行失败',
                context: { delay },
                error: e,
            });
        }
    };

    const fn = (...args) => {
        pendingArgs = args;
        if (timerId !== null) {
            window.clearTimeout(timerId);
        }
        timerId = window.setTimeout(run, delay);
    };

    fn.flush = () => {
        if (timerId === null) return;
        window.clearTimeout(timerId);
        run();
    };

    fn.cancel = () => {
        if (timerId !== null) {
            window.clearTimeout(timerId);
            timerId = null;
        }
        pendingArgs = [];
    };

    return fn;
}
