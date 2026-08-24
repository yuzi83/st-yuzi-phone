const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { webcrypto } = require('node:crypto');

const ROOT = process.cwd();

function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    return import(`${href}?contract=${Date.now()}-${Math.random()}`);
}

async function waitUntil(predicate, description, timeoutMs = 1600) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    throw new Error(`Timed out waiting for ${description}`);
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

async function testProductionRuntimeOwnsTheCurrentScopeAndFacade() {
    const {
        createMemoryQQV2StateStore,
    } = await importModule('modules/qq-v2/storage/state-store.js');
    const {
        createQQV2Repository,
    } = await importModule('modules/qq-v2/domain/repository.js');
    const {
        createQQV2ProductionRuntime,
    } = await importModule('modules/qq-v2/application/production-runtime.js');

    let currentScopeId = 'st:character:alice:chat-a';
    const scopeA = currentScopeId;
    const scopeB = 'st:character:bea:chat-b';
    const stateStore = createMemoryQQV2StateStore();
    const repository = createQQV2Repository({ stateStore });
    const host = {
        readScope() {
            return {
                scopeId: currentScopeId,
                chatId: currentScopeId.endsWith('chat-a') ? 'chat-a' : 'chat-b',
                chatFile: currentScopeId.endsWith('chat-a') ? 'chat-a' : 'chat-b',
                hostType: 'character',
                hostId: currentScopeId.endsWith('chat-a') ? 'alice' : 'bea',
            };
        },
        readUserIdentity() {
            return { name: '旅行者', avatar: 'user.webp' };
        },
        readStoryTime() {
            return '2042-05-20 09:30';
        },
        readStoryMessages() {
            return [];
        },
        readRawContext() {
            return { getRequestHeaders: async () => ({ 'X-CSRF-Token': 'token' }) };
        },
    };

    const runtime = createQQV2ProductionRuntime({
        host,
        stateStore,
        repository,
        cryptoApi: webcrypto,
        backend: {
            async generate() {
                throw new Error('this smoke test never generates');
            },
            async loadModels() {
                return [];
            },
        },
        worldbookGateway: {
            async getCurrentCharacterBookNames(scopeId) {
                return scopeId === scopeB
                    ? { primary: 'Bea-default-book', additional: [] }
                    : { primary: '', additional: [] };
            },
            async loadBook() {
                return { entries: {} };
            },
            async saveBook() {},
        },
    });

    assert.deepEqual(await runtime.initialize(), host.readScope());
    assert.deepEqual(await runtime.getSnapshot(), {
        phase: 'ready',
        context: {
            scopeId: 'st:character:alice:chat-a',
            user: { name: '旅行者', avatar: 'user.webp' },
            storyTime: '2042-05-20 09:30',
        },
        globalSettings: {
            activeApiPresetId: '',
            privateReplyPresetId: 'builtin-private-reply',
            privateProactivePresetId: 'builtin-private-proactive',
            groupReplyPresetId: 'builtin-group-reply',
            groupProactivePresetId: 'builtin-group-proactive',
            hostContextTurns: 3,
            conversationHistoryLimit: 100,
            worldbook: {
                enabled: false,
                bookName: '',
                timeWindow: { mode: 'relative', value: 1, unit: 'month' },
                light: 'blue',
                depth: 999,
                keywords: [],
            },
            proactive: { enabled: false, everyTurns: 5 },
        },
    });

    const facade = runtime.getFacade();
    assert.equal(typeof facade?.query?.bootstrap, 'function');
    const facadeBootstrap = await facade.query.bootstrap();
    assert.deepEqual(facadeBootstrap, {
        ok: true,
        status: 'ready',
        context: {
            scopeId: 'st:character:alice:chat-a',
            user: { name: '旅行者', avatar: 'user.webp' },
            storyTime: '2042-05-20 09:30',
        },
        globalSettings: {
            activeApiPresetId: '',
            privateReplyPresetId: 'builtin-private-reply',
            privateProactivePresetId: 'builtin-private-proactive',
            hostContextTurns: 3,
            conversationHistoryLimit: 100,
            worldbook: {
                enabled: false,
                bookName: '',
                timeWindow: { mode: 'relative', value: 1, unit: 'month' },
                light: 'blue',
                depth: 999,
                keywords: [],
            },
            proactive: { enabled: false, everyTurns: 5 },
        },
    });
    assert.equal(Object.hasOwn(facadeBootstrap.globalSettings, 'groupReplyPresetId'), false);
    assert.equal(Object.hasOwn(facadeBootstrap.globalSettings, 'groupProactivePresetId'), false);

    assert.equal((await facade.intent.updateGlobalSettings({
        settings: {
            activeApiPresetId: 'api-global',
            privateReplyPresetId: 'reply-global',
            privateProactivePresetId: 'proactive-global',
            hostContextTurns: 7,
            conversationHistoryLimit: 42,
            worldbook: {
                enabled: true,
                bookName: 'Alice-manual-book',
                timeWindow: { mode: 'relative', value: 6, unit: 'day' },
                light: 'green',
                depth: 8,
                keywords: ['主线', '秘密'],
            },
            proactive: { enabled: true, everyTurns: 3 },
        },
    })).ok, true);

    const scopeASnapshot = await runtime.getSnapshot();
    assert.equal(scopeASnapshot.globalSettings.hostContextTurns, 7);
    assert.equal(scopeASnapshot.globalSettings.conversationHistoryLimit, 42);
    assert.deepEqual(scopeASnapshot.globalSettings.worldbook, {
        enabled: true,
        bookName: 'Alice-manual-book',
        timeWindow: { mode: 'relative', value: 6, unit: 'day' },
        light: 'green',
        depth: 8,
        keywords: ['主线', '秘密'],
    });
    assert.deepEqual(scopeASnapshot.globalSettings.proactive, {
        enabled: true,
        everyTurns: 3,
    });

    currentScopeId = scopeB;
    assert.deepEqual(await runtime.handleChatChanged(), host.readScope());
    const scopeBDefaultSnapshot = await runtime.getSnapshot();
    assert.equal(scopeBDefaultSnapshot.context.scopeId, currentScopeId);
    assert.equal(scopeBDefaultSnapshot.globalSettings.activeApiPresetId, 'api-global');
    assert.equal(scopeBDefaultSnapshot.globalSettings.privateReplyPresetId, 'reply-global');
    assert.equal(scopeBDefaultSnapshot.globalSettings.privateProactivePresetId, 'proactive-global');
    assert.equal(scopeBDefaultSnapshot.globalSettings.hostContextTurns, 7);
    assert.equal(scopeBDefaultSnapshot.globalSettings.conversationHistoryLimit, 42);
    assert.deepEqual(scopeBDefaultSnapshot.globalSettings.worldbook, {
        enabled: true,
        bookName: 'Bea-default-book',
        timeWindow: { mode: 'relative', value: 6, unit: 'day' },
        light: 'green',
        depth: 8,
        keywords: ['主线', '秘密'],
    });
    assert.deepEqual(scopeBDefaultSnapshot.globalSettings.proactive, {
        enabled: true,
        everyTurns: 3,
    });
    assert.equal((await runtime.listConversations({ scopeId: currentScopeId })).length, 0);

    assert.equal((await facade.intent.updateGlobalSettings({
        settings: { worldbook: { bookName: 'Bea-manual-book' } },
    })).ok, true);
    const scopeBManualSnapshot = await runtime.getSnapshot();
    assert.equal(scopeBManualSnapshot.globalSettings.worldbook.bookName, 'Bea-manual-book');
    assert.deepEqual(scopeBManualSnapshot.globalSettings.proactive, {
        enabled: true,
        everyTurns: 3,
    });

    currentScopeId = scopeA;
    assert.deepEqual(await runtime.handleChatChanged(), host.readScope());
    const returnedScopeASnapshot = await runtime.getSnapshot();
    assert.equal(returnedScopeASnapshot.globalSettings.hostContextTurns, 7);
    assert.equal(returnedScopeASnapshot.globalSettings.conversationHistoryLimit, 42);
    assert.deepEqual(returnedScopeASnapshot.globalSettings.worldbook, {
        enabled: true,
        bookName: 'Alice-manual-book',
        timeWindow: { mode: 'relative', value: 6, unit: 'day' },
        light: 'green',
        depth: 8,
        keywords: ['主线', '秘密'],
    });
    assert.deepEqual(returnedScopeASnapshot.globalSettings.proactive, {
        enabled: true,
        everyTurns: 3,
    });

    runtime.destroy();
    assert.equal((await runtime.getSnapshot()).phase, 'destroyed');
}

async function testProductionRuntimeCountsNewStoryRepliesPersistently() {
    const {
        createMemoryQQV2StateStore,
    } = await importModule('modules/qq-v2/storage/state-store.js');
    const {
        createQQV2ProductionRuntime,
    } = await importModule('modules/qq-v2/application/production-runtime.js');

    let storyMessages = Array.from({ length: 9 }, (_, index) => ({
        messageId: index,
        role: 'assistant',
        content: `已有正文回复 ${index + 1}`,
        isHidden: false,
        isSystem: false,
    }));
    const scheduled = [];
    const host = {
        readScope() {
            return {
                scopeId: 'st:character:alice:chat-events',
                chatId: 'chat-events',
                chatFile: 'chat-events',
                hostType: 'character',
                hostId: 'alice',
            };
        },
        readUserIdentity() {
            return { name: '旅行者', avatar: 'user.webp' };
        },
        readStoryTime() {
            return '2042-05-20 09:30';
        },
        readStoryMessages() {
            return storyMessages;
        },
        readRawContext() {
            return { getRequestHeaders: async () => ({}) };
        },
    };
    const stateStore = createMemoryQQV2StateStore();
    const createRuntime = () => createQQV2ProductionRuntime({
        host,
        stateStore,
        requestService: {
            handleScopeChanged() {},
            getConversationState() { return {}; },
            cancelConversation() {},
        },
        projectionService: {
            async retryPending() {},
            async syncConversation() {},
        },
        proactiveService: {
            cancelScope() {},
            async getState() {
                return { enabled: true, everyTurns: 2 };
            },
            async enqueueProactiveCycle(input) {
                scheduled.push(input);
                return { triggered: true, queued: true };
            },
        },
        proactiveStorySettleDelayMs: 0,
    });

    let runtime = createRuntime();
    await runtime.initialize();
    storyMessages = [...storyMessages, {
        messageId: 9,
        role: 'assistant',
        content: '第十条正文回复',
        isHidden: false,
        isSystem: false,
    }];
    await runtime.handleMessageReceived(9, 'normal');
    await runtime.handleMessageReceived(9, 'normal');

    assert.equal(scheduled.length, 0, '第一次新正文回复只应把持久计数从 0 推进到 1，重复事件不得重复计数');
    runtime.destroy();

    runtime = createRuntime();
    await runtime.initialize();
    storyMessages = [...storyMessages, {
        messageId: 10,
        role: 'assistant',
        content: '第十一条正文回复',
        isHidden: false,
        isSystem: false,
    }];
    await runtime.handleMessageReceived(10, 'normal');

    assert.equal(scheduled.length, 1, '运行时重建后第二次新正文回复必须沿用持久计数并触发');
    assert.deepEqual({
        scopeId: scheduled[0].scopeId,
    }, {
        scopeId: 'st:character:alice:chat-events',
    });
    assert.equal(scheduled[0].scopeSession.scopeId, 'st:character:alice:chat-events');
    assert.equal(scheduled[0].scopeSession.isReady(), true);
    runtime.destroy();
}

async function testProductionRuntimeUsesReceivedTurnInsteadOfAbsoluteStoryFloor() {
    const {
        createMemoryQQV2StateStore,
    } = await importModule('modules/qq-v2/storage/state-store.js');
    const {
        createQQV2ProductionRuntime,
    } = await importModule('modules/qq-v2/application/production-runtime.js');

    const scopeId = 'st:character:alice:chat-floor-18';
    let storyMessages = Array.from({ length: 17 }, (_, index) => ({
        messageId: index,
        role: index % 2 === 0 ? 'user' : 'assistant',
        content: `已有正文楼层 ${index + 1}`,
        isHidden: false,
        isSystem: false,
    }));
    const scheduled = [];
    const runtime = createQQV2ProductionRuntime({
        host: {
            readScope() {
                return {
                    scopeId,
                    chatId: 'chat-floor-18',
                    chatFile: 'chat-floor-18',
                    hostType: 'character',
                    hostId: 'alice',
                };
            },
            readUserIdentity() { return { name: '旅行者', avatar: '' }; },
            readStoryTime() { return '2042-05-20 09:30'; },
            readStoryMessages() { return storyMessages; },
            readRawContext() { return {}; },
        },
        stateStore: createMemoryQQV2StateStore(),
        requestService: {
            cancelScope() {},
            getConversationState() { return {}; },
            cancelConversation() {},
        },
        proactiveService: {
            cancelScope() {},
            async getState() { return { enabled: true, everyTurns: 1 }; },
            async enqueueProactiveCycle(input) {
                scheduled.push(input);
                return { triggered: true, queued: true };
            },
        },
        projectionService: { async retryPending() {}, async syncConversation() {} },
    });

    await runtime.initialize();
    storyMessages = [...storyMessages, {
        messageId: 17,
        role: 'assistant',
        content: '第 18 楼正文 AI 回复',
        isHidden: false,
        isSystem: false,
    }];
    await runtime.handleCharacterMessageRendered(17, 'normal');
    assert.equal(scheduled.length, 0, '仅完成渲染不得推进 QQ 主动回复轮次');
    await runtime.handleMessageReceived(17, 'normal');

    assert.equal(scheduled.length, 1, '设置 1 轮时，第 18 楼的新正文 AI 回复必须触发一次，且不受绝对楼层影响');
    assert.equal(scheduled[0].scopeId, scopeId);
    runtime.destroy();
}

async function testProductionRuntimeIgnoresIneligibleAndDuplicateReceivedMessages() {
    const {
        createMemoryQQV2StateStore,
    } = await importModule('modules/qq-v2/storage/state-store.js');
    const {
        createQQV2ProductionRuntime,
    } = await importModule('modules/qq-v2/application/production-runtime.js');

    const scopeId = 'st:character:alice:chat-message-filter';
    let storyMessages = [];
    const scheduled = [];
    const runtime = createQQV2ProductionRuntime({
        host: {
            readScope() {
                return {
                    scopeId,
                    chatId: 'chat-message-filter',
                    chatFile: 'chat-message-filter',
                    hostType: 'character',
                    hostId: 'alice',
                };
            },
            readUserIdentity() { return { name: '旅行者', avatar: '' }; },
            readStoryTime() { return ''; },
            readStoryMessages() { return storyMessages; },
            readRawContext() { return {}; },
        },
        stateStore: createMemoryQQV2StateStore(),
        requestService: {
            cancelScope() {},
            getConversationState() { return {}; },
            cancelConversation() {},
        },
        proactiveService: {
            cancelScope() {},
            async getState() { return { enabled: true, everyTurns: 2 }; },
            async enqueueProactiveCycle(input) {
                scheduled.push(input);
                return { triggered: true, queued: true };
            },
        },
        projectionService: { async retryPending() {}, async syncConversation() {} },
    });

    await runtime.initialize();
    const appendAndReceive = async (message) => {
        storyMessages = [...storyMessages, message];
        await runtime.handleMessageReceived(message.messageId, 'normal');
    };
    await appendAndReceive({ messageId: 0, role: 'user', content: '用户消息' });
    await appendAndReceive({ messageId: 1, role: 'assistant', content: '系统消息', isSystem: true });
    await appendAndReceive({ messageId: 2, role: 'assistant', content: '隐藏消息', isHidden: true });
    await appendAndReceive({ messageId: 3, role: 'assistant', content: '失败消息', isSuccessful: false });
    await runtime.handleMessageReceived(404, 'normal');
    await appendAndReceive({ messageId: 4, role: 'assistant', content: '第一条有效消息' });
    await runtime.handleMessageReceived(4, 'normal');

    assert.equal(scheduled.length, 0, '无效消息、找不到的消息和重复事件都不得推进主动轮次');

    await appendAndReceive({ messageId: 5, role: 'assistant', content: '第二条有效消息' });
    assert.equal(scheduled.length, 1, '只有第二条有效正文 AI 消息才应达到 2 轮并触发');
    runtime.destroy();
}

async function testProductionRuntimeRetriesDueTurnAfterRequestQueueBecomesIdle() {
    const {
        createMemoryQQV2StateStore,
    } = await importModule('modules/qq-v2/storage/state-store.js');
    const {
        createQQV2Repository,
    } = await importModule('modules/qq-v2/domain/repository.js');
    const {
        createQQV2ProductionRuntime,
    } = await importModule('modules/qq-v2/application/production-runtime.js');

    const scopeId = 'st:character:alice:chat-proactive-retry';
    const queueBecameIdle = deferred();
    let storyMessages = [];
    let enqueueAttempts = 0;
    const stateStore = createMemoryQQV2StateStore();
    const repository = createQQV2Repository({ stateStore });
    const runtime = createQQV2ProductionRuntime({
        host: {
            readScope() {
                return {
                    scopeId,
                    chatId: 'chat-proactive-retry',
                    chatFile: 'chat-proactive-retry',
                    hostType: 'character',
                    hostId: 'alice',
                };
            },
            readUserIdentity() { return { name: '旅行者', avatar: '' }; },
            readStoryTime() { return ''; },
            readStoryMessages() { return storyMessages; },
            readRawContext() { return {}; },
        },
        stateStore,
        repository,
        requestService: {
            cancelScope() {},
            getConversationState() { return {}; },
            cancelConversation() {},
            async waitForIdle() {
                await queueBecameIdle.promise;
            },
        },
        proactiveService: {
            cancelScope() {},
            async getState() { return { enabled: true, everyTurns: 1 }; },
            async enqueueProactiveCycle() {
                enqueueAttempts += 1;
                return enqueueAttempts === 1
                    ? { triggered: true, queued: false, skipped: 'proactive-pending' }
                    : { triggered: true, queued: true };
            },
        },
        projectionService: { async retryPending() {}, async syncConversation() {} },
    });

    await runtime.initialize();
    storyMessages = [{
        messageId: 0,
        role: 'assistant',
        content: '达到主动回复轮次，但请求队列暂时繁忙',
        isHidden: false,
        isSystem: false,
    }];
    await runtime.handleMessageReceived(0, 'normal');

    assert.equal(enqueueAttempts, 1);
    assert.equal((await repository.getProactiveProgress(scopeId)).counter, 1, '未真正入队时不得消费主动轮次');

    queueBecameIdle.resolve();
    await waitUntil(() => enqueueAttempts === 2, 'the due proactive turn to retry after the request queue becomes idle');
    await waitUntil(
        async () => (await repository.getProactiveProgress(scopeId)).counter === 0,
        'the persisted proactive turn to be consumed only after retry is queued',
    );

    assert.equal(enqueueAttempts, 2, '队列空闲后应自动补跑一次，不需要新的正文消息');
    runtime.destroy();
}

async function testScopeTransitionCancelsPreviousScopeBeforeSlowInitialization() {
    const { createMemoryQQV2StateStore } = await importModule('modules/qq-v2/storage/state-store.js');
    const { createQQV2Repository } = await importModule('modules/qq-v2/domain/repository.js');
    const { createQQV2ProductionRuntime } = await importModule('modules/qq-v2/application/production-runtime.js');
    const scopeA = 'st:character:alice:chat-cancel-a';
    const scopeB = 'st:character:alice:chat-cancel-b';
    let currentScopeId = scopeA;
    const stateStore = createMemoryQQV2StateStore();
    const repository = createQQV2Repository({ stateStore });
    const scopeBWorldbookLookupStarted = deferred();
    const releaseScopeBWorldbookLookup = deferred();
    const requestCancellations = [];
    const proactiveCancellations = [];
    const runtime = createQQV2ProductionRuntime({
        host: {
            readScope() {
                return { scopeId: currentScopeId, chatId: currentScopeId, chatFile: currentScopeId, hostType: 'character', hostId: 'alice' };
            },
            readUserIdentity() { return { name: 'Traveler', avatar: '' }; },
            readStoryTime() { return ''; },
            readStoryMessages() { return []; },
            readRawContext() { return {}; },
        },
        stateStore,
        repository,
        requestService: {
            cancelScope(input) { requestCancellations.push(input); },
            getConversationState() { return {}; },
            cancelConversation() {},
        },
        proactiveService: {
            cancelScope(input) { proactiveCancellations.push(input); },
            async getState() { return { enabled: false, everyTurns: 5 }; },
            async enqueueProactiveCycle() {},
        },
        projectionService: { async retryPending() {}, async syncConversation() {} },
        worldbookGateway: {
            async getCurrentCharacterBookNames(scopeId) {
                if (scopeId === scopeB) {
                    scopeBWorldbookLookupStarted.resolve();
                    await releaseScopeBWorldbookLookup.promise;
                }
                return { primary: '', additional: [] };
            },
        },
    });
    await runtime.initialize();

    currentScopeId = scopeB;
    const transition = runtime.handleChatChanged();
    await scopeBWorldbookLookupStarted.promise;
    assert.deepEqual(requestCancellations, [{ scopeId: scopeA, reason: 'scope-changed' }]);
    assert.deepEqual(proactiveCancellations, [{ scopeId: scopeA }]);
    releaseScopeBWorldbookLookup.resolve();
    await transition;
    runtime.destroy();
}

async function testAbaStaleStorySessionCannotScheduleAsReenteredScope() {
    const { createMemoryQQV2StateStore } = await importModule('modules/qq-v2/storage/state-store.js');
    const { createQQV2ProductionRuntime } = await importModule('modules/qq-v2/application/production-runtime.js');
    const scopeA = 'st:character:alice:chat-story-a';
    const scopeB = 'st:character:alice:chat-story-b';
    let currentScopeId = scopeA;
    let storyMessages = [];
    const staleRequestStarted = deferred();
    const releaseStaleRequest = deferred();
    const received = [];
    const queued = [];
    const runtime = createQQV2ProductionRuntime({
        host: {
            readScope() { return { scopeId: currentScopeId, chatId: currentScopeId, chatFile: currentScopeId, hostType: 'character', hostId: 'alice' }; },
            readUserIdentity() { return { name: 'Traveler', avatar: '' }; },
            readStoryTime() { return ''; },
            readStoryMessages() { return storyMessages; },
            readRawContext() { return {}; },
        },
        stateStore: createMemoryQQV2StateStore(),
        requestService: { cancelScope() {}, getConversationState() { return {}; }, cancelConversation() {} },
        proactiveService: {
            cancelScope() {},
            async getState() { return { enabled: true, everyTurns: 1 }; },
            async enqueueProactiveCycle(input) {
                received.push(input);
                if (received.length === 1) {
                    staleRequestStarted.resolve();
                    await releaseStaleRequest.promise;
                }
                const isReady = input.scopeSession.isReady();
                if (isReady) queued.push(input);
                return { triggered: true, queued: isReady };
            },
        },
        proactiveStorySettleDelayMs: 0,
        projectionService: { async retryPending() {}, async syncConversation() {} },
    });
    await runtime.initialize();
    storyMessages = [{ messageId: 0, role: 'assistant', content: 'reply', isHidden: false, isSystem: false }];

    const staleEvent = runtime.handleMessageReceived(0, 'regenerate');
    await staleRequestStarted.promise;
    const staleSession = received[0].scopeSession;

    currentScopeId = scopeB;
    await runtime.handleChatChanged();
    currentScopeId = scopeA;
    await runtime.handleChatChanged();

    releaseStaleRequest.resolve();
    await staleEvent;
    assert.equal(queued.length, 1, '重新进入作用域后允许新 session 恢复已持久化的到期轮次');
    assert.notEqual(queued[0].scopeSession, staleSession);
    assert.equal(queued[0].scopeSession.isReady(), true);
    assert.equal(staleSession.scopeId, scopeA);
    assert.equal(staleSession.isCurrent(), false);
    assert.equal(staleSession.isReady(), false);

    storyMessages = [...storyMessages, {
        messageId: 1,
        role: 'assistant',
        content: 'reply after reentry',
        isHidden: false,
        isSystem: false,
    }];
    await runtime.handleMessageReceived(1, 'regenerate');
    assert.equal(received.length, 3);
    assert.equal(queued.length, 2);
    assert.strictEqual(queued[0], received[1]);
    assert.equal(received[1].scopeId, scopeA);
    assert.equal(received[1].scopeSession.scopeId, scopeA);
    assert.equal(received[1].scopeSession.isReady(), true);
    assert.notEqual(received[1].scopeSession.generation, staleSession.generation);
    runtime.destroy();
}
async function testProductionRuntimeKeepsWorldbookProjectionBeforeConversationDeletion() {
    const {
        createMemoryQQV2StateStore,
    } = await importModule('modules/qq-v2/storage/state-store.js');
    const {
        createQQV2ProductionRuntime,
    } = await importModule('modules/qq-v2/application/production-runtime.js');

    const books = new Map([
        ['QQ-old', { entries: {} }],
        ['QQ-new', { entries: {} }],
    ]);
    let rejectRemoval = false;
    const host = {
        readScope() {
            return {
                scopeId: 'st:character:alice:chat-worldbook',
                chatId: 'chat-worldbook',
                chatFile: 'chat-worldbook',
                hostType: 'character',
                hostId: 'alice',
            };
        },
        readUserIdentity() {
            return { name: 'Traveler', avatar: 'user.webp' };
        },
        readStoryTime() {
            return '2042-05-20 09:30';
        },
        readStoryMessages() {
            return [];
        },
        readRawContext() {
            return { getRequestHeaders: () => ({}) };
        },
    };
    const copy = (value) => JSON.parse(JSON.stringify(value));
    const runtime = createQQV2ProductionRuntime({
        host,
        stateStore: createMemoryQQV2StateStore(),
        cryptoApi: webcrypto,
        backend: {
            async generate() {
                throw new Error('request should be cancelled before this test generates');
            },
            async loadModels() {
                return [];
            },
        },
        worldbookGateway: {
            async loadBook(name) {
                return copy(books.get(name));
            },
            async saveBook(name, book) {
                if (rejectRemoval && Object.keys(book.entries || {}).length === 0) {
                    throw new Error('worldbook is temporarily unavailable');
                }
                books.set(name, copy(book));
            },
        },
    });

    await runtime.initialize();
    const { conversation } = await runtime.createPrivateConversation({
        scopeId: 'st:character:alice:chat-worldbook',
        name: 'Alice',
    });
    await runtime.updateGlobalSettings({
        scopeId: 'st:character:alice:chat-worldbook',
        settings: {
            hostContextTurns: 4,
            conversationHistoryLimit: 12,
            worldbook: {
                enabled: true,
                bookName: 'QQ-old',
                timeWindow: { mode: 'all' },
                light: 'blue',
                depth: 999,
                keywords: [],
            },
        },
        userName: 'Traveler',
        storyTime: '2042-05-20 09:30',
    });
    await runtime.setConversationInjection({
        scopeId: 'st:character:alice:chat-worldbook',
        conversationId: conversation.conversationId,
        injection: { enabled: true },
        userName: 'Traveler',
        storyTime: '2042-05-20 09:30',
    });
    await runtime.sendManual({
        scopeId: 'st:character:alice:chat-worldbook',
        conversationId: conversation.conversationId,
        message: { type: 'text', content: 'Hello from QQ' },
    });
    assert.equal(Object.keys(books.get('QQ-old').entries).length, 1);
    await runtime.updateGlobalSettings({
        scopeId: 'st:character:alice:chat-worldbook',
        settings: { worldbook: { bookName: 'QQ-new' } },
        userName: 'Traveler',
        storyTime: '2042-05-20 09:30',
    });
    assert.equal(Object.keys(books.get('QQ-old').entries).length, 0);
    assert.equal(Object.keys(books.get('QQ-new').entries).length, 1);

    rejectRemoval = true;
    assert.deepEqual(await runtime.deleteConversation({
        scopeId: 'st:character:alice:chat-worldbook',
        conversationId: conversation.conversationId,
        userName: 'Traveler',
        storyTime: '2042-05-20 09:30',
    }), {
        deleted: false,
        mode: 'worldbook-pending',
    });
    assert.notEqual(await runtime.getConversation({
        scopeId: 'st:character:alice:chat-worldbook',
        conversationId: conversation.conversationId,
    }), null);
    const pendingConversation = await runtime.getConversation({
        scopeId: 'st:character:alice:chat-worldbook',
        conversationId: conversation.conversationId,
    });
    assert.equal(pendingConversation.injection.enabled, true);
    assert.equal(pendingConversation.injection.projection.pending, true);
    assert.equal(Object.keys(books.get('QQ-old').entries).length, 0);
    assert.equal(Object.keys(books.get('QQ-new').entries).length, 1);

    rejectRemoval = false;
    assert.deepEqual(await runtime.deleteConversation({
        scopeId: 'st:character:alice:chat-worldbook',
        conversationId: conversation.conversationId,
        userName: 'Traveler',
        storyTime: '2042-05-20 09:30',
    }), {
        deleted: true,
        mode: 'private',
    });
    const retainedContactConversation = (await runtime.listConversations({ scopeId: 'st:character:alice:chat-worldbook' }))[0];
    assert.equal(retainedContactConversation.status, 'contact');
    assert.deepEqual(await runtime.listMessages({
        scopeId: 'st:character:alice:chat-worldbook',
        conversationId: conversation.conversationId,
    }), { items: [], hasMore: false, nextBeforeSequence: null });
    assert.equal(Object.keys(books.get('QQ-old').entries).length, 0);
    assert.equal(Object.keys(books.get('QQ-new').entries).length, 0);
    runtime.destroy();
}

async function testProductionRuntimeCancelsLateSaveAndCleansOldScopeThroughCurrentHostContext() {
    const {
        createMemoryQQV2StateStore,
    } = await importModule('modules/qq-v2/storage/state-store.js');
    const {
        createQQV2Repository,
    } = await importModule('modules/qq-v2/domain/repository.js');
    const {
        createQQV2ProductionRuntime,
    } = await importModule('modules/qq-v2/application/production-runtime.js');
    const scopeA = 'st:character:alice:chat-worldbook-a';
    const scopeB = 'st:character:bea:chat-worldbook-b';
    let currentScopeId = scopeA;
    const copy = (value) => JSON.parse(JSON.stringify(value));
    const books = new Map([['QQ', {
            entries: {
                701: {
                    uid: 701,
                    content: 'Scope B projection must stay untouched',
                    extensions: {
                        yuziPhoneQQV2: { version: 2, scopeId: scopeB, conversationId: 'scope-b-conversation' },
                    },
                },
            },
        }]]);
    let pauseNextScopeALoad = false;
    let signalScopeALoad;
    let releaseScopeALoad;
    const scopeALoadStarted = new Promise((resolve) => { signalScopeALoad = resolve; });
    const continueScopeALoad = new Promise((resolve) => { releaseScopeALoad = resolve; });
    const stateStore = createMemoryQQV2StateStore();
    const repository = createQQV2Repository({ stateStore });
    const runtime = createQQV2ProductionRuntime({
        host: {
            readScope() {
                return {
                    scopeId: currentScopeId,
                    chatId: currentScopeId === scopeA ? 'chat-worldbook-a' : 'chat-worldbook-b',
                    chatFile: currentScopeId === scopeA ? 'chat-worldbook-a' : 'chat-worldbook-b',
                    hostType: 'character',
                    hostId: currentScopeId === scopeA ? 'alice' : 'bea',
                };
            },
            readUserIdentity() { return { name: 'Traveler', avatar: '' }; },
            readStoryTime() { return '2042-05-20 09:30'; },
            readStoryMessages() { return []; },
            readRawContext() {
                const contextScopeId = currentScopeId;
                return {
                    getRequestHeaders: () => ({}),
                    async loadWorldInfo(name) {
                        if (contextScopeId === scopeA && pauseNextScopeALoad) {
                            pauseNextScopeALoad = false;
                            signalScopeALoad();
                            await continueScopeALoad;
                        }
                        return books.has(name) ? copy(books.get(name)) : null;
                    },
                    async saveWorldInfo(name, book) {
                        books.set(name, copy(book));
                    },
                };
            },
        },
        stateStore,
        repository,
        cryptoApi: webcrypto,
        backend: { async generate() {}, async loadModels() { return []; } },
    });

    await runtime.initialize();
    const { conversation, person } = await runtime.createPrivateConversation({ scopeId: scopeA, name: 'Alice' });
    const [, secondMessage] = await repository.appendMessages(scopeA, conversation.conversationId, [
        {
            senderId: '__self__',
            senderType: 'self',
            type: 'text',
            content: 'First scoped QQ message',
            storyTime: '2042-05-20 09:20',
        },
        {
            senderId: person.personId,
            senderType: 'person',
            type: 'text',
            content: 'Second scoped QQ message',
            storyTime: '2042-05-20 09:30',
        },
    ]);
    await runtime.updateGlobalSettings({
        scopeId: scopeA,
        settings: { worldbook: { enabled: true, bookName: 'QQ', timeWindow: { mode: 'all' } } },
        userName: 'Traveler',
        storyTime: '2042-05-20 09:30',
    });
    await runtime.setConversationInjection({
        scopeId: scopeA,
        conversationId: conversation.conversationId,
        injection: { enabled: true },
        userName: 'Traveler',
        storyTime: '2042-05-20 09:30',
    });
    const scopeBBeforeSwitch = copy(books.get('QQ').entries[701]);

    pauseNextScopeALoad = true;
    const syncing = runtime.setMessageSelectedForInjection({
        scopeId: scopeA,
        conversationId: conversation.conversationId,
        messageId: secondMessage.messageId,
        selected: true,
        userName: 'Traveler',
        storyTime: '2042-05-20 09:30',
    });
    await scopeALoadStarted;
    currentScopeId = scopeB;
    const switching = runtime.handleChatChanged();
    releaseScopeALoad();
    await assert.rejects(syncing, (error) => error?.code === 'scope_inactive');
    await switching;

    const finalEntries = Object.values(books.get('QQ').entries);
    assert.equal(finalEntries.filter((entry) => entry.extensions?.yuziPhoneQQV2?.scopeId === scopeA).length, 0);
    assert.deepEqual(books.get('QQ').entries[701], scopeBBeforeSwitch);
    const staleConversation = await runtime.getConversation({
        scopeId: scopeA,
        conversationId: conversation.conversationId,
    });
    assert.equal(staleConversation.injection.projection.bookName, '');
    assert.equal(staleConversation.injection.projection.entryUid, null);
    assert.equal(staleConversation.injection.projection.pending, false);
    runtime.destroy();
}

async function testDefaultRuntimeEntryExposesTheProductionFacade() {
    const {
        createMemoryQQV2StateStore,
    } = await importModule('modules/qq-v2/storage/state-store.js');
    const {
        createQQV2ProductionRuntime,
    } = await importModule('modules/qq-v2/application/production-runtime.js');
    const {
        createQQV2RuntimeEntry,
    } = await importModule('modules/qq-v2/runtime/default-runtime.js');
    const host = {
        readScope() {
            return {
                scopeId: 'st:character:alice:chat-entry',
                chatId: 'chat-entry',
                chatFile: 'chat-entry',
                hostType: 'character',
                hostId: 'alice',
            };
        },
        readUserIdentity() {
            return { name: 'Traveler', avatar: 'user.webp' };
        },
        readStoryTime() {
            return '2042-05-20 09:30';
        },
        readStoryMessages() {
            return [];
        },
        readRawContext() {
            return { getRequestHeaders: () => ({}) };
        },
    };
    const entry = createQQV2RuntimeEntry({
        createHostAdapter: () => host,
        createRuntime: ({ host: runtimeHost }) => createQQV2ProductionRuntime({
            host: runtimeHost,
            stateStore: createMemoryQQV2StateStore(),
            cryptoApi: webcrypto,
            backend: { async generate() {}, async loadModels() { return []; } },
            worldbookGateway: { async loadBook() { return { entries: {} }; }, async saveBook() {} },
        }),
    });

    await entry.initialize();
    assert.equal(typeof entry.getFacade()?.query?.bootstrap, 'function');
    assert.equal((await entry.getFacade().query.bootstrap()).context.scopeId, 'st:character:alice:chat-entry');
    entry.destroy();
}

async function testProductionFacadeOwnsApiPresetLifecycleAcrossScopes() {
    const {
        createMemoryQQV2StateStore,
    } = await importModule('modules/qq-v2/storage/state-store.js');
    const {
        createQQV2ProductionRuntime,
    } = await importModule('modules/qq-v2/application/production-runtime.js');
    let currentScopeId = 'st:character:alice:chat-api-a';
    const host = {
        readScope() {
            return {
                scopeId: currentScopeId,
                chatId: currentScopeId.endsWith('api-a') ? 'chat-api-a' : 'chat-api-b',
                chatFile: currentScopeId.endsWith('api-a') ? 'chat-api-a' : 'chat-api-b',
                hostType: 'character',
                hostId: 'alice',
            };
        },
        readUserIdentity() {
            return { name: 'Traveler', avatar: 'user.webp' };
        },
        readStoryTime() {
            return '2042-05-20 09:30';
        },
        readStoryMessages() {
            return [];
        },
        readRawContext() {
            return { getRequestHeaders: () => ({}) };
        },
    };
    const stateStore = createMemoryQQV2StateStore();
    const runtime = createQQV2ProductionRuntime({
        host,
        stateStore,
        cryptoApi: webcrypto,
        backend: {
            async generate() {},
            async loadModels() {
                return ['model-a', 'model-b'];
            },
        },
        worldbookGateway: { async loadBook() { return { entries: {} }; }, async saveBook() {} },
    });

    await runtime.initialize();
    const facade = runtime.getFacade();
    const saved = await facade.intent.saveApiPreset({
        preset: {
            name: 'QQ API',
            endpoint: 'https://api.example.test/v1',
            apiKey: 'secret-value',
            model: 'manual-model',
            temperature: 0.8,
            maxOutput: 2048,
        },
    });
    assert.equal(saved.ok, true);
    assert.equal(JSON.stringify(saved).includes('secret-value'), false);

    await facade.intent.updateGlobalSettings({
        settings: { activeApiPresetId: saved.apiPreset.presetId },
    });
    assert.deepEqual(await facade.intent.loadModels({ apiPresetId: saved.apiPreset.presetId }), {
        ok: true,
        status: 'accepted',
        modelState: {
            ok: true,
            apiPresetId: saved.apiPreset.presetId,
            models: ['model-a', 'model-b'],
            manualModel: 'manual-model',
            error: '',
        },
    });

    currentScopeId = 'st:character:alice:chat-api-b';
    await runtime.handleChatChanged();
    assert.equal((await facade.query.globalSettings()).settings.activeApiPresetId, saved.apiPreset.presetId,
        'switching scope does not require saving the global API selection again');

    assert.deepEqual(await facade.intent.deleteApiPreset({ apiPresetId: saved.apiPreset.presetId }), {
        ok: true,
        status: 'accepted',
        deleted: true,
    });
    assert.equal((await facade.query.globalSettings()).settings.activeApiPresetId, '');
    currentScopeId = 'st:character:alice:chat-api-a';
    await runtime.handleChatChanged();
    assert.equal((await facade.query.globalSettings()).settings.activeApiPresetId, '');
    assert.equal((await stateStore.read()).scopes[currentScopeId].settings.activeApiPresetId, '');
    assert.equal((await facade.query.sharedResources()).apiPresets.length, 0);
    runtime.destroy();
}

async function testProductionRuntimeWorksWithoutWebCryptoAndKeepsKeysOutOfExports() {
    const {
        createMemoryQQV2StateStore,
    } = await importModule('modules/qq-v2/storage/state-store.js');
    const {
        createQQV2ProductionRuntime,
    } = await importModule('modules/qq-v2/application/production-runtime.js');
    const scopeId = 'st:character:alice:chat-lan-http';
    const runtime = createQQV2ProductionRuntime({
        host: {
            readScope() {
                return {
                    scopeId,
                    chatId: 'chat-lan-http',
                    chatFile: 'chat-lan-http',
                    hostType: 'character',
                    hostId: 'alice',
                };
            },
            readUserIdentity() { return { name: 'Traveler', avatar: '' }; },
            readStoryTime() { return '2042-05-20 09:30'; },
            readStoryMessages() { return []; },
            readRawContext() { return { getRequestHeaders: () => ({}) }; },
        },
        stateStore: createMemoryQQV2StateStore(),
        cryptoApi: {},
        backend: { async generate() {}, async loadModels() { return []; } },
        worldbookGateway: { async loadBook() { return { entries: {} }; }, async saveBook() {} },
    });

    await runtime.initialize();
    const facade = runtime.getFacade();
    const saved = await facade.intent.saveApiPreset({
        preset: {
            name: 'LAN HTTP API',
            endpoint: 'https://api.example.test/v1',
            apiKey: 'lan-http-secret',
            model: 'manual-model',
        },
    });

    assert.equal(saved.ok, true);
    assert.equal(JSON.stringify(await facade.query.sharedResources()).includes('lan-http-secret'), false);
    assert.equal(JSON.stringify(await facade.query.imageLibraryPack()).includes('lan-http-secret'), false);
    assert.equal(JSON.stringify(await facade.intent.exportAllPromptPresets()).includes('lan-http-secret'), false);
    runtime.destroy();
}

async function testProductionFacadeListsOnlyExistingWorldbooks() {
    const {
        createMemoryQQV2StateStore,
    } = await importModule('modules/qq-v2/storage/state-store.js');
    const {
        createQQV2ProductionRuntime,
    } = await importModule('modules/qq-v2/application/production-runtime.js');
    const host = {
        readScope() {
            return {
                scopeId: 'st:character:alice:chat-books',
                chatId: 'chat-books',
                chatFile: 'chat-books',
                hostType: 'character',
                hostId: 'alice',
            };
        },
        readUserIdentity() {
            return { name: 'Traveler', avatar: 'user.webp' };
        },
        readStoryTime() {
            return '2042-05-20 09:30';
        },
        readStoryMessages() {
            return [];
        },
        readRawContext() { return { getRequestHeaders: () => ({}) }; },
    };
    const listedScopes = [];
    const runtime = createQQV2ProductionRuntime({
        host,
        stateStore: createMemoryQQV2StateStore(),
        cryptoApi: webcrypto,
        backend: { async generate() {}, async loadModels() { return []; } },
        worldbookGateway: {
            async listBookNames(scopeId) {
                listedScopes.push(scopeId);
                return ['Existing Book'];
            },
            async getCurrentCharacterBookNames() { return { primary: null, additional: [] }; },
            async loadBook() { return { entries: {} }; },
            async saveBook() {},
        },
    });

    await runtime.initialize();
    const facade = runtime.getFacade();
    await facade.intent.updateGlobalSettings({
        settings: { worldbook: { enabled: false, bookName: 'Removed Book' } },
    });
    assert.deepEqual(await facade.query.worldbooks(), {
        ok: true,
        status: 'ready',
        worldbooks: [{ bookName: 'Existing Book', entryCount: 0 }],
    });
    assert.deepEqual(listedScopes, ['st:character:alice:chat-books']);
    runtime.destroy();
}

async function testProductionRuntimeInitializesDefaultWorldbookOncePerScope() {
    const {
        createMemoryQQV2StateStore,
    } = await importModule('modules/qq-v2/storage/state-store.js');
    const {
        createQQV2Repository,
    } = await importModule('modules/qq-v2/domain/repository.js');
    const {
        createQQV2ProductionRuntime,
    } = await importModule('modules/qq-v2/application/production-runtime.js');
    let currentScopeId = 'scope-primary';
    let retryAttempts = 0;
    const bindingCalls = [];
    const stateStore = createMemoryQQV2StateStore();
    const repository = createQQV2Repository({ stateStore });
    await repository.ensureScope('scope-existing');
    await stateStore.transact((state) => {
        state.scopes['scope-existing'].settings.worldbook.bookName = 'Existing Choice';
        delete state.scopes['scope-existing'].worldbookDefaultResolved;
    });
    const runtime = createQQV2ProductionRuntime({
        host: {
            readScope() {
                return {
                    scopeId: currentScopeId,
                    chatId: currentScopeId,
                    chatFile: currentScopeId,
                    hostType: currentScopeId === 'scope-group' ? 'group' : 'character',
                    hostId: 'alice',
                };
            },
            readUserIdentity() { return { name: 'Traveler', avatar: '' }; },
            readStoryTime() { return ''; },
            readStoryMessages() { return []; },
            readRawContext() { return { getRequestHeaders: () => ({}) }; },
        },
        stateStore,
        cryptoApi: webcrypto,
        backend: { async generate() {}, async loadModels() { return []; } },
        worldbookGateway: {
            async listBookNames() { return []; },
            async getCurrentCharacterBookNames(scopeId) {
                bindingCalls.push(scopeId);
                if (scopeId === 'scope-primary') return { primary: 'Primary Book', additional: ['Additional Book'] };
                if (scopeId === 'scope-fallback') return { primary: null, additional: ['First Additional', 'Second Additional'] };
                if (scopeId === 'scope-retry') {
                    retryAttempts += 1;
                    if (retryAttempts === 1) throw new Error('temporary gateway failure');
                    return { primary: 'Retry Book', additional: [] };
                }
                return { primary: null, additional: [] };
            },
            async loadBook() { return { entries: {} }; },
            async saveBook() {},
        },
    });

    await runtime.initialize();
    let scope = await repository.getScope('scope-primary');
    assert.equal(scope.settings.worldbook.bookName, 'Primary Book');
    assert.equal(scope.settings.worldbook.enabled, false);
    assert.equal(scope.worldbookDefaultResolved, true);

    currentScopeId = 'scope-fallback';
    await runtime.handleChatChanged();
    scope = await repository.getScope('scope-fallback');
    assert.equal(scope.settings.worldbook.bookName, 'First Additional');
    assert.equal(scope.settings.worldbook.enabled, false);

    currentScopeId = 'scope-group';
    await runtime.handleChatChanged();
    scope = await repository.getScope('scope-group');
    assert.equal(scope.settings.worldbook.bookName, '');
    assert.equal(scope.worldbookDefaultResolved, true);
    assert.equal(bindingCalls.includes('scope-group'), false);

    currentScopeId = 'scope-existing';
    await runtime.handleChatChanged();
    scope = await repository.getScope('scope-existing');
    assert.equal(scope.settings.worldbook.bookName, 'Existing Choice');
    assert.equal(scope.worldbookDefaultResolved, true);
    assert.equal(bindingCalls.includes('scope-existing'), false);

    await repository.updateWorldbookSettings('scope-primary', { bookName: '' });
    currentScopeId = 'scope-primary';
    await runtime.handleChatChanged();
    scope = await repository.getScope('scope-primary');
    assert.equal(scope.settings.worldbook.bookName, '');
    assert.equal(bindingCalls.filter((scopeId) => scopeId === 'scope-primary').length, 1);

    currentScopeId = 'scope-retry';
    await runtime.handleChatChanged();
    scope = await repository.getScope('scope-retry');
    assert.equal(scope.worldbookDefaultResolved, false);
    assert.equal(scope.settings.worldbook.bookName, '');
    currentScopeId = 'scope-fallback';
    await runtime.handleChatChanged();
    currentScopeId = 'scope-retry';
    await runtime.handleChatChanged();
    scope = await repository.getScope('scope-retry');
    assert.equal(scope.settings.worldbook.bookName, 'Retry Book');
    assert.equal(scope.settings.worldbook.enabled, false);
    assert.equal(scope.worldbookDefaultResolved, true);
    assert.equal(retryAttempts, 2);

    runtime.destroy();
}

async function testProductionRuntimeQueriesDoNotCreateOrThrowForAnUnseenScope() {
    const {
        createMemoryQQV2StateStore,
    } = await importModule('modules/qq-v2/storage/state-store.js');
    const {
        createQQV2ProductionRuntime,
    } = await importModule('modules/qq-v2/application/production-runtime.js');
    const stateStore = createMemoryQQV2StateStore();
    const runtime = createQQV2ProductionRuntime({
        host: {
            readScope() {
                return {
                    scopeId: 'st:character:alice:chat-query',
                    chatId: 'chat-query',
                    chatFile: 'chat-query',
                    hostType: 'character',
                    hostId: 'alice',
                };
            },
            readUserIdentity() { return { name: 'Traveler', avatar: '' }; },
            readStoryTime() { return ''; },
            readStoryMessages() { return []; },
            readRawContext() { return { getRequestHeaders: () => ({}) }; },
        },
        stateStore,
        cryptoApi: webcrypto,
        backend: { async generate() {}, async loadModels() { return []; } },
        worldbookGateway: { async loadBook() { return { entries: {} }; }, async saveBook() {} },
    });
    await runtime.initialize();

    const missingScopeId = 'st:character:missing:chat-query';
    assert.deepEqual(await runtime.listConversations({ scopeId: missingScopeId }), []);
    assert.equal(await runtime.getConversation({ scopeId: missingScopeId, conversationId: 'missing' }), null);
    assert.deepEqual(await runtime.listMessages({ scopeId: missingScopeId, conversationId: 'missing' }), {
        items: [],
        hasMore: false,
        nextBeforeSequence: null,
    });
    assert.equal(await runtime.getPerson({ scopeId: missingScopeId, personId: 'missing' }), null);
    assert.equal(await runtime.getMedia({ scopeId: missingScopeId, assetId: 'missing' }), null);
    assert.deepEqual(await runtime.getUnreadState({ scopeId: missingScopeId }), {
        total: 0,
        byConversationId: {},
    });
    assert.equal((await stateStore.read()).scopes[missingScopeId], undefined);
    runtime.destroy();
}

async function testListWorldbooksWithoutReadyScopeDoesNotCreateScopeOrReachGateway() {
    const { createMemoryQQV2StateStore } = await importModule('modules/qq-v2/storage/state-store.js');
    const { createQQV2Repository } = await importModule('modules/qq-v2/domain/repository.js');
    const { createQQV2ProductionRuntime } = await importModule('modules/qq-v2/application/production-runtime.js');
    const scopeId = 'st:character:alice:chat-worldbook-not-ready';
    const stateStore = createMemoryQQV2StateStore();
    const baseRepository = createQQV2Repository({ stateStore });
    let ensureScopeCalls = 0;
    let gatewayCalls = 0;
    const repository = {
        ...baseRepository,
        ensureScope(...args) {
            ensureScopeCalls += 1;
            return baseRepository.ensureScope(...args);
        },
    };
    const runtime = createQQV2ProductionRuntime({
        host: {
            readScope() { return { scopeId, chatId: scopeId, chatFile: scopeId, hostType: 'character', hostId: 'alice' }; },
            readUserIdentity() { return { name: 'Traveler', avatar: '' }; },
            readStoryTime() { return ''; },
            readStoryMessages() { return []; },
            readRawContext() { return {}; },
        },
        stateStore,
        repository,
        cryptoApi: webcrypto,
        backend: { async generate() {}, async loadModels() { return []; } },
        projectionService: { async retryPending() {}, async syncConversation() {} },
        worldbookGateway: {
            async listBookNames() {
                gatewayCalls += 1;
                return ['must-not-be-read'];
            },
        },
    });

    const result = await runtime.listWorldbooks({ scopeId });
    const state = await stateStore.read();
    runtime.destroy();

    assert.deepEqual(result, []);
    assert.equal(ensureScopeCalls, 0);
    assert.equal(state.scopes[scopeId], undefined);
    assert.equal(gatewayCalls, 0);
}

async function testProductionFacadeBridgesPrivateProfilesMediaAndUnreadState() {
    const {
        createMemoryQQV2StateStore,
    } = await importModule('modules/qq-v2/storage/state-store.js');
    const {
        createQQV2Repository,
    } = await importModule('modules/qq-v2/domain/repository.js');
    const {
        createQQV2ProductionRuntime,
    } = await importModule('modules/qq-v2/application/production-runtime.js');
    const scopeId = 'st:character:alice:chat-profiles';
    const stateStore = createMemoryQQV2StateStore();
    const repository = createQQV2Repository({ stateStore });
    const runtime = createQQV2ProductionRuntime({
        host: {
            readScope() {
                return {
                    scopeId,
                    chatId: 'chat-profiles',
                    chatFile: 'chat-profiles',
                    hostType: 'character',
                    hostId: 'alice',
                };
            },
            readUserIdentity() { return { name: 'Traveler', avatar: '' }; },
            readStoryTime() { return '2042-05-20 09:30'; },
            readStoryMessages() { return []; },
            readRawContext() { return { getRequestHeaders: () => ({}) }; },
        },
        stateStore,
        repository,
        cryptoApi: webcrypto,
        backend: { async generate() {}, async loadModels() { return []; } },
        worldbookGateway: { async loadBook() { return { entries: {} }; }, async saveBook() {} },
    });
    await runtime.initialize();
    const privateOne = await runtime.createPrivateConversation({ scopeId, name: 'Alice' });
    const privateTwo = await runtime.createPrivateConversation({ scopeId, name: 'Bob' });
    const group = await repository.createGroupConversation(scopeId, {
        scopeId,
        name: 'Original group',
        memberIds: [privateOne.person.personId, privateTwo.person.personId],
    });
    const facade = runtime.getFacade();

    const avatar = await facade.intent.saveMedia({
        media: {
            kind: 'avatar',
            mimeType: 'image/webp',
            blob: new Blob(['avatar'], { type: 'image/webp' }),
        },
    });
    const privateBackground = await facade.intent.saveMedia({
        media: {
            conversationId: privateOne.conversation.conversationId,
            kind: 'background',
            mimeType: 'image/webp',
            blob: new Blob(['private background'], { type: 'image/webp' }),
        },
    });
    assert.equal(avatar.ok, true);
    assert.equal(privateBackground.ok, true);

    const privateProfile = await facade.intent.updatePrivateProfile({
        conversationId: privateOne.conversation.conversationId,
        profile: {
            remark: 'Alicia',
            avatarAssetId: avatar.media.assetId,
            backgroundAssetId: privateBackground.media.assetId,
        },
    });
    assert.equal(privateProfile.ok, true);
    assert.equal(privateProfile.result.person.avatarAssetId, avatar.media.assetId);
    assert.equal(privateProfile.result.conversation.title, 'Alicia');
    assert.equal(privateProfile.result.conversation.backgroundAssetId, privateBackground.media.assetId);

    assert.deepEqual(await facade.query.conversation({
        conversationId: group.conversation.conversationId,
    }), {
        ok: false,
        status: 'not-found',
        reason: 'conversation-not-found',
    });
    assert.equal((await facade.intent.updateGroupProfile({
        conversationId: group.conversation.conversationId,
        profile: { backgroundAssetId: 'hidden-group-background' },
    })).status, 'disabled');
    assert.equal((await facade.intent.manageGroup({
        groupId: group.group.groupId,
        action: 'rename',
        value: 'Renamed group',
    })).status, 'disabled');

    await repository.incrementConversationUnread(scopeId, privateTwo.conversation.conversationId, 2);
    assert.deepEqual((await facade.query.unread()).unread, {
        total: 2,
        display: '2',
        byConversationId: { [privateOne.conversation.conversationId]: 0, [privateTwo.conversation.conversationId]: 2 },
    });
    assert.deepEqual(await facade.intent.openConversation({
        conversationId: privateTwo.conversation.conversationId,
    }), { ok: true, status: 'accepted', unreadCount: 0 });
    assert.equal((await facade.query.unread()).unread.total, 0);
    runtime.destroy();
}

async function testProductionRuntimeTracksUnreadOnlyForClosedConversations() {
    const {
        createMemoryQQV2StateStore,
    } = await importModule('modules/qq-v2/storage/state-store.js');
    const {
        createQQV2Repository,
    } = await importModule('modules/qq-v2/domain/repository.js');
    const {
        createQQV2ProductionRuntime,
    } = await importModule('modules/qq-v2/application/production-runtime.js');
    const scopeId = 'st:character:alice:chat-unread';
    const stateStore = createMemoryQQV2StateStore();
    const repository = createQQV2Repository({ stateStore });
    const alice = await repository.createPrivateConversation(scopeId, { name: 'Alice' });
    const bob = await repository.createPrivateConversation(scopeId, { name: 'Bob' });
    let actionCalls = 0;
    const runtime = createQQV2ProductionRuntime({
        host: {
            readScope() {
                return {
                    scopeId,
                    chatId: 'chat-unread',
                    chatFile: 'chat-unread',
                    hostType: 'character',
                    hostId: 'alice',
                };
            },
            readUserIdentity() { return { name: 'Traveler', avatar: '' }; },
            readStoryTime() { return '2042-05-20 09:30'; },
            readStoryMessages() { return []; },
            readRawContext() { return { getRequestHeaders: () => ({}) }; },
        },
        stateStore,
        repository,
        cryptoApi: webcrypto,
        actionService: {
            async execute(input) {
                const conversationId = input.references.P1;
                const conversation = await repository.getConversation(scopeId, conversationId);
                const person = await repository.getPerson(scopeId, conversation.personId);
                const [message] = await repository.appendMessages(scopeId, conversationId, [{
                    senderId: person.personId,
                    senderType: 'person',
                    type: 'text',
                    content: `Reply ${actionCalls + 1}`,
                    storyTime: '2042-05-20 09:30',
                }]);
                actionCalls += 1;
                return {
                    applied: [{ type: 'message', messageId: message.messageId }],
                    createdConversationIds: [],
                };
            },
        },
        backend: { async generate() { return { content: '<qq><ignored /></qq>' }; }, async loadModels() { return []; } },
        worldbookGateway: { async loadBook() { return { entries: {} }; }, async saveBook() {} },
        worldbookContextResolver: { async resolve() { return ''; } },
    });
    await runtime.initialize();
    const apiPreset = await runtime.saveApiPreset({ preset: {
        name: 'Unread API',
        endpoint: 'https://api.example.test/v1',
        apiKey: 'unread-secret',
        model: 'unread-model',
    },
    });
    await runtime.updateGlobalSettings({
        scopeId,
        settings: {
            activeApiPresetId: apiPreset.id,
            privateReplyPresetId: 'builtin-private-reply',
        },
    });

    await runtime.openConversation({ scopeId, conversationId: alice.conversation.conversationId });
    await runtime.sendManual({
        scopeId,
        conversationId: bob.conversation.conversationId,
        message: { type: 'text', content: 'Hello from a closed conversation' },
    });
    await waitUntil(async () => (
        actionCalls === 1
        && (await runtime.getUnreadState({ scopeId })).byConversationId[bob.conversation.conversationId] === 1
    ), 'the closed conversation incoming unread count');

    assert.equal((await runtime.getUnreadState({ scopeId })).total, 1);
    assert.deepEqual(await runtime.openConversation({ scopeId, conversationId: bob.conversation.conversationId }), {
        conversationId: bob.conversation.conversationId,
        unreadCount: 0,
    });
    assert.equal((await runtime.getUnreadState({ scopeId })).total, 0);

    await runtime.sendManual({
        scopeId,
        conversationId: bob.conversation.conversationId,
        message: { type: 'text', content: 'Hello from the open conversation' },
    });
    await waitUntil(async () => actionCalls === 2, 'the open conversation reply');
    assert.equal((await runtime.getUnreadState({ scopeId })).total, 0);
    runtime.destroy();
}

async function testOpenConversationDoesNotRestoreStaleOpenStateOrNotify() {
    const { createMemoryQQV2StateStore } = await importModule('modules/qq-v2/storage/state-store.js');
    const { createQQV2Repository } = await importModule('modules/qq-v2/domain/repository.js');
    const { createQQV2ProductionRuntime } = await importModule('modules/qq-v2/application/production-runtime.js');
    const scopeA = 'st:character:alice:chat-open-stale-a';
    const scopeB = 'st:character:alice:chat-open-stale-b';
    let currentScopeId = scopeA;
    let delayNextScopeAOpen = false;
    const openStarted = deferred();
    const releaseOpen = deferred();
    const stateStore = createMemoryQQV2StateStore();
    const baseRepository = createQQV2Repository({ stateStore });
    const repository = {
        ...baseRepository,
        async openConversation(...args) {
            const result = await baseRepository.openConversation(...args);
            if (delayNextScopeAOpen && args[0] === scopeA) {
                delayNextScopeAOpen = false;
                openStarted.resolve();
                await releaseOpen.promise;
            }
            return result;
        },
    };
    const runtime = createQQV2ProductionRuntime({
        host: {
            readScope() {
                return { scopeId: currentScopeId, chatId: currentScopeId, chatFile: currentScopeId, hostType: 'character', hostId: 'alice' };
            },
            readUserIdentity() { return { name: 'Traveler', avatar: '' }; },
            readStoryTime() { return ''; },
            readStoryMessages() { return []; },
            readRawContext() { return {}; },
        },
        stateStore,
        repository,
        cryptoApi: webcrypto,
        requestService: { cancelScope() {}, getConversationState() { return {}; }, cancelConversation() {} },
        proactiveService: { cancelScope() {}, async getState() { return { enabled: false, everyTurns: 5 }; } },
        projectionService: { async retryPending() {}, async syncConversation() {} },
        worldbookGateway: { async getCurrentCharacterBookNames() { return { primary: '', additional: [] }; } },
    });
    await runtime.initialize();
    const privateChat = await runtime.createPrivateConversation({ scopeId: scopeA, name: 'Alice' });
    const events = [];
    const unsubscribe = runtime.subscribe((event) => events.push(event));

    delayNextScopeAOpen = true;
    const opening = runtime.openConversation({
        scopeId: scopeA,
        conversationId: privateChat.conversation.conversationId,
    }).then(
        (value) => ({ status: 'fulfilled', value }),
        (reason) => ({ status: 'rejected', reason }),
    );
    await openStarted.promise;

    currentScopeId = scopeB;
    await runtime.handleChatChanged();
    releaseOpen.resolve();
    const outcome = await opening;

    assert.equal(outcome.status, 'rejected');
    assert.equal(outcome.reason?.code, 'scope_inactive');
    assert.deepEqual(events.filter((event) => event.reason === 'conversation-opened'), []);

    currentScopeId = scopeA;
    await runtime.handleChatChanged();
    assert.deepEqual(await runtime.closeConversation({
        scopeId: scopeA,
        conversationId: privateChat.conversation.conversationId,
    }), {
        conversationId: privateChat.conversation.conversationId,
        closed: false,
    });

    unsubscribe();
    runtime.destroy();
}

async function testCloseConversationDoesNotClearReopenedStateAfterScopeAba() {
    const { createMemoryQQV2StateStore } = await importModule('modules/qq-v2/storage/state-store.js');
    const { createQQV2Repository } = await importModule('modules/qq-v2/domain/repository.js');
    const { createQQV2ProductionRuntime } = await importModule('modules/qq-v2/application/production-runtime.js');
    const scopeA = 'st:character:alice:chat-close-stale-a';
    const scopeB = 'st:character:alice:chat-close-stale-b';
    let currentScopeId = scopeA;
    let delayNextScopeAEnsure = false;
    const ensureStarted = deferred();
    const releaseEnsure = deferred();
    const stateStore = createMemoryQQV2StateStore();
    const baseRepository = createQQV2Repository({ stateStore });
    const repository = {
        ...baseRepository,
        async ensureScope(...args) {
            const result = await baseRepository.ensureScope(...args);
            if (delayNextScopeAEnsure && args[0] === scopeA) {
                delayNextScopeAEnsure = false;
                ensureStarted.resolve();
                await releaseEnsure.promise;
            }
            return result;
        },
    };
    const runtime = createQQV2ProductionRuntime({
        host: {
            readScope() {
                return { scopeId: currentScopeId, chatId: currentScopeId, chatFile: currentScopeId, hostType: 'character', hostId: 'alice' };
            },
            readUserIdentity() { return { name: 'Traveler', avatar: '' }; },
            readStoryTime() { return ''; },
            readStoryMessages() { return []; },
            readRawContext() { return {}; },
        },
        stateStore,
        repository,
        cryptoApi: webcrypto,
        requestService: { cancelScope() {}, getConversationState() { return {}; }, cancelConversation() {} },
        proactiveService: { cancelScope() {}, async getState() { return { enabled: false, everyTurns: 5 }; } },
        projectionService: { async retryPending() {}, async syncConversation() {} },
        worldbookGateway: { async getCurrentCharacterBookNames() { return { primary: '', additional: [] }; } },
    });
    await runtime.initialize();
    const privateChat = await runtime.createPrivateConversation({ scopeId: scopeA, name: 'Alice' });

    delayNextScopeAEnsure = true;
    const closing = runtime.closeConversation({
        scopeId: scopeA,
        conversationId: privateChat.conversation.conversationId,
    }).then(
        (value) => ({ status: 'fulfilled', value }),
        (reason) => ({ status: 'rejected', reason }),
    );
    await ensureStarted.promise;

    currentScopeId = scopeB;
    await runtime.handleChatChanged();
    currentScopeId = scopeA;
    await runtime.handleChatChanged();
    await runtime.openConversation({
        scopeId: scopeA,
        conversationId: privateChat.conversation.conversationId,
    });

    releaseEnsure.resolve();
    const outcome = await closing;
    assert.equal(outcome.status, 'rejected');
    assert.equal(outcome.reason?.code, 'scope_inactive');
    assert.deepEqual(await runtime.closeConversation({
        scopeId: scopeA,
        conversationId: privateChat.conversation.conversationId,
    }), {
        conversationId: privateChat.conversation.conversationId,
        closed: true,
    });

    runtime.destroy();
}

async function testDeleteMessagesKeepsTheCallerProjectionSnapshot() {
    const {
        createMemoryQQV2StateStore,
    } = await importModule('modules/qq-v2/storage/state-store.js');
    const {
        createQQV2Repository,
    } = await importModule('modules/qq-v2/domain/repository.js');
    const {
        createQQV2ProductionRuntime,
    } = await importModule('modules/qq-v2/application/production-runtime.js');
    const scopeId = 'st:character:alice:chat-delete-snapshot';
    const stateStore = createMemoryQQV2StateStore();
    const repository = createQQV2Repository({ stateStore });
    const projectionCalls = [];
    const runtime = createQQV2ProductionRuntime({
        host: {
            readScope() {
                return {
                    scopeId,
                    chatId: 'chat-delete-snapshot',
                    chatFile: 'chat-delete-snapshot',
                    hostType: 'character',
                    hostId: 'alice',
                };
            },
            // These deliberately differ from the caller snapshot below. The
            // projection must not re-read them after the mutation begins.
            readUserIdentity() { return { name: 'Changed host user', avatar: '' }; },
            readStoryTime() { return '2042-05-20 10:00'; },
            readStoryMessages() { return []; },
            readRawContext() { return { getRequestHeaders: () => ({}) }; },
        },
        stateStore,
        repository,
        cryptoApi: webcrypto,
        backend: { async generate() {}, async loadModels() { return []; } },
        projectionService: {
            async retryPending() {},
            async syncConversation(input) {
                projectionCalls.push(input);
            },
        },
    });
    await runtime.initialize();
    const privateChat = await runtime.createPrivateConversation({ scopeId, name: 'Alice' });
    const [message] = await repository.appendMessages(scopeId, privateChat.conversation.conversationId, [{
        senderId: '__self__',
        senderType: 'self',
        type: 'text',
        content: 'Delete me',
        storyTime: '2042-05-20 09:30',
    }]);

    await runtime.deleteMessages({
        scopeId,
        conversationId: privateChat.conversation.conversationId,
        messageIds: [message.messageId],
        userName: 'Facade snapshot user',
        storyTime: '2042-05-20 09:30',
    });

    assert.equal(projectionCalls.length, 1);
    assert.deepEqual({
        scopeId: projectionCalls[0].scopeId,
        conversationId: projectionCalls[0].conversationId,
        userName: projectionCalls[0].userName,
        storyTime: projectionCalls[0].storyTime,
    }, {
        scopeId,
        conversationId: privateChat.conversation.conversationId,
        userName: 'Facade snapshot user',
        storyTime: '2042-05-20 09:30',
    });
    assert.equal(projectionCalls[0].scopeSession.scopeId, scopeId);
    assert.equal(projectionCalls[0].scopeSession.isReady(), true);
    runtime.destroy();
}

async function testDeleteMessagesStopsBeforeNotifyingWhenWorldbookSessionBecomesStale() {
    const { createMemoryQQV2StateStore } = await importModule('modules/qq-v2/storage/state-store.js');
    const { createQQV2Repository } = await importModule('modules/qq-v2/domain/repository.js');
    const { createQQV2ProductionRuntime } = await importModule('modules/qq-v2/application/production-runtime.js');
    const scopeA = 'st:character:alice:chat-delete-worldbook-a';
    const scopeB = 'st:character:alice:chat-delete-worldbook-b';
    let currentScopeId = scopeA;
    const notifications = [];
    let syncScopeSession = null;
    const syncStarted = deferred();
    const releaseSync = deferred();
    const stateStore = createMemoryQQV2StateStore();
    const repository = createQQV2Repository({ stateStore });
    const runtime = createQQV2ProductionRuntime({
        host: {
            readScope() {
                return { scopeId: currentScopeId, chatId: currentScopeId, chatFile: currentScopeId, hostType: 'character', hostId: 'alice' };
            },
            readUserIdentity() { return { name: 'Traveler', avatar: '' }; },
            readStoryTime() { return ''; },
            readStoryMessages() { return []; },
            readRawContext() { return {}; },
        },
        stateStore,
        repository,
        cryptoApi: webcrypto,
        requestService: {
            cancelScope() {},
            getConversationState() { return {}; },
            async cancelConversation() {},
            async reconcileConversation() {},
        },
        proactiveService: {
            cancelScope() {},
            async getState() { return { enabled: false, everyTurns: 5 }; },
        },
        projectionService: {
            async retryPending() {},
            async syncConversation({ scopeSession }) {
                syncScopeSession = scopeSession;
                syncStarted.resolve();
                await releaseSync.promise;
            },
        },
        worldbookGateway: { async getCurrentCharacterBookNames() { return { primary: '', additional: [] }; } },
    });
    await runtime.initialize();
    const privateChat = await runtime.createPrivateConversation({ scopeId: scopeA, name: 'Alice' });
    const [message] = await repository.appendMessages(scopeA, privateChat.conversation.conversationId, [{
        senderId: '__self__',
        senderType: 'self',
        type: 'text',
        content: 'Delete then switch',
        storyTime: '',
    }]);
    const unsubscribe = runtime.subscribe((event) => { notifications.push(event); });

    const deleting = runtime.deleteMessages({
        scopeId: scopeA,
        conversationId: privateChat.conversation.conversationId,
        messageIds: [message.messageId],
    });
    await syncStarted.promise;

    currentScopeId = scopeB;
    const transition = runtime.handleChatChanged();
    await waitUntil(
        () => syncScopeSession?.isCurrent() === false,
        'the delete-messages projection session becoming stale',
    );
    releaseSync.resolve();
    await assert.rejects(deleting, (error) => error?.code === 'scope_inactive');
    await transition;
    unsubscribe();
    runtime.destroy();

    assert.equal(notifications.some((event) => event.scopeId === scopeA), false);
}

async function testDeleteMessagesStopsWhenCapturedScopeSessionBecomesStaleDuringAwait() {
    const { createMemoryQQV2StateStore } = await importModule('modules/qq-v2/storage/state-store.js');
    const { createQQV2Repository } = await importModule('modules/qq-v2/domain/repository.js');
    const { createQQV2ProductionRuntime } = await importModule('modules/qq-v2/application/production-runtime.js');
    const scopeA = 'st:character:alice:chat-delete-aba-a';
    const scopeB = 'st:character:alice:chat-delete-aba-b';
    let currentScopeId = scopeA;
    let blockNextScopeAEnsure = false;
    let deleteCalls = 0;
    const deleteEnsureStarted = deferred();
    const releaseDeleteEnsure = deferred();
    const stateStore = createMemoryQQV2StateStore();
    const baseRepository = createQQV2Repository({ stateStore });
    const repository = {
        ...baseRepository,
        async ensureScope(...args) {
            if (blockNextScopeAEnsure && args[0] === scopeA) {
                blockNextScopeAEnsure = false;
                deleteEnsureStarted.resolve();
                await releaseDeleteEnsure.promise;
            }
            return baseRepository.ensureScope(...args);
        },
        deleteMessages(...args) {
            deleteCalls += 1;
            return baseRepository.deleteMessages(...args);
        },
    };
    const runtime = createQQV2ProductionRuntime({
        host: {
            readScope() {
                return { scopeId: currentScopeId, chatId: currentScopeId, chatFile: currentScopeId, hostType: 'character', hostId: 'alice' };
            },
            readUserIdentity() { return { name: 'Traveler', avatar: '' }; },
            readStoryTime() { return ''; },
            readStoryMessages() { return []; },
            readRawContext() { return {}; },
        },
        stateStore,
        repository,
        cryptoApi: webcrypto,
        requestService: {
            cancelScope() {},
            getConversationState() { return {}; },
            async cancelConversation() {},
            async reconcileConversation() {},
        },
        proactiveService: {
            cancelScope() {},
            async getState() { return { enabled: false, everyTurns: 5 }; },
        },
        projectionService: { async retryPending() {}, async syncConversation() {} },
        worldbookGateway: { async getCurrentCharacterBookNames() { return { primary: '', additional: [] }; } },
    });
    await runtime.initialize();
    const privateChat = await runtime.createPrivateConversation({ scopeId: scopeA, name: 'Alice' });
    const [message] = await baseRepository.appendMessages(scopeA, privateChat.conversation.conversationId, [{
        senderId: '__self__',
        senderType: 'self',
        type: 'text',
        content: 'Keep me after ABA',
        storyTime: '',
    }]);

    blockNextScopeAEnsure = true;
    const deleting = runtime.deleteMessages({
        scopeId: scopeA,
        conversationId: privateChat.conversation.conversationId,
        messageIds: [message.messageId],
    }).then(
        (value) => ({ status: 'fulfilled', value }),
        (reason) => ({ status: 'rejected', reason }),
    );
    await deleteEnsureStarted.promise;

    currentScopeId = scopeB;
    await runtime.handleChatChanged();
    currentScopeId = scopeA;
    await runtime.handleChatChanged();
    releaseDeleteEnsure.resolve();
    await deleting;

    const remainingMessages = await baseRepository.listMessages(scopeA, privateChat.conversation.conversationId);
    runtime.destroy();

    assert.equal(deleteCalls, 0);
    assert.deepEqual(remainingMessages.map((item) => item.messageId), [message.messageId]);
}

async function testDeleteConversationStopsBeforeLocalDeleteWhenCapturedScopeSessionBecomesStale() {
    const { createMemoryQQV2StateStore } = await importModule('modules/qq-v2/storage/state-store.js');
    const { createQQV2Repository } = await importModule('modules/qq-v2/domain/repository.js');
    const { createQQV2ProductionRuntime } = await importModule('modules/qq-v2/application/production-runtime.js');
    const scopeA = 'st:character:alice:chat-delete-conversation-a';
    const scopeB = 'st:character:alice:chat-delete-conversation-b';
    let currentScopeId = scopeA;
    let deleteCalls = 0;
    let rollbackCalls = 0;
    let removalScopeSession = null;
    const removalStarted = deferred();
    const releaseRemoval = deferred();
    const stateStore = createMemoryQQV2StateStore();
    const baseRepository = createQQV2Repository({ stateStore });
    const repository = {
        ...baseRepository,
        deleteConversation(...args) {
            deleteCalls += 1;
            return baseRepository.deleteConversation(...args);
        },
    };
    const runtime = createQQV2ProductionRuntime({
        host: {
            readScope() {
                return { scopeId: currentScopeId, chatId: currentScopeId, chatFile: currentScopeId, hostType: 'character', hostId: 'alice' };
            },
            readUserIdentity() { return { name: 'Traveler', avatar: '' }; },
            readStoryTime() { return ''; },
            readStoryMessages() { return []; },
            readRawContext() { return {}; },
        },
        stateStore,
        repository,
        cryptoApi: webcrypto,
        requestService: {
            cancelScope() {},
            getConversationState() { return {}; },
            async cancelConversation() {},
            async reconcileConversation() {},
            handleConversationDeleted() {},
        },
        proactiveService: {
            cancelScope() {},
            async getState() { return { enabled: false, everyTurns: 5 }; },
        },
        projectionService: {
            async retryPending() {},
            async syncConversation() {},
            async removeConversationProjection({ scopeSession }) {
                removalScopeSession = scopeSession;
                removalStarted.resolve();
                await releaseRemoval.promise;
                return {
                    status: 'removed',
                    async rollback() {
                        rollbackCalls += 1;
                        return { status: 'restored' };
                    },
                };
            },
        },
        worldbookGateway: { async getCurrentCharacterBookNames() { return { primary: '', additional: [] }; } },
    });
    await runtime.initialize();
    const privateChat = await runtime.createPrivateConversation({ scopeId: scopeA, name: 'Alice' });

    const deleting = runtime.deleteConversation({
        scopeId: scopeA,
        conversationId: privateChat.conversation.conversationId,
    }).then(
        (value) => ({ status: 'fulfilled', value }),
        (reason) => ({ status: 'rejected', reason }),
    );
    await removalStarted.promise;

    currentScopeId = scopeB;
    const transition = runtime.handleChatChanged();
    await waitUntil(
        () => removalScopeSession?.isCurrent() === false,
        'the deletion session becoming stale',
    );
    releaseRemoval.resolve();
    const outcome = await deleting;
    await transition;
    const remainingConversation = await baseRepository.getConversation(scopeA, privateChat.conversation.conversationId);
    runtime.destroy();

    assert.equal(deleteCalls, 0);
    assert.equal(rollbackCalls, 0);
    assert.equal(outcome.status, 'rejected');
    assert.equal(outcome.reason?.code, 'scope_inactive');
    assert.notEqual(remainingConversation, null);
}

async function testDeleteConversationStopsAfterCommittedDeleteWhenScopeBecomesStale() {
    const { createMemoryQQV2StateStore } = await importModule('modules/qq-v2/storage/state-store.js');
    const { createQQV2Repository } = await importModule('modules/qq-v2/domain/repository.js');
    const { createQQV2ProductionRuntime } = await importModule('modules/qq-v2/application/production-runtime.js');
    const scopeA = 'st:character:alice:chat-delete-committed-a';
    const scopeB = 'st:character:alice:chat-delete-committed-b';
    let currentScopeId = scopeA;
    let deletedRequestStateCalls = 0;
    const deleteCommitted = deferred();
    const releaseDelete = deferred();
    const stateStore = createMemoryQQV2StateStore();
    const baseRepository = createQQV2Repository({ stateStore });
    const repository = {
        ...baseRepository,
        async deleteConversation(...args) {
            const result = await baseRepository.deleteConversation(...args);
            deleteCommitted.resolve();
            await releaseDelete.promise;
            return result;
        },
    };
    const runtime = createQQV2ProductionRuntime({
        host: {
            readScope() {
                return { scopeId: currentScopeId, chatId: currentScopeId, chatFile: currentScopeId, hostType: 'character', hostId: 'alice' };
            },
            readUserIdentity() { return { name: 'Traveler', avatar: '' }; },
            readStoryTime() { return ''; },
            readStoryMessages() { return []; },
            readRawContext() { return {}; },
        },
        stateStore,
        repository,
        cryptoApi: webcrypto,
        requestService: {
            cancelScope() {},
            getConversationState() { return {}; },
            async cancelConversation() {},
            handleConversationDeleted() { deletedRequestStateCalls += 1; },
        },
        proactiveService: {
            cancelScope() {},
            async getState() { return { enabled: false, everyTurns: 5 }; },
        },
        projectionService: {
            async retryPending() {},
            async syncConversation() {},
            async removeConversationProjection() { return { status: 'removed' }; },
        },
        worldbookGateway: { async getCurrentCharacterBookNames() { return { primary: '', additional: [] }; } },
    });
    await runtime.initialize();
    const deletedConversation = await runtime.createPrivateConversation({ scopeId: scopeA, name: 'Alice' });
    const survivor = await runtime.createPrivateConversation({ scopeId: scopeA, name: 'Bea' });
    const events = [];
    const unsubscribe = runtime.subscribe((event) => events.push(event));

    const deleting = runtime.deleteConversation({
        scopeId: scopeA,
        conversationId: deletedConversation.conversation.conversationId,
    }).then(
        (value) => ({ status: 'fulfilled', value }),
        (reason) => ({ status: 'rejected', reason }),
    );
    await deleteCommitted.promise;
    assert.equal(
        (await baseRepository.getConversation(scopeA, deletedConversation.conversation.conversationId))?.status,
        'contact',
        'the deletion must commit before the stale session is released',
    );

    currentScopeId = scopeB;
    await runtime.handleChatChanged();
    currentScopeId = scopeA;
    await runtime.handleChatChanged();
    await runtime.openConversation({
        scopeId: scopeA,
        conversationId: survivor.conversation.conversationId,
    });
    events.length = 0;

    releaseDelete.resolve();
    const outcome = await deleting;

    assert.equal(outcome.status, 'rejected');
    assert.equal(outcome.reason?.code, 'scope_inactive');
    assert.equal(deletedRequestStateCalls, 0);
    assert.deepEqual(events, []);
    assert.deepEqual(await runtime.closeConversation({
        scopeId: scopeA,
        conversationId: survivor.conversation.conversationId,
    }), {
        conversationId: survivor.conversation.conversationId,
        closed: true,
    });

    unsubscribe();
    runtime.destroy();
}

async function testProductionFacadeOwnsRevocableMediaRenderLeases() {
    const {
        createMemoryQQV2StateStore,
    } = await importModule('modules/qq-v2/storage/state-store.js');
    const {
        createQQV2ProductionRuntime,
    } = await importModule('modules/qq-v2/application/production-runtime.js');
    const scopeA = 'st:character:alice:chat-media-a';
    const scopeB = 'st:character:alice:chat-media-b';
    let currentScopeId = scopeA;
    const createdUrls = [];
    const revokedUrls = [];
    const objectUrlApi = {
        createObjectURL(blob) {
            assert.ok(blob instanceof Blob);
            const url = `blob:qq-v2/${createdUrls.length + 1}`;
            createdUrls.push(url);
            return url;
        },
        revokeObjectURL(url) {
            revokedUrls.push(url);
        },
    };
    const runtime = createQQV2ProductionRuntime({
        host: {
            readScope() {
                return {
                    scopeId: currentScopeId,
                    chatId: currentScopeId === scopeA ? 'chat-media-a' : 'chat-media-b',
                    chatFile: currentScopeId === scopeA ? 'chat-media-a' : 'chat-media-b',
                    hostType: 'character',
                    hostId: 'alice',
                };
            },
            readUserIdentity() { return { name: 'Traveler', avatar: '' }; },
            readStoryTime() { return '2042-05-20 09:30'; },
            readStoryMessages() { return []; },
            readRawContext() { return { getRequestHeaders: () => ({}) }; },
        },
        stateStore: createMemoryQQV2StateStore(),
        cryptoApi: webcrypto,
        objectUrlApi,
        backend: { async generate() {}, async loadModels() { return []; } },
        projectionService: {
            async retryPending() {},
            async syncConversation() {},
            async setConversationInjection() { return { status: 'synced' }; },
            async removeConversationProjection() { return { status: 'removed' }; },
        },
    });
    await runtime.initialize();
    const facade = runtime.getFacade();
    const privateChat = await runtime.createPrivateConversation({ scopeId: scopeA, name: 'Alice' });
    const firstAvatar = await facade.intent.saveMedia({
        media: {
            kind: 'avatar',
            mimeType: 'image/webp',
            blob: new Blob(['first avatar'], { type: 'image/webp' }),
        },
    });
    await facade.intent.updatePrivateProfile({
        conversationId: privateChat.conversation.conversationId,
        profile: { avatarAssetId: firstAvatar.media.assetId },
    });
    const firstRender = await facade.query.mediaRender({ assetId: firstAvatar.media.assetId });
    assert.equal(firstRender.ok, true);
    assert.deepEqual(firstRender.media, {
        assetId: firstAvatar.media.assetId,
        conversationId: '',
        kind: 'avatar',
        mimeType: 'image/webp',
        size: 12,
        library: '',
        createdAt: 0,
    });
    assert.equal(firstRender.render.url, 'blob:qq-v2/1');
    assert.match(firstRender.render.leaseId, /^media-render-/);
    assert.equal(JSON.stringify(firstRender).includes('first avatar'), false);

    const secondAvatar = await facade.intent.saveMedia({
        media: {
            kind: 'avatar',
            mimeType: 'image/webp',
            blob: new Blob(['second avatar'], { type: 'image/webp' }),
        },
    });
    await facade.intent.updatePrivateProfile({
        conversationId: privateChat.conversation.conversationId,
        profile: { avatarAssetId: secondAvatar.media.assetId },
    });
    assert.deepEqual(revokedUrls, ['blob:qq-v2/1']);

    const releasedRender = await facade.query.mediaRender({ assetId: secondAvatar.media.assetId });
    assert.deepEqual(await facade.intent.releaseMediaRender({
        leaseId: releasedRender.render.leaseId,
    }), { ok: true, status: 'accepted', released: true });
    assert.deepEqual(revokedUrls, ['blob:qq-v2/1', 'blob:qq-v2/2']);

    const deletionRender = await facade.query.mediaRender({ assetId: secondAvatar.media.assetId });
    await facade.intent.deleteConversation({ conversationId: privateChat.conversation.conversationId });
    assert.deepEqual(revokedUrls, ['blob:qq-v2/1', 'blob:qq-v2/2']);

    const scopeRenderMedia = await facade.intent.saveMedia({
        media: {
            kind: 'avatar',
            mimeType: 'image/webp',
            blob: new Blob(['scope switch avatar'], { type: 'image/webp' }),
        },
    });
    const scopeRender = await facade.query.mediaRender({ assetId: scopeRenderMedia.media.assetId });
    currentScopeId = scopeB;
    await runtime.handleChatChanged();
    assert.deepEqual(revokedUrls, ['blob:qq-v2/1', 'blob:qq-v2/2', deletionRender.render.url, scopeRender.render.url]);

    const destroyMedia = await facade.intent.saveMedia({
        media: {
            kind: 'avatar',
            mimeType: 'image/webp',
            blob: new Blob(['destroy avatar'], { type: 'image/webp' }),
        },
    });
    const destroyRender = await facade.query.mediaRender({ assetId: destroyMedia.media.assetId });
    runtime.destroy();
    assert.deepEqual(createdUrls, [
        'blob:qq-v2/1',
        'blob:qq-v2/2',
        'blob:qq-v2/3',
        'blob:qq-v2/4',
        'blob:qq-v2/5',
    ]);
    assert.deepEqual(revokedUrls, [
        'blob:qq-v2/1',
        'blob:qq-v2/2',
        'blob:qq-v2/3',
        'blob:qq-v2/4',
        destroyRender.render.url,
    ]);
}

async function testProductionRuntimeExposesRetryableManualCancellation() {
    const {
        createMemoryQQV2StateStore,
    } = await importModule('modules/qq-v2/storage/state-store.js');
    const {
        createQQV2ProductionRuntime,
    } = await importModule('modules/qq-v2/application/production-runtime.js');
    const scopeId = 'st:character:alice:chat-manual-cancel';
    const cancelCalls = [];
    const proactiveCancelCalls = [];
    const runtime = createQQV2ProductionRuntime({
        host: {
            readScope() {
                return {
                    scopeId,
                    chatId: 'chat-manual-cancel',
                    chatFile: 'chat-manual-cancel',
                    hostType: 'character',
                    hostId: 'alice',
                };
            },
            readUserIdentity() { return { name: 'Traveler', avatar: '' }; },
            readStoryTime() { return '2042-05-20 09:30'; },
            readStoryMessages() { return []; },
            readRawContext() { return { getRequestHeaders: () => ({}) }; },
        },
        stateStore: createMemoryQQV2StateStore(),
        cryptoApi: webcrypto,
        requestService: {
            handleScopeChanged() {},
            getConversationState() { return { phase: 'running', pendingUserMessageCount: 1, error: '' }; },
            cancelConversation() {},
            async cancelManual(input) {
                cancelCalls.push(input);
                return { cancelled: true, phase: 'failed', pendingUserMessageCount: 1, error: 'AI 生成已终止' };
            },
        },
        projectionService: {
            async retryPending() {},
            async syncConversation() {},
        },
        proactiveService: {
            cancelScope(input) { proactiveCancelCalls.push(input); },
            async getState() { return { enabled: false, everyTurns: 5 }; },
        },
    });
    await runtime.initialize();
    const privateChat = await runtime.createPrivateConversation({ scopeId, name: 'Alice' });
    let notifications = 0;
    const unsubscribe = runtime.subscribe(() => { notifications += 1; });

    assert.deepEqual(await runtime.cancelManualRequest({
        scopeId,
        conversationId: privateChat.conversation.conversationId,
    }), {
        cancelled: true,
        phase: 'failed',
        pendingUserMessageCount: 1,
        error: 'AI 生成已终止',
    });
    assert.deepEqual(cancelCalls, [{ scopeId, conversationId: privateChat.conversation.conversationId }]);
    assert.equal(notifications, 1);
    assert.deepEqual(proactiveCancelCalls, [], 'manual cancellation must not touch proactive work');

    unsubscribe();
    runtime.destroy();
}

async function testSharedWorldbookConversationSyncIsSerial() {
    const { createMemoryQQV2StateStore } = await importModule('modules/qq-v2/storage/state-store.js');
    const { createQQV2Repository } = await importModule('modules/qq-v2/domain/repository.js');
    const { createQQV2ProductionRuntime } = await importModule('modules/qq-v2/application/production-runtime.js');
    const scopeId = 'st:character:alice:chat-shared-worldbook';
    const stateStore = createMemoryQQV2StateStore();
    const repository = createQQV2Repository({ stateStore });
    const copy = (value) => JSON.parse(JSON.stringify(value));
    let book = { entries: {} };
    let delayLoads = false;
    let activeLoads = 0;
    let maxActiveLoads = 0;
    const runtime = createQQV2ProductionRuntime({
        host: {
            readScope() { return { scopeId, chatId: 'shared', chatFile: 'shared', hostType: 'character', hostId: 'alice' }; },
            readUserIdentity() { return { name: 'Traveler', avatar: '' }; },
            readStoryTime() { return '2042-05-20 09:30'; },
            readStoryMessages() { return []; },
            readRawContext() { return { getRequestHeaders: () => ({}) }; },
        },
        stateStore,
        repository,
        cryptoApi: webcrypto,
        backend: { async generate() {}, async loadModels() { return []; } },
        worldbookGateway: {
            async getCurrentCharacterBookNames() { return { primary: '', additional: [] }; },
            async loadBook() {
                const snapshot = copy(book);
                if (delayLoads) {
                    activeLoads += 1;
                    maxActiveLoads = Math.max(maxActiveLoads, activeLoads);
                    await new Promise((resolve) => setTimeout(resolve, 10));
                    activeLoads -= 1;
                }
                return snapshot;
            },
            async saveBook(_name, value) { book = copy(value); },
        },
    });

    await runtime.initialize();
    const alice = await runtime.createPrivateConversation({ scopeId, name: 'Alice' });
    const bob = await runtime.createPrivateConversation({ scopeId, name: 'Bob' });
    for (const item of [alice, bob]) {
        await repository.appendMessages(scopeId, item.conversation.conversationId, [{
            senderId: item.person.personId,
            senderType: 'person',
            type: 'text',
            content: `${item.person.formalName} message`,
            storyTime: '2042-05-20 09:25',
        }]);
    }
    await runtime.updateGlobalSettings({
        scopeId,
        settings: { worldbook: { enabled: true, bookName: 'QQ', timeWindow: { mode: 'all' } } },
        userName: 'Traveler',
        storyTime: '2042-05-20 09:30',
    });
    book = { entries: {} };
    await repository.setConversationProjection(scopeId, alice.conversation.conversationId, { pending: true });
    await repository.setConversationProjection(scopeId, bob.conversation.conversationId, { pending: true });
    delayLoads = true;

    await runtime.retryPendingWorldbook({ scopeId, userName: 'Traveler', storyTime: '2042-05-20 09:30' });

    assert.equal(maxActiveLoads, 1);
    assert.equal(Object.keys(book.entries).length, 2);
    runtime.destroy();
}

async function testPendingOldScopeCleanupBlocksNewScopeReconcile() {
    const { createMemoryQQV2StateStore } = await importModule('modules/qq-v2/storage/state-store.js');
    const { createQQV2Repository } = await importModule('modules/qq-v2/domain/repository.js');
    const { createQQV2ProductionRuntime } = await importModule('modules/qq-v2/application/production-runtime.js');
    const scopeA = 'st:character:alice:chat-cleanup-a';
    const scopeB = 'st:character:bea:chat-cleanup-b';
    const scopeC = 'st:character:cora:chat-cleanup-c';
    const scopeD = 'st:character:dora:chat-cleanup-d';
    let currentScopeId = scopeA;
    let pendingScopeId = scopeB;
    const reconciled = [];
    const removed = [];
    const stateStore = createMemoryQQV2StateStore();
    const repository = createQQV2Repository({ stateStore });
    const scopeFacts = (scopeId, hostId, chatFile) => ({
        scopeId,
        chatId: chatFile,
        chatFile,
        hostType: 'character',
        hostId,
    });
    const factsByScopeId = new Map([
        [scopeA, scopeFacts(scopeA, 'alice', 'chat-cleanup-a')],
        [scopeB, scopeFacts(scopeB, 'bea', 'chat-cleanup-b')],
        [scopeC, scopeFacts(scopeC, 'cora', 'chat-cleanup-c')],
        [scopeD, scopeFacts(scopeD, 'dora', 'chat-cleanup-d')],
    ]);
    const runtime = createQQV2ProductionRuntime({
        host: {
            readScope() { return factsByScopeId.get(currentScopeId); },
            readUserIdentity() { return { name: 'Traveler', avatar: '' }; },
            readStoryTime() { return '2042-05-20 09:30'; },
            readStoryMessages() { return []; },
            readRawContext() { return { getRequestHeaders: () => ({}) }; },
        },
        stateStore,
        repository,
        cryptoApi: webcrypto,
        backend: { async generate() {}, async loadModels() { return []; } },
        projectionService: {
            async reconcileScope({ scopeId }) { reconciled.push(scopeId); return []; },
            async removeScopeProjections({ scopeId }) {
                removed.push(scopeId);
                return scopeId === pendingScopeId ? { status: 'pending' } : { status: 'removed' };
            },
        },
        worldbookGateway: { async getCurrentCharacterBookNames() { return { primary: '', additional: [] }; } },
    });

    await runtime.initialize();
    reconciled.length = 0;
    await repository.ensureScope(scopeB, factsByScopeId.get(scopeB));
    currentScopeId = scopeC;
    await runtime.handleChatChanged();
    assert.deepEqual([...removed].sort(), [scopeA, scopeB].sort());
    assert.deepEqual(reconciled, []);

    pendingScopeId = '';
    removed.length = 0;
    currentScopeId = scopeD;
    await runtime.handleChatChanged();
    assert.deepEqual([...removed].sort(), [scopeA, scopeB, scopeC].sort());
    assert.deepEqual(reconciled, [scopeD]);
    runtime.destroy();
}

async function testBatchInjectionReportsPendingWorldbookSyncAsFailure() {
    const {
        createMemoryQQV2StateStore,
    } = await importModule('modules/qq-v2/storage/state-store.js');
    const {
        createQQV2ProductionRuntime,
    } = await importModule('modules/qq-v2/application/production-runtime.js');
    const scopeId = 'st:character:alice:chat-injection-pending';
    const runtime = createQQV2ProductionRuntime({
        host: {
            readScope() {
                return {
                    scopeId,
                    chatId: 'chat-injection-pending',
                    chatFile: 'chat-injection-pending',
                    hostType: 'character',
                    hostId: 'alice',
                };
            },
            readUserIdentity() { return { name: 'Traveler', avatar: '' }; },
            readStoryTime() { return '2042-05-20 09:30'; },
            readStoryMessages() { return []; },
            readRawContext() { return { getRequestHeaders: () => ({}) }; },
        },
        stateStore: createMemoryQQV2StateStore(),
        cryptoApi: webcrypto,
        backend: { async generate() {}, async loadModels() { return []; } },
        projectionService: {
            async reconcileScope() { return []; },
            async setMessagesSelected() {
                return {
                    status: 'pending',
                    reason: 'projection-conflict',
                    code: 'worldbook_projection_conflict',
                    message: 'QQ 世界书存在重复新版投影，请手工删除到只剩一条后重试',
                };
            },
        },
    });
    await runtime.initialize();
    const privateChat = await runtime.createPrivateConversation({ scopeId, name: 'Alice' });

    assert.deepEqual(await runtime.getFacade().intent.setMessagesInjection({
        conversationId: privateChat.conversation.conversationId,
        messageIds: ['message-1'],
        selected: true,
    }), {
        ok: false,
        status: 'failed',
        error: {
            code: 'worldbook_projection_conflict',
            message: 'QQ 世界书存在重复新版投影，请手工删除到只剩一条后重试',
        },
    });

    runtime.destroy();
}

async function testProactiveWorldbookPendingIsReportedWithoutRollingBackCommittedActions() {
    const { createMemoryQQV2StateStore } = await importModule('modules/qq-v2/storage/state-store.js');
    const { createQQV2Repository } = await importModule('modules/qq-v2/domain/repository.js');
    const { createQQV2ProductionRuntime } = await importModule('modules/qq-v2/application/production-runtime.js');
    const scopeId = 'st:character:alice:chat-proactive-worldbook-pending';
    const conflictMessage = 'QQ 世界书存在重复新版投影，请手工删除到只剩一条后重试';
    const warnings = [];
    const stateStore = createMemoryQQV2StateStore();
    const repository = createQQV2Repository({ stateStore });
    let storyMessages = [];
    let proactiveResult = null;
    let proactiveConversationId = '';
    const runtime = createQQV2ProductionRuntime({
        host: {
            readScope() {
                return {
                    scopeId,
                    chatId: 'chat-proactive-worldbook-pending',
                    chatFile: 'chat-proactive-worldbook-pending',
                    hostType: 'character',
                    hostId: 'alice',
                };
            },
            readUserIdentity() { return { name: 'Traveler', avatar: '' }; },
            readStoryTime() { return '2042-05-20 09:30'; },
            readStoryMessages() { return storyMessages; },
            readRawContext() { return {}; },
        },
        stateStore,
        repository,
        cryptoApi: webcrypto,
        logger: {
            warn(entry) { warnings.push(entry); },
        },
        requestService: {
            handleScopeChanged() {},
            getConversationState() { return {}; },
            cancelConversation() {},
            cancelScope() {},
            async enqueueProactive(input) {
                proactiveResult = await input.execute({
                    scopeId: input.scopeId,
                    signal: new AbortController().signal,
                    isCurrent: () => true,
                });
                return { queued: true };
            },
            cancelProactive() { return 0; },
        },
        resources: {
            async getApiPresetForRequest(presetId) { return { presetId }; },
            async getPromptPreset(presetId) { return { presetId }; },
            async listStickers() { return []; },
        },
        backend: {
            async generate() {
                return { content: '<qq><message conversation="P1">主动消息已提交</message></qq>' };
            },
            async loadModels() { return []; },
        },
        actionService: {
            async execute({ scopeId: actionScopeId, storyTime, scopeSession }) {
                const conversation = await repository.getConversation(actionScopeId, proactiveConversationId);
                const [message] = await repository.appendMessages(actionScopeId, proactiveConversationId, [{
                    senderId: conversation.personId,
                    senderType: 'person',
                    type: 'text',
                    content: '主动消息已提交',
                    storyTime,
                }], { scopeSession });
                return {
                    applied: [{ type: 'message', messageId: message.messageId }],
                    createdConversationIds: [],
                };
            },
        },
        projectionService: {
            async reconcileScope() { return []; },
            async syncConversation() {
                return {
                    status: 'pending',
                    reason: 'projection-conflict',
                    code: 'worldbook_projection_conflict',
                    message: conflictMessage,
                };
            },
        },
        worldbookGateway: {
            async getCurrentCharacterBookNames() { return { primary: '', additional: [] }; },
        },
        worldbookContextResolver: {
            async resolve() { return ''; },
        },
        proactiveStorySettleDelayMs: 0,
    });

    await runtime.initialize();
    const privateChat = await runtime.createPrivateConversation({ scopeId, name: 'Alice' });
    proactiveConversationId = privateChat.conversation.conversationId;
    await runtime.updateGlobalSettings({
        scopeId,
        settings: {
            activeApiPresetId: 'api-1',
            proactive: { enabled: true, everyTurns: 1 },
        },
    });
    storyMessages = [{
        messageId: 'story-1',
        role: 'assistant',
        content: '正文回复',
        isHidden: false,
        isSystem: false,
    }];

    await runtime.handleMessageReceived('story-1', 'normal');

    assert.deepEqual(proactiveResult, { status: 'succeeded' });
    assert.equal(
        (await repository.listMessages(scopeId, privateChat.conversation.conversationId))
            .some((message) => message.content === '主动消息已提交'),
        true,
        '世界书投影 pending 不得回滚已经提交的主动 QQ 消息',
    );
    assert.deepEqual(warnings
        .filter((entry) => entry?.action === 'worldbook.projection.pending')
        .map((entry) => ({
        action: entry.action,
        errorCode: entry.errorCode,
        message: entry.message,
        scopeId: entry.context?.scopeId,
        conversationId: entry.context?.conversationId,
        })), [{
        action: 'worldbook.projection.pending',
        errorCode: 'worldbook_projection_conflict',
        message: conflictMessage,
        scopeId,
        conversationId: privateChat.conversation.conversationId,
    }]);

    runtime.destroy();
}

async function testRetryPendingWorldbookIncludesGroupConversations() {
    const { createMemoryQQV2StateStore } = await importModule('modules/qq-v2/storage/state-store.js');
    const { createQQV2Repository } = await importModule('modules/qq-v2/domain/repository.js');
    const { createQQV2ProductionRuntime } = await importModule('modules/qq-v2/application/production-runtime.js');
    const scopeId = 'st:character:alice:chat-group-worldbook-retry';
    const syncCalls = [];
    const stateStore = createMemoryQQV2StateStore();
    const repository = createQQV2Repository({ stateStore });
    const runtime = createQQV2ProductionRuntime({
        host: {
            readScope() {
                return {
                    scopeId,
                    chatId: 'chat-group-worldbook-retry',
                    chatFile: 'chat-group-worldbook-retry',
                    hostType: 'character',
                    hostId: 'alice',
                };
            },
            readUserIdentity() { return { name: 'Traveler', avatar: '' }; },
            readStoryTime() { return '2042-05-20 09:30'; },
            readStoryMessages() { return []; },
            readRawContext() { return {}; },
        },
        stateStore,
        repository,
        cryptoApi: webcrypto,
        backend: { async generate() {}, async loadModels() { return []; } },
        projectionService: {
            async reconcileScope() { return []; },
            async syncConversation(input) {
                syncCalls.push(input.conversationId);
                await repository.setConversationProjection(
                    input.scopeId,
                    input.conversationId,
                    { pending: false },
                    { scopeSession: input.scopeSession },
                );
                return { status: 'synced' };
            },
        },
        worldbookGateway: {
            async getCurrentCharacterBookNames() { return { primary: '', additional: [] }; },
        },
    });

    await runtime.initialize();
    const alice = await runtime.createPrivateConversation({ scopeId, name: 'Alice' });
    const bob = await runtime.createPrivateConversation({ scopeId, name: 'Bob' });
    const group = await repository.createGroupConversation(scopeId, {
        name: '测试群',
        memberIds: [alice.person.personId, bob.person.personId],
    });
    const groupConversationId = group.conversation.conversationId;
    await repository.setConversationProjection(scopeId, groupConversationId, { pending: true });

    const result = await runtime.retryPendingWorldbook({
        scopeId,
        userName: 'Traveler',
        storyTime: '2042-05-20 09:30',
    });

    assert.deepEqual(syncCalls, [groupConversationId]);
    assert.deepEqual(result, {
        syncedConversationIds: [groupConversationId],
        pendingConversationIds: [],
    });

    runtime.destroy();
}

async function main() {
    await testProductionRuntimeOwnsTheCurrentScopeAndFacade();
    await testProductionRuntimeCountsNewStoryRepliesPersistently();
    await testProductionRuntimeUsesReceivedTurnInsteadOfAbsoluteStoryFloor();
    await testProductionRuntimeIgnoresIneligibleAndDuplicateReceivedMessages();
    await testProductionRuntimeRetriesDueTurnAfterRequestQueueBecomesIdle();
    await testScopeTransitionCancelsPreviousScopeBeforeSlowInitialization();
    await testAbaStaleStorySessionCannotScheduleAsReenteredScope();
    await testProductionRuntimeKeepsWorldbookProjectionBeforeConversationDeletion();
    await testProductionRuntimeCancelsLateSaveAndCleansOldScopeThroughCurrentHostContext();
    await testDefaultRuntimeEntryExposesTheProductionFacade();
    await testProductionFacadeOwnsApiPresetLifecycleAcrossScopes();
    await testProductionRuntimeWorksWithoutWebCryptoAndKeepsKeysOutOfExports();
    await testProductionFacadeListsOnlyExistingWorldbooks();
    await testProductionRuntimeInitializesDefaultWorldbookOncePerScope();
    await testProductionRuntimeQueriesDoNotCreateOrThrowForAnUnseenScope();
    await testListWorldbooksWithoutReadyScopeDoesNotCreateScopeOrReachGateway();
    await testProductionFacadeBridgesPrivateProfilesMediaAndUnreadState();
    await testProductionRuntimeTracksUnreadOnlyForClosedConversations();
    await testOpenConversationDoesNotRestoreStaleOpenStateOrNotify();
    await testCloseConversationDoesNotClearReopenedStateAfterScopeAba();
    await testDeleteMessagesKeepsTheCallerProjectionSnapshot();
    await testDeleteMessagesStopsBeforeNotifyingWhenWorldbookSessionBecomesStale();
    await testDeleteMessagesStopsWhenCapturedScopeSessionBecomesStaleDuringAwait();
    await testDeleteConversationStopsBeforeLocalDeleteWhenCapturedScopeSessionBecomesStale();
    await testDeleteConversationStopsAfterCommittedDeleteWhenScopeBecomesStale();
    await testProductionFacadeOwnsRevocableMediaRenderLeases();
    await testProductionRuntimeExposesRetryableManualCancellation();
    await testSharedWorldbookConversationSyncIsSerial();
    await testPendingOldScopeCleanupBlocksNewScopeReconcile();
    await testBatchInjectionReportsPendingWorldbookSyncAsFailure();
    await testProactiveWorldbookPendingIsReportedWithoutRollingBackCommittedActions();
    await testRetryPendingWorldbookIncludesGroupConversations();
}

main().catch((error) => {
    console.error('[qq-v2-production-runtime-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
