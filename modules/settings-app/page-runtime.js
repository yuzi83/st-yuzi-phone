// modules/settings-app/page-runtime.js
/**
 * 玉子的手机 - 设置 App 页面 runtime 管理器
 *
 * 把 [`renderSettings()`](modules/settings-app/render.js:1) 内部的 currentPageRuntime 闭包封装成显式工厂。
 *
 * 行为约定：
 *   - 每次切换 mode 时，先 dispose 当前 page session（page.dispose），再 dispose 当前 runtime
 *   - 然后用 createCurrentPageRuntime(nextMode) 重建一个新的 runtimeScope
 *   - pageRuntime 是一个稳定引用：内部所有 setTimeout/observe/registerCleanup 都会路由到 *当前* runtime
 *     这样 page renderers 拿到 pageRuntime 后，不需要关心 runtime 实例切换
 *
 * 这种"包装稳定引用 + 内部转发到当前 runtime"的模式必须保持，否则 page renderer
 * 持有的 pageRuntime 引用在 mode 切换后会指向已 dispose 的 runtime。
 */

import { createRuntimeScope } from '../runtime-manager.js';

/**
 * 创建页面 runtime 管理器。
 * @returns {{
 *   pageRuntime: import('../runtime-manager.js').RuntimeScope,
 *   createCurrentPageRuntime: (mode?: string) => import('../runtime-manager.js').RuntimeScope,
 *   disposeCurrentPageRuntime: () => void,
 *   registerPageCleanup: (cleanup: () => void) => () => void,
 *   bindPageEvent: (target: EventTarget, type: string, listener: EventListener, options?: AddEventListenerOptions) => () => void,
 *   getCurrentRuntime: () => import('../runtime-manager.js').RuntimeScope | null,
 * }}
 */
export function createPageRuntimeManager() {
    /** @type {import('../runtime-manager.js').RuntimeScope | null} */
    let currentPageRuntime = null;

    const disposeCurrentPageRuntime = () => {
        if (currentPageRuntime && typeof currentPageRuntime.dispose === 'function') {
            currentPageRuntime.dispose();
        }
        currentPageRuntime = null;
    };

    const createCurrentPageRuntime = (mode = 'home') => {
        currentPageRuntime = createRuntimeScope(`settings-page:${String(mode || 'home')}`);
        return currentPageRuntime;
    };

    const registerPageCleanup = (cleanup) => {
        if (typeof cleanup !== 'function') return () => {};
        if (!currentPageRuntime || typeof currentPageRuntime.registerCleanup !== 'function') {
            return () => {};
        }
        return currentPageRuntime.registerCleanup(cleanup);
    };

    const bindPageEvent = (target, type, listener, options) => {
        if (!currentPageRuntime || typeof currentPageRuntime.addEventListener !== 'function') {
            return () => {};
        }
        return currentPageRuntime.addEventListener(target, type, listener, options);
    };

    // 这是稳定引用：内部所有方法都通过闭包访问 currentPageRuntime，
    // 这样调用方持有 pageRuntime 后即使 mode 切换也能继续使用最新 runtime。
    const pageRuntime = {
        setTimeout(callback, delay) {
            if (!currentPageRuntime || typeof currentPageRuntime.setTimeout !== 'function') {
                return null;
            }
            return currentPageRuntime.setTimeout(callback, delay);
        },
        clearTimeout(timeoutId) {
            if (!currentPageRuntime || typeof currentPageRuntime.clearTimeout !== 'function') {
                return;
            }
            currentPageRuntime.clearTimeout(timeoutId);
        },
        setInterval(callback, delay) {
            if (!currentPageRuntime || typeof currentPageRuntime.setInterval !== 'function') {
                return null;
            }
            return currentPageRuntime.setInterval(callback, delay);
        },
        clearInterval(intervalId) {
            if (!currentPageRuntime || typeof currentPageRuntime.clearInterval !== 'function') {
                return;
            }
            currentPageRuntime.clearInterval(intervalId);
        },
        requestAnimationFrame(callback) {
            if (!currentPageRuntime || typeof currentPageRuntime.requestAnimationFrame !== 'function') {
                return null;
            }
            return currentPageRuntime.requestAnimationFrame(callback);
        },
        cancelAnimationFrame(frameId) {
            if (!currentPageRuntime || typeof currentPageRuntime.cancelAnimationFrame !== 'function') {
                return;
            }
            currentPageRuntime.cancelAnimationFrame(frameId);
        },
        addEventListener(target, type, listener, options) {
            return bindPageEvent(target, type, listener, options);
        },
        observeMutation(target, callback, options) {
            if (!currentPageRuntime || typeof currentPageRuntime.observeMutation !== 'function') {
                return null;
            }
            return currentPageRuntime.observeMutation(target, callback, options);
        },
        observeDisconnection(target, callback, options) {
            if (!currentPageRuntime || typeof currentPageRuntime.observeDisconnection !== 'function') {
                return null;
            }
            return currentPageRuntime.observeDisconnection(target, callback, options);
        },
        registerCleanup(cleanup) {
            return registerPageCleanup(cleanup);
        },
        isDisposed() {
            if (!currentPageRuntime || typeof currentPageRuntime.isDisposed !== 'function') {
                return true;
            }
            return currentPageRuntime.isDisposed();
        },
    };

    return {
        pageRuntime,
        createCurrentPageRuntime,
        disposeCurrentPageRuntime,
        registerPageCleanup,
        bindPageEvent,
        getCurrentRuntime: () => currentPageRuntime,
    };
}
