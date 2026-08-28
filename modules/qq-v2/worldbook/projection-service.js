import { formatQQV2MessageSemantic } from '../domain/message-semantics.js';
import { qqV2WorldbookPlacement } from './placement.js';

const MARKER_KEY = 'yuziPhoneQQV2';
const COMMENT_PREFIX = 'YuziQQ｜';
const SELF_ID = '__self__';
const DEFAULT_WORLDBOOK_INJECTION_COUNT = 30;

function asText(value, maxLength = 0) {
    const text = String(value ?? '').trim();
    return maxLength > 0 ? text.slice(0, maxLength) : text;
}

function clone(value) {
    if (typeof globalThis.structuredClone === 'function') return globalThis.structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

function uniqueNames(values) {
    const result = [];
    const seen = new Set();
    for (const value of values) {
        const name = asText(value, 256);
        if (!name || seen.has(name)) continue;
        seen.add(name);
        result.push(name);
    }
    return result;
}

function parseStoryTime(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(asText(value, 128));
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4] || 0);
    const minute = Number(match[5] || 0);
    const hasClock = match[4] !== undefined && match[5] !== undefined;
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
    if (date.getUTCFullYear() !== year
        || date.getUTCMonth() !== month - 1
        || date.getUTCDate() !== day
        || (hasClock && (date.getUTCHours() !== hour || date.getUTCMinutes() !== minute))) return null;
    return date;
}

function dateLabel(value) {
    const date = parseStoryTime(value);
    if (!date) return '未知故事时间';
    const two = (number) => String(number).padStart(2, '0');
    return `${date.getUTCFullYear()}-${two(date.getUTCMonth() + 1)}-${two(date.getUTCDate())}`;
}

function timeLabel(value) {
    const text = asText(value, 128);
    if (!/[ T]\d{2}:\d{2}$/.test(text)) return '';
    const date = parseStoryTime(text);
    if (!date) return '';
    const two = (number) => String(number).padStart(2, '0');
    return `${two(date.getUTCHours())}:${two(date.getUTCMinutes())}`;
}

function subtractStoryWindow(now, window) {
    const date = new Date(now.getTime());
    const amount = Number(window?.value);
    if (!Number.isInteger(amount) || amount <= 0) return null;
    switch (window?.unit) {
    case 'hour':
        date.setUTCHours(date.getUTCHours() - amount);
        return date;
    case 'day':
        date.setUTCDate(date.getUTCDate() - amount);
        return date;
    case 'month': {
        const day = date.getUTCDate();
        date.setUTCDate(1);
        date.setUTCMonth(date.getUTCMonth() - amount);
        const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
        date.setUTCDate(Math.min(day, lastDay));
        return date;
    }
    case 'year': {
        const month = date.getUTCMonth();
        const day = date.getUTCDate();
        date.setUTCDate(1);
        date.setUTCFullYear(date.getUTCFullYear() - amount, month, 1);
        const lastDay = new Date(Date.UTC(date.getUTCFullYear(), month + 1, 0)).getUTCDate();
        date.setUTCDate(Math.min(day, lastDay));
        return date;
    }
    default:
        return null;
    }
}

function inAutomaticWindow(message, settings, storyTime) {
    if (settings.timeWindow?.mode === 'all') return true;
    const now = parseStoryTime(storyTime);
    const messageTime = parseStoryTime(message.storyTime);
    if (!now || !messageTime) return false;
    const cutoff = subtractStoryWindow(now, settings.timeWindow);
    return Boolean(cutoff && messageTime >= cutoff && messageTime <= now);
}

function sortProjectionMessages(messages) {
    return [...messages].sort((left, right) => {
        const sequenceDifference = Number(left.sequence || 0) - Number(right.sequence || 0);
        if (sequenceDifference) return sequenceDifference;
        return (parseStoryTime(left.storyTime)?.getTime() || 0) - (parseStoryTime(right.storyTime)?.getTime() || 0);
    });
}

function isInjectableMessage(message) {
    if (!asText(message?.messageId, 256)) return false;
    if (message.isTimeSeparator === true || message.kind === 'time-separator' || message.type === 'time-separator') return false;
    if (message.senderType === 'system' || message.senderId === '__system__' || message.type === 'system') {
        return message.deletable !== false;
    }
    return message.senderId === SELF_ID
        || message.senderType === 'self'
        || message.senderType === 'person';
}

function selectProjectionMessages(data, storyTime) {
    const selectedIds = new Set(data.conversation.injection.selectedMessageIds || []);
    const uniqueMessages = new Map();
    for (const message of data.messages || []) {
        if (isInjectableMessage(message) && !uniqueMessages.has(message.messageId)) {
            uniqueMessages.set(message.messageId, message);
        }
    }
    const allMessages = [];
    const manualMessages = [];
    const manualMessageIds = new Set();
    const automaticMessages = [];
    for (const message of uniqueMessages.values()) {
        allMessages.push(message);
        const manuallySelected = message.selectedForInjection === true || selectedIds.has(message.messageId);
        if (manuallySelected) {
            manualMessages.push(message);
            manualMessageIds.add(message.messageId);
        }
        if (!manuallySelected && inAutomaticWindow(message, data.settings, storyTime)) {
            automaticMessages.push(message);
        }
    }
    const injectionCount = Number(data.settings?.injectionCount);
    const normalizedInjectionCount = Number.isInteger(injectionCount) && injectionCount >= 0
        ? injectionCount
        : DEFAULT_WORLDBOOK_INJECTION_COUNT;
    let selectedAutomaticMessages = automaticMessages;
    if (normalizedInjectionCount > 0) {
        const fallbackMessages = allMessages.filter((message) => !manualMessageIds.has(message.messageId));
        const automaticSource = automaticMessages.length > 0 ? automaticMessages : fallbackMessages;
        selectedAutomaticMessages = sortProjectionMessages(automaticSource).slice(-normalizedInjectionCount);
    }
    return sortProjectionMessages([...manualMessages, ...selectedAutomaticMessages]);
}

function dedupeKeywords(values) {
    const seen = new Set();
    return values.map((item) => asText(item, 160)).filter((item) => {
        const key = item.toLocaleLowerCase('zh-CN');
        if (!item || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function markerFor(scopeId, conversationId) {
    return { version: 2, scopeId, conversationId };
}

function currentProjectionConversationId(entry) {
    const comment = asText(entry?.comment);
    const isCurrentTitle = comment.startsWith(`${COMMENT_PREFIX}私聊｜`)
        || comment.startsWith(`${COMMENT_PREFIX}群聊｜`);
    if (!isCurrentTitle) return '';
    const separatorIndex = comment.lastIndexOf('｜');
    return separatorIndex >= 0 ? asText(comment.slice(separatorIndex + 1)) : '';
}

function isOwnedEntry(entry, scopeId, conversationId = '') {
    const entryConversationId = currentProjectionConversationId(entry);
    return Boolean(entryConversationId && (!conversationId || entryConversationId === conversationId));
}

function ensureEntries(book) {
    if (!isObject(book.entries)) book.entries = {};
    return book.entries;
}

function nextUid(entries) {
    const ids = Object.keys(entries)
        .map((key) => Number(entries[key]?.uid ?? key))
        .filter((value) => Number.isInteger(value) && value >= 0);
    return ids.length ? Math.max(...ids) + 1 : 0;
}

function ownedEntries(book, scopeId, conversationId = '') {
    return Object.entries(ensureEntries(book)).filter(([, entry]) => isOwnedEntry(entry, scopeId, conversationId));
}

function isCurrentProjectionEntry(entry, conversationId) {
    return currentProjectionConversationId(entry) === conversationId;
}

function currentProjectionEntries(book, conversationId) {
    return Object.entries(ensureEntries(book)).filter(([, entry]) => (
        isCurrentProjectionEntry(entry, conversationId)
    ));
}

function removeOwnedEntries(book, scopeId, conversationId = '') {
    const entries = ensureEntries(book);
    let removed = false;
    for (const [key, entry] of Object.entries(entries)) {
        if (!isOwnedEntry(entry, scopeId, conversationId)) continue;
        delete entries[key];
        removed = true;
    }
    return removed;
}

function ownedEntriesForConversations(book, scopeId, conversationIds) {
    const ids = conversationIds instanceof Set ? conversationIds : new Set(conversationIds);
    return Object.entries(ensureEntries(book)).filter(([, entry]) => (
        ids.has(currentProjectionConversationId(entry))
    ));
}

function assertNoDuplicateProjectionEntries(entries) {
    const seen = new Set();
    for (const [, entry] of entries) {
        const conversationId = currentProjectionConversationId(entry);
        if (seen.has(conversationId)) throw duplicateProjectionError(conversationId);
        seen.add(conversationId);
    }
}

function removeEntriesForConversations(book, scopeId, conversationIds) {
    const entries = ensureEntries(book);
    let removed = false;
    for (const [key] of ownedEntriesForConversations(book, scopeId, conversationIds)) {
        delete entries[key];
        removed = true;
    }
    return removed;
}

function restoreOwnedEntries(book, scopeId, snapshot, conversationId = '') {
    removeOwnedEntries(book, scopeId, conversationId);
    const entries = ensureEntries(book);
    for (const [key, entry] of snapshot) {
        if (entries[key] && !isOwnedEntry(entries[key], scopeId, conversationId)) {
            throw new Error(`QQ 世界书条目 ${key} 已被占用`);
        }
        entries[key] = clone(entry);
    }
}

function restoreConversationEntries(book, scopeId, conversationIds, snapshot) {
    const ids = conversationIds instanceof Set ? conversationIds : new Set(conversationIds);
    removeEntriesForConversations(book, scopeId, ids);
    const entries = ensureEntries(book);
    for (const [key, entry] of snapshot) {
        const replaceable = ids.has(currentProjectionConversationId(entries[key]));
        if (entries[key] && !replaceable) {
            throw new Error(`QQ 世界书条目 ${key} 已被占用`);
        }
        entries[key] = clone(entry);
    }
}

function trackedBookNames(data) {
    const projection = data?.conversation?.injection?.projection || {};
    return uniqueNames([
        data?.settings?.bookName,
        projection.bookName,
        ...(projection.pending === true && Array.isArray(projection.managedBookNames)
            ? projection.managedBookNames
            : []),
    ]);
}

function resolveParticipantNames(data) {
    const people = new Map((data.people || []).map((person) => [person.personId, person.formalName]));
    if (data.conversation.kind === 'private') {
        return [asText(people.get(data.conversation.personId))].filter(Boolean);
    }
    return (data.group?.memberIds || []).map((personId) => asText(people.get(personId))).filter(Boolean);
}

function resolveEntryName(data) {
    if (data.conversation.kind === 'private') return resolveParticipantNames(data)[0] || '未命名人物';
    return asText(data.group?.name) || '未命名群聊';
}

function conversationTitle(data) {
    const conversationId = data.conversation.conversationId;
    return data.conversation.kind === 'private'
        ? `${COMMENT_PREFIX}私聊｜${resolveEntryName(data)}｜${conversationId}`
        : `${COMMENT_PREFIX}群聊｜${resolveEntryName(data)}｜${conversationId}`;
}

function senderName(message, people, userName) {
    if (message.senderType === 'system' || message.senderId === '__system__') return '系统';
    if (message.senderId === SELF_ID || message.senderType === 'self') return userName || '用户';
    return asText(message.senderName) || asText(people.get(message.senderId)) || '未知成员';
}

function buildProjectionContent(data, userName, storyTime) {
    const people = new Map((data.people || []).map((person) => [person.personId, person.formalName]));
    const participants = resolveParticipantNames(data);
    const header = data.conversation.kind === 'private'
        ? [`【QQ 私聊：${resolveEntryName(data)}】`, `参与者：${[userName || '用户', ...participants].filter(Boolean).join('、')}`]
        : [`【QQ群聊：${resolveEntryName(data)}】`, `当前成员：${participants.join('、') || '无'}`];
    const messages = selectProjectionMessages(data, storyTime);
    if (!messages.length) return { content: '', hasMessages: false };
    let lastDate = '';
    const lines = ['<yuzi>', ...header, ''];
    for (const message of messages) {
        const date = dateLabel(message.storyTime);
        if (date !== lastDate) {
            lines.push(`[${date}]`);
            lastDate = date;
        }
        const deletedQuote = data.conversation?.kind === 'group'
            && message.quoteMessageId
             && !(data.messages || []).some((candidate) => candidate.messageId === message.quoteMessageId);
        const suffix = deletedQuote ? '（引用原消息已删除）' : '';
        const time = timeLabel(message.storyTime);
        lines.push(`${time ? `[${time}] ` : ''}${senderName(message, people, userName)}：${formatQQV2MessageSemantic(message, {
            selfName: userName,
            resolvePersonName: (personId) => people.get(personId),
        })}${suffix}`);
    }
    lines.push('</yuzi>');
    return { content: lines.join('\n'), hasMessages: true };
}

function effectiveInjection(data) {
    const global = data.settings;
    const local = data.conversation.injection;
    const hasExplicitOverrides = Object.hasOwn(local, 'useConversationLight') || Object.hasOwn(local, 'useConversationDepth');
    const useConversationLight = local.useConversationLight === true || (!hasExplicitOverrides && local.followGlobal === false);
    const useConversationDepth = local.useConversationDepth === true || (!hasExplicitOverrides && local.followGlobal === false);
    const light = useConversationLight ? local.light : global.light;
    const depth = useConversationDepth ? local.depth : global.depth;
    const personKeywords = light === 'green' ? resolveParticipantNames(data) : [];
    return {
        light,
        depth,
        keywords: light === 'green'
            ? dedupeKeywords([...personKeywords, ...(global.keywords || []), ...(local.keywords || [])])
            : [],
    };
}

function writeEntry(book, data, content, scopeId) {
    const entries = ensureEntries(book);
    const conversationId = data.conversation.conversationId;
    const matches = currentProjectionEntries(book, conversationId);
    if (matches.length > 1) {
        throw duplicateProjectionError(conversationId);
    }
    const preferredUid = data.conversation.injection.projection.entryUid;
    const preferred = preferredUid !== null && preferredUid !== undefined
        ? matches.find(([key, entry]) => key === String(preferredUid) || entry?.uid === preferredUid)
        : null;
    const first = preferred || matches[0];
    for (const [key] of matches) {
        if (key !== first?.[0]) delete entries[key];
    }
    const existing = first?.[1] || null;
    const preferredEntry = preferredUid !== null ? entries[String(preferredUid)] : null;
    const uid = existing?.uid
        ?? (preferredUid !== null && !preferredEntry ? preferredUid : nextUid(entries));
    const key = String(uid);
    const injection = effectiveInjection(data);
    const entry = {
        ...(existing ? clone(existing) : {}),
        uid,
        key: injection.keywords,
        keysecondary: [],
        comment: conversationTitle(data),
        content,
        constant: injection.light === 'blue',
        selective: false,
        addMemo: true,
        disable: false,
        ...qqV2WorldbookPlacement(injection.depth),
        extensions: {
            ...(existing?.extensions || {}),
            [MARKER_KEY]: markerFor(scopeId, data.conversation.conversationId),
        },
    };
    entries[key] = entry;
    if (existing && String(existing.uid) !== key) delete entries[String(existing.uid)];
    return entry;
}

function targetError(message) {
    const error = new Error(message);
    error.code = 'worldbook_target_invalid';
    return error;
}

function disabledError() {
    const error = new Error('请先开启 QQ 世界书总闸和当前会话注入');
    error.code = 'worldbook_injection_disabled';
    return error;
}

function duplicateProjectionError(conversationId) {
    const error = new Error(`QQ 世界书会话 ${conversationId} 存在重复新版投影，请手工删除到只剩一条后重试`);
    error.code = 'worldbook_projection_conflict';
    return error;
}

function pendingResult(error) {
    if (error?.code === 'worldbook_projection_conflict') {
        return {
            status: 'pending',
            reason: 'projection-conflict',
            code: error.code,
            message: error.message,
        };
    }
    return { status: 'pending' };
}

function inactiveScopeError() {
    const error = new Error('QQ 作用域已切换，当前世界书操作已取消');
    error.code = 'worldbook_scope_inactive';
    return error;
}

function isInactiveScopeError(error) {
    return error?.code === 'scope_inactive' || error?.code === 'worldbook_scope_inactive';
}

/** QQ 消息到世界书条目的唯一投影模块。只处理调用方传入的作用域和明确记录过的目标书。 */
export function createQQV2WorldbookProjectionService(options = {}) {
    const repository = options.repository;
    const worldbookGateway = options.worldbookGateway;
    if (!repository || typeof repository.getWorldbookProjectionData !== 'function') {
        throw new TypeError('QQ v2 worldbook projection service 需要 repository');
    }
    if (typeof repository.clearAllSelectedMessagesForInjection !== 'function'
        || typeof repository.clearSelectedMessagesForInjection !== 'function'
        || typeof repository.setMessagesSelectedForInjection !== 'function') {
        throw new TypeError('QQ v2 worldbook projection service 需要批量手选消息仓储接口');
    }
    if (!worldbookGateway || typeof worldbookGateway.loadBook !== 'function' || typeof worldbookGateway.saveBook !== 'function') {
        throw new TypeError('QQ v2 worldbook projection service 需要 worldbookGateway');
    }

    const worldbookSettings = options.worldbookSettings || {
        get: typeof repository.getWorldbookSettings === 'function'
            ? (scopeId) => repository.getWorldbookSettings(scopeId)
            : null,
        update: typeof repository.updateWorldbookSettings === 'function'
            ? (scopeId, patch, operationOptions) => repository.updateWorldbookSettings(scopeId, patch, operationOptions)
            : null,
    };
    if (options.worldbookSettings
        && (typeof worldbookSettings.get !== 'function' || typeof worldbookSettings.update !== 'function')) {
        throw new TypeError('QQ v2 worldbook projection service 需要有效的 worldbookSettings');
    }

    const assertScopeSessionCurrent = (scopeSession, allowInactiveScope = false) => {
        if (allowInactiveScope || !scopeSession) return;
        try {
            if (scopeSession.isCurrent?.() === true && scopeSession.signal?.aborted !== true) return;
        } catch {
            // The stable public error below hides coordinator implementation details.
        }
        throw inactiveScopeError();
    };

    const runScoped = async (operation, scopeSession, allowInactiveScope = false) => {
        assertScopeSessionCurrent(scopeSession, allowInactiveScope);
        const result = await operation();
        assertScopeSessionCurrent(scopeSession, allowInactiveScope);
        return result;
    };

    const getProjectionData = async (scopeId, conversationId, scopeSession = null, allowInactiveScope = false) => {
        const data = await runScoped(
            () => repository.getWorldbookProjectionData(scopeId, conversationId),
            scopeSession,
            allowInactiveScope,
        );
        if (typeof worldbookSettings.get !== 'function') return data;
        const settings = await runScoped(
            () => worldbookSettings.get(scopeId, { scopeSession, allowInactiveScope }),
            scopeSession,
            allowInactiveScope,
        );
        return { ...data, settings: clone(settings) };
    };

    const loadBook = async (name, scopeId, allowInactiveScope = false, scopeSession = null) => {
        const bookName = asText(name, 256);
        if (!bookName) throw targetError('请先选择 QQ 目标世界书');
        const book = await runScoped(
            () => worldbookGateway.loadBook(bookName, scopeId, { allowInactiveScope, scopeSession }),
            scopeSession,
            allowInactiveScope,
        );
        if (!book) throw targetError(`QQ 世界书 ${bookName} 不存在`);
        return clone(book);
    };

    const loadOptionalBook = async (name, scopeId, allowInactiveScope = false, scopeSession = null) => {
        const bookName = asText(name, 256);
        if (!bookName) return null;
        const book = await runScoped(
            () => worldbookGateway.loadBook(bookName, scopeId, { allowInactiveScope, scopeSession }),
            scopeSession,
            allowInactiveScope,
        );
        return book ? clone(book) : null;
    };

    const saveBook = (name, book, scopeId, allowInactiveScope = false, scopeSession = null) => runScoped(
        () => worldbookGateway.saveBook(name, book, scopeId, { allowInactiveScope, scopeSession }),
        scopeSession,
        allowInactiveScope,
    );

    const scopeConversations = async (scopeId, scopeSession = null, allowInactiveScope = false) => {
        const conversations = await runScoped(
            () => repository.listConversations(scopeId),
            scopeSession,
            allowInactiveScope,
        );
        return conversations.filter((conversation) => (
            conversation.kind === 'private' || conversation.kind === 'group'
        ));
    };

    const setPending = async (
        scopeId,
        conversationId,
        names = [],
        scopeSession = null,
        allowInactiveScope = false,
    ) => runScoped(
        () => repository.setConversationProjection(
            scopeId,
            conversationId,
            { managedBookNames: uniqueNames(names), pending: true },
            { scopeSession, allowInactiveScope },
        ),
        scopeSession,
        allowInactiveScope,
    );

    const restoreBook = async ({
        name,
        entries,
        scopeId,
        conversationId = '',
        conversationIds = null,
        allowInactiveScope = false,
        scopeSession = null,
    }) => {
        const current = await loadBook(name, scopeId, allowInactiveScope, scopeSession);
        if (conversationIds) restoreConversationEntries(current, scopeId, conversationIds, entries);
        else restoreOwnedEntries(current, scopeId, entries, conversationId);
        await saveBook(name, current, scopeId, allowInactiveScope, scopeSession);
    };

    const removeProjection = async (scopeId, conversationId, data, {
        clearSelected = false,
        allowInactiveScope = false,
        scopeSession = null,
    } = {}) => {
        if (clearSelected) {
            await runScoped(
                () => repository.clearSelectedMessagesForInjection(scopeId, conversationId, { scopeSession, allowInactiveScope }),
                scopeSession,
                allowInactiveScope,
            );
        }
        const names = trackedBookNames(data);
        const snapshots = [];
        try {
            const loadedBooks = [];
            for (const name of names) {
                const book = await loadOptionalBook(name, scopeId, allowInactiveScope, scopeSession);
                if (!book) continue;
                const matches = ownedEntries(book, scopeId, conversationId);
                if (matches.length > 1) throw duplicateProjectionError(conversationId);
                loadedBooks.push({ name, book, matches });
            }
            for (const { name, book, matches } of loadedBooks) {
                const entries = matches.map(([key, entry]) => [key, clone(entry)]);
                if (removeOwnedEntries(book, scopeId, conversationId)) {
                    snapshots.push({ name, entries });
                    await saveBook(name, book, scopeId, allowInactiveScope, scopeSession);
                }
            }
            const previousProjection = clone(data.conversation.injection.projection);
            await runScoped(
                () => repository.setConversationProjection(scopeId, conversationId, {
                    bookName: '', entryUid: null, managedBookNames: [], pending: false,
                }, { scopeSession, allowInactiveScope }),
                scopeSession,
                allowInactiveScope,
            );
            return {
                status: 'removed',
                rollback: async () => {
                    try {
                        for (const snapshot of snapshots) {
                            await restoreBook({ ...snapshot, scopeId, conversationId, allowInactiveScope, scopeSession });
                        }
                        await runScoped(
                            () => repository.setConversationProjection(
                                scopeId,
                                conversationId,
                                previousProjection,
                                { scopeSession, allowInactiveScope },
                            ),
                            scopeSession,
                            allowInactiveScope,
                        );
                        return { status: 'restored' };
                    } catch (error) {
                        if (isInactiveScopeError(error)) return { status: 'pending', reason: 'scope-inactive' };
                        try {
                            await setPending(scopeId, conversationId, names, scopeSession, allowInactiveScope);
                        } catch (pendingError) {
                            if (isInactiveScopeError(pendingError)) return { status: 'pending', reason: 'scope-inactive' };
                        }
                        return pendingResult(error);
                    }
                },
            };
        } catch (error) {
            if (isInactiveScopeError(error)) throw error;
            try {
                await setPending(scopeId, conversationId, names, scopeSession, allowInactiveScope);
            } catch (pendingError) {
                if (isInactiveScopeError(pendingError)) throw pendingError;
            }
            return pendingResult(error);
        }
    };

    const syncConversation = async ({ scopeId, scopeSession = null, conversationId, userName = '', storyTime = '' } = {}) => {
        const data = await getProjectionData(scopeId, conversationId, scopeSession);
        if (!data.settings.enabled || !data.conversation.injection.enabled) {
            return removeProjection(scopeId, conversationId, data, { scopeSession });
        }
        const targetName = asText(data.settings.bookName, 256);
        const names = trackedBookNames(data);
        try {
            const target = await loadBook(targetName, scopeId, false, scopeSession);
            const staleBooks = [];
            for (const name of names.filter((item) => item !== targetName)) {
                const book = await loadOptionalBook(name, scopeId, false, scopeSession);
                if (book) staleBooks.push({ name, book });
            }
            assertNoDuplicateProjectionEntries(ownedEntries(target, scopeId, conversationId));
            for (const { book } of staleBooks) {
                assertNoDuplicateProjectionEntries(ownedEntries(book, scopeId, conversationId));
            }
            const projection = buildProjectionContent(data, asText(userName, 256), storyTime);
            let entry = null;
            if (projection.hasMessages) entry = writeEntry(target, data, projection.content, scopeId);
            else removeOwnedEntries(target, scopeId, conversationId);
            await saveBook(targetName, target, scopeId, false, scopeSession);

            for (const { name, book } of staleBooks) {
                if (removeOwnedEntries(book, scopeId, conversationId)) {
                    await saveBook(name, book, scopeId, false, scopeSession);
                }
            }
            await runScoped(
                () => repository.setConversationProjection(scopeId, conversationId, {
                    bookName: entry ? targetName : '',
                    entryUid: entry?.uid ?? null,
                    managedBookNames: entry ? [targetName] : [],
                    pending: false,
                }, { scopeSession }),
                scopeSession,
            );
            return entry ? { status: 'synced', entryUid: entry.uid } : { status: 'empty' };
        } catch (error) {
            if (error?.code === 'worldbook_target_invalid') throw error;
            if (isInactiveScopeError(error)) throw error;
            try {
                await setPending(scopeId, conversationId, uniqueNames([...names, targetName]), scopeSession);
            } catch (pendingError) {
                if (isInactiveScopeError(pendingError)) throw pendingError;
            }
            return pendingResult(error);
        }
    };

    const reconcileScope = async ({ scopeId, scopeSession = null, userName = '', storyTime = '' } = {}) => {
        const conversations = await scopeConversations(scopeId, scopeSession);
        const results = [];
        for (const conversation of conversations) {
            assertScopeSessionCurrent(scopeSession);
            results.push(await syncConversation({ scopeId, scopeSession, conversationId: conversation.conversationId, userName, storyTime }));
        }
        return results;
    };

    const removeScopeProjections = async ({ scopeId, allowInactiveScope = true, scopeSession = null } = {}) => {
        const conversations = await scopeConversations(scopeId, scopeSession, allowInactiveScope);
        const conversationIds = new Set(conversations.map((conversation) => conversation.conversationId));
        const dataList = [];
        for (const conversation of conversations) {
            dataList.push(await getProjectionData(scopeId, conversation.conversationId, scopeSession, allowInactiveScope));
        }
        const settings = await runScoped(
            () => worldbookSettings.get(scopeId, { scopeSession, allowInactiveScope }),
            scopeSession,
            allowInactiveScope,
        );
        const names = uniqueNames([settings.bookName, ...dataList.flatMap(trackedBookNames)]);
        const snapshots = [];
        try {
            const loadedBooks = [];
            for (const name of names) {
                const book = await loadOptionalBook(name, scopeId, allowInactiveScope, scopeSession);
                if (!book) continue;
                const entries = ownedEntriesForConversations(book, scopeId, conversationIds)
                    .map(([key, entry]) => [key, clone(entry)]);
                assertNoDuplicateProjectionEntries(entries);
                loadedBooks.push({ name, book, entries });
            }
            for (const { name, book, entries } of loadedBooks) {
                if (removeEntriesForConversations(book, scopeId, conversationIds)) {
                    snapshots.push({ name, entries });
                    await saveBook(name, book, scopeId, allowInactiveScope, scopeSession);
                }
            }
            const previous = new Map(dataList.map((data) => [
                data.conversation.conversationId,
                clone(data.conversation.injection.projection),
            ]));
            for (const conversation of conversations) {
                await runScoped(
                    () => repository.setConversationProjection(scopeId, conversation.conversationId, {
                        bookName: '', entryUid: null, managedBookNames: [], pending: false,
                    }, { scopeSession, allowInactiveScope }),
                    scopeSession,
                    allowInactiveScope,
                );
            }
            return {
                status: 'removed',
                rollback: async () => {
                    try {
                        for (const snapshot of snapshots) {
                            await restoreBook({ ...snapshot, scopeId, conversationIds, allowInactiveScope, scopeSession });
                        }
                        for (const [conversationId, projection] of previous) {
                            await runScoped(
                                () => repository.setConversationProjection(
                                    scopeId,
                                    conversationId,
                                    projection,
                                    { scopeSession, allowInactiveScope },
                                ),
                                scopeSession,
                                allowInactiveScope,
                            );
                        }
                        return { status: 'restored' };
                    } catch (error) {
                        if (isInactiveScopeError(error)) return { status: 'pending', reason: 'scope-inactive' };
                        for (const conversation of conversations) {
                            try {
                                await setPending(
                                    scopeId,
                                    conversation.conversationId,
                                    names,
                                    scopeSession,
                                    allowInactiveScope,
                                );
                            } catch (pendingError) {
                                if (isInactiveScopeError(pendingError)) return { status: 'pending', reason: 'scope-inactive' };
                            }
                        }
                        return pendingResult(error);
                    }
                },
            };
        } catch (error) {
            if (isInactiveScopeError(error)) throw error;
            for (const conversation of conversations) {
                try {
                    await setPending(scopeId, conversation.conversationId, names, scopeSession, allowInactiveScope);
                } catch (pendingError) {
                    if (isInactiveScopeError(pendingError)) throw pendingError;
                }
            }
            return pendingResult(error);
        }
    };

    const migrateTarget = async ({ scopeId, scopeSession = null, current, next, userName, storyTime }) => {
        const oldName = asText(current.bookName, 256);
        const newName = asText(next.bookName, 256);
        const conversations = await scopeConversations(scopeId, scopeSession);
        const conversationIds = new Set(conversations.map((conversation) => conversation.conversationId));
        const dataList = [];
        for (const conversation of conversations) {
            dataList.push(await getProjectionData(scopeId, conversation.conversationId, scopeSession));
        }
        const oldBook = await loadBook(oldName, scopeId, false, scopeSession);
        const newBook = await loadBook(newName, scopeId, false, scopeSession);
        const oldSnapshot = ownedEntriesForConversations(oldBook, scopeId, conversationIds)
            .map(([key, entry]) => [key, clone(entry)]);
        const newSnapshot = ownedEntriesForConversations(newBook, scopeId, conversationIds)
            .map(([key, entry]) => [key, clone(entry)]);
        try {
            assertNoDuplicateProjectionEntries(oldSnapshot);
            assertNoDuplicateProjectionEntries(newSnapshot);
        } catch (error) {
            for (const conversation of conversations) {
                await setPending(
                    scopeId,
                    conversation.conversationId,
                    [oldName, newName],
                    scopeSession,
                );
            }
            return pendingResult(error);
        }
        const previousProjections = new Map(dataList.map((data) => [
            data.conversation.conversationId,
            clone(data.conversation.injection.projection),
        ]));
        const states = new Map();
        removeEntriesForConversations(newBook, scopeId, conversationIds);
        for (const data of dataList) {
            data.settings = clone(next);
            if (!data.conversation.injection.enabled) {
                states.set(data.conversation.conversationId, { bookName: '', entryUid: null });
                continue;
            }
            const projection = buildProjectionContent(data, asText(userName, 256), storyTime);
            const entry = projection.hasMessages ? writeEntry(newBook, data, projection.content, scopeId) : null;
            states.set(data.conversation.conversationId, {
                bookName: entry ? newName : '',
                entryUid: entry?.uid ?? null,
            });
        }

        let newWriteStarted = false;
        let oldWriteStarted = false;
        let settingsWriteStarted = false;
        try {
            newWriteStarted = true;
            await saveBook(newName, newBook, scopeId, false, scopeSession);
            if (removeEntriesForConversations(oldBook, scopeId, conversationIds)) {
                oldWriteStarted = true;
                await saveBook(oldName, oldBook, scopeId, false, scopeSession);
            }
            settingsWriteStarted = true;
            await runScoped(
                () => worldbookSettings.update(scopeId, next, { scopeSession }),
                scopeSession,
            );
            for (const conversation of conversations) {
                const state = states.get(conversation.conversationId) || { bookName: '', entryUid: null };
                await runScoped(
                    () => repository.setConversationProjection(scopeId, conversation.conversationId, {
                        ...state,
                        managedBookNames: state.bookName ? [newName] : [],
                        pending: false,
                    }, { scopeSession }),
                    scopeSession,
                );
            }
            return { status: 'migrated' };
        } catch (error) {
            if (isInactiveScopeError(error)) throw error;
            let rollbackPending = false;
            const rollbackStep = async (operation) => {
                try {
                    await operation();
                } catch (rollbackError) {
                    if (isInactiveScopeError(rollbackError)) throw rollbackError;
                    rollbackPending = true;
                }
            };
            if (oldWriteStarted) {
                await rollbackStep(() => restoreBook({
                    name: oldName, entries: oldSnapshot, scopeId, conversationIds, scopeSession,
                }));
            }
            if (newWriteStarted) {
                await rollbackStep(() => restoreBook({
                    name: newName, entries: newSnapshot, scopeId, conversationIds, scopeSession,
                }));
            }
            if (settingsWriteStarted) {
                await rollbackStep(() => runScoped(
                    () => worldbookSettings.update(scopeId, current, { scopeSession }),
                    scopeSession,
                ));
            }
            for (const [conversationId, projection] of previousProjections) {
                await rollbackStep(() => runScoped(
                    () => repository.setConversationProjection(
                        scopeId,
                        conversationId,
                        projection,
                        { scopeSession },
                    ),
                    scopeSession,
                ));
            }
            if (rollbackPending) {
                for (const conversation of conversations) {
                    try {
                        await setPending(
                            scopeId,
                            conversation.conversationId,
                            [oldName, newName],
                            scopeSession,
                        );
                    } catch (pendingError) {
                        if (isInactiveScopeError(pendingError)) throw pendingError;
                    }
                }
            }
            error.rollbackPending = rollbackPending;
            throw error;
        }
    };

    const setMessagesSelected = async ({
        scopeId,
        scopeSession = null,
        conversationId,
        messageIds = [],
        selected,
        userName = '',
        storyTime = '',
    } = {}) => {
        const global = await runScoped(() => worldbookSettings.get(scopeId, { scopeSession }), scopeSession);
        const conversation = await runScoped(
            () => repository.getConversation(scopeId, conversationId),
            scopeSession,
        );
        if (!global.enabled || !conversation?.injection?.enabled) throw disabledError();
        const ids = [...new Set(messageIds.map((id) => asText(id, 256)).filter(Boolean))];
        await runScoped(
            () => repository.setMessagesSelectedForInjection(
                scopeId,
                conversationId,
                ids,
                selected,
                { scopeSession },
            ),
            scopeSession,
        );
        return syncConversation({ scopeId, scopeSession, conversationId, userName, storyTime });
    };

    return Object.freeze({
        async setGlobalSettings({ scopeId, scopeSession = null, settings = {}, userName = '', storyTime = '' } = {}) {
            const current = await runScoped(() => worldbookSettings.get(scopeId, { scopeSession }), scopeSession);
            const next = { ...current, ...settings };
            if (settings.timeWindow) next.timeWindow = settings.timeWindow;
            if (next.enabled) await loadBook(next.bookName, scopeId, false, scopeSession);
            const changingTarget = current.enabled
                && next.enabled
                && current.bookName
                && next.bookName
                && current.bookName !== next.bookName;
            if (changingTarget) return migrateTarget({ scopeId, scopeSession, current, next, userName, storyTime });

            const saved = await runScoped(
                () => worldbookSettings.update(scopeId, settings, { scopeSession }),
                scopeSession,
            );
            if (!saved.enabled) {
                await runScoped(
                    () => repository.clearAllSelectedMessagesForInjection({ scopeSession }),
                    scopeSession,
                );
                const result = await removeScopeProjections({ scopeId, allowInactiveScope: false, scopeSession });
                return { ...result, status: result.status === 'removed' ? 'disabled' : result.status };
            }
            const results = await reconcileScope({ scopeId, scopeSession, userName, storyTime });
            return { status: results.some((result) => result.status === 'pending') ? 'pending' : 'saved', results };
        },
        async setConversationInjection({ scopeId, scopeSession = null, conversationId, injection = {}, userName = '', storyTime = '' } = {}) {
            const global = await runScoped(() => worldbookSettings.get(scopeId, { scopeSession }), scopeSession);
            const current = await runScoped(
                () => repository.getConversation(scopeId, conversationId),
                scopeSession,
            );
            const nextEnabled = Object.hasOwn(injection, 'enabled') ? injection.enabled === true : current?.injection?.enabled === true;
            if (global.enabled && nextEnabled) await loadBook(global.bookName, scopeId, false, scopeSession);
            await runScoped(
                () => repository.updateConversationInjection(
                    scopeId,
                    conversationId,
                    injection,
                    { scopeSession },
                ),
                scopeSession,
            );
            if (!nextEnabled) {
                await runScoped(
                    () => repository.clearSelectedMessagesForInjection(
                        scopeId,
                        conversationId,
                        { scopeSession },
                    ),
                    scopeSession,
                );
            }
            return syncConversation({ scopeId, scopeSession, conversationId, userName, storyTime });
        },
        async setMessageSelected({ scopeId, scopeSession = null, conversationId, messageId, selected, userName = '', storyTime = '' } = {}) {
            return setMessagesSelected({
                scopeId, scopeSession, conversationId, messageIds: [messageId], selected, userName, storyTime,
            });
        },
        setMessagesSelected,
        syncConversation,
        reconcileScope,
        removeScopeProjections,
        async removeConversationProjection({ scopeId, scopeSession = null, conversationId } = {}) {
            const data = await getProjectionData(scopeId, conversationId, scopeSession);
            return removeProjection(scopeId, conversationId, data, { scopeSession });
        },
        async retryPending({ scopeId, scopeSession = null, userName = '', storyTime = '' } = {}) {
            const conversations = await scopeConversations(scopeId, scopeSession);
            const results = [];
            for (const conversation of conversations) {
                assertScopeSessionCurrent(scopeSession);
                if (!conversation.injection?.projection?.pending) continue;
                results.push(await syncConversation({ scopeId, scopeSession, conversationId: conversation.conversationId, userName, storyTime }));
            }
            return results;
        },
    });
}

export const QQ_V2_WORLDBOOK_MARKER_KEY = MARKER_KEY;
