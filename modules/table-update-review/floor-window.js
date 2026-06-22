import { Logger } from '../error-handler.js';
import {
    onChatChanged,
    onMessageSent,
    onMessageReceived,
    onCharacterMessageRendered,
} from '../integration/event-bridge.js';
import { getLastMessageId } from '../integration/tavern-helper-bridge.js';

const logger = Logger.withScope({ scope: 'table-update-review/floor-window', feature: 'table-update-review' });

let currentWindow = {
    floorId: -1,
    floorLabel: '',
    status: 'idle',
    startedAt: 0,
    updatedAt: 0,
};

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

function getFallbackFloorId() {
    return normalizeFloorId(getLastMessageId());
}

function setWindow(next = {}) {
    const now = Date.now();
    const floorId = normalizeFloorId(next.floorId);
    currentWindow = {
        floorId,
        floorLabel: floorId >= 0 ? `#${floorId}` : '',
        status: String(next.status || 'active'),
        startedAt: Number.isFinite(Number(next.startedAt)) ? Number(next.startedAt) : now,
        updatedAt: now,
    };
    return getCurrentReviewFloorWindow();
}

function markCharacterFloor(payload) {
    const floorId = resolveEventFloorId(payload);
    setWindow({ floorId: floorId >= 0 ? floorId : getFallbackFloorId(), status: 'character-floor' });
}

function closeReceivingWindow(status = 'message-sent') {
    currentWindow = { ...currentWindow, status, updatedAt: Date.now() };
    return getCurrentReviewFloorWindow();
}

function resetWindow(status = 'idle') {
    currentWindow = {
        floorId: -1,
        floorLabel: '',
        status,
        startedAt: 0,
        updatedAt: Date.now(),
    };
}

function registerAsyncCleanup(runtime, promise) {
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
        .catch((error) => logger.warn({ action: 'event.subscribe', message: '审核楼层窗口事件订阅失败', error }));
}

export function getCurrentReviewFloorWindow() {
    return { ...currentWindow };
}

export function createTableUpdateReviewFloorWindow(runtime) {
    resetWindow('started');
    registerAsyncCleanup(runtime, onCharacterMessageRendered(markCharacterFloor));
    registerAsyncCleanup(runtime, onMessageReceived(markCharacterFloor));
    registerAsyncCleanup(runtime, onMessageSent(() => closeReceivingWindow('message-sent')));
    registerAsyncCleanup(runtime, onChatChanged(() => resetWindow('chat-changed')));

    return {
        getCurrent: getCurrentReviewFloorWindow,
        dispose() {
            resetWindow('stopped');
        },
    };
}
