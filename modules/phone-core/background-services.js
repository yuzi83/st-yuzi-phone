import { Logger } from '../error-handler.js';
import { subscribeTableUpdate } from './callbacks.js';
import {
    startChronicleTodayRelationInjection,
    stopChronicleTodayRelationInjection,
} from './derived-fields/chronicle-today-relation.js';
import {
    startSmallCalendarDerivedFieldsInjection,
    stopSmallCalendarDerivedFieldsInjection,
} from './derived-fields/small-calendar-derived-fields.js';
import { createTableContentReplacementService } from '../table-content-replacement/service.js';
import {
    startTableUpdateReviewService,
    stopTableUpdateReviewService,
} from '../table-update-review/service.js';
import {
    resumeFullscreenOverlayAfterChatChange,
    startFullscreenOverlayRuntime,
    stopFullscreenOverlayRuntime,
    suspendFullscreenOverlayForChatChange,
} from '../fullscreen-overlay/index.js';

const TABLE_UPDATE_SIGNAL_TARGET = 2;
const CHAT_CHANGE_SETTLE_DELAY_MS = 250;
const CHAT_CHANGE_WAIT_TIMEOUT_MS = 3500;

const tableContentReplacementService = createTableContentReplacementService();

export function applyTableContentReplacementArea(area = {}) {
    return tableContentReplacementService.applyArea(area);
}

const defaultDeps = Object.freeze({
    startChronicle: () => startChronicleTodayRelationInjection(),
    stopChronicle: () => stopChronicleTodayRelationInjection(),
    startSmallCalendar: () => startSmallCalendarDerivedFieldsInjection(),
    stopSmallCalendar: () => stopSmallCalendarDerivedFieldsInjection(),
    startTableContentReplacement: () => tableContentReplacementService.start(),
    stopTableContentReplacement: () => tableContentReplacementService.stop(),
    startTableUpdateReview: () => startTableUpdateReviewService(),
    stopTableUpdateReview: () => stopTableUpdateReviewService(),
    startFullscreenOverlay: reason => startFullscreenOverlayRuntime(reason),
    stopFullscreenOverlay: reason => stopFullscreenOverlayRuntime(reason),
    suspendFullscreenOverlayForChatChange: chatId => suspendFullscreenOverlayForChatChange(chatId),
    resumeFullscreenOverlayAfterChatChange: () => resumeFullscreenOverlayAfterChatChange(),
    subscribeTableUpdate: (callback) => subscribeTableUpdate(callback),
    setTimeout: (...args) => globalThis.setTimeout(...args),
    clearTimeout: (...args) => globalThis.clearTimeout(...args),
    logger: Logger.withScope({ scope: 'phone-core/background-services', feature: 'background-services' }),
});

let deps = { ...defaultDeps };
const runtime = {
    enabled: false,
    running: false,
    generation: 0,
    pendingBarrier: null,
};

function logWarning(action, message, context = {}, error = undefined) {
    try {
        deps.logger?.warn?.({ action, message, context, error });
    } catch {
        // 日志设施不得打断后台服务的停止、回滚或屏障清理。
    }
}

function logDebug(action, message, context = {}) {
    try {
        deps.logger?.debug?.({ action, message, context });
    } catch {
        // 调试日志与警告日志一样，不能改变后台服务生命周期控制流。
    }
}

function callLifecycleDependency(callback, action) {
    try {
        return callback() !== false;
    } catch (error) {
        logWarning(action, '后台派生服务生命周期调用失败', {}, error);
        return false;
    }
}

function callSilentTableContentReplacementLifecycle(callback) {
    try {
        return callback() !== false;
    } catch {
        // 词汇替换是低优先级旁路能力，生命周期异常必须完全静默。
        return false;
    }
}

function callIsolatedFullscreenOverlayLifecycle(callback, action, context = {}) {
    try {
        const result = callback();
        if (result && typeof result.then === 'function') {
            void result.catch((error) => {
                logWarning(action, '全屏浮层旁路生命周期调用失败', context, error);
            });
        }
        return result !== false;
    } catch (error) {
        logWarning(action, '全屏浮层旁路生命周期调用失败', context, error);
        return false;
    }
}

function callIsolatedTableUpdateReviewLifecycle(callback, action, context = {}) {
    try {
        return callback() !== false;
    } catch (error) {
        logWarning(action, '表格更新审核后台生命周期调用失败', context, error);
        return false;
    }
}

function stopDerivedServices(reason) {
    runtime.running = false;
    const smallStopped = callLifecycleDependency(deps.stopSmallCalendar, 'derived.stop.small-calendar');
    const chronicleStopped = callLifecycleDependency(deps.stopChronicle, 'derived.stop.chronicle');
    callSilentTableContentReplacementLifecycle(
        deps.stopTableContentReplacement,
    );

    logDebug('derived.stop', '后台派生服务已停止', {
        reason,
        smallStopped,
        chronicleStopped,
        generation: runtime.generation,
    });
}

function rollbackDerivedServices(reason) {
    runtime.running = false;
    return {
        smallRolledBack: callLifecycleDependency(
            deps.stopSmallCalendar,
            `derived.rollback.${reason}.small-calendar`,
        ),
        chronicleRolledBack: callLifecycleDependency(
            deps.stopChronicle,
            `derived.rollback.${reason}.chronicle`,
        ),
        tableContentReplacementRolledBack: callSilentTableContentReplacementLifecycle(
            deps.stopTableContentReplacement,
        ),
    };
}

function startDerivedServices(generation, reason) {
    if (!runtime.enabled || generation !== runtime.generation) {
        return false;
    }

    const chronicleStarted = callLifecycleDependency(deps.startChronicle, 'derived.start.chronicle');
    if (!runtime.enabled || generation !== runtime.generation) {
        rollbackDerivedServices('stale-after-chronicle');
        return false;
    }

    const smallStarted = callLifecycleDependency(deps.startSmallCalendar, 'derived.start.small-calendar');
    if (!runtime.enabled || generation !== runtime.generation) {
        rollbackDerivedServices('stale-after-small-calendar');
        return false;
    }

    // 词汇替换是低优先级、故障隔离的旁路服务；它的启动失败不能让既有派生服务回滚。
    callSilentTableContentReplacementLifecycle(
        deps.startTableContentReplacement,
    );
    callIsolatedFullscreenOverlayLifecycle(
        () => deps.startFullscreenOverlay(reason),
        'fullscreen-overlay.start',
        { reason, generation },
    );

    runtime.running = chronicleStarted && smallStarted;
    if (!runtime.running) {
        const { smallRolledBack, chronicleRolledBack } = rollbackDerivedServices('partial');
        logWarning('derived.start.partial', '后台派生服务未能全部启动', {
            reason,
            generation,
            chronicleStarted,
            smallStarted,
            chronicleRolledBack,
            smallRolledBack,
        });
    } else {
        logDebug('derived.start', '后台派生服务已启动', {
            reason,
            generation,
        });
    }

    return runtime.running;
}

function clearBarrierTimer(pending, key) {
    if (pending[key] === null) return;
    try {
        deps.clearTimeout(pending[key]);
    } catch (error) {
        logWarning('chat-change.timer.clear', '聊天切换后台屏障定时器清理失败', {
            key,
            generation: pending.generation,
        }, error);
    }
    pending[key] = null;
}

function unsubscribeBarrier(pending, reason) {
    if (typeof pending.unsubscribe !== 'function') return;
    const unsubscribe = pending.unsubscribe;
    pending.unsubscribe = null;
    try {
        unsubscribe();
    } catch (error) {
        logWarning('chat-change.unsubscribe', '聊天切换后台屏障订阅清理失败', {
            reason,
            generation: pending.generation,
        }, error);
    }
}

function clearBarrierResources(pending, reason) {
    unsubscribeBarrier(pending, reason);
    clearBarrierTimer(pending, 'timeoutId');
    clearBarrierTimer(pending, 'settleDelayId');
}

function cancelPendingBarrier(reason) {
    const pending = runtime.pendingBarrier;
    if (!pending) return false;

    runtime.pendingBarrier = null;
    pending.cancelled = true;
    pending.stage = 'cancelled';
    clearBarrierResources(pending, reason);
    return true;
}

function completePendingBarrier(pending, reason) {
    if (runtime.pendingBarrier !== pending || pending.cancelled) return false;
    if (!runtime.enabled || pending.generation !== runtime.generation) return false;

    runtime.pendingBarrier = null;
    pending.stage = 'completed';
    clearBarrierResources(pending, reason);
    const started = startDerivedServices(pending.generation, reason);
    callIsolatedFullscreenOverlayLifecycle(
        () => deps.resumeFullscreenOverlayAfterChatChange(),
        'fullscreen-overlay.chat-change.resume',
        {
            reason,
            chatId: pending.chatId,
            generation: pending.generation,
        },
    );
    return started;
}

function scheduleBarrierTimer(pending, key, delay, callback) {
    try {
        pending[key] = deps.setTimeout(callback, delay);
        return true;
    } catch (error) {
        logWarning('chat-change.timer.schedule', '聊天切换后台屏障定时器创建失败', {
            key,
            delay,
            generation: pending.generation,
        }, error);
        return false;
    }
}

function handleTableUpdateSignal(pending) {
    if (runtime.pendingBarrier !== pending || pending.cancelled) return;
    if (!runtime.enabled || pending.generation !== runtime.generation) return;
    if (pending.stage !== 'waiting-table-update') return;

    pending.updateCount += 1;
    if (pending.updateCount < TABLE_UPDATE_SIGNAL_TARGET) return;

    pending.stage = 'settling';
    unsubscribeBarrier(pending, 'second-table-update');
    clearBarrierTimer(pending, 'timeoutId');

    const scheduled = scheduleBarrierTimer(
        pending,
        'settleDelayId',
        CHAT_CHANGE_SETTLE_DELAY_MS,
        () => completePendingBarrier(pending, 'chat-change-table-update'),
    );
    if (!scheduled) {
        completePendingBarrier(pending, 'chat-change-settle-timer-fallback');
    }
}

export function startPhoneBackgroundServices(reason = 'enabled') {
    runtime.enabled = true;
    callIsolatedTableUpdateReviewLifecycle(
        deps.startTableUpdateReview,
        'table-update-review.start',
        { reason, generation: runtime.generation },
    );
    if (runtime.running && !runtime.pendingBarrier) {
        callIsolatedFullscreenOverlayLifecycle(
            () => deps.startFullscreenOverlay(reason),
            'fullscreen-overlay.start.idempotent',
            { reason, generation: runtime.generation },
        );
        return true;
    }

    runtime.generation += 1;
    const generation = runtime.generation;
    cancelPendingBarrier('start-replace');
    return startDerivedServices(generation, reason);
}

export function stopPhoneBackgroundServices(reason = 'disabled') {
    runtime.enabled = false;
    runtime.generation += 1;
    cancelPendingBarrier(reason);
    stopDerivedServices(reason);
    callIsolatedFullscreenOverlayLifecycle(
        () => deps.stopFullscreenOverlay(reason),
        'fullscreen-overlay.stop',
        { reason, generation: runtime.generation },
    );
    callIsolatedTableUpdateReviewLifecycle(
        deps.stopTableUpdateReview,
        'table-update-review.stop',
        { reason, generation: runtime.generation },
    );
    return true;
}

export function handlePhoneBackgroundChatChanged(chatId = null) {
    if (!runtime.enabled) return false;

    runtime.generation += 1;
    const generation = runtime.generation;
    cancelPendingBarrier('chat-change-replace');
    callIsolatedFullscreenOverlayLifecycle(
        () => deps.suspendFullscreenOverlayForChatChange(chatId),
        'fullscreen-overlay.chat-change.suspend',
        { chatId, generation },
    );
    stopDerivedServices('chat-change');

    const pending = {
        generation,
        chatId,
        stage: 'waiting-table-update',
        updateCount: 0,
        cancelled: false,
        unsubscribe: null,
        timeoutId: null,
        settleDelayId: null,
    };
    runtime.pendingBarrier = pending;

    let unsubscribe = null;
    try {
        unsubscribe = deps.subscribeTableUpdate(() => handleTableUpdateSignal(pending));
    } catch (error) {
        logWarning('chat-change.subscribe', '聊天切换后台屏障订阅失败，将等待超时兜底', {
            chatId,
            generation,
        }, error);
    }

    if (runtime.pendingBarrier === pending && !pending.cancelled) {
        pending.unsubscribe = typeof unsubscribe === 'function' ? unsubscribe : null;
        if (pending.stage !== 'waiting-table-update') {
            unsubscribeBarrier(pending, 'synchronous-table-update');
            return true;
        }
    } else if (typeof unsubscribe === 'function') {
        try {
            unsubscribe();
        } catch (error) {
            logWarning('chat-change.unsubscribe-late', '已完成屏障的晚到订阅清理失败', {
                chatId,
                generation,
            }, error);
        }
        return false;
    }

    const scheduled = scheduleBarrierTimer(
        pending,
        'timeoutId',
        CHAT_CHANGE_WAIT_TIMEOUT_MS,
        () => completePendingBarrier(pending, 'chat-change-timeout-fallback'),
    );
    if (!scheduled) {
        completePendingBarrier(pending, 'chat-change-timeout-timer-fallback');
    }

    return true;
}

export function isPhoneBackgroundServicesStarted() {
    return runtime.enabled && runtime.running;
}

export function __test__setPhoneBackgroundServiceDeps(overrides = {}) {
    stopPhoneBackgroundServices('test-deps-replace');
    deps = {
        ...defaultDeps,
        startFullscreenOverlay: () => true,
        stopFullscreenOverlay: () => true,
        suspendFullscreenOverlayForChatChange: () => true,
        resumeFullscreenOverlayAfterChatChange: () => true,
        startTableUpdateReview: () => true,
        stopTableUpdateReview: () => true,
        ...overrides,
    };
    runtime.enabled = false;
    runtime.running = false;
    runtime.generation = 0;
    runtime.pendingBarrier = null;
}

export function __test__getPhoneBackgroundServiceState() {
    return {
        enabled: runtime.enabled,
        running: runtime.running,
        generation: runtime.generation,
        pendingStage: runtime.pendingBarrier?.stage || null,
        pendingUpdateCount: runtime.pendingBarrier?.updateCount || 0,
    };
}

export function __test__resetPhoneBackgroundServices() {
    stopPhoneBackgroundServices('test-reset');
    deps = { ...defaultDeps };
    runtime.enabled = false;
    runtime.running = false;
    runtime.generation = 0;
    runtime.pendingBarrier = null;
}
