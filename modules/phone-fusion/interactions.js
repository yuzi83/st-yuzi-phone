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

export function createFusionInteractionController(deps = {}) {
    const {
        navigateBack,
        Logger,
        showNotification,
    } = deps;

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
        container.querySelector('.phone-nav-back')?.addEventListener('click', navigateBack);

        container.querySelector('#phone-import-a')?.addEventListener('click', () => {
            pickJsonFile((obj, name) => {
                templateA = obj;
                templateAName = name;
                clearFusionResult(container);
                container.querySelector('#phone-fname-a').textContent = name;
                container.querySelector('#phone-import-a').classList.add('phone-fusion-imported');
                tryRenderCompare(container);
            }, (message, error) => reportFusionError(message, error, { Logger, showNotification }));
        });

        container.querySelector('#phone-import-b')?.addEventListener('click', () => {
            pickJsonFile((obj, name) => {
                templateB = obj;
                templateBName = name;
                clearFusionResult(container);
                container.querySelector('#phone-fname-b').textContent = name;
                container.querySelector('#phone-import-b').classList.add('phone-fusion-imported');
                tryRenderCompare(container);
            }, (message, error) => reportFusionError(message, error, { Logger, showNotification }));
        });

        container.querySelector('#phone-fusion-merge')?.addEventListener('click', () => {
            performMerge(container);
        });
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
