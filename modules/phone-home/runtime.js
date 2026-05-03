// modules/phone-home/runtime.js
/**
 * 玉子的手机 - 主屏交互 runtime
 *
 * 在主屏 container 上 attach 一个 runtimeScope，并通过 MutationObserver
 * 在 container 被卸载时自动 dispose 全部 grid/dock 监听。
 *
 * 之所以单独一个文件：
 *   - 这个文件包含"延迟绑定 disconnection observer"的特殊逻辑（container 还没挂上时会 retry 16ms 共 20 次）
 *   - render.js 不应该关心 runtime 的 attach/detach 时机
 *   - 调用方只需要 ensureHomeInteractionRuntime(container) 一次，得到的 runtime 会自动随 container 销毁
 */

import { phoneRuntime } from '../phone-core/state.js';
import { createRuntimeScope } from '../runtime-manager.js';

export const HOME_INTERACTION_RUNTIME_KEY = '__yuziHomeInteractionRuntime';
const HOME_RUNTIME_CONNECT_RETRY_MAX = 20;

/**
 * 在 container 上 attach 主屏交互 runtime（已存在则复用）。
 * @param {HTMLElement} container
 * @returns {import('../runtime-manager.js').RuntimeScope}
 */
export function ensureHomeInteractionRuntime(container) {
    const host = /** @type {any} */ (container);
    const previousRuntime = host[HOME_INTERACTION_RUNTIME_KEY];
    if (previousRuntime && typeof previousRuntime.isDisposed === 'function' && !previousRuntime.isDisposed()) {
        return previousRuntime;
    }

    const runtime = createRuntimeScope('phone-home');
    let connectRetryId = null;
    let remainingRetries = HOME_RUNTIME_CONNECT_RETRY_MAX;

    const armDisconnectionObserver = () => {
        if (runtime.isDisposed()) {
            return;
        }

        if (!container.isConnected) {
            if (remainingRetries <= 0) {
                runtime.dispose();
                return;
            }

            remainingRetries -= 1;
            connectRetryId = phoneRuntime.setTimeout(() => {
                connectRetryId = null;
                armDisconnectionObserver();
            }, 16);
            return;
        }

        const observerRoot = document.querySelector('.phone-screen') || document.body;
        const observerHandle = runtime.observeDisconnection(container, () => {
            runtime.dispose();
        }, {
            observerRoot,
            childList: true,
            subtree: true,
        });

        runtime.registerCleanup(() => {
            observerHandle?.disconnect?.();
        });
    };

    runtime.registerCleanup(() => {
        if (connectRetryId !== null) {
            phoneRuntime.clearTimeout(connectRetryId);
            connectRetryId = null;
        }
        if (host[HOME_INTERACTION_RUNTIME_KEY] === runtime) {
            delete host[HOME_INTERACTION_RUNTIME_KEY];
        }
    });

    host[HOME_INTERACTION_RUNTIME_KEY] = runtime;
    armDisconnectionObserver();
    return runtime;
}
