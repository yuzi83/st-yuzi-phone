import { buildQQV2StickerCatalog, mapQQV2StickerActionReferences } from '../prompt/sticker-catalog.js';

const SELF_ID = '__self__';
const MANUAL_COALESCING_DELAY_MS = 1000;

function asText(value, maxLength = 0) {
    const text = String(value ?? '').trim();
    return maxLength > 0 ? text.slice(0, maxLength) : text;
}

function requestKey(scopeId, conversationId) {
    return `${scopeId}\u0000${conversationId}`;
}

function isSelfMessage(message) {
    return message?.senderId === SELF_ID || message?.senderType === 'self';
}

function cloneState(state) {
    return Object.freeze({
        phase: state?.phase || 'idle',
        pendingUserMessageCount: Number(state?.pendingUserMessageCount) || 0,
        error: asText(state?.error, 1000),
    });
}

function cloneModelState(state) {
    return Object.freeze({
        phase: state?.phase || 'idle',
        models: Object.freeze([...(state?.models || [])]),
        manualModel: asText(state?.manualModel, 240),
        error: asText(state?.error, 1000),
    });
}

function cloneModelLoadDraft(value, hasExplicitEndpoint = false) {
    const source = asObject(value);
    return {
        hasExplicitEndpoint,
        endpoint: asText(source.endpoint, 2048),
        apiKey: asText(source.apiKey, 8192),
        model: asText(source.model, 240),
    };
}

function resolveModelLoadConnection(apiPresetId, preset, draft) {
    const savedPreset = asObject(preset);
    const endpoint = draft.hasExplicitEndpoint ? draft.endpoint : asText(savedPreset.endpoint, 2048);
    const apiKey = draft.apiKey || asText(savedPreset.apiKey, 8192);
    if (!endpoint) {
        throw new QQV2RequestError(
            apiPresetId ? 'Selected QQ API preset has no API endpoint' : 'QQ API endpoint is required to load models',
            apiPresetId ? 'preset_endpoint_missing' : 'endpoint_missing',
        );
    }
    if (!apiKey) {
        throw new QQV2RequestError(
            apiPresetId ? 'Selected QQ API preset has no API key' : 'QQ API key is required to load models',
            apiPresetId ? 'preset_api_key_missing' : 'api_key_missing',
        );
    }
    return { endpoint, apiKey };
}

function redactText(value, secrets) {
    let text = String(value ?? '');
    for (const secret of secrets) {
        if (secret) text = text.split(secret).join('[REDACTED]');
    }
    return text;
}

function requireFunction(value, label) {
    if (typeof value !== 'function') throw new TypeError(`QQ v2 request service needs ${label}`);
    return value;
}

function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asReferenceSet(value, fallback = []) {
    if (value instanceof Set) return new Set(value);
    if (Array.isArray(value)) return new Set(value);
    return new Set(fallback);
}

function normalizeManualRequestBuild(value) {
    if (Array.isArray(value)) {
        return {
            messages: value,
            references: {},
            personReferences: {},
            messageReferences: {},
            visibleMessageRefs: null,
            stickerReferences: {},
        };
    }
    const result = asObject(value);
    if (!Array.isArray(result.messages)) {
        throw new QQV2RequestError('QQ manual prompt builder returned invalid messages', 'invalid_prompt_messages');
    }
    return {
        messages: result.messages,
        references: asObject(result.references),
        personReferences: asObject(result.personReferences),
        messageReferences: asObject(result.messageReferences),
        visibleMessageRefs: result.visibleMessageRefs,
        stickerReferences: asObject(result.stickerReferences),
    };
}

function assertManualActionsTargetConversation(actions, conversationId) {
    if (!Array.isArray(actions)) {
        throw new QQV2RequestError('QQ action batch is invalid', 'invalid_action_batch');
    }
    for (const action of actions) {
        if (!action || typeof action !== 'object') {
            throw new QQV2RequestError('QQ action batch is invalid', 'invalid_action_batch');
        }
        if (action.type === 'none') continue;
        if (!['message', 'read', 'transfer', 'group'].includes(action.type)) {
            throw new QQV2RequestError('Manual QQ response contains an unsupported action', 'manual_action_invalid');
        }
        if (asText(action.conversation, 256) !== conversationId) {
            throw new QQV2RequestError('Manual QQ response cannot mutate another current conversation', 'manual_action_cross_conversation');
        }
    }
}

/**
 * The request-facing QQ application service. It owns transient network work;
 * QQ facts remain solely in the injected repository.
 */
export function createQQV2RequestService(options = {}) {
    const repository = options.repository;
    if (!repository
        || typeof repository.appendMessages !== 'function'
        || typeof repository.getScope !== 'function'
        || typeof repository.getConversation !== 'function'
        || typeof repository.listMessages !== 'function'
        || typeof repository.listConversations !== 'function'
        || typeof repository.applyAIActions !== 'function') {
        throw new TypeError('QQ v2 request service needs a QQ repository');
    }
    const apiPresetResolver = requireFunction(options.apiPresetResolver, 'apiPresetResolver');
    const promptPresetResolver = requireFunction(options.promptPresetResolver, 'promptPresetResolver');
    const captureScopeSession = requireFunction(options.captureScopeSession, 'captureScopeSession');
    const buildManualRequest = requireFunction(options.buildManualRequest, 'buildManualRequest');
    const parseResponse = requireFunction(options.parseResponse, 'parseResponse');
    const validateActions = requireFunction(options.validateActions, 'validateActions');
    const backend = options.backend;
    if (!backend || typeof backend.generate !== 'function') {
        throw new TypeError('QQ v2 request service needs a backend.generate seam');
    }

    const listStickers = typeof options.listStickers === 'function' ? options.listStickers : async () => [];
    const getStoryTime = typeof options.getStoryTime === 'function' ? options.getStoryTime : () => '';
    const commitManualActions = typeof options.commitManualActions === 'function'
        ? options.commitManualActions
        : null;
    const afterManualMutation = typeof options.afterManualMutation === 'function'
        ? options.afterManualMutation
        : async () => {};
    const afterManualError = typeof options.afterManualError === 'function'
        ? options.afterManualError
        : async () => {};
    const runtimeSettingsResolver = typeof options.runtimeSettingsResolver === 'function'
        ? options.runtimeSettingsResolver
        : async (_scopeId, scope) => scope?.settings || {};
    const onProactiveError = typeof options.onProactiveError === 'function'
        ? options.onProactiveError
        : async () => {};
    const queued = new Map();
    const states = new Map();
    const modelStates = new Map();
    const superseding = new Set();
    let serial = 0;
    let active = null;
    let draining = false;
    let drainPromise = Promise.resolve();
    let wakeTimer = null;
    let wakeAt = 0;
    let resolveWake = null;
    let wakePromise = Promise.resolve();

    const setState = (key, state) => states.set(key, cloneState(state));
    const findNext = () => [...queued.values()].sort((left, right) => left.serial - right.serial)[0] || null;

    const scopeSessionIsReady = (scopeSession) => {
        try {
            return scopeSession?.isCurrent?.() === true
                && scopeSession?.isReady?.() === true
                && scopeSession?.signal?.aborted !== true;
        } catch {
            return false;
        }
    };

    const staleScopeError = (cause = null) => {
        const error = new QQV2RequestError('QQ scope session is no longer current', 'scope_stale');
        if (cause) error.cause = cause;
        return error;
    };

    const captureReadyScopeSession = (scopeId) => {
        let scopeSession;
        try {
            scopeSession = captureScopeSession(scopeId);
        } catch (error) {
            throw staleScopeError(error);
        }
        if (!scopeSession
            || typeof scopeSession.isCurrent !== 'function'
            || typeof scopeSession.isReady !== 'function'
            || !scopeSession.signal
            || typeof scopeSession.signal.addEventListener !== 'function'
            || typeof scopeSession.signal.removeEventListener !== 'function'
            || !scopeSessionIsReady(scopeSession)) {
            throw staleScopeError();
        }
        return scopeSession;
    };

    const abortEntry = (entry, reason) => {
        if (!entry || entry.controller.signal.aborted) return false;
        try {
            entry.controller.abort(reason);
        } catch {
            return false;
        }
        return true;
    };

    const releaseScopeSession = (entry) => {
        entry?.releaseScopeSession?.();
        if (entry) entry.releaseScopeSession = null;
    };

    const bindScopeSession = (entry, scopeSession) => {
        releaseScopeSession(entry);
        entry.scopeSession = scopeSession;
        const onAbort = () => {
            abortEntry(entry, scopeSession.signal.reason || 'scope-session-aborted');
            if (entry.kind !== 'proactive') states.delete(entry.key);
            if (queued.get(entry.key) === entry) {
                queued.delete(entry.key);
                releaseScopeSession(entry);
                refreshWakeForNextEntry();
            }
        };
        if (scopeSession.signal.aborted) {
            onAbort();
            return;
        }
        scopeSession.signal.addEventListener('abort', onAbort, { once: true });
        entry.releaseScopeSession = () => scopeSession.signal.removeEventListener('abort', onAbort);
    };

    const clearWakeTimer = () => {
        if (wakeTimer !== null) clearTimeout(wakeTimer);
        wakeTimer = null;
        wakeAt = 0;
        if (resolveWake) {
            const resolve = resolveWake;
            resolveWake = null;
            resolve();
        }
    };

    const scheduleWake = (nextWakeAt) => {
        const normalizedWakeAt = Math.max(Date.now(), Number(nextWakeAt) || Date.now());
        if (wakeTimer !== null && wakeAt === normalizedWakeAt) return;
        clearWakeTimer();
        wakeAt = normalizedWakeAt;
        wakePromise = new Promise((resolve) => {
            resolveWake = resolve;
            wakeTimer = setTimeout(() => {
                const finishWake = resolveWake;
                resolveWake = null;
                wakeTimer = null;
                wakeAt = 0;
                finishWake?.();
                scheduleDrain();
            }, Math.max(0, normalizedWakeAt - Date.now()));
        });
    };

    const isCurrentEntry = (entry) => active === entry
        && !entry.controller.signal.aborted
        && !superseding.has(entry.key)
        && scopeSessionIsReady(entry.scopeSession);

    const notifyManualMutation = async (input) => {
        try {
            await afterManualMutation(input);
        } catch {
            // Worldbook projection and other observers cannot undo a persisted QQ fact.
        }
    };

    const notifyManualError = async (input) => {
        try {
            await afterManualError(input);
        } catch {
            // Failure observers cannot change the retryable request state.
        }
    };

    const executeManual = async (entry) => {
        const key = entry.key;
        const scope = await repository.getScope(entry.scopeId);
        const conversation = await repository.getConversation(entry.scopeId, entry.conversationId);
        if (!scope || !conversation) {
            setState(key, { phase: 'idle', pendingUserMessageCount: 0, error: '' });
            return;
        }
        const messages = await repository.listMessages(entry.scopeId, entry.conversationId);
        const handledSequence = Number(conversation.lastHandledUserSequence) || 0;
        const pending = messages.filter((message) => isSelfMessage(message) && Number(message.sequence) > handledSequence);
        if (pending.length === 0) {
            setState(key, { phase: 'idle', pendingUserMessageCount: 0, error: '' });
            return;
        }

        setState(key, { phase: 'running', pendingUserMessageCount: pending.length, error: '' });
        const runtimeSettings = await runtimeSettingsResolver(entry.scopeId, scope, {
            scopeSession: entry.scopeSession,
        }) || scope.settings || {};
        const apiPresetId = asText(runtimeSettings.activeApiPresetId, 256);
        const promptPresetId = asText(
            conversation.kind === 'group' ? runtimeSettings.groupReplyPresetId : runtimeSettings.privateReplyPresetId,
            256,
        );
        if (!apiPresetId || !promptPresetId) {
            throw new QQV2RequestError('QQ API or AI prompt preset is not selected', 'preset_missing');
        }
        const [apiPreset, promptPreset, conversations, stickers] = await Promise.all([
            apiPresetResolver(apiPresetId),
            promptPresetResolver(promptPresetId),
            repository.listConversations(entry.scopeId),
            listStickers(),
        ]);
        if (!apiPreset || !promptPreset) {
            throw new QQV2RequestError('Selected QQ API or AI prompt preset no longer exists', 'preset_missing');
        }

        const requestBuild = normalizeManualRequestBuild(await buildManualRequest({
            scopeId: entry.scopeId,
            scopeSession: entry.scopeSession,
            scope,
            runtimeSettings,
            conversation,
            history: messages,
            currentMessage: pending.at(-1),
            preset: promptPreset,
        }));
        const stickerCatalog = buildQQV2StickerCatalog(stickers);
        const stickerReferences = Object.keys(requestBuild.stickerReferences).length
            ? requestBuild.stickerReferences
            : stickerCatalog.references;
        const promptMessages = requestBuild.messages;
        if (!isCurrentEntry(entry)) return;
        const response = await backend.generate({ preset: apiPreset, messages: promptMessages, signal: entry.controller.signal });
        if (!isCurrentEntry(entry)) return;

        const scenario = conversation.kind === 'group' ? 'group-reply' : 'private-reply';
        const fallbackReferences = { [entry.conversationId]: entry.conversationId };
        const references = Object.keys(requestBuild.references).length ? requestBuild.references : fallbackReferences;
        const visibleMessageRefs = asReferenceSet(
            requestBuild.visibleMessageRefs,
            messages.map((message) => message.messageId).filter(Boolean),
        );
        const handledUserSequences = { [entry.conversationId]: pending.at(-1).sequence };
        const storyTime = asText(getStoryTime(), 128);
        let actionResult;
        if (commitManualActions) {
            actionResult = await commitManualActions({
                scopeId: entry.scopeId,
                response: response?.content ?? response,
                scenario,
                references,
                personReferences: requestBuild.personReferences,
                messageReferences: requestBuild.messageReferences,
                visibleMessageRefs,
                stickers: new Set(Object.keys(stickerReferences)),
                stickerReferences,
                storyTime,
                handledUserSequences,
                scopeSession: entry.scopeSession,
                isCurrent: () => isCurrentEntry(entry),
            });
        } else {
            const actions = await parseResponse(response?.content ?? response);
            const conversationsByReference = new Map(Object.entries(references).map(([reference, conversationId]) => [
                reference,
                conversations.find((item) => item.conversationId === conversationId) || null,
            ]));
            const validatedActions = await validateActions(actions, {
                scenario,
                conversations: conversationsByReference,
                stickers: new Set(Object.keys(stickerReferences)),
                visibleMessageRefs,
            });
            const currentReference = Object.entries(references)
                .find(([, conversationId]) => conversationId === entry.conversationId)?.[0] || entry.conversationId;
            assertManualActionsTargetConversation(validatedActions, currentReference);
            if (!isCurrentEntry(entry)) return;
            actionResult = await repository.applyAIActions(
                entry.scopeId,
                mapQQV2StickerActionReferences(validatedActions, stickerReferences),
                {
                    storyTime,
                    handledUserSequences,
                    scopeSession: entry.scopeSession,
                    isCurrent: () => isCurrentEntry(entry),
                },
            );
        }
        if (!isCurrentEntry(entry)) return;
        await notifyManualMutation({
            kind: 'ai-actions',
            scopeId: entry.scopeId,
            conversationId: entry.conversationId,
            scopeSession: entry.scopeSession,
            storyTime,
            actionResult,
        });
        if (!isCurrentEntry(entry)) return;
        setState(key, { phase: 'idle', pendingUserMessageCount: 0, error: '' });
    };

    const executeProactive = async (entry) => entry.execute({
        scopeId: entry.scopeId,
        scopeSession: entry.scopeSession,
        signal: entry.controller.signal,
        isCurrent: () => isCurrentEntry(entry),
    });

    const runEntry = async (entry) => {
        active = entry;
        try {
            if (!isCurrentEntry(entry)) {
                if (entry.kind !== 'proactive') states.delete(entry.key);
                return;
            }
            if (entry.kind === 'proactive') {
                await executeProactive(entry);
            } else {
                await executeManual(entry);
            }
        } catch (error) {
            if (entry.kind === 'proactive' && !entry.controller.signal.aborted) {
                try {
                    await onProactiveError(error, Object.freeze({
                        scopeId: entry.scopeId,
                        requestId: entry.requestId,
                        stage: 'execute',
                    }));
                } catch {
                    // Diagnostic observers cannot change request arbitration.
                }
            } else if (entry.kind !== 'proactive' && !entry.controller.signal.aborted) {
                const messages = await repository.listMessages(entry.scopeId, entry.conversationId).catch(() => []);
                const conversation = await repository.getConversation(entry.scopeId, entry.conversationId).catch(() => null);
                const handledSequence = Number(conversation?.lastHandledUserSequence) || 0;
                const pendingCount = messages.filter((message) => isSelfMessage(message) && Number(message.sequence) > handledSequence).length;
                setState(entry.key, {
                    phase: 'failed',
                    pendingUserMessageCount: pendingCount,
                    error: asText(error?.message || 'QQ request failed', 1000),
                });
                await notifyManualError({
                    kind: 'request-failed',
                    scopeId: entry.scopeId,
                    conversationId: entry.conversationId,
                    scopeSession: entry.scopeSession,
                    error,
                    state: cloneState(states.get(entry.key)),
                });
            }
        } finally {
            releaseScopeSession(entry);
            if (active === entry) active = null;
        }
    };

    const drain = async () => {
        try {
            while (!active) {
                const entry = findNext();
                if (!entry) break;
                if (entry.kind !== 'proactive' && Number(entry.readyAt) > Date.now()) {
                    scheduleWake(entry.readyAt);
                    break;
                }
                queued.delete(entry.key);
                await runEntry(entry);
            }
        } finally {
            draining = false;
            if (!active && queued.size > 0) scheduleDrain();
        }
    };

    const scheduleDrain = () => {
        if (draining || wakeTimer !== null) return;
        draining = true;
        drainPromise = Promise.resolve().then(drain);
    };

    const refreshWakeForNextEntry = () => {
        if (active) return;
        const next = findNext();
        if (!next) {
            clearWakeTimer();
            return;
        }
        if (next.kind !== 'proactive' && Number(next.readyAt) > Date.now()) {
            scheduleWake(next.readyAt);
            return;
        }
        clearWakeTimer();
        scheduleDrain();
    };

    const enqueue = (scopeId, conversationId, scopeSession, options = {}) => {
        if (!scopeSessionIsReady(scopeSession)) throw staleScopeError();
        const key = requestKey(scopeId, conversationId);
        const readyAt = Date.now() + (options.coalesce === false ? 0 : MANUAL_COALESCING_DELAY_MS);
        let entry = queued.get(key);
        if (!entry) {
            entry = {
                key,
                kind: 'manual',
                scopeId,
                conversationId,
                serial: Number.isInteger(options.serial) ? options.serial : serial += 1,
                controller: new AbortController(),
                readyAt,
            };
            queued.set(key, entry);
        } else {
            if (entry.controller.signal.aborted) entry.controller = new AbortController();
            entry.readyAt = readyAt;
        }
        bindScopeSession(entry, scopeSession);
        const prior = states.get(key);
        setState(key, { phase: 'queued', pendingUserMessageCount: Math.max(1, prior?.pendingUserMessageCount || 0), error: '' });
        refreshWakeForNextEntry();
        return entry;
    };

    const hasQueuedKind = (kind) => [...queued.values()].some((entry) => entry.kind === kind);
    const hasManualWork = () => (active && active.kind !== 'proactive') || [...queued.values()].some((entry) => entry.kind !== 'proactive');

    const enqueueProactive = (input = {}) => {
        const scopeId = asText(input.scopeId, 512);
        if (!scopeId) throw new QQV2RequestError('QQ scope is required', 'invalid_request');
        if (typeof input.execute !== 'function') {
            throw new TypeError('QQ proactive request needs execute');
        }
        const scopeSession = captureReadyScopeSession(scopeId);
        if (hasManualWork()) return Object.freeze({ queued: false, skipped: 'manual-pending' });
        if (active?.kind === 'proactive' || hasQueuedKind('proactive')) {
            return Object.freeze({ queued: false, skipped: 'proactive-pending' });
        }
        const requestId = `proactive-${serial += 1}`;
        const entry = {
            key: requestId,
            kind: 'proactive',
            requestId,
            scopeId,
            serial,
            controller: new AbortController(),
            execute: input.execute,
        };
        queued.set(requestId, entry);
        bindScopeSession(entry, scopeSession);
        scheduleDrain();
        return Object.freeze({ queued: true, requestId });
    };

    const preemptProactiveForManual = () => {
        for (const [key, entry] of queued) {
            if (entry.kind !== 'proactive') continue;
            queued.delete(key);
            abortEntry(entry, 'manual-preempted-proactive');
            releaseScopeSession(entry);
        }
        if (active?.kind !== 'proactive') return;
        abortEntry(active, 'manual-preempted-proactive');
    };

    const cancelProactive = (input = {}) => {
        const scopeId = asText(input.scopeId, 512);
        let cancelled = false;
        for (const [key, entry] of queued) {
            if (entry.kind === 'proactive' && (!scopeId || entry.scopeId === scopeId)) {
                queued.delete(key);
                abortEntry(entry, 'proactive-cancelled');
                releaseScopeSession(entry);
                cancelled = true;
            }
        }
        if (active?.kind === 'proactive' && (!scopeId || active.scopeId === scopeId)) {
            abortEntry(active, 'proactive-cancelled');
            cancelled = true;
        }
        refreshWakeForNextEntry();
        return cancelled;
    };

    const summarizeQueueEntry = (entry) => Object.freeze({
        kind: entry.kind === 'proactive' ? 'proactive' : 'manual',
        scopeId: entry.scopeId,
        conversationId: entry.kind === 'proactive' ? '' : entry.conversationId,
        requestId: entry.kind === 'proactive' ? entry.requestId : '',
    });

    const getQueueState = () => Object.freeze({
        active: active ? summarizeQueueEntry(active) : null,
        queued: Object.freeze([...queued.values()]
            .sort((left, right) => left.serial - right.serial)
            .map(summarizeQueueEntry)),
    });

    const cancelScope = (input = {}) => {
        const scopeId = asText(typeof input === 'string' ? input : input.scopeId, 512);
        if (!scopeId) return false;
        const reason = asText(typeof input === 'object' ? input.reason : '', 128) || 'scope-cancelled';
        let cancelled = false;
        for (const [key, entry] of queued) {
            if (entry.scopeId !== scopeId) continue;
            queued.delete(key);
            abortEntry(entry, reason);
            releaseScopeSession(entry);
            cancelled = true;
        }
        for (const key of states.keys()) {
            if (key.startsWith(`${scopeId}\u0000`)) states.delete(key);
        }
        for (const key of superseding) {
            if (key.startsWith(`${scopeId}\u0000`)) superseding.delete(key);
        }
        if (active?.scopeId === scopeId) cancelled = abortEntry(active, reason) || cancelled;
        refreshWakeForNextEntry();
        return cancelled;
    };

    const cancelEntry = (key, reason) => {
        const queuedEntry = queued.get(key);
        if (queuedEntry) {
            queued.delete(key);
            abortEntry(queuedEntry, reason);
            releaseScopeSession(queuedEntry);
        }
        if (active?.key !== key) {
            refreshWakeForNextEntry();
            return Boolean(queuedEntry);
        }
        return abortEntry(active, reason) || Boolean(queuedEntry);
    };

    const reconcileConversation = async (input = {}) => {
        const scopeId = asText(input.scopeId, 512);
        const conversationId = asText(input.conversationId, 256);
        if (!scopeId || !conversationId) throw new QQV2RequestError('QQ scope and conversation are required', 'invalid_request');
        const key = requestKey(scopeId, conversationId);
        cancelEntry(key, 'conversation-reconciled');
        const conversation = await repository.getConversation(scopeId, conversationId);
        if (!conversation) {
            states.delete(key);
            return cloneState(null);
        }
        const messages = await repository.listMessages(scopeId, conversationId);
        const handledSequence = Number(conversation.lastHandledUserSequence) || 0;
        const pendingUserMessageCount = messages
            .filter((message) => isSelfMessage(message) && Number(message.sequence) > handledSequence)
            .length;
        setState(key, { phase: 'idle', pendingUserMessageCount, error: '' });
        return cloneState(states.get(key));
    };

    const cancelManual = async (input = {}) => {
        const scopeId = asText(input.scopeId, 512);
        const conversationId = asText(input.conversationId, 256);
        if (!scopeId || !conversationId) throw new QQV2RequestError('QQ scope and conversation are required', 'invalid_request');
        const key = requestKey(scopeId, conversationId);
        const queuedEntry = queued.get(key);
        const activeEntry = active?.kind === 'manual' && active.key === key ? active : null;
        if (!queuedEntry && !activeEntry) {
            return Object.freeze({ cancelled: false, ...cloneState(states.get(key)) });
        }

        if (queuedEntry) {
            queued.delete(key);
            abortEntry(queuedEntry, 'manual-cancelled');
            releaseScopeSession(queuedEntry);
        }
        if (activeEntry) abortEntry(activeEntry, 'manual-cancelled');
        refreshWakeForNextEntry();

        const conversation = await repository.getConversation(scopeId, conversationId);
        const messages = conversation ? await repository.listMessages(scopeId, conversationId) : [];
        const handledSequence = Number(conversation?.lastHandledUserSequence) || 0;
        const pendingUserMessageCount = messages
            .filter((message) => isSelfMessage(message) && Number(message.sequence) > handledSequence)
            .length;
        setState(key, {
            phase: pendingUserMessageCount > 0 ? 'failed' : 'idle',
            pendingUserMessageCount,
            error: pendingUserMessageCount > 0 ? 'AI 生成已终止' : '',
        });
        return Object.freeze({ cancelled: true, ...cloneState(states.get(key)) });
    };

    return Object.freeze({
        async sendManual(input = {}) {
            const scopeId = asText(input.scopeId, 512);
            const conversationId = asText(input.conversationId, 256);
            if (!scopeId || !conversationId) throw new QQV2RequestError('QQ scope and conversation are required', 'invalid_request');
            const scopeSession = captureReadyScopeSession(scopeId);
            const conversation = await repository.getConversation(scopeId, conversationId);
            if (!['private', 'group'].includes(conversation?.kind) || conversation?.status !== 'active') {
                throw new QQV2RequestError('QQ conversation is unavailable', 'conversation_unavailable');
            }
            preemptProactiveForManual();
            const key = requestKey(scopeId, conversationId);
            const runningEntry = active?.key === key ? active : null;
            if (runningEntry) superseding.add(key);
            const message = input.message && typeof input.message === 'object' ? input.message : {};
            let created;
            try {
                if (!scopeSessionIsReady(scopeSession)) throw staleScopeError();
                [created] = await repository.appendMessages(scopeId, conversationId, [{
                    ...message,
                    senderId: SELF_ID,
                    senderType: 'self',
                }], { scopeSession });
            } catch (error) {
                if (runningEntry) superseding.delete(key);
                throw error;
            }
            await notifyManualMutation({
                kind: 'user-message',
                scopeId,
                conversationId,
                scopeSession,
                storyTime: asText(getStoryTime(), 128),
                message: created,
            });
            if (!scopeSessionIsReady(scopeSession)) {
                superseding.delete(key);
                return Object.freeze({ message: created });
            }
            if (runningEntry && active === runningEntry) {
                enqueue(scopeId, conversationId, scopeSession, { serial: runningEntry.serial });
                abortEntry(runningEntry, 'new-manual-message');
            } else {
                enqueue(scopeId, conversationId, scopeSession);
            }
            superseding.delete(key);
            return Object.freeze({ message: created });
        },
        async retry(input = {}) {
            const scopeId = asText(input.scopeId, 512);
            const conversationId = asText(input.conversationId, 256);
            if (!scopeId || !conversationId) throw new QQV2RequestError('QQ scope and conversation are required', 'invalid_request');
            const scopeSession = captureReadyScopeSession(scopeId);
            const conversation = await repository.getConversation(scopeId, conversationId);
            if (!conversation) throw new QQV2RequestError('QQ conversation no longer exists', 'conversation_missing');
            if (!['private', 'group'].includes(conversation.kind) || conversation.status !== 'active') {
                throw new QQV2RequestError('QQ conversation is unavailable', 'conversation_unavailable');
            }
            const messages = await repository.listMessages(scopeId, conversationId);
            const handledSequence = Number(conversation.lastHandledUserSequence) || 0;
            const pendingUserMessageCount = messages
                .filter((message) => isSelfMessage(message) && Number(message.sequence) > handledSequence)
                .length;
            if (pendingUserMessageCount === 0) {
                setState(requestKey(scopeId, conversationId), { phase: 'idle', pendingUserMessageCount: 0, error: '' });
                return Object.freeze({ queued: false, pendingUserMessageCount: 0 });
            }
            enqueue(scopeId, conversationId, scopeSession, { coalesce: false });
            return Object.freeze({ queued: true, pendingUserMessageCount });
        },
        getConversationState(scopeId, conversationId) {
            return cloneState(states.get(requestKey(scopeId, conversationId)));
        },
        enqueueProactive,
        cancelProactive,
        getQueueState,
        cancelScope,
        reconcileConversation,
        cancelManual,
        cancelConversation(input = {}) {
            return reconcileConversation(input);
        },
        handleConversationDeleted(input = {}) {
            const scopeId = asText(input.scopeId, 512);
            const conversationId = asText(input.conversationId, 256);
            if (!scopeId || !conversationId) return false;
            const key = requestKey(scopeId, conversationId);
            const cancelled = cancelEntry(key, 'conversation-deleted');
            states.delete(key);
            return cancelled;
        },
        async loadModels(input = {}) {
            const apiPresetId = asText(input.apiPresetId, 256);
            const draft = cloneModelLoadDraft(input.draft, input.draft !== undefined);
            let manualModel = draft.model;
            let connection = null;
            try {
                if (typeof backend.loadModels !== 'function') {
                    throw new QQV2RequestError('QQ backend does not support model loading', 'model_list_unavailable');
                }
                const preset = apiPresetId ? await apiPresetResolver(apiPresetId) : null;
                if (apiPresetId && !preset) {
                    throw new QQV2RequestError('Selected QQ API preset no longer exists', 'preset_missing');
                }
                if (!manualModel) manualModel = asText(preset?.model, 240);
                connection = resolveModelLoadConnection(apiPresetId, preset, draft);
                const models = [...new Set((await backend.loadModels({ preset: connection, signal: input.signal }))
                    .map((model) => asText(model, 240))
                    .filter(Boolean))];
                const state = { phase: 'ready', models, manualModel, error: '' };
                if (apiPresetId) modelStates.set(apiPresetId, cloneModelState(state));
                return Object.freeze({ ok: true, apiPresetId, models: [...models], manualModel, error: '' });
            } catch (error) {
                if (!manualModel && apiPresetId) {
                    try {
                        manualModel = asText((await apiPresetResolver(apiPresetId))?.model, 240);
                    } catch {
                        // The loading error below is the useful result for the caller.
                    }
                }
                const message = asText(redactText(
                    error?.message || 'QQ model list request failed',
                    [connection?.apiKey, draft.apiKey],
                ), 1000);
                const state = { phase: 'failed', models: [], manualModel, error: message };
                if (apiPresetId) modelStates.set(apiPresetId, cloneModelState(state));
                return Object.freeze({ ok: false, apiPresetId, models: [], manualModel, error: message });
            }
        },
        getModelState(apiPresetId) {
            return cloneModelState(modelStates.get(asText(apiPresetId, 256)));
        },
        async waitForIdle() {
            while (draining || wakeTimer !== null) {
                if (draining) await drainPromise;
                else await wakePromise;
            }
        },
    });
}

export class QQV2RequestError extends Error {
    constructor(message, code = 'request_failed') {
        super(message);
        this.name = 'QQV2RequestError';
        this.code = code;
    }
}
