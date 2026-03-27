import { Logger } from '../error-handler.js';

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

export function bindFusionContainerCleanup(container) {
    if (!(container instanceof HTMLElement) || !(document.body instanceof HTMLElement)) {
        fusionPageCleanup = null;
        return;
    }

    const observer = new MutationObserver(() => {
        if (container.isConnected) return;
        cleanupFusionPageResources();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    fusionPageCleanup = () => observer.disconnect();
}

export function clearFusionResult(container) {
    revokeFusionDownloadUrl();
    const resultEl = container?.querySelector?.('#phone-fusion-result');
    if (resultEl instanceof HTMLElement) {
        resultEl.innerHTML = '';
    }
}
