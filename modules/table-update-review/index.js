import { createRuntimeScope } from '../runtime-manager.js';
import { getPhoneCoreState } from '../phone-core/state.js';
import { getReviewState, subscribeReviewState } from './store.js';
import { startTableUpdateReviewService } from './service.js';
import { buildTableUpdateReviewContentHtml, buildTableUpdateReviewPageHtml } from './templates.js';
import { bindTableUpdateReviewInteractions } from './interactions.js';

const PAGE_INSTANCE_KEY = '__yuziTableUpdateReviewPageInstance';
const PAGE_CONNECT_WAIT_FRAMES = 30;

function normalizeRenderToken(value) {
    const token = Number(value);
    return Number.isFinite(token) ? token : null;
}

function getPageInstance(container) {
    if (!(container instanceof HTMLElement)) return null;
    const instance = container[PAGE_INSTANCE_KEY];
    return instance && typeof instance === 'object' ? instance : null;
}

function setPageInstance(container, instance) {
    if (!(container instanceof HTMLElement)) return;
    if (instance && typeof instance === 'object') {
        container[PAGE_INSTANCE_KEY] = instance;
        return;
    }
    delete container[PAGE_INSTANCE_KEY];
}

function disposePageInstance(container) {
    getPageInstance(container)?.dispose?.();
}

function observePageDisconnectionAfterMount(container, runtime, dispose) {
    if (!(container instanceof HTMLElement) || !runtime || typeof dispose !== 'function') return;

    let disposed = false;
    let frameCount = 0;

    const registerObserver = () => {
        if (disposed || runtime.isDisposed?.()) return;
        runtime.observeDisconnection(container, dispose, {
            observerRoot: document.body,
            childList: true,
            subtree: true,
        });
    };

    const waitForConnection = () => {
        if (disposed || runtime.isDisposed?.()) return;
        if (container.isConnected) {
            registerObserver();
            return;
        }
        frameCount += 1;
        if (frameCount >= PAGE_CONNECT_WAIT_FRAMES) {
            dispose();
            return;
        }
        runtime.requestAnimationFrame(waitForConnection);
    };

    runtime.registerCleanup(() => {
        disposed = true;
    });

    if (container.isConnected) {
        registerObserver();
        return;
    }
    runtime.requestAnimationFrame(waitForConnection);
}

function createTableUpdateReviewPageInstance(container, options = {}) {
    const runtime = createRuntimeScope('table-update-review-page');
    const renderToken = normalizeRenderToken(options.renderToken);
    let disposed = false;

    const isRouteTokenActive = () => renderToken === null || getPhoneCoreState().routeRenderToken === renderToken;
    const isActive = () => !disposed && !runtime.isDisposed?.() && container instanceof HTMLElement && container.isConnected && isRouteTokenActive();

    const renderContent = (state = getReviewState()) => {
        if (!isActive()) return false;
        const contentEl = container.querySelector('.tur-content');
        if (!(contentEl instanceof HTMLElement)) return false;
        contentEl.innerHTML = buildTableUpdateReviewContentHtml(state);
        return true;
    };

    const dispose = () => {
        if (disposed) return;
        disposed = true;
        runtime.dispose();
        if (getPageInstance(container) === instance) setPageInstance(container, null);
    };

    const mount = () => {
        if (disposed) return false;
        startTableUpdateReviewService();
        container.innerHTML = buildTableUpdateReviewPageHtml(getReviewState());
        runtime.registerCleanup(bindTableUpdateReviewInteractions(container, { isActive }));
        runtime.registerCleanup(subscribeReviewState((state) => renderContent(state)));
        observePageDisconnectionAfterMount(container, runtime, dispose);
        return true;
    };

    const instance = { mount, dispose, runtime };
    return instance;
}

export function renderTableUpdateReview(container, options = {}) {
    if (!(container instanceof HTMLElement)) return;
    disposePageInstance(container);
    const instance = createTableUpdateReviewPageInstance(container, options);
    setPageInstance(container, instance);
    instance.mount();
}
