const AI_MESSAGE_TYPES = new Set(['text', 'voice', 'image', 'video', 'sticker', 'transfer']);
const ACTION_NAMES = new Set(['message', 'read', 'none', 'create-private', 'create-group', 'group', 'transfer']);
const GROUP_ACTIONS = new Set([
    'rename', 'add', 'remove', 'appoint-admin', 'revoke-admin', 'mute', 'unmute',
    'kick', 'leave', 'reinvite', 'transfer-owner', 'dissolve',
]);
const TRANSFER_ACTIONS = new Set(['accept', 'reject']);
const MUTE_DURATION_ALIASES = Object.freeze({
    '10分钟': '10 分钟',
    '1小时': '1 小时',
    '1天': '1 天',
    '7天': '7 天',
});

function asText(value, maxLength = 0) {
    const text = String(value ?? '').trim();
    return maxLength > 0 ? text.slice(0, maxLength) : text;
}

function requireText(value, label, maxLength = 0) {
    const text = asText(value, maxLength);
    if (!text) throw new QQV2ProtocolError(`${label}不能为空`);
    return text;
}

function attributesOf(element) {
    return Array.from(element?.attributes || []).map((attribute) => [attribute.name, attribute.value]);
}

function rejectUnknownAttributes(element, allowed) {
    for (const [name] of attributesOf(element)) {
        if (!allowed.has(name)) {
            throw new QQV2ProtocolError(`${element.tagName} 包含未知属性 ${name}`);
        }
    }
}

function ensureLeafText(element) {
    const children = Array.from(element?.children || []);
    if (children.length > 0) throw new QQV2ProtocolError(`${element.tagName} 不允许嵌套节点`);
    const nonTextChild = Array.from(element?.childNodes || []).some((child) => child.nodeType !== 3 && child.nodeType !== 4);
    if (nonTextChild) throw new QQV2ProtocolError(`${element.tagName} 只允许文本内容`);
}

function parseList(value) {
    const seen = new Set();
    return String(value ?? '').split(',').map((item) => asText(item, 256)).filter((item) => {
        if (!item || seen.has(item)) return false;
        seen.add(item);
        return true;
    });
}

function textIsEmpty(element) {
    return !asText(element?.textContent);
}

function parseMessage(element) {
    rejectUnknownAttributes(element, new Set(['conversation', 'sender', 'type', 'quote', 'mentions', 'all', 'sticker', 'amount', 'note', 'recipient']));
    ensureLeafText(element);
    const messageType = requireText(element.getAttribute('type'), '消息类型', 32);
    if (!AI_MESSAGE_TYPES.has(messageType)) throw new QQV2ProtocolError('AI 不支持该消息类型');
    const all = element.getAttribute('all');
    if (all !== null && all !== 'true' && all !== 'false') throw new QQV2ProtocolError('all 只能是 true 或 false');
    const stickerId = asText(element.getAttribute('sticker'), 256);
    if (messageType === 'sticker' && !stickerId) throw new QQV2ProtocolError('表情消息必须提供 sticker');
    if (messageType !== 'sticker' && stickerId) throw new QQV2ProtocolError('只有表情消息可以提供 sticker');
    const amount = asText(element.getAttribute('amount'), 64);
    const recipient = asText(element.getAttribute('recipient'), 256);
    if (messageType === 'transfer' && (!amount || !recipient)) {
        throw new QQV2ProtocolError('转账消息必须提供 amount 和 recipient');
    }
    if (messageType !== 'transfer' && (amount || recipient)) {
        throw new QQV2ProtocolError('只有转账消息可以提供 amount 或 recipient');
    }
    return {
        type: 'message',
        conversation: requireText(element.getAttribute('conversation'), '会话引用', 256),
        sender: requireText(element.getAttribute('sender'), '发送者', 256),
        messageType,
        content: requireText(element.textContent, '消息内容', 12000),
        quote: asText(element.getAttribute('quote'), 256),
        mentions: parseList(element.getAttribute('mentions')),
        mentionAll: all === 'true',
        ...(stickerId ? { stickerId } : {}),
        ...(messageType === 'transfer' ? { amount, note: asText(element.getAttribute('note'), 2000), recipient } : {}),
    };
}

function parseRead(element) {
    rejectUnknownAttributes(element, new Set(['conversation']));
    ensureLeafText(element);
    if (!textIsEmpty(element)) throw new QQV2ProtocolError('read 不允许文本内容');
    return { type: 'read', conversation: requireText(element.getAttribute('conversation'), '会话引用', 256) };
}

function parseNone(element) {
    rejectUnknownAttributes(element, new Set());
    ensureLeafText(element);
    if (!textIsEmpty(element)) throw new QQV2ProtocolError('none 不允许文本内容');
    return { type: 'none' };
}

function parseCreatePrivate(element) {
    rejectUnknownAttributes(element, new Set(['id', 'name']));
    ensureLeafText(element);
    if (!textIsEmpty(element)) throw new QQV2ProtocolError('create-private 不允许文本内容');
    return {
        type: 'create-private',
        id: requireText(element.getAttribute('id'), '新私聊引用', 256),
        name: requireText(element.getAttribute('name'), '人物名字', 120),
    };
}

function parseCreateGroup(element) {
    rejectUnknownAttributes(element, new Set(['id', 'name', 'owner', 'members']));
    ensureLeafText(element);
    if (!textIsEmpty(element)) throw new QQV2ProtocolError('create-group 不允许文本内容');
    const members = parseList(element.getAttribute('members'));
    if (members.length < 2) throw new QQV2ProtocolError('新群聊至少需要两名成员');
    return {
        type: 'create-group',
        id: requireText(element.getAttribute('id'), '新群聊引用', 256),
        name: requireText(element.getAttribute('name'), '群名称', 120),
        owner: requireText(element.getAttribute('owner'), '群主', 256),
        members,
    };
}

function parseGroupAction(element) {
    rejectUnknownAttributes(element, new Set(['conversation', 'action', 'actor', 'target', 'value', 'duration', 'id', 'name']));
    ensureLeafText(element);
    if (!textIsEmpty(element)) throw new QQV2ProtocolError('group 不允许文本内容');
    const action = requireText(element.getAttribute('action'), '群管理动作', 64);
    if (!GROUP_ACTIONS.has(action)) throw new QQV2ProtocolError('不支持的群管理动作');
    const id = asText(element.getAttribute('id'), 256);
    const name = asText(element.getAttribute('name'), 120);
    const rawDuration = asText(element.getAttribute('duration'), 32);
    return {
        type: 'group',
        conversation: requireText(element.getAttribute('conversation'), '群聊引用', 256),
        action,
        actor: requireText(element.getAttribute('actor'), '群管理操作者', 256),
        target: asText(element.getAttribute('target'), 256),
        value: asText(element.getAttribute('value'), 2000),
        duration: MUTE_DURATION_ALIASES[rawDuration] || rawDuration,
        ...(id ? { id } : {}),
        ...(name ? { name } : {}),
    };
}

function parseTransferAction(element) {
    rejectUnknownAttributes(element, new Set(['conversation', 'message', 'actor', 'action']));
    ensureLeafText(element);
    if (!textIsEmpty(element)) throw new QQV2ProtocolError('transfer 不允许文本内容');
    const action = requireText(element.getAttribute('action'), '转账处理动作', 32);
    if (!TRANSFER_ACTIONS.has(action)) throw new QQV2ProtocolError('不支持的转账处理动作');
    return {
        type: 'transfer',
        conversation: requireText(element.getAttribute('conversation'), '会话引用', 256),
        message: requireText(element.getAttribute('message'), '转账消息引用', 256),
        actor: requireText(element.getAttribute('actor'), '转账处理人', 256),
        action,
    };
}

function defaultParseDocument(xml) {
    if (typeof DOMParser !== 'function') {
        throw new QQV2ProtocolError('当前环境不支持 XML DOMParser');
    }
    return new DOMParser().parseFromString(xml, 'application/xml');
}

function rawHasExactlyOneRoot(xml) {
    const normal = /^\s*<qq(?:\s[^>]*)?>([\s\S]*)<\/qq>\s*$/.test(xml);
    const empty = /^\s*<qq(?:\s[^>]*)?\s*\/>\s*$/.test(xml);
    return normal || empty;
}

function extractLatestQQRoot(value) {
    const matches = String(value ?? '').match(/<qq(?:\s[^>]*)?\s*\/>|<qq(?:\s[^>]*)?>[\s\S]*?<\/qq>/g);
    return matches?.[matches.length - 1] || '';
}

/** Parse XML strictly. The browser path always uses DOMParser; tests may inject a DOM factory. */
export function parseQQV2Response(value, options = {}) {
    const xml = extractLatestQQRoot(value);
    if (!rawHasExactlyOneRoot(xml)) throw new QQV2ProtocolError('响应必须且只能包含一个 qq 根节点');
    const parseDocument = typeof options.parseDocument === 'function' ? options.parseDocument : defaultParseDocument;
    const document = parseDocument(xml);
    if (!document || document.getElementsByTagName?.('parsererror')?.length) {
        throw new QQV2ProtocolError('QQ XML 格式无效');
    }
    const roots = Array.from(document.childNodes || []).filter((node) => node.nodeType === 1);
    const root = document.documentElement;
    if (!root || root.tagName !== 'qq' || roots.length !== 1) throw new QQV2ProtocolError('响应必须且只能包含 qq 根节点');
    rejectUnknownAttributes(root, new Set());
    const invalidRootText = Array.from(root.childNodes || []).some((node) => node.nodeType !== 1 && asText(node.textContent));
    if (invalidRootText) throw new QQV2ProtocolError('qq 根节点不能包含未声明文本');

    return Array.from(root.children || []).map((element) => {
        const tag = element.tagName;
        if (!ACTION_NAMES.has(tag)) throw new QQV2ProtocolError(`不支持的 QQ XML 节点 ${tag}`);
        if (tag === 'message') return parseMessage(element);
        if (tag === 'read') return parseRead(element);
        if (tag === 'none') return parseNone(element);
        if (tag === 'create-private') return parseCreatePrivate(element);
        if (tag === 'create-group') return parseCreateGroup(element);
        if (tag === 'transfer') return parseTransferAction(element);
        return parseGroupAction(element);
    });
}

function conversationKind(conversations, reference) {
    const item = conversations instanceof Map ? conversations.get(reference) : conversations?.[reference];
    return item?.kind || '';
}

/** Validate only facts known before persistence; domain command validation runs again at commit time. */
export function validateQQV2ActionBatch(actions, options = {}) {
    if (!Array.isArray(actions)) throw new QQV2ProtocolError('QQ 动作批次必须是数组');
    const scenario = asText(options.scenario, 64);
    const conversations = options.conversations || new Map();
    const stickers = options.stickers instanceof Set ? options.stickers : new Set(options.stickers || []);
    const visibleMessageRefs = options.visibleMessageRefs instanceof Set ? options.visibleMessageRefs : new Set(options.visibleMessageRefs || []);
    const created = new Map();
    let hasMessage = false;
    let hasRead = false;
    let hasNone = false;
    let hasTransfer = false;

    actions.forEach((action) => {
        if (action.type === 'create-private') {
            if (scenario !== 'private-proactive' || created.has(action.id) || conversationKind(conversations, action.id)) {
                throw new QQV2ProtocolError('该场景不能创建私聊或引用重复');
            }
            created.set(action.id, 'private');
            return;
        }
        if (action.type === 'create-group') {
            if (scenario !== 'group-proactive' || created.has(action.id) || conversationKind(conversations, action.id)) {
                throw new QQV2ProtocolError('该场景不能创建群聊或引用重复');
            }
            created.set(action.id, 'group');
            return;
        }
        if (action.type === 'none') {
            if (!['private-proactive', 'group-reply', 'group-proactive'].includes(scenario)) {
                throw new QQV2ProtocolError('当前场景不允许 none');
            }
            hasNone = true;
            return;
        }
        if (action.type === 'read') {
            if (!['private-reply', 'private-proactive'].includes(scenario) || (conversationKind(conversations, action.conversation) || created.get(action.conversation)) !== 'private') {
                throw new QQV2ProtocolError('read 只允许用于私聊');
            }
            hasRead = true;
            return;
        }
        if (action.type === 'transfer') {
            const kind = conversationKind(conversations, action.conversation);
            if (!kind) throw new QQV2ProtocolError('转账动作引用了本次请求之外的会话');
            if (!visibleMessageRefs.has(action.message)) throw new QQV2ProtocolError('转账消息不在本次可见范围内');
            hasTransfer = true;
            return;
        }
        const kind = conversationKind(conversations, action.conversation) || created.get(action.conversation);
        if (!kind) throw new QQV2ProtocolError('动作引用了本次请求之外的会话');
        if (action.type === 'message') {
            if ((scenario.startsWith('private') && kind !== 'private') || (scenario.startsWith('group') && kind !== 'group')) {
                throw new QQV2ProtocolError('消息会话类型与当前场景不一致');
            }
            if (action.quote && !visibleMessageRefs.has(action.quote)) throw new QQV2ProtocolError('引用消息不在本次可见范围内');
            if (action.messageType === 'sticker' && !stickers.has(action.stickerId)) throw new QQV2ProtocolError('表情 ID 不在可用表情库中');
            hasMessage = true;
            return;
        }
        if (action.type === 'group' && kind !== 'group') throw new QQV2ProtocolError('群管理动作必须引用群聊');
    });

    if (['private-reply', 'group-reply'].includes(scenario) && actions.length === 0) {
        throw new QQV2ProtocolError('回复动作不能为空');
    }
    if (hasNone && actions.length !== 1) throw new QQV2ProtocolError('none 必须是唯一动作');
    if (scenario === 'private-reply' && (
        (!hasMessage && !hasRead && !hasTransfer)
        || (hasRead && (hasMessage || hasTransfer))
    )) {
        throw new QQV2ProtocolError('私聊回复必须返回消息、转账处理或 read，且 read 不能与其他回复并存');
    }
    return actions.map((action) => ({ ...action }));
}

export class QQV2ProtocolError extends Error {
    constructor(message) {
        super(message);
        this.name = 'QQV2ProtocolError';
        this.code = 'protocol_invalid';
    }
}
