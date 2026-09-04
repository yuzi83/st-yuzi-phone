import { formatQQV2MessageSemantic, qqV2MessageType } from '../domain/message-semantics.js';
import { filterQQV2StoryContent } from '../domain/story-context-tags.js';
import {
    QQ_V2_PROMPT_PLACEHOLDER_DEFINITIONS,
    QQ_V2_PROMPT_PLACEHOLDERS,
} from './placeholders.js';

const BUILT_IN_PLACEHOLDERS = Object.freeze(Object.fromEntries(
    QQ_V2_PROMPT_PLACEHOLDER_DEFINITIONS.map(({ token, variable }) => [token, variable]),
));

function asText(value) {
    return String(value ?? '');
}

function materializedValue(value) {
    const text = asText(value).trim();
    return text || '无';
}

function asMessageBlocks(presetOrBlocks) {
    if (Array.isArray(presetOrBlocks)) return presetOrBlocks;
    if (Array.isArray(presetOrBlocks?.blocks)) return presetOrBlocks.blocks;
    if (Array.isArray(presetOrBlocks?.messages)) return presetOrBlocks.messages;
    return [];
}

function messageRole(message) {
    if (message?.role === 'user' || message?.role === 'assistant' || message?.role === 'system') {
        return message.role;
    }
    if (message?.senderType === 'self' || message?.sender === 'self') return 'user';
    if (message?.senderType === 'system' || message?.sender === 'system') return 'system';
    return 'assistant';
}

function isVisibleMessage(message) {
    return Boolean(message) && message.deleted !== true && message.isDeleted !== true;
}

function historyMessage(message) {
    return Object.freeze({
        role: messageRole(message),
        content: asText(message?.content ?? message?.text ?? message?.body),
    });
}

function sameMessage(left, right) {
    const leftId = asText(left?.id ?? left?.messageId);
    const rightId = asText(right?.id ?? right?.messageId);
    if (leftId && rightId) return leftId === rightId;
    return messageRole(left) === messageRole(right)
        && historyMessage(left).content === historyMessage(right).content;
}

function positiveInteger(value) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : 0;
}

function isSuccessfulStoryReply(message) {
    return message?.role === 'assistant'
        && message?.isSystem !== true
        && message?.is_system !== true
        && message?.isHidden !== true
        && message?.is_hidden !== true
        && message?.isSuccessful !== false
        && message?.is_successful !== false;
}

function escapeXml(value) {
    return asText(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}

function proactiveSender(message) {
    if (message?.senderType === 'self' || message?.sender === 'self') return 'user';
    if (message?.senderType === 'system' || message?.sender === 'system') return 'system';
    return 'npc';
}

function proactivePersonName(conversation, personId) {
    if (personId === '__self__') return '用户';
    const peopleById = conversation?.peopleById;
    const person = peopleById instanceof Map ? peopleById.get(personId) : peopleById?.[personId];
    if (typeof person === 'string') return asText(person);
    if (person && typeof person === 'object') return asText(person.formalName ?? person.name);
    if (conversation?.personId === personId) return asText(conversation?.title ?? conversation?.name);
    return '';
}

function memoryMessages(section) {
    return (Array.isArray(section?.messages) ? section.messages : [])
        .filter(isVisibleMessage)
        .map((message) => {
            const sender = message?.senderType === 'system'
                ? '系统'
                : message?.senderId === '__self__' || message?.senderType === 'self'
                    ? '用户'
                    : proactivePersonName(section, message?.senderId) || '成员';
            return `<message sender="${escapeXml(sender)}" type="${escapeXml(qqV2MessageType(message))}">${escapeXml(
                formatQQV2MessageSemantic(message, {
                    resolvePersonName: (personId) => proactivePersonName(section, personId),
                }),
            )}</message>`;
        })
        .join('');
}

/**
 * 将用户可编辑的消息块原样保留角色和顺序，仅替换 QQ 已声明的占位符。
 */
export function materializeQQV2PromptBlocks(blocks, variables = {}) {
    return Object.freeze(asMessageBlocks(blocks).map((block) => {
        let content = asText(block?.content);
        for (const [placeholder, key] of Object.entries(BUILT_IN_PLACEHOLDERS)) {
            content = content.replaceAll(placeholder, materializedValue(variables[key]));
        }
        return Object.freeze({
            role: messageRole(block),
            content,
        });
    }));
}

/**
 * 手动回复的角色历史只来自当前 QQ 会话，并作为真实角色消息追加一次。
 */
export function buildManualQQV2Request({ preset, variables = {}, history = [], currentMessage } = {}) {
    const request = [...materializeQQV2PromptBlocks(preset, variables)];
    const visibleHistory = Array.isArray(history) ? history.filter(isVisibleMessage) : [];
    request.push(...visibleHistory.map(historyMessage));

    if (currentMessage && !visibleHistory.some((message) => sameMessage(message, currentMessage))) {
        request.push(historyMessage(currentMessage));
    }
    return Object.freeze(request.map((message) => Object.freeze({ ...message })));
}

/**
 * 主动请求不附加 OpenAI 角色历史；会话资料只能经用户放入的分区占位符进入预设块。
 */
export function buildProactiveQQV2Request({ preset, variables = {} } = {}) {
    return materializeQQV2PromptBlocks(preset, variables);
}

/**
 * 读取最近 N 条成功完成的正文 AI 回复。0 表示全部正文 AI 回复；用户消息不进入。
 */
export function buildQQV2StoryContext(messages, turns = 0, tagSettings = {}) {
    const history = Array.isArray(messages) ? messages : [];
    const limit = positiveInteger(turns);
    const replies = history.filter(isSuccessfulStoryReply);
    const selectedReplies = limit ? replies.slice(-limit) : replies;
    const text = selectedReplies
        .map((message) => filterQQV2StoryContent(message?.content, tagSettings))
        .filter(Boolean)
        .join('\n\n');
    return text || '无';
}

/**
 * 主动预设使用一次请求内短引用和 XML 分区展示多个会话，不伪装成角色历史。
 */
export function buildQQV2ProactiveSections({ kind, conversations = [] } = {}) {
    const tag = kind === 'group' ? 'group' : 'private';
    const prefix = tag === 'group' ? 'G' : 'P';
    return (Array.isArray(conversations) ? conversations : []).map((conversation, index) => {
        const referenceId = asText(conversation?.referenceId || `${prefix}${index + 1}`);
        const title = asText(conversation?.title ?? conversation?.name);
        const members = Array.isArray(conversation?.members)
            ? conversation.members.map((member) => asText(member)).filter(Boolean).join('、')
            : asText(conversation?.members);
        const attributes = [`id="${escapeXml(referenceId)}"`, `name="${escapeXml(title)}"`];
        if (tag === 'group' && members) attributes.push(`members="${escapeXml(members)}"`);
        const messages = (Array.isArray(conversation?.messages) ? conversation.messages : [])
            .filter(isVisibleMessage)
            .map((message, messageIndex) => `<message id="${escapeXml(`${referenceId}-M${messageIndex + 1}`)}" sender="${proactiveSender(message)}" type="${escapeXml(qqV2MessageType(message))}">${escapeXml(
                formatQQV2MessageSemantic(message, {
                    resolvePersonName: (personId) => proactivePersonName(conversation, personId),
                }),
            )}</message>`)
            .join('');
        return `<${tag} ${attributes.join(' ')}>${messages}</${tag}>`;
    }).join('\n') || '无';
}

export function buildQQV2GroupMemorySections(groups = []) {
    return (Array.isArray(groups) ? groups : []).map((group) => {
        const knownBy = Array.isArray(group?.knownBy)
            ? group.knownBy.map(asText).filter(Boolean).join(',')
            : asText(group?.knownBy);
        const attributes = [
            `conversation="${escapeXml(group?.conversationId)}"`,
            `name="${escapeXml(group?.name)}"`,
            ...(knownBy ? [`known-by="${escapeXml(knownBy)}"`] : []),
        ];
        return `<group-memory ${attributes.join(' ')}>${memoryMessages(group)}</group-memory>`;
    }).join('\n') || '无';
}

export function buildQQV2PrivateMemorySections(conversations = []) {
    return (Array.isArray(conversations) ? conversations : []).map((conversation) => (
        `<private-memory person="${escapeXml(conversation?.personName)}" conversation="${escapeXml(conversation?.conversationId)}">`
        + `${memoryMessages(conversation)}</private-memory>`
    )).join('\n') || '无';
}

export { QQ_V2_PROMPT_PLACEHOLDERS };
