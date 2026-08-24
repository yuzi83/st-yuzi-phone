import { pickImageFiles } from '../../settings-app/services/media-upload.js';
import { createPhoneNavIconElement } from '../../phone-core/navigation-ui.js';
import { isScrollContainerNearBottom } from '../../phone-core/stable-scroll-anchor.js';
import { createPhoneViewScrollState } from '../../phone-core/view-scroll-state.js';
import { getPhoneSettings } from '../../settings.js';
import { createEmojiPanelTemporaryLayerController } from './emoji-panel.js';
import { createStickerUploadDialog } from './sticker-upload-dialog.js';
import {
    bindConversationSwipeGesture,
    resolveConversationSwipe,
} from './conversation-swipe.js';
import {
    createComposerAutoHeightController,
    normalizeComposerSubmission,
    shouldSubmitComposerKey,
} from './composer.js';
import {
    copyMessageText,
    createMessageMenuController,
} from './message-menu.js';
import {
    createMessageSelection,
    deleteSelectedMessages,
    selectedMessagesInjectionAction,
    shouldShowUnansweredIndicator,
    updateSelectedMessagesInjection,
} from './message-selection.js';
import {
    handleIncomingTransfer,
    submitNarrativeMessage,
    submitTransferMessage,
    transferStatusLabel,
    voiceDurationSeconds,
} from './narrative-tools.js';
import { createRenderLeaseCoordinator } from './render-lease-coordinator.js';
import { createViewSnapshotCache } from './view-snapshot-cache.js';
import {
    QQ_FIGMA_ROOT_ICON_MAP,
    QQ_FIGMA_TOOL_ICON_MAP,
    createQQFigmaIconElement,
} from './figma-icons.js';
import {
    downloadImageLibraryPack,
    pickImageLibraryPackFile,
} from './image-library-pack-actions.js';

const TABS = Object.freeze([
    ['messages', '消息'],
    ['contacts', '联系人'],
    ['assistant', '助手'],
    ['settings', '设置'],
]);

const TAB_META = Object.freeze({
    messages: Object.freeze({ icon: QQ_FIGMA_ROOT_ICON_MAP.messages }),
    contacts: Object.freeze({ icon: QQ_FIGMA_ROOT_ICON_MAP.contacts }),
    assistant: Object.freeze({ icon: QQ_FIGMA_ROOT_ICON_MAP.assistant }),
    settings: Object.freeze({ icon: QQ_FIGMA_ROOT_ICON_MAP.settings }),
});

const TOOL_META = Object.freeze({
    voice: { label: '语音', icon: 'microphone', figmaIcon: QQ_FIGMA_TOOL_ICON_MAP.voice },
    image: { label: '图片', icon: 'image', figmaIcon: QQ_FIGMA_TOOL_ICON_MAP.image },
    video: { label: '视频', icon: 'camera', figmaIcon: QQ_FIGMA_TOOL_ICON_MAP.video },
    transfer: { label: '转账', icon: 'wallet', figmaIcon: QQ_FIGMA_TOOL_ICON_MAP.transfer },
    emoji: { label: '表情', icon: 'face-smile', figmaIcon: QQ_FIGMA_TOOL_ICON_MAP.emoji },
    plus: { label: '更多', icon: 'circle-plus', figmaIcon: QQ_FIGMA_TOOL_ICON_MAP.plus },
});

const EMPTY_PAGE = Object.freeze({ items: [], hasMore: false, nextBeforeSequence: null });

const QQ_SETTINGS_GROUPS = Object.freeze([
    Object.freeze({ kind: 'reply', title: 'AI \u56de\u590d\u4e0e\u4e3b\u52a8\u6d88\u606f' }),
    Object.freeze({ kind: 'context', title: '\u4e0a\u4e0b\u6587' }),
    Object.freeze({ kind: 'worldbook', title: '\u4e16\u754c\u4e66\u6ce8\u5165' }),
    Object.freeze({ kind: 'image-library', title: '\u56fe\u7247\u8d44\u6599' }),
]);
const QQ_WORLDBOOK_TIME_UNITS = new Set(['hour', 'day', 'month', 'year']);

function asText(value) {
    return String(value ?? '').trim();
}

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asInteger(value, fallback = 0) {
    const number = Number(value);
    return Number.isInteger(number) ? number : fallback;
}

function settingKeywords(value) {
    const seen = new Set();
    return asText(value).split('\u3001').map(asText).filter((keyword) => {
        const key = keyword.toLocaleLowerCase('zh-CN');
        if (!keyword || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function cloneQQSettingsForUi(settings) {
    const source = asObject(settings);
    const proactive = asObject(source.proactive);
    const worldbook = asObject(source.worldbook);
    const timeWindow = asObject(worldbook.timeWindow);
    return Object.freeze({
        activeApiPresetId: asText(source.activeApiPresetId),
        privateReplyPresetId: asText(source.privateReplyPresetId),
        privateProactivePresetId: asText(source.privateProactivePresetId),
        hostContextTurns: asInteger(source.hostContextTurns),
        conversationHistoryLimit: asInteger(source.conversationHistoryLimit),
        proactive: Object.freeze({
            enabled: proactive.enabled === true,
            everyTurns: asInteger(proactive.everyTurns, 5),
        }),
        worldbook: Object.freeze({
            enabled: worldbook.enabled === true,
            bookName: asText(worldbook.bookName),
            timeWindow: Object.freeze(timeWindow.mode === 'all'
                ? { mode: 'all' }
                : {
                    mode: 'relative',
                    value: asInteger(timeWindow.value, 1),
                    unit: QQ_WORLDBOOK_TIME_UNITS.has(timeWindow.unit) ? timeWindow.unit : 'month',
                }),
            light: worldbook.light === 'green' ? 'green' : 'blue',
            depth: asInteger(worldbook.depth, 999),
            keywords: Object.freeze(asArray(worldbook.keywords).map(asText).filter(Boolean)),
        }),
    });
}

function qqSettingsGroup(kind) {
    return QQ_SETTINGS_GROUPS.find((group) => group.kind === kind) || null;
}

function qqSettingsPatch(kind, values = {}, field = '') {
    const source = asObject(values);
    if (kind === 'reply') {
        if (field === 'activeApiPresetId') return { activeApiPresetId: asText(source.activeApiPresetId) };
        if (field === 'privateReplyPresetId') return { privateReplyPresetId: asText(source.privateReplyPresetId) };
        if (field === 'privateProactivePresetId') return { privateProactivePresetId: asText(source.privateProactivePresetId) };
        if (field === 'enabled') return { proactive: { enabled: source.enabled === true } };
        if (field === 'everyTurns') return { proactive: { everyTurns: asInteger(source.everyTurns, 0) } };
        if (field) return null;
        return {
            activeApiPresetId: asText(source.activeApiPresetId),
            privateReplyPresetId: asText(source.privateReplyPresetId),
            privateProactivePresetId: asText(source.privateProactivePresetId),
            proactive: {
                enabled: source.enabled === true,
                everyTurns: asInteger(source.everyTurns, 0),
            },
        };
    }
    if (kind === 'context') {
        if (field === 'hostContextTurns') return { hostContextTurns: asInteger(source.hostContextTurns) };
        if (field === 'conversationHistoryLimit') {
            return { conversationHistoryLimit: asInteger(source.conversationHistoryLimit) };
        }
        if (field) return null;
        return {
            hostContextTurns: asInteger(source.hostContextTurns),
            conversationHistoryLimit: asInteger(source.conversationHistoryLimit),
        };
    }
    if (kind === 'proactive') {
        return {
            privateProactivePresetId: asText(source.privateProactivePresetId),
            proactive: {
                enabled: source.enabled === true,
                everyTurns: asInteger(source.everyTurns, 0),
            },
        };
    }
    if (kind === 'worldbook') {
        const mode = source.timeWindowMode === 'all' ? 'all' : 'relative';
        const timeWindow = mode === 'all'
            ? { mode }
            : {
                mode,
                value: asInteger(source.timeWindowValue, 0),
                unit: QQ_WORLDBOOK_TIME_UNITS.has(source.timeWindowUnit) ? source.timeWindowUnit : 'month',
            };
        if (field === 'enabled') return { worldbook: { enabled: source.enabled === true } };
        if (field === 'bookName') return { worldbook: { bookName: asText(source.bookName) } };
        if (['timeWindowMode', 'timeWindowValue', 'timeWindowUnit'].includes(field)) {
            return { worldbook: { timeWindow } };
        }
        if (field === 'light') return { worldbook: { light: source.light === 'green' ? 'green' : 'blue' } };
        if (field === 'depth') return { worldbook: { depth: asInteger(source.depth, -1) } };
        if (field === 'keywords') return { worldbook: { keywords: settingKeywords(source.keywords) } };
        if (field) return null;
        return {
            worldbook: {
                enabled: source.enabled === true,
                bookName: asText(source.bookName),
                timeWindow,
                light: source.light === 'green' ? 'green' : 'blue',
                depth: asInteger(source.depth, -1),
                keywords: settingKeywords(source.keywords),
            },
        };
    }
    return null;
}

function createSettingsSaveQueue() {
    let saveQueue = Promise.resolve();
    return (operation) => {
        const nextOperation = saveQueue.then(operation, operation);
        saveQueue = nextOperation.catch(() => {});
        return nextOperation;
    };
}

async function loadQQSettingsModel(facade) {
    const result = await facade?.query?.bootstrap?.();
    if (!result?.ok) return result || Object.freeze({ ok: false, status: 'unavailable' });
    const scopeId = asText(result.context?.scopeId);
    if (!scopeId) return Object.freeze({ ok: false, status: 'unavailable', reason: 'scope-required' });
    return Object.freeze({
        ok: true,
        status: asText(result.status) || 'ready',
        scopeId,
        groups: QQ_SETTINGS_GROUPS,
        settings: cloneQQSettingsForUi(result.globalSettings),
    });
}

async function saveQQSettings(facade, { scopeId, kind, field, values } = {}) {
    const expectedScopeId = asText(scopeId);
    const settings = qqSettingsPatch(kind, values, asText(field));
    if (!expectedScopeId || !settings) return Object.freeze({ ok: false, status: 'invalid', reason: 'settings-invalid' });
    const current = await facade?.query?.currentContext?.();
    if (!current?.ok || asText(current.context?.scopeId) !== expectedScopeId) {
        return Object.freeze({ ok: false, status: 'stale', reason: 'scope-changed' });
    }
    return facade.intent.updateGlobalSettings({ scopeId: expectedScopeId, settings });
}

function initial(value) {
    return Array.from(asText(value))[0] || '?';
}

function createElement(tagName, className = '') {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    return element;
}

function createButton(label, className = '', attributes = {}) {
    const button = createElement('button', className);
    button.type = 'button';
    button.textContent = label;
    Object.entries(attributes).forEach(([name, value]) => button.setAttribute(name, value));
    return button;
}

function normalizeName(value) {
    return asText(value).normalize('NFKC').replace(/\s+/g, ' ');
}

function graphemeSegments(value) {
    const text = String(value ?? '');
    if (typeof Intl?.Segmenter === 'function') {
        return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)]
            .map((item) => item.segment);
    }
    return Array.from(text);
}

function countGraphemes(value) {
    return graphemeSegments(value).length;
}

function normalizeContactName(value) {
    const normalized = String(value ?? '')
        .normalize('NFKC')
        .replace(/\s+/gu, ' ')
        .trim();
    return graphemeSegments(normalized).slice(0, 32).join('');
}

function messagePreview(message) {
    if (!message) return '';
    const labels = {
        voice: '[语音]',
        image: '[图片]',
        video: '[视频]',
        transfer: '[转账]',
        sticker: '[表情]',
    };
    return labels[message.type] || asText(message.content);
}

function messageContent(message) {
    if (message.type === 'transfer') {
        const transfer = message.transfer || {};
        return `${asText(transfer.amount)} ${asText(transfer.currency)}`.trim();
    }
    return String(message.content ?? '');
}

function parseStoryTime(value) {
    const text = asText(value);
    if (!text) return null;
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
    if (!match) return null;
    const [, year, month, day, hour, minute] = match;
    const timestamp = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
    return Number.isFinite(timestamp) ? timestamp : null;
}

function formatListTime(value, currentStoryTime) {
    const timestamp = parseStoryTime(value);
    const current = parseStoryTime(currentStoryTime);
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const time = `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
    if (!current) return time;
    const dayDistance = Math.floor((Date.UTC(
        new Date(current).getUTCFullYear(),
        new Date(current).getUTCMonth(),
        new Date(current).getUTCDate(),
    ) - Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())) / (24 * 60 * 60 * 1000));
    if (dayDistance <= 0) return time;
    if (dayDistance === 1) return '昨天';
    if (dayDistance < 7) return `${dayDistance}天前`;
    if (dayDistance < 28) return `${Math.floor(dayDistance / 7)}周前`;
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function formatMessageTime(value, currentStoryTime) {
    const timestamp = parseStoryTime(value);
    const current = parseStoryTime(currentStoryTime);
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const time = `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
    if (!current) return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')} ${time}`;
    const dayDistance = Math.floor((Date.UTC(
        new Date(current).getUTCFullYear(),
        new Date(current).getUTCMonth(),
        new Date(current).getUTCDate(),
    ) - Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())) / (24 * 60 * 60 * 1000));
    if (dayDistance === 0) return `今天 ${time}`;
    if (dayDistance === 1) return `昨天 ${time}`;
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')} ${time}`;
}

function needsTimeDivider(previous, message) {
    if (!previous) return Boolean(asText(message?.storyTime));
    const previousTime = parseStoryTime(previous.storyTime);
    const currentTime = parseStoryTime(message.storyTime);
    if (!previousTime || !currentTime) return false;
    return new Date(previousTime).toDateString() !== new Date(currentTime).toDateString()
        || currentTime - previousTime >= 30 * 60 * 1000;
}

function chatTitle(conversation) {
    return asText(conversation?.remark)
        || asText(conversation?.title)
        || asText(conversation?.person?.formalName)
        || '?';
}

function mergeMessagePage(previous = EMPTY_PAGE, next = EMPTY_PAGE, { prepend = false } = {}) {
    const previousItems = asArray(previous?.items);
    const nextItems = asArray(next?.items);
    const currentItems = prepend ? [...nextItems, ...previousItems] : [...nextItems];
    const unique = new Map(currentItems.map((message) => [message.messageId, message]));
    return Object.freeze({
        items: Object.freeze([...unique.values()].sort((left, right) => Number(left.sequence) - Number(right.sequence))),
        hasMore: next?.hasMore === true,
        nextBeforeSequence: next?.nextBeforeSequence ?? null,
    });
}

function replaceMessageInPage(page = EMPTY_PAGE, replacement = {}) {
    const messageId = asText(replacement?.messageId);
    if (!messageId) return page;
    let replaced = false;
    const items = asArray(page?.items).map((message) => {
        if (asText(message?.messageId) !== messageId) return message;
        replaced = true;
        return replacement;
    });
    if (!replaced) return page;
    return Object.freeze({
        ...page,
        items: Object.freeze(items),
    });
}

const GENERATED_IMAGE_EXTENSIONS = new Set(['bmp', 'gif', 'jfif', 'jpeg', 'jpg', 'png', 'webp']);

function normalizeGeneratedImagePath(value) {
    const imagePath = asText(value);
    if (!imagePath
        || imagePath.length > 2048
        || imagePath.startsWith('/')
        || imagePath.includes('\\')
        || /[%:?#\u0000-\u001f\u007f]/u.test(imagePath)) {
        return '';
    }
    const segments = imagePath.split('/');
    if (segments.length < 3
        || segments[0] !== 'user'
        || segments[1] !== 'images'
        || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
        return '';
    }
    const extension = segments.at(-1).split('.').at(-1).toLowerCase();
    return GENERATED_IMAGE_EXTENSIONS.has(extension) ? imagePath : '';
}

function createImageGenerationTaskController({
    tasks = new Map(),
    request,
    readPage = () => EMPTY_PAGE,
    writePage = () => {},
    render = async () => {},
    notifyFailure = () => {},
    isConversationVisible = () => true,
    reportError = () => {},
} = {}) {
    if (typeof request !== 'function') {
        throw new TypeError('Image generation task controller needs a request function');
    }

    const renderCurrentMessages = async () => {
        try {
            await render({ refreshMessages: false });
        } catch (error) {
            reportError(error);
        }
    };

    const generate = async ({ conversationId, messageId } = {}) => {
        const normalizedConversationId = asText(conversationId);
        const normalizedMessageId = asText(messageId);
        if (!normalizedConversationId || !normalizedMessageId) {
            return Object.freeze({ ok: false, status: 'invalid' });
        }
        if (tasks.has(normalizedMessageId)) {
            return Object.freeze({ ok: false, status: 'busy' });
        }

        tasks.set(normalizedMessageId, Object.freeze({ conversationId: normalizedConversationId }));
        let result = Object.freeze({ ok: false, status: 'failed' });
        let failed = false;
        try {
            await renderCurrentMessages();
            result = await request({
                conversationId: normalizedConversationId,
                messageId: normalizedMessageId,
            });
            const replacement = asObject(result?.result).message;
            if (result?.ok !== true || asText(replacement?.messageId) !== normalizedMessageId) {
                failed = true;
            } else {
                writePage(
                    normalizedConversationId,
                    replaceMessageInPage(readPage(normalizedConversationId), replacement),
                );
            }
        } catch (error) {
            failed = true;
            result = Object.freeze({ ok: false, status: 'failed', error });
        } finally {
            tasks.delete(normalizedMessageId);
            if (failed) {
                try {
                    notifyFailure();
                } catch {
                    // A notification cannot block per-message loading cleanup.
                }
            }
            if (isConversationVisible(normalizedConversationId)) {
                await renderCurrentMessages();
            }
        }
        return result;
    };

    return Object.freeze({
        generate,
        isLoading: (messageId) => tasks.has(asText(messageId)),
        clear: () => tasks.clear(),
    });
}

function isNearMessageBottom({ scrollTop = 0, clientHeight = 0, scrollHeight = 0, threshold = 32 } = {}) {
    return Number(scrollHeight) - (Number(scrollTop) + Number(clientHeight)) <= Number(threshold);
}

function isVisibleConversation(conversation) {
    return conversation?.kind === 'private' && conversation.status !== 'contact';
}

export function formatUnreadBadge(count) {
    const safeCount = Number.isFinite(Number(count)) ? Math.max(0, Math.trunc(Number(count))) : 0;
    if (safeCount <= 0) return '';
    return safeCount > 99 ? '99+' : String(safeCount);
}

export function countIncomingJumpMessages(messages, knownMessageIds = new Set(), { atBottom = false } = {}) {
    if (atBottom) return 0;
    const known = knownMessageIds instanceof Set ? knownMessageIds : new Set(asArray(knownMessageIds));
    return asArray(messages).filter((message) => (
        message?.senderType === 'person' && !known.has(asText(message.messageId))
    )).length;
}

function hasRealMessage(conversation) {
    return Boolean(asText(conversation?.lastMessage?.messageId));
}

function createMessageRootRow(conversation, index, currentStoryTime) {
    return Object.freeze({
        conversation,
        index,
        hasMessage: hasRealMessage(conversation),
        activityTimestamp: parseStoryTime(conversation?.lastMessage?.storyTime) ?? Number.NEGATIVE_INFINITY,
        preview: messagePreview(conversation?.lastMessage),
        time: formatListTime(conversation?.lastMessage?.storyTime, currentStoryTime),
        unreadLabel: formatUnreadBadge(conversation?.unreadCount),
    });
}

function compareMessageRootRows(left, right) {
    if (left.hasMessage !== right.hasMessage) return left.hasMessage ? -1 : 1;
    if (!left.hasMessage) return left.index - right.index;
    if (left.activityTimestamp !== right.activityTimestamp) return right.activityTimestamp - left.activityTimestamp;
    return left.index - right.index;
}

async function loadMessageRootModel(facade) {
    const query = facade?.query || {};
    const [conversationResult, contextResult] = await Promise.all([
        typeof query.conversations === 'function' ? query.conversations() : undefined,
        typeof query.currentContext === 'function' ? query.currentContext() : undefined,
    ]);
    const currentStoryTime = contextResult?.ok ? asText(contextResult.context?.storyTime) : '';
    const rows = (conversationResult?.ok ? asArray(conversationResult.conversations) : [])
        .filter(isVisibleConversation)
        .map((conversation, index) => createMessageRootRow(conversation, index, currentStoryTime))
        .sort(compareMessageRootRows);
    return Object.freeze({
        chrome: Object.freeze({ hasSearch: true, hasPresence: true, hasAddMount: true }),
        currentStoryTime,
        rows: Object.freeze(rows),
    });
}

function planConversationListAnchor({
    previousConversationIds = [],
    nextConversationIds = [],
    anchorConversationId = '',
    previousScrollTop = 0,
    previousAnchorOffset = 0,
    nextAnchorOffset = 0,
} = {}) {
    const conversationId = asText(anchorConversationId);
    if (!conversationId || !previousConversationIds.includes(conversationId) || !nextConversationIds.includes(conversationId)) {
        return null;
    }
    return Object.freeze({
        conversationId,
        scrollTop: Number(previousScrollTop) + Number(nextAnchorOffset) - Number(previousAnchorOffset),
    });
}

function conversationListRows(root) {
    if (typeof root?.querySelectorAll !== 'function') return [];
    return [...root.querySelectorAll('[data-qq-conversation-id]')];
}

function captureConversationListAnchor(root) {
    if (!root || typeof root.getBoundingClientRect !== 'function') return null;
    const rows = conversationListRows(root);
    const rootRect = root.getBoundingClientRect();
    const anchor = rows.find((row) => {
        const rect = row.getBoundingClientRect?.();
        return rect && rect.bottom > rootRect.top && rect.top < rootRect.bottom;
    });
    const anchorConversationId = asText(anchor?.dataset?.qqConversationId);
    if (!anchorConversationId) return null;
    return Object.freeze({
        previousConversationIds: Object.freeze(rows.map((row) => row.dataset?.qqConversationId).map(asText).filter(Boolean)),
        anchorConversationId,
        previousScrollTop: Number(root.scrollTop) || 0,
        previousAnchorOffset: anchor.getBoundingClientRect().top - rootRect.top,
    });
}

function restoreConversationListAnchor(root, anchor) {
    if (!root || !anchor || typeof root.getBoundingClientRect !== 'function') return false;
    const rows = conversationListRows(root);
    const target = rows.find((row) => row.dataset?.qqConversationId === anchor.anchorConversationId);
    if (!target) return false;
    const plan = planConversationListAnchor({
        ...anchor,
        nextConversationIds: rows.map((row) => row.dataset?.qqConversationId).map(asText).filter(Boolean),
        nextAnchorOffset: target.getBoundingClientRect().top - root.getBoundingClientRect().top,
    });
    if (!plan) return false;
    root.scrollTop = plan.scrollTop;
    return true;
}

function scheduleConversationListAnchorRestore({
    anchor,
    token,
    isActive,
    getRoot,
    enqueue = queueMicrotask,
} = {}) {
    if (!anchor || typeof isActive !== 'function' || typeof getRoot !== 'function' || typeof enqueue !== 'function') return;
    enqueue(() => {
        if (!isActive(token)) return;
        restoreConversationListAnchor(getRoot(), anchor);
    });
}

function isContact(conversation) {
    return conversation?.kind === 'private'
        && (conversation.status === 'active' || conversation.status === 'contact');
}

function contactFormalName(conversation) {
    return asText(conversation?.formalName)
        || asText(conversation?.person?.formalName)
        || asText(conversation?.title)
        || '?';
}


const CONTACT_SECTION_KEYS = Object.freeze([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#']);
const CONTACT_PINYIN_BOUNDARIES = Object.freeze([
    ['A', '\u963f'], ['B', '\u516b'], ['C', '\u64e6'], ['D', '\u642d'], ['E', '\u86fe'], ['F', '\u53d1'],
    ['G', '\u5676'], ['H', '\u54c8'], ['J', '\u51fb'], ['K', '\u5496'], ['L', '\u62c9'], ['M', '\u5988'],
    ['N', '\u62ff'], ['O', '\u54e6'], ['P', '\u556a'], ['Q', '\u671f'], ['R', '\u7136'], ['S', '\u6492'],
    ['T', '\u584c'], ['W', '\u6316'], ['X', '\u6614'], ['Y', '\u538b'], ['Z', '\u531d'],
]);
const CONTACT_COLLATOR = new Intl.Collator('zh-Hans-CN', { sensitivity: 'base' });

function contactDirectoryBucket(value) {
    const first = Array.from(asText(value))[0] || '';
    const latin = first.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toUpperCase();
    if (/^[A-Z]$/.test(latin)) return latin;
    if (!/[\u3400-\u9fff]/.test(first)) return '#';
    let bucket = '#';
    for (const [letter, boundary] of CONTACT_PINYIN_BOUNDARIES) {
        if (CONTACT_COLLATOR.compare(first, boundary) < 0) break;
        bucket = letter;
    }
    return bucket;
}

function groupContactsForDirectory(contacts) {
    const grouped = new Map();
    asArray(contacts).forEach((contact) => {
        const letter = contactDirectoryBucket(contact.formalName);
        if (!grouped.has(letter)) grouped.set(letter, []);
        grouped.get(letter).push(contact);
    });
    return Object.freeze(CONTACT_SECTION_KEYS
        .filter((letter) => grouped.has(letter))
        .map((letter) => Object.freeze({
            letter,
            contacts: Object.freeze(grouped.get(letter).sort((left, right) => CONTACT_COLLATOR.compare(left.formalName, right.formalName))),
        })));
}

function profileViewModel(conversation) {
    const status = asText(conversation?.status);
    const isFriend = status === 'active' || status === 'contact';
    const isReadonly = status === 'readonly';
    return Object.freeze({
        conversationId: asText(conversation?.conversationId),
        formalName: contactFormalName(conversation),
        status,
        isFriend,
        messageLabel: isReadonly ? '查看消息' : '发消息',
        actions: Object.freeze(isFriend
            ? ['remove-friend', 'edit-profile', 'message']
            : isReadonly
                ? ['restore-friend', 'edit-profile', 'message']
                : []),
    });
}

async function loadContactsRootModel(facade) {
    const result = await facade?.query?.conversations?.();
    const conversations = result?.ok ? asArray(result.conversations) : [];
    const contacts = Object.freeze(conversations
        .filter(isContact)
        .map((conversation) => Object.freeze({
            ...profileViewModel(conversation),
            conversation,
        })));
    return Object.freeze({ contacts, sections: groupContactsForDirectory(contacts) });
}


export function shouldCloseConversationSwipe(openedConversationId, targetConversationId, actionConversationId) {
    const opened = asText(openedConversationId);
    return Boolean(opened && opened !== asText(targetConversationId) && opened !== asText(actionConversationId));
}

function createMediaRenderLeaseCoordinator(facade, { cacheLimit = 0 } = {}) {
    return createRenderLeaseCoordinator({
        acquire: async (assetId) => {
            const result = await facade.query.mediaRender({ assetId });
            return result?.ok && result.render?.leaseId && result.render?.url ? result.render : null;
        },
        release: (render) => facade.intent.releaseMediaRender?.({ leaseId: render.leaseId }),
        cacheLimit,
    });
}

export const __test__ = Object.freeze({
    loadMessageRootModel,
    loadContactsRootModel,
    contactDirectoryBucket,
    groupContactsForDirectory,
    profileViewModel,
    formatUnreadBadge,
    countIncomingJumpMessages,
    planConversationListAnchor,
    captureConversationListAnchor,
    restoreConversationListAnchor,
    scheduleConversationListAnchorRestore,
    normalizeContactName,
    countGraphemes,
    chatTitle,
    mergeMessagePage,
    replaceMessageInPage,
    normalizeGeneratedImagePath,
    createImageGenerationTaskController,
    needsTimeDivider,
    isNearMessageBottom,
    resolveConversationSwipe,
    shouldCloseConversationSwipe,
    loadQQSettingsModel,
    saveQQSettings,
    createSettingsSaveQueue,
});

export function createQQApp({
    facade,
    shell = {},
    onError = () => {},
    scopeId = '',
    getSettings = getPhoneSettings,
} = {}) {
    if (!facade?.query || !facade?.intent) throw new TypeError('QQ App needs an injected Facade');

    let root = null;
    let viewport = null;
    let disposed = false;
    let renderEpoch = 0;
    let overlay = null;
    let overlayCleanup = null;
    let restoreOverlayFocus = null;
    let tab = 'messages';
    let page = null;
    let openedChatId = '';
    let openSwipeConversationId = '';
    let emojiOpen = false;
    let displayedViewKey = '';
    const drafts = new Map();
    const composerAutoHeight = createComposerAutoHeightController();
    const messageSelection = createMessageSelection();
    let messageSelectionConversationId = '';
    const pages = new Map();
    const conversationSnapshots = new Map();
    const jumpCounts = new Map();
    const renderLeaseSessions = new Map();
    const selectedImageAssetIds = new Set();
    const selectedStickerIds = new Set();
    const imageGenerationTasks = new Map();
    let imageLibrarySelectionMode = false;
    const enqueueSettingsSave = createSettingsSaveQueue();

    const clearImageLibrarySelection = () => {
        selectedImageAssetIds.clear();
        selectedStickerIds.clear();
        imageLibrarySelectionMode = false;
    };

    const mediaRenderLeases = createMediaRenderLeaseCoordinator(facade);
    const backgroundRenderLeases = createMediaRenderLeaseCoordinator(facade, { cacheLimit: 8 });
    const avatarRenderLeases = createMediaRenderLeaseCoordinator(facade, { cacheLimit: 48 });
    const stickerRenderLeases = createRenderLeaseCoordinator({
        acquire: async (stickerId) => {
            const result = await facade.query.stickerRender?.({ stickerId });
            return result?.ok && result.render?.leaseId && result.render?.url ? result.render : null;
        },
        release: (render) => facade.intent.releaseStickerRender?.({ leaseId: render.leaseId }),
        cacheLimit: 96,
    });

    const requestedViewKey = () => {
        if (!page) return `tab:${tab}`;
        const id = asText(page.conversationId || page.kind);
        return `page:${asText(page.type)}${id ? `:${id}` : ''}`;
    };
    const currentViewKey = () => displayedViewKey || requestedViewKey();
    const currentScopeKey = () => asText(scopeId) || 'qq-local-app';

    const viewSnapshotCache = createViewSnapshotCache({
        limit: 4,
        onEvict(snapshot) {
            snapshot?.holder?.replaceChildren?.();
        },
    });

    const viewScrollState = createPhoneViewScrollState({
        getScopeKey: currentScopeKey,
        getViewKey: currentViewKey,
    });
    viewScrollState.register({
        key: 'message-root',
        matches: (viewKey) => viewKey === 'tab:messages',
        getRoot: () => viewport?.querySelector('.yuzi-qq-message-root-list'),
        mode: 'anchor',
        stickToBottom: false,
        getItems: (element) => element.querySelectorAll('[data-qq-conversation-id]'),
        getKey: (item) => asText(item.dataset.qqConversationId),
    });
    viewScrollState.register({
        key: 'contact-root',
        matches: (viewKey) => viewKey === 'tab:contacts',
        getRoot: () => viewport?.querySelector('.yuzi-qq-contact-root-list'),
        mode: 'offset',
    });
    viewScrollState.register({
        key: 'private-chat',
        matches: (viewKey) => viewKey.startsWith('page:chat:'),
        getRoot: () => {
            const viewKey = currentViewKey();
            const conversationId = viewKey.startsWith('page:chat:') ? viewKey.slice('page:chat:'.length) : '';
            return conversationId
                ? viewport?.querySelector(`[data-qq-message-stream="${conversationId}"]`)
                : null;
        },
        mode: 'anchor',
        getItems: (element) => element.querySelectorAll('[data-qq-scroll-key]'),
        getKey: (item) => asText(item.dataset.qqScrollKey),
    });
    viewScrollState.register({
        key: 'secondary-page',
        matches: (viewKey) => viewKey.startsWith('page:') && !viewKey.startsWith('page:chat:'),
        getRoot: () => viewport?.querySelector('.yuzi-qq-secondary-scroll'),
        mode: 'offset',
    });

    const report = (error) => {
        try {
            onError(error);
        } catch {
            // App error reporting is advisory and cannot break interaction cleanup.
        }
    };

    const isActive = (token) => !disposed && token === renderEpoch;

    const leaseSessionFor = (token = renderEpoch) => renderLeaseSessions.get(token);

    const clearOverlay = () => {
        try {
            overlayCleanup?.();
        } catch {}
        overlayCleanup = null;
        overlay?.remove();
        overlay = null;
        const focusTarget = restoreOverlayFocus;
        restoreOverlayFocus = null;
        if (focusTarget?.getAttribute?.('aria-haspopup') === 'menu') {
            focusTarget.setAttribute('aria-expanded', 'false');
        }
        if (focusTarget instanceof HTMLElement && focusTarget.isConnected) queueMicrotask(() => focusTarget.focus());
    };

    const closeEmojiPanel = ({ preserveScroll = true } = {}) => {
        const scrollSnapshot = preserveScroll ? viewScrollState.capture() : null;
        const panel = viewport?.querySelector('.yuzi-qq-emoji-panel');
        const wasOpen = emojiOpen || Boolean(panel);
        emojiOpen = false;
        panel?.remove();
        viewport?.querySelector('.yuzi-qq-chat-view')?.classList.remove('has-emoji-panel');
        if (wasOpen && scrollSnapshot) {
            viewScrollState.restore(scrollSnapshot, { token: renderEpoch, isCurrent: isActive });
        }
        return wasOpen;
    };

    const emojiPanelController = createEmojiPanelTemporaryLayerController({
        isOpen: () => emojiOpen,
        close: closeEmojiPanel,
        isPanelTarget: (target) => Boolean(target?.closest?.('.yuzi-qq-emoji-panel')),
        isToggleTarget: (target) => Boolean(target?.closest?.('[data-qq-tool="emoji"]')),
    });

    const closeTransientUi = () => {
        clearOverlay();
        closeEmojiPanel();
    };

    const handlePhoneResizeStart = () => {
        if (disposed) return;
        const scrollSnapshot = viewScrollState.capture();
        clearOverlay();
        closeEmojiPanel({ preserveScroll: false });
        viewScrollState.restore(scrollSnapshot, { token: renderEpoch, isCurrent: isActive });
    };

    const avatar = (person, className = 'yuzi-qq-avatar', {
        interactive = false,
        attributes = {},
    } = {}) => {
        const element = interactive
            ? createButton('', className, attributes)
            : createElement('span', className);
        if (!interactive) element.setAttribute('aria-hidden', 'true');
        element.textContent = initial(person?.formalName || person?.title);
        const avatarUrl = asText(person?.avatarUrl);
        if (avatarUrl) {
            const image = createElement('img');
            image.alt = '';
            image.src = avatarUrl;
            element.classList.add('has-image');
            element.replaceChildren(image);
        }
        const assetId = asText(person?.avatarAssetId);
        const token = renderEpoch;
        const avatarSession = leaseSessionFor(token)?.avatars;
        if (assetId && avatarSession) {
            const cached = avatarSession.peek(assetId);
            if (cached?.url) {
                const image = createElement('img');
                image.alt = '';
                image.src = cached.url;
                element.classList.add('has-image');
                element.replaceChildren(image);
            } else {
                void avatarSession.load(assetId).then((render) => {
                    if (!render?.url || !isActive(token)) return;
                    const image = createElement('img');
                    image.alt = '';
                    image.src = render.url;
                    element.classList.add('has-image');
                    element.replaceChildren(image);
                }).catch(() => {});
            }
        }
        return element;
    };

    const stickerImage = (stickerId, fallback, className = 'yuzi-qq-sticker-image') => {
        const element = createElement('span', className);
        element.textContent = fallback || '[\u8868\u60c5]';
        const token = renderEpoch;
        const stickerSession = leaseSessionFor(token)?.stickers;
        if (!stickerId || !stickerSession) return element;
        const cached = stickerSession.peek(stickerId);
        if (cached?.url) {
            const image = createElement('img');
            image.alt = fallback || '';
            image.src = cached.url;
            element.classList.add('has-image');
            element.replaceChildren(image);
        } else {
            void stickerSession.load(stickerId).then((render) => {
                if (!render?.url || !isActive(token) || !element.isConnected) return;
                const image = createElement('img');
                image.alt = fallback || '';
                image.src = render.url;
                element.classList.add('has-image');
                element.replaceChildren(image);
            }).catch(() => {});
        }
        return element;
    };

    const createIcon = (name, className = '') => {
        const icon = createElement('i', `fa-solid fa-${name}${className ? ` ${className}` : ''}`);
        icon.setAttribute('aria-hidden', 'true');
        return icon;
    };

    const getCurrentContext = async () => {
        const result = await facade.query.currentContext?.();
        return result?.ok ? asObject(result.context) : {};
    };

    const identityAvatar = (context, profile, title, token) => {
        const identity = asObject(context?.user);
        const element = createButton('', 'yuzi-qq-identity-avatar yuzi-qq-current-profile-trigger', {
            'aria-label': '\u5f53\u524d\u7528\u6237\u8d44\u6599', 'data-qq-current-profile': '1', title: '\u5f53\u524d\u7528\u6237\u8d44\u6599',
        });
        element.textContent = initial(identity.name || title);
        const hostAvatar = asText(identity.avatar);
        if (hostAvatar) {
            const image = createElement('img');
            image.alt = '';
            image.src = hostAvatar;
            element.classList.add('has-image');
            element.replaceChildren(image);
        }
        const assetId = asText(profile.avatarAssetId);
        const avatarSession = leaseSessionFor(token)?.avatars;
        if (!assetId || !avatarSession) return element;
        const cached = avatarSession.peek(assetId);
        if (cached?.url) {
            const image = createElement('img');
            image.alt = '';
            image.src = cached.url;
            element.classList.add('has-image');
            element.replaceChildren(image);
        } else {
            void avatarSession.load(assetId).then((render) => {
                if (!render?.url || !isActive(token)) return;
                const image = createElement('img');
                image.alt = '';
                image.src = render.url;
                element.classList.add('has-image');
                element.replaceChildren(image);
            }).catch(() => {});
        }
        return element;
    };

    const getConversation = async (conversationId) => {
        const result = await facade.query.conversation({ conversationId });
        if (!result?.ok || !result.conversation) return null;
        conversationSnapshots.set(conversationId, result.conversation);
        return result.conversation;
    };

    const getMessageState = (conversationId) => pages.get(conversationId) || { ...EMPTY_PAGE };

    const isMessageSelectionMode = (conversationId) => (
        messageSelectionConversationId === asText(conversationId)
    );

    const isImageGenerationEnabled = () => {
        try {
            return asObject(typeof getSettings === 'function' ? getSettings() : {}).imageGeneration?.enabled === true;
        } catch {
            return false;
        }
    };

    const imageGenerationController = createImageGenerationTaskController({
        tasks: imageGenerationTasks,
        request: ({ conversationId, messageId }) => facade.intent.generateMessageImage({ conversationId, messageId }),
        readPage: (conversationId) => getMessageState(conversationId),
        writePage: (conversationId, messagePage) => pages.set(conversationId, messagePage),
        render: (options) => render(options),
        notifyFailure: () => shell.showToast?.('图片生成失败', true),
        isConversationVisible: (conversationId) => (
            !disposed
            && page?.type === 'chat'
            && asText(page.conversationId) === conversationId
        ),
        reportError: report,
    });

    const selectableMessages = (conversationId) => getMessageState(conversationId).items.filter((message) => (
        asText(message?.messageId)
    ));

    const exitMessageSelection = (conversationId) => {
        const id = asText(conversationId);
        if (id) messageSelection.clear(id);
        if (!id || messageSelectionConversationId === id) messageSelectionConversationId = '';
    };

    const enterMessageSelection = (conversationId, messageId) => {
        const id = asText(conversationId);
        const targetMessageId = asText(messageId);
        if (!id || !targetMessageId) return false;
        if (messageSelectionConversationId && messageSelectionConversationId !== id) {
            messageSelection.clear(messageSelectionConversationId);
        }
        messageSelectionConversationId = id;
        messageSelection.select(id, targetMessageId);
        clearOverlay();
        closeEmojiPanel();
        void render();
        return true;
    };

    const closeOpenedChat = () => {
        const conversationId = openedChatId;
        openedChatId = '';
        if (conversationId) {
            exitMessageSelection(conversationId);
            void facade.intent.closeConversation?.({ conversationId });
        }
    };

    const closeConversationSwipe = () => {
        if (!openSwipeConversationId) return false;
        viewport?.querySelectorAll('.yuzi-qq-message-conversation-swipe-row.is-swiped').forEach((row) => {
            row.classList.remove('is-swiped');
        });
        openSwipeConversationId = '';
        return true;
    };

    const loadMessages = async (conversationId, { beforeSequence, prepend = false } = {}) => {
        const previous = getMessageState(conversationId);
        const result = await facade.query.messages({
            conversationId,
            ...(Number.isInteger(beforeSequence) ? { beforeSequence } : {}),
            limit: 50,
        });
        const next = result?.ok ? result.page : EMPTY_PAGE;
        const state = mergeMessagePage(previous, next, { prepend });
        pages.set(conversationId, state);
        return state;
    };

    const makeHeader = (title, {
        back = false,
        actions = [],
        className = '',
        titleClassName = '',
    } = {}) => {
        const header = createElement('header', `phone-nav-bar is-embedded yuzi-qq-header${className ? ` ${className}` : ''}`);
        const leading = createElement('div', 'phone-nav-leading');
        if (back) {
            const backButton = createButton('', 'phone-nav-icon-button phone-nav-back yuzi-qq-icon-button', {
                'aria-label': '返回', 'data-qq-back': '1', title: '返回',
            });
            backButton.append(createPhoneNavIconElement('back'));
            leading.append(backButton);
        } else {
            leading.append(createElement('span', 'yuzi-qq-header-spacer'));
        }
        const center = createElement('div', 'phone-nav-center');
        const heading = createElement('h1', `phone-nav-title yuzi-qq-title${titleClassName ? ` ${titleClassName}` : ''}`);
        heading.textContent = title;
        center.append(heading);
        const actionArea = createElement('div', 'phone-nav-trailing yuzi-qq-header-actions');
        actions.forEach((action) => actionArea.append(action));
        header.append(leading, center, actionArea);
        return header;
    };

    const makeSecondaryPage = (title, {
        actions = [],
        className = '',
        headerClassName = '',
        titleClassName = '',
    } = {}) => {
        const main = createElement('main', `yuzi-qq-view yuzi-qq-secondary-page${className ? ` ${className}` : ''}`);
        const top = createElement('div', 'yuzi-qq-secondary-top');
        top.append(makeHeader(title, {
            back: true,
            actions,
            className: headerClassName,
            titleClassName,
        }));
        const scroll = createElement('div', 'yuzi-qq-secondary-scroll');
        const content = createElement('div', 'yuzi-qq-secondary-content');
        scroll.append(content);
        main.append(top, scroll);
        return { main, top, scroll, content };
    };

    const makeProfileTop = () => {
        const top = createElement('div', 'yuzi-qq-profile-top');
        const backButton = createButton('', 'phone-nav-icon-button phone-nav-back yuzi-qq-icon-button yuzi-qq-profile-back-control', {
            'aria-label': '\u8fd4\u56de', 'data-qq-back': '1', title: '\u8fd4\u56de',
        });
        backButton.append(createPhoneNavIconElement('back'));
        top.append(backButton);
        return top;
    };

    const makeRootIdentityHeader = async (token, title, {
        action = null,
        showPresence = true,
        className = '',
        titleClassName = '',
        statusClassName = '',
        actionsClassName = '',
    } = {}) => {
        const header = createElement('header', `yuzi-qq-identity-header${className ? ` ${className}` : ''}`);
        const [context, profileResult] = await Promise.all([
            getCurrentContext(),
            facade.query.currentProfile?.(),
        ]);
        const profile = profileResult?.ok ? asObject(profileResult.profile) : {};
        const copy = createElement('div', 'yuzi-qq-identity-copy');
        const heading = createElement('h1', `yuzi-qq-identity-title${titleClassName ? ` ${titleClassName}` : ''}`);
        heading.textContent = showPresence ? asText(context.user?.name) || title : title;
        const status = createElement('span', `yuzi-qq-identity-status${statusClassName ? ` ${statusClassName}` : ''}`);
        const statusDot = createElement('span', 'yuzi-qq-identity-status-dot');
        statusDot.setAttribute('aria-hidden', 'true');
        const statusText = createElement('span');
        statusText.textContent = '\u5728\u7ebf - WIFI';
        status.append(statusDot, statusText);
        copy.append(heading);
        if (showPresence) copy.append(status);
        const actions = createElement('div', `yuzi-qq-identity-actions${actionsClassName ? ` ${actionsClassName}` : ''}`);
        if (action) actions.append(action);
        header.append(identityAvatar(context, profile, title, token), copy, actions);
        return header;
    };

    const makeChatHeader = (conversation) => {
        const header = createElement('header', 'phone-nav-bar is-embedded yuzi-qq-chat-header yuzi-qq-private-chat-header is-left-aligned');
        const leading = createElement('div', 'phone-nav-leading');
        const backButton = createButton('', 'phone-nav-icon-button phone-nav-back yuzi-qq-icon-button yuzi-qq-chat-back-button yuzi-qq-private-chat-back-button', {
            'aria-label': '\u8fd4\u56de', 'data-qq-back': '1', title: '\u8fd4\u56de',
        });
        backButton.append(createPhoneNavIconElement('back'));
        leading.append(backButton);
        const center = createElement('div', 'phone-nav-center');
        const copy = createElement('div', 'yuzi-qq-chat-heading-copy yuzi-qq-private-chat-heading-copy');
        const heading = createElement('h1', 'phone-nav-title yuzi-qq-chat-title yuzi-qq-private-chat-title');
        heading.textContent = chatTitle(conversation);
        const status = createElement('span', 'yuzi-qq-chat-status yuzi-qq-private-chat-status');
        const dot = createElement('span', 'yuzi-qq-chat-status-dot');
        dot.setAttribute('aria-hidden', 'true');
        const label = createElement('span');
        label.textContent = '\u5728\u7ebf';
        status.append(dot, label);
        copy.append(heading, status);
        center.append(copy);
        const actions = createElement('div', 'phone-nav-trailing yuzi-qq-chat-header-actions yuzi-qq-private-chat-header-actions');
        const detail = createButton('', 'phone-nav-icon-button yuzi-qq-icon-button yuzi-qq-chat-overflow-button', {
            'aria-label': '\u4f1a\u8bdd\u8be6\u60c5', title: '\u4f1a\u8bdd\u8be6\u60c5', 'data-qq-conversation-detail': conversation.conversationId,
        });
        detail.append(createIcon('bars'));
        actions.append(detail);
        header.append(leading, center, actions);
        return header;
    };

    const makeNav = () => {
        const navigation = createElement('nav', 'yuzi-qq-nav yuzi-qq-root-tabbar');
        navigation.setAttribute('data-phone-bottom-bar', '');
        navigation.setAttribute('aria-label', 'QQ 主导航');
        TABS.forEach(([id, label]) => {
            const item = createButton(label, `yuzi-qq-nav-item yuzi-qq-root-tab${tab === id ? ' is-active' : ''}`, {
                'data-qq-tab': id,
            });
            const icon = createQQFigmaIconElement(TAB_META[id]?.icon || 'message', document, 'yuzi-qq-nav-icon');
            const labelNode = createElement('span', 'yuzi-qq-nav-label');
            labelNode.textContent = label;
            item.replaceChildren(icon, labelNode);
            navigation.append(item);
        });
        return navigation;
    };

    const showDialog = ({ title, content, actions = [], dismissible = true, className = '' }) => {
        clearOverlay();
        closeEmojiPanel();
        restoreOverlayFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const layer = createElement('div', 'yuzi-qq-overlay');
        const dialog = createElement('section', `yuzi-qq-dialog ${className}`.trim());
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-label', title || 'QQ 对话框');
        dialog.tabIndex = -1;
        if (title) {
            const heading = createElement('h2', 'yuzi-qq-dialog-title');
            heading.textContent = title;
            dialog.append(heading);
        }
        if (content) {
            const body = createElement('div', 'yuzi-qq-dialog-body');
            body.append(content);
            dialog.append(body);
        }
        if (actions.length) {
            const controls = createElement('div', 'yuzi-qq-dialog-actions');
            actions.forEach((action) => controls.append(action));
            dialog.append(controls);
        }
        if (dismissible) {
            layer.addEventListener('click', (event) => {
                if (event.target === layer) clearOverlay();
            });
            layer.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    clearOverlay();
                }
            });
        }
        layer.addEventListener('keydown', (event) => {
            if (event.key !== 'Tab') return;
            const focusable = [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')];
            if (focusable.length === 0) {
                event.preventDefault();
                dialog.focus();
                return;
            }
            const first = focusable[0];
            const last = focusable.at(-1);
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        });
        layer.append(dialog);
        viewport?.append(layer);
        overlay = layer;
        queueMicrotask(() => (dialog.querySelector('input, textarea, button:not([disabled]), select:not([disabled])') || dialog).focus());
        return { layer, dialog };
    };

    const showAnchoredMenu = (anchor, menu) => {
        if (!(anchor instanceof HTMLElement) || !(menu instanceof HTMLElement) || !viewport) return null;
        clearOverlay();
        closeEmojiPanel();
        restoreOverlayFocus = anchor;
        anchor.setAttribute('aria-expanded', 'true');

        const layer = createElement('div', 'yuzi-qq-anchored-menu-layer');
        const viewportRect = viewport.getBoundingClientRect();
        const anchorRect = anchor.getBoundingClientRect();
        const scaleX = viewport.offsetWidth > 0 ? viewportRect.width / viewport.offsetWidth : 1;
        const scaleY = viewport.offsetHeight > 0 ? viewportRect.height / viewport.offsetHeight : 1;
        const anchorTop = Math.max(0, (anchorRect.bottom - viewportRect.top) / scaleY);
        const anchorRight = Math.max(0, (viewportRect.right - anchorRect.right) / scaleX);
        layer.setAttribute('style', `--yuzi-qq-anchored-menu-top:${anchorTop}px;--yuzi-qq-anchored-menu-right:${anchorRight}px`);
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', '新建');
        menu.tabIndex = -1;

        layer.addEventListener('click', (event) => {
            if (event.target === layer) clearOverlay();
        });
        layer.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            clearOverlay();
        });
        layer.append(menu);
        viewport.append(layer);
        overlay = layer;
        queueMicrotask(() => (menu.querySelector('button:not([disabled])') || menu).focus());
        return { layer, menu };
    };

    const go = (next) => {
        closeEmojiPanel();
        page = { ...next, returnTo: page ? { ...page } : null };
        void render();
    };

    const back = () => {
        closeEmojiPanel();
        if (page?.type === 'chat') closeOpenedChat();
        if (page?.type === 'settings' && page.kind === 'image-library') clearImageLibrarySelection();
        page = page?.returnTo || null;
        return render();
    };

    const pageStackContainsChat = (conversationId) => {
        let candidate = page;
        while (candidate) {
            if (candidate.type === 'chat' && candidate.conversationId === conversationId) return true;
            candidate = candidate.returnTo;
        }
        return false;
    };

    const openChat = async (conversation) => {
        let target = conversationSnapshots.get(asText(conversation?.conversationId)) || conversation;
        if (conversation?.status === 'contact') {
            const created = await facade.intent.createPrivateConversation({ name: contactFormalName(conversation) });
            if (!created?.ok) {
                report(new Error(created?.error?.message || '无法打开会话'));
                return;
            }
            target = created.result?.conversation || conversation;
        }
        const conversationId = asText(target?.conversationId);
        if (!conversationId) return;
        conversationSnapshots.set(conversationId, target);
        jumpCounts.delete(conversationId);
        go({ type: 'chat', conversationId });
        const opened = await facade.intent.openConversation({ conversationId: target.conversationId });
        if (!opened?.ok) {
            report(new Error(opened?.error?.message || '无法打开会话'));
            if (page?.type === 'chat' && page.conversationId === conversationId) {
                page = page.returnTo || null;
                void render();
            }
            return;
        }
        if (!pageStackContainsChat(conversationId)) {
            void facade.intent.closeConversation?.({ conversationId });
            return;
        }
        openedChatId = conversationId;
    };

    const renderConversationRow = (model) => {
        const { conversation, preview: previewText, time: timeText, unreadLabel } = model;
        const shell = createElement('div', `yuzi-qq-swipe-row yuzi-qq-message-conversation-swipe-row${openSwipeConversationId === conversation.conversationId ? ' is-swiped' : ''}`);
        shell.dataset.qqConversationId = conversation.conversationId;
        const row = createButton('', 'yuzi-qq-conversation-row yuzi-qq-message-conversation-row', { 'data-qq-chat': conversation.conversationId });
        row.append(avatar(conversation, 'yuzi-qq-avatar yuzi-qq-conversation-avatar'));
        const main = createElement('span', 'yuzi-qq-row-main');
        const name = createElement('span', 'yuzi-qq-row-title');
        name.textContent = conversation.title;
        const preview = createElement('span', 'yuzi-qq-row-preview');
        preview.textContent = previewText;
        main.append(name, preview);
        row.append(main);
        const metadata = createElement('span', 'yuzi-qq-row-meta yuzi-qq-conversation-meta');
        const time = createElement('span');
        time.textContent = timeText;
        metadata.append(time);
        if (unreadLabel) {
            const badge = createElement('span', 'yuzi-qq-badge yuzi-qq-unread-chip');
            badge.textContent = unreadLabel;
            metadata.append(badge);
        }
        row.append(metadata);
        const remove = createButton('删除', 'yuzi-qq-swipe-delete yuzi-qq-message-conversation-delete', {
            'data-qq-delete-conversation': conversation.conversationId,
        });
        shell.append(row, remove);
        bindConversationSwipeGesture({
            shell,
            row,
            deleteAction: remove,
            onSettle: ({ open }) => {
                viewport?.querySelectorAll('.yuzi-qq-message-conversation-swipe-row.is-swiped').forEach((candidate) => {
                    if (open && candidate === shell) return;
                    candidate.classList.remove('is-swiped');
                });
                openSwipeConversationId = open ? conversation.conversationId : '';
            },
        });
        return shell;
    };

    const renderMessagesRoot = async (token) => {
        const main = createElement('main', 'yuzi-qq-view yuzi-qq-list-view yuzi-qq-message-root-view');
        main.dataset.qqMessageRoot = '1';
        const add = createButton('', 'yuzi-qq-icon-button yuzi-qq-identity-action yuzi-qq-message-root-add-action', {
            'aria-label': '新建会话', 'aria-haspopup': 'menu', 'aria-expanded': 'false', title: '新建会话', 'data-qq-add-contact': '1',
        });
        add.append(createIcon('plus'));
        const [header, model] = await Promise.all([
            makeRootIdentityHeader(token, '消息', {
                action: add,
                className: 'yuzi-qq-message-root-header',
                titleClassName: 'yuzi-qq-message-root-title',
                statusClassName: 'yuzi-qq-message-root-status',
                actionsClassName: 'yuzi-qq-message-root-actions',
            }),
            loadMessageRootModel(facade),
        ]);
        main.append(header);
        if (!isActive(token)) return main;
        const sheet = createElement('section', 'yuzi-qq-list-sheet yuzi-qq-message-list-sheet yuzi-qq-message-root-sheet');
        const search = createElement('div', 'yuzi-qq-search yuzi-qq-message-root-search');
        search.append(createIcon('magnifying-glass', 'yuzi-qq-search-icon'));
        const searchLabel = createElement('span');
        searchLabel.textContent = '搜索';
        search.append(searchLabel);
        search.setAttribute('aria-hidden', 'true');
        const list = createElement('div', 'yuzi-qq-conversation-list yuzi-qq-message-root-list yuzi-qq-root-scroll-list');
        sheet.append(search, list);
        main.append(sheet);
        model.rows.forEach((row) => {
            conversationSnapshots.set(row.conversation.conversationId, row.conversation);
            list.append(renderConversationRow(row));
        });
        return main;
    };

    const renderContactsRoot = async (token) => {
        const main = createElement('main', 'yuzi-qq-view yuzi-qq-list-view yuzi-qq-contact-root-view');
        const decorativeAdd = createElement('span', 'yuzi-qq-identity-action yuzi-qq-contact-add-visual');
        decorativeAdd.classList.add('yuzi-qq-contact-root-add-visual');
        decorativeAdd.setAttribute('aria-hidden', 'true');
        decorativeAdd.append(createIcon('user-plus'));
        const [header, model] = await Promise.all([
            makeRootIdentityHeader(token, '联系人', {
                action: decorativeAdd,
                className: 'yuzi-qq-contact-root-header',
                titleClassName: 'yuzi-qq-contact-root-title',
                statusClassName: 'yuzi-qq-contact-root-status',
                showPresence: false,
                actionsClassName: 'yuzi-qq-contact-root-actions',
            }),
            loadContactsRootModel(facade),
        ]);
        main.append(header);
        if (!isActive(token)) return main;
        const sheet = createElement('section', 'yuzi-qq-list-sheet yuzi-qq-contact-list-sheet yuzi-qq-contact-root-sheet');
        const search = createElement('div', 'yuzi-qq-search yuzi-qq-contact-root-search');
        search.append(createIcon('magnifying-glass', 'yuzi-qq-search-icon'));
        const searchLabel = createElement('span');
        searchLabel.textContent = '搜索';
        search.append(searchLabel);
        search.setAttribute('aria-hidden', 'true');
        const decorativeItems = createElement('div', 'yuzi-qq-contact-utilities');
        ['新朋友', '群通知'].forEach((label) => {
            const item = createElement('div', 'yuzi-qq-contact-utility');
            const labelNode = createElement('span', 'yuzi-qq-contact-utility-label');
            labelNode.textContent = label;
            const arrow = createIcon('chevron-right', 'yuzi-qq-contact-utility-arrow');
            item.append(labelNode, arrow);
            item.setAttribute('aria-hidden', 'true');
            decorativeItems.append(item);
        });
        const list = createElement('div', 'yuzi-qq-contact-list yuzi-qq-contact-root-list yuzi-qq-root-scroll-list');
        sheet.append(search, decorativeItems, list);
        main.append(sheet);
        model.sections.forEach(({ letter, contacts }) => {
            const section = createElement('section', 'yuzi-qq-contact-section');
            const label = createElement('span', 'yuzi-qq-contact-section-label');
            label.textContent = letter;
            const rows = createElement('div', 'yuzi-qq-contact-section-list');
            contacts.forEach(({ conversation, formalName }) => {
                conversationSnapshots.set(conversation.conversationId, conversation);
                const row = createButton('', 'yuzi-qq-contact-row yuzi-qq-contact-root-row', { 'data-qq-profile': conversation.conversationId });
                row.append(avatar(conversation, 'yuzi-qq-avatar yuzi-qq-contact-avatar'));
                const copy = createElement('span', 'yuzi-qq-contact-copy');
                const name = createElement('span', 'yuzi-qq-contact-name');
                name.textContent = formalName;
                const presence = createElement('span', 'yuzi-qq-contact-presence');
                presence.textContent = 'Wi-Fi 在线';
                copy.append(name, presence);
                row.append(copy);
                rows.append(row);
            });
            section.append(label, rows);
            list.append(section);
        });
        return main;
    };

    const currentProfileName = (context) => asText(context?.user?.name) || '\u6211';

    const profileSummaryRow = (person) => {
        const text = [asText(person.gender), asText(person.birthday)].filter(Boolean).join(' | ');
        if (!text) return null;
        const row = createElement('div', 'yuzi-qq-profile-row yuzi-qq-profile-detail-row yuzi-qq-profile-summary-row yuzi-qq-current-profile-summary-row');
        const summary = createElement('p', 'yuzi-qq-profile-summary');
        summary.textContent = text;
        row.append(summary, createIcon('chevron-right', 'yuzi-qq-profile-summary-arrow'));
        return row;
    };

    const profileSignatureRow = (value) => {
        const text = asText(value);
        if (!text) return null;
        const row = createElement('div', 'yuzi-qq-profile-row yuzi-qq-profile-detail-row yuzi-qq-profile-signature-row yuzi-qq-current-profile-signature-row');
        const signature = createElement('p', 'yuzi-qq-profile-signature');
        signature.textContent = text;
        row.append(signature, createIcon('pencil', 'yuzi-qq-profile-signature-pencil'));
        return row;
    };

    const renderProfileSurface = async ({ token, person, statusText = '', backgroundAssetId = '', actions, className = '' }) => {
        const main = createElement('main', `yuzi-qq-view yuzi-qq-profile-view yuzi-qq-profile-page${className ? ` ${className}` : ''}`);
        const backgroundLayer = makeProfileTop();
        backgroundLayer.classList.add('yuzi-qq-profile-background-layer');
        main.append(backgroundLayer);
        if (backgroundAssetId) {
            const mediaSession = leaseSessionFor(token)?.background;
            const applyBackground = (media) => {
                if (!media?.url || !isActive(token)) return;
                backgroundLayer.classList.add('has-profile-background');
                backgroundLayer.style.backgroundImage = `url("${media.url}")`;
            };
            const cached = mediaSession?.peek(backgroundAssetId);
            if (cached) applyBackground(cached);
            else {
                void mediaSession?.load(backgroundAssetId).then(applyBackground).catch(() => {
                    // The default profile surface remains available when its background cannot render.
                });
            }
        }
        if (!isActive(token)) return main;
        const sheet = createElement('section', 'yuzi-qq-profile-sheet yuzi-qq-profile-content-sheet');
        const hero = createElement('div', 'yuzi-qq-profile-row yuzi-qq-profile-hero');
        const portrait = avatar(person, 'yuzi-qq-avatar yuzi-qq-avatar-large yuzi-qq-profile-portrait');
        const copy = createElement('div', 'yuzi-qq-profile-copy yuzi-qq-profile-hero-copy');
        const name = createElement('h2', 'yuzi-qq-profile-name yuzi-qq-profile-hero-name');
        name.textContent = asText(person.formalName) || '\u672a\u547d\u540d';
        const status = createElement('p', 'yuzi-qq-profile-status yuzi-qq-profile-hero-status');
        status.textContent = statusText;
        copy.append(name);
        if (statusText) copy.append(status);
        hero.append(portrait, copy);
        const details = createElement('div', 'yuzi-qq-profile-details');
        const detailRows = [
            profileSummaryRow(person),
            profileSignatureRow(person.signature),
        ].filter(Boolean);
        details.append(...detailRows);
        sheet.append(hero);
        if (detailRows.length) sheet.append(details);
        main.append(sheet, actions);
        return main;
    };

    const renderProfile = async (token) => {
        const conversation = await getConversation(page.conversationId);
        if (!conversation || !isActive(token)) {
            const main = createElement('main', 'yuzi-qq-view yuzi-qq-profile-view yuzi-qq-profile-page');
            main.append(makeProfileTop());
            return main;
        }
        const actions = createElement('div', 'yuzi-qq-profile-actions yuzi-qq-profile-action-bar yuzi-qq-profile-footer-actions');
        actions.setAttribute('data-phone-bottom-bar', '');
        if (conversation.status === 'readonly') {
            actions.append(createButton('\u6dfb\u52a0\u597d\u53cb', 'yuzi-qq-primary-button yuzi-qq-profile-action yuzi-qq-profile-restore-action', {
                'data-qq-restore-friend': conversation.conversationId,
            }));
        } else if (conversation.status === 'active' || conversation.status === 'contact') {
            actions.append(createButton('\u5220\u9664\u597d\u53cb', 'yuzi-qq-danger-button yuzi-qq-profile-action yuzi-qq-profile-remove-action', {
                'data-qq-remove-friend': conversation.conversationId,
            }));
        }
        actions.append(createButton('\u7f16\u8f91\u8d44\u6599', 'yuzi-qq-secondary-button yuzi-qq-profile-action', {
            'data-qq-edit-profile': conversation.conversationId,
        }));
        actions.append(createButton(conversation.status === 'readonly' ? '\u67e5\u770b\u6d88\u606f' : '\u53d1\u6d88\u606f', 'yuzi-qq-secondary-button yuzi-qq-profile-action', {
            'data-qq-profile-message': conversation.conversationId,
        }));
        return renderProfileSurface({
            token,
            person: { ...conversation, formalName: contactFormalName(conversation) },
            statusText: conversation.status === 'readonly' ? '\u5df2\u4e0d\u662f\u597d\u53cb' : '',
            backgroundAssetId: asText(conversation.profileBackgroundAssetId),
            actions,
        });
    };

    const renderCurrentProfile = async (token) => {
        const [profileResult, context] = await Promise.all([
            facade.query.currentProfile(),
            getCurrentContext(),
        ]);
        if (!isActive(token)) return createElement('main', 'yuzi-qq-view yuzi-qq-profile-view yuzi-qq-profile-page yuzi-qq-current-profile-view');
        if (!profileResult?.ok) {
            const main = createElement('main', 'yuzi-qq-view yuzi-qq-profile-view yuzi-qq-profile-page yuzi-qq-current-profile-view');
            main.append(makeProfileTop());
            const status = createElement('p', 'yuzi-qq-settings-status');
            status.textContent = profileResult?.error?.message || '\u8bfb\u53d6\u8d44\u6599\u5931\u8d25';
            main.append(status);
            return main;
        }
        const profile = asObject(profileResult.profile);
        const displayName = currentProfileName(context);
        const actions = createElement('div', 'yuzi-qq-profile-actions yuzi-qq-profile-action-bar yuzi-qq-current-profile-actions');
        actions.setAttribute('data-phone-bottom-bar', '');
        actions.append(createButton('\u7f16\u8f91\u8d44\u6599', 'yuzi-qq-primary-button yuzi-qq-profile-action yuzi-qq-current-profile-edit-action', {
            'data-qq-current-profile-edit': '1',
        }));
        return renderProfileSurface({
            token,
            person: {
                formalName: displayName,
                avatarAssetId: profile.avatarAssetId,
                avatarUrl: context.user?.avatar,
                signature: profile.signature,
                gender: profile.gender,
                birthday: profile.birthday,
            },
            backgroundAssetId: asText(profile.profileBackgroundAssetId),
            actions,
            className: 'yuzi-qq-current-profile-view',
        });
    };

    const PROFILE_FIELD_META = Object.freeze({
        formalName: Object.freeze({ label: '\u540d\u5b57', maxLength: 120 }),
        signature: Object.freeze({ label: '\u7b7e\u540d', maxLength: 1000 }),
        gender: Object.freeze({ label: '\u6027\u522b', maxLength: 120 }),
        birthday: Object.freeze({ label: '\u751f\u65e5', maxLength: 120 }),
    });

    const profileEditRow = ({ field, value, owner, conversationId = '', readonly = false, className = '' }) => {
        const meta = PROFILE_FIELD_META[field];
        const row = createElement('label', `yuzi-qq-field yuzi-qq-field-row yuzi-qq-field-group yuzi-qq-profile-edit-row yuzi-qq-profile-editor-group yuzi-qq-profile-editor-row${readonly ? ' is-readonly' : ' is-control-stacked'}${className ? ` ${className}` : ''}`);
        const labelNode = createElement('span', 'yuzi-qq-field-label');
        labelNode.textContent = meta.label;
        if (readonly) {
            const control = createElement('span', 'yuzi-qq-field-control yuzi-qq-profile-edit-value yuzi-qq-profile-editor-row-value');
            control.textContent = asText(value);
            row.append(labelNode, control);
            return row;
        }
        const input = createElement('input', 'yuzi-qq-field-control yuzi-qq-field-input yuzi-qq-profile-editor-input');
        input.type = 'text';
        input.name = field;
        input.value = asText(value);
        input.maxLength = meta.maxLength;
        input.autocomplete = 'off';
        input.dataset.qqProfileFieldInput = field;
        input.dataset.qqProfileFieldOwner = owner;
        if (conversationId) input.dataset.qqProfileFieldConversation = conversationId;
        row.append(labelNode, input);
        return row;
    };

    const profileAssetRow = ({ label, value, pickAttributes, clearAttributes, className = '' }) => {
        const row = createElement('div', `yuzi-qq-field yuzi-qq-field-row yuzi-qq-field-group yuzi-qq-profile-asset-row ${className}`);
        const labelNode = createElement('span', 'yuzi-qq-field-label');
        labelNode.textContent = label;
        const control = createElement('span', 'yuzi-qq-field-control yuzi-qq-profile-asset-control');
        const pick = createButton('', 'yuzi-qq-icon-button yuzi-qq-profile-asset-upload', {
            'aria-label': `${label}\u4e0a\u4f20`, title: `${label}\u4e0a\u4f20`, ...pickAttributes,
        });
        pick.append(createIcon('arrow-up-from-bracket'));
        control.append(pick);
        if (value) {
            const clear = createButton('', 'yuzi-qq-icon-button yuzi-qq-profile-asset-delete', {
                'aria-label': `${label}\u5220\u9664`, title: `${label}\u5220\u9664`, ...clearAttributes,
            });
            clear.append(createIcon('trash'));
            control.append(clear);
        }
        row.append(labelNode, control);
        return row;
    };

    const renderProfileEditorSurface = ({ token, profile, displayName, conversationId = '', current = false }) => {
        const { main, content } = makeSecondaryPage('\u7f16\u8f91\u8d44\u6599', {
            className: `yuzi-qq-profile-view yuzi-qq-profile-page yuzi-qq-profile-editor-view yuzi-qq-profile-edit-view${current ? ' yuzi-qq-current-profile-editor-view' : ''}`,
            headerClassName: `yuzi-qq-profile-editor-header${current ? ' yuzi-qq-current-profile-editor-header' : ''}`,
            titleClassName: 'yuzi-qq-profile-editor-title',
        });
        if (!isActive(token)) return main;
        const owner = current ? 'current' : 'private';
        const rowClass = 'yuzi-qq-profile-editor-group yuzi-qq-profile-editor-row';
        const groups = createElement('div', 'yuzi-qq-profile-editor-groups yuzi-qq-profile-editor-list');
        groups.append(
            profileAssetRow({
                label: '\u5934\u50cf',
                value: asText(profile.avatarAssetId),
                pickAttributes: current
                    ? { 'data-qq-current-profile-pick-avatar': '1' }
                    : { 'data-qq-profile-pick-avatar': conversationId },
                clearAttributes: current
                    ? { 'data-qq-current-profile-clear-avatar': '1' }
                    : { 'data-qq-profile-clear-avatar': conversationId },
                className: rowClass,
            }),
            profileEditRow({ field: 'formalName', value: displayName, owner, conversationId, readonly: current }),
            profileEditRow({ field: 'signature', value: profile.signature, owner, conversationId }),
            profileEditRow({ field: 'gender', value: profile.gender, owner, conversationId }),
            profileEditRow({ field: 'birthday', value: profile.birthday, owner, conversationId }),
            profileAssetRow({
                label: '\u8d44\u6599\u80cc\u666f',
                value: asText(profile.profileBackgroundAssetId),
                pickAttributes: current
                    ? { 'data-qq-current-profile-pick-background': '1' }
                    : { 'data-qq-profile-pick-background': conversationId },
                clearAttributes: current
                    ? { 'data-qq-current-profile-clear-background': '1' }
                    : { 'data-qq-profile-clear-background': conversationId },
                className: rowClass,
            }),
        );
        const status = createElement('p', 'yuzi-qq-form-error yuzi-qq-profile-editor-status');
        status.dataset.qqProfileEditorStatus = owner;
        content.append(groups, status);
        return main;
    };

    const renderProfileEditor = async (token) => {
        const conversation = await getConversation(page.conversationId);
        if (!conversation || !isActive(token)) return makeSecondaryPage('\u7f16\u8f91\u8d44\u6599').main;
        return renderProfileEditorSurface({
            token,
            profile: conversation,
            displayName: contactFormalName(conversation),
            conversationId: conversation.conversationId,
        });
    };

    const bindSelectableMessage = (item, message, conversationId) => {
        const selectedForDeletion = messageSelection.has(conversationId, message.messageId);
        item.dataset.qqMessage = message.messageId;
        item.setAttribute('aria-selected', String(selectedForDeletion));
        item.classList.toggle('is-selected-for-delete', selectedForDeletion);
        if (isMessageSelectionMode(conversationId)) item.dataset.qqMessageSelectionToggle = message.messageId;
        if (selectedForDeletion) item.dataset.qqSelectedForDelete = 'true';
        const menuPayload = { conversationId, message };
        item.addEventListener('pointerdown', (event) => {
            if (!isMessageSelectionMode(conversationId)) messageMenu.handlePointerDown(event, menuPayload);
        });
        item.addEventListener('pointermove', (event) => messageMenu.handlePointerMove(event));
        item.addEventListener('pointerup', (event) => messageMenu.handlePointerEnd(event));
        item.addEventListener('pointercancel', (event) => messageMenu.handlePointerEnd(event));
        item.addEventListener('click', (event) => {
            if (messageMenu.handleClick(event) || !isMessageSelectionMode(conversationId)) return;
            event.preventDefault();
            event.stopPropagation();
            messageSelection.toggle(conversationId, message.messageId);
            void render();
        });
        item.addEventListener('contextmenu', (event) => {
            if (isMessageSelectionMode(conversationId)) {
                event.preventDefault();
                return;
            }
            messageMenu.handleContextMenu(event, menuPayload);
        });
        return item;
    };

    const openGeneratedImageViewer = (imagePath, altText = '') => {
        if (!asText(imagePath) || !viewport) return;
        const viewer = createElement('div', 'yuzi-qq-image-viewer');
        const image = createElement('img', 'yuzi-qq-image-viewer-image');
        image.src = asText(imagePath);
        image.alt = asText(altText) || '生成图片';
        const close = createButton('', 'yuzi-qq-image-viewer-close', { 'aria-label': '关闭图片查看' });
        close.append(createIcon('xmark'));
        close.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            clearOverlay();
        });
        viewer.append(image, close);
        showDialog({
            title: '',
            content: viewer,
            className: 'yuzi-qq-image-view-dialog',
        });
    };

    const messageNode = (message, conversation, allMessages, currentIdentity) => {
        const conversationId = conversation.conversationId;
        if (message.senderType === 'system' || message.type === 'system') {
            const item = createElement('article', 'yuzi-qq-message yuzi-qq-system-message-row');
            const system = createElement('p', 'yuzi-qq-system-message');
            system.textContent = message.content;
            item.append(system);
            return bindSelectableMessage(item, message, conversationId);
        }
        const own = message.senderType === 'self';
        const item = createElement('article', `yuzi-qq-message yuzi-qq-private-message${own ? ' is-self' : ''}`);
        const sender = own
            ? {
                formalName: asText(message.senderName) || currentIdentity.formalName,
                avatarAssetId: asText(message.senderAvatarAssetId) || currentIdentity.avatarAssetId,
                avatarUrl: currentIdentity.avatarUrl,
            }
            : {
                formalName: asText(message.senderName) || contactFormalName(conversation),
                avatarAssetId: asText(message.senderAvatarAssetId) || conversation.avatarAssetId,
            };
        const senderAvatar = avatar(
            sender,
            `yuzi-qq-avatar yuzi-qq-message-avatar yuzi-qq-private-message-avatar${own ? '' : ' yuzi-qq-avatar-button'}`,
            {
                interactive: !own,
                attributes: own ? {} : {
                    'aria-label': `打开${asText(sender.formalName) || '对方'}的用户资料`,
                    title: '打开用户资料',
                    'data-qq-profile': conversationId,
                },
            },
        );
        const stack = createElement('div', 'yuzi-qq-message-stack yuzi-qq-private-message-stack');
        let body;
        if (message.type === 'voice') {
            body = createElement('button', 'yuzi-qq-voice-message');
            body.type = 'button';
            body.dataset.qqVoice = message.messageId;
            body.setAttribute('aria-expanded', 'false');
            const summary = createElement('span', 'yuzi-qq-voice-summary');
            summary.append(createIcon('volume-high', 'yuzi-qq-voice-icon'));
            const duration = createElement('strong', 'yuzi-qq-voice-duration');
            duration.textContent = `${voiceDurationSeconds(message.content)}″`;
            summary.append(duration);
            const original = createElement('span', 'yuzi-qq-voice-original');
            original.textContent = message.content;
            body.append(summary, original);
        } else if (message.type === 'image') {
            const imagePath = normalizeGeneratedImagePath(message.generatedImagePath);
            const loading = imageGenerationController.isLoading(message.messageId);
            const descriptionText = asText(message.content) || '图片消息';
            body = createElement(
                'div',
                `yuzi-qq-generated-image-card${imagePath ? ' has-image' : ' is-placeholder'}${loading ? ' is-loading' : ''}`,
            );
            const media = createElement('div', 'yuzi-qq-generated-image-media');
            if (imagePath) {
                const viewerButton = createButton(
                    '',
                    'yuzi-qq-generated-image-viewer-button',
                    {
                        'aria-label': '点击放大查看图片',
                        title: '点击放大查看',
                        'data-qq-view-image': imagePath,
                        'data-qq-view-image-alt': descriptionText,
                    },
                );
                const image = createElement('img', 'yuzi-qq-generated-image');
                image.src = imagePath;
                image.alt = descriptionText;
                image.loading = 'lazy';
                viewerButton.append(image);
                media.append(viewerButton);
            } else {
                const visual = createElement('span', 'yuzi-qq-generated-image-placeholder');
                visual.append(createIcon('image'));
                const description = createElement('span', 'yuzi-qq-generated-image-description');
                description.textContent = descriptionText;
                visual.append(description);
                media.append(visual);
            }
            if (isImageGenerationEnabled() && !isMessageSelectionMode(conversationId)) {
                const action = createButton(
                    '',
                    `yuzi-qq-image-generate-button${imagePath ? ' yuzi-qq-image-regenerate-button' : ''}${loading ? ' is-loading' : ''}`,
                    {
                        'aria-label': imagePath ? '重新生成图片' : '生成图片',
                        'aria-busy': String(loading),
                        title: imagePath ? '重新生成' : '生成图片',
                        'data-qq-generate-image': message.messageId,
                        'data-qq-image-conversation-id': conversationId,
                    },
                );
                action.disabled = loading;
                action.append(createIcon(imagePath ? 'rotate' : 'wand-magic-sparkles'));
                ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'contextmenu'].forEach((eventName) => {
                    action.addEventListener(eventName, (event) => event.stopPropagation());
                });
                media.append(action);
            }
            body.append(media);
        } else if (message.type === 'video') {
            body = createElement('div', 'yuzi-qq-narrative-card is-video');
            const visual = createElement('span', 'yuzi-qq-narrative-visual');
            visual.append(createIcon('video'));
            const copy = createElement('span', 'yuzi-qq-narrative-copy');
            const label = createElement('strong', 'yuzi-qq-narrative-label');
            label.textContent = '视频';
            const description = createElement('span', 'yuzi-qq-narrative-description');
            description.textContent = asText(message.content) || '视频消息';
            copy.append(label, description);
            body.append(visual, copy);
        } else if (message.type === 'transfer') {
            body = createElement('button', 'yuzi-qq-transfer-card');
            body.type = 'button';
            body.dataset.qqTransfer = message.messageId;
            const transferIcon = createElement('span', 'yuzi-qq-transfer-icon');
            transferIcon.append(createIcon('wallet'));
            const copy = createElement('span', 'yuzi-qq-transfer-copy');
            const amount = createElement('strong', 'yuzi-qq-transfer-amount');
            amount.textContent = messageContent(message);
            const note = createElement('span', 'yuzi-qq-transfer-note');
            note.textContent = asText(message.transfer?.note) || '转账';
            const state = createElement('small', 'yuzi-qq-transfer-status');
            state.textContent = transferStatusLabel(message);
            copy.append(amount, note, state);
            body.append(transferIcon, copy);
        } else if (message.type === 'sticker') {
            body = stickerImage(message.stickerId, message.content || '[\u8868\u60c5]', 'yuzi-qq-sticker-message yuzi-qq-sticker-image');
        } else {
            body = createElement('span', 'yuzi-qq-message-bubble yuzi-qq-private-message-bubble');
            body.textContent = message.content;
        }
        stack.append(body);
        const lastSelf = [...allMessages].reverse().find((item) => item.senderType === 'self');
        if (conversation.request?.phase === 'failed' && own && lastSelf?.messageId === message.messageId) {
            stack.append(createButton('↻', 'yuzi-qq-retry-button', {
                'aria-label': '重试本批消息', title: '重试', 'data-qq-retry': conversation.conversationId,
            }));
        }
        if (conversation.request?.phase !== 'failed'
            && shouldShowUnansweredIndicator(allMessages, allMessages.indexOf(message))) {
            const unanswered = createElement('span', 'yuzi-qq-unanswered-indicator');
            unanswered.textContent = '已读不回';
            stack.append(unanswered);
        }
        item.append(senderAvatar, stack);
        return bindSelectableMessage(item, message, conversationId);
    };

    const renderMessageStream = (conversation, currentStoryTime, currentIdentity) => {
        const stream = createElement('section', 'yuzi-qq-message-stream yuzi-qq-private-message-stream');
        stream.dataset.qqMessageStream = conversation.conversationId;
        const data = getMessageState(conversation.conversationId);
        let previous = null;
        data.items.forEach((message) => {
            if (needsTimeDivider(previous, message)) {
                const divider = createElement('p', 'yuzi-qq-time-divider');
                divider.textContent = formatMessageTime(message.storyTime, currentStoryTime);
                divider.dataset.qqScrollKey = `divider:${message.messageId}`;
                stream.append(divider);
            }
            const node = messageNode(message, conversation, data.items, currentIdentity);
            node.dataset.qqScrollKey = `message:${message.messageId}`;
            stream.append(node);
            previous = message;
        });
        stream.addEventListener('scroll', () => {
            if (isScrollContainerNearBottom(stream) && jumpCounts.has(conversation.conversationId)) {
                jumpCounts.delete(conversation.conversationId);
                viewport?.querySelector('[data-qq-jump-latest]')?.remove();
            }
            if (stream.scrollTop > 28) return;
            const state = getMessageState(conversation.conversationId);
            if (!state.hasMore || stream.dataset.loading === 'true') return;
            stream.dataset.loading = 'true';
            void loadMessages(conversation.conversationId, {
                beforeSequence: state.nextBeforeSequence,
                prepend: true,
            }).then(() => render())
                .catch(report)
                .finally(() => { stream.dataset.loading = 'false'; });
        });
        return stream;
    };

    const renderComposer = (conversation) => {
        const form = createElement('form', 'yuzi-qq-composer yuzi-qq-private-composer yuzi-qq-private-chat-composer');
        form.dataset.qqComposer = conversation.conversationId;
        form.setAttribute('data-phone-bottom-bar', '');
        const toolBar = createElement('div', 'yuzi-qq-tool-bar yuzi-qq-private-composer-tools yuzi-qq-private-chat-tools');
        ['voice', 'image', 'video', 'transfer', 'emoji', 'plus'].forEach((type) => {
            const meta = TOOL_META[type];
            const button = createButton('', 'yuzi-qq-tool-button yuzi-qq-private-composer-tool yuzi-qq-private-chat-tool', {
                'aria-label': meta.label,
                title: meta.label,
                'data-qq-tool': type,
            });
            button.append(createQQFigmaIconElement(meta.figmaIcon || meta.icon, document, 'yuzi-qq-tool-icon'));
            if (!conversation.canSend || type === 'plus') button.disabled = !conversation.canSend || type === 'plus';
            toolBar.append(button);
        });
        const input = createElement('textarea', 'yuzi-qq-composer-input yuzi-qq-private-composer-input yuzi-qq-private-chat-composer-input');
        input.name = 'message';
        input.rows = 1;
        input.value = drafts.get(conversation.conversationId) || '';
        input.placeholder = conversation.canSend ? '发消息' : '该会话已只读';
        input.disabled = !conversation.canSend;
        input.setAttribute('aria-label', '消息输入框');
        input.addEventListener('input', () => {
            drafts.set(conversation.conversationId, input.value);
            composerAutoHeight.schedule(input);
        });
        input.addEventListener('focus', () => closeEmojiPanel());
        input.addEventListener('keydown', (event) => {
            if (!shouldSubmitComposerKey(event)) return;
            event.preventDefault();
            void submitComposer(conversation.conversationId, input.value);
        });
        const inputRow = createElement('div', 'yuzi-qq-composer-input-row yuzi-qq-private-composer-input-row');
        inputRow.append(input);
        if (conversation.request?.phase === 'queued' || conversation.request?.phase === 'running') {
            const stop = createButton('', 'yuzi-qq-stop-generation-button', {
                'aria-label': '终止 AI 生成',
                title: '终止 AI 生成',
                'data-qq-stop-generation': conversation.conversationId,
            });
            stop.append(createIcon('stop'));
            inputRow.append(stop);
        }
        form.append(inputRow, toolBar);
        return form;
    };

    const renderMessageSelectionBar = (conversation, { globalWorldbookEnabled = false } = {}) => {
        const conversationId = conversation.conversationId;
        const selectedCount = messageSelection.get(conversationId).length;
        const injectionAction = selectedMessagesInjectionAction({
            conversationId,
            selection: messageSelection,
            messages: selectableMessages(conversationId),
            globalEnabled: globalWorldbookEnabled,
            conversationEnabled: conversation.injection?.enabled === true,
        });
        const bar = createElement('section', 'yuzi-qq-composer yuzi-qq-message-selection-bar');
        bar.dataset.qqMessageSelectionBar = conversationId;
        bar.setAttribute('data-phone-bottom-bar', '');
        const primaryRow = createElement('div', 'yuzi-qq-message-selection-primary-row');
        const status = createElement('strong', 'yuzi-qq-message-selection-status');
        status.textContent = `已选择 ${selectedCount} 条`;
        const injection = createButton(
            injectionAction.label,
            'yuzi-qq-message-selection-injection-action',
            { 'data-qq-update-selected-injection': conversationId },
        );
        injection.disabled = !injectionAction.enabled;
        if (!globalWorldbookEnabled || conversation.injection?.enabled !== true) {
            injection.title = '请先开启世界书总闸和会话开关';
        }
        injection.addEventListener('click', async () => {
            injection.disabled = true;
            const result = await updateSelectedMessagesInjection({
                facade,
                conversationId,
                selection: messageSelection,
                messages: selectableMessages(conversationId),
                globalEnabled: globalWorldbookEnabled,
                conversationEnabled: conversation.injection?.enabled === true,
            });
            if (!result?.ok) {
                injection.disabled = !injectionAction.enabled;
                report(new Error(result?.error?.message || '更新注入条目失败'));
                return;
            }
            await loadMessages(conversationId);
            await render();
        });
        primaryRow.append(status, injection);
        const actions = createElement('div', 'yuzi-qq-message-selection-actions');
        const actionButton = (label, iconName, className = '') => {
            const button = createButton('', `yuzi-qq-message-selection-action${className ? ` ${className}` : ''}`, {
                'aria-label': label,
                title: label,
            });
            button.append(createIcon(iconName));
            return button;
        };
        const exit = actionButton('退出', 'xmark');
        exit.dataset.qqExitMessageSelection = conversationId;
        exit.addEventListener('click', () => {
            exitMessageSelection(conversationId);
            void render();
        });
        const selectAll = actionButton('全选', 'check-double');
        selectAll.dataset.qqSelectAllMessages = conversationId;
        selectAll.addEventListener('click', () => {
            messageSelection.selectAll(conversationId, selectableMessages(conversationId));
            void render();
        });
        const remove = actionButton('删除', 'trash', 'is-danger');
        remove.dataset.qqDeleteSelected = conversationId;
        remove.disabled = selectedCount === 0;
        remove.addEventListener('click', () => openSelectedMessageDeletion(conversationId));
        actions.append(exit, selectAll, remove);
        bar.append(primaryRow, actions);
        return bar;
    };

    const renderEmojiPanel = async (token) => {
        if (!emojiOpen) return null;
        const panel = createElement('section', 'yuzi-qq-emoji-panel yuzi-qq-private-emoji-panel');
        panel.setAttribute('aria-label', '表情面板');
        const resources = await facade.query.sharedResources();
        if (!isActive(token)) return panel;
        const upload = createButton('', 'yuzi-qq-emoji-item yuzi-qq-emoji-upload-item', {
            'aria-label': '上传表情',
            title: '上传表情',
            'data-qq-sticker-upload': '1',
        });
        upload.append(createIcon('plus'));
        panel.append(upload);
        asArray(resources?.stickers).forEach((sticker) => {
            const stickerId = asText(sticker.stickerId);
            if (!stickerId) return;
            const description = asText(sticker.description) || '[\u8868\u60c5]';
            const item = createButton('', 'yuzi-qq-emoji-item', {
                'aria-label': description,
                title: description,
                'data-qq-sticker': stickerId,
                'data-qq-sticker-text': description,
            });
            item.append(stickerImage(stickerId, description, 'yuzi-qq-emoji-image'));
            panel.append(item);
        });
        return panel;
    };

    const renderChat = async (token, { refreshMessages = true } = {}) => {
        const conversationId = page.conversationId;
        const selectionMode = isMessageSelectionMode(conversationId);
        const previousState = getMessageState(conversationId);
        const previousStream = viewport?.querySelector(`[data-qq-message-stream="${conversationId}"]`);
        const atBottom = !previousStream
            || isScrollContainerNearBottom(previousStream);
        const [conversation, currentContext, currentProfileResult, globalSettingsResult] = await Promise.all([
            getConversation(conversationId),
            getCurrentContext(),
            facade.query.currentProfile?.(),
            selectionMode ? facade.query.globalSettings?.() : Promise.resolve(null),
            refreshMessages ? loadMessages(conversationId) : Promise.resolve(previousState),
        ]);
        const main = createElement('main', 'yuzi-qq-view yuzi-qq-chat-view yuzi-qq-private-chat-view');
        if (!conversation || !isActive(token)) return main;
        if (selectionMode) main.classList.add('is-message-selection-mode');
        const nextState = getMessageState(conversationId);
        const jumpDelta = countIncomingJumpMessages(nextState.items, new Set(previousState.items.map((message) => message.messageId)), { atBottom });
        if (jumpDelta > 0) {
            jumpCounts.set(conversationId, (jumpCounts.get(conversationId) || 0) + jumpDelta);
        }
        main.append(makeChatHeader(conversation));
        const currentStoryTime = asText(currentContext.storyTime);
        const currentProfile = currentProfileResult?.ok ? asObject(currentProfileResult.profile) : {};
        const currentIdentity = {
            formalName: currentProfileName(currentContext),
            avatarAssetId: asText(currentProfile.avatarAssetId),
            avatarUrl: asText(currentContext.user?.avatar),
        };
        if (conversation.backgroundAssetId) {
            const mediaSession = leaseSessionFor(token)?.background;
            const applyBackground = (background) => {
                if (!background?.url || !isActive(token)) return;
                main.style.setProperty('--yuzi-qq-chat-background-image', `url("${background.url}")`);
                main.classList.add('has-chat-background');
            };
            const cached = mediaSession?.peek(conversation.backgroundAssetId);
            if (cached) applyBackground(cached);
            else void mediaSession?.load(conversation.backgroundAssetId).then(applyBackground).catch(() => {});
        }
        const stream = renderMessageStream(conversation, currentStoryTime, currentIdentity);
        const composer = selectionMode
            ? renderMessageSelectionBar(conversation, {
                globalWorldbookEnabled: globalSettingsResult?.settings?.worldbook?.enabled === true,
            })
            : renderComposer(conversation);
        const composerLayer = createElement('div', 'yuzi-qq-private-composer-layer');
        composerLayer.append(composer);
        const panel = selectionMode ? null : await renderEmojiPanel(token);
        if (panel) {
            main.classList.add('has-emoji-panel');
            composerLayer.append(panel);
        }
        main.append(stream, composerLayer);
        const jumpCount = jumpCounts.get(conversation.conversationId) || 0;
        if (jumpCount > 0) {
            const jump = createButton('', 'yuzi-qq-jump-button yuzi-qq-jump-bubble yuzi-qq-private-chat-jump-bubble', {
                'aria-label': `${formatUnreadBadge(jumpCount)} 条新消息，跳到最新消息`,
                'data-qq-jump-latest': conversation.conversationId,
            });
            const jumpLabel = createElement('span', 'yuzi-qq-jump-label yuzi-qq-private-chat-jump-label');
            jumpLabel.textContent = formatUnreadBadge(jumpCount);
            jump.append(jumpLabel);
            main.append(jump);
        }
        return main;
    };

    const renderCurrentProfileEditor = async (token) => {
        const [profileResult, context] = await Promise.all([
            facade.query.currentProfile(),
            getCurrentContext(),
        ]);
        if (!isActive(token) || !profileResult?.ok) return makeSecondaryPage('\u7f16\u8f91\u8d44\u6599').main;
        const profile = asObject(profileResult.profile);
        return renderProfileEditorSurface({
            token,
            profile,
            displayName: currentProfileName(context),
            current: true,
        });
    };

    const persistProfileEditorField = async (input) => {
        const field = input.dataset.qqProfileFieldInput;
        if (!PROFILE_FIELD_META[field]) return;
        const owner = input.dataset.qqProfileFieldOwner;
        const value = field === 'formalName' ? normalizeName(input.value) : asText(input.value);
        const result = owner === 'current'
            ? await facade.intent.updateCurrentProfile({ profile: { [field]: value } })
            : await facade.intent.updatePrivateProfile({
                conversationId: input.dataset.qqProfileFieldConversation,
                profile: { [field]: value },
            });
        const status = input.closest('.yuzi-qq-profile-editor-view')?.querySelector('[data-qq-profile-editor-status]');
        if (!result?.ok) {
            if (status) status.textContent = result?.error?.message || '\u4fdd\u5b58\u5931\u8d25';
            return;
        }
        input.value = value;
        if (status) status.textContent = '';
    };

    const renderConversationSettings = async (token) => {
        const [conversation, globalSettingsResult] = await Promise.all([
            getConversation(page.conversationId),
            facade.query.globalSettings(),
        ]);
        const { main, content } = makeSecondaryPage('\u804a\u5929\u8bbe\u7f6e', {
            className: 'yuzi-qq-conversation-settings-view',
            headerClassName: 'yuzi-qq-conversation-settings-header',
            titleClassName: 'yuzi-qq-conversation-settings-title',
        });
        if (!conversation || !isActive(token)) return main;
        if (!isActive(token)) return main;
        const globalWorldbook = asObject(globalSettingsResult?.settings?.worldbook);
        const injection = asObject(conversation.injection);
        const form = createElement('form', 'yuzi-qq-form yuzi-qq-conversation-settings-form');
        form.dataset.qqConversationSettingsForm = conversation.conversationId;
        const profileCard = createElement('div', 'yuzi-qq-conversation-settings-fields yuzi-qq-conversation-settings-profile-group');
        const remark = settingField('\u5907\u6ce8', 'remark', conversation.remark || '');
        const backgroundRow = createElement('div', 'yuzi-qq-field yuzi-qq-field-row yuzi-qq-field-group yuzi-qq-conversation-background-preview');
        const backgroundLabel = createElement('span', 'yuzi-qq-field-label yuzi-qq-conversation-background-label');
        backgroundLabel.textContent = '\u804a\u5929\u80cc\u666f';
        const backgroundActions = createElement('div', 'yuzi-qq-field-control yuzi-qq-conversation-background-actions');
        const uploadBackground = createButton('', 'yuzi-qq-icon-button yuzi-qq-conversation-background-upload', {
            'aria-label': '\u4e0a\u4f20\u804a\u5929\u80cc\u666f', title: '\u4e0a\u4f20\u804a\u5929\u80cc\u666f', 'data-qq-pick-background': conversation.conversationId,
        });
        uploadBackground.append(createIcon('upload'));
        backgroundActions.append(uploadBackground);
        if (conversation.backgroundAssetId) {
            const clearBackground = createButton('', 'yuzi-qq-icon-button yuzi-qq-conversation-background-delete', {
                'aria-label': '\u5220\u9664\u804a\u5929\u80cc\u666f', title: '\u5220\u9664\u804a\u5929\u80cc\u666f', 'data-qq-clear-chat-background': conversation.conversationId,
            });
            clearBackground.append(createIcon('trash'));
            backgroundActions.append(clearBackground);
        }
        backgroundRow.append(backgroundLabel, backgroundActions);
        const injectionEnabled = settingField('\u542f\u7528\u4f1a\u8bdd\u4e16\u754c\u4e66\u6ce8\u5165', 'enabled', injection.enabled, 'checkbox');
        const enabledInput = injectionEnabled.querySelector('input');
        enabledInput.disabled = globalWorldbook.enabled !== true;
        profileCard.append(remark, backgroundRow, injectionEnabled);

        const injectionCard = createElement('div', 'yuzi-qq-conversation-settings-fields yuzi-qq-conversation-settings-injection-group');
        const useConversationLight = settingField('\u4f7f\u7528\u672c\u4f1a\u8bdd\u8bbe\u7f6e\uff08\u706f\u8272\uff09', 'useConversationLight', injection.useConversationLight === true, 'checkbox');
        const light = settingSelect('\u706f\u8272', 'light', injection.light === 'green' ? 'green' : 'blue', [
            ['blue', '\u84dd\u706f'],
            ['green', '\u7eff\u706f'],
        ]);
        const useConversationDepth = settingField('\u4f7f\u7528\u672c\u4f1a\u8bdd\u8bbe\u7f6e\uff08\u6df1\u5ea6\uff09', 'useConversationDepth', injection.useConversationDepth === true, 'checkbox');
        const depth = settingField('\u6df1\u5ea6', 'depth', injection.depth, 'number');
        depth.querySelector('input')?.setAttribute('min', '0');
        const keywords = settingField('\u5173\u952e\u8bcd', 'keywords', asArray(injection.keywords).join('\u3001'));
        keywords.setAttribute('data-qq-conversation-worldbook-keywords', '1');
        const status = createElement('p', 'yuzi-qq-settings-status');
        status.dataset.qqConversationSettingsStatus = conversation.conversationId;
        const syncInjectionFields = () => {
            const localLight = useConversationLight.querySelector('input')?.checked === true;
            const localDepth = useConversationDepth.querySelector('input')?.checked === true;
            const currentLight = asText(light.querySelector('select')?.value);
            light.querySelector('select').disabled = !localLight;
            depth.querySelector('input').disabled = !localDepth;
            const keywordsVisible = localLight && currentLight === 'green';
            keywords.hidden = !keywordsVisible;
            keywords.querySelector('input').disabled = !keywordsVisible;
        };
        const persist = async () => {
            const nextDepth = Number(depth.querySelector('input')?.value);
            if (!Number.isInteger(nextDepth) || nextDepth < 0) {
                status.textContent = '\u6df1\u5ea6\u5fc5\u987b\u662f 0 \u6216\u66f4\u5927\u7684\u6574\u6570';
                return;
            }
            const profileResult = await facade.intent.updatePrivateProfile({
                conversationId: conversation.conversationId,
                profile: { remark: asText(remark.querySelector('input')?.value) },
            });
            if (!profileResult?.ok) {
                status.textContent = profileResult?.error?.message || '\u4fdd\u5b58\u5931\u8d25';
                return;
            }
            const injectionResult = await facade.intent.setConversationInjection({
                conversationId: conversation.conversationId,
                injection: {
                    enabled: enabledInput.checked === true,
                    useConversationLight: useConversationLight.querySelector('input')?.checked === true,
                    useConversationDepth: useConversationDepth.querySelector('input')?.checked === true,
                    light: asText(light.querySelector('select')?.value) || 'blue',
                    depth: nextDepth,
                    keywords: settingKeywords(keywords.querySelector('input')?.value),
                },
            });
            status.textContent = injectionResult?.ok ? '' : (injectionResult?.error?.message || '\u4fdd\u5b58\u5931\u8d25');
        };
        [useConversationLight, useConversationDepth, light].forEach((field) => {
            field.querySelector('input, select')?.addEventListener('change', syncInjectionFields);
        });
        form.addEventListener('change', () => { void persist(); });
        syncInjectionFields();
        injectionCard.append(useConversationLight, light, useConversationDepth, depth, keywords);
        form.append(profileCard, injectionCard, status);
        content.append(form);
        return main;
    };

    const renderSettingsRoot = () => {
        const main = createElement('main', 'yuzi-qq-view yuzi-qq-settings-view yuzi-qq-settings-root-view');
        main.append(makeHeader('\u8bbe\u7f6e', {
            back: false,
            className: 'yuzi-qq-settings-root-header',
            titleClassName: 'yuzi-qq-settings-root-title',
        }));
        const groups = createElement('div', 'yuzi-qq-settings-root-groups');
        [QQ_SETTINGS_GROUPS.slice(0, 2), QQ_SETTINGS_GROUPS.slice(2)].forEach((items) => {
            const sheet = createElement('section', 'yuzi-qq-settings-sheet yuzi-qq-settings-root-sheet');
            const list = createElement('div', 'yuzi-qq-settings-list yuzi-qq-settings-root-list');
            items.forEach(({ title, kind }) => {
                const row = createButton('', 'yuzi-qq-setting-row yuzi-qq-settings-root-row', { 'data-qq-settings': kind });
                const label = createElement('span', 'yuzi-qq-settings-root-label');
                label.textContent = title;
                const arrow = createElement('span', 'yuzi-qq-setting-arrow yuzi-qq-settings-root-arrow');
                arrow.append(createIcon('chevron-right'));
                row.append(label, arrow);
                list.append(row);
            });
            sheet.append(list);
            groups.append(sheet);
        });
        main.append(groups);
        return main;
    };

    const settingField = (label, name, value, type = 'text') => {
        const isCheckbox = type === 'checkbox';
        const field = createElement('label', [
            'yuzi-qq-field',
            'yuzi-qq-field-row',
            'yuzi-qq-field-group',
            isCheckbox ? 'is-checkbox' : 'is-control-stacked',
            `is-${type}`,
        ].join(' '));
        const labelText = createElement('span', 'yuzi-qq-field-label');
        labelText.textContent = label;
        const input = createElement('input', `yuzi-qq-field-control yuzi-qq-field-input${isCheckbox ? ' yuzi-qq-checkbox' : ''}`);
        input.name = name;
        input.type = type;
        if (isCheckbox) input.checked = value === true;
        else input.value = value ?? '';
        field.append(labelText, input);
        return field;
    };

    const settingSelect = (label, name, value, options) => {
        const field = createElement('label', 'yuzi-qq-field yuzi-qq-field-row yuzi-qq-field-group is-control-stacked is-select');
        const labelText = createElement('span', 'yuzi-qq-field-label');
        labelText.textContent = label;
        const select = createElement('select', 'yuzi-qq-field-control yuzi-qq-field-select');
        select.name = name;
        asArray(options).forEach(([optionValue, optionLabel]) => {
            const option = createElement('option');
            option.value = optionValue;
            option.textContent = optionLabel;
            option.selected = optionValue === value;
            select.append(option);
        });
        field.append(labelText, select);
        return field;
    };

    const renderImageLibrary = async (token) => {
        const packAction = createButton('', 'yuzi-qq-icon-button yuzi-qq-image-library-pack-action', {
            'aria-label': '导入或导出图片资料', title: '导入或导出', 'aria-haspopup': 'menu',
            'aria-expanded': 'false', 'data-qq-image-library-pack-menu': '1',
        });
        packAction.append(createIcon('arrow-right-arrow-left'));
        const deleteAction = createButton('', 'yuzi-qq-icon-button yuzi-qq-image-library-delete-action', {
            'aria-label': '\u5220\u9664\u5df2\u9009\u8d44\u6e90', title: '\u5220\u9664', 'data-qq-image-library-delete': '1',
        });
        deleteAction.append(createIcon('trash'));
        const { main, content } = makeSecondaryPage('\u56fe\u7247\u8d44\u6599', {
            actions: [packAction, deleteAction],
            className: 'yuzi-qq-settings-view yuzi-qq-image-library-view',
            headerClassName: 'yuzi-qq-image-library-header',
            titleClassName: 'yuzi-qq-image-library-title',
        });
        const stores = [
            { library: 'avatar', title: '\u5934\u50cf' },
            { library: 'profile-background', title: '\u8d44\u6599\u80cc\u666f' },
            { library: 'chat-background', title: '\u804a\u5929\u80cc\u666f' },
            { library: 'sticker', title: '\u8868\u60c5\u4ed3\u5e93', sticker: true },
        ];
        const results = await Promise.all(stores.map(({ library, sticker }) => (
            sticker ? facade.query.sharedResources() : facade.query.imageLibrary({ library })
        )));
        if (!isActive(token)) return main;
        const cards = stores.map((store, index) => ({
            ...store,
            assets: results[index]?.ok
                ? asArray(store.sticker ? results[index].stickers : results[index].assets)
                : [],
        }));
        const availableAssetIds = new Set(cards
            .filter((store) => !store.sticker)
            .flatMap(({ assets }) => assets.map((asset) => asText(asset.assetId)).filter(Boolean)));
        const availableStickerIds = new Set(cards
            .filter((store) => store.sticker)
            .flatMap(({ assets }) => assets.map((asset) => asText(asset.stickerId)).filter(Boolean)));
        [...selectedImageAssetIds].forEach((assetId) => {
            if (!availableAssetIds.has(assetId)) selectedImageAssetIds.delete(assetId);
        });
        [...selectedStickerIds].forEach((stickerId) => {
            if (!availableStickerIds.has(stickerId)) selectedStickerIds.delete(stickerId);
        });
        const syncSelection = () => {
            main.classList.toggle('is-selection-mode', imageLibrarySelectionMode);
            deleteAction.disabled = selectedImageAssetIds.size + selectedStickerIds.size === 0;
            main.querySelectorAll('[data-qq-image-library-item]').forEach((item) => {
                item.classList.toggle('is-selected', selectedImageAssetIds.has(item.dataset.qqImageLibraryItem));
            });
            main.querySelectorAll('[data-qq-sticker-library-item]').forEach((item) => {
                item.classList.toggle('is-selected', selectedStickerIds.has(item.dataset.qqStickerLibraryItem));
            });
        };
        cards.forEach(({ library, title, sticker, assets }) => {
            const card = createElement('section', 'yuzi-qq-image-library-card');
            card.setAttribute('aria-label', title);
            const heading = createElement('h2', 'yuzi-qq-image-library-heading');
            heading.textContent = title;
            const grid = createElement('div', 'yuzi-qq-image-library-grid');
            assets.forEach((asset) => {
                const resourceId = asText(sticker ? asset.stickerId : asset.assetId);
                if (!resourceId) return;
                const selectedIds = sticker ? selectedStickerIds : selectedImageAssetIds;
                const item = createButton('', 'yuzi-qq-image-library-item', {
                    'aria-label': sticker ? '\u9009\u62e9\u8868\u60c5' : '\u9009\u62e9\u56fe\u7247',
                    [sticker ? 'data-qq-sticker-library-item' : 'data-qq-image-library-item']: resourceId,
                });
                let longPressed = false;
                let longPressTimer = null;
                const clearLongPress = () => {
                    if (longPressTimer !== null) clearTimeout(longPressTimer);
                    longPressTimer = null;
                };
                item.addEventListener('pointerdown', (event) => {
                    if (event.button !== undefined && event.button !== 0) return;
                    longPressed = false;
                    clearLongPress();
                    longPressTimer = setTimeout(() => {
                        longPressTimer = null;
                        longPressed = true;
                        imageLibrarySelectionMode = true;
                        selectedIds.add(resourceId);
                        syncSelection();
                    }, 480);
                });
                ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => item.addEventListener(type, clearLongPress));
                item.addEventListener('click', (event) => {
                    event.stopPropagation();
                    if (longPressed) {
                        longPressed = false;
                        return;
                    }
                    if (!imageLibrarySelectionMode) return;
                    if (selectedIds.has(resourceId)) selectedIds.delete(resourceId);
                    else selectedIds.add(resourceId);
                    syncSelection();
                });
                if (sticker) {
                    item.append(stickerImage(resourceId, asText(asset.description), 'yuzi-qq-image-library-sticker'));
                } else {
                    const image = createElement('img');
                    image.alt = '';
                    item.append(image);
                    const mediaSession = leaseSessionFor(token)?.media;
                    const cached = mediaSession?.peek(resourceId);
                    if (cached?.url) image.src = cached.url;
                    else void mediaSession?.load(resourceId).then((render) => {
                        if (!render?.url || !isActive(token) || !image.isConnected) return;
                        image.src = render.url;
                    }).catch(() => {});
                }
                grid.append(item);
            });
            const upload = createButton('', 'yuzi-qq-image-library-item yuzi-qq-image-library-upload-action', sticker
                ? { 'aria-label': '\u4e0a\u4f20\u8868\u60c5', title: '\u4e0a\u4f20\u8868\u60c5', 'data-qq-sticker-upload': '1' }
                : { 'aria-label': '\u4e0a\u4f20\u56fe\u7247', title: '\u4e0a\u4f20\u56fe\u7247', 'data-qq-image-library-upload': library });
            upload.append(createIcon('arrow-up-from-bracket'));
            grid.append(upload);
            card.append(heading, grid);
            content.append(card);
        });
        syncSelection();
        return main;
    };
    const renderSettingsDetail = async (token) => {
        const kind = page.kind;
        if (kind === 'image-library') return renderImageLibrary(token);
        const group = qqSettingsGroup(kind);
        const { main, content } = makeSecondaryPage(group?.title || '\u8bbe\u7f6e', {
            className: 'yuzi-qq-settings-view yuzi-qq-settings-detail-view',
            headerClassName: 'yuzi-qq-settings-detail-header',
            titleClassName: 'yuzi-qq-settings-detail-title',
        });
        const [model, resourcesResult, worldbooksResult] = await Promise.all([
            loadQQSettingsModel(facade),
            kind === 'reply'
                ? Promise.resolve().then(() => facade.query.sharedResources()).catch((error) => ({ ok: false, error }))
                : Promise.resolve(null),
            kind === 'worldbook'
                ? Promise.resolve().then(() => facade.query.worldbooks()).catch((error) => ({ ok: false, error }))
                : Promise.resolve(null),
        ]);
        if (!isActive(token)) return main;
        if (!group || !model?.ok) {
            const status = createElement('p', 'yuzi-qq-settings-status');
            status.textContent = model?.error?.message || '\u8bfb\u53d6\u8bbe\u7f6e\u5931\u8d25';
            content.append(status);
            return main;
        }
        if (kind === 'reply' && !resourcesResult?.ok) {
            const status = createElement('p', 'yuzi-qq-settings-status');
            status.textContent = resourcesResult?.error?.message || '\u8bfb\u53d6\u9884\u8bbe\u8d44\u6e90\u5931\u8d25';
            content.append(status);
            return main;
        }
        if (kind === 'worldbook' && !worldbooksResult?.ok) {
            const status = createElement('p', 'yuzi-qq-settings-status');
            status.textContent = worldbooksResult?.error?.message || '\u8bfb\u53d6\u4e16\u754c\u4e66\u8d44\u6e90\u5931\u8d25';
            content.append(status);
            return main;
        }
        const settings = model.settings;
        const form = createElement('form', 'yuzi-qq-form yuzi-qq-settings-form yuzi-qq-settings-detail-form');
        form.dataset.qqSettingsForm = kind;
        form.dataset.qqSettingsScopeId = model.scopeId;
        if (kind === 'reply') {
            const resources = resourcesResult;
            const apiOptions = [['', '\u672a\u9009\u62e9']].concat(asArray(resources.apiPresets).map((preset) => [
                asText(preset.presetId), asText(preset.name) || asText(preset.presetId),
            ]));
            const promptOptions = asArray(resources.promptPresets).map((preset) => [
                asText(preset.presetId), asText(preset.name) || asText(preset.presetId),
            ]);
            const proactiveToggle = settingField('\u542f\u7528\u4e3b\u52a8\u6d88\u606f', 'enabled', settings.proactive.enabled, 'checkbox');
            const proactiveFields = createElement('div', 'yuzi-qq-settings-proactive-fields');
            proactiveFields.setAttribute('data-qq-settings-proactive-fields', '1');
            const everyTurns = settingField('\u6bcf\u9694\u591a\u5c11\u8f6e', 'everyTurns', settings.proactive.everyTurns, 'number');
            everyTurns.querySelector('input')?.setAttribute('min', '1');
            proactiveFields.append(
                everyTurns,
                settingSelect('\u79c1\u804a\u4e3b\u52a8\u9884\u8bbe', 'privateProactivePresetId', settings.privateProactivePresetId, promptOptions),
            );
            const syncProactiveFields = () => {
                proactiveFields.hidden = proactiveToggle.querySelector('input')?.checked !== true;
            };
            proactiveToggle.querySelector('input')?.addEventListener('change', syncProactiveFields);
            syncProactiveFields();
            form.append(
                settingSelect('API \u9884\u8bbe', 'activeApiPresetId', settings.activeApiPresetId, apiOptions),
                settingSelect('\u79c1\u804a\u56de\u590d\u9884\u8bbe', 'privateReplyPresetId', settings.privateReplyPresetId, promptOptions),
                proactiveToggle,
                proactiveFields,
            );
        } else if (kind === 'context') {
            const hostContext = settingField('\u5bbf\u4e3b\u4e0a\u4e0b\u6587\u6761\u6570', 'hostContextTurns', settings.hostContextTurns, 'number');
            const privateHistory = settingField('\u79c1\u804a\u5386\u53f2\u6761\u6570', 'conversationHistoryLimit', settings.conversationHistoryLimit, 'number');
            hostContext.querySelector('input')?.setAttribute('min', '0');
            privateHistory.querySelector('input')?.setAttribute('min', '0');
            form.append(hostContext, privateHistory);
        } else if (kind === 'worldbook') {
            const timeWindow = settings.worldbook.timeWindow;
            const worldbookOptions = [['', '\u672a\u9009\u62e9']].concat(asArray(worldbooksResult?.worldbooks).map((worldbook) => [
                asText(worldbook.bookName), asText(worldbook.bookName),
            ]));
            const lightField = settingSelect('\u706f\u8272', 'light', settings.worldbook.light, [
                ['blue', '\u84dd\u706f'],
                ['green', '\u7eff\u706f'],
            ]);
            const keywordField = settingField('\u5173\u952e\u8bcd', 'keywords', settings.worldbook.keywords.join('\u3001'));
            keywordField.setAttribute('data-qq-worldbook-keywords', '1');
            const relativeValue = settingField('\u65f6\u95f4\u8303\u56f4', 'timeWindowValue', timeWindow.value, 'number');
            relativeValue.querySelector('input')?.setAttribute('min', '1');
            const syncWorldbookKeywords = () => {
                const light = asText(lightField.querySelector('select')?.value);
                const keywordsVisible = light === 'green';
                keywordField.hidden = !keywordsVisible;
            };
            lightField.querySelector('select')?.addEventListener('change', syncWorldbookKeywords);
            syncWorldbookKeywords();
            form.append(
                settingField('\u542f\u7528\u4e16\u754c\u4e66\u6ce8\u5165', 'enabled', settings.worldbook.enabled, 'checkbox'),
                settingSelect('\u6ce8\u5165\u4e16\u754c\u4e66', 'bookName', settings.worldbook.bookName, worldbookOptions),
                settingSelect('\u65f6\u95f4\u8303\u56f4', 'timeWindowMode', timeWindow.mode, [
                    ['relative', '\u6700\u8fd1\u4e00\u6bb5\u65f6\u95f4'],
                    ['all', '\u5168\u90e8\u6d88\u606f'],
                ]),
                relativeValue,
                settingSelect('\u8303\u56f4\u5355\u4f4d', 'timeWindowUnit', timeWindow.unit, [
                    ['hour', '\u5c0f\u65f6'],
                    ['day', '\u5929'],
                    ['month', '\u6708'],
                    ['year', '\u5e74'],
                ]),
                lightField,
                settingField('\u6df1\u5ea6', 'depth', settings.worldbook.depth, 'number'),
                keywordField,
            );
        }
        const status = createElement('p', 'yuzi-qq-settings-status');
        status.dataset.qqSettingsStatus = kind;
        form.append(status);
        content.append(form);
        return main;
    };

    const renderAssistant = async (token) => {
        const main = createElement('main', 'yuzi-qq-view yuzi-qq-list-view yuzi-qq-assistant-view yuzi-qq-assistant-root-view');
        const add = createElement('span', 'yuzi-qq-identity-action yuzi-qq-assistant-add-visual');
        add.setAttribute('aria-hidden', 'true');
        add.append(createIcon('plus'));
        main.append(await makeRootIdentityHeader(token, '助手', {
            action: add,
            className: 'yuzi-qq-assistant-root-header',
            titleClassName: 'yuzi-qq-assistant-root-title',
            statusClassName: 'yuzi-qq-assistant-root-status',
            actionsClassName: 'yuzi-qq-assistant-root-actions',
        }));
        if (!isActive(token)) return main;
        const sheet = createElement('section', 'yuzi-qq-list-sheet yuzi-qq-assistant-list-sheet yuzi-qq-assistant-root-sheet');
        const search = createElement('div', 'yuzi-qq-search yuzi-qq-assistant-root-search');
        search.append(createIcon('magnifying-glass', 'yuzi-qq-search-icon'));
        const searchLabel = createElement('span');
        searchLabel.textContent = '搜索';
        search.append(searchLabel);
        search.setAttribute('aria-hidden', 'true');
        sheet.append(search, createElement('div', 'yuzi-qq-assistant-empty'));
        main.append(sheet);
        return main;
    };

    const renderPage = async (token) => {
        const refreshMessages = leaseSessionFor(token)?.refreshMessages !== false;
        if (page?.type === 'chat') return renderChat(token, { refreshMessages });
        if (page?.type === 'conversation-settings') return renderConversationSettings(token);
        if (page?.type === 'profile') return renderProfile(token);
        if (page?.type === 'profile-edit') return renderProfileEditor(token);
        if (page?.type === 'current-profile') return renderCurrentProfile(token);
        if (page?.type === 'current-profile-edit') return renderCurrentProfileEditor(token);
        if (page?.type === 'settings') return renderSettingsDetail(token);
        if (tab === 'messages') return renderMessagesRoot(token);
        if (tab === 'contacts') return renderContactsRoot(token);
        if (tab === 'assistant') return renderAssistant();
        return renderSettingsRoot();
    };

    const isSnapshotEligibleView = (viewKey) => (
        viewKey === 'tab:messages'
        || viewKey.startsWith('page:chat:')
        || viewKey.startsWith('page:conversation-settings:')
    );

    const isBottomTabView = (viewKey) => viewKey.startsWith('tab:');

    const createImmediateFrame = () => {
        if (page?.type === 'chat') {
            const conversation = conversationSnapshots.get(page.conversationId);
            const main = createElement('main', 'yuzi-qq-view yuzi-qq-chat-view yuzi-qq-private-chat-view');
            main.append(conversation
                ? makeChatHeader(conversation)
                : makeHeader('\u804a\u5929', { back: true, className: 'yuzi-qq-chat-header yuzi-qq-private-chat-header' }));
            return main;
        }
        if (page?.type === 'conversation-settings') {
            return makeSecondaryPage('\u804a\u5929\u8bbe\u7f6e', {
                className: 'yuzi-qq-conversation-settings-view',
                headerClassName: 'yuzi-qq-conversation-settings-header',
                titleClassName: 'yuzi-qq-conversation-settings-title',
            }).main;
        }
        if (page?.type === 'profile' || page?.type === 'current-profile') {
            const main = createElement('main', 'yuzi-qq-view yuzi-qq-profile-view yuzi-qq-profile-page');
            main.append(makeProfileTop());
            return main;
        }
        if (page) {
            const group = page.type === 'settings' ? qqSettingsGroup(page.kind) : null;
            return makeSecondaryPage(group?.title || '\u8bbe\u7f6e').main;
        }
        if (tab === 'settings') return renderSettingsRoot();
        const title = TABS.find(([id]) => id === tab)?.[1] || '\u6d88\u606f';
        const rootName = tab === 'messages' ? 'message' : tab === 'contacts' ? 'contact' : tab;
        const main = createElement('main', `yuzi-qq-view yuzi-qq-list-view yuzi-qq-${rootName}-root-view`);
        main.append(makeHeader(title));
        return main;
    };

    const detachViewport = () => {
        const holder = createElement('div');
        holder.append(...viewport.children);
        return holder;
    };

    const prepareImmediateView = (targetViewKey, outgoingScrollSnapshot) => {
        if (displayedViewKey === targetViewKey) {
            return { scrollSnapshot: outgoingScrollSnapshot, deferred: false };
        }

        const cached = isSnapshotEligibleView(targetViewKey)
            ? viewSnapshotCache.take(targetViewKey)
            : null;
        if (isBottomTabView(targetViewKey) && displayedViewKey && !cached) {
            return { scrollSnapshot: null, deferred: true };
        }

        if (displayedViewKey && isSnapshotEligibleView(displayedViewKey)) {
            viewSnapshotCache.store(displayedViewKey, {
                holder: detachViewport(),
                scrollSnapshot: outgoingScrollSnapshot,
            });
        } else {
            viewport.replaceChildren();
        }

        if (cached?.holder) {
            viewport.replaceChildren(...cached.holder.children);
        } else {
            viewport.replaceChildren(createImmediateFrame());
            if (!page) viewport.append(makeNav());
        }
        displayedViewKey = targetViewKey;
        return { scrollSnapshot: cached?.scrollSnapshot || null, deferred: false };
    };

    const render = async ({ preserveEmoji = false, refreshMessages = true } = {}) => {
        const scrollSnapshot = viewScrollState.capture();
        composerAutoHeight.cancel();
        const token = ++renderEpoch;
        const leaseSessions = {
            media: mediaRenderLeases.begin(),
            background: backgroundRenderLeases.begin(),
            avatars: avatarRenderLeases.begin(),
            stickers: stickerRenderLeases.begin(),
            refreshMessages,
        };
        renderLeaseSessions.set(token, leaseSessions);
        clearOverlay();
        if (!preserveEmoji) closeEmojiPanel({ preserveScroll: false });
        const targetViewKey = requestedViewKey();
        const immediateSnapshot = prepareImmediateView(targetViewKey, scrollSnapshot);
        const nextScrollSnapshot = immediateSnapshot.scrollSnapshot || (page?.type === 'chat' ? {
            scopeKey: currentScopeKey(),
            viewKey: targetViewKey,
            registrationKey: 'private-chat',
            state: { mode: 'bottom' },
        } : null);
        if (nextScrollSnapshot) viewScrollState.restore(nextScrollSnapshot, { token, isCurrent: isActive });
        try {
            const content = await renderPage(token);
            if (!isActive(token) || !viewport) {
                await Promise.all([
                    leaseSessions.media.abort(),
                    leaseSessions.background.abort(),
                    leaseSessions.avatars.abort(),
                    leaseSessions.stickers.abort(),
                ]);
                return;
            }
            if (immediateSnapshot.deferred && displayedViewKey && isSnapshotEligibleView(displayedViewKey)) {
                viewSnapshotCache.store(displayedViewKey, {
                    holder: detachViewport(),
                    scrollSnapshot,
                });
            }
            viewport.replaceChildren(content);
            if (!page) viewport.append(makeNav());
            composerAutoHeight.schedule(viewport.querySelector('.yuzi-qq-composer-input'));
            displayedViewKey = targetViewKey;
            await Promise.all([
                leaseSessions.media.commit(),
                leaseSessions.background.commit(),
                leaseSessions.avatars.commit(),
                leaseSessions.stickers.commit(),
            ]);
            viewScrollState.restore(nextScrollSnapshot, { token, isCurrent: isActive });
        } catch (error) {
            await Promise.all([
                leaseSessions.media.abort(),
                leaseSessions.background.abort(),
                leaseSessions.avatars.abort(),
                leaseSessions.stickers.abort(),
            ]);
            throw error;
        } finally {
            renderLeaseSessions.delete(token);
        }
    };

    const submitComposer = async (conversationId, value) => {
        const submission = normalizeComposerSubmission(value);
        if (!submission.ok) return;
        const result = await facade.intent.sendMessage({
            conversationId,
            message: { type: 'text', content: submission.content },
        });
        if (!result?.ok) {
            report(new Error(result?.error?.message || '发送失败'));
            return;
        }
        drafts.delete(conversationId);
        await loadMessages(conversationId);
        await render();
    };

    const openAddContactForm = () => {
        const content = createElement('div', 'yuzi-qq-dialog-form yuzi-qq-add-contact-form');
        const input = createElement('input', 'yuzi-qq-add-contact-name-input');
        input.placeholder = '联系人名字';
        input.maxLength = 128;
        input.setAttribute('aria-label', '联系人名字');
        const error = createElement('p', 'yuzi-qq-form-error yuzi-qq-add-contact-error');
        const confirm = createButton('创建联系人', 'yuzi-qq-primary-button');
        confirm.disabled = true;
        const cancel = createButton('取消', 'yuzi-qq-secondary-button');
        const syncEnabled = () => {
            confirm.disabled = input.value.trim().length === 0;
        };
        input.addEventListener('input', syncEnabled);
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (!confirm.disabled) confirm.click();
            }
        });
        cancel.addEventListener('click', clearOverlay);
        confirm.addEventListener('click', async () => {
            const result = await facade.intent.createPrivateConversation({ name: input.value });
            if (!result?.ok) {
                error.textContent = result?.error?.message || '创建失败，请检查名字';
                return;
            }
            clearOverlay();
            if (result?.result?.created === false) {
                return go({ type: 'profile', conversationId: result.result.conversation.conversationId });
            }
            tab = 'messages';
            page = null;
            await render();
        });
        content.append(input, error);
        showDialog({ title: '添加联系人', content, actions: [cancel, confirm], className: 'yuzi-qq-add-contact-dialog' });
        input.focus();
    };

    const openAddContact = (anchor) => {
        const menu = createElement('div', 'yuzi-qq-dialog-menu yuzi-qq-message-add-menu');
        const rows = [
            ['创建群聊', 'message'],
            ['创建频道', 'hashtag'],
            ['加好友/群', 'user-plus'],
        ];
        rows.forEach(([label, iconName], index) => {
            const isContactAction = index === rows.length - 1;
            const item = isContactAction
                ? createButton('', 'yuzi-qq-dialog-menu-item yuzi-qq-message-add-menu-item yuzi-qq-message-add-contact-action', {
                    'data-qq-add-contact-menu': '1',
                })
                : createElement('div', 'yuzi-qq-dialog-menu-item yuzi-qq-message-add-menu-item yuzi-qq-message-add-visual');
            const labelNode = createElement('span', 'yuzi-qq-message-add-menu-label');
            labelNode.textContent = label;
            item.append(createIcon(iconName, 'yuzi-qq-message-add-menu-icon'), labelNode);
            if (isContactAction) item.addEventListener('click', openAddContactForm);
            else item.setAttribute('aria-hidden', 'true');
            menu.append(item);
        });
        showAnchoredMenu(anchor, menu);
    };

    const confirmFriendRemoval = (conversationId) => {
        const content = createElement('div', 'yuzi-qq-confirm-copy yuzi-qq-remove-friend-copy');
        const illustration = createElement('span', 'yuzi-qq-dialog-illustration');
        illustration.textContent = '!';
        const copy = createElement('p');
        copy.textContent = '删除后将从联系人中移除，对话记录会保留为只读。';
        content.append(illustration, copy);
        const cancel = createButton('取消', 'yuzi-qq-secondary-button');
        cancel.addEventListener('click', clearOverlay);
        const confirm = createButton('删除好友', 'yuzi-qq-danger-button');
        confirm.addEventListener('click', async () => {
            confirm.disabled = true;
            const result = await facade.intent.removePrivateFriend({ conversationId });
            if (!result?.ok) {
                confirm.disabled = false;
                copy.textContent = '删除失败，请重试';
                return;
            }
            clearOverlay();
            tab = 'contacts';
            page = null;
            await render();
        });
        showDialog({ title: '删除好友', content, actions: [cancel, confirm], className: 'yuzi-qq-confirm-dialog yuzi-qq-remove-friend-dialog' });
    };

    const confirmConversationDeletion = (conversationId) => {
        const content = createElement('div', 'yuzi-qq-confirm-copy yuzi-qq-delete-conversation-copy');
        const illustration = createElement('span', 'yuzi-qq-dialog-illustration');
        illustration.textContent = '!';
        const copy = createElement('p');
        copy.textContent = '确定删除该会话吗？删除后不可恢复';
        content.append(illustration, copy);
        const cancel = createButton('取消', 'yuzi-qq-secondary-button');
        cancel.addEventListener('click', clearOverlay);
        const confirm = createButton('删除', 'yuzi-qq-danger-button');
        let deleting = false;
        confirm.addEventListener('click', async () => {
            if (deleting) return;
            deleting = true;
            cancel.disabled = true;
            confirm.disabled = true;
            confirm.textContent = '删除中…';
            const result = await facade.intent.deleteConversation({ conversationId });
            if (!result?.ok || result.result?.deleted !== true) {
                deleting = false;
                cancel.disabled = false;
                confirm.disabled = false;
                confirm.textContent = '删除';
                copy.textContent = '删除失败，请重试';
                return;
            }
            clearOverlay();
            openSwipeConversationId = '';
            tab = 'messages';
            page = null;
            await render();
        });
        showDialog({
            title: '删除会话', content, actions: [cancel, confirm], dismissible: false, className: 'yuzi-qq-confirm-dialog yuzi-qq-delete-conversation-dialog',
        });
    };

    const sendNarrativeMessage = async (conversationId, type, content) => {
        const result = await submitNarrativeMessage({ facade, conversationId, type, content });
        if (!result?.ok) throw new Error(result?.error?.message || '发送失败');
        await loadMessages(conversationId);
    };

    const openNarrativeDialog = (conversationId, type) => {
        const meta = TOOL_META[type];
        const content = createElement('div', 'yuzi-qq-dialog-form');
        const input = createElement('textarea');
        input.rows = 4;
        input.placeholder = type === 'voice' ? '输入要说的话' : `描述${meta.label}内容`;
        input.setAttribute('aria-label', meta.label);
        const error = createElement('p', 'yuzi-qq-form-error');
        const cancel = createButton('取消', 'yuzi-qq-secondary-button');
        cancel.addEventListener('click', clearOverlay);
        const confirm = createButton('发送', 'yuzi-qq-primary-button');
        confirm.disabled = true;
        const toggle = () => { confirm.disabled = !asText(input.value); };
        input.addEventListener('input', toggle);
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (!confirm.disabled) confirm.click();
            }
        });
        confirm.addEventListener('click', async () => {
            confirm.disabled = true;
            try {
                await sendNarrativeMessage(conversationId, type, input.value);
                clearOverlay();
                await render();
            } catch (errorValue) {
                error.textContent = errorValue.message || '发送失败，请重试';
                toggle();
            }
        });
        content.append(input, error);
        showDialog({ title: meta.label, content, actions: [cancel, confirm] });
        input.focus();
    };

    const openTransferDialog = (conversationId) => {
        const content = createElement('div', 'yuzi-qq-dialog-form');
        const amount = createElement('input');
        amount.placeholder = '金额';
        amount.setAttribute('aria-label', '金额');
        const currency = createElement('input');
        currency.placeholder = '货币';
        currency.setAttribute('aria-label', '货币');
        const note = createElement('textarea');
        note.rows = 2;
        note.placeholder = '备注';
        note.setAttribute('aria-label', '备注');
        const error = createElement('p', 'yuzi-qq-form-error');
        const cancel = createButton('取消', 'yuzi-qq-secondary-button');
        cancel.addEventListener('click', clearOverlay);
        const confirm = createButton('转账', 'yuzi-qq-primary-button');
        confirm.disabled = true;
        const toggle = () => { confirm.disabled = !asText(amount.value) || !asText(currency.value); };
        amount.addEventListener('input', toggle);
        currency.addEventListener('input', toggle);
        confirm.addEventListener('click', async () => {
            confirm.disabled = true;
            const result = await submitTransferMessage({
                facade,
                conversationId,
                amount: amount.value,
                currency: currency.value,
                note: note.value,
            });
            if (!result?.ok) {
                error.textContent = result?.error?.message || '转账发送失败，请重试';
                toggle();
                return;
            }
            clearOverlay();
            await loadMessages(conversationId);
            await render();
        });
        content.append(amount, currency, note, error);
        showDialog({ title: '转账', content, actions: [cancel, confirm] });
        amount.focus();
    };

    const openSelectedMessageDeletion = (conversationId) => {
        const selectedIds = messageSelection.get(conversationId);
        if (selectedIds.length === 0) return;
        const content = createElement('div', 'yuzi-qq-confirm-copy yuzi-qq-delete-message-copy');
        const text = createElement('p');
        text.textContent = `确定删除 ${selectedIds.length} 条消息吗？`;
        const error = createElement('p', 'yuzi-qq-form-error');
        content.append(text, error);
        const cancel = createButton('取消', 'yuzi-qq-secondary-button');
        cancel.addEventListener('click', clearOverlay);
        const confirm = createButton('删除', 'yuzi-qq-danger-button', { 'data-qq-delete-selected': conversationId });
        confirm.addEventListener('click', async () => {
            confirm.disabled = true;
            const result = await deleteSelectedMessages({ facade, conversationId, selection: messageSelection });
            if (!result?.ok) {
                error.textContent = result?.error?.message || '删除失败';
                confirm.disabled = false;
                return;
            }
            messageSelectionConversationId = '';
            clearOverlay();
            await loadMessages(conversationId);
            await render();
        });
        showDialog({ title: '删除消息', content, actions: [cancel, confirm], className: 'yuzi-qq-delete-message-dialog' });
    };

    const openMessageMenu = (conversationId, messageId) => {
        const message = getMessageState(conversationId).items.find((item) => item.messageId === messageId);
        if (!message) return;
        const menu = createElement('div', 'yuzi-qq-dialog-menu yuzi-qq-message-action-menu');
        const copy = createButton('复制', 'yuzi-qq-dialog-menu-item');
        copy.addEventListener('click', async () => {
            try {
                await copyMessageText(message);
            } catch (error) {
                report(error);
            }
            clearOverlay();
        });
        const selectForDeletion = createButton(
            '多选管理',
            'yuzi-qq-dialog-menu-item',
            { 'data-qq-select-message': message.messageId },
        );
        selectForDeletion.addEventListener('click', () => {
            enterMessageSelection(conversationId, message.messageId);
        });
        menu.append(copy, selectForDeletion);
        const cancel = createButton('取消', 'yuzi-qq-secondary-button');
        cancel.addEventListener('click', clearOverlay);
        showDialog({ title: '', content: menu, actions: [cancel], className: 'yuzi-qq-message-action-menu-dialog' });
    };

    const messageMenu = createMessageMenuController({
        open: ({ conversationId, message }) => openMessageMenu(conversationId, message.messageId),
        longPress: ({ conversationId, message }) => enterMessageSelection(conversationId, message.messageId),
    });

    const openTransferActionLegacy = (conversationId, messageId) => {
        const message = getMessageState(conversationId).items.find((item) => item.messageId === messageId);
        if (!message?.transfer || message.senderType === 'self' || message.transfer.status !== 'pending') return;
        const content = createElement('p');
        content.textContent = messageContent(message);
        const reject = createButton('退还', 'yuzi-qq-secondary-button');
        const accept = createButton('收下', 'yuzi-qq-primary-button');
        [reject, accept].forEach((button) => button.addEventListener('click', () => {
            report(new Error('转账状态将由下一次 AI 正常触发读取'));
            clearOverlay();
        }));
        showDialog({ title: '处理转账', content, actions: [reject, accept] });
    };

    const openTransferAction = (conversationId, messageId) => {
        const message = getMessageState(conversationId).items.find((item) => item.messageId === messageId);
        if (!message?.transfer || message.senderType === 'self' || message.transfer.status !== 'pending') return;
        const content = createElement('p');
        content.textContent = messageContent(message);
        const returnButton = createButton('退还', 'yuzi-qq-secondary-button');
        const accept = createButton('收下', 'yuzi-qq-primary-button');
        const handle = async (action, button) => {
            button.disabled = true;
            const result = await handleIncomingTransfer({ facade, conversationId, messageId, action });
            if (!result?.ok) {
                button.disabled = false;
                content.textContent = result?.error?.message || '转账处理失败';
                return;
            }
            clearOverlay();
            await loadMessages(conversationId);
            await render();
        };
        returnButton.addEventListener('click', () => void handle('return', returnButton));
        accept.addEventListener('click', () => void handle('accept', accept));
        showDialog({ title: '处理转账', content, actions: [returnButton, accept] });
    };
    void openTransferActionLegacy;

    const updatePrivateProfileAsset = (conversationId, fieldName, kind) => {
        pickImageFiles(async ([selected]) => {
            const blob = selected.file;
            const saved = await facade.intent.saveMedia({
                media: {
                    kind,
                    conversationId,
                    mimeType: blob.type || 'image/png',
                    blob,
                },
            });
            if (!saved?.ok) throw new Error(saved?.error?.message || '图片保存失败');
            const updated = await facade.intent.updatePrivateProfile({
                conversationId,
                profile: { [fieldName]: saved.media.assetId },
            });
            if (!updated?.ok) throw new Error(updated?.error?.message || '资料更新失败');
            await render();
        }, {
            multiple: false,
            maxSizeMB: 8,
            onError: (message) => report(new Error(message)),
        });
    };

    const clearPrivateProfileAsset = async (conversationId, fieldName) => {
        const result = await facade.intent.updatePrivateProfile({ conversationId, profile: { [fieldName]: '' } });
        if (!result?.ok) throw new Error(result?.error?.message || '\u8d44\u6599\u66f4\u65b0\u5931\u8d25');
        await render();
    };

    const updateCurrentProfileAsset = (fieldName, kind) => {
        pickImageFiles(async ([selected]) => {
            const blob = selected.file;
            const saved = await facade.intent.saveMedia({
                media: {
                    kind,
                    blob,
                    mimeType: blob.type || 'image/png',
                },
            });
            if (!saved?.ok) throw new Error(saved?.error?.message || '\u56fe\u7247\u4fdd\u5b58\u5931\u8d25');
            const updated = await facade.intent.updateCurrentProfile({
                profile: { [fieldName]: asText(saved.media?.assetId) },
            });
            if (!updated?.ok) throw new Error(updated?.error?.message || '\u8d44\u6599\u66f4\u65b0\u5931\u8d25');
            await render();
        }, {
            multiple: false,
            maxSizeMB: 8,
            onError: (message) => report(new Error(message)),
        });
    };

    const clearCurrentProfileAsset = async (fieldName) => {
        const result = await facade.intent.updateCurrentProfile({ profile: { [fieldName]: '' } });
        if (!result?.ok) throw new Error(result?.error?.message || '\u8d44\u6599\u66f4\u65b0\u5931\u8d25');
        await render();
    };

    const uploadImageLibraryAsset = (library) => {
        pickImageFiles(async (files) => {
            const saved = await facade.intent.saveImageLibraryAssets({
                assets: files.map(({ file }) => ({
                    library,
                    blob: file,
                    mimeType: file.type,
                })),
            });
            if (!saved?.ok) throw new Error(saved?.error?.message || '\u56fe\u7247\u4fdd\u5b58\u5931\u8d25');
            await render();
        }, {
            maxSizeMB: 8,
            onError: (message) => report(new Error(message)),
        });
    };

    const openStickerUploadDialog = (files) => {
        const reopenPanel = page?.type === 'chat';
        const dialog = createStickerUploadDialog({
            files,
            close: clearOverlay,
            save: (stickers) => facade.intent.saveStickers({ stickers }),
            onSaved: async () => {
                emojiOpen = reopenPanel;
                await render({ preserveEmoji: reopenPanel });
            },
        });
        showDialog({
            title: files.length === 1 ? '添加表情' : `添加 ${files.length} 个表情`,
            content: dialog.content,
            actions: dialog.actions,
            className: 'yuzi-qq-sticker-upload-dialog',
        });
        overlayCleanup = dialog.dispose;
        dialog.focus();
    };

    const uploadSticker = () => {
        pickImageFiles((files) => {
            openStickerUploadDialog(files);
        }, {
            maxSizeMB: 8,
            onError: (message) => report(new Error(message)),
        });
    };

    const exportImageLibraryPack = async (button) => {
        button.disabled = true;
        const result = await facade.query.imageLibraryPack();
        button.disabled = false;
        if (!result?.ok || !result.pack) {
            shell.showToast?.(result?.error?.message || '图片资料导出失败', true);
            return;
        }
        downloadImageLibraryPack(result.pack);
        shell.showToast?.('已导出 QQ 图片资料', false);
    };

    const confirmImageLibraryPackImport = (source) => {
        const content = createElement('div', 'yuzi-qq-confirm-copy');
        const copy = createElement('p');
        copy.textContent = '导入会追加头像、资料背景、聊天背景和表情；相同资源 ID 会自动添加 (1)、(2)。';
        const status = createElement('p', 'yuzi-qq-form-error');
        content.append(copy, status);
        const cancel = createButton('取消', 'yuzi-qq-secondary-button');
        cancel.addEventListener('click', clearOverlay);
        const confirm = createButton('导入', 'yuzi-qq-primary-button');
        confirm.addEventListener('click', async () => {
            confirm.disabled = true;
            confirm.textContent = '导入中…';
            const result = await facade.intent.importImageLibraryPack({ source });
            if (!result?.ok) {
                confirm.disabled = false;
                confirm.textContent = '导入';
                status.textContent = result?.error?.message || '图片资料导入失败';
                return;
            }
            clearImageLibrarySelection();
            clearOverlay();
            const imported = asObject(result.imported);
            shell.showToast?.(`已导入：头像 ${asInteger(imported.avatars)}，资料背景 ${asInteger(imported.profileBackgrounds)}，聊天背景 ${asInteger(imported.chatBackgrounds)}，表情 ${asInteger(imported.stickers)}`, false);
            await render();
        });
        showDialog({
            title: '导入图片资料',
            content,
            actions: [cancel, confirm],
            className: 'yuzi-qq-confirm-dialog yuzi-qq-image-library-import-dialog',
        });
    };

    const importImageLibraryPack = () => {
        pickImageLibraryPackFile((source) => confirmImageLibraryPackImport(source), {
            onError: (message) => shell.showToast?.(message, true),
        });
    };

    const openImageLibraryPackMenu = (anchor) => {
        const menu = createElement('div', 'yuzi-qq-dialog-menu yuzi-qq-image-library-pack-menu');
        const importAction = createButton('', 'yuzi-qq-dialog-menu-item yuzi-qq-image-library-pack-menu-item');
        importAction.append(createIcon('file-import'), document.createTextNode('导入图片资料'));
        importAction.addEventListener('click', () => {
            clearOverlay();
            importImageLibraryPack();
        });
        const exportAction = createButton('', 'yuzi-qq-dialog-menu-item yuzi-qq-image-library-pack-menu-item');
        exportAction.append(createIcon('file-export'), document.createTextNode('导出图片资料'));
        exportAction.addEventListener('click', () => {
            clearOverlay();
            void exportImageLibraryPack(anchor);
        });
        menu.append(importAction, exportAction);
        showAnchoredMenu(anchor, menu);
    };

    const confirmImageLibraryDeletion = () => {
        const assetIds = [...selectedImageAssetIds];
        const stickerIds = [...selectedStickerIds];
        const total = assetIds.length + stickerIds.length;
        if (!imageLibrarySelectionMode || total === 0) return;
        const status = createElement('p', 'yuzi-qq-form-error');
        const cancel = createButton('\u53d6\u6d88', 'yuzi-qq-secondary-button');
        cancel.addEventListener('click', clearOverlay);
        const confirm = createButton('\u5220\u9664', 'yuzi-qq-danger-button');
        confirm.addEventListener('click', async () => {
            confirm.disabled = true;
            confirm.textContent = '\u5220\u9664\u4e2d\u2026';
            const [imageResult, stickerResults] = await Promise.all([
                assetIds.length > 0
                    ? facade.intent.deleteImageLibraryAssets({ assetIds })
                    : Promise.resolve({ ok: true, result: { deletedAssetIds: [] } }),
                Promise.all(stickerIds.map((stickerId) => facade.intent.deleteSticker({ stickerId }))),
            ]);
            if (!imageResult?.ok || stickerResults.some((result) => !result?.ok)) {
                confirm.disabled = false;
                confirm.textContent = '\u5220\u9664';
                status.textContent = imageResult?.error?.message
                    || stickerResults.find((result) => !result?.ok)?.error?.message
                    || '\u5220\u9664\u5931\u8d25';
                return;
            }
            const deletedAssetIds = imageResult.result?.deletedAssetIds || assetIds;
            await Promise.all([
                avatarRenderLeases.invalidate(deletedAssetIds),
                backgroundRenderLeases.invalidate(deletedAssetIds),
            ]);
            clearImageLibrarySelection();
            clearOverlay();
            await render();
        });
        showDialog({
            title: `\u5220\u9664 ${total} \u9879\u8d44\u6e90`,
            content: status,
            actions: [cancel, confirm],
            className: 'yuzi-qq-confirm-dialog yuzi-qq-image-library-delete-dialog',
        });
    };
    const persistSettings = async (form, field = '') => {
        const kind = form.dataset.qqSettingsForm;
        const value = (name) => form.elements[name]?.value ?? '';
        const status = form.querySelector('[data-qq-settings-status]');
        const nonNegativeInteger = (name) => {
            const raw = value(name);
            const number = Number(raw);
            return raw !== '' && Number.isInteger(number) && number >= 0 ? number : null;
        };
        const positiveInteger = (name) => {
            const raw = value(name);
            const number = Number(raw);
            return raw !== '' && Number.isInteger(number) && number > 0 ? number : null;
        };
        const reject = (message) => {
            if (status) status.textContent = message;
            return null;
        };
        const values = {
            activeApiPresetId: value('activeApiPresetId'),
            privateReplyPresetId: value('privateReplyPresetId'),
            privateProactivePresetId: value('privateProactivePresetId'),
            enabled: form.elements.enabled?.checked === true,
            bookName: value('bookName'),
            timeWindowMode: value('timeWindowMode'),
            timeWindowValue: value('timeWindowValue'),
            timeWindowUnit: value('timeWindowUnit'),
            light: value('light'),
            depth: value('depth'),
            keywords: value('keywords'),
        };
        if (kind === 'reply') {
            if (field === 'everyTurns') {
                const everyTurns = positiveInteger('everyTurns');
                if (everyTurns === null) return reject('\u4e3b\u52a8\u6d88\u606f\u95f4\u9694\u5fc5\u987b\u662f\u6b63\u6574\u6570');
                values.everyTurns = everyTurns;
            } else if (!field) {
                const everyTurns = positiveInteger('everyTurns');
                if (values.enabled && everyTurns === null) return reject('\u4e3b\u52a8\u6d88\u606f\u95f4\u9694\u5fc5\u987b\u662f\u6b63\u6574\u6570');
                values.everyTurns = everyTurns ?? 5;
            }
        }
        if (kind === 'context') {
            if (!field || field === 'hostContextTurns') {
                const hostContextTurns = nonNegativeInteger('hostContextTurns');
                if (hostContextTurns === null) {
                    return reject('\u4e0a\u4e0b\u6587\u6761\u6570\u5fc5\u987b\u662f 0 \u6216\u66f4\u5927\u7684\u6574\u6570');
                }
                values.hostContextTurns = hostContextTurns;
            }
            if (!field || field === 'conversationHistoryLimit') {
                const conversationHistoryLimit = nonNegativeInteger('conversationHistoryLimit');
                if (conversationHistoryLimit === null) {
                    return reject('\u4e0a\u4e0b\u6587\u6761\u6570\u5fc5\u987b\u662f 0 \u6216\u66f4\u5927\u7684\u6574\u6570');
                }
                values.conversationHistoryLimit = conversationHistoryLimit;
            }
        }
        if (kind === 'worldbook') {
            if (!field || field === 'depth') {
                const depth = nonNegativeInteger('depth');
                if (depth === null) return reject('\u6df1\u5ea6\u5fc5\u987b\u662f 0 \u6216\u66f4\u5927\u7684\u6574\u6570');
                values.depth = depth;
            }
            if (!field || ['timeWindowMode', 'timeWindowValue', 'timeWindowUnit'].includes(field)) {
                const timeWindowValue = positiveInteger('timeWindowValue');
                if (values.timeWindowMode !== 'all' && timeWindowValue === null) {
                    return reject('\u65f6\u95f4\u8303\u56f4\u5fc5\u987b\u662f\u6b63\u6574\u6570');
                }
                values.timeWindowValue = timeWindowValue ?? values.timeWindowValue;
            }
        }
        const result = await saveQQSettings(facade, {
            scopeId: form.dataset.qqSettingsScopeId,
            kind,
            field,
            values,
        });
        if (status) status.textContent = result?.ok ? '' : (result?.error?.message
            || (result?.reason === 'scope-changed' ? '\u5f53\u524d\u804a\u5929\u5df2\u5207\u6362\uff0c\u672a\u4fdd\u5b58' : '\u4fdd\u5b58\u5931\u8d25'));
    };

    const persistConversationDetail = async (form) => {
        const conversationId = form.dataset.qqConversationDetailForm;
        const status = form.querySelector('[data-qq-conversation-detail-status]');
        const remarkResult = await facade.intent.updatePrivateProfile({
            conversationId,
            profile: { remark: asText(form.elements.remark?.value) },
        });
        if (!remarkResult?.ok) {
            if (status) status.textContent = remarkResult?.error?.message || '保存失败';
            return;
        }
        const injectionResult = await facade.intent.setConversationInjection({
            conversationId,
            injection: {
                enabled: form.elements.enabled?.checked === true,
                followGlobal: form.elements.followGlobal?.checked === true,
                light: asText(form.elements.light?.value) || 'blue',
                depth: Number(form.elements.depth?.value) || 0,
            },
        });
        if (status) status.textContent = injectionResult?.ok ? '' : (injectionResult?.error?.message || '保存失败');
    };

    const handleConversationListScroll = () => {
        closeConversationSwipe();
    };

    const handleClick = async (event) => {
        const target = event.target.closest('button');
        if (!target || !viewport?.contains(target)) return;
        if (target.dataset.qqViewImage) {
            if (isMessageSelectionMode(target.dataset.qqImageConversationId || page?.conversationId)) return;
            event.preventDefault();
            event.stopPropagation();
            openGeneratedImageViewer(target.dataset.qqViewImage, target.dataset.qqViewImageAlt);
            return;
        }
        if (target.dataset.qqGenerateImage) {
            event.preventDefault();
            event.stopPropagation();
            const messageId = asText(target.dataset.qqGenerateImage);
            const conversationId = asText(target.dataset.qqImageConversationId || page?.conversationId);
            if (
                !messageId
                || !conversationId
                || !isImageGenerationEnabled()
                || isMessageSelectionMode(conversationId)
                || imageGenerationController.isLoading(messageId)
            ) return;

            await imageGenerationController.generate({ conversationId, messageId });
            return;
        }
        const targetConversationId = target.closest('[data-qq-conversation-id]')?.dataset.qqConversationId || '';
        const actionConversationId = target.dataset.qqDeleteConversation || '';
        if (shouldCloseConversationSwipe(openSwipeConversationId, targetConversationId, actionConversationId)) {
            closeConversationSwipe();
            return;
        }
        if (target.dataset.qqTab) {
            closeOpenedChat();
            closeEmojiPanel();
            tab = target.dataset.qqTab;
            page = null;
            openSwipeConversationId = '';
            return render();
        }
        if (target.dataset.qqBack) {
            return back();
        }
        if (target.dataset.qqAddContact) return openAddContact(target);
        if (target.dataset.qqCurrentProfile) return go({ type: 'current-profile' });
        if (target.dataset.qqCurrentProfileEdit) return go({ type: 'current-profile-edit' });
        if (target.dataset.qqCurrentProfilePickAvatar) return updateCurrentProfileAsset('avatarAssetId', 'avatar');
        if (target.dataset.qqCurrentProfilePickBackground) return updateCurrentProfileAsset('profileBackgroundAssetId', 'profile-background');
        if (target.dataset.qqCurrentProfileClearAvatar) return clearCurrentProfileAsset('avatarAssetId').catch(report);
        if (target.dataset.qqCurrentProfileClearBackground) return clearCurrentProfileAsset('profileBackgroundAssetId').catch(report);
        if (target.dataset.qqProfilePickAvatar) return updatePrivateProfileAsset(target.dataset.qqProfilePickAvatar, 'avatarAssetId', 'avatar');
        if (target.dataset.qqProfilePickBackground) return updatePrivateProfileAsset(target.dataset.qqProfilePickBackground, 'profileBackgroundAssetId', 'profile-background');
        if (target.dataset.qqProfileClearAvatar) return clearPrivateProfileAsset(target.dataset.qqProfileClearAvatar, 'avatarAssetId').catch(report);
        if (target.dataset.qqProfileClearBackground) return clearPrivateProfileAsset(target.dataset.qqProfileClearBackground, 'profileBackgroundAssetId').catch(report);
        if (target.dataset.qqImageLibraryPackMenu) return openImageLibraryPackMenu(target);
        if (target.dataset.qqImageLibraryUpload) return uploadImageLibraryAsset(target.dataset.qqImageLibraryUpload);
        if (target.dataset.qqImageLibraryDelete) return confirmImageLibraryDeletion();
        if (target.dataset.qqChat) {
            if (openSwipeConversationId === target.dataset.qqChat) {
                closeConversationSwipe();
                return;
            }
            await openChat({ conversationId: target.dataset.qqChat });
            return;
        }
        if (target.dataset.qqDeleteConversation) return confirmConversationDeletion(target.dataset.qqDeleteConversation);
        if (target.dataset.qqProfile) return go({ type: 'profile', conversationId: target.dataset.qqProfile });
        if (target.dataset.qqEditProfile) return go({ type: 'profile-edit', conversationId: target.dataset.qqEditProfile });
        if (target.dataset.qqRemoveFriend) return confirmFriendRemoval(target.dataset.qqRemoveFriend);
        if (target.dataset.qqRestoreFriend) {
            const conversation = await getConversation(target.dataset.qqRestoreFriend);
            const result = await facade.intent.createPrivateConversation({ name: contactFormalName(conversation) });
            if (!result?.ok) report(new Error(result?.error?.message || '添加好友失败'));
            else go({ type: 'profile', conversationId: result.result.conversation.conversationId });
            return;
        }
        if (target.dataset.qqProfileMessage) {
            const conversation = await getConversation(target.dataset.qqProfileMessage);
            if (conversation) await openChat(conversation);
            return;
        }
        if (target.dataset.qqPickAvatar) return updatePrivateProfileAsset(target.dataset.qqPickAvatar, 'avatarAssetId', 'avatar', 'icon');
        if (target.dataset.qqPickBackground) return updatePrivateProfileAsset(target.dataset.qqPickBackground, 'backgroundAssetId', 'background', 'background');
        if (target.dataset.qqConversationDetail) return go({ type: 'conversation-settings', conversationId: target.dataset.qqConversationDetail });
        if (target.dataset.qqClearChatBackground) {
            const result = await facade.intent.updatePrivateProfile({
                conversationId: target.dataset.qqClearChatBackground,
                profile: { backgroundAssetId: '' },
            });
            if (!result?.ok) report(new Error(result?.error?.message || 'Unable to update chat background'));
            return render();
        }
        if (target.dataset.qqConversationInjection) {
            const conversation = await getConversation(target.dataset.qqConversationInjection);
            const result = await facade.intent.setConversationInjection({
                conversationId: target.dataset.qqConversationInjection,
                injection: { enabled: conversation?.injection?.enabled !== true },
            });
            if (!result?.ok) report(new Error(result?.error?.message || '更新失败'));
            return render();
        }
        if (target.dataset.qqRetry) {
            const result = await facade.intent.retryRequest({ conversationId: target.dataset.qqRetry });
            if (!result?.ok) report(new Error(result?.error?.message || '重试失败'));
            return render();
        }
        if (target.dataset.qqStopGeneration) {
            const result = await facade.intent.cancelManualRequest({ conversationId: target.dataset.qqStopGeneration });
            if (!result?.ok) report(new Error(result?.error?.message || '终止生成失败'));
            return render();
        }
        if (target.dataset.qqJumpLatest) {
            jumpCounts.delete(target.dataset.qqJumpLatest);
            const stream = viewport.querySelector(`[data-qq-message-stream="${target.dataset.qqJumpLatest}"]`);
            if (stream) stream.scrollTop = Math.max(0, stream.scrollHeight - stream.clientHeight);
            target.remove();
            return;
        }
        if (target.dataset.qqTool) {
            const conversationId = page?.conversationId;
            if (!conversationId || target.dataset.qqTool === 'plus') return;
            if (target.dataset.qqTool === 'emoji') {
                if (emojiOpen) emojiOpen = false;
                else {
                    emojiOpen = true;
                    viewport?.querySelector('.yuzi-qq-composer-input')?.blur();
                }
                return render({ preserveEmoji: true });
            }
            if (target.dataset.qqTool === 'transfer') return openTransferDialog(conversationId);
            return openNarrativeDialog(conversationId, target.dataset.qqTool);
        }
        if (target.dataset.qqSticker) {
            const conversationId = page?.conversationId;
            if (!conversationId) return;
            const result = await facade.intent.sendMessage({
                conversationId,
                message: { type: 'sticker', content: target.dataset.qqStickerText || target.dataset.qqSticker, stickerId: target.dataset.qqSticker },
            });
            if (!result?.ok) report(new Error(result?.error?.message || '发送失败'));
            else {
                await loadMessages(conversationId);
                await render({ preserveEmoji: true });
            }
            return;
        }
        if (target.dataset.qqStickerUpload) return uploadSticker();
        if (target.dataset.qqSettings) return go({ type: 'settings', kind: target.dataset.qqSettings });
        if (target.dataset.qqMessage) return openMessageMenu(page?.conversationId, target.dataset.qqMessage);
        if (target.dataset.qqTransfer) return openTransferAction(page?.conversationId, target.dataset.qqTransfer);
        if (target.dataset.qqVoice) {
            const expanded = target.classList.toggle('is-expanded');
            target.setAttribute('aria-expanded', String(expanded));
        }
    };

    const handleEmojiPanelKeyDown = (event) => {
        emojiPanelController.handleKeyDown(event);
    };

    const handleEmojiPanelPointerDown = (event) => {
        emojiPanelController.handlePointerDown(event);
    };

    const handleSubmit = async (event) => {
        const form = event.target;
        if (!(form instanceof HTMLFormElement) || !viewport?.contains(form)) return;
        event.preventDefault();
        if (form.dataset.qqComposer) {
            await submitComposer(form.dataset.qqComposer, form.elements.message?.value);
            return;
        }
        if (form.dataset.qqProfileForm) {
            const conversationId = form.dataset.qqProfileForm;
            const result = await facade.intent.updatePrivateProfile({
                conversationId,
                profile: { formalName: normalizeName(form.elements.formalName?.value) },
            });
            const error = form.querySelector('[data-qq-profile-error]');
            if (!result?.ok) {
                if (error) error.textContent = result?.error?.message || '保存失败，名字可能已存在';
                return;
            }
            go({ type: 'profile', conversationId });
        }
    };

    const handleChange = (event) => {
        if (event.target.matches?.('[data-qq-profile-field-input]')) {
            void persistProfileEditorField(event.target).catch(report);
            return;
        }
        const detailForm = event.target.closest?.('[data-qq-conversation-detail-form]');
        if (detailForm) {
            void persistConversationDetail(detailForm).catch(report);
            return;
        }
        const form = event.target.closest?.('[data-qq-settings-form]');
        if (!form) return;
        const field = asText(event.target.name);
        void enqueueSettingsSave(() => persistSettings(form, field)).catch(report);
    };

    return Object.freeze({
        mount(container) {
            if (!(container instanceof HTMLElement)) throw new TypeError('QQ App mount needs an element');
            disposed = false;
            root = container;
            root.classList.add('yuzi-qq-app');
            viewport = createElement('div', 'yuzi-qq-viewport');
            viewport.addEventListener('pointerdown', handleEmojiPanelPointerDown);
            viewport.addEventListener('keydown', handleEmojiPanelKeyDown);
            viewport.addEventListener('click', (event) => { void handleClick(event); });
            viewport.addEventListener('submit', (event) => { void handleSubmit(event); });
            viewport.addEventListener('change', handleChange);
            viewport.addEventListener('scroll', handleConversationListScroll, true);
            window.addEventListener('yuzi-phone-resize-start', handlePhoneResizeStart);
            root.replaceChildren(viewport);
            void render();
            return this;
        },
        refresh: () => render(),
        reset() {
            tab = 'messages';
            page = null;
            openSwipeConversationId = '';
            closeEmojiPanel();
            drafts.clear();
            messageSelection.clearAll();
            messageSelectionConversationId = '';
            imageGenerationController.clear();
            pages.clear();
            conversationSnapshots.clear();
            viewSnapshotCache.clear();
            displayedViewKey = '';
            return render();
        },
        destroy() {
            closeOpenedChat();
            disposed = true;
            renderEpoch += 1;
            composerAutoHeight.dispose();
            closeTransientUi();
            messageSelection.clearAll();
            messageSelectionConversationId = '';
            imageGenerationController.clear();
            viewSnapshotCache.clear();
            conversationSnapshots.clear();
            displayedViewKey = '';
            window.removeEventListener('yuzi-phone-resize-start', handlePhoneResizeStart);
            viewport?.removeEventListener('pointerdown', handleEmojiPanelPointerDown);
            viewport?.removeEventListener('keydown', handleEmojiPanelKeyDown);
            viewport?.removeEventListener('scroll', handleConversationListScroll, true);
            messageMenu.dispose();
            viewScrollState.dispose();
            void Promise.all([
                mediaRenderLeases.dispose(),
                backgroundRenderLeases.dispose(),
                avatarRenderLeases.dispose(),
                stickerRenderLeases.dispose(),
            ]);
            root?.classList.remove('yuzi-qq-app');
            root?.replaceChildren();
            root = null;
            viewport = null;
        },
    });
}
