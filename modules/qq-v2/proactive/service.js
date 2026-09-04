import { buildProactiveQQV2Request, buildQQV2ProactiveSections } from '../prompt/materializer.js';
import { buildQQV2StickerCatalog } from '../prompt/sticker-catalog.js';

function asText(value, maxLength = 0) {
    const text = String(value ?? '').trim();
    return maxLength > 0 ? text.slice(0, maxLength) : text;
}

function requireRepository(repository) {
    if (!repository || typeof repository !== 'object') {
        throw new TypeError('QQ v2 主动周期需要有效的 repository');
    }
    return repository;
}

function cloneState(state) {
    const everyTurns = Number(state?.everyTurns);
    return Object.freeze({
        enabled: state?.enabled === true,
        everyTurns: Number.isInteger(everyTurns) && everyTurns > 0 ? everyTurns : 5,
    });
}


function requireFunction(value, label) {
    if (typeof value !== 'function') throw new QQV2ProactiveError(`QQ 主动周期缺少 ${label}`, 'dependency_missing');
    return value;
}

function truncateConversationHistory(messages, limit) {
    const history = Array.isArray(messages) ? messages : [];
    const normalizedLimit = Number(limit);
    if (!Number.isInteger(normalizedLimit) || normalizedLimit <= 0) return [...history];
    return history.slice(-normalizedLimit);
}

function isVisibleMessage(message) {
    return Boolean(message) && message.deleted !== true && message.isDeleted !== true;
}

function createProactiveMessageReferences(candidates) {
    const messageReferences = {};
    for (const candidate of candidates) {
        let index = 0;
        for (const message of Array.isArray(candidate?.messages) ? candidate.messages : []) {
            if (!isVisibleMessage(message)) continue;
            index += 1;
            const messageId = asText(message?.messageId, 256);
            if (!messageId) continue;
            messageReferences[`${candidate.referenceId}-M${index}`] = messageId;
        }
    }
    return messageReferences;
}

function buildPrivateProactiveIdentity(candidates) {
    return candidates.map((candidate) => `${candidate.referenceId}：${candidate.title}`).join('\n') || '无';
}

function personLabel(reference) {
    return `${reference.referenceId}：${reference.title}`;
}

function buildGroupIdentity(candidates, friendReferences = []) {
    const groups = candidates.map((candidate) => {
        const lines = [
            `${candidate.referenceId}：${candidate.title}`,
            `成员：${candidate.members.join('、') || '无'}`,
            `群主：${candidate.ownerName || '无'}`,
            `管理员：${candidate.adminNames.join('、') || '无'}`,
        ];
        if (candidate.reinviteOnly) lines.push('当前用户已退出；只能先重新邀请用户，再发送后续消息。');
        return lines.join('\n');
    }).join('\n\n') || '无';
    const friends = friendReferences.map(personLabel).join('、') || '无';
    return `${groups}\n\n可用于新建群聊的已有好友：${friends}`;
}

function createProjectionSignature(candidate) {
    return JSON.stringify({
        title: candidate?.title || '',
        personId: candidate?.personId || '',
        memberIds: Array.isArray(candidate?.memberIds) ? candidate.memberIds : [],
        ownerId: candidate?.ownerId || '',
        adminIds: Array.isArray(candidate?.adminIds) ? candidate.adminIds : [],
        reinviteOnly: candidate?.reinviteOnly === true,
        peopleById: candidate?.peopleById || {},
        messages: Array.isArray(candidate?.messages) ? candidate.messages : [],
    });
}

/**
 * QQ 主动周期的应用服务。网络、协议和投影在后续执行切片中经公开 seam 注入。
 */
export function createQQV2ProactiveService(options = {}) {
    const repository = requireRepository(options.repository);
    const requestService = options.requestService;
    if (!requestService
        || typeof requestService.cancelProactive !== 'function'
        || typeof requestService.enqueueProactive !== 'function') {
        throw new TypeError('QQ v2 主动周期需要主动请求仲裁接口');
    }
    const configRevisionByScope = new Map();
    const privateOnly = options.privateOnly === true;
    const random = typeof options.random === 'function' ? options.random : Math.random;
    const ensureScope = typeof repository.ensureScope === 'function' ? repository.ensureScope.bind(repository) : async () => {};
    const captureScopeSession = typeof options.captureScopeSession === 'function'
        ? options.captureScopeSession
        : (scopeId) => Object.freeze({ scopeId, isCurrent: () => true, isReady: () => true });

    const advanceConfigRevision = (scopeId) => {
        const next = (configRevisionByScope.get(scopeId) || 0) + 1;
        configRevisionByScope.set(scopeId, next);
        return next;
    };

    const isUsableScopeSession = (session) => {
        try {
            return typeof session?.isCurrent === 'function'
                && typeof session?.isReady === 'function'
                && session.isCurrent() === true
                && session.isReady() === true;
        } catch {
            return false;
        }
    };

    const captureUsableScopeSession = (scopeId) => {
        try {
            const session = captureScopeSession(scopeId);
            return isUsableScopeSession(session) ? session : null;
        } catch {
            return null;
        }
    };

    const listStickers = typeof options.listStickers === 'function' ? options.listStickers : async () => [];
    const getStoryTime = typeof options.getStoryTime === 'function' ? options.getStoryTime : () => '';
    const getPromptContext = typeof options.getPromptContext === 'function' ? options.getPromptContext : async () => ({});
    const getUserName = typeof options.getUserName === 'function' ? options.getUserName : () => '';
    const runtimeSettingsResolver = typeof options.runtimeSettingsResolver === 'function'
        ? options.runtimeSettingsResolver
        : async (_scopeId, scope) => scope?.settings || {};
    const buildProactiveRequest = typeof options.buildProactiveRequest === 'function'
        ? options.buildProactiveRequest
        : buildProactiveQQV2Request;
    const buildSections = typeof options.buildProactiveSections === 'function'
        ? options.buildProactiveSections
        : buildQQV2ProactiveSections;
    const syncWorldbook = typeof options.syncWorldbook === 'function' ? options.syncWorldbook : async () => {};
    const onMessagesCommitted = typeof options.onMessagesCommitted === 'function'
        ? options.onMessagesCommitted
        : null;
    const onProjectionError = typeof options.onProjectionError === 'function' ? options.onProjectionError : () => {};

    const resolveCommitActions = () => {
        if (typeof options.commitActions === 'function') return options.commitActions;
        if (typeof options.actionService?.execute === 'function') {
            return (input) => options.actionService.execute({
                scopeId: input.scopeId,
                response: input.response,
                scenario: input.scenario,
                references: input.references,
                personReferences: input.personReferences,
                messageReferences: input.messageReferences,
                visibleMessageRefs: input.visibleMessageRefs,
                stickers: input.stickers,
                stickerReferences: input.stickerReferences,
                storyTime: input.storyTime,
                scopeSession: input.scopeSession,
                isCurrent: input.isCurrent,
            });
        }
        return null;
    };

    const resolveCandidates = async (scopeId, kind, historyLimit) => {
        const conversations = await requireFunction(repository.listConversations, 'repository.listConversations')(scopeId);
        const candidates = [];
        const getPerson = requireFunction(repository.getPerson, 'repository.getPerson');
        const listMessages = requireFunction(repository.listMessages, 'repository.listMessages');
        for (const conversation of conversations) {
            if (kind === 'private') {
                if (conversation.kind !== 'private' || conversation.status !== 'active') continue;
                const person = await getPerson(scopeId, conversation.personId);
                if (!person) continue;
                const messages = truncateConversationHistory(
                    await listMessages(scopeId, conversation.conversationId),
                    historyLimit,
                );
                candidates.push({
                    referenceId: `P${candidates.length + 1}`,
                    conversationId: conversation.conversationId,
                    personId: person.personId,
                    title: asText(person.formalName, 120),
                    members: [],
                    ownerName: '',
                    adminNames: [],
                    reinviteOnly: false,
                    peopleById: { [person.personId]: asText(person.formalName, 120) },
                    messages,
                });
            }
        }
        if (kind === 'private') {
            return {
                candidates,
                personReferences: Object.fromEntries(candidates.map((candidate) => [candidate.referenceId, candidate.personId])),
                friendReferences: [],
            };
        }

        const peopleById = new Map();
        const privateFriends = [];
        for (const conversation of conversations) {
            if (conversation.kind !== 'private' || conversation.status !== 'active') continue;
            const person = await getPerson(scopeId, conversation.personId);
            if (!person || peopleById.has(person.personId)) continue;
            peopleById.set(person.personId, person);
            privateFriends.push(person);
        }
        const referenceByPersonId = new Map();
        const referencedPeople = [];
        const assignPersonReference = (person) => {
            if (!person?.personId) return null;
            let reference = referenceByPersonId.get(person.personId);
            if (!reference) {
                reference = {
                    referenceId: `N${referencedPeople.length + 1}`,
                    personId: person.personId,
                    title: asText(person.formalName, 120),
                };
                referenceByPersonId.set(person.personId, reference);
                referencedPeople.push(reference);
            }
            return reference;
        };
        const resolveGroupPerson = async (personId) => {
            if (peopleById.has(personId)) return peopleById.get(personId);
            const person = await getPerson(scopeId, personId);
            if (person) peopleById.set(person.personId, person);
            return person;
        };
        for (const conversation of conversations) {
            if (conversation.kind !== 'group') continue;
            const group = await requireFunction(repository.getGroup, 'repository.getGroup')(scopeId, conversation.groupId);
            if (!group || group.status !== 'active') continue;
            const memberPeople = await Promise.all((group.memberIds || []).map(resolveGroupPerson));
            const labelsById = new Map(memberPeople.filter(Boolean).map((person) => {
                const reference = assignPersonReference(person);
                return [person.personId, personLabel(reference)];
            }));
            const labelFor = (personId) => labelsById.get(personId)
                || (personId === '__self__' ? '用户' : asText(personId, 120));
            const messages = truncateConversationHistory(
                await listMessages(scopeId, conversation.conversationId),
                historyLimit,
            );
            candidates.push({
                referenceId: `G${candidates.length + 1}`,
                conversationId: conversation.conversationId,
                personId: '',
                title: asText(group.name, 120),
                members: (group.memberIds || []).map(labelFor),
                ownerName: labelFor(group.ownerId),
                adminNames: (group.adminIds || []).map(labelFor),
                memberIds: [...(group.memberIds || [])],
                ownerId: group.ownerId || '',
                adminIds: [...(group.adminIds || [])],
                reinviteOnly: false,
                peopleById: Object.fromEntries(memberPeople.filter(Boolean).map((person) => [person.personId, asText(person.formalName, 120)])),
                messages,
            });
        }
        const friendReferences = privateFriends.map(assignPersonReference).filter(Boolean);
        return {
            candidates,
            personReferences: Object.fromEntries(referencedPeople.map((person) => [person.referenceId, person.personId])),
            friendReferences,
        };
    };

    const executeCycle = async ({ scopeId, kind, configRevision, scopeSession, signal, isCurrent }) => {
        if (privateOnly && kind !== 'private') return { status: 'cancelled' };
        const current = () => configRevisionByScope.get(scopeId) === configRevision
            && !signal?.aborted
            && isUsableScopeSession(scopeSession)
            && (typeof isCurrent !== 'function' || isCurrent());
        if (!current()) return { status: 'cancelled' };
        const scope = await requireFunction(repository.getScope, 'repository.getScope')(scopeId);
        if (!scope || !current()) return { status: 'cancelled' };
        const runtimeSettings = await runtimeSettingsResolver(scopeId, scope, { scopeSession }) || scope.settings || {};
        if (!current()) return { status: 'cancelled' };
        const apiPresetId = asText(runtimeSettings.activeApiPresetId, 256);
        const promptPresetId = asText(
            kind === 'group' ? runtimeSettings.groupProactivePresetId : runtimeSettings.privateProactivePresetId,
            256,
        );
        if (!apiPresetId || !promptPresetId) {
            throw new QQV2ProactiveError('QQ API 或主动消息指令预设未选择', 'preset_missing');
        }
        const apiPresetResolver = requireFunction(options.apiPresetResolver, 'apiPresetResolver');
        const promptPresetResolver = requireFunction(options.promptPresetResolver, 'promptPresetResolver');
        const backend = options.backend;
        if (!backend || typeof backend.generate !== 'function') {
            throw new QQV2ProactiveError('QQ 主动周期缺少 backend.generate', 'dependency_missing');
        }
        const commitActions = resolveCommitActions();
        if (!commitActions) throw new QQV2ProactiveError('QQ 主动周期缺少动作提交入口', 'dependency_missing');
        const [apiPreset, promptPreset, candidateData, stickers] = await Promise.all([
            apiPresetResolver(apiPresetId),
            promptPresetResolver(promptPresetId),
            resolveCandidates(scopeId, kind, runtimeSettings.conversationHistoryLimit),
            listStickers(),
        ]);
        if (!apiPreset || !promptPreset) {
            throw new QQV2ProactiveError('所选 QQ API 或主动消息指令预设已不存在', 'preset_missing');
        }
        if (!current()) return { status: 'cancelled' };
        const { candidates, personReferences, friendReferences } = candidateData;
        const projectionSignaturesBeforeCommit = new Map(candidates.map((candidate) => [
            candidate.conversationId,
            createProjectionSignature(candidate),
        ]));
        const storyTime = asText(getStoryTime(), 128);
        const sections = buildSections({ kind, conversations: candidates });
        const stickerCatalog = buildQQV2StickerCatalog(stickers);
        const promptContext = await getPromptContext({
            scopeId,
            scopeSession,
            kind,
            scope,
            runtimeSettings,
            candidates,
            friendReferences,
            storyTime,
        }) || {};
        if (!current()) return { status: 'cancelled' };
        const variables = {
            ...promptContext,
            privatePerson: '无',
            privateProactivePeople: kind === 'private' ? buildPrivateProactiveIdentity(candidates) : '无',
            groupMembers: kind === 'group' ? buildGroupIdentity(candidates, friendReferences) : '无',
            privateProactiveHistory: kind === 'private' ? sections : '无',
            groupHistory: kind === 'group' ? sections : '无',
            storyTime: asText(promptContext.storyTime || storyTime, 128),
            availableStickers: stickerCatalog.text,
        };
        const promptMessages = await buildProactiveRequest({
            scopeId,
            kind,
            scope,
            candidates,
            preset: promptPreset,
            variables,
        });
        if (!current()) return { status: 'cancelled' };
        const response = await backend.generate({ preset: apiPreset, messages: promptMessages, signal });
        if (!current()) return { status: 'cancelled' };
        const references = Object.fromEntries(candidates.map((candidate) => [candidate.referenceId, candidate.conversationId]));
        const messageReferences = createProactiveMessageReferences(candidates);
        const visibleMessageRefs = new Set(Object.keys(messageReferences));
        // The commit seam must make the last currentness check immediately before its transaction.
        if (!current()) return { status: 'cancelled' };
        const actionResult = await commitActions({
            scopeId,
            kind,
            response: response?.content ?? response,
            scenario: `${kind}-proactive`,
            references,
            personReferences,
            messageReferences,
            visibleMessageRefs,
            stickers: new Set(Object.keys(stickerCatalog.references)),
            stickerReferences: stickerCatalog.references,
            storyTime,
            scopeSession,
            isCurrent: current,
        });
        if (!current()) return { status: 'cancelled' };
        const appliedActions = Array.isArray(actionResult?.applied) ? actionResult.applied : [];
        const createdConversationIds = Array.isArray(actionResult?.createdConversationIds)
            ? actionResult.createdConversationIds
            : [];
        if (createdConversationIds.length === 0
            && appliedActions.every((action) => ['none', 'read'].includes(action?.type))) {
            return { status: 'succeeded' };
        }
        const affectedConversationIds = new Set(createdConversationIds);
        const committedMessageConversationIds = new Set();
        const committedMessageIds = new Set();
        const appliedMessageIds = new Set(appliedActions
            .filter((action) => ['message', 'transfer'].includes(action?.type))
            .map((action) => asText(action?.messageId, 256))
            .filter(Boolean));
        if (appliedMessageIds.size > 0) {
            const candidateConversationIds = [...new Set([
                ...candidates.map((candidate) => candidate.conversationId),
                ...createdConversationIds,
            ])];
            const listMessages = requireFunction(repository.listMessages, 'repository.listMessages');
            await Promise.all(candidateConversationIds.map(async (conversationId) => {
                const messages = await listMessages(scopeId, conversationId);
                if (messages.some((message) => appliedMessageIds.has(asText(message?.messageId, 256)))) {
                    affectedConversationIds.add(conversationId);
                }
                messages.forEach((message) => {
                    const messageId = asText(message?.messageId, 256);
                    if (!appliedMessageIds.has(messageId) || message?.senderType !== 'person') return;
                    committedMessageConversationIds.add(conversationId);
                    committedMessageIds.add(messageId);
                });
            }));
        }
        if (onMessagesCommitted && committedMessageConversationIds.size > 0) {
            try {
                await onMessagesCommitted({
                    scopeId,
                    scopeSession,
                    conversationIds: [...committedMessageConversationIds],
                    messageIds: [...committedMessageIds],
                    storyTime,
                });
            } catch {
                // 浮层等旁路观察者不得把已经提交的 QQ 主动消息变成失败。
            }
        }
        const hasUnresolvedProjectionAction = appliedActions.some((action) => (
            !['none', 'read', 'message', 'transfer', 'create-private', 'create-group'].includes(action?.type)
        ));
        if (hasUnresolvedProjectionAction) {
            const nextCandidateData = await resolveCandidates(
                scopeId,
                kind,
                runtimeSettings.conversationHistoryLimit,
            );
            if (!current()) return { status: 'cancelled' };
            const projectionSignaturesAfterCommit = new Map(nextCandidateData.candidates.map((candidate) => [
                candidate.conversationId,
                createProjectionSignature(candidate),
            ]));
            const comparableConversationIds = new Set([
                ...projectionSignaturesBeforeCommit.keys(),
                ...projectionSignaturesAfterCommit.keys(),
            ]);
            comparableConversationIds.forEach((conversationId) => {
                if (projectionSignaturesBeforeCommit.get(conversationId)
                    !== projectionSignaturesAfterCommit.get(conversationId)) {
                    affectedConversationIds.add(conversationId);
                }
            });
        }
        const conversationIds = [...affectedConversationIds];
        if (conversationIds.length === 0) return { status: 'succeeded' };
        if (!current()) return { status: 'cancelled' };
        try {
            await syncWorldbook({
                scopeId,
                scopeSession,
                conversationIds,
                storyTime,
                userName: asText(getUserName(), 256),
                actionResult,
            });
        } catch (error) {
            if (!current()) return { status: 'cancelled' };
            try {
                onProjectionError(error, { scopeId, conversationIds, storyTime, actionResult });
            } catch {
                // Projection observers are diagnostic only and cannot turn a committed QQ batch into a failure.
            }
        }
        if (!current()) return { status: 'cancelled' };
        return { status: 'succeeded' };
    };

    return Object.freeze({
        async getState(scopeId, options = {}) {
            const normalizedScopeId = asText(scopeId, 512);
            if (!normalizedScopeId) throw new QQV2ProactiveError('QQ 作用域 ID 不能为空', 'scope_required');
            const scopeSession = options?.scopeSession;
            const operationOptions = scopeSession ? { scopeSession } : {};
            const scope = await ensureScope(normalizedScopeId, null, operationOptions);
            const runtimeSettings = await runtimeSettingsResolver(normalizedScopeId, scope, operationOptions);
            return cloneState(runtimeSettings?.proactive);
        },
        async enqueueProactiveCycle(input = {}) {
            const scopeId = asText(input.scopeId, 512);
            if (!scopeId) throw new QQV2ProactiveError('QQ 作用域 ID 不能为空', 'scope_required');
            const scopeSession = isUsableScopeSession(input.scopeSession)
                ? input.scopeSession
                : captureUsableScopeSession(scopeId);
            if (!scopeSession) {
                return Object.freeze({ triggered: false, queued: false, skipped: 'scope-session-inactive' });
            }
            const scope = await ensureScope(scopeId, null, { scopeSession });
            if (!isUsableScopeSession(scopeSession)) {
                return Object.freeze({ triggered: false, queued: false, skipped: 'scope-session-inactive' });
            }
            const configRevision = configRevisionByScope.get(scopeId) ?? 0;
            configRevisionByScope.set(scopeId, configRevision);
            const runtimeSettings = await runtimeSettingsResolver(scopeId, scope, { scopeSession });
            if (configRevisionByScope.get(scopeId) !== configRevision) {
                return Object.freeze({ triggered: false, queued: false, skipped: 'configuration-changed' });
            }
            if (!isUsableScopeSession(scopeSession)) {
                return Object.freeze({ triggered: false, queued: false, skipped: 'scope-session-inactive' });
            }
            if (runtimeSettings?.proactive?.enabled !== true) {
                return Object.freeze({ triggered: false, queued: false, skipped: 'disabled' });
            }
            const requestedKind = ['private', 'group'].includes(input.kind) ? input.kind : '';
            const privateWeight = Math.max(0, Math.min(100, Number(runtimeSettings?.proactive?.privateWeight) || 0));
            const cycleKind = privateOnly
                ? 'private'
                : requestedKind || (Number(random()) < privateWeight / 100 ? 'private' : 'group');
            const queued = await requestService.enqueueProactive({
                scopeId,
                execute: (request) => executeCycle({
                    ...request,
                    kind: cycleKind,
                    configRevision,
                    scopeSession,
                }),
            });
            return Object.freeze({
                triggered: true,
                cycleKind,
                queued: queued?.queued === true,
                skipped: asText(queued?.skipped, 128),
            });
        },
        cancelScope(input = {}) {
            const scopeId = asText(typeof input === 'string' ? input : input.scopeId, 512);
            if (!scopeId) return 0;
            advanceConfigRevision(scopeId);
            return requestService.cancelProactive({ scopeId });
        },
    });
}

export class QQV2ProactiveError extends Error {
    constructor(message, code = 'proactive_failed') {
        super(message);
        this.name = 'QQV2ProactiveError';
        this.code = code;
    }
}
