import { Logger } from '../error-handler.js';
import { createRuntimeScope } from '../runtime-manager.js';
import { subscribeTableUpdate } from '../phone-core/callbacks.js';
import {
    onGenerationStarted,
    onMessageReceived,
    onCharacterMessageRendered,
    onMessageSent,
    onChatChanged,
} from '../integration/event-bridge.js';
import { TABLE_UPDATE_REVIEW_DEBOUNCE_MS } from './constants.js';
import { createTableUpdateReviewFloorWindow, getCurrentReviewFloorWindow } from './floor-window.js';
import { readCurrentTableSnapshot } from './snapshot.js';
import { resetReviewState, setReviewState } from './store.js';
import { createTableUpdateReviewSession } from './session.js';

const logger = Logger.withScope({ scope: 'table-update-review/service', feature: 'table-update-review' });

let runtime = null;
let floorWindow = null;
let reviewSession = null;
let debounceTimer = null;
let isRefreshing = false;

function buildErrorPayload(error) {
    return {
        status: 'error',
        message: '读取本楼表格更新失败',
        error: {
            name: String(error?.name || 'Error'),
            message: String(error?.message || error || '未知错误'),
        },
        tables: [],
        tableCount: 0,
        changeCount: 0,
    };
}

function clearPendingRefresh() {
    if (!runtime || debounceTimer === null) return;
    runtime.clearTimeout(debounceTimer);
    debounceTimer = null;
}

function normalizeFloorId(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : -1;
}

function resolveEventFloorId(payload) {
    if (Array.isArray(payload)) {
        for (const item of payload) {
            const resolved = resolveEventFloorId(item);
            if (resolved >= 0) return resolved;
        }
        return -1;
    }
    if (payload && typeof payload === 'object') {
        return normalizeFloorId(payload.messageId ?? payload.message_id ?? payload.id ?? payload.index ?? payload.mesId);
    }
    return normalizeFloorId(payload);
}

function resolveEventFloorPayload(payload) {
    const eventFloorId = resolveEventFloorId(payload);
    const floorWindowState = getCurrentReviewFloorWindow();
    const floorId = eventFloorId >= 0 ? eventFloorId : normalizeFloorId(floorWindowState.floorId);
    return {
        floorId,
        messageRef: String(floorId >= 0 ? floorId : payload?.messageId ?? payload?.id ?? 'unknown'),
    };
}

function publishReviewState(reviewState) {
    if (!reviewState) return false;
    setReviewState({
        ...reviewState,
        status: reviewState.changeCount > 0 ? 'ready' : 'empty',
        message: reviewState.changeCount > 0 ? reviewState.message : '本楼暂无表格更新',
    });
    return true;
}


function computeAndPublish(reason = 'manual') {
    if (!reviewSession || isRefreshing) return false;
    isRefreshing = true;
    try {
        const reviewState = reviewSession.applyTableUpdate(reason);
        return publishReviewState(reviewState);
    } catch (error) {
        logger.warn({ action: 'refresh.failed', message: '审核服务刷新失败', error, context: { reason } });
        setReviewState(buildErrorPayload(error));
        return false;
    } finally {
        isRefreshing = false;
    }
}

function scheduleRefresh(reason = 'table-update') {
    if (!runtime || runtime.isDisposed?.()) return false;
    clearPendingRefresh();
    debounceTimer = runtime.setTimeout(() => {
        debounceTimer = null;
        computeAndPublish(reason);
    }, TABLE_UPDATE_REVIEW_DEBOUNCE_MS);
    return true;
}

function registerAsyncCleanup(promise) {
    let active = true;
    let cleanup = null;
    runtime?.registerCleanup?.(() => {
        active = false;
        try { cleanup?.(); } catch {}
    });
    Promise.resolve(promise)
        .then((unsubscribe) => {
            cleanup = typeof unsubscribe === 'function' ? unsubscribe : null;
            if (!active) cleanup?.();
        })
        .catch((error) => logger.warn({ action: 'event.subscribe', message: '审核服务事件订阅失败', error }));
}

function handleGenerationStarted() {
    try {
        reviewSession?.beginPreSnapshot('generation-started');
        resetReviewState('已捕获 AI 回复前表格基准，等待本楼更新');
    } catch (error) {
        logger.warn({ action: 'generation-started.failed', message: '捕获 AI 回复前快照失败', error });
        setReviewState(buildErrorPayload(error));
    }
}

function handleAiFloor(payload, reason) {
    try {
        reviewSession?.openAiFloor(resolveEventFloorPayload(payload), reason);
        resetReviewState('已建立最近 AI 楼审核会话，等待表格更新');
    } catch (error) {
        logger.warn({ action: 'ai-floor.failed', message: '建立 AI 楼审核会话失败', error, context: { reason } });
        setReviewState(buildErrorPayload(error));
    }
}

function handleMessageSent() {
    reviewSession?.closeReceivingWindow('message-sent');
}

function handleChatChanged() {
    clearPendingRefresh();
    reviewSession?.resetReviewSession('chat-changed');
    resetReviewState('聊天已切换，审核会话已重置');
}

export function startTableUpdateReviewService() {
    if (runtime && !runtime.isDisposed?.()) return true;

    runtime = createRuntimeScope('table-update-review-service');
    floorWindow = createTableUpdateReviewFloorWindow(runtime);
    reviewSession = createTableUpdateReviewSession({ readSnapshot: readCurrentTableSnapshot });

    registerAsyncCleanup(onGenerationStarted(handleGenerationStarted));
    registerAsyncCleanup(onMessageReceived((payload) => handleAiFloor(payload, 'message-received')));
    registerAsyncCleanup(onCharacterMessageRendered((payload) => handleAiFloor(payload, 'character-message-rendered')));
    registerAsyncCleanup(onMessageSent(handleMessageSent));
    registerAsyncCleanup(onChatChanged(handleChatChanged));

    const unsubscribe = subscribeTableUpdate((event) => {
        scheduleRefresh(String(event?.type || 'table-update'));
    });
    runtime.registerCleanup(() => {
        try { unsubscribe?.(); } catch {}
    });

    resetReviewState('等待最近 AI 回复触发表格更新');
    logger.debug({ action: 'service.start', message: '表格更新审核服务已启动' });
    return true;
}

export function stopTableUpdateReviewService() {
    if (!runtime) return false;
    clearPendingRefresh();
    try { floorWindow?.dispose?.(); } catch {}
    floorWindow = null;
    reviewSession?.resetReviewSession('service-stopped');
    reviewSession = null;
    runtime.dispose();
    runtime = null;
    debounceTimer = null;
    isRefreshing = false;
    resetReviewState('审核服务已停止');
    logger.debug({ action: 'service.stop', message: '表格更新审核服务已停止' });
    return true;
}

export function getTableUpdateReviewServiceStatus() {
    return {
        running: !!runtime && !runtime.isDisposed?.(),
        session: reviewSession?.getReviewSessionStatus?.() || null,
        floorWindow: getCurrentReviewFloorWindow(),
        refreshing: isRefreshing,
    };
}
