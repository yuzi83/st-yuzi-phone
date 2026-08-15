import { parseQQV2Response, validateQQV2ActionBatch } from './xml.js';
import { mapQQV2StickerActionReferences } from '../prompt/sticker-catalog.js';

function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asReferenceSet(value) {
    if (value instanceof Map) return new Set(value.keys());
    if (value instanceof Set) return new Set(value);
    if (Array.isArray(value)) return new Set(value);
    return new Set(Object.keys(asObject(value)));
}

function mapReference(value, references) {
    return Object.prototype.hasOwnProperty.call(references, value) ? references[value] : value;
}

function mapActionReferences(action, personReferences, messageReferences) {
    const mapped = { ...action };
    for (const key of ['sender', 'senderPersonReference', 'actor', 'target', 'recipient']) {
        if (mapped[key]) mapped[key] = mapReference(mapped[key], personReferences);
    }
    if (mapped.owner) mapped.owner = mapReference(mapped.owner, personReferences);
    if (Array.isArray(mapped.members)) {
        mapped.members = mapped.members.map((reference) => mapReference(reference, personReferences));
    }
    if (Array.isArray(mapped.mentions)) {
        mapped.mentions = mapped.mentions.map((reference) => mapReference(reference, personReferences));
    }
    for (const key of ['quote', 'message']) {
        if (mapped[key]) mapped[key] = mapReference(mapped[key], messageReferences);
    }
    return mapped;
}

/**
 * XML 到领域事务的唯一执行入口。解析、预校验与仓储提交分层，但任何仓储动作仍在同一事务中完成。
 */
export function createQQV2ActionService(options = {}) {
    const repository = options.repository;
    if (!repository || typeof repository.getConversation !== 'function' || typeof repository.applyAIActions !== 'function') {
        throw new TypeError('QQ v2 action service 需要 repository');
    }
    const parseResponse = typeof options.parseResponse === 'function' ? options.parseResponse : parseQQV2Response;
    const validateActions = typeof options.validateActions === 'function' ? options.validateActions : validateQQV2ActionBatch;

    return Object.freeze({
        async execute(input = {}) {
            const scopeId = String(input.scopeId ?? '').trim();
            if (!scopeId) throw new TypeError('QQ v2 action service 需要 scopeId');
            const isCurrent = typeof input.isCurrent === 'function' ? input.isCurrent : () => true;
            if (!isCurrent()) {
                const error = new Error('QQ AI 动作批次已被新的请求取代');
                error.code = 'request_cancelled';
                throw error;
            }
            const references = asObject(input.references);
            const conversations = new Map();
            for (const [reference, conversationId] of Object.entries(references)) {
                conversations.set(reference, await repository.getConversation(scopeId, conversationId));
            }
            const messageReferences = asObject(input.messageReferences);
            const visibleMessageRefs = asReferenceSet(input.visibleMessageRefs);
            const actions = await parseResponse(input.response, input.parseOptions || {});
            await validateActions(actions, {
                scenario: input.scenario,
                conversations,
                stickers: input.stickers,
                visibleMessageRefs,
            });
            const personReferences = asObject(input.personReferences);
            const mappedActions = mapQQV2StickerActionReferences(
                actions.map((action) => mapActionReferences(action, personReferences, messageReferences)),
                asObject(input.stickerReferences),
            );
            if (!isCurrent()) {
                const error = new Error('QQ AI 动作批次已被新的请求取代');
                error.code = 'request_cancelled';
                throw error;
            }
            return repository.applyAIActions(scopeId, mappedActions, {
                references,
                storyTime: input.storyTime,
                handledUserSequences: input.handledUserSequences,
                scopeSession: input.scopeSession,
                isCurrent,
            });
        },
    });
}
