// modules/phone/phone-fusion.js
/**
 * 玉子的手机 - 模板缝合 App
 * 导入两个模板 → 识别 sheet 区块 → 可视化对照 → 合并导出
 */

import { navigateBack } from './phone-core/routing.js';
import { showNotification } from './integration/toast-bridge.js';
import { Logger } from './error-handler.js';
import { buildFusionPageHtml } from './phone-fusion/templates.js';
import {
    bindFusionContainerCleanup,
    cleanupFusionPageResources,
} from './phone-fusion/runtime.js';
import { createFusionInteractionController } from './phone-fusion/interactions.js';


export function renderFusion(container) {
    if (!(container instanceof HTMLElement)) return;

    cleanupFusionPageResources();
    bindFusionContainerCleanup(container);

    const controller = createFusionInteractionController({
        navigateBack,
        Logger,
        showNotification,
    });
    controller.reset();

    container.innerHTML = buildFusionPageHtml();
    controller.bind(container);
}
