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
        worldbookContextGateway: {
            async runDryRun() {
                return [];
            },
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
            proactive: { enabled: false, everyTurns: 5, count: 0, nextKind: 'private' },
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
            proactive: { enabled: false, everyTurns: 5, count: 0, nextKind: 'private' },
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
    await repository.consumeProactiveStoryReply(scopeA, { enabled: true, everyTurns: 3 });

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
        count: 1,
        nextKind: 'private',
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
        count: 0,
        nextKind: 'private',
    });
    assert.equal((await runtime.listConversations({ scopeId: currentScopeId })).length, 0);

    assert.equal((await facade.intent.updateGlobalSettings({
        settings: { worldbook: { bookName: 'Bea-manual-book' } },
    })).ok, true);
    await repository.consumeProactiveStoryReply(scopeB, { enabled: true, everyTurns: 3 });
    await repository.consumeProactiveStoryReply(scopeB, { enabled: true, everyTurns: 3 });
    await repository.consumeProactiveStoryReply(scopeB, { enabled: true, everyTurns: 3 });
    const scopeBManualSnapshot = await runtime.getSnapshot();
    assert.equal(scopeBManualSnapshot.globalSettings.worldbook.bookName, 'Bea-manual-book');
    assert.deepEqual(scopeBManualSnapshot.globalSettings.proactive, {
        enabled: true,
        everyTurns: 3,
        count: 0,
        nextKind: 'group',
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
        count: 1,
        nextKind: 'private',
    });

    runtime.destroy();
    assert.equal((await runtime.getSnapshot()).phase, 'destroyed');
}

async function testProductionWorldbookScanUsesScenarioSpecificHistoryWindows() {
    const {
        createMemoryQQV2StateStore,
    } = await importModule('modules/qq-v2/storage/state-store.js');
    const {
        createQQV2Repository,
    } = await importModule('modules/qq-v2/domain/repository.js');
    const {
        createQQV2ProductionRuntime,
    } = await importModule('modules/qq-v2/application/production-runtime.js');
    const scopeId = 'st:character:alice:chat-worldbook-scan-windows';
    const stateStore = createMemoryQQV2StateStore();
    const repository = createQQV2Repository({ stateStore });
    const storyMessages = [{
        messageId: 'story-1',
        role: 'assistant',
        content: 'Story reply that starts the proactive cycle',
        isHidden: false,
        isSystem: false,
    }];
    const scanCalls = [];
    const runtime = createQQV2ProductionRuntime({
        host: {
            readScope() {
                return {
                    scopeId,
                    chatId: 'chat-worldbook-scan-windows',
                    chatFile: 'chat-worldbook-scan-windows',
                    hostType: 'character',
                    hostId: 'alice',
                };
            },
            readUserIdentity() { return { name: 'Traveler', avatar: '' }; },
            readStoryTime() { return '2042-05-20 09:30'; },
            readStoryMessages() { return storyMessages; },
            readRawContext() { return { getRequestHeaders: () => ({}) }; },
        },
        stateStore,
        repository,
        cryptoApi: webcrypto,
        backend: {
            async generate() { return { content: '<qq><ignored /></qq>' }; },
            async loadModels() { return []; },
        },
        actionService: {
            async execute() { return { applied: [], createdConversationIds: [] }; },
        },
        projectionService: {
            async reconcileScope() { return []; },
            async retryPending() {},
            async syncConversation() { return { status: 'empty' }; },
        },
        worldbookGateway: {
            async getCurrentCharacterBookNames() { return { primary: '', additional: [] }; },
        },
        worldbookContextGateway: {
            async runDryRun(input) {
                scanCalls.push(input);
                return [];
            },
        },
    });

    await runtime.initialize();
    const alice = await runtime.createPrivateConversation({ scopeId, name: 'Alice' });
    const bob = await runtime.createPrivateConversation({ scopeId, name: 'Bob' });
    await repository.appendMessages(scopeId, alice.conversation.conversationId, Array.from({ length: 11 }, (_, index) => ({
        senderId: alice.person.personId,
        senderType: 'person',
        type: 'text',
        content: `alice-${index + 1}`,
        storyTime: '2042-05-20 09:20',
    })));
    await repository.appendMessages(scopeId, bob.conversation.conversationId, Array.from({ length: 5 }, (_, index) => ({
        senderId: bob.person.personId,
        senderType: 'person',
        type: 'text',
        content: `bob-${index + 1}`,
        storyTime: '2042-05-20 09:20',
    })));
    await runtime.handleWorldInfoActivated([]);
    const apiPreset = await runtime.saveApiPreset({ preset: {
        name: 'Worldbook scan API',
        endpoint: 'https://api.example.test/v1',
        apiKey: 'worldbook-scan-secret',
        model: 'worldbook-scan-model',
    } });
    await runtime.updateGlobalSettings({
        scopeId,
        settings: {
            activeApiPresetId: apiPreset.id,
            conversationHistoryLimit: 4,
        },
    });

    await runtime.sendManual({
        scopeId,
        conversationId: alice.conversation.conversationId,
        message: { type: 'text', content: 'manual-current' },
    });
    await waitUntil(() => scanCalls.length === 1, 'the private reply worldbook scan');
    assert.deepEqual({
        layer: scanCalls[0].layer,
        people: scanCalls[0].people,
        history: scanCalls[0].history,
    }, {
        layer: 'person',
        people: ['Alice'],
        history: [
            'alice-3',
            'alice-4',
            'alice-5',
            'alice-6',
            'alice-7',
            'alice-8',
            'alice-9',
            'alice-10',
            'alice-11',
            'manual-current',
        ],
    });
    assert.equal(scanCalls[0].scopeId, scopeId);
    assert.equal(scanCalls[0].scopeSession.scopeId, scopeId);
    assert.equal(scanCalls[0].scopeSession.isReady(), true);

    await runtime.configureProactive({ scopeId, settings: { enabled: true, everyTurns: 1 } });
    await runtime.handleCharacterMessageRendered('story-1', 'normal');
    await waitUntil(() => scanCalls.length === 2, 'the private proactive worldbook scan');
    assert.deepEqual({
        layer: scanCalls[1].layer,
        people: scanCalls[1].people,
        history: scanCalls[1].history,
    }, {
        layer: 'person',
        people: ['Alice', 'Bob'],
        history: [
            'alice-10',
            'alice-11',
            'manual-current',
            'bob-3',
            'bob-4',
            'bob-5',
        ],
    });
    assert.equal(scanCalls[1].scopeId, scopeId);
    assert.strictEqual(scanCalls[1].scopeSession, scanCalls[0].scopeSession);
    runtime.destroy();
}

async function testProductionRuntimeCountsOnlyOneEligibleNormalStoryReply() {
    const {
        createMemoryQQV2StateStore,
    } = await importModule('modules/qq-v2/storage/state-store.js');
    const {
        createQQV2ProductionRuntime,
    } = await importModule('modules/qq-v2/application/production-runtime.js');

    let storyMessages = [{
        messageId: 0,
        role: 'assistant',
        content: '第一条正文回复',
        isHidden: false,
        isSystem: false,
    }];
    const counted = [];
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
    const runtime = createQQV2ProductionRuntime({
        host,
        stateStore: createMemoryQQV2StateStore(),
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
                return { enabled: false, everyTurns: 5, count: 0, nextKind: 'private' };
            },
            async recordSuccessfulStoryReply(input) {
                counted.push(input);
                return { counted: true, triggered: false };
            },
        },
    });

    await runtime.initialize();
    await runtime.handleCharacterMessageRendered(0, 'first_message');
    await runtime.handleCharacterMessageRendered(0, 'normal');
    await runtime.handleCharacterMessageRendered(0, 'normal');
    storyMessages = [...storyMessages, {
        messageId: 1,
        role: 'assistant',
        content: '滑动生成的替代文本',
        isHidden: false,
        isSystem: false,
    }];
    await runtime.handleCharacterMessageRendered(1, 'swipe');

    assert.equal(counted.length, 1);
    assert.deepEqual({
        scopeId: counted[0].scopeId,
        message: counted[0].message,
    }, {
        scopeId: 'st:character:alice:chat-events',
        message: storyMessages[0],
    });
    assert.equal(counted[0].scopeSession.scopeId, 'st:character:alice:chat-events');
    assert.equal(counted[0].scopeSession.isReady(), true);
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
            async getState() { return { enabled: false, everyTurns: 5, count: 0, nextKind: 'private' }; },
            async recordSuccessfulStoryReply() {},
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
        worldbookContextGateway: { async runDryRun() { return []; } },
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

async function testAbaStaleStorySessionCannotBeCountedAsReenteredScope() {
    const { createMemoryQQV2StateStore } = await importModule('modules/qq-v2/storage/state-store.js');
    const { createQQV2ProductionRuntime } = await importModule('modules/qq-v2/application/production-runtime.js');
    const scopeA = 'st:character:alice:chat-story-a';
    const scopeB = 'st:character:alice:chat-story-b';
    let currentScopeId = scopeA;
    const staleCounterStarted = deferred();
    const releaseStaleCounter = deferred();
    const received = [];
    const counted = [];
    const runtime = createQQV2ProductionRuntime({
        host: {
            readScope() { return { scopeId: currentScopeId, chatId: currentScopeId, chatFile: currentScopeId, hostType: 'character', hostId: 'alice' }; },
            readUserIdentity() { return { name: 'Traveler', avatar: '' }; },
            readStoryTime() { return ''; },
            readStoryMessages() { return [{ messageId: 0, role: 'assistant', content: 'reply', isHidden: false, isSystem: false }]; },
            readRawContext() { return {}; },
        },
        stateStore: createMemoryQQV2StateStore(),
        requestService: { cancelScope() {}, getConversationState() { return {}; }, cancelConversation() {} },
        proactiveService: {
            cancelScope() {},
            async getState() { return { enabled: false, everyTurns: 5, count: 0, nextKind: 'private' }; },
            async recordSuccessfulStoryReply(input) {
                received.push(input);
                if (received.length === 1) {
                    staleCounterStarted.resolve();
                    await releaseStaleCounter.promise;
                }
                if (input.scopeSession.isReady()) counted.push(input);
            },
        },
        projectionService: { async retryPending() {}, async syncConversation() {} },
        worldbookContextGateway: { async runDryRun() { return []; } },
    });
    await runtime.initialize();

    const staleEvent = runtime.handleCharacterMessageRendered(0, 'normal');
    await staleCounterStarted.promise;
    const staleSession = received[0].scopeSession;

    currentScopeId = scopeB;
    await runtime.handleChatChanged();
    currentScopeId = scopeA;
    await runtime.handleChatChanged();

    releaseStaleCounter.resolve();
    await staleEvent;
    assert.equal(counted.length, 0);
    assert.equal(staleSession.scopeId, scopeA);
    assert.equal(staleSession.isCurrent(), false);
    assert.equal(staleSession.isReady(), false);

    await runtime.handleCharacterMessageRendered(0, 'normal');
    assert.equal(received.length, 2);
    assert.equal(counted.length, 1);
    assert.strictEqual(counted[0], received[1]);
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
        worldbookContextGateway: {
            async runDryRun() {
                return [];
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
        worldbookContextGateway: { async runDryRun() { return []; } },
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
            worldbookContextGateway: { async runDryRun() { return []; } },
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
        worldbookContextGateway: { async runDryRun() { return []; } },
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
        worldbookContextGateway: { async runDryRun() { return []; } },
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
        worldbookContextGateway: { async runDryRun() { return []; } },
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
        worldbookContextGateway: { async runDryRun() { return []; } },
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
        worldbookContextGateway: { async runDryRun() { return []; } },
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
        worldbookContextGateway: { async runDryRun() { return []; } },
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
        worldbookContextGateway: { async runDryRun() { return []; } },
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
        worldbookContextGateway: { async runDryRun() { return []; } },
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
        proactiveService: { cancelScope() {}, async getState() { return { enabled: false, everyTurns: 5, count: 0, nextKind: 'private' }; } },
        projectionService: { async retryPending() {}, async syncConversation() {} },
        worldbookGateway: { async getCurrentCharacterBookNames() { return { primary: '', additional: [] }; } },
        worldbookContextGateway: { async runDryRun() { return []; } },
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
        proactiveService: { cancelScope() {}, async getState() { return { enabled: false, everyTurns: 5, count: 0, nextKind: 'private' }; } },
        projectionService: { async retryPending() {}, async syncConversation() {} },
        worldbookGateway: { async getCurrentCharacterBookNames() { return { primary: '', additional: [] }; } },
        worldbookContextGateway: { async runDryRun() { return []; } },
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
        worldbookContextGateway: { async runDryRun() { return []; } },
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
            async getState() { return { enabled: false, everyTurns: 5, count: 0, nextKind: 'private' }; },
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
        worldbookContextGateway: { async runDryRun() { return []; } },
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
            async getState() { return { enabled: false, everyTurns: 5, count: 0, nextKind: 'private' }; },
        },
        projectionService: { async retryPending() {}, async syncConversation() {} },
        worldbookGateway: { async getCurrentCharacterBookNames() { return { primary: '', additional: [] }; } },
        worldbookContextGateway: { async runDryRun() { return []; } },
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
            async getState() { return { enabled: false, everyTurns: 5, count: 0, nextKind: 'private' }; },
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
        worldbookContextGateway: { async runDryRun() { return []; } },
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
            async getState() { return { enabled: false, everyTurns: 5, count: 0, nextKind: 'private' }; },
        },
        projectionService: {
            async retryPending() {},
            async syncConversation() {},
            async removeConversationProjection() { return { status: 'removed' }; },
        },
        worldbookGateway: { async getCurrentCharacterBookNames() { return { primary: '', additional: [] }; } },
        worldbookContextGateway: { async runDryRun() { return []; } },
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
        worldbookContextGateway: { async runDryRun() { return []; } },
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
            async getState() { return { enabled: false, everyTurns: 5, count: 0, nextKind: 'private' }; },
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
        worldbookContextGateway: { async runDryRun() { return []; } },
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
        worldbookContextGateway: { async runDryRun() { return []; } },
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
            async setMessagesSelected() { return { status: 'pending' }; },
        },
        worldbookContextGateway: { async runDryRun() { return []; } },
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
            code: 'worldbook_sync_pending',
            message: 'QQ 世界书同步失败，请稍后重试',
        },
    });

    runtime.destroy();
}

async function main() {
    await testProductionRuntimeOwnsTheCurrentScopeAndFacade();
    await testProductionWorldbookScanUsesScenarioSpecificHistoryWindows();
    await testProductionRuntimeCountsOnlyOneEligibleNormalStoryReply();
    await testScopeTransitionCancelsPreviousScopeBeforeSlowInitialization();
    await testAbaStaleStorySessionCannotBeCountedAsReenteredScope();
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
}

main().catch((error) => {
    console.error('[qq-v2-production-runtime-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
