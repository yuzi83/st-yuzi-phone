import { createQQV2Facade } from './facade.js';
import { getDB } from '../../phone-core/db-bridge.js';
import {
    createQQV2DatabaseCurrentApiPreset,
    isQQV2DatabaseCurrentApiPresetId,
} from '../database-current-api.js';
import { createQQV2GlobalRuntimeSettings } from './global-runtime-settings.js';
import { createQQV2Repository } from '../domain/repository.js';
import { QQ_V2_BUILT_IN_PROMPT_PRESET_IDS } from '../domain/prompt-preset-ids.js';
import { normalizeQQV2TagName, normalizeQQV2TagNames } from '../domain/story-context-tags.js';
import { createQQV2ActionService } from '../protocol/action-service.js';
import { parseQQV2Response, validateQQV2ActionBatch } from '../protocol/xml.js';
import { createQQV2ProactiveService } from '../proactive/service.js';
import { buildManualQQV2Request, buildQQV2StoryContext } from '../prompt/materializer.js';
import { buildQQV2StickerCatalog } from '../prompt/sticker-catalog.js';
import { createQQV2RequestService } from '../request/service.js';
import { createSillyTavernQQV2Backend } from '../request/backend-proxy.js';
import {
    createQQV2BackendRouter,
    createQQV2DatabaseCurrentApiBackend,
} from '../request/database-current-api-backend.js';
import { createQQImageLibraryPackService } from '../resources/image-library-pack.js';
import { createQQDefaultImageLibraryInstaller } from '../resources/default-image-library.js';
import { createQQV2ResourceService } from '../resources/service.js';
import {
    createIndexedDbQQV2StateStore,
    createQQV2SharedResourceStorage,
} from '../storage/state-store.js';
import { createQQV2Runtime } from '../runtime/runtime.js';
import { createQQV2SillyTavernWorldbookGateway } from '../worldbook/st-gateway.js';
import { createQQV2WorldbookProjectionService } from '../worldbook/projection-service.js';
import { formatQQV2MessageSemantic } from '../domain/message-semantics.js';
import { createHostChatDeletedFact, resolveDeletedQQV2Scope } from '../host/lifecycle.js';
import { observeFinalPromptForViewer } from '../../integration/final-prompt-viewer-bridge.js';
import { createWorldbookContextResolver } from '../../worldbook-reading/context-resolver.js';
import { sillyTavernWorldbookReadingCatalog } from '../../worldbook-reading/st-catalog-adapter.js';
import { sillyTavernWorldbookReadingRuntimes } from '../../worldbook-reading/st-runtime-adapter.js';

const SELF_ID = '__self__';
const BUILT_IN_PROMPT_PRESET_BY_SETTING = Object.freeze({
    privateReplyPresetId: QQ_V2_BUILT_IN_PROMPT_PRESET_IDS.privateReply,
    privateProactivePresetId: QQ_V2_BUILT_IN_PROMPT_PRESET_IDS.privateProactive,
    groupReplyPresetId: QQ_V2_BUILT_IN_PROMPT_PRESET_IDS.groupReply,
    groupProactivePresetId: QQ_V2_BUILT_IN_PROMPT_PRESET_IDS.groupProactive,
});

function asText(value, maxLength = 0) {
    const text = String(value ?? '').trim();
    return maxLength > 0 ? text.slice(0, maxLength) : text;
}

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function cloneModelLoadDraft(draft) {
    const source = asObject(draft);
    return Object.freeze({
        endpoint: asText(source.endpoint, 2048),
        apiKey: asText(source.apiKey, 8192),
        model: asText(source.model, 240),
        temperature: source.temperature,
        maxOutput: source.maxOutput,
    });
}

function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(asObject(value), key);
}

function nonNegativeInteger(value, label) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 0) {
        throw new TypeError(`${label} must be a non-negative integer`);
    }
    return number;
}

function safeRead(callback, fallback) {
    try {
        const value = callback();
        return value === undefined || value === null ? fallback : value;
    } catch {
        return fallback;
    }
}

function resolveObjectUrlApi(value) {
    const api = value ?? globalThis.URL;
    return api
        && typeof api.createObjectURL === 'function'
        && typeof api.revokeObjectURL === 'function'
        ? api
        : null;
}

function privateOnlyError() {
    const error = new Error('QQ currently supports private conversations only');
    error.code = 'private_only';
    return error;
}

function conversationDeletingError() {
    const error = new Error('QQ conversation is being deleted');
    error.code = 'conversation_deleting';
    return error;
}

function imageGenerationError(message, code = 'image_generation_failed') {
    const error = new Error(message);
    error.code = code;
    return error;
}

function defaultGlobalSettings() {
    return {
        activeApiPresetId: '',
        privateReplyPresetId: QQ_V2_BUILT_IN_PROMPT_PRESET_IDS.privateReply,
        privateProactivePresetId: QQ_V2_BUILT_IN_PROMPT_PRESET_IDS.privateProactive,
        groupReplyPresetId: QQ_V2_BUILT_IN_PROMPT_PRESET_IDS.groupReply,
        groupProactivePresetId: QQ_V2_BUILT_IN_PROMPT_PRESET_IDS.groupProactive,
        hostContextTurns: 3,
        conversationHistoryLimit: 100,
        hostContextExtractTag: 'content',
        hostContextExcludeTags: [],
        worldbook: {
            enabled: false,
            bookName: '',
            timeWindow: { mode: 'relative', value: 1, unit: 'month' },
            light: 'blue',
            depth: 999,
            keywords: [],
        },
        proactive: { enabled: false, everyTurns: 5 },
    };
}

function cloneGlobalSettings(settings) {
    const source = settings && typeof settings === 'object' ? settings : {};
    const defaults = defaultGlobalSettings();
    return {
        ...defaults,
        activeApiPresetId: asText(source.activeApiPresetId, 256),
        privateReplyPresetId: asText(source.privateReplyPresetId, 256)
            || QQ_V2_BUILT_IN_PROMPT_PRESET_IDS.privateReply,
        privateProactivePresetId: asText(source.privateProactivePresetId, 256)
            || QQ_V2_BUILT_IN_PROMPT_PRESET_IDS.privateProactive,
        groupReplyPresetId: asText(source.groupReplyPresetId, 256)
            || QQ_V2_BUILT_IN_PROMPT_PRESET_IDS.groupReply,
        groupProactivePresetId: asText(source.groupProactivePresetId, 256)
            || QQ_V2_BUILT_IN_PROMPT_PRESET_IDS.groupProactive,
        hostContextTurns: Number.isInteger(Number(source.hostContextTurns))
            ? Number(source.hostContextTurns)
            : defaults.hostContextTurns,
        conversationHistoryLimit: Number.isInteger(Number(source.conversationHistoryLimit))
            ? Number(source.conversationHistoryLimit)
            : defaults.conversationHistoryLimit,
        hostContextExtractTag: Object.hasOwn(source, 'hostContextExtractTag')
            ? (asText(source.hostContextExtractTag)
                ? normalizeQQV2TagName(source.hostContextExtractTag) || defaults.hostContextExtractTag
                : '')
            : defaults.hostContextExtractTag,
        hostContextExcludeTags: normalizeQQV2TagNames(source.hostContextExcludeTags),
        worldbook: { ...defaults.worldbook, ...(source.worldbook || {}) },
        proactive: {
            enabled: source.proactive?.enabled === true,
            everyTurns: Number.isInteger(Number(source.proactive?.everyTurns)) && Number(source.proactive.everyTurns) > 0
                ? Number(source.proactive.everyTurns)
                : defaults.proactive.everyTurns,
        },
    };
}

function runtimeSettingsPatch(settings) {
    const source = asObject(settings);
    const patch = {};
    if (hasOwn(source, 'activeApiPresetId')) patch.activeApiPresetId = asText(source.activeApiPresetId, 256);
    for (const [key, defaultPresetId] of Object.entries(BUILT_IN_PROMPT_PRESET_BY_SETTING)) {
        if (hasOwn(source, key)) patch[key] = asText(source[key], 256) || defaultPresetId;
    }
    if (hasOwn(source, 'hostContextTurns')) {
        patch.hostContextTurns = nonNegativeInteger(source.hostContextTurns, 'hostContextTurns');
    }
    if (hasOwn(source, 'conversationHistoryLimit')) {
        patch.conversationHistoryLimit = nonNegativeInteger(source.conversationHistoryLimit, 'conversationHistoryLimit');
    }
    if (hasOwn(source, 'hostContextExtractTag')) {
        patch.hostContextExtractTag = asText(source.hostContextExtractTag, 128);
    }
    if (hasOwn(source, 'hostContextExcludeTags')) {
        patch.hostContextExcludeTags = source.hostContextExcludeTags;
    }
    return patch;
}

function formatPromptHistoryMessage(message, reference, people) {
    const sender = message?.senderId === SELF_ID
        ? '用户'
        : message?.senderType === 'system'
            ? '系统'
            : asText(people.get(message?.senderId)?.formalName, 120) || '成员';
    return `${reference}｜${sender}｜${formatQQV2MessageSemantic(message, {
        resolvePersonName: (personId) => people.get(personId)?.formalName,
    })}`;
}

function formatWorldbookHistory(messages, peopleById) {
    const resolvePersonName = (personId) => {
        const person = peopleById instanceof Map
            ? peopleById.get(personId)
            : asObject(peopleById)[personId];
        return typeof person === 'string' ? person : person?.formalName;
    };
    return asArray(messages).map((message) => ({
        ...message,
        content: formatQQV2MessageSemantic(message, { resolvePersonName }),
    }));
}

function truncateConversationHistory(messages, limit) {
    const normalizedLimit = Number(limit);
    if (!Number.isInteger(normalizedLimit) || normalizedLimit <= 0) return [...messages];
    return messages.slice(-normalizedLimit);
}

function currentContext(host, scope) {
    const identity = safeRead(() => host.readUserIdentity(), {});
    return {
        scopeId: asText(scope?.scopeId, 512),
        user: {
            name: asText(identity?.name, 256),
            avatar: asText(identity?.avatar, 1024),
        },
        storyTime: asText(safeRead(() => host.readStoryTime(), ''), 128),
    };
}

function resolveHeaders(host) {
    const context = safeRead(() => host.readRawContext?.(), null);
    if (!context || typeof context.getRequestHeaders !== 'function') return {};
    return context.getRequestHeaders();
}

function createMessageReferences(history) {
    const messageReferences = {};
    const visibleMessageRefs = new Set();
    history.forEach((message, index) => {
        const reference = `M${index + 1}`;
        messageReferences[reference] = message.messageId;
        visibleMessageRefs.add(reference);
    });
    return { messageReferences, visibleMessageRefs };
}

function isEligibleStoryReply(message) {
    return message?.role === 'assistant'
        && message?.isSystem !== true
        && message?.is_system !== true
        && message?.isHidden !== true
        && message?.is_hidden !== true
        && message?.isSuccessful !== false
        && message?.is_successful !== false;
}

function countEligibleStoryAiFloors(messages) {
    return asArray(messages).filter(isEligibleStoryReply).length;
}

async function resolveConversationFacts(repository, scopeId, conversation) {
    const group = conversation?.kind === 'group'
        ? await repository.getGroup(scopeId, conversation.groupId)
        : null;
    const personIds = conversation?.kind === 'private'
        ? [conversation.personId]
        : asArray(group?.memberIds);
    const people = await Promise.all(personIds.map((personId) => repository.getPerson(scopeId, personId)));
    return {
        group,
        people: people.filter(Boolean),
        peopleById: new Map(people.filter(Boolean).map((person) => [person.personId, person])),
    };
}

function createPersonReferences(people) {
    const personReferences = {};
    const referenceByPersonId = new Map();
    people.forEach((person, index) => {
        const reference = `N${index + 1}`;
        referenceByPersonId.set(person.personId, reference);
        personReferences[reference] = person.personId;
    });
    return { personReferences, referenceByPersonId };
}

function buildPrivateIdentity(conversation, people, referenceByPersonId) {
    const person = people[0];
    if (!person) return '无';
    const reference = referenceByPersonId.get(person.personId) || 'N1';
    return `P1：${person.formalName}（人物引用 ${reference}）`;
}

function buildGroupIdentity(conversation, group, peopleById, referenceByPersonId) {
    if (!group) return '无';
    const label = (personId) => {
        if (personId === SELF_ID) return '用户';
        const person = peopleById.get(personId);
        const reference = referenceByPersonId.get(personId);
        return person ? `${person.formalName}${reference ? `（${reference}）` : ''}` : '未知成员';
    };
    const members = asArray(group.memberIds).map(label).join('、') || '无';
    const admins = asArray(group.adminIds).map(label).join('、') || '无';
    return [
        `G1：${group.name || conversation?.conversationId || '未命名群聊'}`,
        `成员：${members}`,
        `群主：${label(group.ownerId)}`,
        `管理员：${admins}`,
    ].join('\n');
}

/**
 * The production composition root. It is the only place where QQ v2 joins
 * the host, persistence, request pipeline, worldbook services and the UI
 * facade. Domain modules remain independently testable through their seams.
 */
export function createQQV2ProductionRuntime(options = {}) {
    const host = options.host;
    if (!host || typeof host.readScope !== 'function') {
        throw new TypeError('QQ v2 production runtime 需要有效的 host adapter');
    }

    let lifecycle = null;
    const captureScopeSession = (expectedScopeId) => lifecycle?.captureScopeSession?.(expectedScopeId) || null;
    const runHostMutation = (operation) => lifecycle.runHostMutation(operation);
    const currentScopeId = () => asText(captureScopeSession()?.scopeId, 512);
    const scopeSessionIsCurrent = (scopeSession) => {
        try {
            return scopeSession?.isCurrent?.() === true && scopeSession.signal?.aborted !== true;
        } catch {
            return false;
        }
    };
    const scopeInactiveError = () => {
        const error = new Error('QQ 作用域已切换，当前操作已取消');
        error.code = 'scope_inactive';
        return error;
    };
    const assertReadyScopeSession = (scopeSession) => {
        if (scopeSessionIsCurrent(scopeSession) && scopeSession?.isReady?.() === true) return scopeSession;
        throw scopeInactiveError();
    };
    const captureReadyScopeSession = (expectedScopeId) => assertReadyScopeSession(captureScopeSession(expectedScopeId));
    const assertOptionalCurrentScopeSession = (scopeSession) => {
        if (!scopeSession || scopeSessionIsCurrent(scopeSession)) return scopeSession;
        throw scopeInactiveError();
    };
    const stateStore = options.stateStore || createIndexedDbQQV2StateStore(options);
    const sharedStorage = options.sharedStorage || createQQV2SharedResourceStorage({ stateStore });
    const repository = options.repository || createQQV2Repository({ stateStore });
    const globalRuntimeSettings = options.globalRuntimeSettings || createQQV2GlobalRuntimeSettings({ stateStore });
    const imageLibraryPacks = options.imageLibraryPacks || createQQImageLibraryPackService({ stateStore });
    const defaultImageLibrary = options.defaultImageLibrary || createQQDefaultImageLibraryInstaller({
        stateStore,
        fetchImpl: options.fetchImpl || (typeof window === 'undefined' ? null : globalThis.fetch?.bind(globalThis)),
    });
    const getDatabaseApi = typeof options.getDatabaseApi === 'function'
        ? options.getDatabaseApi
        : () => safeRead(getDB, null);
    const resources = options.resources || createQQV2ResourceService({
        storage: sharedStorage,
        cryptoApi: options.cryptoApi,
    });
    const primaryBackend = options.backend || createSillyTavernQQV2Backend({
        getRequestHeaders: () => resolveHeaders(host),
        logger: options.logger,
        onPromptReady: observeFinalPromptForViewer,
    });
    const databaseBackend = createQQV2DatabaseCurrentApiBackend({
        getDatabaseApi,
        onPromptReady: observeFinalPromptForViewer,
    });
    const backend = createQQV2BackendRouter({
        primaryBackend,
        databaseBackend,
    });
    const resolveApiPreset = (presetId) => (
        isQQV2DatabaseCurrentApiPresetId(presetId)
            ? createQQV2DatabaseCurrentApiPreset()
            : resources.getApiPresetForRequest(presetId)
    );
    const worldbookGateway = options.worldbookGateway || createQQV2SillyTavernWorldbookGateway({
        getContext: () => host.readRawContext?.(),
        captureScopeSession,
    });
    const worldbookContextResolver = options.worldbookContextResolver
        || createWorldbookContextResolver({
            catalog: options.worldbookReadingCatalog || sillyTavernWorldbookReadingCatalog,
            templateRuntime: options.templateRuntime
                ?? sillyTavernWorldbookReadingRuntimes.templateRuntime,
            mvuRuntime: options.mvuRuntime
                ?? sillyTavernWorldbookReadingRuntimes.mvuRuntime,
            shujukuRuntime: options.shujukuRuntime
                ?? sillyTavernWorldbookReadingRuntimes.shujukuRuntime,
        });
    const resolveWorldbookContent = (request) => worldbookContextResolver.resolve(request);
    const resolveWorldbookSettings = async (scopeId, { scopeSession = null } = {}) => {
        assertOptionalCurrentScopeSession(scopeSession);
        const [local, shared] = await Promise.all([
            repository.getWorldbookSettings(scopeId),
            globalRuntimeSettings.get(scopeId, { scopeSession }),
        ]);
        assertOptionalCurrentScopeSession(scopeSession);
        return {
            ...asObject(shared.worldbook),
            bookName: asText(local?.bookName, 256),
        };
    };
    const updateWorldbookSettings = async (scopeId, patch = {}, { scopeSession = null } = {}) => {
        assertOptionalCurrentScopeSession(scopeSession);
        const source = asObject(patch);
        const sharedPatch = {};
        for (const key of ['enabled', 'timeWindow', 'light', 'depth', 'keywords']) {
            if (hasOwn(source, key)) sharedPatch[key] = source[key];
        }
        if (Object.keys(sharedPatch).length > 0) {
            await globalRuntimeSettings.update(scopeId, { worldbook: sharedPatch }, { scopeSession });
            assertOptionalCurrentScopeSession(scopeSession);
        }
        if (hasOwn(source, 'bookName')) {
            await repository.updateWorldbookSettings(
                scopeId,
                { bookName: source.bookName },
                { scopeSession },
            );
            assertOptionalCurrentScopeSession(scopeSession);
        }
        return resolveWorldbookSettings(scopeId, { scopeSession });
    };
    const worldbookSettings = Object.freeze({
        get: resolveWorldbookSettings,
        update: updateWorldbookSettings,
    });
    const projectionService = options.projectionService || createQQV2WorldbookProjectionService({
        repository,
        worldbookGateway,
        worldbookSettings,
    });
    const actionService = options.actionService || createQQV2ActionService({ repository });
    const proactiveStoryTasks = new Map();
    const proactiveRetryTasks = new Map();
    const objectUrlApi = resolveObjectUrlApi(options.objectUrlApi);
    const mediaRenderLeases = new Map();
    const stickerRenderLeases = new Map();
    let mediaRenderLeaseCount = 0;
    let stickerRenderLeaseCount = 0;
    // This is deliberately runtime-only. A conversation is "open" only while
    // its QQ page is visible in the current browser session, never a persisted
    // property of the conversation itself.
    const openedConversationByScope = new Map();
    const subscribers = new Set();
    const deletingConversationKeys = new Set();
    const inactiveProjectionScopeIds = new Set();
    let worldbookMutation = Promise.resolve();

    const runWorldbookMutation = (operation) => {
        const task = worldbookMutation.then(operation, operation);
        worldbookMutation = task.catch(() => {});
        return task;
    };

    const removeInactiveScopeProjections = async (scopeId) => {
        const normalizedScopeId = asText(scopeId, 512);
        if (!normalizedScopeId) return { status: 'removed' };
        let result;
        try {
            result = await projectionService.removeScopeProjections({
                scopeId: normalizedScopeId,
                allowInactiveScope: true,
            });
        } catch {
            result = { status: 'pending' };
        }
        if (result?.status === 'removed') inactiveProjectionScopeIds.delete(normalizedScopeId);
        else inactiveProjectionScopeIds.add(normalizedScopeId);
        return result;
    };

    const clearInactiveScopeProjections = async () => {
        let allRemoved = true;
        const activeScopeId = currentScopeId();
        for (const scopeId of [...inactiveProjectionScopeIds]) {
            if (scopeId === activeScopeId) continue;
            const result = await removeInactiveScopeProjections(scopeId);
            if (result?.status !== 'removed') allRemoved = false;
        }
        return allRemoved;
    };

    const trackAllNonCurrentScopeProjections = async (currentScopeId) => {
        const normalizedCurrentScopeId = asText(currentScopeId, 512);
        const metadata = await repository.listHostMetadata();
        for (const item of metadata) {
            const scopeId = asText(item?.scopeId, 512);
            if (scopeId && scopeId !== normalizedCurrentScopeId) inactiveProjectionScopeIds.add(scopeId);
        }
    };

    const runActiveWorldbookMutation = (scopeId, operation, {
        scopeSession = captureScopeSession(scopeId),
        allowTransition = false,
    } = {}) => runWorldbookMutation(async () => {
        const sessionCanMutate = () => scopeSessionIsCurrent(scopeSession)
            && (allowTransition || scopeSession?.isReady?.() === true);
        if (!sessionCanMutate()) {
            throw scopeInactiveError();
        }
        if (!await clearInactiveScopeProjections()) {
            return { status: 'pending', reason: 'inactive-scope-cleanup' };
        }
        if (!sessionCanMutate()) {
            throw scopeInactiveError();
        }
        let result;
        try {
            result = await operation(scopeSession);
        } catch (error) {
            if (error?.code === 'scope_inactive' || error?.code === 'worldbook_scope_inactive') {
                throw scopeInactiveError();
            }
            throw error;
        }
        if (!sessionCanMutate()) {
            throw scopeInactiveError();
        }
        return result;
    });

    const requireWorldbookMutationResult = (result) => {
        if (result?.reason === 'scope-inactive') throw scopeInactiveError();
        if (result?.status !== 'pending') return result;
        const error = new Error(asText(result?.message, 1000) || 'QQ 世界书同步失败，请稍后重试');
        error.code = asText(result?.code, 128) || 'worldbook_sync_pending';
        throw error;
    };

    const reportWorldbookProjectionPending = (result, { scopeId, conversationId }) => {
        if (result?.status !== 'pending') return;
        try {
            options.logger?.warn?.({
                action: 'worldbook.projection.pending',
                message: asText(result?.message, 1000) || 'QQ 世界书同步失败，请稍后重试',
                errorCode: asText(result?.code, 128) || 'worldbook_sync_pending',
                context: {
                    scopeId: asText(scopeId, 512),
                    conversationId: asText(conversationId, 256),
                    reason: asText(result?.reason, 128),
                },
            });
        } catch {
            // Projection diagnostics cannot undo an already committed QQ mutation.
        }
    };

    const conversationKey = (scopeId, conversationId) => `${asText(scopeId, 512)}\u0000${asText(conversationId, 256)}`;

    const assertConversationWritable = (scopeId, conversationId) => {
        if (deletingConversationKeys.has(conversationKey(scopeId, conversationId))) {
            throw conversationDeletingError();
        }
    };

    const notifySubscribers = async (scopeId = currentScopeId(), details = {}) => {
        const normalizedScopeId = asText(scopeId, 512);
        if (!normalizedScopeId) return;
        const reason = asText(details.reason, 64);
        const conversationId = asText(details.conversationId, 256);
        const event = Object.freeze({
            status: 'changed',
            scopeId: normalizedScopeId,
            ...(reason ? { reason } : {}),
            ...(conversationId ? { conversationId } : {}),
        });
        await Promise.all([...subscribers].map(async (subscriber) => {
            try {
                await subscriber(event);
            } catch {
                // A UI subscriber must not interrupt QQ runtime state changes.
            }
        }));
    };

    const ensureScope = async (scopeId, hostMetadata = null, { scopeSession = null } = {}) => {
        const normalizedScopeId = asText(scopeId, 512);
        if (!normalizedScopeId) throw new TypeError('QQ scopeId is required');
        await repository.ensureScope(normalizedScopeId, hostMetadata, { scopeSession });
        return normalizedScopeId;
    };

    const initializeDefaultWorldbook = async (scopeFacts, scopeSession) => {
        if (!scopeSessionIsCurrent(scopeSession)) return;
        const scopeId = asText(scopeFacts?.scopeId, 512);
        const scope = await repository.getScope(scopeId);
        if (!scopeSessionIsCurrent(scopeSession)) return;
        if (!scope || scope.worldbookDefaultResolved) return;
        let bookName = asText(scope.settings?.worldbook?.bookName, 256);
        if (!bookName && scopeFacts?.hostType === 'character') {
            const binding = await worldbookGateway.getCurrentCharacterBookNames(scopeId, { scopeSession });
            if (!scopeSessionIsCurrent(scopeSession)) return;
            bookName = asText(binding?.primary, 256)
                || asArray(binding?.additional).map((name) => asText(name, 256)).find(Boolean)
                || '';
        }
        if (!scopeSessionIsCurrent(scopeSession)) return;
        await repository.initializeWorldbookDefault(scopeId, bookName, { scopeSession });
    };

    const getExistingScope = (scopeId) => repository.getScope(asText(scopeId, 512));

    const getPrivateConversation = async (scopeId, conversationId) => {
        const conversation = await repository.getConversation(scopeId, asText(conversationId, 256));
        if (conversation && conversation.kind !== 'private') throw privateOnlyError();
        return conversation;
    };

    const nextMediaRenderLeaseId = () => {
        const generated = asText(safeRead(() => options.cryptoApi?.randomUUID?.(), ''), 128);
        if (generated) return `media-render-${generated}`;
        mediaRenderLeaseCount += 1;
        return `media-render-${mediaRenderLeaseCount}`;
    };

    const revokeMediaRenderLease = (leaseId) => {
        const lease = mediaRenderLeases.get(leaseId);
        if (!lease) return false;
        mediaRenderLeases.delete(leaseId);
        try {
            objectUrlApi?.revokeObjectURL(lease.url);
        } catch {
            // Revocation is best effort: the lease must never survive a failed host call.
        }
        return true;
    };

    const revokeMediaRenderLeases = (predicate) => {
        let revoked = 0;
        for (const [leaseId, lease] of mediaRenderLeases) {
            if (predicate(lease) && revokeMediaRenderLease(leaseId)) revoked += 1;
        }
        return revoked;
    };

    const revokeMediaRenderLeasesForScope = (scopeId) => {
        const normalizedScopeId = asText(scopeId, 512);
        if (!normalizedScopeId) return 0;
        return revokeMediaRenderLeases((lease) => lease.scopeId === normalizedScopeId);
    };

    const revokeAllMediaRenderLeases = () => revokeMediaRenderLeases(() => true);

    const nextStickerRenderLeaseId = () => {
        const generated = asText(safeRead(() => options.cryptoApi?.randomUUID?.(), ''), 128);
        if (generated) return `sticker-render-${generated}`;
        stickerRenderLeaseCount += 1;
        return `sticker-render-${stickerRenderLeaseCount}`;
    };

    const revokeStickerRenderLease = (leaseId) => {
        const lease = stickerRenderLeases.get(leaseId);
        if (!lease) return false;
        stickerRenderLeases.delete(leaseId);
        try {
            objectUrlApi?.revokeObjectURL(lease.url);
        } catch {
            // Revocation is best effort: the lease must never survive a failed host call.
        }
        return true;
    };

    const revokeAllStickerRenderLeases = () => {
        let revoked = 0;
        for (const leaseId of stickerRenderLeases.keys()) {
            if (revokeStickerRenderLease(leaseId)) revoked += 1;
        }
        return revoked;
    };

    const revokeMissingMediaRenderLeases = async (scopeId) => {
        const normalizedScopeId = asText(scopeId, 512);
        if (!normalizedScopeId) return 0;
        const scopeLeases = [...mediaRenderLeases.values()].filter((lease) => lease.scopeId === normalizedScopeId);
        const existingAssetIds = new Set((await Promise.all(scopeLeases.map(async (lease) => (
            await repository.getMediaAsset(normalizedScopeId, lease.assetId) ? lease.assetId : ''
        )))).filter(Boolean));
        return revokeMediaRenderLeases((lease) => (
            lease.scopeId === normalizedScopeId && !existingAssetIds.has(lease.assetId)
        ));
    };

    const updateRuntimeSettings = async (scopeId, patch, { scopeSession = null } = {}) => {
        assertOptionalCurrentScopeSession(scopeSession);
        const normalizedScopeId = await ensureScope(scopeId, null, { scopeSession });
        const normalizedPatch = runtimeSettingsPatch(patch);
        if (Object.keys(normalizedPatch).length === 0) {
            const settings = cloneGlobalSettings((await repository.getScope(normalizedScopeId))?.settings);
            assertOptionalCurrentScopeSession(scopeSession);
            return settings;
        }
        await stateStore.transact((state) => {
            assertOptionalCurrentScopeSession(scopeSession);
            const scope = state.scopes?.[normalizedScopeId];
            if (!scope) throw new Error('QQ scope disappeared while saving settings');
            scope.settings = { ...defaultGlobalSettings(), ...asObject(scope.settings) };
            Object.assign(scope.settings, normalizedPatch);
        });
        const settings = cloneGlobalSettings((await repository.getScope(normalizedScopeId))?.settings);
        assertOptionalCurrentScopeSession(scopeSession);
        return settings;
    };

    const resolveRuntimeSettings = async (scopeId, scope = null, { scopeSession = null } = {}) => {
        assertOptionalCurrentScopeSession(scopeSession);
        const saved = scope || await repository.getScope(asText(scopeId, 512));
        const shared = await globalRuntimeSettings.get(scopeId, { scopeSession });
        assertOptionalCurrentScopeSession(scopeSession);
        return {
            ...asObject(saved?.settings),
            ...shared,
            worldbook: {
                ...asObject(shared.worldbook),
                bookName: asText(saved?.settings?.worldbook?.bookName, 256),
            },
            proactive: asObject(shared.proactive),
        };
    };

    const updateSharedRuntimeSettings = async (scopeId, patch, { scopeSession = null } = {}) => {
        assertOptionalCurrentScopeSession(scopeSession);
        const result = await globalRuntimeSettings.update(scopeId, patch, { scopeSession });
        assertOptionalCurrentScopeSession(scopeSession);
        if (result.proactiveChanged) {
            proactiveService?.cancelScope?.({ scopeId });
        }
        assertOptionalCurrentScopeSession(scopeSession);
        return result.settings;
    };

    const clearDeletedPresetReferences = async (presetId, settingKeys) => {
        const normalizedPresetId = asText(presetId, 256);
        if (!normalizedPresetId) return 0;
        const globallyCleared = await globalRuntimeSettings.clearPresetReferences(
            currentScopeId(),
            normalizedPresetId,
            settingKeys,
        );
        const locallyCleared = await stateStore.transact((state) => {
            let cleared = 0;
            for (const scope of Object.values(asObject(state.scopes))) {
                if (!scope || typeof scope !== 'object' || Array.isArray(scope)) continue;
                if (!scope.settings || typeof scope.settings !== 'object' || Array.isArray(scope.settings)) {
                    scope.settings = defaultGlobalSettings();
                }
                for (const settingKey of settingKeys) {
                    if (scope.settings[settingKey] !== normalizedPresetId) continue;
                    scope.settings[settingKey] = BUILT_IN_PROMPT_PRESET_BY_SETTING[settingKey] || '';
                    cleared += 1;
                }
            }
            return cleared;
        });
        return globallyCleared + locallyCleared;
    };

    const getStoryTime = () => asText(safeRead(() => host.readStoryTime(), ''), 128);
    const getUserName = () => asText(safeRead(() => host.readUserIdentity()?.name, ''), 256);
    const composeCharacterImagePrompt = typeof options.composeCharacterImagePrompt === 'function'
        ? options.composeCharacterImagePrompt
        : typeof options.promptComposer?.composeCharacterImagePrompt === 'function'
            ? options.promptComposer.composeCharacterImagePrompt.bind(options.promptComposer)
            : null;
    const imageGenerationService = options.imageGenerationService;
    const now = typeof options.now === 'function' ? options.now : Date.now;
    const getPersonaName = async (input) => {
        if (typeof options.getPersonaName !== 'function') return getUserName();
        return asText(await options.getPersonaName(input), 256) || getUserName();
    };
    const deleteStoredImage = async (path) => {
        const normalizedPath = asText(path, 2048);
        if (!normalizedPath || typeof imageGenerationService?.deleteStoredImage !== 'function') return;
        try {
            await imageGenerationService.deleteStoredImage({ path: normalizedPath });
        } catch (error) {
            options.logger?.warn?.('[QQ v2] 清理生成图片失败', {
                path: normalizedPath,
                error,
            });
        }
    };
    const deleteStoredImages = async (paths) => {
        for (const path of [...new Set(asArray(paths).map((item) => asText(item, 2048)).filter(Boolean))]) {
            await deleteStoredImage(path);
        }
    };
    const listStickers = () => resources.listStickers();

    const resolvePromptContext = async ({ scopeId, scopeSession, conversation, history, scope, runtimeSettings = null }) => {
        const settings = runtimeSettings || await resolveRuntimeSettings(scopeId, scope, { scopeSession });
        const facts = await resolveConversationFacts(repository, scopeId, conversation);
        const visibleHistory = truncateConversationHistory(history, settings.conversationHistoryLimit);
        const { personReferences, referenceByPersonId } = createPersonReferences(facts.people);
        const { messageReferences, visibleMessageRefs } = createMessageReferences(visibleHistory);
        const storyMessages = safeRead(() => host.readStoryMessages(), []);
        const people = facts.people.map((person) => person.formalName);
        const worldbookContent = await resolveWorldbookContent({
            scopeId,
            scopeSession,
            hostMessages: storyMessages,
            people,
            conversations: [{
                messages: formatWorldbookHistory(history, facts.peopleById),
            }],
        });
        const stickers = await listStickers();
        const stickerCatalog = buildQQV2StickerCatalog(stickers);
        const variables = {
            privatePerson: conversation.kind === 'private'
                ? buildPrivateIdentity(conversation, facts.people, referenceByPersonId)
                : '无',
            groupMembers: conversation.kind === 'group'
                ? buildGroupIdentity(conversation, facts.group, facts.peopleById, referenceByPersonId)
                : '无',
            groupHistory: conversation.kind === 'group'
                ? visibleHistory.map((message, index) => formatPromptHistoryMessage(
                    message,
                    `M${index + 1}`,
                    facts.peopleById,
                )).join('\n') || '无'
                : '无',
            storyContext: buildQQV2StoryContext(storyMessages, settings.hostContextTurns, {
                extractTag: settings.hostContextExtractTag,
                excludeTags: settings.hostContextExcludeTags,
            }),
            worldbookContent,
            storyTime: getStoryTime(),
            availableStickers: stickerCatalog.text,
        };
        return {
            variables,
            personReferences,
            messageReferences,
            visibleMessageRefs,
            stickerReferences: stickerCatalog.references,
            history: visibleHistory.map((message, index) => ({
                ...message,
                content: `[M${index + 1}] ${formatQQV2MessageSemantic(message, {
                    resolvePersonName: (personId) => facts.peopleById.get(personId)?.formalName,
                })}`,
            })),
        };
    };

    const syncConversations = async ({
        scopeId,
        scopeSession = captureScopeSession(scopeId),
        conversationIds,
        storyTime = getStoryTime(),
        userName = getUserName(),
    }) => {
        const uniqueIds = [...new Set(asArray(conversationIds).map((id) => asText(id, 256)).filter(Boolean))];
        return runActiveWorldbookMutation(scopeId, async (currentSession) => {
            const conversations = await Promise.all(uniqueIds.map((conversationId) => repository.getConversation(scopeId, conversationId)));
            const results = [];
            for (const conversation of conversations) {
                if (!['private', 'group'].includes(conversation?.kind)) continue;
                const result = await projectionService.syncConversation({
                    scopeId,
                    scopeSession: currentSession,
                    conversationId: conversation.conversationId,
                    storyTime,
                    userName,
                });
                results.push(result);
                reportWorldbookProjectionPending(result, {
                    scopeId,
                    conversationId: conversation.conversationId,
                });
            }
            return results;
        }, { scopeSession });
    };

    const retryPendingConversations = async ({
        scopeId,
        scopeSession,
        storyTime = getStoryTime(),
        userName = getUserName(),
    }) => {
        const conversations = await repository.listConversations(scopeId);
        const conversationIds = conversations
            .filter((conversation) => (
                ['private', 'group'].includes(conversation.kind)
                && conversation.injection?.projection?.pending
            ))
            .map((conversation) => conversation.conversationId);
        await syncConversations({ scopeId, scopeSession, conversationIds, storyTime, userName });
        return conversationIds;
    };

    const markIncomingActionMessagesUnread = async ({ scopeId, scopeSession = null, conversationIds, actionResult }) => {
        const incomingMessageIds = new Set(asArray(actionResult?.applied)
            .filter((action) => action?.type === 'message')
            .map((action) => asText(action?.messageId, 256))
            .filter(Boolean));
        if (incomingMessageIds.size === 0) return [];

        const openedConversationId = openedConversationByScope.get(scopeId) || '';
        const uniqueConversationIds = [...new Set(asArray(conversationIds)
            .map((conversationId) => asText(conversationId, 256))
            .filter(Boolean))];
        const increments = [];
        for (const conversationId of uniqueConversationIds) {
            if (conversationId === openedConversationId) continue;
            const conversation = await repository.getConversation(scopeId, conversationId);
            if (conversation?.kind !== 'private') continue;
            const messages = await repository.listMessages(scopeId, conversationId);
            const amount = messages.filter((message) => (
                incomingMessageIds.has(message.messageId) && message.senderType === 'person'
            )).length;
            if (amount > 0) {
                increments.push(repository.incrementConversationUnread(scopeId, conversationId, amount, { scopeSession }));
            }
        }
        return Promise.all(increments);
    };

    const requestService = options.requestService || createQQV2RequestService({
        repository,
        backend,
        captureScopeSession,
        onProactiveError(error, context) {
            options.logger?.warn?.({
                action: 'proactive.request.failed',
                message: 'QQ 主动回复请求执行失败',
                errorCode: asText(error?.code, 128) || 'request_failed',
                error,
                context,
            });
        },
        runtimeSettingsResolver: resolveRuntimeSettings,
        apiPresetResolver: resolveApiPreset,
        promptPresetResolver: (presetId) => resources.getPromptPreset(presetId),
        parseResponse: parseQQV2Response,
        validateActions: validateQQV2ActionBatch,
        listStickers,
        getStoryTime,
        async buildManualRequest(input) {
            const context = await resolvePromptContext(input);
            return {
                messages: buildManualQQV2Request({
                    preset: input.preset,
                    variables: context.variables,
                    history: context.history,
                    currentMessage: input.currentMessage,
                }),
                references: {
                    [input.conversation.kind === 'group' ? 'G1' : 'P1']: input.conversation.conversationId,
                },
                personReferences: context.personReferences,
                messageReferences: context.messageReferences,
                visibleMessageRefs: context.visibleMessageRefs,
                stickerReferences: context.stickerReferences,
            };
        },
        commitManualActions(input) {
            return actionService.execute(input);
        },
        async afterManualMutation(input) {
            const conversationIds = [input.conversationId, ...asArray(input.actionResult?.createdConversationIds)];
            await markIncomingActionMessagesUnread({
                scopeId: input.scopeId,
                scopeSession: input.scopeSession,
                conversationIds,
                actionResult: input.actionResult,
            });
            await syncConversations({
                scopeId: input.scopeId,
                scopeSession: input.scopeSession,
                conversationIds,
                storyTime: input.storyTime,
            });
            if (input.scopeSession?.isReady?.()) await notifySubscribers(input.scopeId);
        },
    });

    const proactiveService = options.proactiveService || createQQV2ProactiveService({
        repository,
        requestService,
        captureScopeSession,
        runtimeSettingsResolver: resolveRuntimeSettings,
        privateOnly: true,
        backend,
        apiPresetResolver: resolveApiPreset,
        promptPresetResolver: (presetId) => resources.getPromptPreset(presetId),
        listStickers,
        getStoryTime,
        getUserName,
        actionService,
        async getPromptContext({ scopeId, scopeSession, candidates, runtimeSettings, storyTime }) {
            const people = [...new Set(candidates.flatMap((candidate) => [
                candidate.title,
                ...asArray(candidate.members).map((member) => String(member).replace(/^N\d+：/, '')),
            ]).filter(Boolean))];
            const worldbookConversations = await Promise.all(candidates.map(async (candidate) => {
                const messages = await repository.listMessages(scopeId, candidate.conversationId);
                return {
                    ...candidate,
                    messages: formatWorldbookHistory(messages, candidate.peopleById),
                };
            }));
            const storyMessages = safeRead(() => host.readStoryMessages(), []);
            const worldbookContent = await resolveWorldbookContent({
                scopeId,
                scopeSession,
                hostMessages: storyMessages,
                people,
                conversations: worldbookConversations,
            });
            return {
                storyContext: buildQQV2StoryContext(
                    storyMessages,
                    runtimeSettings.hostContextTurns,
                    {
                        extractTag: runtimeSettings.hostContextExtractTag,
                        excludeTags: runtimeSettings.hostContextExcludeTags,
                    },
                ),
                worldbookContent,
                storyTime,
            };
        },
        async syncWorldbook({ scopeId, scopeSession, conversationIds, actionResult, storyTime, userName }) {
            await markIncomingActionMessagesUnread({ scopeId, scopeSession, conversationIds, actionResult });
            return syncConversations({ scopeId, scopeSession, conversationIds, storyTime, userName });
        },
    });


    const runProactiveStoryTask = (scopeId, operation) => {
        const previousTask = proactiveStoryTasks.get(scopeId) || Promise.resolve();
        const task = previousTask.catch(() => {}).then(operation);
        proactiveStoryTasks.set(scopeId, task);
        const clearTask = () => {
            if (proactiveStoryTasks.get(scopeId) === task) proactiveStoryTasks.delete(scopeId);
        };
        task.then(clearTask, clearTask);
        return task;
    };

    const schedulePendingProactiveRetry = (scopeId) => {
        if (proactiveRetryTasks.has(scopeId) || typeof requestService.waitForIdle !== 'function') return;
        const retryToken = {};
        const retryTask = Promise.resolve().then(async () => {
            await requestService.waitForIdle();
            if (proactiveRetryTasks.get(scopeId)?.token !== retryToken) return;
            proactiveRetryTasks.delete(scopeId);
            const scopeSession = captureScopeSession(scopeId);
            if (!scopeSessionIsCurrent(scopeSession) || scopeSession?.isReady?.() !== true) return;
            await runProactiveStoryTask(scopeId, () => enqueuePersistedDueProactive(
                scopeId,
                scopeSession,
                { retryWhenBusy: false },
            ));
        }).catch((error) => {
            if (proactiveRetryTasks.get(scopeId)?.token === retryToken) {
                proactiveRetryTasks.delete(scopeId);
            }
            options.logger?.warn?.({
                action: 'proactive.retry.failed',
                message: 'QQ 主动回复等待请求队列空闲后补跑失败',
                error,
                context: { scopeId },
            });
        });
        proactiveRetryTasks.set(scopeId, { token: retryToken, task: retryTask });
    };

    async function enqueuePersistedDueProactive(scopeId, scopeSession, { retryWhenBusy = true } = {}) {
        if (!scopeSessionIsCurrent(scopeSession) || scopeSession?.isReady?.() !== true) return;
        const [progress, settings] = await Promise.all([
            repository.getProactiveProgress(scopeId),
            proactiveService.getState(scopeId, { scopeSession }),
        ]);
        if (!scopeSessionIsCurrent(scopeSession) || scopeSession?.isReady?.() !== true) return;
        const everyTurns = Number(settings?.everyTurns);
        const counter = Number.isInteger(Number(progress?.counter))
            ? Math.max(0, Number(progress.counter))
            : 0;
        if (settings?.enabled !== true
            || !Number.isInteger(everyTurns)
            || everyTurns <= 0
            || counter < everyTurns) {
            return;
        }

        const enqueueResult = await proactiveService.enqueueProactiveCycle({ scopeId, scopeSession });
        if (!scopeSessionIsCurrent(scopeSession) || scopeSession?.isReady?.() !== true) return;
        options.logger?.debug?.({
            action: 'proactive.enqueue.result',
            message: enqueueResult?.queued === true ? 'QQ 主动回复已进入请求队列' : 'QQ 主动回复暂未进入请求队列',
            context: {
                scopeId,
                counter,
                everyTurns,
                queued: enqueueResult?.queued === true,
                skipped: asText(enqueueResult?.skipped, 80),
            },
        });
        if (enqueueResult?.queued !== true) {
            if (retryWhenBusy
                && ['manual-pending', 'proactive-pending'].includes(asText(enqueueResult?.skipped, 80))) {
                schedulePendingProactiveRetry(scopeId);
            }
            return;
        }

        const remainingCounter = Math.max(0, counter - everyTurns);
        await repository.updateProactiveProgress(scopeId, {
            counter: remainingCounter,
        }, { scopeSession });
        if (remainingCounter >= everyTurns) schedulePendingProactiveRetry(scopeId);
    }

    const scheduleProactiveStoryReply = (facts) => {
        const scopeId = asText(facts?.scope?.scopeId, 512);
        const scopeSession = facts?.scopeSession;
        if (!scopeId || scopeSession?.isReady?.() !== true) return Promise.resolve();
        const storyMessages = asArray(facts?.storyMessages);
        const messageId = asText(facts?.messageId, 180);
        const receivedMessage = storyMessages.find((message) => (
            asText(message?.messageId, 180) === messageId
        ));
        if (!isEligibleStoryReply(receivedMessage)) return Promise.resolve();
        const storyMessageKey = [
            messageId,
            storyMessages.length,
            countEligibleStoryAiFloors(storyMessages),
        ].join(':');
        return runProactiveStoryTask(scopeId, async () => {
            if (!scopeSessionIsCurrent(scopeSession) || scopeSession?.isReady?.() !== true) return;
            const progress = await repository.getProactiveProgress(scopeId);
            if (!scopeSessionIsCurrent(scopeSession) || scopeSession?.isReady?.() !== true) return;
            if (asText(progress?.lastStoryMessageKey, 512) === storyMessageKey) return;
            const settings = await proactiveService.getState(scopeId, { scopeSession });
            if (!scopeSessionIsCurrent(scopeSession) || scopeSession?.isReady?.() !== true) return;
            const everyTurns = Number(settings?.everyTurns);
            if (settings?.enabled !== true || !Number.isInteger(everyTurns) || everyTurns <= 0) {
                await repository.updateProactiveProgress(scopeId, {
                    lastStoryMessageKey: storyMessageKey,
                }, { scopeSession });
                return;
            }
            const currentCounter = Number.isInteger(Number(progress?.counter))
                ? Math.max(0, Number(progress.counter))
                : 0;
            const nextCounter = currentCounter + 1;
            await repository.updateProactiveProgress(scopeId, {
                counter: nextCounter,
                lastStoryMessageKey: storyMessageKey,
            }, { scopeSession });
            options.logger?.debug?.({
                action: 'proactive.counter.advanced',
                message: 'QQ 主动回复轮次已推进',
                context: {
                    scopeId,
                    messageId,
                    counter: nextCounter,
                    everyTurns,
                    due: nextCounter >= everyTurns,
                },
            });
            if (!scopeSessionIsCurrent(scopeSession) || scopeSession?.isReady?.() !== true) return;
            if (nextCounter >= everyTurns) {
                await enqueuePersistedDueProactive(scopeId, scopeSession);
            }
        });
    };
    const clearScopeRuntimeState = (scopeId) => {
        proactiveStoryTasks.delete(scopeId);
        proactiveRetryTasks.delete(scopeId);
        openedConversationByScope.delete(scopeId);
        revokeMediaRenderLeasesForScope(scopeId);
    };

    const finalizeHostScopeDeletion = async (scopeId) => {
        const projection = await runWorldbookMutation(() => removeInactiveScopeProjections(scopeId));
        if (projection?.status !== 'removed') return { status: 'pending', scopeId };
        const deletion = await repository.deleteScope(scopeId);
        clearScopeRuntimeState(scopeId);
        await deleteStoredImages(deletion?.releasedGeneratedImagePaths);
        return { status: 'deleted', scopeId };
    };

    const retryPendingHostScopeDeletions = async () => {
        const pendingScopeIds = typeof repository.listPendingHostDeletionScopeIds === 'function'
            ? await repository.listPendingHostDeletionScopeIds()
            : [];
        const results = [];
        const activeScopeId = currentScopeId();
        for (const scopeId of pendingScopeIds) {
            if (scopeId === activeScopeId) continue;
            results.push(await finalizeHostScopeDeletion(scopeId));
        }
        return results;
    };

    lifecycle = createQQV2Runtime({
        host,
        async onScopeChanged(scope, _generation, scopeSession, previousScopeSession) {
            const previousScopeId = asText(previousScopeSession?.scopeId, 512);
            if (previousScopeId && previousScopeId !== scope.scopeId) {
                requestService.cancelScope?.({ scopeId: previousScopeId, reason: 'scope-changed' });
                proactiveService.cancelScope?.({ scopeId: previousScopeId });
                clearScopeRuntimeState(previousScopeId);
            }
            if (!scopeSessionIsCurrent(scopeSession)) return;
            await ensureScope(scope.scopeId, scope, { scopeSession });
            if (!scopeSessionIsCurrent(scopeSession)) return;
            await initializeDefaultWorldbook(scope, scopeSession).catch(() => {});
            if (!scopeSessionIsCurrent(scopeSession)) return;
            await trackAllNonCurrentScopeProjections(scope.scopeId);
            if (!scopeSessionIsCurrent(scopeSession)) return;
            const inactiveProjectionsRemoved = await runWorldbookMutation(() => clearInactiveScopeProjections());
            if (!scopeSessionIsCurrent(scopeSession)) return;
            await retryPendingHostScopeDeletions();
            if (!scopeSessionIsCurrent(scopeSession)) return;
            if (inactiveProjectionsRemoved && typeof projectionService.reconcileScope === 'function') {
                await runActiveWorldbookMutation(scope.scopeId, (currentSession) => projectionService.reconcileScope({
                    scopeId: scope.scopeId,
                    scopeSession: currentSession,
                    userName: getUserName(),
                    storyTime: getStoryTime(),
                }), { scopeSession, allowTransition: true });
            }
        },
        async onScopeReady(scopeSession) {
            if (!scopeSession?.isReady?.()) return;
            await notifySubscribers(scopeSession.scopeId);
            await runProactiveStoryTask(scopeSession.scopeId, () => enqueuePersistedDueProactive(
                scopeSession.scopeId,
                scopeSession,
            ));
        },
        async onMessageReceived(facts) {
            await scheduleProactiveStoryReply(facts);
        },
        onUnavailable({ previous } = {}) {
            const scopeId = asText(previous?.scopeId, 512);
            if (scopeId) {
                requestService.cancelScope?.({ scopeId, reason: 'host-unavailable' });
                proactiveService.cancelScope?.({ scopeId });
                clearScopeRuntimeState(scopeId);
            }
        },
        onDestroy({ previous } = {}) {
            const scopeId = asText(previous?.scopeId, 512);
            if (scopeId) {
                requestService.cancelScope?.({ scopeId, reason: 'destroyed' });
                proactiveService.cancelScope?.({ scopeId });
            }
            proactiveStoryTasks.clear();
            proactiveRetryTasks.clear();
            openedConversationByScope.clear();
            inactiveProjectionScopeIds.clear();
            revokeAllMediaRenderLeases();
            revokeAllStickerRenderLeases();
            void stateStore.close?.();
        },
    });

    const resolveDeletedHostScope = async (fact, metadata) => {
        const resolution = resolveDeletedQQV2Scope(fact, metadata);
        if (resolution.status !== 'ambiguous') return resolution;
        if (fact.hostType !== 'character' || typeof host.listCharacterChatFiles !== 'function') {
            return { ...resolution, status: 'unresolved', reason: 'candidate-chat-list-unavailable' };
        }

        const hostIds = [...new Set(resolution.candidates.map((candidate) => candidate.hostId))];
        const lookups = await Promise.all(hostIds.map((candidateHostId) => (
            host.listCharacterChatFiles(candidateHostId)
        )));
        if (lookups.some((lookup) => lookup?.status !== 'resolved')) {
            return { ...resolution, status: 'unresolved', reason: 'candidate-chat-list-failed', lookups };
        }

        const remainingFilesByHost = new Map(lookups.map((lookup) => [
            lookup.hostId,
            new Set(asArray(lookup.chatFiles).map((chatFile) => asText(chatFile, 512))),
        ]));
        const missingCandidates = resolution.candidates.filter((candidate) => (
            !remainingFilesByHost.get(candidate.hostId)?.has(fact.deletedChatId)
        ));
        if (missingCandidates.length !== 1) {
            return {
                ...resolution,
                status: 'unresolved',
                reason: missingCandidates.length === 0
                    ? 'deleted-chat-still-present'
                    : 'multiple-deleted-candidates',
                lookups,
                missingCandidateScopeIds: missingCandidates.map((candidate) => candidate.scopeId),
            };
        }
        return {
            ...resolution,
            status: 'matched',
            match: 'verified-missing-from-host',
            scope: missingCandidates[0],
            lookups,
        };
    };

    const deleteHostScope = async (kind, deletion) => {
        const deletedChatId = deletion && typeof deletion === 'object'
            ? deletion.deletedChatId
            : deletion;
        const hostId = deletion && typeof deletion === 'object' ? deletion.hostId : '';
        const metadata = await repository.listHostMetadata();
        const fact = createHostChatDeletedFact(kind, deletedChatId, { hostId });
        if (fact.hostType === 'group') {
            return { status: 'skipped', reason: 'group-delete-not-confirmed' };
        }
        const resolution = await resolveDeletedHostScope(fact, metadata);
        if (resolution.status !== 'matched') return resolution;

        const scopeId = resolution.scope.scopeId;
        await repository.markScopeHostDeletionPending?.(scopeId, true);
        const conversations = await repository.listConversations(scopeId);
        await Promise.all(conversations.map((conversation) => requestService.cancelConversation?.({
            scopeId,
            conversationId: conversation.conversationId,
        })));
        proactiveService.cancelScope?.({ scopeId });
        inactiveProjectionScopeIds.add(scopeId);
        return finalizeHostScopeDeletion(scopeId);
    };

    const application = {
        async initialize() {
            try {
                await defaultImageLibrary.ensureInstalled();
            } catch (error) {
                options.logger?.warn?.('[QQ v2] 默认图片资料初始化失败，将在下次启动重试', error);
            }
            return lifecycle.initialize();
        },
        handleChatChanged: (...args) => lifecycle.handleChatChanged(...args),
        handleChatDeleted: (chatFile) => runHostMutation(() => deleteHostScope('character', chatFile)),
        handleGroupChatDeleted: (chatId) => runHostMutation(() => deleteHostScope('group', chatId)),
        handleCharacterMessageRendered: (...args) => lifecycle.handleCharacterMessageRendered(...args),
        handleMessageReceived: (...args) => lifecycle.handleMessageReceived(...args),
        subscribe(listener) {
            if (typeof listener !== 'function') return () => {};
            subscribers.add(listener);
            return () => subscribers.delete(listener);
        },
        getStatus: () => lifecycle.getStatus(),
        async getSnapshot() {
            const status = lifecycle.getStatus();
            if (status.phase === 'destroyed') {
                return { phase: 'destroyed', context: currentContext(host, null), globalSettings: defaultGlobalSettings() };
            }
            const scope = lifecycle.getActiveScope();
            if (!scope?.scopeId) {
                return { phase: status.phase, context: currentContext(host, null), globalSettings: defaultGlobalSettings() };
            }
            const scopeSession = captureScopeSession(scope.scopeId);
            const [saved, runtimeSettings] = await Promise.all([
                repository.getScope(scope.scopeId),
                resolveRuntimeSettings(scope.scopeId, null, { scopeSession }),
            ]);
            return {
                phase: status.phase,
                context: currentContext(host, scope),
                globalSettings: cloneGlobalSettings({
                    ...saved?.settings,
                    ...runtimeSettings,
                }),
            };
        },
        async listSharedResources() {
            const [storedApiPresets, promptPresets, stickers] = await Promise.all([
                resources.listApiPresets(),
                resources.listPromptPresets(),
                resources.listStickers(),
            ]);
            const apiPresets = [...storedApiPresets];
            const databaseApi = safeRead(getDatabaseApi, null);
            if (typeof databaseApi?.callAI === 'function') {
                apiPresets.push(createQQV2DatabaseCurrentApiPreset());
            }
            return { apiPresets, promptPresets, stickers };
        },
        exportImageLibraryPack: () => imageLibraryPacks.exportPack(),
        async importImageLibraryPack({ source } = {}) {
            const result = await imageLibraryPacks.importPack(source);
            revokeAllMediaRenderLeases();
            revokeAllStickerRenderLeases();
            await notifySubscribers();
            return result;
        },
        async acquireStickerRender({ stickerId }) {
            const normalizedStickerId = asText(stickerId, 256);
            if (!normalizedStickerId) return null;
            if (!objectUrlApi) {
                const error = new Error('QQ sticker render URL is unavailable in the current runtime');
                error.code = 'sticker_render_unavailable';
                throw error;
            }
            const blob = await resources.getStickerBlob(normalizedStickerId);
            if (!blob) return null;
            const url = objectUrlApi.createObjectURL(blob);
            const leaseId = nextStickerRenderLeaseId();
            stickerRenderLeases.set(leaseId, { stickerId: normalizedStickerId, url });
            return { stickerId: normalizedStickerId, leaseId, url };
        },
        async releaseStickerRender({ leaseId }) {
            return revokeStickerRenderLease(asText(leaseId, 256));
        },
        saveSticker: ({ sticker } = {}) => resources.saveSticker(asObject(sticker)),
        saveStickers: ({ stickers } = {}) => resources.saveStickers(asArray(stickers).map(asObject)),
        moveSticker: ({ stickerId, targetIndex } = {}) => resources.moveSticker(
            asText(stickerId, 256),
            Number(targetIndex),
        ),
        deleteSticker: ({ stickerId } = {}) => resources.deleteSticker(asText(stickerId, 256)),
        savePromptPreset: ({ preset } = {}) => resources.savePromptPreset(asObject(preset)),
        exportPromptPreset: ({ promptPresetId } = {}) => resources.exportPromptPreset(asText(promptPresetId, 256)),
        exportAllPromptPresets: () => resources.exportAllPromptPresets(),
        importPromptPresets: ({ source } = {}) => resources.importPromptPresets(source),
        restoreBuiltInPromptPreset: ({ promptPresetId } = {}) => resources.restoreBuiltInPromptPreset(
            asText(promptPresetId, 256),
        ),
        restoreAllBuiltInPromptPresets: () => resources.restoreAllBuiltInPromptPresets(),
        async deletePromptPreset({ promptPresetId } = {}) {
            const id = asText(promptPresetId, 256);
            const deleted = await resources.deletePromptPreset(id);
            if (!deleted) return false;
            await clearDeletedPresetReferences(id, [
                'privateReplyPresetId',
                'privateProactivePresetId',
                'groupReplyPresetId',
                'groupProactivePresetId',
            ]);
            return true;
        },
        saveApiPreset: ({ preset } = {}) => resources.saveApiPreset(asObject(preset)),
        async deleteApiPreset({ apiPresetId } = {}) {
            const id = asText(apiPresetId, 256);
            const deleted = await resources.deleteApiPreset(id);
            if (!deleted) return false;
            await clearDeletedPresetReferences(id, ['activeApiPresetId']);
            return true;
        },
        loadModels: ({ apiPresetId, draft } = {}) => {
            const id = asText(apiPresetId, 256);
            return requestService.loadModels({
                ...(id ? { apiPresetId: id } : {}),
                ...(draft !== undefined ? { draft: cloneModelLoadDraft(draft) } : {}),
            });
        },
        async listConversations({ scopeId }) {
            if (!await getExistingScope(scopeId)) return [];
            const summaries = await repository.listConversationSummaries(scopeId);
            return summaries.filter(({ conversation }) => conversation.kind === 'private').map((summary) => ({
                ...summary.conversation,
                person: summary.person,
                group: summary.group,
                lastMessage: summary.lastMessage,
                unreadCount: Number(summary.conversation.unreadCount) || 0,
                request: requestService.getConversationState(scopeId, summary.conversation.conversationId),
            }));
        },
        async getConversation({ scopeId, conversationId }) {
            if (!await getExistingScope(scopeId)) return null;
            const summary = await repository.getConversationSummary(scopeId, conversationId);
            const conversation = summary?.conversation;
            if (!conversation || conversation.kind !== 'private') return null;
            return {
                ...conversation,
                person: summary.person,
                group: summary.group,
                lastMessage: summary.lastMessage,
                unreadCount: Number(conversation.unreadCount) || 0,
                request: requestService.getConversationState(scopeId, conversationId),
            };
        },
        async listMessages({ scopeId, conversationId, beforeSequence, limit = 50 }) {
            if (!await getExistingScope(scopeId)) {
                return { items: [], hasMore: false, nextBeforeSequence: null };
            }
            const conversation = await repository.getConversation(scopeId, conversationId);
            if (conversation?.kind !== 'private') {
                return { items: [], hasMore: false, nextBeforeSequence: null };
            }
            const all = await repository.listMessages(scopeId, conversationId);
            const before = Number.isInteger(Number(beforeSequence)) ? Number(beforeSequence) : Number.POSITIVE_INFINITY;
            const eligible = all.filter((message) => Number(message.sequence) < before);
            const size = Math.max(1, Math.min(200, Number(limit) || 50));
            const items = eligible.slice(-size);
            return {
                items,
                hasMore: eligible.length > items.length,
                nextBeforeSequence: items[0]?.sequence ?? null,
            };
        },
        async getPerson({ scopeId, personId }) {
            if (!await getExistingScope(scopeId)) return null;
            return repository.getPerson(scopeId, personId);
        },
        async getCurrentProfile({ scopeId }) {
            if (!await getExistingScope(scopeId)) return null;
            return repository.getCurrentProfile(scopeId);
        },
        async listImageLibraryAssets({ scopeId, library }) {
            if (!await getExistingScope(scopeId)) return [];
            return repository.listImageLibraryAssets(scopeId, library);
        },
        async getMedia({ scopeId, assetId }) {
            if (!await getExistingScope(scopeId)) return null;
            return repository.getMediaAsset(scopeId, assetId);
        },
        async acquireMediaRender({ scopeId, assetId }) {
            const normalizedScopeId = asText(scopeId, 512);
            if (!normalizedScopeId || !await getExistingScope(normalizedScopeId)) return null;
            if (!objectUrlApi) {
                const error = new Error('QQ 媒体渲染地址在当前运行环境不可用');
                error.code = 'media_render_unavailable';
                throw error;
            }
            const asset = await application.getMedia({
                scopeId: normalizedScopeId,
                assetId: asText(assetId, 256),
            });
            if (!asset?.blob) return null;

            let url;
            try {
                url = objectUrlApi.createObjectURL(asset.blob);
            } catch (cause) {
                const error = new Error('QQ 媒体渲染地址创建失败');
                error.code = 'media_render_unavailable';
                error.cause = cause;
                throw error;
            }
            const leaseId = nextMediaRenderLeaseId();
            mediaRenderLeases.set(leaseId, {
                scopeId: normalizedScopeId,
                assetId: asText(asset.assetId, 256),
                url,
            });
            return {
                assetId: asText(asset.assetId, 256),
                conversationId: asText(asset.conversationId, 256),
                kind: asText(asset.kind, 32),
                mimeType: asText(asset.mimeType, 128),
                size: Math.max(0, Number(asset.blob.size) || 0),
                leaseId,
                url,
            };
        },
        async releaseMediaRender({ scopeId, leaseId }) {
            const normalizedScopeId = asText(scopeId, 512);
            const normalizedLeaseId = asText(leaseId, 256);
            const lease = mediaRenderLeases.get(normalizedLeaseId);
            if (!lease || lease.scopeId !== normalizedScopeId) return false;
            return revokeMediaRenderLease(normalizedLeaseId);
        },
        async getRequestState({ scopeId, conversationId }) {
            if (!await getExistingScope(scopeId)) {
                return { phase: 'idle', pendingUserMessageCount: 0, error: '' };
            }
            const conversation = await repository.getConversation(scopeId, conversationId);
            if (conversation?.kind !== 'private') {
                return { phase: 'idle', pendingUserMessageCount: 0, error: '' };
            }
            return requestService.getConversationState(scopeId, conversationId);
        },
        async getUnreadState({ scopeId }) {
            if (!await getExistingScope(scopeId)) return { total: 0, byConversationId: {} };
            const conversations = await repository.listConversations(scopeId);
            const byConversationId = Object.fromEntries(conversations.filter((conversation) => conversation.kind === 'private').map((conversation) => [
                conversation.conversationId,
                Number(conversation.unreadCount) || 0,
            ]));
            return {
                total: Object.values(byConversationId).reduce((sum, count) => sum + count, 0),
                byConversationId,
            };
        },
        async openConversation({ scopeId, conversationId }) {
            const scopeSession = captureReadyScopeSession(scopeId);
            const normalizedScopeId = await ensureScope(scopeId, null, { scopeSession });
            assertConversationWritable(normalizedScopeId, conversationId);
            await getPrivateConversation(normalizedScopeId, conversationId);
            assertReadyScopeSession(scopeSession);
            const result = await repository.openConversation(
                normalizedScopeId,
                asText(conversationId, 256),
                { scopeSession },
            );
            assertReadyScopeSession(scopeSession);
            openedConversationByScope.set(normalizedScopeId, result.conversationId);
            assertReadyScopeSession(scopeSession);
            await notifySubscribers(normalizedScopeId, {
                reason: 'conversation-opened',
                conversationId: result.conversationId,
            });
            return result;
        },
        async closeConversation({ scopeId, conversationId }) {
            const scopeSession = captureReadyScopeSession(scopeId);
            const normalizedScopeId = await ensureScope(scopeId, null, { scopeSession });
            assertReadyScopeSession(scopeSession);
            const normalizedConversationId = asText(conversationId, 256);
            const openedConversationId = openedConversationByScope.get(normalizedScopeId) || '';
            if (!normalizedConversationId || openedConversationId === normalizedConversationId) {
                openedConversationByScope.delete(normalizedScopeId);
            }
            return {
                conversationId: normalizedConversationId || openedConversationId,
                closed: !normalizedConversationId || openedConversationId === normalizedConversationId,
            };
        },
        async saveMedia({ scopeId, media = {} }) {
            const scopeSession = captureReadyScopeSession(scopeId);
            const normalizedScopeId = await ensureScope(scopeId, null, { scopeSession });
            const source = asObject(media);
            if (asText(source.conversationId, 256)) {
                assertConversationWritable(normalizedScopeId, source.conversationId);
            }
            assertReadyScopeSession(scopeSession);
            return repository.saveScopeAsset(normalizedScopeId, source, { scopeSession });
        },
        async updateCurrentProfile({ scopeId, profile = {} }) {
            const scopeSession = captureReadyScopeSession(scopeId);
            const normalizedScopeId = await ensureScope(scopeId, null, { scopeSession });
            const result = await repository.updateCurrentProfile(normalizedScopeId, asObject(profile), { scopeSession });
            await revokeMissingMediaRenderLeases(normalizedScopeId);
            await notifySubscribers(normalizedScopeId);
            return result;
        },
        async saveImageLibraryAsset({ scopeId, library, blob, mimeType = '' }) {
            const scopeSession = captureReadyScopeSession(scopeId);
            const normalizedScopeId = await ensureScope(scopeId, null, { scopeSession });
            const asset = await repository.saveImageLibraryAsset(
                normalizedScopeId,
                { library, blob, mimeType },
                { scopeSession },
            );
            await notifySubscribers(normalizedScopeId);
            return asset;
        },
        async saveImageLibraryAssets({ scopeId, assets = [] }) {
            const scopeSession = captureReadyScopeSession(scopeId);
            const normalizedScopeId = await ensureScope(scopeId, null, { scopeSession });
            const saved = await repository.saveImageLibraryAssets(
                normalizedScopeId,
                asArray(assets).map(asObject),
                { scopeSession },
            );
            await notifySubscribers(normalizedScopeId);
            return saved;
        },
        async deleteImageLibraryAssets({ scopeId, assetIds }) {
            const scopeSession = captureReadyScopeSession(scopeId);
            const normalizedScopeId = await ensureScope(scopeId, null, { scopeSession });
            const result = await repository.deleteImageLibraryAssets(normalizedScopeId, assetIds, { scopeSession });
            await revokeMissingMediaRenderLeases(normalizedScopeId);
            await notifySubscribers(normalizedScopeId);
            return result;
        },
        async updatePrivateProfile({ scopeId, conversationId, profile = {} }) {
            const scopeSession = captureReadyScopeSession(scopeId);
            const normalizedScopeId = await ensureScope(scopeId, null, { scopeSession });
            assertConversationWritable(normalizedScopeId, conversationId);
            await getPrivateConversation(normalizedScopeId, conversationId);
            const result = await repository.updatePrivateProfile(
                normalizedScopeId,
                asText(conversationId, 256),
                asObject(profile),
                { scopeSession },
            );
            const conversation = await application.getConversation({
                scopeId: normalizedScopeId,
                conversationId: result.conversation.conversationId,
            });
            await revokeMissingMediaRenderLeases(normalizedScopeId);
            await notifySubscribers(normalizedScopeId);
            return { person: conversation?.person || result.person, conversation: conversation || result.conversation };
        },
        async removePrivateFriend({ scopeId, conversationId, userName = getUserName(), storyTime = getStoryTime() }) {
            const scopeSession = captureReadyScopeSession(scopeId);
            const normalizedScopeId = await ensureScope(scopeId, null, { scopeSession });
            assertConversationWritable(normalizedScopeId, conversationId);
            await getPrivateConversation(normalizedScopeId, conversationId);
            const result = await repository.removePrivateFriend(normalizedScopeId, asText(conversationId, 256), {
                userName: asText(userName, 120),
                storyTime: asText(storyTime, 128),
            }, { scopeSession });
            await requestService.cancelConversation?.({ scopeId: normalizedScopeId, conversationId });
            await notifySubscribers(normalizedScopeId);
            return result;
        },
        async handleIncomingTransfer({ scopeId, conversationId, messageId, action, storyTime = getStoryTime() }) {
            const scopeSession = captureReadyScopeSession(scopeId);
            const normalizedScopeId = await ensureScope(scopeId, null, { scopeSession });
            assertConversationWritable(normalizedScopeId, conversationId);
            await getPrivateConversation(normalizedScopeId, conversationId);
            const result = await repository.handleIncomingTransfer(
                normalizedScopeId,
                asText(conversationId, 256),
                asText(messageId, 256),
                asText(action, 32),
                asText(storyTime, 128),
                { scopeSession },
            );
            await notifySubscribers(normalizedScopeId);
            return result;
        },
        async updateGroupProfile() {
            throw privateOnlyError();
        },
        async manageGroup() {
            throw privateOnlyError();
        },
        async listWorldbooks({ scopeId }) {
            const scopeSession = captureScopeSession(scopeId);
            if (!scopeSession?.isReady?.()) return [];
            const normalizedScopeId = asText(scopeId, 512);
            if (!normalizedScopeId) return [];
            const names = await worldbookGateway.listBookNames(normalizedScopeId, { scopeSession });
            if (!scopeSession?.isReady?.()) return [];
            return asArray(names).map((bookName) => asText(bookName, 256)).filter(Boolean).map((bookName) => ({
                bookName,
                entryCount: 0,
            }));
        },
        async getProactiveState({ scopeId }) {
            const scopeSession = captureReadyScopeSession(scopeId);
            const normalizedScopeId = await ensureScope(scopeId, null, { scopeSession });
            return proactiveService.getState(normalizedScopeId, { scopeSession });
        },
        async configureProactive({ scopeId, settings = {} }) {
            const scopeSession = captureReadyScopeSession(scopeId);
            const normalizedScopeId = await ensureScope(scopeId, null, { scopeSession });
            await updateSharedRuntimeSettings(normalizedScopeId, { proactive: asObject(settings) }, { scopeSession });
            const result = await proactiveService.getState(normalizedScopeId, { scopeSession });
            await notifySubscribers(normalizedScopeId);
            return result;
        },
        async updateGlobalSettings({ scopeId, settings = {}, userName = getUserName(), storyTime = getStoryTime() }) {
            const scopeSession = captureReadyScopeSession(scopeId);
            const normalizedScopeId = await ensureScope(scopeId, null, { scopeSession });
            const source = asObject(settings);
            const scalarPatch = runtimeSettingsPatch(source);
            const sharedPatch = {};
            for (const key of [
                'activeApiPresetId',
                'privateReplyPresetId',
                'privateProactivePresetId',
                'hostContextTurns',
                'conversationHistoryLimit',
                'hostContextExtractTag',
                'hostContextExcludeTags',
            ]) {
                if (!hasOwn(source, key)) continue;
                sharedPatch[key] = scalarPatch[key];
                delete scalarPatch[key];
            }
            if (hasOwn(source, 'proactive')) {
                const proactive = asObject(source.proactive);
                sharedPatch.proactive = {
                    ...(hasOwn(proactive, 'enabled') ? { enabled: proactive.enabled === true } : {}),
                    ...(hasOwn(proactive, 'everyTurns') ? { everyTurns: proactive.everyTurns } : {}),
                };
            }
            if (hasOwn(source, 'worldbook')) {
                requireWorldbookMutationResult(await runActiveWorldbookMutation(normalizedScopeId, (scopeSession) => projectionService.setGlobalSettings({
                    scopeId: normalizedScopeId,
                    scopeSession,
                    settings: asObject(source.worldbook),
                    userName: asText(userName, 256),
                    storyTime: asText(storyTime, 128),
                }), { scopeSession }));
            }
            if (Object.keys(sharedPatch).length > 0) {
                await updateSharedRuntimeSettings(normalizedScopeId, sharedPatch, { scopeSession });
            }
            if (Object.keys(scalarPatch).length > 0) {
                await updateRuntimeSettings(normalizedScopeId, scalarPatch, { scopeSession });
            }
            const [saved, runtimeSettings] = await Promise.all([
                repository.getScope(normalizedScopeId),
                resolveRuntimeSettings(normalizedScopeId, null, { scopeSession }),
            ]);
            assertReadyScopeSession(scopeSession);
            const settingsResult = cloneGlobalSettings({ ...saved?.settings, ...runtimeSettings });
            await notifySubscribers(normalizedScopeId);
            return settingsResult;
        },
        async setConversationInjection({ scopeId, conversationId, injection = {}, userName = getUserName(), storyTime = getStoryTime() }) {
            const scopeSession = captureReadyScopeSession(scopeId);
            const normalizedScopeId = await ensureScope(scopeId, null, { scopeSession });
            assertConversationWritable(normalizedScopeId, conversationId);
            await getPrivateConversation(normalizedScopeId, conversationId);
            requireWorldbookMutationResult(await runActiveWorldbookMutation(normalizedScopeId, (scopeSession) => projectionService.setConversationInjection({
                scopeId: normalizedScopeId,
                scopeSession,
                conversationId: asText(conversationId, 256),
                injection: asObject(injection),
                userName: asText(userName, 256),
                storyTime: asText(storyTime, 128),
            }), { scopeSession }));
            const injectionResult = (await repository.getConversation(normalizedScopeId, conversationId))?.injection || null;
            await notifySubscribers(normalizedScopeId);
            return injectionResult;
        },
        async setMessageSelectedForInjection({
            scopeId,
            conversationId,
            messageId,
            selected,
            userName = getUserName(),
            storyTime = getStoryTime(),
        }) {
            const scopeSession = captureReadyScopeSession(scopeId);
            const normalizedScopeId = await ensureScope(scopeId, null, { scopeSession });
            assertConversationWritable(normalizedScopeId, conversationId);
            await getPrivateConversation(normalizedScopeId, conversationId);
            requireWorldbookMutationResult(await runActiveWorldbookMutation(normalizedScopeId, (scopeSession) => projectionService.setMessageSelected({
                scopeId: normalizedScopeId,
                scopeSession,
                conversationId: asText(conversationId, 256),
                messageId: asText(messageId, 256),
                selected: selected === true,
                userName: asText(userName, 256),
                storyTime: asText(storyTime, 128),
            }), { scopeSession }));
            const [conversation, messages] = await Promise.all([
                repository.getConversation(normalizedScopeId, conversationId),
                repository.listMessages(normalizedScopeId, conversationId),
            ]);
            const result = {
                message: messages.find((message) => message.messageId === asText(messageId, 256)) || null,
                injection: conversation?.injection || null,
            };
            await notifySubscribers(normalizedScopeId);
            return result;
        },
        async setMessagesSelectedForInjection({
            scopeId,
            conversationId,
            messageIds = [],
            selected,
            userName = getUserName(),
            storyTime = getStoryTime(),
        }) {
            const scopeSession = captureReadyScopeSession(scopeId);
            const normalizedScopeId = await ensureScope(scopeId, null, { scopeSession });
            assertConversationWritable(normalizedScopeId, conversationId);
            await getPrivateConversation(normalizedScopeId, conversationId);
            const ids = [...new Set(asArray(messageIds).map((id) => asText(id, 256)).filter(Boolean))];
            requireWorldbookMutationResult(await runActiveWorldbookMutation(normalizedScopeId, (scopeSession) => projectionService.setMessagesSelected({
                scopeId: normalizedScopeId,
                scopeSession,
                conversationId: asText(conversationId, 256),
                messageIds: ids,
                selected: selected === true,
                userName: asText(userName, 256),
                storyTime: asText(storyTime, 128),
            }), { scopeSession }));
            const [conversation, messages] = await Promise.all([
                repository.getConversation(normalizedScopeId, conversationId),
                repository.listMessages(normalizedScopeId, conversationId),
            ]);
            const selectedIds = new Set(ids);
            const result = {
                messages: messages.filter((message) => selectedIds.has(message.messageId)),
                injection: conversation?.injection || null,
            };
            await notifySubscribers(normalizedScopeId);
            return result;
        },
        async retryPendingWorldbook({ scopeId, userName = getUserName(), storyTime = getStoryTime() }) {
            const scopeSession = captureReadyScopeSession(scopeId);
            const normalizedScopeId = await ensureScope(scopeId, null, { scopeSession });
            const before = await repository.listConversations(normalizedScopeId);
            const pendingIds = before
                .filter((conversation) => (
                    ['private', 'group'].includes(conversation.kind)
                    && conversation.injection?.projection?.pending
                ))
                .map((conversation) => conversation.conversationId);
            await retryPendingConversations({
                scopeId: normalizedScopeId,
                scopeSession,
                userName: asText(userName, 256),
                storyTime: asText(storyTime, 128),
            });
            const after = new Map((await repository.listConversations(normalizedScopeId))
                .map((conversation) => [conversation.conversationId, conversation]));
            const result = {
                syncedConversationIds: pendingIds.filter((conversationId) => !after.get(conversationId)?.injection?.projection?.pending),
                pendingConversationIds: pendingIds.filter((conversationId) => after.get(conversationId)?.injection?.projection?.pending),
            };
            await notifySubscribers(normalizedScopeId);
            return result;
        },
        destroy: () => lifecycle.destroy(),
        // These command methods are intentionally flat application seams for the future Figma UI.
        async createPrivateConversation({ scopeId, ...input }) {
            const scopeSession = captureReadyScopeSession(scopeId);
            const normalizedScopeId = await ensureScope(scopeId, null, { scopeSession });
            const result = await repository.createPrivateConversation(normalizedScopeId, input, { scopeSession });
            await notifySubscribers(normalizedScopeId);
            return result;
        },
        createGroupConversation: () => {
            throw privateOnlyError();
        },
        async sendManual({ scopeId, conversationId, message }) {
            assertConversationWritable(scopeId, conversationId);
            const conversation = await getPrivateConversation(scopeId, conversationId);
            const messageWithStoryTime = {
                ...asObject(message),
                storyTime: asText(message?.storyTime, 128) || getStoryTime(),
            };
            const normalizedMessage = messageWithStoryTime.type === 'transfer'
                ? {
                    ...messageWithStoryTime,
                    transfer: {
                        ...(messageWithStoryTime.transfer || {}),
                        recipientId: asText(message.transfer?.recipientId, 256) || conversation?.personId || '',
                    },
                }
                : messageWithStoryTime;
            const result = await requestService.sendManual({ scopeId, conversationId, message: normalizedMessage });
            await notifySubscribers(scopeId);
            return result;
        },
        async generateMessageImage({ scopeId, conversationId, messageId }) {
            if (!composeCharacterImagePrompt) {
                throw imageGenerationError('QQ 人物提示词服务不可用', 'image_prompt_composer_unavailable');
            }
            if (typeof imageGenerationService?.generateAndStore !== 'function') {
                throw imageGenerationError('智慧姬生图服务不可用', 'image_generation_unavailable');
            }
            const scopeSession = captureReadyScopeSession(scopeId);
            const normalizedScopeId = await ensureScope(scopeId, null, { scopeSession });
            const normalizedConversationId = asText(conversationId, 256);
            const normalizedMessageId = asText(messageId, 256);
            assertConversationWritable(normalizedScopeId, normalizedConversationId);
            const conversation = await getPrivateConversation(normalizedScopeId, normalizedConversationId);
            if (!conversation) throw imageGenerationError('QQ 会话不存在', 'conversation_not_found');
            const messages = await repository.listMessages(normalizedScopeId, normalizedConversationId);
            const message = messages.find((item) => item.messageId === normalizedMessageId);
            if (!message) throw imageGenerationError('QQ 消息不存在', 'message_not_found');
            if (message.type !== 'image') {
                throw imageGenerationError('只有图片消息可以生成图片', 'message_type_invalid');
            }
            const senderName = message.senderId === SELF_ID
                ? await getPersonaName({
                    scopeId: normalizedScopeId,
                    conversationId: normalizedConversationId,
                    messageId: normalizedMessageId,
                })
                : asText((await repository.getPerson(normalizedScopeId, message.senderId))?.formalName, 256);
            if (!senderName) throw imageGenerationError('无法确定图片消息发送者', 'image_sender_not_found');
            assertReadyScopeSession(scopeSession);
            const promptResult = await composeCharacterImagePrompt({
                explicitNames: [senderName],
                description: String(message.content ?? ''),
                scanDescription: true,
            });
            const prompt = asText(
                typeof promptResult === 'string' ? promptResult : promptResult?.prompt,
            );
            if (!prompt) throw imageGenerationError('最终生图提示词为空', 'image_prompt_empty');
            assertReadyScopeSession(scopeSession);

            let generatedPath = '';
            let committed = false;
            try {
                const generated = asObject(await imageGenerationService.generateAndStore({
                    prompt,
                    width: null,
                    height: null,
                    folder: 'yuzi-phone-generated',
                    filename: `qq-${normalizedMessageId}-${Math.trunc(Number(now()) || Date.now())}`,
                }));
                generatedPath = asText(generated.path, 2048);
                if (generated.ok === false || !generatedPath) {
                    throw imageGenerationError(
                        asText(generated.error?.message || generated.message, 1000) || '图片生成失败',
                        asText(generated.error?.code || generated.status, 128) || 'image_generation_failed',
                    );
                }
                assertReadyScopeSession(scopeSession);
                const generatedAtValue = Number(generated.generatedAt);
                const result = await repository.replaceGeneratedMessageImage(
                    normalizedScopeId,
                    normalizedConversationId,
                    normalizedMessageId,
                    {
                        path: generatedPath,
                        generatedAt: Number.isFinite(generatedAtValue) && generatedAtValue > 0
                            ? Math.trunc(generatedAtValue)
                            : Math.trunc(Number(now()) || Date.now()),
                    },
                    { scopeSession },
                );
                committed = true;
                await notifySubscribers(normalizedScopeId, {
                    reason: 'message-image-generated',
                    conversationId: normalizedConversationId,
                });
                await deleteStoredImages(result.releasedGeneratedImagePaths);
                return result;
            } catch (error) {
                if (generatedPath && !committed) await deleteStoredImage(generatedPath);
                throw error;
            }
        },
        async retryManual({ scopeId, conversationId }) {
            assertConversationWritable(scopeId, conversationId);
            const result = await requestService.retry({ scopeId, conversationId });
            await notifySubscribers(scopeId);
            return result;
        },
        async cancelManualRequest({ scopeId, conversationId }) {
            const scopeSession = captureReadyScopeSession(scopeId);
            const normalizedScopeId = await ensureScope(scopeId, null, { scopeSession });
            assertConversationWritable(normalizedScopeId, conversationId);
            await getPrivateConversation(normalizedScopeId, conversationId);
            assertReadyScopeSession(scopeSession);
            const result = await requestService.cancelManual({
                scopeId: normalizedScopeId,
                conversationId,
            });
            await notifySubscribers(normalizedScopeId);
            return result;
        },
        async deleteMessages({
            scopeId,
            conversationId,
            messageIds,
            userName = getUserName(),
            storyTime = getStoryTime(),
        }) {
            const scopeSession = captureReadyScopeSession(scopeId);
            const normalizedScopeId = await ensureScope(scopeId, null, { scopeSession });
            assertReadyScopeSession(scopeSession);
            assertConversationWritable(normalizedScopeId, conversationId);
            await getPrivateConversation(normalizedScopeId, conversationId);
            assertReadyScopeSession(scopeSession);
            await requestService.cancelConversation({ scopeId: normalizedScopeId, conversationId });
            assertReadyScopeSession(scopeSession);
            const result = await repository.deleteMessages(
                normalizedScopeId,
                conversationId,
                messageIds,
                { scopeSession },
            );
            await revokeMissingMediaRenderLeases(normalizedScopeId);
            await deleteStoredImages(result.releasedGeneratedImagePaths);
            await requestService.reconcileConversation?.({ scopeId: normalizedScopeId, conversationId });
            await syncConversations({
                scopeId: normalizedScopeId,
                scopeSession,
                conversationIds: [conversationId],
                userName: asText(userName, 256),
                storyTime: asText(storyTime, 128),
            });
            assertReadyScopeSession(scopeSession);
            await notifySubscribers(normalizedScopeId);
            return result;
        },
        async deleteConversation({ scopeId, conversationId, userName = getUserName(), storyTime = getStoryTime() }) {
            const scopeSession = captureReadyScopeSession(scopeId);
            const normalizedScopeId = await ensureScope(scopeId, null, { scopeSession });
            const conversation = await getPrivateConversation(normalizedScopeId, conversationId);
            assertReadyScopeSession(scopeSession);
            if (!conversation) return { deleted: false, mode: 'missing' };
            const key = conversationKey(normalizedScopeId, conversationId);
            if (deletingConversationKeys.has(key)) return { deleted: false, mode: 'deleting' };
            deletingConversationKeys.add(key);

            try {
                await requestService.cancelConversation?.({ scopeId: normalizedScopeId, conversationId });
                proactiveService.cancelScope?.({ scopeId: normalizedScopeId });
                assertReadyScopeSession(scopeSession);

                // The real worldbook entry must be removed while the QQ facts still exist.
                const projection = await runWorldbookMutation(() => projectionService.removeConversationProjection({
                    scopeId: normalizedScopeId,
                    scopeSession,
                    conversationId,
                }));
                assertReadyScopeSession(scopeSession);
                if (projection?.status !== 'removed') {
                    return { deleted: false, mode: 'worldbook-pending' };
                }

                let deleted;
                try {
                    deleted = await repository.deleteConversation(normalizedScopeId, conversationId, { scopeSession });
                } catch (error) {
                    if (error?.code === 'scope_inactive' || error?.code === 'worldbook_scope_inactive') {
                        throw scopeInactiveError();
                    }
                    let rollback = null;
                    try {
                        rollback = typeof projection.rollback === 'function'
                            ? await runWorldbookMutation(() => projection.rollback())
                            : await runWorldbookMutation(() => projectionService.syncConversation({
                                scopeId: normalizedScopeId,
                                scopeSession,
                                conversationId,
                                userName: asText(userName, 256),
                                storyTime: asText(storyTime, 128),
                            }));
                    } catch {
                        // The local transaction is still intact; a later retry may finish projection cleanup.
                    }
                    return {
                        deleted: false,
                        mode: ['restored', 'synced', 'empty', 'removed'].includes(asText(rollback?.status, 32))
                            ? 'rolled-back'
                            : 'rollback-pending',
                    };
                }
                assertReadyScopeSession(scopeSession);
                await revokeMissingMediaRenderLeases(normalizedScopeId).catch(() => {});
                await deleteStoredImages(deleted?.releasedGeneratedImagePaths);
                assertReadyScopeSession(scopeSession);
                try {
                    requestService.handleConversationDeleted?.({ scopeId: normalizedScopeId, conversationId });
                } catch {
                    // The request was already cancelled before the irreversible repository commit.
                }
                if (openedConversationByScope.get(normalizedScopeId) === conversationId) {
                    openedConversationByScope.delete(normalizedScopeId);
                }
                await notifySubscribers(normalizedScopeId);
                return { deleted: true, mode: asText(deleted?.mode, 32) || 'deleted' };
            } finally {
                deletingConversationKeys.delete(key);
            }
        },
    };

    const facade = createQQV2Facade({ runtime: application });

    return Object.freeze({
        ...application,
        getFacade: () => facade,
    });
}
