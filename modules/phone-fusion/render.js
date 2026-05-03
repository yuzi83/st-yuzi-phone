// modules/phone-fusion/render.js
/**
 * 玉子的手机 - 模板缝合 App 入口
 *
 * 导入两个模板 → 识别 sheet 区块 → 可视化对照 → 合并导出。
 */

import { navigateBack } from '../phone-core/routing.js';
import { showNotification } from '../integration/toast-bridge.js';
import { Logger } from '../error-handler.js';
import { buildFusionPageHtml } from './templates.js';
import {
    cleanupFusionPageResources,
    createFusionPageRuntime,
} from './runtime.js';
import { createFusionInteractionController } from './interactions.js';

const FUSION_PAGE_INSTANCE_KEY = '__yuziFusionPageInstance';

function getFusionPageInstance(container) {
    if (!(container instanceof HTMLElement)) return null;
    const instance = container[FUSION_PAGE_INSTANCE_KEY];
    return instance && typeof instance === 'object' ? instance : null;
}

function setFusionPageInstance(container, instance) {
    if (!(container instanceof HTMLElement)) return;
    if (instance && typeof instance === 'object') {
        container[FUSION_PAGE_INSTANCE_KEY] = instance;
        return;
    }
    delete container[FUSION_PAGE_INSTANCE_KEY];
}

function disposeFusionPageInstance(container) {
    const instance = getFusionPageInstance(container);
    if (instance && typeof instance.dispose === 'function') {
        instance.dispose();
    }
}

function createFusionPageInstance(container) {
    const runtime = createFusionPageRuntime(container);
    if (!runtime) return null;

    let disposed = false;
    const controller = createFusionInteractionController({
        navigateBack,
        Logger,
        showNotification,
        runtime,
    });

    const dispose = () => {
        if (disposed) return;
        disposed = true;
        runtime.dispose?.();
        if (getFusionPageInstance(container) === instance) {
            setFusionPageInstance(container, null);
        }
    };

    const mount = () => {
        if (disposed) return;
        controller.reset();
        container.innerHTML = buildFusionPageHtml();
        const cleanupController = controller.bind(container);
        runtime.registerCleanup?.(cleanupController);
    };

    const instance = {
        mount,
        dispose,
        runtime,
    };

    return instance;
}

export function renderFusion(container) {
    if (!(container instanceof HTMLElement)) return;

    disposeFusionPageInstance(container);
    cleanupFusionPageResources();

    const instance = createFusionPageInstance(container);
    if (!instance) return;

    setFusionPageInstance(container, instance);
    instance.mount();
}
