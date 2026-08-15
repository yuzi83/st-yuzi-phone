import { createEmptyQQV2State } from '../storage/state-store.js';
import { QQ_V2_BUILT_IN_PROMPT_PRESET_IDS } from './prompt-preset-ids.js';

const SELF_ID = '__self__';
const SCOPE_SETTINGS_VERSION = 1;
const MESSAGE_TYPES = new Set(['text', 'image', 'video', 'voice', 'transfer', 'sticker', 'system']);
const GROUP_ROLES = new Set(['owner', 'admin', 'member']);
const WORLDBOOK_LIGHTS = new Set(['blue', 'green']);
const WORLDBOOK_TIME_UNITS = new Set(['hour', 'day', 'month', 'year']);
const SHARED_WORLDBOOK_ENABLED_KEY = 'worldbookInjectionEnabled';
const SHARED_IMAGE_LIBRARY_KEY = 'imageLibraryAssets';
const IMAGE_LIBRARY_KINDS = Object.freeze({
    avatar: 'avatar',
    'chat-background': 'background',
    'profile-background': 'profile-background',
});
const MUTE_DURATIONS = Object.freeze({
    '10 分钟': 10,
    '1 小时': 60,
    '1 天': 24 * 60,
    '7 天': 7 * 24 * 60,
    永久: null,
});

function asText(value, maxLength = 0) {
    const text = String(value ?? '').trim();
    return maxLength > 0 ? text.slice(0, maxLength) : text;
}

function requireText(value, label, maxLength = 0) {
    const text = asText(value, maxLength);
    if (!text) throw new QQV2DomainError(`${label}不能为空`);
    return text;
}

function copy(value) {
    if (typeof globalThis.structuredClone === 'function') return globalThis.structuredClone(value);
    if (Array.isArray(value)) return value.map(copy);
    if (!value || typeof value !== 'object') return value;
    if (typeof Blob !== 'undefined' && value instanceof Blob) return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
}

function createId(prefix) {
    const value = typeof globalThis.crypto?.randomUUID === 'function'
        ? globalThis.crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${value}`;
}

function exactContactFormalName(value) {
    const name = String(value ?? '').slice(0, 120);
    if (!name.trim()) throw new QQV2DomainError('人物名字不能为空');
    return name;
}

function normalizeQQProfile(value) {
    const profile = value && typeof value === 'object' ? value : {};
    return {
        avatarAssetId: asText(profile.avatarAssetId, 256),
        signature: asText(profile.signature, 1000),
        gender: asText(profile.gender, 120),
        birthday: asText(profile.birthday, 120),
        profileBackgroundAssetId: asText(profile.profileBackgroundAssetId, 256),
    };
}

function normalizeHostMetadata(value, scopeId = '') {
    const source = value && typeof value === 'object' ? value : {};
    const normalizedScopeId = asText(source.scopeId || scopeId, 512);
    const hostType = asText(source.hostType, 32);
    const hostId = asText(source.hostId, 512);
    const chatId = asText(source.chatId, 512);
    const chatFile = asText(source.chatFile, 512);
    if (!normalizedScopeId || !hostType || !hostId || !chatId || !chatFile) return null;
    return { scopeId: normalizedScopeId, hostType, hostId, chatId, chatFile };
}

function isWorldbookEnabled(state) {
    return state.sharedResources?.[SHARED_WORLDBOOK_ENABLED_KEY] === true;
}

function getEffectiveWorldbookSettings(state, scope) {
    return { ...scope.settings.worldbook, enabled: isWorldbookEnabled(state) };
}

function copyScope(state, scope) {
    const result = copy(scope);
    result.settings.worldbook = copy(getEffectiveWorldbookSettings(state, scope));
    return result;
}

function ensurePersonProfile(person) {
    Object.assign(person, normalizeQQProfile(person));
}

function emptyScope(scopeId) {
    return {
        scopeId,
        hostMetadata: null,
        pendingHostDeletion: false,
        settingsVersion: SCOPE_SETTINGS_VERSION,
        worldbookDefaultResolved: false,
        selfProfile: normalizeQQProfile(),
        people: {},
        conversations: {},
        groups: {},
        messages: {},
        assets: {},
        settings: {
            activeApiPresetId: '',
            privateReplyPresetId: QQ_V2_BUILT_IN_PROMPT_PRESET_IDS.privateReply,
            privateProactivePresetId: QQ_V2_BUILT_IN_PROMPT_PRESET_IDS.privateProactive,
            groupReplyPresetId: QQ_V2_BUILT_IN_PROMPT_PRESET_IDS.groupReply,
            groupProactivePresetId: QQ_V2_BUILT_IN_PROMPT_PRESET_IDS.groupProactive,
            hostContextTurns: 3,
            conversationHistoryLimit: 100,
            proactive: { enabled: false, everyTurns: 5, count: 0, nextKind: 'private' },
            worldbook: {
                bookName: '',
                timeWindow: { mode: 'relative', value: 1, unit: 'month' },
                light: 'blue',
                depth: 999,
                keywords: [],
            },
        },
    };
}

function createDefaultWorldbookSettings() {
    return {
        bookName: '',
        timeWindow: { mode: 'relative', value: 1, unit: 'month' },
        light: 'blue',
        depth: 999,
        keywords: [],
    };
}

function createDefaultProactiveSettings() {
    return {
        enabled: false,
        everyTurns: 5,
        count: 0,
        nextKind: 'private',
    };
}

function normalizeProactiveEveryTurns(value, fallback = 5) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : fallback;
}

function ensureScopeProactiveState(scope) {
    if (!scope.settings || typeof scope.settings !== 'object') scope.settings = {};
    const defaults = createDefaultProactiveSettings();
    const current = scope.settings.proactive && typeof scope.settings.proactive === 'object'
        ? scope.settings.proactive
        : {};
    scope.settings.proactive = {
        enabled: current.enabled === true,
        everyTurns: normalizeProactiveEveryTurns(current.everyTurns, defaults.everyTurns),
        count: Number.isInteger(Number(current.count)) && Number(current.count) >= 0 ? Number(current.count) : 0,
        nextKind: current.nextKind === 'group' ? 'group' : 'private',
    };
}

function createDefaultInjection() {
    return {
        enabled: true,
        followGlobal: true,
        useConversationLight: false,
        useConversationDepth: false,
        light: 'blue',
        depth: 999,
        keywords: [],
        selectedMessageIds: [],
        projection: { bookName: '', entryUid: null, managedBookNames: [], pending: false },
    };
}

function normalizeKeywords(value) {
    const seen = new Set();
    return (Array.isArray(value) ? value : []).map((item) => asText(item, 160)).filter((item) => {
        const normalized = item.toLocaleLowerCase('zh-CN');
        if (!item || seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
    });
}

function normalizeManagedBookNames(value) {
    const names = [];
    const seen = new Set();
    for (const item of Array.isArray(value) ? value : []) {
        const name = asText(item, 256);
        if (!name || seen.has(name)) continue;
        seen.add(name);
        names.push(name);
    }
    return names;
}

function normalizeTimeWindow(value, fallback = createDefaultWorldbookSettings().timeWindow) {
    if (value?.mode === 'all') return { mode: 'all' };
    const unit = WORLDBOOK_TIME_UNITS.has(value?.unit) ? value.unit : fallback.unit;
    const number = Number(value?.value);
    const fallbackValue = Number(fallback?.value) || 1;
    return {
        mode: 'relative',
        value: Number.isInteger(number) && number > 0 ? number : fallbackValue,
        unit,
    };
}

function normalizeDepth(value, fallback = 999) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function ensureScopeWorldbookState(scope) {
    scope.worldbookDefaultResolved = scope.worldbookDefaultResolved === true;
    scope.pendingHostDeletion = scope.pendingHostDeletion === true;
    if (!scope.settings || typeof scope.settings !== 'object') scope.settings = {};
    const defaults = createDefaultWorldbookSettings();
    const current = scope.settings.worldbook && typeof scope.settings.worldbook === 'object'
        ? scope.settings.worldbook
        : {};
    scope.settings.worldbook = {
        bookName: asText(current.bookName, 256),
        timeWindow: normalizeTimeWindow(current.timeWindow, defaults.timeWindow),
        light: WORLDBOOK_LIGHTS.has(current.light) ? current.light : defaults.light,
        depth: normalizeDepth(current.depth, defaults.depth),
        keywords: normalizeKeywords(current.keywords),
    };
}

function ensureConversationInjection(conversation) {
    const defaults = createDefaultInjection();
    const current = conversation.injection && typeof conversation.injection === 'object'
        ? conversation.injection
        : {};
    const projection = current.projection && typeof current.projection === 'object'
        ? current.projection
        : {};
    const hasExplicitOverrides = Object.hasOwn(current, 'useConversationLight') || Object.hasOwn(current, 'useConversationDepth');
    const useConversationLight = current.useConversationLight === true || (!hasExplicitOverrides && current.followGlobal === false);
    const useConversationDepth = current.useConversationDepth === true || (!hasExplicitOverrides && current.followGlobal === false);
    conversation.injection = {
        enabled: current.enabled === true,
        followGlobal: !(useConversationLight || useConversationDepth),
        useConversationLight,
        useConversationDepth,
        light: WORLDBOOK_LIGHTS.has(current.light) ? current.light : defaults.light,
        depth: normalizeDepth(current.depth, defaults.depth),
        keywords: normalizeKeywords(current.keywords),
        selectedMessageIds: [...new Set(Array.isArray(current.selectedMessageIds)
            ? current.selectedMessageIds.map((id) => asText(id, 256)).filter(Boolean)
            : [])],
        projection: {
            bookName: asText(projection.bookName, 256),
            entryUid: projection.entryUid ?? null,
            managedBookNames: normalizeManagedBookNames(projection.managedBookNames),
            pending: projection.pending === true,
        },
    };
}

function ensureScopeQQV2State(scope) {
    const needsSettingsMigration = scope.settingsVersion !== SCOPE_SETTINGS_VERSION;
    ensureScopeProactiveState(scope);
    ensureScopeWorldbookState(scope);
    const usesLegacyZeroDefaults = needsSettingsMigration
        && Number(scope.settings.hostContextTurns) === 0
        && Number(scope.settings.conversationHistoryLimit) === 0;
    if (!asText(scope.settings.privateReplyPresetId, 256)) {
        scope.settings.privateReplyPresetId = QQ_V2_BUILT_IN_PROMPT_PRESET_IDS.privateReply;
    }
    if (!asText(scope.settings.privateProactivePresetId, 256)) {
        scope.settings.privateProactivePresetId = QQ_V2_BUILT_IN_PROMPT_PRESET_IDS.privateProactive;
    }
    if (!Number.isInteger(Number(scope.settings.hostContextTurns))
        || Number(scope.settings.hostContextTurns) < 0
        || usesLegacyZeroDefaults) {
        scope.settings.hostContextTurns = 3;
    }
    if (!Number.isInteger(Number(scope.settings.conversationHistoryLimit))
        || Number(scope.settings.conversationHistoryLimit) < 0
        || usesLegacyZeroDefaults) {
        scope.settings.conversationHistoryLimit = 100;
    }
    scope.selfProfile = normalizeQQProfile(scope.selfProfile);
    if (!scope.people || typeof scope.people !== 'object') scope.people = {};
    Object.values(scope.people).forEach(ensurePersonProfile);
    Object.values(scope.conversations || {}).forEach((conversation) => {
        ensureConversationInjection(conversation);
        if (needsSettingsMigration) conversation.injection.enabled = true;
    });
    scope.settingsVersion = SCOPE_SETTINGS_VERSION;
}

function getScope(state, scopeId, create = false) {
    const id = requireText(scopeId, 'QQ 作用域 ID', 512);
    if (!state.scopes || typeof state.scopes !== 'object') state.scopes = createEmptyQQV2State().scopes;
    if (!state.scopes[id] && create) state.scopes[id] = emptyScope(id);
    if (!state.scopes[id]) throw new QQV2DomainError('QQ 作用域不存在', 'scope_not_found');
    ensureScopeQQV2State(state.scopes[id]);
    return state.scopes[id];
}

function getPerson(scope, personId) {
    const person = scope.people[asText(personId, 256)];
    if (!person) throw new QQV2DomainError('QQ 人物不存在', 'person_not_found');
    return person;
}

function getConversation(scope, conversationId) {
    const conversation = scope.conversations[asText(conversationId, 256)];
    if (!conversation) throw new QQV2DomainError('QQ 会话不存在', 'conversation_not_found');
    return conversation;
}

function getGroup(scope, groupId) {
    const group = scope.groups[asText(groupId, 256)];
    if (!group) throw new QQV2DomainError('QQ群不存在', 'group_not_found');
    return group;
}

function getGroupConversation(scope, group) {
    return getConversation(scope, group.conversationId);
}

function messageWithQuote(scope, message) {
    if (!message) return null;
    return {
        ...copy(message),
        quote: message.quoteMessageId
            ? scope.messages[message.quoteMessageId]
                ? { status: 'available', messageId: message.quoteMessageId, content: scope.messages[message.quoteMessageId].content }
                : { status: 'deleted', messageId: message.quoteMessageId, content: '' }
            : null,
    };
}

function conversationSummary(scope, conversation) {
    const group = conversation.kind === 'group' ? scope.groups[conversation.groupId] || null : null;
    const person = conversation.kind === 'private' ? scope.people[conversation.personId] || null : null;
    return {
        conversation: copy(conversation),
        person: copy(person),
        group: copy(group),
        lastMessage: messageWithQuote(scope, scope.messages[conversation.lastMessageId]),
    };
}

function getScopeAsset(state, scope, assetId) {
    const id = asText(assetId, 256);
    const asset = scope.assets[id] || findImageLibraryAsset(state, id);
    if (!asset) throw new QQV2DomainError('QQ 媒体资源不存在或不属于当前作用域', 'asset_not_found');
    return asset;
}

function requireProfileAsset(state, scope, assetId, expectedKind, conversationId = '') {
    const id = asText(assetId, 256);
    if (!id) return '';
    const asset = getScopeAsset(state, scope, id);
    if (asset.kind !== expectedKind) {
        throw new QQV2DomainError('QQ 媒体资源类型不匹配', 'asset_kind_mismatch');
    }
    const targetConversationId = asText(conversationId, 256);
    if (targetConversationId && asset.conversationId && asset.conversationId !== targetConversationId) {
        throw new QQV2DomainError('QQ 媒体资源不属于当前会话', 'asset_conversation_mismatch');
    }
    return asset.assetId;
}
function imageLibraryKind(library) {
    const name = asText(library, 64);
    const kind = IMAGE_LIBRARY_KINDS[name];
    if (!kind) throw new QQV2DomainError('图片资料库类型无效', 'image_library_invalid');
    return { library: name, kind };
}

function imageLibraryAssets(state, library) {
    const { library: name } = imageLibraryKind(library);
    return Object.values(state.sharedResources?.[SHARED_IMAGE_LIBRARY_KEY] || {})
        .filter((asset) => asset.library === name);
}

function findImageLibraryAsset(state, assetId) {
    const id = asText(assetId, 256);
    if (!id) return null;
    return state.sharedResources?.[SHARED_IMAGE_LIBRARY_KEY]?.[id] || null;
}

function chooseImageLibraryAssetId(state, library, random) {
    const assets = imageLibraryAssets(state, library);
    if (assets.length === 0) return '';
    const value = Number(random());
    const index = Math.max(0, Math.min(assets.length - 1, Math.floor(Number.isFinite(value) ? value * assets.length : 0)));
    return assets[index].assetId;
}

function createPrivatePerson(state, scope, formalName, random) {
    return {
        personId: createId('person'),
        scopeId: scope.scopeId,
        formalName,
        normalizedName: formalName,
        avatarAssetId: chooseImageLibraryAssetId(state, 'avatar', random),
        signature: '',
        gender: '',
        birthday: '',
        profileBackgroundAssetId: chooseImageLibraryAssetId(state, 'profile-background', random),
    };
}

function createPrivateConversation(state, scope, person, random) {
    return {
        conversationId: createId('private'),
        scopeId: scope.scopeId,
        kind: 'private',
        personId: person.personId,
        groupId: '',
        status: 'active',
        remark: '',
        backgroundAssetId: chooseImageLibraryAssetId(state, 'chat-background', random),
        unreadCount: 0,
        nextSequence: 1,
        lastSequence: 0,
        lastMessageId: '',
        injection: createDefaultInjection(),

    };
}

function syncSenderAvatar(scope, senderId, assetId) {
    Object.values(scope.messages).forEach((message) => {
        if (message.senderId === senderId) message.senderAvatarAssetId = assetId;
    });
}

function groupParticipantIds(group) {
    return [
        ...(group.selfExited ? [] : [SELF_ID]),
        ...group.memberIds,
    ];
}

function participantRole(group, personId) {
    const id = asText(personId, 256);
    if (!groupParticipantIds(group).includes(id)) return '';
    if (group.ownerId === id) return 'owner';
    if (group.adminIds.includes(id)) return 'admin';
    return 'member';
}

function canManageTarget(group, actorId, targetId) {
    const actorRole = participantRole(group, actorId);
    const targetRole = participantRole(group, targetId);
    if (!actorRole || !targetRole) return false;
    if (actorRole === 'owner') return actorId !== targetId;
    return actorRole === 'admin' && targetRole === 'member' && actorId !== targetId;
}

function requireOwner(group, actorId) {
    if (participantRole(group, actorId) !== 'owner') {
        throw new QQV2DomainError('只有群主可以执行此操作', 'permission_denied');
    }
}

function requireGroupManager(group, actorId, targetId = '') {
    if (targetId && !canManageTarget(group, actorId, targetId)) {
        throw new QQV2DomainError('当前群身份没有管理该成员的权限', 'permission_denied');
    }
    const role = participantRole(group, actorId);
    if (role !== 'owner' && role !== 'admin') {
        throw new QQV2DomainError('只有群主或管理员可以执行此操作', 'permission_denied');
    }
}

function parseStoryTime(value) {
    const raw = asText(value, 128);
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(raw);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4] || 0);
    const minute = Number(match[5] || 0);
    const time = Date.UTC(year, month - 1, day, hour, minute);
    const date = new Date(time);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return time;
}

function formatStoryTime(time) {
    const date = new Date(time);
    const two = (value) => String(value).padStart(2, '0');
    return `${date.getUTCFullYear()}-${two(date.getUTCMonth() + 1)}-${two(date.getUTCDate())} ${two(date.getUTCHours())}:${two(date.getUTCMinutes())}`;
}

function normalizeMuteUntil(duration, storyTime) {
    if (!Object.prototype.hasOwnProperty.call(MUTE_DURATIONS, duration)) {
        throw new QQV2DomainError('禁言时长必须是已支持的五档之一', 'invalid_mute_duration');
    }
    if (duration === '永久') return 'permanent';
    const origin = parseStoryTime(storyTime);
    if (origin === null) throw new QQV2DomainError('禁言需要有效的故事时间', 'story_time_required');
    return formatStoryTime(origin + MUTE_DURATIONS[duration] * 60_000);
}

function isMuted(group, personId, storyTime) {
    const until = group.mutes[personId];
    if (!until) return false;
    if (until === 'permanent') return true;
    const now = parseStoryTime(storyTime);
    const expiry = parseStoryTime(until);
    if (now !== null && expiry !== null && now >= expiry) {
        delete group.mutes[personId];
        return false;
    }
    return true;
}

function appendSystemMessage(scope, conversation, content, storyTime) {
    const message = appendOneMessage(scope, conversation, {
        senderId: '__system__',
        senderType: 'system',
        type: 'system',
        content,
        storyTime,
    }, { skipSenderValidation: true });
    return message;
}

function messageSenderSnapshot(scope, input, senderId, senderType) {
    if (senderType === 'system' || senderId === '__system__') {
        return { senderName: '系统', senderAvatarAssetId: '' };
    }
    if (senderId === SELF_ID) {
        return {
            senderName: asText(input?.senderName, 120),
            senderAvatarAssetId: asText(scope.selfProfile?.avatarAssetId || input?.senderAvatarAssetId, 256),
        };
    }
    const person = scope.people[senderId];
    return {
        senderName: asText(person?.formalName || input?.senderName, 120),
        senderAvatarAssetId: asText(person?.avatarAssetId || input?.senderAvatarAssetId, 256),
    };
}

function appendOneMessage(scope, conversation, input, options = {}) {
    const type = asText(input?.type, 32);
    if (!MESSAGE_TYPES.has(type)) throw new QQV2DomainError('不支持的 QQ 消息类型', 'invalid_message_type');
    const senderId = requireText(input?.senderId, '消息发送者', 256);
    const senderType = requireText(input?.senderType, '消息发送者类型', 32);
    const storyTime = asText(input?.storyTime, 128);
    const content = String(input?.content ?? '');
    const sender = messageSenderSnapshot(scope, input, senderId, senderType);

    if (!options.skipSenderValidation && conversation.kind === 'group') {
        const group = getGroup(scope, conversation.groupId);
        if (group.status !== 'active' || conversation.status !== 'active') {
            throw new QQV2DomainError('已退出或已解散群聊不能发送消息', 'group_read_only');
        }
        if (!groupParticipantIds(group).includes(senderId)) {
            throw new QQV2DomainError('发送者不在当前群聊中', 'group_member_not_found');
        }
        if (isMuted(group, senderId, storyTime)) {
            throw new QQV2DomainError('该成员当前处于禁言状态', 'group_member_muted');
        }
    }
    if (!options.skipSenderValidation && conversation.kind === 'private' && senderId !== SELF_ID && senderId !== conversation.personId) {
        throw new QQV2DomainError('私聊发送者与会话人物不一致', 'private_sender_invalid');
    }

    const quoteMessageId = asText(input?.quoteMessageId, 256);
    const quoteMessage = quoteMessageId ? scope.messages[quoteMessageId] : null;
    if (quoteMessageId && !quoteMessage) {
        throw new QQV2DomainError('被引用消息不存在', 'quote_not_found');
    }
    if (quoteMessage && quoteMessage.conversationId !== conversation.conversationId) {
        throw new QQV2DomainError('被引用消息不属于当前会话', 'quote_conversation_mismatch');
    }
    const mentionIds = [...new Set(Array.isArray(input?.mentionIds) ? input.mentionIds.map((id) => asText(id, 256)).filter(Boolean) : [])];
    if (conversation.kind === 'group') {
        const group = getGroup(scope, conversation.groupId);
        if (mentionIds.some((id) => !group.memberIds.includes(id))) {
            throw new QQV2DomainError('结构化提及目标不在当前群聊中', 'mention_not_found');
        }
        if (input?.mentionAll === true && !['owner', 'admin'].includes(participantRole(group, senderId))) {
            throw new QQV2DomainError('只有群主或管理员可以提及全体成员', 'permission_denied');
        }
    }

    const sequence = Number(conversation.nextSequence || 1);
    const message = {
        messageId: createId('message'),
        scopeId: scope.scopeId,
        conversationId: conversation.conversationId,
        sequence,
        senderId,
        senderType,
        senderName: sender.senderName,
        senderAvatarAssetId: sender.senderAvatarAssetId,
        type,
        content,
        storyTime,
        quoteMessageId,
        mentionIds,
        mentionAll: input?.mentionAll === true,
        transfer: input?.transfer ? copy(input.transfer) : null,
        stickerId: asText(input?.stickerId, 256),
        assetId: asText(input?.assetId, 256),
        selectedForInjection: input?.selectedForInjection === true,
    };
    scope.messages[message.messageId] = message;
    conversation.nextSequence = sequence + 1;
    conversation.lastSequence = sequence;
    conversation.lastMessageId = message.messageId;
    return copy(message);
}

function updateConversationAfterMessageRemoval(scope, conversation) {
    const remaining = Object.values(scope.messages)
        .filter((message) => message.conversationId === conversation.conversationId)
        .sort((left, right) => left.sequence - right.sequence);
    const last = remaining.at(-1) || null;
    conversation.lastMessageId = last?.messageId || '';
    conversation.lastSequence = last?.sequence || 0;
}

function isPrivateFriend(scope, personId) {
    return Object.values(scope.conversations).some((conversation) => (
        conversation.kind === 'private'
        && conversation.personId === personId
        && (conversation.status === 'active' || conversation.status === 'contact')
    ));
}

function personStillReferenced(scope, personId) {
    return Object.values(scope.conversations).some((conversation) => conversation.personId === personId)
        || Object.values(scope.groups).some((group) => group.memberIds.includes(personId) || group.ownerId === personId);
}

function assetStillReferenced(scope, assetId) {
    const id = asText(assetId, 256);
    if (!id) return false;
    return scope.selfProfile?.avatarAssetId === id
        || scope.selfProfile?.profileBackgroundAssetId === id
        || Object.values(scope.people).some((person) => (
            person.avatarAssetId === id || person.profileBackgroundAssetId === id
        ))
        || Object.values(scope.conversations).some((conversation) => conversation.backgroundAssetId === id)
        || Object.values(scope.messages).some((message) => (
            message.assetId === id || message.senderAvatarAssetId === id
        ));
}

function removeAssetIfUnreferenced(scope, assetId) {
    const id = asText(assetId, 256);
    if (id && scope.assets[id] && !scope.assets[id].library && !assetStillReferenced(scope, id)) {
        delete scope.assets[id];
    }
}

function applyGroupManagement(scope, input = {}) {
    const group = getGroup(scope, input.groupId);
    const conversation = getGroupConversation(scope, group);
    const action = asText(input.action, 64);
    const actorId = asText(input.actorId, 256) || SELF_ID;
    const targetId = asText(input.targetPersonId, 256);
    const storyTime = asText(input.storyTime, 128);
    const value = input.value;

    if (group.status === 'dissolved' || conversation.status === 'dissolved') {
        throw new QQV2DomainError('已解散群聊不能再管理', 'group_dissolved');
    }

    switch (action) {
    case 'rename':
        requireGroupManager(group, actorId);
        group.name = requireText(value, '群名称', 120);
        appendSystemMessage(scope, conversation, `${actorId}修改了群名称`, storyTime);
        break;
    case 'add':
        requireGroupManager(group, actorId);
        if (targetId === SELF_ID) throw new QQV2DomainError('当前用户已经在群聊中', 'group_member_invalid');
        getPerson(scope, targetId);
        if (!isPrivateFriend(scope, targetId) || group.memberIds.includes(targetId)) {
            throw new QQV2DomainError('不能添加该群成员', 'group_member_invalid');
        }
        group.memberIds.push(targetId);
        appendSystemMessage(scope, conversation, `${targetId}加入了群聊`, storyTime);
        break;
    case 'remove':
    case 'kick':
        requireGroupManager(group, actorId, targetId);
        if (targetId === SELF_ID) {
            group.selfExited = true;
            group.selfRole = 'member';
            conversation.status = 'exited';
        } else {
            group.memberIds = group.memberIds.filter((id) => id !== targetId);
            group.adminIds = group.adminIds.filter((id) => id !== targetId);
            delete group.mutes[targetId];
        }
        appendSystemMessage(scope, conversation, `${targetId}已被移出群聊`, storyTime);
        break;
    case 'appoint-admin':
        requireOwner(group, actorId);
        if (participantRole(group, targetId) !== 'member') {
            throw new QQV2DomainError('只能任命普通成员为管理员', 'group_role_invalid');
        }
        group.adminIds.push(targetId);
        if (targetId === SELF_ID) group.selfRole = 'admin';
        appendSystemMessage(scope, conversation, `${targetId}已被设为管理员`, storyTime);
        break;
    case 'revoke-admin':
        requireOwner(group, actorId);
        if (participantRole(group, targetId) !== 'admin') {
            throw new QQV2DomainError('目标不是管理员', 'group_role_invalid');
        }
        group.adminIds = group.adminIds.filter((id) => id !== targetId);
        if (targetId === SELF_ID) group.selfRole = 'member';
        appendSystemMessage(scope, conversation, `${targetId}不再是管理员`, storyTime);
        break;
    case 'mute':
        requireGroupManager(group, actorId, targetId);
        group.mutes[targetId] = normalizeMuteUntil(asText(input.duration, 64), storyTime);
        appendSystemMessage(scope, conversation, `${targetId}已被禁言${asText(input.duration, 64)}`, storyTime);
        break;
    case 'unmute':
        requireGroupManager(group, actorId, targetId);
        delete group.mutes[targetId];
        appendSystemMessage(scope, conversation, `${targetId}已解除禁言`, storyTime);
        break;
    case 'reinvite':
        requireGroupManager(group, actorId);
        if (targetId !== SELF_ID || !group.selfExited) {
            throw new QQV2DomainError('当前不能重新邀请该成员', 'group_reinvite_invalid');
        }
        group.selfExited = false;
        group.selfRole = 'member';
        conversation.status = 'active';
        appendSystemMessage(scope, conversation, `${actorId}邀请你重新加入群聊`, storyTime);
        break;
    case 'transfer-owner':
        requireOwner(group, actorId);
        if (targetId === actorId || !groupParticipantIds(group).includes(targetId)) {
            throw new QQV2DomainError('新群主必须是当前其他成员', 'group_owner_invalid');
        }
        group.ownerId = targetId;
        group.adminIds = group.adminIds.filter((id) => id !== actorId && id !== targetId);
        if (targetId === SELF_ID) group.selfRole = 'owner';
        else if (actorId === SELF_ID) group.selfRole = 'member';
        appendSystemMessage(scope, conversation, `${targetId}已成为群主`, storyTime);
        break;
    case 'dissolve':
        requireOwner(group, actorId);
        group.status = 'dissolved';
        conversation.status = 'dissolved';
        appendSystemMessage(scope, conversation, `${actorId}解散了群聊`, storyTime);
        break;
    default:
        throw new QQV2DomainError('不支持的群管理动作', 'group_action_invalid');
    }

    return group;
}

export class QQV2DomainError extends Error {
    constructor(message, code = 'domain_error') {
        super(message);
        this.name = 'QQV2DomainError';
        this.code = code;
    }
}

/** The stable v2 domain repository. Every mutation is a single state-store transaction. */
export function createQQV2Repository(options = {}) {
    const stateStore = options.stateStore;
    const random = typeof options.random === 'function' ? options.random : Math.random;
    if (!stateStore || typeof stateStore.read !== 'function' || typeof stateStore.transact !== 'function') {
        throw new TypeError('QQ v2 repository 需要 stateStore');
    }

    const assertScopeMutationCurrent = (scopeId, operationOptions = {}) => {
        if (operationOptions?.allowInactiveScope === true || !operationOptions?.scopeSession) return;
        const scopeSession = operationOptions.scopeSession;
        try {
            if (asText(scopeSession.scopeId, 512) !== asText(scopeId, 512)) throw new Error('scope mismatch');
            if (typeof scopeSession.assertCurrent === 'function') scopeSession.assertCurrent();
            else if (scopeSession.isCurrent?.() !== true) throw new Error('scope inactive');
            if (scopeSession.signal?.aborted === true) throw new Error('scope aborted');
            return;
        } catch {
            throw new QQV2DomainError('QQ 作用域已失效', 'scope_inactive');
        }
    };

    const transactScoped = (scopeId, operationOptions, mutator) => stateStore.transact((state) => {
        assertScopeMutationCurrent(scopeId, operationOptions);
        return mutator(state);
    });

    const saveImageLibraryAssets = async (scopeId, inputs = [], operationOptions = {}) => {
        if (!Array.isArray(inputs) || inputs.length === 0) {
            throw new QQV2DomainError('Image library assets must be a non-empty array', 'image_assets_required');
        }
        return transactScoped(scopeId, operationOptions, (state) => {
            getScope(state, scopeId, false);
            const records = inputs.map((input) => {
                const { library, kind } = imageLibraryKind(input?.library);
                const blob = input?.blob instanceof Blob ? input.blob : null;
                if (!blob) throw new QQV2DomainError('Image library asset must provide a Blob', 'asset_blob_required');
                return { input, library, kind, blob };
            });
            if (!state.sharedResources || typeof state.sharedResources !== 'object' || Array.isArray(state.sharedResources)) {
                state.sharedResources = {};
            }
            if (!state.sharedResources[SHARED_IMAGE_LIBRARY_KEY]
                || typeof state.sharedResources[SHARED_IMAGE_LIBRARY_KEY] !== 'object'
                || Array.isArray(state.sharedResources[SHARED_IMAGE_LIBRARY_KEY])) {
                state.sharedResources[SHARED_IMAGE_LIBRARY_KEY] = {};
            }
            const latestCreatedAt = Object.values(state.sharedResources[SHARED_IMAGE_LIBRARY_KEY])
                .reduce((latest, asset) => Math.max(latest, Number(asset?.createdAt || 0)), 0);
            const newestCreatedAt = Math.max(Date.now(), latestCreatedAt + records.length);
            const assets = records.map(({ input, library, kind, blob }, index) => ({
                assetId: createId('asset'),
                scopeId: '',
                conversationId: '',
                kind,
                library,
                blob,
                mimeType: asText(input.mimeType || blob.type, 128),
                createdAt: newestCreatedAt - index,
            }));
            assets.forEach((asset) => {
                state.sharedResources[SHARED_IMAGE_LIBRARY_KEY][asset.assetId] = asset;
            });
            return assets.map(copy);
        });
    };

    return Object.freeze({
        async ensureScope(scopeId, hostMetadata = null, operationOptions = {}) {
            return transactScoped(scopeId, operationOptions, (state) => {
                const scope = getScope(state, scopeId, true);
                const normalized = normalizeHostMetadata(hostMetadata, scope.scopeId);
                if (normalized) scope.hostMetadata = normalized;
                return copyScope(state, scope);
            });
        },
        async getScope(scopeId) {
            const state = await stateStore.read();
            return state.scopes[scopeId] ? copyScope(state, getScope(state, scopeId, false)) : null;
        },
        async listHostMetadata() {
            const state = await stateStore.read();
            return Object.values(state.scopes || {})
                .map((scope) => normalizeHostMetadata(scope?.hostMetadata, scope?.scopeId))
                .filter(Boolean)
                .map(copy);
        },
        async deleteScope(scopeId) {
            const normalizedScopeId = requireText(scopeId, 'QQ scope ID', 512);
            return stateStore.transact((state) => {
                if (!state.scopes?.[normalizedScopeId]) return false;
                delete state.scopes[normalizedScopeId];
                return true;
            });
        },
        async markScopeHostDeletionPending(scopeId, pending = true) {
            return stateStore.transact((state) => {
                const scope = getScope(state, scopeId, false);
                scope.pendingHostDeletion = pending === true;
                return scope.pendingHostDeletion;
            });
        },
        async listPendingHostDeletionScopeIds() {
            const state = await stateStore.read();
            return Object.values(state.scopes || {})
                .filter((scope) => {
                    ensureScopeQQV2State(scope);
                    return scope.pendingHostDeletion === true;
                })
                .map((scope) => scope.scopeId);
        },
        async getProactiveSettings(scopeId) {
            const state = await stateStore.read();
            const scope = getScope(state, scopeId, false);
            return copy(scope.settings.proactive);
        },
        async updateProactiveSettings(scopeId, patch = {}, operationOptions = {}) {
            return transactScoped(scopeId, operationOptions, (state) => {
                const scope = getScope(state, scopeId, true);
                const current = scope.settings.proactive;
                const next = { ...current };
                if (Object.hasOwn(patch, 'enabled')) next.enabled = patch.enabled === true;
                if (Object.hasOwn(patch, 'everyTurns')) {
                    const everyTurns = Number(patch.everyTurns);
                    if (!Number.isInteger(everyTurns) || everyTurns <= 0) {
                        throw new QQV2DomainError('主动消息轮数必须是正整数', 'proactive_turns_invalid');
                    }
                    next.everyTurns = everyTurns;
                }
                if (next.enabled !== current.enabled || next.everyTurns !== current.everyTurns) {
                    next.count = 0;
                    next.nextKind = 'private';
                }
                scope.settings.proactive = next;
                return copy(next);
            });
        },
        async consumeProactiveStoryReply(scopeId, configuration = null, operationOptions = {}) {
            return transactScoped(scopeId, operationOptions, (state) => {
                const scope = getScope(state, scopeId, false);
                const persisted = scope.settings.proactive;
                const source = configuration && typeof configuration === 'object' && !Array.isArray(configuration)
                    ? configuration
                    : persisted;
                const current = {
                    ...persisted,
                    enabled: Object.hasOwn(source, 'enabled') ? source.enabled === true : persisted.enabled,
                    everyTurns: Object.hasOwn(source, 'everyTurns')
                        ? normalizeProactiveEveryTurns(source.everyTurns, persisted.everyTurns)
                        : persisted.everyTurns,
                };
                if (!current.enabled) return copy({ ...current, triggered: false, kind: null });
                const next = { ...current, count: current.count + 1 };
                if (next.count < next.everyTurns) {
                    scope.settings.proactive = { ...persisted, count: next.count, nextKind: next.nextKind };
                    return copy({ ...next, triggered: false, kind: null });
                }
                const kind = next.nextKind;
                next.count = 0;
                next.nextKind = kind === 'private' ? 'group' : 'private';
                scope.settings.proactive = { ...persisted, count: next.count, nextKind: next.nextKind };
                return copy({ ...next, triggered: true, kind });
            });
        },
        async getWorldbookSettings(scopeId) {
            const state = await stateStore.read();
            const scope = getScope(state, scopeId, false);
            return copy(getEffectiveWorldbookSettings(state, scope));
        },
        async initializeWorldbookDefault(scopeId, bookName, operationOptions = {}) {
            return transactScoped(scopeId, operationOptions, (state) => {
                const scope = getScope(state, scopeId, true);
                if (scope.worldbookDefaultResolved) return copy(getEffectiveWorldbookSettings(state, scope));
                if (!scope.settings.worldbook.bookName) {
                    scope.settings.worldbook.bookName = asText(bookName, 256);
                }
                scope.worldbookDefaultResolved = true;
                return copy(getEffectiveWorldbookSettings(state, scope));
            });
        },
        async updateWorldbookSettings(scopeId, patch = {}, operationOptions = {}) {
            return transactScoped(scopeId, operationOptions, (state) => {
                const scope = getScope(state, scopeId, true);
                const current = scope.settings.worldbook;
                const next = { ...current };
                if (!state.sharedResources || typeof state.sharedResources !== 'object' || Array.isArray(state.sharedResources)) {
                    state.sharedResources = {};
                }
                if (Object.hasOwn(patch, 'enabled')) {
                    state.sharedResources[SHARED_WORLDBOOK_ENABLED_KEY] = patch.enabled === true;
                }
                if (Object.hasOwn(patch, 'bookName')) {
                    next.bookName = asText(patch.bookName, 256);
                    scope.worldbookDefaultResolved = true;
                }
                if (Object.hasOwn(patch, 'timeWindow')) {
                    const window = patch.timeWindow;
                    if (window?.mode !== 'all' && (!WORLDBOOK_TIME_UNITS.has(window?.unit)
                        || !Number.isInteger(Number(window?.value)) || Number(window.value) <= 0)) {
                        throw new QQV2DomainError('世界书时间窗口无效', 'worldbook_window_invalid');
                    }
                    next.timeWindow = normalizeTimeWindow(window, current.timeWindow);
                }
                if (Object.hasOwn(patch, 'light')) {
                    if (!WORLDBOOK_LIGHTS.has(patch.light)) throw new QQV2DomainError('世界书灯色无效', 'worldbook_light_invalid');
                    next.light = patch.light;
                }
                if (Object.hasOwn(patch, 'depth')) {
                    const depth = Number(patch.depth);
                    if (!Number.isInteger(depth) || depth < 0) throw new QQV2DomainError('世界书深度无效', 'worldbook_depth_invalid');
                    next.depth = depth;
                }
                if (Object.hasOwn(patch, 'keywords')) next.keywords = normalizeKeywords(patch.keywords);
                scope.settings.worldbook = next;
                return copy(getEffectiveWorldbookSettings(state, scope));
            });
        },
        async listConversations(scopeId) {
            const state = await stateStore.read();
            const scope = getScope(state, scopeId, false);
            return Object.values(scope.conversations).sort((left, right) => right.lastSequence - left.lastSequence).map(copy);
        },
        async listConversationSummaries(scopeId) {
            const state = await stateStore.read();
            const scope = getScope(state, scopeId, false);
            return Object.values(scope.conversations)
                .sort((left, right) => right.lastSequence - left.lastSequence)
                .map((conversation) => conversationSummary(scope, conversation));
        },
        async getConversationSummary(scopeId, conversationId) {
            const state = await stateStore.read();
            const scope = getScope(state, scopeId, false);
            const conversation = scope.conversations[asText(conversationId, 256)];
            return conversation ? conversationSummary(scope, conversation) : null;
        },
        async getConversation(scopeId, conversationId) {
            const state = await stateStore.read();
            const scope = getScope(state, scopeId, false);
            return scope.conversations[conversationId] ? copy(scope.conversations[conversationId]) : null;
        },
        async openConversation(scopeId, conversationId, operationOptions = {}) {
            return transactScoped(scopeId, operationOptions, (state) => {
                const scope = getScope(state, scopeId, false);
                const conversation = getConversation(scope, conversationId);
                conversation.unreadCount = 0;
                return copy({ conversationId: conversation.conversationId, unreadCount: 0 });
            });
        },
        async incrementConversationUnread(scopeId, conversationId, amount = 1, operationOptions = {}) {
            return transactScoped(scopeId, operationOptions, (state) => {
                const scope = getScope(state, scopeId, false);
                const conversation = getConversation(scope, conversationId);
                const increment = Number(amount);
                if (!Number.isInteger(increment) || increment <= 0) {
                    throw new QQV2DomainError('未读数增量必须是正整数', 'unread_increment_invalid');
                }
                const current = Number(conversation.unreadCount);
                conversation.unreadCount = Math.max(0, Number.isInteger(current) ? current : 0) + increment;
                return copy({ conversationId: conversation.conversationId, unreadCount: conversation.unreadCount });
            });
        },
        async updateConversationInjection(scopeId, conversationId, patch = {}, operationOptions = {}) {
            return transactScoped(scopeId, operationOptions, (state) => {
                const scope = getScope(state, scopeId, false);
                const conversation = getConversation(scope, conversationId);
                const current = conversation.injection;
                const next = { ...current };
                if (Object.hasOwn(patch, 'enabled')) next.enabled = patch.enabled === true;
                if (Object.hasOwn(patch, 'followGlobal')) {
                    const useConversationSettings = patch.followGlobal === false;
                    next.useConversationLight = useConversationSettings;
                    next.useConversationDepth = useConversationSettings;
                }
                if (Object.hasOwn(patch, 'useConversationLight')) next.useConversationLight = patch.useConversationLight === true;
                if (Object.hasOwn(patch, 'useConversationDepth')) next.useConversationDepth = patch.useConversationDepth === true;
                next.followGlobal = !(next.useConversationLight || next.useConversationDepth);
                if (Object.hasOwn(patch, 'light')) {
                    if (!WORLDBOOK_LIGHTS.has(patch.light)) throw new QQV2DomainError('会话世界书灯色无效', 'worldbook_light_invalid');
                    next.light = patch.light;
                }
                if (Object.hasOwn(patch, 'depth')) {
                    const depth = Number(patch.depth);
                    if (!Number.isInteger(depth) || depth < 0) throw new QQV2DomainError('会话世界书深度无效', 'worldbook_depth_invalid');
                    next.depth = depth;
                }
                if (Object.hasOwn(patch, 'keywords')) next.keywords = normalizeKeywords(patch.keywords);
                conversation.injection = { ...next, projection: current.projection };
                return copy(conversation.injection);
            });
        },
        async setMessageSelectedForInjection(scopeId, conversationId, messageId, selected, operationOptions = {}) {
            return transactScoped(scopeId, operationOptions, (state) => {
                const scope = getScope(state, scopeId, false);
                const conversation = getConversation(scope, conversationId);
                const message = scope.messages[asText(messageId, 256)];
                if (!message || message.conversationId !== conversation.conversationId) {
                    throw new QQV2DomainError('手选世界书消息不存在', 'message_not_found');
                }
                message.selectedForInjection = selected === true;
                const selectedIds = new Set(conversation.injection.selectedMessageIds);
                if (message.selectedForInjection) selectedIds.add(message.messageId);
                else selectedIds.delete(message.messageId);
                conversation.injection.selectedMessageIds = [...selectedIds];
                return copy({ message, injection: conversation.injection });
            });
        },
        async setMessagesSelectedForInjection(scopeId, conversationId, messageIds, selected, operationOptions = {}) {
            return transactScoped(scopeId, operationOptions, (state) => {
                const scope = getScope(state, scopeId, false);
                const conversation = getConversation(scope, conversationId);
                const ids = [...new Set((Array.isArray(messageIds) ? messageIds : [])
                    .map((messageId) => asText(messageId, 256))
                    .filter(Boolean))];
                const messages = ids.map((messageId) => {
                    const message = scope.messages[messageId];
                    if (!message || message.conversationId !== conversation.conversationId) {
                        throw new QQV2DomainError('Selected worldbook message does not exist', 'message_not_found');
                    }
                    return message;
                });
                const selectedIds = new Set(conversation.injection.selectedMessageIds);
                for (const message of messages) {
                    message.selectedForInjection = selected === true;
                    if (message.selectedForInjection) selectedIds.add(message.messageId);
                    else selectedIds.delete(message.messageId);
                }
                conversation.injection.selectedMessageIds = [...selectedIds];
                return copy({ messages, injection: conversation.injection });
            });
        },
        async clearSelectedMessagesForInjection(scopeId, conversationId, operationOptions = {}) {
            return transactScoped(scopeId, operationOptions, (state) => {
                const scope = getScope(state, scopeId, false);
                const conversation = getConversation(scope, conversationId);
                for (const message of Object.values(scope.messages)) {
                    if (message.conversationId === conversation.conversationId) message.selectedForInjection = false;
                }
                conversation.injection.selectedMessageIds = [];
                return copy(conversation.injection);
            });
        },
        async clearAllSelectedMessagesForInjection(operationOptions = {}) {
            return transactScoped(operationOptions?.scopeSession?.scopeId, operationOptions, (state) => {
                let cleared = 0;
                for (const scope of Object.values(state.scopes || {})) {
                    ensureScopeQQV2State(scope);
                    for (const message of Object.values(scope.messages || {})) {
                        if (message.selectedForInjection === true) cleared += 1;
                        message.selectedForInjection = false;
                    }
                    for (const conversation of Object.values(scope.conversations || {})) {
                        conversation.injection.selectedMessageIds = [];
                    }
                }
                return cleared;
            });
        },
        async setConversationProjection(scopeId, conversationId, patch = {}, operationOptions = {}) {
            return transactScoped(scopeId, operationOptions, (state) => {
                const scope = getScope(state, scopeId, false);
                const conversation = getConversation(scope, conversationId);
                const current = conversation.injection.projection;
                const next = { ...current };
                if (Object.hasOwn(patch, 'bookName')) next.bookName = asText(patch.bookName, 256);
                if (Object.hasOwn(patch, 'entryUid')) next.entryUid = patch.entryUid ?? null;
                if (Object.hasOwn(patch, 'managedBookNames')) {
                    next.managedBookNames = normalizeManagedBookNames(patch.managedBookNames);
                }
                if (Object.hasOwn(patch, 'pending')) next.pending = patch.pending === true;
                conversation.injection.projection = next;
                return copy(next);
            });
        },
        async getWorldbookProjectionData(scopeId, conversationId) {
            const state = await stateStore.read();
            const scope = getScope(state, scopeId, false);
            const conversation = getConversation(scope, conversationId);
            const group = conversation.kind === 'group' ? getGroup(scope, conversation.groupId) : null;
            const messages = Object.values(scope.messages)
                .filter((message) => message.conversationId === conversation.conversationId)
                .sort((left, right) => left.sequence - right.sequence)
                .map(copy);
            return copy({
                settings: getEffectiveWorldbookSettings(state, scope),
                conversation,
                group,
                people: Object.values(scope.people),
                messages,
            });
        },
        async getPerson(scopeId, personId) {
            const state = await stateStore.read();
            const scope = getScope(state, scopeId, false);
            return scope.people[personId] ? copy(scope.people[personId]) : null;
        },
        async getCurrentProfile(scopeId) {
            const state = await stateStore.read();
            const scope = getScope(state, scopeId, false);
            return copy(scope.selfProfile);
        },
        async updateCurrentProfile(scopeId, profile = {}, operationOptions = {}) {
            return transactScoped(scopeId, operationOptions, (state) => {
                const scope = getScope(state, scopeId, false);
                const current = scope.selfProfile;
                const previousAvatarAssetId = current.avatarAssetId;
                const previousProfileBackgroundAssetId = current.profileBackgroundAssetId;
                if (Object.hasOwn(profile, 'avatarAssetId')) {
                    current.avatarAssetId = requireProfileAsset(state, scope, profile.avatarAssetId, 'avatar');
                }
                if (Object.hasOwn(profile, 'signature')) current.signature = asText(profile.signature, 1000);
                if (Object.hasOwn(profile, 'gender')) current.gender = asText(profile.gender, 120);
                if (Object.hasOwn(profile, 'birthday')) current.birthday = asText(profile.birthday, 120);
                if (Object.hasOwn(profile, 'profileBackgroundAssetId')) {
                    current.profileBackgroundAssetId = requireProfileAsset(state, scope, profile.profileBackgroundAssetId, 'profile-background');
                }
                if (previousAvatarAssetId !== current.avatarAssetId) {
                    syncSenderAvatar(scope, SELF_ID, current.avatarAssetId);
                    removeAssetIfUnreferenced(scope, previousAvatarAssetId);
                }
                if (previousProfileBackgroundAssetId !== current.profileBackgroundAssetId) {
                    removeAssetIfUnreferenced(scope, previousProfileBackgroundAssetId);
                }
                return copy(current);
            });
        },
        async updatePrivateProfile(scopeId, conversationId, profile = {}, operationOptions = {}) {
            return transactScoped(scopeId, operationOptions, (state) => {
                const scope = getScope(state, scopeId, false);
                const conversation = getConversation(scope, conversationId);
                if (conversation.kind !== 'private') {
                    throw new QQV2DomainError('只有私聊会话可以修改人物资料', 'private_conversation_required');
                }
                const person = getPerson(scope, conversation.personId);
                const previousAvatarAssetId = person.avatarAssetId;
                const previousProfileBackgroundAssetId = person.profileBackgroundAssetId;
                const previousBackgroundAssetId = conversation.backgroundAssetId;
                if (Object.hasOwn(profile, 'formalName')) {
                    const formalName = exactContactFormalName(profile.formalName);
                    const collision = Object.values(scope.people).find((candidate) => (
                        candidate.personId !== person.personId && candidate.formalName === formalName
                    ));
                    if (collision) throw new QQV2DomainError('已存在同名联系人', 'person_name_conflict');
                    person.formalName = formalName;
                    person.normalizedName = formalName;
                }
                if (Object.hasOwn(profile, 'remark')) conversation.remark = asText(profile.remark, 120);
                if (Object.hasOwn(profile, 'avatarAssetId')) {
                    person.avatarAssetId = requireProfileAsset(state, scope, profile.avatarAssetId, 'avatar');
                }
                if (Object.hasOwn(profile, 'signature')) person.signature = asText(profile.signature, 1000);
                if (Object.hasOwn(profile, 'gender')) person.gender = asText(profile.gender, 120);
                if (Object.hasOwn(profile, 'birthday')) person.birthday = asText(profile.birthday, 120);
                if (Object.hasOwn(profile, 'profileBackgroundAssetId')) {
                    person.profileBackgroundAssetId = requireProfileAsset(state, scope, profile.profileBackgroundAssetId, 'profile-background');
                }
                if (Object.hasOwn(profile, 'backgroundAssetId')) {
                    conversation.backgroundAssetId = requireProfileAsset(state, scope, profile.backgroundAssetId, 'background', conversation.conversationId);
                }
                if (previousAvatarAssetId !== person.avatarAssetId) {
                    syncSenderAvatar(scope, person.personId, person.avatarAssetId);
                    removeAssetIfUnreferenced(scope, previousAvatarAssetId);
                }
                if (previousBackgroundAssetId !== conversation.backgroundAssetId) {
                    removeAssetIfUnreferenced(scope, previousBackgroundAssetId);
                }
                if (previousProfileBackgroundAssetId !== person.profileBackgroundAssetId) {
                    removeAssetIfUnreferenced(scope, previousProfileBackgroundAssetId);
                }
                return copy({ person, conversation });
            });
        },
        async updateGroupProfile(scopeId, conversationId, profile = {}) {
            return stateStore.transact((state) => {
                const scope = getScope(state, scopeId, false);
                const conversation = getConversation(scope, conversationId);
                if (conversation.kind !== 'group') {
                    throw new QQV2DomainError('只有群聊会话可以修改群资料', 'group_conversation_required');
                }
                const group = getGroup(scope, conversation.groupId);
                const previousBackgroundAssetId = conversation.backgroundAssetId;
                if (Object.hasOwn(profile, 'backgroundAssetId')) {
                    conversation.backgroundAssetId = requireProfileAsset(state, scope, profile.backgroundAssetId, 'background', conversation.conversationId);
                }
                if (previousBackgroundAssetId !== conversation.backgroundAssetId) {
                    removeAssetIfUnreferenced(scope, previousBackgroundAssetId);
                }
                return copy({ group, conversation });
            });
        },
        async createPrivateConversation(scopeId, input = {}, operationOptions = {}) {
            return transactScoped(scopeId, operationOptions, (state) => {
                const scope = getScope(state, scopeId, true);
                const formalName = exactContactFormalName(input.name);
                let person = Object.values(scope.people).find((candidate) => candidate.formalName === formalName) || null;
                if (!person) {
                    person = createPrivatePerson(state, scope, formalName, random);
                    scope.people[person.personId] = person;
                }
                let conversation = Object.values(scope.conversations).find((candidate) => (
                    candidate.kind === 'private' && candidate.personId === person.personId
                )) || null;
                if (conversation) {
                    const restored = conversation.status !== 'active';
                    conversation.status = 'active';
                    if (restored) {
                        appendSystemMessage(
                            scope,
                            conversation,
                            `${asText(input.userName, 120) || '用户'}和${person.formalName}成为好友`,
                            asText(input.storyTime, 128),
                        );
                    }
                    return { created: false, restored, person: copy(person), conversation: copy(conversation) };
                }
                conversation = createPrivateConversation(state, scope, person, random);
                scope.conversations[conversation.conversationId] = conversation;
                return { created: true, person: copy(person), conversation: copy(conversation) };
            });
        },
        async removePrivateFriend(scopeId, conversationId, input = {}, operationOptions = {}) {
            return transactScoped(scopeId, operationOptions, (state) => {
                const scope = getScope(state, scopeId, false);
                const conversation = getConversation(scope, conversationId);
                if (conversation.kind !== 'private') {
                    throw new QQV2DomainError('只能删除私聊好友', 'private_conversation_required');
                }
                const person = getPerson(scope, conversation.personId);
                if (conversation.status !== 'active') {
                    return { removed: false, conversation: copy(conversation), person: copy(person) };
                }
                conversation.status = 'readonly';
                appendSystemMessage(
                    scope,
                    conversation,
                    `${asText(input.userName, 120) || '用户'}删除了${person.formalName}`,
                    asText(input.storyTime, 128),
                );
                return { removed: true, conversation: copy(conversation), person: copy(person) };
            });
        },
        async handleIncomingTransfer(scopeId, conversationId, messageId, action, storyTime = '', operationOptions = {}) {
            return transactScoped(scopeId, operationOptions, (state) => {
                const scope = getScope(state, scopeId, false);
                const conversation = getConversation(scope, conversationId);
                if (conversation.kind !== 'private') {
                    throw new QQV2DomainError('Only private transfers can be handled', 'private_conversation_required');
                }
                if (!['accept', 'return'].includes(action)) {
                    throw new QQV2DomainError('Transfer action is invalid', 'transfer_action_invalid');
                }
                const message = scope.messages[asText(messageId, 256)];
                if (!message || message.conversationId !== conversation.conversationId) {
                    throw new QQV2DomainError('Transfer message is unavailable', 'transfer_not_found');
                }
                if (message.type !== 'transfer' || !message.transfer) {
                    throw new QQV2DomainError('Message is not a transfer', 'transfer_invalid');
                }
                if (message.senderId !== conversation.personId || message.transfer.status !== 'pending') {
                    throw new QQV2DomainError('Transfer is no longer pending', 'transfer_not_pending');
                }
                message.transfer.status = action === 'accept' ? 'accepted' : 'returned';
                message.transfer.handledStoryTime = asText(storyTime, 128);
                return copy(message);
            });
        },
        async createGroupConversation(scopeId, input = {}) {
            return stateStore.transact((state) => {
                const scope = getScope(state, scopeId, true);
                const name = requireText(input.name, '群名称', 120);
                const memberIds = [...new Set(Array.isArray(input.memberIds) ? input.memberIds.map((id) => asText(id, 256)).filter(Boolean) : [])];
                if (memberIds.length < 2) throw new QQV2DomainError('创建群聊至少需要两名已有私聊好友', 'group_member_count');
                memberIds.forEach((personId) => {
                    getPerson(scope, personId);
                    if (!isPrivateFriend(scope, personId)) throw new QQV2DomainError('群成员必须是已有私聊好友', 'group_member_not_friend');
                });
                const ownerId = asText(input.ownerId, 256) || SELF_ID;
                if (ownerId !== SELF_ID && !memberIds.includes(ownerId)) {
                    throw new QQV2DomainError('NPC 群主必须是当前群成员', 'group_owner_invalid');
                }
                const groupId = createId('group');
                const conversationId = createId('group-conversation');
                const group = {
                    groupId,
                    scopeId: scope.scopeId,
                    conversationId,
                    name,
                    ownerId,
                    adminIds: [],
                    memberIds,
                    selfRole: ownerId === SELF_ID ? 'owner' : 'member',
                    selfExited: false,
                    status: 'active',
                    mutes: {},
                };
                const conversation = {
                    conversationId,
                    scopeId: scope.scopeId,
                    kind: 'group',
                    personId: '',
                    groupId,
                    status: 'active',
                    backgroundAssetId: '',
                    unreadCount: 0,
                    nextSequence: 1,
                    lastSequence: 0,
                    lastMessageId: '',
                    injection: createDefaultInjection(),
                };
                scope.groups[groupId] = group;
                scope.conversations[conversationId] = conversation;
                return { group: copy(group), conversation: copy(conversation) };
            });
        },
        async getGroup(scopeId, groupId) {
            const state = await stateStore.read();
            const scope = getScope(state, scopeId, false);
            return scope.groups[groupId] ? copy(scope.groups[groupId]) : null;
        },
        async listMessages(scopeId, conversationId) {
            const state = await stateStore.read();
            const scope = getScope(state, scopeId, false);
            getConversation(scope, conversationId);
            return Object.values(scope.messages)
                .filter((message) => message.conversationId === conversationId)
                .sort((left, right) => left.sequence - right.sequence)
                .map((message) => messageWithQuote(scope, message));
        },
        async appendMessages(scopeId, conversationId, inputs, operationOptions = {}) {
            return transactScoped(scopeId, operationOptions, (state) => {
                const scope = getScope(state, scopeId, false);
                const conversation = getConversation(scope, conversationId);
                if (!Array.isArray(inputs) || inputs.length === 0) throw new QQV2DomainError('至少需要一条消息', 'message_required');
                return inputs.map((input) => appendOneMessage(scope, conversation, input));
            });
        },
        async deleteMessages(scopeId, conversationId, messageIds, operationOptions = {}) {
            return transactScoped(scopeId, operationOptions, (state) => {
                const scope = getScope(state, scopeId, false);
                const conversation = getConversation(scope, conversationId);
                const ids = [...new Set(Array.isArray(messageIds) ? messageIds.map((id) => asText(id, 256)).filter(Boolean) : [])];
                const deletedMessages = ids.map((messageId) => {
                    const message = scope.messages[messageId];
                    return message?.conversationId === conversationId ? message : null;
                }).filter(Boolean);
                const deletedMessageIds = deletedMessages.map((message) => message.messageId);
                const releasedAssetIds = new Set(deletedMessages.flatMap((message) => [
                    message.assetId,
                    message.senderAvatarAssetId,
                ]));
                deletedMessageIds.forEach((messageId) => {
                    delete scope.messages[messageId];
                });
                if (conversation.injection?.selectedMessageIds) {
                    conversation.injection.selectedMessageIds = conversation.injection.selectedMessageIds.filter((id) => !deletedMessageIds.includes(id));
                }
                updateConversationAfterMessageRemoval(scope, conversation);
                releasedAssetIds.forEach((assetId) => removeAssetIfUnreferenced(scope, assetId));
                return { deletedMessageIds };
            });
        },
        async saveScopeAsset(scopeId, input = {}, operationOptions = {}) {
            return transactScoped(scopeId, operationOptions, (state) => {
                const scope = getScope(state, scopeId, false);
                const conversationId = asText(input.conversationId, 256);
                if (conversationId) getConversation(scope, conversationId);
                const asset = {
                    assetId: createId('asset'),
                    scopeId: scope.scopeId,
                    conversationId,
                    kind: requireText(input.kind, '资源类型', 32),
                    blob: input.blob instanceof Blob ? input.blob : null,
                    mimeType: asText(input.mimeType, 128),
                };
                if (!asset.blob) throw new QQV2DomainError('图片资源必须使用 Blob 保存', 'asset_blob_required');
                scope.assets[asset.assetId] = asset;
                return copy(asset);
            });
        },
        async listScopeAssets(scopeId, conversationId = '') {
            const state = await stateStore.read();
            const scope = getScope(state, scopeId, false);
            return Object.values(scope.assets).filter((asset) => !conversationId || asset.conversationId === conversationId).map(copy);
        },
        async getMediaAsset(scopeId, assetId) {
            const state = await stateStore.read();
            const scope = getScope(state, scopeId, false);
            const id = asText(assetId, 256);
            return copy(scope.assets[id] || findImageLibraryAsset(state, id));
        },
        saveImageLibraryAssets,
        async saveImageLibraryAsset(scopeId, input = {}, operationOptions = {}) {
            return (await saveImageLibraryAssets(scopeId, [input], operationOptions))[0];
        },
        async listImageLibraryAssets(scopeId, library) {
            const state = await stateStore.read();
            getScope(state, scopeId, false);
            return imageLibraryAssets(state, library)
                .sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0))
                .map(copy);
        },
        async deleteImageLibraryAssets(scopeId, assetIds, operationOptions = {}) {
            return transactScoped(scopeId, operationOptions, (state) => {
                getScope(state, scopeId, false);
                const ids = [...new Set(Array.isArray(assetIds) ? assetIds.map((id) => asText(id, 256)).filter(Boolean) : [])];
                const scopes = Object.values(state.scopes || {});
                const libraryAssets = state.sharedResources?.[SHARED_IMAGE_LIBRARY_KEY] || {};
                const deletedAssetIds = ids.filter((id) => Boolean(libraryAssets[id]?.library));
                const deleted = new Set(deletedAssetIds);
                scopes.forEach((scope) => {
                    ensureScopeQQV2State(scope);
                    if (deleted.has(scope.selfProfile.avatarAssetId)) scope.selfProfile.avatarAssetId = '';
                    if (deleted.has(scope.selfProfile.profileBackgroundAssetId)) scope.selfProfile.profileBackgroundAssetId = '';
                    Object.values(scope.people).forEach((person) => {
                        if (deleted.has(person.avatarAssetId)) person.avatarAssetId = '';
                        if (deleted.has(person.profileBackgroundAssetId)) person.profileBackgroundAssetId = '';
                    });
                    Object.values(scope.conversations).forEach((conversation) => {
                        if (deleted.has(conversation.backgroundAssetId)) conversation.backgroundAssetId = '';
                    });
                    Object.values(scope.messages).forEach((message) => {
                        if (deleted.has(message.senderAvatarAssetId)) message.senderAvatarAssetId = '';
                        if (deleted.has(message.assetId)) message.assetId = '';
                    });
                });
                deletedAssetIds.forEach((assetId) => delete libraryAssets[assetId]);
                return { deletedAssetIds };
            });
        },
        async manageGroup(scopeId, input = {}) {
            return stateStore.transact((state) => {
                const scope = getScope(state, scopeId, false);
                return copy(applyGroupManagement(scope, {
                    ...input,
                    actorId: SELF_ID,
                }));
            });
        },
        async appointAdministrator(scopeId, groupId, actorId, targetId, storyTime = '') {
            return stateStore.transact((state) => {
                const scope = getScope(state, scopeId, false);
                return copy(applyGroupManagement(scope, {
                    groupId,
                    actorId,
                    targetPersonId: targetId,
                    action: 'appoint-admin',
                    storyTime,
                }));
            });
        },
        async muteGroupMember(scopeId, groupId, actorId, targetId, duration, storyTime) {
            return stateStore.transact((state) => {
                const scope = getScope(state, scopeId, false);
                return copy(applyGroupManagement(scope, {
                    groupId,
                    actorId,
                    targetPersonId: targetId,
                    action: 'mute',
                    duration,
                    storyTime,
                }));
            });
        },
        async unmuteGroupMember(scopeId, groupId, actorId, targetId, storyTime = '') {
            return stateStore.transact((state) => {
                const scope = getScope(state, scopeId, false);
                return copy(applyGroupManagement(scope, {
                    groupId,
                    actorId,
                    targetPersonId: targetId,
                    action: 'unmute',
                    storyTime,
                }));
            });
        },
        async kickGroupMember(scopeId, groupId, actorId, targetId, storyTime = '') {
            return stateStore.transact((state) => {
                const scope = getScope(state, scopeId, false);
                return copy(applyGroupManagement(scope, {
                    groupId,
                    actorId,
                    targetPersonId: targetId,
                    action: 'kick',
                    storyTime,
                }));
            });
        },
        async reinviteSelf(scopeId, groupId, actorId, storyTime = '') {
            return stateStore.transact((state) => {
                const scope = getScope(state, scopeId, false);
                return copy(applyGroupManagement(scope, {
                    groupId,
                    actorId,
                    targetPersonId: SELF_ID,
                    action: 'reinvite',
                    storyTime,
                }));
            });
        },
        async deleteConversation(scopeId, conversationId, operationOptions = {}) {
            return transactScoped(scopeId, operationOptions, (state) => {
                const scope = getScope(state, scopeId, false);
                const conversation = getConversation(scope, conversationId);
                const group = conversation.kind === 'group' ? getGroup(scope, conversation.groupId) : null;
                const retainPrivateContact = conversation.kind === 'private'
                    && isPrivateFriend(scope, conversation.personId);
                const mode = conversation.kind === 'private'
                    ? 'private'
                    : group.ownerId === SELF_ID
                        ? 'dissolved'
                        : 'exited';
                const affectedPersonIds = conversation.kind === 'private'
                    ? [conversation.personId]
                    : [...new Set([...group.memberIds, group.ownerId])];
                const deletedMessages = Object.values(scope.messages)
                    .filter((message) => message.conversationId === conversationId);
                const releasedAssetIds = new Set([
                    conversation.backgroundAssetId,
                    ...deletedMessages.flatMap((message) => [message.assetId, message.senderAvatarAssetId]),
                ]);
                deletedMessages.forEach((message) => delete scope.messages[message.messageId]);
                Object.values(scope.assets).filter((asset) => asset.conversationId === conversationId).forEach((asset) => delete scope.assets[asset.assetId]);
                if (retainPrivateContact) {
                    conversation.status = 'contact';
                    conversation.backgroundAssetId = '';
                    conversation.unreadCount = 0;
                    conversation.nextSequence = 1;
                    conversation.lastSequence = 0;
                    conversation.lastMessageId = '';
                    conversation.injection = createDefaultInjection();
                } else {
                    delete scope.conversations[conversationId];
                }
                if (conversation.kind === 'group') delete scope.groups[conversation.groupId];
                if (!retainPrivateContact) {
                    affectedPersonIds.forEach((personId) => {
                        if (personStillReferenced(scope, personId)) return;
                        const person = scope.people[personId];
                        if (!person) return;
                        const avatarAssetId = person.avatarAssetId;
                        delete scope.people[personId];
                        removeAssetIfUnreferenced(scope, avatarAssetId);
                    });
                }
                releasedAssetIds.forEach((assetId) => removeAssetIfUnreferenced(scope, assetId));
                return { deletedConversationId: conversationId, mode };
            });
        },
        async applyAIActions(scopeId, actions, options = {}) {
            return transactScoped(scopeId, options, (state) => {
                if (typeof options.isCurrent === 'function' && !options.isCurrent()) {
                    throw new QQV2DomainError('AI 动作批次已被新的请求取代', 'request_cancelled');
                }
                const scope = getScope(state, scopeId, false);
                if (!Array.isArray(actions)) throw new QQV2DomainError('AI 动作批次必须是数组', 'action_batch_invalid');
                const storyTime = asText(options.storyTime, 128);
                const conversationReferences = new Map(Object.entries(options.references || {}));
                const personReferences = new Map();
                const createdConversationIds = [];
                const createdWithoutMessage = new Set();
                const applied = [];
                const resolveConversation = (reference) => {
                    const id = conversationReferences.get(reference) || reference;
                    return getConversation(scope, id);
                };
                const resolvePerson = (reference) => personReferences.get(reference) || reference;
                const createPrivate = (action) => {
                    if (conversationReferences.has(action.id)) throw new QQV2DomainError('新私聊引用重复', 'action_reference_duplicate');
                    const formalName = exactContactFormalName(action.name);
                    let person = Object.values(scope.people).find((candidate) => candidate.formalName === formalName) || null;
                    if (!person) {
                        person = createPrivatePerson(state, scope, formalName, random);
                        scope.people[person.personId] = person;
                    }
                    let conversation = Object.values(scope.conversations).find((candidate) => candidate.kind === 'private' && candidate.personId === person.personId) || null;
                    if (!conversation) {
                        conversation = createPrivateConversation(state, scope, person, random);
                        scope.conversations[conversation.conversationId] = conversation;
                    }
                    conversationReferences.set(action.id, conversation.conversationId);
                    personReferences.set(action.id, person.personId);
                    createdConversationIds.push(conversation.conversationId);
                    createdWithoutMessage.add(conversation.conversationId);
                    return conversation;
                };
                const createGroup = (action) => {
                    if (conversationReferences.has(action.id)) throw new QQV2DomainError('新群聊引用重复', 'action_reference_duplicate');
                    const memberIds = [...new Set((action.members || []).map(resolvePerson))];
                    if (memberIds.length < 2) throw new QQV2DomainError('新群聊至少需要两名成员', 'group_member_count');
                    memberIds.forEach((personId) => {
                        getPerson(scope, personId);
                        if (!isPrivateFriend(scope, personId)) throw new QQV2DomainError('新群成员必须是已有私聊好友', 'group_member_not_friend');
                    });
                    const ownerId = resolvePerson(action.owner);
                    if (!memberIds.includes(ownerId)) throw new QQV2DomainError('NPC 群主必须是当前群成员', 'group_owner_invalid');
                    const groupId = createId('group');
                    const conversationId = createId('group-conversation');
                    const group = { groupId, scopeId: scope.scopeId, conversationId, name: requireText(action.name, '群名称', 120), ownerId, adminIds: [], memberIds, selfRole: 'member', selfExited: false, status: 'active', mutes: {} };
                    const conversation = {
                        conversationId, scopeId: scope.scopeId, kind: 'group', personId: '', groupId, status: 'active', backgroundAssetId: '', unreadCount: 0, nextSequence: 1, lastSequence: 0, lastMessageId: '',
                        injection: createDefaultInjection(),
                    };
                    scope.groups[groupId] = group;
                    scope.conversations[conversationId] = conversation;
                    conversationReferences.set(action.id, conversationId);
                    createdConversationIds.push(conversationId);
                    createdWithoutMessage.add(conversationId);
                    return conversation;
                };
                const runGroupAction = (action) => {
                    const conversation = resolveConversation(action.conversation);
                    if (conversation.kind !== 'group') throw new QQV2DomainError('群管理动作目标必须是群聊', 'group_action_target');
                    return applyGroupManagement(scope, {
                        groupId: conversation.groupId,
                        action: action.action,
                        actorId: resolvePerson(action.actor),
                        targetPersonId: resolvePerson(action.target),
                        value: action.value,
                        duration: action.duration,
                        storyTime,
                    });
                };
                const runTransferAction = (action) => {
                    const conversation = resolveConversation(action.conversation);
                    const transferMessage = scope.messages[asText(action.message, 256)];
                    if (!transferMessage || transferMessage.conversationId !== conversation.conversationId) {
                        throw new QQV2DomainError('转账消息不存在或不属于该会话', 'transfer_not_found');
                    }
                    if (transferMessage.type !== 'transfer' || !transferMessage.transfer) {
                        throw new QQV2DomainError('目标消息不是转账', 'transfer_invalid');
                    }
                    if (transferMessage.senderId !== SELF_ID || transferMessage.transfer.status !== 'pending') {
                        throw new QQV2DomainError('该转账当前不能由 AI 处理', 'transfer_not_pending');
                    }
                    const actorId = resolvePerson(action.actor);
                    if (transferMessage.transfer.recipientId !== actorId) {
                        throw new QQV2DomainError('转账处理人不是指定收款人', 'transfer_recipient_invalid');
                    }
                    transferMessage.transfer.status = action.action === 'accept' ? 'accepted' : 'rejected';
                    transferMessage.transfer.handledStoryTime = storyTime;
                    applied.push({
                        type: action.type,
                        messageId: transferMessage.messageId,
                        status: transferMessage.transfer.status,
                    });
                };

                actions.forEach((action) => {
                    if (!action || typeof action !== 'object') throw new QQV2DomainError('AI 动作无效', 'action_invalid');
                    if (action.type === 'create-private') {
                        createPrivate(action);
                        applied.push({ type: action.type, reference: action.id });
                        return;
                    }
                    if (action.type === 'create-group') {
                        createGroup(action);
                        applied.push({ type: action.type, reference: action.id });
                        return;
                    }
                    if (action.type === 'message') {
                        const conversation = resolveConversation(action.conversation);
                        const senderId = action.senderPersonReference ? resolvePerson(action.senderPersonReference) : resolvePerson(action.sender);
                        const message = appendOneMessage(scope, conversation, {
                            senderId,
                            senderType: senderId === SELF_ID ? 'self' : 'person',
                            type: action.messageType,
                            content: action.content,
                            storyTime,
                            quoteMessageId: asText(action.quote, 256),
                            mentionIds: (action.mentions || []).map(resolvePerson),
                            mentionAll: action.mentionAll === true,
                            stickerId: asText(action.stickerId, 256),
                            transfer: action.messageType === 'transfer' ? { amount: action.amount, note: action.note, recipientId: resolvePerson(action.recipient), status: 'pending' } : null,
                        });
                        createdWithoutMessage.delete(conversation.conversationId);
                        applied.push({ type: action.type, messageId: message.messageId });
                        return;
                    }
                    if (action.type === 'read') {
                        const conversation = resolveConversation(action.conversation);
                        if (conversation.kind !== 'private') throw new QQV2DomainError('read 只允许私聊', 'read_invalid');
                        const lastUserMessage = Object.values(scope.messages)
                            .filter((message) => message.conversationId === conversation.conversationId && message.senderId === SELF_ID)
                            .sort((left, right) => right.sequence - left.sequence)[0];
                        conversation.lastHandledUserSequence = lastUserMessage?.sequence || conversation.lastHandledUserSequence || 0;
                        conversation.readMessageId = lastUserMessage?.messageId || '';
                        applied.push({ type: action.type, conversationId: conversation.conversationId });
                        return;
                    }
                    if (action.type === 'transfer') {
                        runTransferAction(action);
                        return;
                    }
                    if (action.type === 'none') {
                        applied.push({ type: action.type });
                        return;
                    }
                    if (action.type === 'group') {
                        runGroupAction(action);
                        applied.push({ type: action.type, action: action.action });
                        return;
                    }
                    throw new QQV2DomainError('不支持的 AI 动作', 'action_invalid');
                });
                if (createdWithoutMessage.size > 0) {
                    throw new QQV2DomainError('AI 新建会话必须在同一批提供合法首条消息', 'created_conversation_without_message');
                }
                for (const [conversationId, sequence] of Object.entries(options.handledUserSequences || {})) {
                    const conversation = getConversation(scope, conversationId);
                    const boundary = Number(sequence);
                    const matchingUserMessage = Object.values(scope.messages).find((message) => (
                        message.conversationId === conversation.conversationId
                        && message.senderId === SELF_ID
                        && message.sequence === boundary
                    ));
                    if (!Number.isInteger(boundary) || boundary < 1 || !matchingUserMessage) {
                        throw new QQV2DomainError('未回复批次边界必须指向当前会话的用户消息', 'handled_boundary_invalid');
                    }
                    conversation.lastHandledUserSequence = Math.max(
                        Number(conversation.lastHandledUserSequence || 0),
                        boundary,
                    );
                }
                return { applied, createdConversationIds };
            });
        },
    });
}

export const QQV2_SELF_ID = SELF_ID;
export const QQV2_GROUP_ROLES = GROUP_ROLES;
