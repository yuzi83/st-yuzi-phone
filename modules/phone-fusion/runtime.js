import { Logger } from '../error-handler.js';
import { createRuntimeScope } from '../runtime-manager.js';

let activeDownloadUrl = null;
let fusionPageCleanup = null;

export function revokeFusionDownloadUrl() {
    if (!activeDownloadUrl) return;

    try {
        URL.revokeObjectURL(activeDownloadUrl);
    } catch (error) {
        Logger.warn('[phone-fusion] revokeObjectURL failed:', error);
    }

    activeDownloadUrl = null;
}

export function setFusionDownloadUrl(nextUrl) {
    activeDownloadUrl = nextUrl || null;
}

export function cleanupFusionPageResources() {
    if (typeof fusionPageCleanup === 'function') {
        try {
            fusionPageCleanup();
        } catch (error) {
            Logger.warn('[phone-fusion] page cleanup failed:', error);
        }
    }

    fusionPageCleanup = null;
    revokeFusionDownloadUrl();
}

export function createFusionPageRuntime(container) {
    if (!(container instanceof HTMLElement)) {
        return null;
    }

    cleanupFusionPageResources();

    const runtime = createRuntimeScope('phone-fusion-runtime');
    let disposed = false;

    const dispose = () => {
        if (disposed) return;
        disposed = true;
        runtime.dispose();
        revokeFusionDownloadUrl();
        if (fusionPageCleanup === dispose) {
            fusionPageCleanup = null;
        }
    };

    const observeAfterConnected = () => {
        const observerRoot = document.body;
        if (!(observerRoot instanceof HTMLElement)) return;

        const register = () => {
            if (disposed || runtime.isDisposed?.()) return;
            runtime.observeDisconnection(container, dispose, {
                observerRoot,
                childList: true,
                subtree: true,
            });
        };

        if (container.isConnected) {
            register();
            return;
        }

        let frameCount = 0;
        const wait = () => {
            if (disposed || runtime.isDisposed?.()) return;
            if (container.isConnected) {
                register();
                return;
            }
            frameCount += 1;
            if (frameCount >= 30) {
                dispose();
                return;
            }
            runtime.requestAnimationFrame(wait);
        };
        runtime.requestAnimationFrame(wait);
    };

    observeAfterConnected();
    fusionPageCleanup = dispose;

    return {
        addEventListener: (...args) => runtime.addEventListener(...args),
        registerCleanup: (...args) => runtime.registerCleanup(...args),
        requestAnimationFrame: (...args) => runtime.requestAnimationFrame(...args),
        setTimeout: (...args) => runtime.setTimeout(...args),
        clearTimeout: (...args) => runtime.clearTimeout(...args),
        observeDisconnection: (...args) => runtime.observeDisconnection(...args),
        isDisposed: () => disposed || runtime.isDisposed?.(),
        dispose,
    };
}

export function bindFusionContainerCleanup(container) {
    return createFusionPageRuntime(container);
}

export function clearFusionResult(container) {
    revokeFusionDownloadUrl();
    const resultEl = container?.querySelector?.('#phone-fusion-result');
    if (resultEl instanceof HTMLElement) {
        resultEl.innerHTML = '';
    }
}
