import { pickJsonFile } from './utils.js';
import { clearFusionResult } from './runtime.js';
import { performFusionMerge, renderFusionCompare } from './compare-merge.js';

export function reportFusionError(message, error = null, deps = {}) {
    const { Logger, showNotification } = deps;
    if (error && Logger?.warn) {
        Logger.warn(`[phone-fusion] ${message}`, error);
    }
    showNotification?.(message, 'error');
}

function createRuntimeAdapter(runtime) {
    if (runtime && typeof runtime.addEventListener === 'function') {
        return runtime;
    }

    const cleanups = [];
    return {
        addEventListener(target, type, handler, options) {
            if (!target || typeof target.addEventListener !== 'function' || typeof handler !== 'function') return () => {};
            target.addEventListener(type, handler, options);
            const cleanup = () => target.removeEventListener(type, handler, options);
            cleanups.push(cleanup);
            return cleanup;
        },
        registerCleanup(cleanup) {
            if (typeof cleanup === 'function') cleanups.push(cleanup);
            return () => {};
        },
        setTimeout(callback, delay) {
            const id = window.setTimeout(callback, delay);
            cleanups.push(() => window.clearTimeout(id));
            return id;
        },
        disposeFallback() {
            cleanups.splice(0).forEach((cleanup) => {
                try { cleanup(); } catch {}
            });
        },
    };
}

export function createFusionInteractionController(deps = {}) {
    const {
        navigateBack,
        Logger,
        showNotification,
        runtime,
    } = deps;

    const runtimeApi = createRuntimeAdapter(runtime);
    let templateA = null;
    let templateB = null;
    let templateAName = '';
    let templateBName = '';

    const tryRenderCompare = (container) => {
        renderFusionCompare(container, templateA, templateB);
    };

    const performMerge = (container) => {
        performFusionMerge(container, templateA, templateB);
    };

    const bind = (container) => {
        if (!(container instanceof HTMLElement)) return () => {};

        const onImportA = () => {
            pickJsonFile((obj, name) => {
                templateA = obj;
                templateAName = name;
                clearFusionResult(container);
                const nameEl = container.querySelector('#phone-fname-a');
                if (nameEl) nameEl.textContent = name;
                container.querySelector('#phone-import-a')?.classList.add('phone-fusion-imported');
                tryRenderCompare(container);
            }, (message, error) => reportFusionError(message, error, { Logger, showNotification }), runtimeApi);
        };

        const onImportB = () => {
            pickJsonFile((obj, name) => {
                templateB = obj;
                templateBName = name;
                clearFusionResult(container);
                const nameEl = container.querySelector('#phone-fname-b');
                if (nameEl) nameEl.textContent = name;
                container.querySelector('#phone-import-b')?.classList.add('phone-fusion-imported');
                tryRenderCompare(container);
            }, (message, error) => reportFusionError(message, error, { Logger, showNotification }), runtimeApi);
        };

        runtimeApi.addEventListener(container.querySelector('.phone-nav-back'), 'click', navigateBack);
        runtimeApi.addEventListener(container.querySelector('#phone-import-a'), 'click', onImportA);
        runtimeApi.addEventListener(container.querySelector('#phone-import-b'), 'click', onImportB);
        runtimeApi.addEventListener(container.querySelector('#phone-fusion-merge'), 'click', () => {
            performMerge(container);
        });

        const cleanup = () => runtimeApi.disposeFallback?.();
        runtimeApi.registerCleanup?.(cleanup);
        return cleanup;
    };

    const reset = () => {
        templateA = null;
        templateB = null;
        templateAName = '';
        templateBName = '';
    };

    return {
        bind,
        reset,
        tryRenderCompare,
        performMerge,
        getState() {
            return { templateA, templateB, templateAName, templateBName };
        },
    };
}
