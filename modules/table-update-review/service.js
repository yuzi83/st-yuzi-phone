import { Logger } from '../error-handler.js';
import { createRuntimeScope } from '../runtime-manager.js';
import { subscribeTableUpdate } from '../phone-core/callbacks.js';
import { ensureTableUpdateListenerCurrent } from '../phone-core/callbacks.js';
import {
    onGenerationStarted,
    onMessageReceived,
    onCharacterMessageRendered,
    onMessageSent,
    onChatChanged,
} from '../integration/event-bridge.js';
import { getTavernHelper } from '../integration/tavern-helper-bridge.js';
import { TABLE_UPDATE_REVIEW_DEBOUNCE_MS } from './constants.js';
import { createTableUpdateReviewFloorWindow, getCurrentReviewFloorWindow } from './floor-window.js';
import {
    cloneRawTableSnapshot,
    hasRequiredChangedRawTableSnapshot,
    isCompleteRawTableSnapshot,
    mergeTableUpdatePayload,
    normalizeTableSnapshot,
    readCurrentRawTableSnapshot,
    readCurrentTableSnapshot,
    selectChangedRawTableSnapshot,
} from './snapshot.js';
import { resetReviewState, setReviewState } from './store.js';
import { createTableUpdateReviewSession } from './session.js';
import { publishTableUpdateReviewResult } from './result-channel.js';

const logger = Logger.withScope({ scope: 'table-update-review/service', feature: 'table-update-review' });
const SUBSCRIPTION_RETRY_DELAYS_MS = Object.freeze([1000, 2000, 5000]);
const SUBSCRIPTION_HEALTH_CHECK_INTERVAL_MS = 5000;

function subscribeReviewTableUpdate(callback) {
    const unsubscribe = subscribeTableUpdate((event) => {
        callback(event);
    });
    return unsubscribe;
}

function normalizeChatKey(value) {
    return String(value ?? '').trim();
}

function readCurrentChatKey() {
    const helper = getTavernHelper({ silent: true });
    const candidates = [
        helper?.chatId,
        helper?.chat_id,
        helper?.currentChatId,
        helper?.chatName,
        helper?.chat,
        globalThis?.chat_metadata?.main_chat,
    ];
    return normalizeChatKey(candidates.find(candidate => normalizeChatKey(candidate)));
}

const defaultDeps = Object.freeze({
    createRuntimeScope: () => createRuntimeScope('table-update-review-service'),
    createFloorWindow: scope => createTableUpdateReviewFloorWindow(scope),
    createSession: options => createTableUpdateReviewSession(options),
    readSnapshot: () => readCurrentTableSnapshot(),
    readRawSnapshot: () => readCurrentRawTableSnapshot(),
    normalizeSnapshot: rawData => normalizeTableSnapshot(rawData),
    mergeUpdatePayload: (payload, currentRawSnapshot, lastCompleteRawSnapshot) => (
        mergeTableUpdatePayload(payload, currentRawSnapshot, lastCompleteRawSnapshot)
    ),
    cloneRawSnapshot: rawData => cloneRawTableSnapshot(rawData),
    selectChangedRawSnapshot: (rawData, tables) => selectChangedRawTableSnapshot(rawData, tables),
    hasRequiredChangedRawSnapshot: (rawData, tables) => (
        hasRequiredChangedRawTableSnapshot(rawData, tables)
    ),
    isCompleteRawSnapshot: rawData => isCompleteRawTableSnapshot(rawData),
    publishResult: result => publishTableUpdateReviewResult(result),
    subscribeTableUpdate: callback => subscribeReviewTableUpdate(callback),
    ensureTableUpdateListenerCurrent: () => ensureTableUpdateListenerCurrent(),
    readCurrentChatKey: () => readCurrentChatKey(),
    onGenerationStarted,
    onMessageReceived,
    onCharacterMessageRendered,
    onMessageSent,
    onChatChanged,
});

let runtime = null;
let floorWindow = null;
let reviewSession = null;
let debounceTimer = null;
let subscriptionRetryTimer = null;
let subscriptionRetryAttempt = 0;
let subscriptionHealthTimer = null;
let subscriptionHealthCheckCount = 0;
let lastSubscriptionHealthCheckAt = 0;
let lastSubscriptionHealthCheckOk = null;
let lastSubscriptionHealthCheckReason = '';
let unsubscribeTableUpdate = null;
let isRefreshing = false;
let pendingRawSnapshot = null;
let lastCompleteRawSnapshot = null;
let currentChatKey = '';
let deps = { ...defaultDeps };

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

function clearSubscriptionRetry(resetBackoff = true) {
    if (resetBackoff) subscriptionRetryAttempt = 0;
    if (!runtime || subscriptionRetryTimer === null) return;
    runtime.clearTimeout(subscriptionRetryTimer);
    subscriptionRetryTimer = null;
}

function clearSubscriptionHealthCheck() {
    if (!runtime || subscriptionHealthTimer === null) return;
    runtime.clearTimeout(subscriptionHealthTimer);
    subscriptionHealthTimer = null;
}

function clearPendingPayloads() {
    pendingRawSnapshot = null;
}

function rememberCompleteRawSnapshot(rawSnapshot, { owned = false } = {}) {
    if (!deps.isCompleteRawSnapshot(rawSnapshot)) return false;
    lastCompleteRawSnapshot = owned
        ? rawSnapshot
        : deps.cloneRawSnapshot(rawSnapshot);
    return true;
}

function readRawSnapshot() {
    const rawSnapshot = deps.readRawSnapshot();
    if (!deps.isCompleteRawSnapshot(rawSnapshot)) return rawSnapshot;
    const ownedSnapshot = deps.cloneRawSnapshot(rawSnapshot);
    rememberCompleteRawSnapshot(ownedSnapshot, { owned: true });
    return ownedSnapshot;
}

function readNormalizedSnapshot() {
    return deps.normalizeSnapshot(readRawSnapshot());
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

function publishReviewState(reviewState, rawSnapshot = null) {
    if (!reviewState) return false;
    const committedState = setReviewState({
        ...reviewState,
        chatKey: currentChatKey,
        status: reviewState.changeCount > 0 ? 'ready' : 'empty',
        message: reviewState.changeCount > 0 ? reviewState.message : '本楼暂无表格更新',
    });
    if (!committedState.sessionKey
        || (committedState.status !== 'ready' && committedState.status !== 'empty')) {
        return {
            committedState,
            published: false,
        };
    }

    if (committedState.status === 'empty') {
        return {
            committedState,
            published: deps.publishResult(committedState) === true,
        };
    }

    const changedSnapshot = deps.selectChangedRawSnapshot(
        rawSnapshot,
        committedState.tables,
    );
    if (!deps.hasRequiredChangedRawSnapshot(
        changedSnapshot,
        committedState.tables,
    )) {
        logger.warn({
            action: 'result.invalid-changed-snapshot',
            message: '审核结果缺少 insert/update 表的权威快照，保留待处理数据且不发布 ready',
            context: {
                sessionKey: committedState.sessionKey,
                sheetKeys: committedState.tables.map(table => table.sheetKey),
            },
        });
        return {
            committedState,
            published: false,
        };
    }

    return {
        committedState,
        published: deps.publishResult({
            ...committedState,
            changedSnapshot,
        }) === true,
    };
}


function computeAndPublish(reason = 'manual') {
    if (!reviewSession || isRefreshing) return false;
    isRefreshing = true;
    try {
        const rawSnapshot = pendingRawSnapshot === null
            ? readRawSnapshot()
            : pendingRawSnapshot;
        const snapshotOverride = deps.normalizeSnapshot(rawSnapshot);
        const reviewState = reviewSession.applyTableUpdate(reason, snapshotOverride);
        const publication = publishReviewState(reviewState, rawSnapshot);
        if (publication?.published) {
            clearPendingPayloads();
            return true;
        }
        return false;
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

function handleTableUpdate(event) {
    let currentRawSnapshot = null;
    if (!deps.isCompleteRawSnapshot(event)) {
        if (pendingRawSnapshot !== null) {
            currentRawSnapshot = pendingRawSnapshot;
        } else {
            try {
                currentRawSnapshot = readRawSnapshot();
            } catch (error) {
                logger.debug({
                    action: 'table-update.payload-fallback',
                    message: '当前完整快照暂不可读，改用最近完整快照合并 table-update payload',
                    error,
                });
            }
        }
    }
    pendingRawSnapshot = deps.mergeUpdatePayload(
        event,
        currentRawSnapshot,
        lastCompleteRawSnapshot,
    );
    rememberCompleteRawSnapshot(pendingRawSnapshot, { owned: true });
    scheduleRefresh(String(event?.type || 'table-update'));
}

function scheduleSubscriptionRetry() {
    if (!runtime
        || runtime.isDisposed?.()
        || unsubscribeTableUpdate
        || subscriptionRetryTimer !== null) {
        return false;
    }
    const delayIndex = Math.min(
        subscriptionRetryAttempt,
        SUBSCRIPTION_RETRY_DELAYS_MS.length - 1,
    );
    const delayMs = SUBSCRIPTION_RETRY_DELAYS_MS[delayIndex];
    subscriptionRetryAttempt += 1;
    subscriptionRetryTimer = runtime.setTimeout(() => {
        subscriptionRetryTimer = null;
        ensureTableUpdateSubscription();
    }, delayMs);
    return true;
}

function scheduleSubscriptionHealthCheck() {
    if (!runtime
        || runtime.isDisposed?.()
        || typeof unsubscribeTableUpdate !== 'function'
        || subscriptionHealthTimer !== null) {
        return false;
    }
    subscriptionHealthTimer = runtime.setTimeout(() => {
        subscriptionHealthTimer = null;
        runSubscriptionHealthCheck('interval');
    }, SUBSCRIPTION_HEALTH_CHECK_INTERVAL_MS);
    return true;
}

function runSubscriptionHealthCheck(reason = 'manual') {
    if (!runtime
        || runtime.isDisposed?.()
        || typeof unsubscribeTableUpdate !== 'function') {
        return false;
    }

    subscriptionHealthCheckCount += 1;
    lastSubscriptionHealthCheckAt = Date.now();
    lastSubscriptionHealthCheckReason = String(reason || 'manual');
    try {
        lastSubscriptionHealthCheckOk = deps.ensureTableUpdateListenerCurrent() === true;
    } catch (error) {
        lastSubscriptionHealthCheckOk = false;
        logger.warn({
            action: 'table-update.subscription-health',
            message: '审核服务检查表格更新 broker 绑定失败',
            error,
            context: { reason: lastSubscriptionHealthCheckReason },
        });
    }
    scheduleSubscriptionHealthCheck();
    return lastSubscriptionHealthCheckOk;
}

function ensureTableUpdateSubscription() {
    if (!runtime || runtime.isDisposed?.()) return false;
    if (typeof unsubscribeTableUpdate === 'function') {
        scheduleSubscriptionHealthCheck();
        return true;
    }

    let unsubscribe = null;
    try {
        unsubscribe = deps.subscribeTableUpdate(handleTableUpdate);
    } catch (error) {
        logger.warn({
            action: 'table-update.subscribe',
            message: '审核服务表格更新订阅失败，将等待恢复',
            error,
        });
    }
    if (typeof unsubscribe !== 'function') {
        scheduleSubscriptionRetry();
        return false;
    }

    unsubscribeTableUpdate = unsubscribe;
    clearSubscriptionRetry();
    scheduleSubscriptionHealthCheck();
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
        reviewSession?.beginPreSnapshot('generation-started', readNormalizedSnapshot());
        resetReviewState('已捕获 AI 回复前表格基准，等待本楼更新', {
            chatKey: currentChatKey,
        });
    } catch (error) {
        logger.warn({ action: 'generation-started.failed', message: '捕获 AI 回复前快照失败', error });
        setReviewState(buildErrorPayload(error));
    }
}

function handleAiFloor(payload, reason) {
    try {
        reviewSession?.openAiFloor(
            resolveEventFloorPayload(payload),
            reason,
            readNormalizedSnapshot(),
        );
        resetReviewState('已建立最近 AI 楼审核会话，等待表格更新', {
            chatKey: currentChatKey,
        });
    } catch (error) {
        logger.warn({ action: 'ai-floor.failed', message: '建立 AI 楼审核会话失败', error, context: { reason } });
        setReviewState(buildErrorPayload(error));
    }
}

function handleMessageSent() {
    reviewSession?.closeReceivingWindow('message-sent');
}

function handleChatChanged(chatId) {
    clearPendingRefresh();
    clearSubscriptionRetry();
    clearSubscriptionHealthCheck();
    clearPendingPayloads();
    lastCompleteRawSnapshot = null;
    currentChatKey = normalizeChatKey(chatId)
        || normalizeChatKey(deps.readCurrentChatKey?.());
    reviewSession?.resetReviewSession('chat-changed');
    resetReviewState('聊天已切换，审核会话已重置', {
        chatKey: currentChatKey,
    });
    if (typeof unsubscribeTableUpdate === 'function') {
        runSubscriptionHealthCheck('chat-changed');
    } else {
        ensureTableUpdateSubscription();
    }
}

export function startTableUpdateReviewService(options = {}) {
    if (runtime && !runtime.isDisposed?.()) {
        if (subscriptionRetryTimer !== null) return false;
        return ensureTableUpdateSubscription();
    }

    deps = { ...defaultDeps, ...options };
    currentChatKey = normalizeChatKey(deps.readCurrentChatKey?.());
    runtime = deps.createRuntimeScope();
    runtime.registerCleanup(() => {
        clearPendingPayloads();
        const unsubscribe = unsubscribeTableUpdate;
        unsubscribeTableUpdate = null;
        try { unsubscribe?.(); } catch {}
    });
    floorWindow = deps.createFloorWindow(runtime);
    reviewSession = deps.createSession({
        readSnapshot: () => (
            typeof deps.readRawSnapshot === 'function'
                ? readNormalizedSnapshot()
                : deps.readSnapshot()
        ),
    });

    registerAsyncCleanup(deps.onGenerationStarted(handleGenerationStarted));
    registerAsyncCleanup(deps.onMessageReceived((payload) => handleAiFloor(payload, 'message-received')));
    registerAsyncCleanup(deps.onCharacterMessageRendered((payload) => handleAiFloor(payload, 'character-message-rendered')));
    registerAsyncCleanup(deps.onMessageSent(handleMessageSent));
    registerAsyncCleanup(deps.onChatChanged(handleChatChanged));

    const subscribed = ensureTableUpdateSubscription();

    resetReviewState('等待最近 AI 回复触发表格更新', {
        chatKey: currentChatKey,
    });
    logger.debug({
        action: 'service.start',
        message: subscribed ? '表格更新审核服务已启动' : '表格更新审核服务等待数据库回调可用',
    });
    return subscribed;
}

export function stopTableUpdateReviewService() {
    if (!runtime) return false;
    clearPendingRefresh();
    clearSubscriptionRetry();
    clearSubscriptionHealthCheck();
    clearPendingPayloads();
    lastCompleteRawSnapshot = null;
    const unsubscribe = unsubscribeTableUpdate;
    unsubscribeTableUpdate = null;
    try { unsubscribe?.(); } catch {}
    try { floorWindow?.dispose?.(); } catch {}
    floorWindow = null;
    reviewSession?.resetReviewSession('service-stopped');
    reviewSession = null;
    runtime.dispose();
    runtime = null;
    debounceTimer = null;
    subscriptionRetryTimer = null;
    subscriptionRetryAttempt = 0;
    subscriptionHealthTimer = null;
    subscriptionHealthCheckCount = 0;
    lastSubscriptionHealthCheckAt = 0;
    lastSubscriptionHealthCheckOk = null;
    lastSubscriptionHealthCheckReason = '';
    pendingRawSnapshot = null;
    lastCompleteRawSnapshot = null;
    currentChatKey = '';
    deps = { ...defaultDeps };
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
        tableUpdateSubscribed: typeof unsubscribeTableUpdate === 'function',
        subscriptionStatus: typeof unsubscribeTableUpdate === 'function' ? 'ready' : 'waiting',
        subscriptionRetryAttempt,
        hasSubscriptionRetryTimer: subscriptionRetryTimer !== null,
        hasSubscriptionHealthTimer: subscriptionHealthTimer !== null,
        subscriptionHealthCheckIntervalMs: SUBSCRIPTION_HEALTH_CHECK_INTERVAL_MS,
        subscriptionHealthCheckCount,
        lastSubscriptionHealthCheckAt,
        lastSubscriptionHealthCheckOk,
        lastSubscriptionHealthCheckReason,
        currentChatKey,
    };
}
