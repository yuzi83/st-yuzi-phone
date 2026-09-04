const NARRATIVE_TYPES = new Set(['voice', 'image', 'video', 'sticker']);

function asText(value) {
    return String(value ?? '').trim();
}

function unavailable(capability) {
    return Object.freeze({
        ok: false,
        status: 'unavailable',
        reason: String(capability) + '-unavailable',
    });
}

export function voiceDurationSeconds(content) {
    return Math.max(1, Math.ceil(Array.from(String(content ?? '')).length / 6));
}

export function createNarrativeMessage(type, content) {
    const normalizedType = asText(type);
    if (!NARRATIVE_TYPES.has(normalizedType)) {
        throw new TypeError('Narrative message type is not supported');
    }
    return Object.freeze({ type: normalizedType, content: asText(content) });
}

export function createTransferMessage({ amount, currency, note, recipientId } = {}) {
    const normalizedNote = asText(note);
    const normalizedRecipientId = asText(recipientId);
    return Object.freeze({
        type: 'transfer',
        content: normalizedNote,
        transfer: Object.freeze({
            amount: asText(amount),
            currency: asText(currency),
            note: normalizedNote,
            status: 'pending',
            ...(normalizedRecipientId ? { recipientId: normalizedRecipientId } : {}),
        }),
    });
}

export function transferStatusLabel(message) {
    const status = asText(message?.transfer?.status) || 'pending';
    if (status === 'accepted') return '已收款';
    if (status === 'rejected') return '已拒收';
    if (status === 'returned') return '已退还';
    if (message?.senderType === 'self') return '待对方收款';
    const recipientId = asText(message?.transfer?.recipientId);
    return recipientId && recipientId !== '__self__' ? '待收款' : '待你收款';
}

export async function submitNarrativeMessage({ facade, conversationId, type, content } = {}) {
    if (typeof facade?.intent?.sendMessage !== 'function') return unavailable('sendMessage');
    return facade.intent.sendMessage({
        conversationId: asText(conversationId),
        message: createNarrativeMessage(type, content),
    });
}

export async function submitTransferMessage({ facade, conversationId, amount, currency, note, recipientId } = {}) {
    if (typeof facade?.intent?.sendMessage !== 'function') return unavailable('sendMessage');
    return facade.intent.sendMessage({
        conversationId: asText(conversationId),
        message: createTransferMessage({ amount, currency, note, recipientId }),
    });
}

export async function handleIncomingTransfer({ facade, conversationId, messageId, action } = {}) {
    if (typeof facade?.intent?.handleIncomingTransfer !== 'function') return unavailable('handleIncomingTransfer');
    return facade.intent.handleIncomingTransfer({
        conversationId: asText(conversationId),
        messageId: asText(messageId),
        action: asText(action),
    });
}
