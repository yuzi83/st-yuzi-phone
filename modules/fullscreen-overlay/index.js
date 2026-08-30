import { Logger } from '../error-handler.js';
import { getPhoneSettings } from '../settings.js';
import { getTableData } from '../phone-core/data-api.js';
import { subscribeTableUpdateReviewResults } from '../table-update-review/result-channel.js';
import {
    FULLSCREEN_OVERLAY_SETTING_KEY,
    SCROLLING_BARRAGE_MODEL_ID,
    normalizeFullscreenOverlaySettings,
} from './settings.js';
import { createOverlaySourceRegistry } from './source-registry.js';
import { buildOverlaySourceCatalog } from './source-catalog.js';
import { createLiveTableSourceAdapter } from './sources/live-table.js';
import { createReviewResultCoordinator } from './review-result-coordinator.js';
import { createFullscreenOverlayLayerRuntime } from './layer-runtime.js';
import { createFullscreenOverlayScheduler } from './scheduler.js';
import { createScrollingBarrageRenderer } from './renderers/scrolling-barrage.js';
import { createFullscreenOverlayRuntime } from './runtime.js';

const logger = Logger.withScope({
    scope: 'fullscreen-overlay/index',
    feature: 'fullscreen-overlay',
});
const sourceRegistry = createOverlaySourceRegistry([
    createLiveTableSourceAdapter(),
]);

function logRuntimeError(error, context = {}) {
    try {
        logger.warn({
            action: context.action || context.phase || 'runtime.error',
            message: '全屏浮层旁路运行失败',
            context,
            error,
        });
    } catch {
        // 浮层日志不可打断扩展主生命周期。
    }
}

const fullscreenOverlayRuntime = createFullscreenOverlayRuntime({
    settingKey: FULLSCREEN_OVERLAY_SETTING_KEY,
    normalizeSettings: normalizeFullscreenOverlaySettings,
    getSettings: getPhoneSettings,
    readSnapshot: () => getTableData(),
    registry: sourceRegistry,
    buildSourceCatalog: buildOverlaySourceCatalog,
    createLayerRuntime: () => createFullscreenOverlayLayerRuntime({
        documentRef: globalThis.document,
    }),
    createRendererRegistry: ({ layerRuntime, getSettings, onError }) => {
        const renderer = createScrollingBarrageRenderer({
            layerRuntime,
            documentRef: globalThis.document,
            getSettings: () => getSettings() || {},
            onError,
        });
        return new Map([
            [SCROLLING_BARRAGE_MODEL_ID, renderer],
        ]);
    },
    createScheduler: ({
        resolveRenderer,
        onError,
        onBatchFailure,
    }) => createFullscreenOverlayScheduler({
        resolveRenderer,
        documentRef: globalThis.document,
        onError,
        onBatchFailure,
    }),
    createCoordinator: ({ onStableSnapshot }) => createReviewResultCoordinator({
        subscribeResults: callback => subscribeTableUpdateReviewResults(callback),
        onStableSnapshot,
    }),
    logger: {
        debug(payload) {
            try {
                logger.debug(payload);
            } catch {
                // 调试日志不得打断旁路运行时。
            }
        },
        warn(payload) {
            logRuntimeError(payload?.error, payload);
        },
    },
});

export function startFullscreenOverlayRuntime(reason = 'enabled') {
    return fullscreenOverlayRuntime.start(reason);
}

export function stopFullscreenOverlayRuntime(reason = 'disabled') {
    return fullscreenOverlayRuntime.stop(reason);
}

export function suspendFullscreenOverlayForChatChange(chatId = null) {
    return fullscreenOverlayRuntime.suspendForChatChange(chatId);
}

export function resumeFullscreenOverlayAfterChatChange(snapshot) {
    return arguments.length > 0
        ? fullscreenOverlayRuntime.resumeAfterChatChange(snapshot)
        : fullscreenOverlayRuntime.resumeAfterChatChange();
}

export function refreshFullscreenOverlaySettings(value) {
    return arguments.length > 0
        ? fullscreenOverlayRuntime.refreshSettings(value)
        : fullscreenOverlayRuntime.refreshSettings();
}

export function testFullscreenOverlaySelectedSources(snapshot) {
    return arguments.length > 0
        ? fullscreenOverlayRuntime.testSelectedSources(snapshot)
        : fullscreenOverlayRuntime.testSelectedSources();
}

export function clearFullscreenOverlay() {
    return fullscreenOverlayRuntime.clear();
}

export function getFullscreenOverlayRuntimeState() {
    return fullscreenOverlayRuntime.getState();
}

export const fullscreenOverlayActions = Object.freeze({
    testSources(payload = {}) {
        if (Object.prototype.hasOwnProperty.call(payload, 'settings')) {
            fullscreenOverlayRuntime.refreshSettings(payload.settings);
        } else {
            fullscreenOverlayRuntime.refreshSettings();
        }
        return Object.prototype.hasOwnProperty.call(payload, 'snapshot')
            ? fullscreenOverlayRuntime.testSelectedSources(payload.snapshot)
            : fullscreenOverlayRuntime.testSelectedSources();
    },
    clear: clearFullscreenOverlay,
    refreshSettings: refreshFullscreenOverlaySettings,
});
