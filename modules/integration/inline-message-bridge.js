import { getFreshSillyTavernContext } from './context-bridge.js';
import { EventTypes, onEvent } from './event-bridge.js';

// 只读宿主数据与显示节点；不改写 mes、extra 或外部扩展的 DOM。
export function getInlineMessageTarget(documentRef = globalThis.document) {
    const context = getFreshSillyTavernContext();
    const chat = context?.chat;
    if (!Array.isArray(chat)) return null;
    for (let messageId = chat.length - 1; messageId >= 0; messageId--) {
        const message = chat[messageId];
        if (!message || message.is_user || message.is_system) continue;
        const root = documentRef?.querySelector?.(`#chat > .mes[mesid="${messageId}"]`);
        if (!root || root.hidden || root.getClientRects().length === 0) continue;
        const element = root.querySelector('.mes_text');
        if (element) return { element, messageId, chat, message, text: message.mes, swipeId: message.swipe_id };
    }
    return null;
}

export async function subscribeInlineMessageInvalidation(callback) {
    const disposers = [];
    try {
        for (const type of [EventTypes.MESSAGE_SENT, EventTypes.CHAT_CHANGED,
            EventTypes.GENERATION_STARTED, EventTypes.MESSAGE_DELETED,
            EventTypes.MESSAGE_SWIPED, EventTypes.MESSAGE_UPDATED, EventTypes.CHARACTER_MESSAGE_RENDERED]) {
            const dispose = await onEvent(type, (messageId) => {
                const latest = getInlineMessageTarget();
                const targeted = [EventTypes.MESSAGE_UPDATED, EventTypes.CHARACTER_MESSAGE_RENDERED].includes(type);
                if (!targeted || !latest || Number(messageId) === latest.messageId) callback();
            });
            if (typeof dispose === 'function') disposers.push(dispose);
        }
    } catch (error) {
        disposers.forEach(dispose => dispose());
        throw error;
    }
    return () => disposers.forEach(dispose => dispose());
}
