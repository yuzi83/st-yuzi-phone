const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    return import(`${href}?contract=${Date.now()}-${Math.random()}`);
}

async function createRepository() {
    const { createMemoryQQV2StateStore } = await importModule('modules/qq-v2/storage/state-store.js');
    const { createQQV2Repository } = await importModule('modules/qq-v2/domain/repository.js');
    return createQQV2Repository({ stateStore: createMemoryQQV2StateStore() });
}

function createRequestServiceFixture() {
    const cancelledScopes = [];
    const proactiveEntries = [];
    let enqueueResult = { queued: true };
    return {
        cancelledScopes,
        proactiveEntries,
        setEnqueueResult(value) {
            enqueueResult = value;
        },
        async enqueueProactive(input) {
            proactiveEntries.push(input);
            return copy(enqueueResult);
        },
        cancelProactive(input) {
            cancelledScopes.push(input.scopeId);
            return 0;
        },
        getQueueState() {
            return { active: null, queuedManualCount: 0, queuedProactiveCount: 0 };
        },
    };
}

function copy(value) {
    return JSON.parse(JSON.stringify(value));
}

function createProactiveRepositoryFixture(options = {}) {
    const scopeId = 'st:character:alice:proactive-execution';
    const settings = {
        activeApiPresetId: 'api-1',
        privateProactivePresetId: 'prompt-private',
        groupProactivePresetId: 'prompt-group',
        conversationHistoryLimit: 100,
        proactive: { enabled: false, everyTurns: 5, count: 0, nextKind: 'private' },
    };
    const people = {
        'person-alice': { personId: 'person-alice', formalName: '林知夏' },
        'person-bob': { personId: 'person-bob', formalName: '顾言' },
    };
    const conversations = [
        { conversationId: 'private-1', kind: 'private', personId: 'person-alice', status: 'active' },
        { conversationId: 'group-1', kind: 'group', groupId: 'group-1', status: 'active' },
    ];
    if (options.includeBobPrivate) {
        conversations.splice(1, 0, { conversationId: 'private-2', kind: 'private', personId: 'person-bob', status: 'active' });
    }
    const groups = {
        'group-1': {
            groupId: 'group-1',
            name: '夜谈群',
            ownerId: 'person-alice',
            adminIds: ['person-bob'],
            memberIds: ['person-alice', 'person-bob'],
            selfExited: false,
            status: 'active',
        },
    };
    const messages = {
        'private-1': [
            { messageId: 'p-user', senderType: 'self', type: 'text', content: '今天怎么样？' },
            { messageId: 'p-npc', senderType: 'person', type: 'text', content: '还不错。' },
        ],
        'private-2': [],
        'group-1': [{ messageId: 'g-1', senderType: 'person', type: 'text', content: '大家晚上好。' }],
    };
    const repository = {
        scopeId,
        async getProactiveSettings(id) {
            assert.equal(id, scopeId);
            return copy(settings.proactive);
        },
        async updateProactiveSettings(id, patch) {
            assert.equal(id, scopeId);
            const prior = settings.proactive;
            const next = { ...prior, ...patch };
            if (next.enabled !== prior.enabled || next.everyTurns !== prior.everyTurns) {
                next.count = 0;
                next.nextKind = 'private';
            }
            settings.proactive = next;
            return copy(next);
        },
        async consumeProactiveStoryReply(id, configuration = null) {
            assert.equal(id, scopeId);
            const persisted = settings.proactive;
            const source = configuration || persisted;
            const current = {
                ...persisted,
                enabled: Object.hasOwn(source, 'enabled') ? source.enabled === true : persisted.enabled,
                everyTurns: Object.hasOwn(source, 'everyTurns') ? Number(source.everyTurns) : persisted.everyTurns,
            };
            if (!current.enabled) return { ...copy(current), triggered: false, kind: null };
            current.count += 1;
            if (current.count < current.everyTurns) {
                persisted.count = current.count;
                return { ...copy(current), triggered: false, kind: null };
            }
            const kind = current.nextKind;
            current.count = 0;
            current.nextKind = kind === 'private' ? 'group' : 'private';
            persisted.count = current.count;
            persisted.nextKind = current.nextKind;
            return { ...copy(current), triggered: true, kind };
        },
        async getScope(id) {
            assert.equal(id, scopeId);
            return { scopeId, settings: copy(settings) };
        },
        async listConversations(id) {
            assert.equal(id, scopeId);
            return copy(conversations);
        },
        async getPerson(id, personId) {
            assert.equal(id, scopeId);
            return people[personId] ? copy(people[personId]) : null;
        },
        async getGroup(id, groupId) {
            assert.equal(id, scopeId);
            return groups[groupId] ? copy(groups[groupId]) : null;
        },
        async listMessages(id, conversationId) {
            assert.equal(id, scopeId);
            return copy(messages[conversationId] || []);
        },
    };
    return { repository, scopeId, conversations, groups };
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

async function waitUntil(predicate, description) {
    for (let index = 0; index < 80; index += 1) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    assert.fail(`Timed out waiting for ${description}`);
}

async function testConfigurationDefaultsAndResets() {
    const { createQQV2ProactiveService } = await importModule('modules/qq-v2/proactive/service.js');
    const repository = await createRepository();
    const requestService = createRequestServiceFixture();
    const scopeId = 'st:character:alice:proactive-config';
    await repository.ensureScope(scopeId);

    const service = createQQV2ProactiveService({ repository, requestService });
    assert.deepEqual(await service.getState(scopeId), {
        enabled: false,
        everyTurns: 5,
        count: 0,
        nextKind: 'private',
    });

    assert.deepEqual(await service.configure({ scopeId, enabled: true, everyTurns: 2 }), {
        enabled: true,
        everyTurns: 2,
        count: 0,
        nextKind: 'private',
    });
    await service.recordSuccessfulStoryReply({ scopeId, message: { role: 'assistant', content: '已累计一轮' } });
    assert.equal((await service.getState(scopeId)).count, 1);
    assert.deepEqual(await service.configure({ scopeId, everyTurns: 3 }), {
        enabled: true,
        everyTurns: 3,
        count: 0,
        nextKind: 'private',
    });
    assert.deepEqual(await service.configure({ scopeId, enabled: false }), {
        enabled: false,
        everyTurns: 3,
        count: 0,
        nextKind: 'private',
    });
    assert.deepEqual(requestService.cancelledScopes, [scopeId, scopeId, scopeId]);
}

async function testConfigurationCreatesAnEmptyCurrentScopeOnDemand() {
    const { createQQV2ProactiveService } = await importModule('modules/qq-v2/proactive/service.js');
    const repository = await createRepository();
    const requestService = createRequestServiceFixture();
    const scopeId = 'st:character:alice:new-proactive-scope';
    const service = createQQV2ProactiveService({ repository, requestService });

    assert.deepEqual(await service.configure({ scopeId, enabled: true, everyTurns: 3 }), {
        enabled: true,
        everyTurns: 3,
        count: 0,
        nextKind: 'private',
    });
    assert.deepEqual(await service.getState(scopeId), {
        enabled: true,
        everyTurns: 3,
        count: 0,
        nextKind: 'private',
    });
}

async function testStateAndConfigurationReuseTheProvidedScopeSession() {
    const { createQQV2ProactiveService } = await importModule('modules/qq-v2/proactive/service.js');
    const { repository, scopeId } = createProactiveRepositoryFixture();
    const requestService = createRequestServiceFixture();
    const scopeSession = Object.freeze({
        scopeId,
        isCurrent: () => true,
        isReady: () => true,
    });
    const ensureSessions = [];
    const resolverSessions = [];
    const updateSessions = [];
    const originalUpdate = repository.updateProactiveSettings;
    repository.ensureScope = async (id, _metadata, options) => {
        assert.equal(id, scopeId);
        ensureSessions.push(options?.scopeSession);
        return repository.getScope(id);
    };
    repository.updateProactiveSettings = async (id, patch, options) => {
        updateSessions.push(options?.scopeSession);
        return originalUpdate(id, patch);
    };
    const service = createQQV2ProactiveService({
        repository,
        requestService,
        captureScopeSession() {
            assert.fail('an explicitly provided scope session must not be recaptured');
        },
        runtimeSettingsResolver: async (_scopeId, scope, options) => {
            resolverSessions.push(options?.scopeSession);
            return scope.settings;
        },
    });

    await service.getState(scopeId, { scopeSession });
    await service.configure({ scopeId, scopeSession, enabled: true, everyTurns: 2 });

    assert.deepEqual(ensureSessions, [scopeSession, scopeSession]);
    assert.deepEqual(resolverSessions, [scopeSession]);
    assert.deepEqual(updateSessions, [scopeSession]);
}

async function testExplicitInactiveConfigurationSessionIsNotRecaptured() {
    const { createQQV2ProactiveService } = await importModule('modules/qq-v2/proactive/service.js');
    const { repository, scopeId } = createProactiveRepositoryFixture();
    const requestService = createRequestServiceFixture();
    let captures = 0;
    let updates = 0;
    const originalUpdate = repository.updateProactiveSettings;
    repository.updateProactiveSettings = async (...args) => {
        updates += 1;
        return originalUpdate(...args);
    };
    const service = createQQV2ProactiveService({
        repository,
        requestService,
        captureScopeSession() {
            captures += 1;
            return { scopeId, isCurrent: () => true, isReady: () => true };
        },
    });
    const scopeSession = { scopeId, isCurrent: () => false, isReady: () => true };

    await assert.rejects(
        () => service.configure({ scopeId, scopeSession, enabled: true }),
        (error) => error?.code === 'scope_inactive',
    );
    assert.equal(captures, 0);
    assert.equal(updates, 0);
    assert.deepEqual(requestService.cancelledScopes, []);
}

async function testReconfigurationDuringCountCannotQueueAStaleCycle() {
    const { createQQV2ProactiveService } = await importModule('modules/qq-v2/proactive/service.js');
    const { repository, scopeId } = createProactiveRepositoryFixture();
    const requestService = createRequestServiceFixture();
    const originalConsume = repository.consumeProactiveStoryReply;
    const pendingConsume = deferred();
    let consumeStarted = false;
    repository.consumeProactiveStoryReply = async (...args) => {
        consumeStarted = true;
        await originalConsume(...args);
        return pendingConsume.promise;
    };
    const service = createQQV2ProactiveService({ repository, requestService });
    await service.configure({ scopeId, enabled: true, everyTurns: 1 });

    const record = service.recordSuccessfulStoryReply({
        scopeId,
        message: { role: 'assistant', content: '正在记数' },
    });
    await waitUntil(() => consumeStarted, 'the story reply counter to begin');
    await service.configure({ scopeId, enabled: false });
    pendingConsume.resolve({ enabled: true, everyTurns: 1, count: 0, nextKind: 'group', triggered: true, kind: 'private' });

    assert.deepEqual(await record, {
        counted: false,
        triggered: false,
        skipped: 'configuration-changed',
    });
    assert.equal(requestService.proactiveEntries.length, 0);
}

async function testInactiveScopeSessionCannotCountOrQueueAProactiveCycle() {
    const { createQQV2ProactiveService } = await importModule('modules/qq-v2/proactive/service.js');
    const { repository, scopeId } = createProactiveRepositoryFixture();
    const requestService = createRequestServiceFixture();
    let ready = false;
    const service = createQQV2ProactiveService({
        repository,
        requestService,
        captureScopeSession: (capturedScopeId) => {
            assert.equal(capturedScopeId, scopeId);
            return { isCurrent: () => true, isReady: () => ready };
        },
    });
    await service.configure({
        scopeId,
        scopeSession: { scopeId, isCurrent: () => true, isReady: () => true },
        enabled: true,
        everyTurns: 1,
    });

    assert.deepEqual(await service.recordSuccessfulStoryReply({
        scopeId,
        message: { role: 'assistant', content: '作用域尚未就绪' },
    }), {
        counted: false,
        triggered: false,
        skipped: 'scope-session-inactive',
    });
    assert.equal(requestService.proactiveEntries.length, 0);
    assert.equal((await service.getState(scopeId)).count, 0);

    ready = true;
    const result = await service.recordSuccessfulStoryReply({
        scopeId,
        message: { role: 'assistant', content: '作用域已经就绪' },
    });
    assert.equal(result.queued, true);
    assert.equal(requestService.proactiveEntries.length, 1);
}

async function testScopeSessionInvalidatedDuringCountCannotQueueAProactiveCycle() {
    const { createQQV2ProactiveService } = await importModule('modules/qq-v2/proactive/service.js');
    const { repository, scopeId } = createProactiveRepositoryFixture();
    const requestService = createRequestServiceFixture();
    const originalConsume = repository.consumeProactiveStoryReply;
    const pendingConsume = deferred();
    let current = true;
    let consumeStarted = false;
    repository.consumeProactiveStoryReply = async (...args) => {
        consumeStarted = true;
        await originalConsume(...args);
        return pendingConsume.promise;
    };
    const service = createQQV2ProactiveService({
        repository,
        requestService,
        captureScopeSession: () => ({ isCurrent: () => current, isReady: () => true }),
    });
    await service.configure({ scopeId, enabled: true, everyTurns: 1 });

    const record = service.recordSuccessfulStoryReply({
        scopeId,
        message: { role: 'assistant', content: '切换中的正文回复' },
    });
    await waitUntil(() => consumeStarted, 'the story reply counter to begin before scope invalidation');
    current = false;
    pendingConsume.resolve({ enabled: true, everyTurns: 1, count: 0, nextKind: 'group', triggered: true, kind: 'private' });

    assert.deepEqual(await record, {
        counted: false,
        triggered: false,
        skipped: 'scope-session-inactive',
    });
    assert.equal(requestService.proactiveEntries.length, 0);
}

async function testOnlySuccessfulStoryRepliesCountAndKindsAlternate() {
    const { createQQV2ProactiveService } = await importModule('modules/qq-v2/proactive/service.js');
    const repository = await createRepository();
    const requestService = createRequestServiceFixture();
    const scopeId = 'st:character:alice:proactive-cycle';
    await repository.ensureScope(scopeId);
    const service = createQQV2ProactiveService({ repository, requestService });
    await service.configure({ scopeId, enabled: true, everyTurns: 2 });

    assert.deepEqual(await service.recordSuccessfulStoryReply({
        scopeId,
        message: { role: 'user', content: '这不是角色回复' },
    }), {
        counted: false,
        triggered: false,
        skipped: 'not-successful-story-reply',
    });
    assert.equal((await service.getState(scopeId)).count, 0);

    assert.deepEqual(await service.recordSuccessfulStoryReply({
        scopeId,
        message: { role: 'assistant', content: '第一轮' },
    }), {
        counted: true,
        triggered: false,
        cycleKind: null,
        queued: false,
        skipped: '',
    });
    assert.equal((await service.getState(scopeId)).count, 1);

    assert.deepEqual(await service.recordSuccessfulStoryReply({
        scopeId,
        message: { role: 'assistant', content: '第二轮' },
    }), {
        counted: true,
        triggered: true,
        cycleKind: 'private',
        queued: true,
        skipped: '',
    });
    assert.equal(requestService.proactiveEntries.length, 1);
    assert.equal(requestService.proactiveEntries[0].scopeId, scopeId);
    assert.equal(typeof requestService.proactiveEntries[0].execute, 'function');
    assert.deepEqual(await service.getState(scopeId), {
        enabled: true,
        everyTurns: 2,
        count: 0,
        nextKind: 'group',
    });

    await service.recordSuccessfulStoryReply({ scopeId, message: { role: 'assistant', content: '第三轮' } });
    const groupCycle = await service.recordSuccessfulStoryReply({
        scopeId,
        message: { role: 'assistant', content: '第四轮' },
    });
    assert.equal(groupCycle.cycleKind, 'group');
    assert.equal(requestService.proactiveEntries.length, 2);
}

async function testPrivateOnlyModeNeverEnqueuesGroupCycles() {
    const { createQQV2ProactiveService } = await importModule('modules/qq-v2/proactive/service.js');
    const { repository, scopeId } = createProactiveRepositoryFixture();
    const requestService = createRequestServiceFixture();
    const service = createQQV2ProactiveService({ repository, requestService, privateOnly: true });
    await service.configure({ scopeId, enabled: true, everyTurns: 1 });

    const first = await service.recordSuccessfulStoryReply({
        scopeId,
        message: { role: 'assistant', content: 'first private-only cycle' },
    });
    const second = await service.recordSuccessfulStoryReply({
        scopeId,
        message: { role: 'assistant', content: 'second private-only cycle' },
    });

    assert.equal(first.cycleKind, 'private');
    assert.equal(second.cycleKind, 'private');
    assert.equal(requestService.proactiveEntries.length, 2);
    assert.deepEqual(await service.getState(scopeId), {
        enabled: true,
        everyTurns: 1,
        count: 0,
        nextKind: 'private',
    });
}

async function testPrivateCycleBuildsOnePromptAndCommitsCurrentBatch() {
    const { createQQV2ProactiveService } = await importModule('modules/qq-v2/proactive/service.js');
    const { repository, scopeId } = createProactiveRepositoryFixture();
    const requestService = createRequestServiceFixture();
    const generated = [];
    const committed = [];
    const promptContexts = [];
    const projected = [];
    const scopeSession = Object.freeze({
        scopeId,
        isCurrent: () => true,
        isReady: () => true,
    });
    const service = createQQV2ProactiveService({
        repository,
        requestService,
        captureScopeSession: () => scopeSession,
        apiPresetResolver: async (id) => ({ id, model: 'qq-model' }),
        promptPresetResolver: async (id) => ({
            id,
            blocks: [{ role: 'system', content: '人物={{私聊主动人物}}\n记录={{私聊主动记录}}\n正文={{正文上下文}}\n表情={{可用表情}}' }],
        }),
        getPromptContext: async (input) => {
            promptContexts.push(input);
            return { storyContext: '正文最近回合', worldbookContent: '世界书条目' };
        },
        listStickers: async () => [{ id: 'sticker-uuid-a', description: '<img src="data:image/png;base64,AAAA"> 开心' }],
        getStoryTime: () => '2042-05-01 20:00',
        backend: {
            async generate(input) {
                generated.push(input);
                return { content: '<qq><none /></qq>' };
            },
        },
        async commitActions(input) {
            committed.push(input);
            return { createdConversationIds: [] };
        },
        async syncWorldbook(input) {
            projected.push(input);
        },
    });
    await service.configure({ scopeId, enabled: true, everyTurns: 1 });

    const result = await service.recordSuccessfulStoryReply({
        scopeId,
        message: { role: 'assistant', content: '正文回复成功' },
    });
    assert.equal(result.cycleKind, 'private');
    assert.equal(requestService.proactiveEntries.length, 1);

    const execution = await requestService.proactiveEntries[0].execute({
        scopeId,
        signal: new AbortController().signal,
        isCurrent: () => true,
    });
    assert.deepEqual(execution, { status: 'succeeded' });
    assert.equal(generated.length, 1);
    assert.equal(promptContexts.length, 1);
    assert.strictEqual(promptContexts[0].scopeSession, scopeSession);
    assert.equal(generated[0].preset.id, 'api-1');
    assert.deepEqual(generated[0].messages, [{
        role: 'system',
        content: '人物=P1：林知夏\n记录=<private id="P1" name="林知夏"><message id="P1-M1" sender="user" type="text">今天怎么样？</message><message id="P1-M2" sender="npc" type="text">还不错。</message></private>\n正文=正文最近回合\n表情=S1｜开心',
    }]);
    assert.equal(committed.length, 1);
    assert.equal(committed[0].scenario, 'private-proactive');
    assert.deepEqual(committed[0].references, { P1: 'private-1' });
    assert.deepEqual(committed[0].personReferences, { P1: 'person-alice' });
    assert.deepEqual(committed[0].messageReferences, { 'P1-M1': 'p-user', 'P1-M2': 'p-npc' });
    assert.deepEqual(committed[0].visibleMessageRefs, new Set(['P1-M1', 'P1-M2']));
    assert.deepEqual(committed[0].stickers, new Set(['S1']));
    assert.deepEqual(committed[0].stickerReferences, { S1: 'sticker-uuid-a' });
    assert.equal(committed[0].isCurrent(), true);
    assert.equal(projected.length, 1);
    assert.strictEqual(projected[0].scopeSession, scopeSession);
    assert.deepEqual(projected[0].conversationIds, ['private-1']);
}

async function testGlobalRuntimeSettingsDriveProactiveExecution() {
    const { createQQV2ProactiveService } = await importModule('modules/qq-v2/proactive/service.js');
    const { repository, scopeId } = createProactiveRepositoryFixture();
    const requestService = createRequestServiceFixture();
    const apiPresetIds = [];
    const promptPresetIds = [];
    const promptContextInputs = [];
    const runtimeSettings = {
        activeApiPresetId: 'api-global',
        privateProactivePresetId: 'prompt-global',
        conversationHistoryLimit: 2,
        proactive: { enabled: true, everyTurns: 1 },
    };
    const service = createQQV2ProactiveService({
        repository,
        requestService,
        privateOnly: true,
        runtimeSettingsResolver: async () => runtimeSettings,
        apiPresetResolver: async (id) => {
            apiPresetIds.push(id);
            return { id };
        },
        promptPresetResolver: async (id) => {
            promptPresetIds.push(id);
            return { messages: [] };
        },
        getPromptContext: async (input) => {
            promptContextInputs.push(input);
            return {};
        },
        backend: { async generate() { return { content: '<qq><none /></qq>' }; } },
        async commitActions() { return { createdConversationIds: [] }; },
    });

    service.cancelScope({ scopeId });
    assert.deepEqual(await service.getState(scopeId), {
        enabled: true,
        everyTurns: 1,
        count: 0,
        nextKind: 'private',
    });
    const cycle = await service.recordSuccessfulStoryReply({
        scopeId,
        message: { role: 'assistant', content: '触发全局主动配置' },
    });
    assert.equal(cycle.triggered, true);
    await requestService.proactiveEntries[0].execute({
        scopeId,
        signal: new AbortController().signal,
        isCurrent: () => true,
    });
    assert.deepEqual(apiPresetIds, ['api-global']);
    assert.deepEqual(promptPresetIds, ['prompt-global']);
    assert.equal(promptContextInputs.length, 1);
    assert.strictEqual(promptContextInputs[0].runtimeSettings, runtimeSettings);
}

async function testPrivateCycleLimitsEachConversationHistoryIndependently() {
    const { createQQV2ProactiveService } = await importModule('modules/qq-v2/proactive/service.js');
    const { repository, scopeId } = createProactiveRepositoryFixture({ includeBobPrivate: true });
    const originalGetScope = repository.getScope;
    const originalListMessages = repository.listMessages;
    repository.getScope = async (id) => {
        const scope = await originalGetScope(id);
        scope.settings.conversationHistoryLimit = 1;
        return scope;
    };
    repository.listMessages = async (id, conversationId) => {
        if (conversationId === 'private-1') {
            return [
                { messageId: 'old-a', senderType: 'self', type: 'text', content: '过期 A' },
                { messageId: 'new-a1', senderType: 'person', type: 'text', content: '最新 A1' },
                { messageId: 'new-a2', senderType: 'self', type: 'text', content: '最新 A2' },
            ];
        }
        if (conversationId === 'private-2') {
            return [
                { messageId: 'old-b', senderType: 'self', type: 'text', content: '过期 B' },
                { messageId: 'new-b1', senderType: 'person', type: 'text', content: '最新 B1' },
                { messageId: 'new-b2', senderType: 'self', type: 'text', content: '最新 B2' },
            ];
        }
        return originalListMessages(id, conversationId);
    };
    const requestService = createRequestServiceFixture();
    const generated = [];
    const service = createQQV2ProactiveService({
        repository,
        requestService,
        privateOnly: true,
        runtimeSettingsResolver: async (_scopeId, scope) => ({
            ...(scope || await repository.getScope(scopeId)).settings,
            conversationHistoryLimit: 2,
        }),
        apiPresetResolver: async () => ({ id: 'api-1' }),
        promptPresetResolver: async () => ({ blocks: [{ role: 'system', content: '{{私聊主动记录}}' }] }),
        backend: {
            async generate(input) {
                generated.push(input);
                return { content: '<qq><none /></qq>' };
            },
        },
        async commitActions() { return { createdConversationIds: [] }; },
    });
    await service.configure({ scopeId, enabled: true, everyTurns: 1 });
    await service.recordSuccessfulStoryReply({ scopeId, message: { role: 'assistant', content: '触发' } });
    await requestService.proactiveEntries[0].execute({
        scopeId,
        signal: new AbortController().signal,
        isCurrent: () => true,
    });

    const content = generated[0].messages[0].content;
    assert.doesNotMatch(content, /过期 A|过期 B/u);
    for (const text of ['最新 A1', '最新 A2', '最新 B1', '最新 B2']) assert.match(content, new RegExp(text, 'u'));
}

async function testProjectionFailureDoesNotRollBackCommittedActions() {
    const { createQQV2ProactiveService } = await importModule('modules/qq-v2/proactive/service.js');
    const { repository, scopeId } = createProactiveRepositoryFixture();
    const requestService = createRequestServiceFixture();
    let commits = 0;
    let projectionErrors = 0;
    const service = createQQV2ProactiveService({
        repository,
        requestService,
        apiPresetResolver: async () => ({ id: 'api-1' }),
        promptPresetResolver: async () => ({ blocks: [] }),
        backend: { async generate() { return { content: '<qq><none /></qq>' }; } },
        async commitActions() {
            commits += 1;
            return { createdConversationIds: [] };
        },
        async syncWorldbook() {
            throw new Error('worldbook is temporarily unavailable');
        },
        onProjectionError() {
            projectionErrors += 1;
            throw new Error('observer failure must be isolated');
        },
    });
    await service.configure({ scopeId, enabled: true, everyTurns: 1 });
    await service.recordSuccessfulStoryReply({ scopeId, message: { role: 'assistant', content: '触发' } });

    const execution = await requestService.proactiveEntries[0].execute({
        scopeId,
        signal: new AbortController().signal,
        isCurrent: () => true,
    });
    assert.deepEqual(execution, { status: 'succeeded' });
    assert.equal(commits, 1);
    assert.equal(projectionErrors, 1);
}

async function testCancelledLateResponseNeverCommitsActions() {
    const { createQQV2ProactiveService } = await importModule('modules/qq-v2/proactive/service.js');
    const { repository, scopeId } = createProactiveRepositoryFixture();
    const requestService = createRequestServiceFixture();
    const response = deferred();
    let generated = false;
    let commits = 0;
    const service = createQQV2ProactiveService({
        repository,
        requestService,
        apiPresetResolver: async () => ({ id: 'api-1' }),
        promptPresetResolver: async () => ({ blocks: [] }),
        backend: {
            async generate() {
                generated = true;
                return response.promise;
            },
        },
        async commitActions() { commits += 1; },
    });
    await service.configure({ scopeId, enabled: true, everyTurns: 1 });
    await service.recordSuccessfulStoryReply({ scopeId, message: { role: 'assistant', content: '触发' } });

    let current = true;
    const running = requestService.proactiveEntries[0].execute({
        scopeId,
        signal: new AbortController().signal,
        isCurrent: () => current,
    });
    await waitUntil(() => generated, 'the proactive backend request to start');
    current = false;
    response.resolve({ content: '<qq><none /></qq>' });
    assert.deepEqual(await running, { status: 'cancelled' });
    assert.equal(commits, 0);
}

async function testCapturedScopeSessionInvalidationPreventsLateCommit() {
    const { createQQV2ProactiveService } = await importModule('modules/qq-v2/proactive/service.js');
    const { repository, scopeId } = createProactiveRepositoryFixture();
    const requestService = createRequestServiceFixture();
    const response = deferred();
    let generated = false;
    let sessionCurrent = true;
    let sessionReady = true;
    let commits = 0;
    let projections = 0;
    const service = createQQV2ProactiveService({
        repository,
        requestService,
        captureScopeSession: () => ({
            isCurrent: () => sessionCurrent,
            isReady: () => sessionReady,
        }),
        apiPresetResolver: async () => ({ id: 'api-1' }),
        promptPresetResolver: async () => ({ blocks: [] }),
        backend: {
            async generate() {
                generated = true;
                return response.promise;
            },
        },
        async commitActions() {
            commits += 1;
            return { createdConversationIds: [] };
        },
        async syncWorldbook() {
            projections += 1;
        },
    });
    await service.configure({ scopeId, enabled: true, everyTurns: 1 });
    await service.recordSuccessfulStoryReply({ scopeId, message: { role: 'assistant', content: '触发' } });

    const running = requestService.proactiveEntries[0].execute({
        scopeId,
        signal: new AbortController().signal,
        isCurrent: () => true,
    });
    await waitUntil(() => generated, 'the proactive backend request to start before scope invalidation');
    sessionCurrent = false;
    sessionReady = false;
    response.resolve({ content: '<qq><none /></qq>' });

    assert.deepEqual(await running, { status: 'cancelled' });
    assert.equal(commits, 0);
    assert.equal(projections, 0);
}

async function testManualQueueBusySkipsTheCycleButStillRotates() {
    const { createQQV2ProactiveService } = await importModule('modules/qq-v2/proactive/service.js');
    const repository = await createRepository();
    const requestService = createRequestServiceFixture();
    const scopeId = 'st:character:alice:manual-busy';
    await repository.ensureScope(scopeId);
    const service = createQQV2ProactiveService({ repository, requestService });
    await service.configure({ scopeId, enabled: true, everyTurns: 1 });
    requestService.setEnqueueResult({ queued: false, skipped: 'manual-pending' });

    assert.deepEqual(await service.recordSuccessfulStoryReply({
        scopeId,
        message: { role: 'assistant', content: '先跳过私聊' },
    }), {
        counted: true,
        triggered: true,
        cycleKind: 'private',
        queued: false,
        skipped: 'manual-pending',
    });
    assert.deepEqual(await service.getState(scopeId), {
        enabled: true,
        everyTurns: 1,
        count: 0,
        nextKind: 'group',
    });
    requestService.setEnqueueResult({ queued: true });
    const next = await service.recordSuccessfulStoryReply({
        scopeId,
        message: { role: 'assistant', content: '下一周期仍正常执行群聊' },
    });
    assert.equal(next.cycleKind, 'group');
    assert.equal(next.queued, true);
    assert.equal(requestService.proactiveEntries.length, 2);
}

async function testGroupCycleExposesMemberAndFriendReferencesForNewGroups() {
    const { createQQV2ProactiveService } = await importModule('modules/qq-v2/proactive/service.js');
    const { repository, scopeId } = createProactiveRepositoryFixture({ includeBobPrivate: true });
    const requestService = createRequestServiceFixture();
    const generated = [];
    const committed = [];
    const service = createQQV2ProactiveService({
        repository,
        requestService,
        apiPresetResolver: async () => ({ id: 'api-1' }),
        promptPresetResolver: async () => ({ blocks: [{ role: 'system', content: '{{群聊成员}}\n{{群聊记录}}' }] }),
        backend: {
            async generate(input) {
                generated.push(input);
                return { content: '<qq><none /></qq>' };
            },
        },
        async commitActions(input) {
            committed.push(input);
            return { createdConversationIds: [] };
        },
    });
    await service.configure({ scopeId, enabled: true, everyTurns: 1 });
    await service.recordSuccessfulStoryReply({ scopeId, message: { role: 'assistant', content: '私聊周期' } });
    await service.recordSuccessfulStoryReply({ scopeId, message: { role: 'assistant', content: '群聊周期' } });

    const execution = await requestService.proactiveEntries[1].execute({
        scopeId,
        signal: new AbortController().signal,
        isCurrent: () => true,
    });
    assert.deepEqual(execution, { status: 'succeeded' });
    assert.match(generated[0].messages[0].content, /G1：夜谈群/);
    assert.match(generated[0].messages[0].content, /成员：N1：林知夏、N2：顾言/);
    assert.match(generated[0].messages[0].content, /可用于新建群聊的已有好友：N1：林知夏、N2：顾言/);
    assert.match(generated[0].messages[0].content, /<group id="G1" name="夜谈群" members="N1：林知夏、N2：顾言">/);
    assert.deepEqual(committed[0].references, { G1: 'group-1' });
    assert.deepEqual(committed[0].personReferences, { N1: 'person-alice', N2: 'person-bob' });
}

async function testExitedGroupIsOnlyAReinviteCandidateAndDissolvedGroupsAreExcluded() {
    const { createQQV2ProactiveService } = await importModule('modules/qq-v2/proactive/service.js');
    const { repository, scopeId, conversations, groups } = createProactiveRepositoryFixture();
    const requestService = createRequestServiceFixture();
    const generated = [];
    const service = createQQV2ProactiveService({
        repository,
        requestService,
        apiPresetResolver: async () => ({ id: 'api-1' }),
        promptPresetResolver: async () => ({ blocks: [{ role: 'system', content: '{{群聊成员}}' }] }),
        backend: {
            async generate(input) {
                generated.push(input);
                return { content: '<qq><none /></qq>' };
            },
        },
        async commitActions() { return { createdConversationIds: [] }; },
    });
    conversations.find((item) => item.conversationId === 'group-1').status = 'exited';
    groups['group-1'].selfExited = true;
    await service.configure({ scopeId, enabled: true, everyTurns: 1 });
    await service.recordSuccessfulStoryReply({ scopeId, message: { role: 'assistant', content: '私聊周期' } });
    await service.recordSuccessfulStoryReply({ scopeId, message: { role: 'assistant', content: '群聊周期' } });
    await requestService.proactiveEntries[1].execute({
        scopeId,
        signal: new AbortController().signal,
        isCurrent: () => true,
    });
    assert.match(generated[0].messages[0].content, /当前用户已退出；只能先重新邀请用户，再发送后续消息。/);

    groups['group-1'].status = 'dissolved';
    await service.recordSuccessfulStoryReply({ scopeId, message: { role: 'assistant', content: '再一次私聊周期' } });
    await service.recordSuccessfulStoryReply({ scopeId, message: { role: 'assistant', content: '没有正常群仍要调用' } });
    await requestService.proactiveEntries[3].execute({
        scopeId,
        signal: new AbortController().signal,
        isCurrent: () => true,
    });
    assert.match(generated[1].messages[0].content, /无/);
    assert.doesNotMatch(generated[1].messages[0].content, /夜谈群/);
}

async function main() {
    await testConfigurationDefaultsAndResets();
    await testConfigurationCreatesAnEmptyCurrentScopeOnDemand();
    await testStateAndConfigurationReuseTheProvidedScopeSession();
    await testExplicitInactiveConfigurationSessionIsNotRecaptured();
    await testReconfigurationDuringCountCannotQueueAStaleCycle();
    await testInactiveScopeSessionCannotCountOrQueueAProactiveCycle();
    await testScopeSessionInvalidatedDuringCountCannotQueueAProactiveCycle();
    await testOnlySuccessfulStoryRepliesCountAndKindsAlternate();
    await testPrivateOnlyModeNeverEnqueuesGroupCycles();
    await testPrivateCycleBuildsOnePromptAndCommitsCurrentBatch();
    await testGlobalRuntimeSettingsDriveProactiveExecution();
    await testPrivateCycleLimitsEachConversationHistoryIndependently();
    await testProjectionFailureDoesNotRollBackCommittedActions();
    await testCancelledLateResponseNeverCommitsActions();
    await testCapturedScopeSessionInvalidationPreventsLateCommit();
    await testManualQueueBusySkipsTheCycleButStillRotates();
    await testGroupCycleExposesMemberAndFriendReferencesForNewGroups();
    await testExitedGroupIsOnlyAReinviteCandidateAndDissolvedGroupsAreExcluded();
    console.log('[qq-v2-proactive-contract] passed');
}

main().catch((error) => {
    console.error('[qq-v2-proactive-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
