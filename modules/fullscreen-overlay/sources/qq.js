import { TABLE_POPUP_MODEL_ID } from '../settings.js';
import {
    getQQV2Facade,
    subscribeQQV2ProactiveMessages,
} from '../../qq-v2/runtime/default-runtime.js';

export const QQ_FULLSCREEN_OVERLAY_SOURCE_KEY = 'qq';
export const QQ_FULLSCREEN_OVERLAY_SOURCE_ID = 'qq';

function normalizeText(value) {
    return String(value ?? '').trim();
}

function toUnitRandom(random) {
    const value = Number(random());
    return Number.isFinite(value)
        ? Math.max(0, Math.min(1 - Number.EPSILON, value))
        : 0;
}

function toSourceEvent(conversation) {
    const conversationId = normalizeText(conversation?.conversationId);
    const senderName = normalizeText(conversation?.title || conversation?.formalName);
    if (!conversationId
        || !senderName
        || conversation?.kind === 'group'
        || (conversation?.status && conversation.status !== 'active')) {
        return null;
    }
    return Object.freeze({
        conversationId,
        senderName,
        avatarAssetId: normalizeText(conversation?.avatarAssetId),
    });
}

export function createQQFullscreenOverlaySourceAdapter(options = {}) {
    const getFacade = typeof options.getFacade === 'function' ? options.getFacade : getQQV2Facade;
    const subscribeProactiveMessages = typeof options.subscribeProactiveMessages === 'function'
        ? options.subscribeProactiveMessages
        : subscribeQQV2ProactiveMessages;
    const random = typeof options.random === 'function' ? options.random : Math.random;

    const listConversations = async () => {
        const result = await getFacade()?.query?.conversations?.();
        return result?.ok === true && Array.isArray(result.conversations)
            ? result.conversations
            : [];
    };

    return Object.freeze({
        id: QQ_FULLSCREEN_OVERLAY_SOURCE_ID,
        modelId: TABLE_POPUP_MODEL_ID,
        modelIds: Object.freeze([TABLE_POPUP_MODEL_ID]),
        defaultEnabled: true,
        matches(context) {
            return context?.sourceKind === QQ_FULLSCREEN_OVERLAY_SOURCE_ID;
        },
        getSignature() {
            return QQ_FULLSCREEN_OVERLAY_SOURCE_ID;
        },
        readEvents(context) {
            const seen = new Set();
            return Object.freeze((Array.isArray(context?.events) ? context.events : [])
                .map((event) => {
                    const senderName = normalizeText(event?.senderName);
                    const identity = normalizeText(event?.conversationId) || senderName;
                    if (!senderName || !identity || seen.has(identity)) return null;
                    seen.add(identity);
                    return Object.freeze({
                        kind: 'message-notification',
                        sourceId: QQ_FULLSCREEN_OVERLAY_SOURCE_ID,
                        sheetKey: QQ_FULLSCREEN_OVERLAY_SOURCE_KEY,
                        senderName,
                        avatarAssetId: normalizeText(event?.avatarAssetId),
                        text: `${senderName}给你发了1条消息`,
                    });
                })
                .filter(Boolean));
        },
        async readTestEvents() {
            const conversations = (await listConversations())
                .map(toSourceEvent)
                .filter(Boolean);
            if (conversations.length === 0) return [];
            return [conversations[Math.floor(toUnitRandom(random) * conversations.length)]];
        },
        subscribe(listener) {
            if (typeof listener !== 'function') return () => {};
            return subscribeProactiveMessages(async (event) => {
                const requestedIds = [...new Set((Array.isArray(event?.conversationIds)
                    ? event.conversationIds
                    : [])
                    .map(normalizeText)
                    .filter(Boolean))];
                if (requestedIds.length === 0) return;
                const conversationById = new Map((await listConversations())
                    .map(toSourceEvent)
                    .filter(Boolean)
                    .map(item => [item.conversationId, item]));
                const events = requestedIds
                    .map(conversationId => conversationById.get(conversationId))
                    .filter(Boolean);
                if (events.length > 0) await listener(events);
            });
        },
    });
}
