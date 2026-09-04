import { normalizeComposerSubmission } from './composer.js';

function asText(value) {
    return String(value ?? '').trim();
}

function messageContent(message) {
    if (message?.type === 'transfer') {
        const transfer = message.transfer || {};
        return `${asText(transfer.amount)} ${asText(transfer.currency)}`.trim();
    }
    return String(message?.content ?? '');
}

function cloneQuote(value) {
    if (!value?.messageId) return null;
    const quote = {
        messageId: asText(value.messageId),
        content: String(value.content ?? ''),
    };
    const senderName = asText(value.senderName);
    const storyTime = asText(value.storyTime);
    if (senderName) quote.senderName = senderName;
    if (storyTime) quote.storyTime = storyTime;
    return Object.freeze(quote);
}

async function writeToClipboard(value) {
    if (globalThis.navigator?.clipboard?.writeText) return globalThis.navigator.clipboard.writeText(value);
    const document = globalThis.document;
    if (!document?.createElement || !document.body) return false;
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    document.execCommand?.('copy');
    textarea.remove();
    return true;
}

export function quotePreviewText(quote) {
    return quote?.status === 'deleted' ? '原消息已删除' : String(quote?.content ?? '');
}

export function createQuoteDrafts() {
    const values = new Map();
    return Object.freeze({
        select(conversationId, message) {
            const id = asText(conversationId);
            const quote = cloneQuote({
                messageId: message?.messageId,
                content: messageContent(message),
                senderName: message?.senderName,
                storyTime: message?.storyTime,
            });
            if (!id || !quote) return false;
            values.set(id, quote);
            return true;
        },
        get(conversationId) {
            return values.get(asText(conversationId)) || null;
        },
        clear(conversationId) {
            return values.delete(asText(conversationId));
        },
        clearAll() {
            values.clear();
        },
    });
}

export async function copyMessageText(message, { writeText = writeToClipboard } = {}) {
    const content = messageContent(message);
    if (typeof writeText !== 'function') return false;
    await writeText(content);
    return true;
}

export async function submitQuotedTextMessage({
    facade,
    conversationId,
    content,
    quotes,
    messageFields = {},
} = {}) {
    const submission = normalizeComposerSubmission(content);
    if (!submission.ok) return submission;
    if (typeof facade?.intent?.sendMessage !== 'function') {
        return Object.freeze({ ok: false, status: 'unavailable', reason: 'sendMessage-unavailable' });
    }
    const quote = quotes?.get?.(conversationId);
    const result = await facade.intent.sendMessage({
        conversationId: asText(conversationId),
        message: {
            ...messageFields,
            type: 'text',
            content: submission.content,
            ...(quote?.messageId ? { quoteMessageId: quote.messageId } : {}),
        },
    });
    if (result?.ok) quotes?.clear?.(conversationId);
    return result;
}

export function createMessageMenuController({
    open = () => {},
    longPress = open,
    longPressMs = 500,
    moveTolerance = 8,
    now = () => Date.now(),
    setTimeoutFn = globalThis.setTimeout,
    clearTimeoutFn = globalThis.clearTimeout,
} = {}) {
    let timer = null;
    let activePointer = null;
    let suppressContextUntil = 0;
    let suppressClickUntil = 0;

    const clearLongPress = () => {
        if (timer !== null) clearTimeoutFn?.(timer);
        timer = null;
        activePointer = null;
    };
    const invoke = (callback, payload, { suppressContext = false, suppressClick = false } = {}) => {
        if (!payload?.conversationId || !payload?.message?.messageId) return false;
        clearLongPress();
        const suppressUntil = Number(now()) + Number(longPressMs);
        if (suppressContext) suppressContextUntil = suppressUntil;
        if (suppressClick) suppressClickUntil = suppressUntil;
        callback(Object.freeze({ conversationId: payload.conversationId, message: payload.message }));
        return true;
    };
    const openMenu = (payload) => invoke(open, payload);

    return Object.freeze({
        open: openMenu,
        handlePointerDown(event, payload) {
            const pointerType = String(event?.pointerType || '');
            if (event?.isPrimary === false
                || (pointerType !== 'touch' && !(pointerType === 'mouse' && event?.button === 0))) return false;
            clearLongPress();
            activePointer = {
                pointerId: event.pointerId,
                startX: Number(event.clientX) || 0,
                startY: Number(event.clientY) || 0,
            };
            timer = setTimeoutFn?.(
                () => invoke(longPress, payload, { suppressContext: true, suppressClick: true }),
                longPressMs,
            ) ?? null;
            return true;
        },
        handlePointerEnd(event) {
            if (activePointer && event?.pointerId !== activePointer.pointerId) return false;
            clearLongPress();
            return true;
        },
        handlePointerMove(event) {
            if (!activePointer || event?.pointerId !== activePointer.pointerId) return false;
            const horizontal = (Number(event.clientX) || 0) - activePointer.startX;
            const vertical = (Number(event.clientY) || 0) - activePointer.startY;
            if (Math.hypot(horizontal, vertical) <= Math.max(0, Number(moveTolerance) || 0)) return false;
            clearLongPress();
            return true;
        },
        handleClick(event) {
            if (Number(now()) >= suppressClickUntil) return false;
            suppressClickUntil = 0;
            event?.preventDefault?.();
            event?.stopPropagation?.();
            return true;
        },
        handleContextMenu(event, payload) {
            event?.preventDefault?.();
            if (Number(now()) < suppressContextUntil) return false;
            return openMenu(payload);
        },
        dispose: clearLongPress,
    });
}
