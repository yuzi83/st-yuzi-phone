// modules/runtime-manager.js
/**
 * Yuzi Phone - 运行时资源管理
 * 统一管理定时器、RAF、事件监听与清理逻辑，避免长会话泄漏。
 */

function isFn(fn) {
    return typeof fn === 'function';
}

export function createRuntimeScope(scopeName = 'yuzi-runtime') {
    const timeoutIds = new Set();
    const intervalIds = new Set();
    const rafIds = new Set();
    const listenerRecords = new Set();
    const cleanups = new Set();

    const safeInvoke = (fn) => {
        if (!isFn(fn)) return;
        try {
            fn();
        } catch (e) {
            console.warn(`[玉子手机][${scopeName}] cleanup error:`, e);
        }
    };

    const setManagedTimeout = (callback, delay = 0) => {
        const timeout = Number(delay);
        const ms = Number.isFinite(timeout) && timeout >= 0 ? timeout : 0;
        const id = window.setTimeout(() => {
            timeoutIds.delete(id);
            try {
                callback?.();
            } catch (e) {
                console.warn(`[玉子手机][${scopeName}] timeout callback error:`, e);
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
                console.warn(`[玉子手机][${scopeName}] interval callback error:`, e);
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
                console.warn(`[玉子手机][${scopeName}] raf callback error:`, e);
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

    const dispose = () => {
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
        registerCleanup,
        dispose,
    };
}

export function scheduleIdleTask(task, options = {}) {
    const timeout = Number(options.timeout);
    const timeoutMs = Number.isFinite(timeout) && timeout > 0 ? timeout : 600;

    if (typeof window.requestIdleCallback === 'function') {
        const id = window.requestIdleCallback(() => {
            try {
                task?.();
            } catch (e) {
                console.warn('[玉子手机][idle-task] error:', e);
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
            console.warn('[玉子手机][idle-task] error:', e);
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
            console.warn('[玉子手机][debounce-task] error:', e);
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
