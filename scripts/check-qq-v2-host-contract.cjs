const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    return import(`${href}?contract=${Date.now()}-${Math.random()}`);
}

function context(overrides = {}) {
    return {
        chatId: 'chat-a',
        chatFile: 'chat-a.jsonl',
        characterId: 'character-a',
        characters: [{ avatar: 'character-a.png', name: '角色 A' }],
        name1: '用户 A',
        user_avatar: 'user-a.png',
        chat: [],
        chatMetadata: {},
        ...overrides,
    };
}

function createEventSource() {
    const listeners = new Map();
    return {
        on(eventName, listener) {
            const registered = listeners.get(eventName) || new Set();
            registered.add(listener);
            listeners.set(eventName, registered);
        },
        removeListener(eventName, listener) {
            listeners.get(eventName)?.delete(listener);
        },
        emit(eventName, ...args) {
            for (const listener of listeners.get(eventName) || []) {
                listener(...args);
            }
        },
    };
}

function waitForAsyncEvents() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

async function testHostFactsAlwaysFollowCurrentContext() {
    const { createQQV2HostAdapter, QQV2HostError } = await importModule('modules/qq-v2/host/adapter.js');
    let current = context();
    const host = createQQV2HostAdapter({
        getContext: () => current,
        getStoryTime: () => '2042-05-01 09:30',
    });

    assert.deepEqual(host.readScope(), {
        scopeId: 'st:character:character-a:chat-a.jsonl',
        chatId: 'chat-a',
        chatFile: 'chat-a.jsonl',
        hostType: 'character',
        hostId: 'character-a',
    });
    assert.deepEqual(host.readUserIdentity(), {
        name: '用户 A',
        avatar: 'user-a.png',
    });
    assert.equal(host.readStoryTime(), '2042-05-01 09:30');

    current = context({
        chatId: 'chat-b',
        chatFile: 'chat-b.jsonl',
        groupId: 'group-b',
        characterId: '',
        name1: '用户 B',
        user_avatar: 'user-b.png',
    });

    assert.deepEqual(host.readScope(), {
        scopeId: 'st:group:group-b:chat-b.jsonl',
        chatId: 'chat-b',
        chatFile: 'chat-b.jsonl',
        hostType: 'group',
        hostId: 'group-b',
    });
    assert.deepEqual(host.readUserIdentity(), {
        name: '用户 B',
        avatar: 'user-b.png',
    });

    current = null;
    assert.throws(() => host.readScope(), QQV2HostError);
}

async function testChatIntegrityKeepsScopeStableAcrossFileRename() {
    const { createQQV2HostAdapter } = await importModule('modules/qq-v2/host/adapter.js');
    let current = context({
        chatFile: 'before-rename.jsonl',
        chatMetadata: { integrity: 'chat-integrity-a' },
    });
    const host = createQQV2HostAdapter({ getContext: () => current, getStoryTime: () => '' });

    const beforeRename = host.readScope();
    current = context({
        chatId: 'renamed-chat',
        chatFile: 'after-rename.jsonl',
        chatMetadata: { integrity: 'chat-integrity-a' },
    });
    const afterRename = host.readScope();

    assert.equal(beforeRename.scopeId, 'st:character:character-a:chat-integrity-a');
    assert.equal(afterRename.scopeId, beforeRename.scopeId);
    assert.equal(afterRename.chatFile, 'after-rename.jsonl');

    current = context({
        chatId: 'another-chat',
        chatFile: 'another-chat.jsonl',
        chatMetadata: { integrity: 'chat-integrity-b' },
    });
    assert.notEqual(host.readScope().scopeId, beforeRename.scopeId);
    assert.equal(host.readScope().scopeId, 'st:character:character-a:chat-integrity-b');
}

async function testHostReadsStoryTimeFromThePhoneStatusData() {
    const { createQQV2HostAdapter } = await importModule('modules/qq-v2/host/adapter.js');
    const statusData = { value: 'story-time-source' };
    const host = createQQV2HostAdapter({
        getContext: () => context(),
        getTableData: () => statusData,
        resolveStatusBarData: (rawData) => ({
            currentTime: rawData.value === 'story-time-source' ? '2042-05-01 09:30' : '',
        }),
    });

    assert.equal(host.readStoryTime(), '2042-05-01 09:30');

    const unavailable = createQQV2HostAdapter({
        getContext: () => context(),
        getTableData: () => null,
        resolveStatusBarData: () => ({}),
    });
    assert.equal(unavailable.readStoryTime(), '');
}

async function testHostListsCharacterChatFilesWithoutGuessingOnFailure() {
    const { createQQV2HostAdapter } = await importModule('modules/qq-v2/host/adapter.js');
    const requests = [];
    let response = {
        ok: true,
        async json() {
            return [
                { file_name: 'shared-name.jsonl' },
                { file_id: 'other-chat' },
                { file_name: 'shared-name.jsonl' },
            ];
        },
    };
    const host = createQQV2HostAdapter({
        getContext: () => context({
            getRequestHeaders: () => ({ 'X-CSRF-Token': 'token' }),
        }),
        getStoryTime: () => '',
        async fetchImpl(url, options) {
            requests.push([url, options]);
            return response;
        },
    });

    assert.deepEqual(await host.listCharacterChatFiles('character-a.png'), {
        status: 'resolved',
        hostId: 'character-a.png',
        chatFiles: ['shared-name', 'other-chat'],
    });
    assert.equal(requests[0][0], '/api/characters/chats');
    assert.deepEqual(requests[0][1], {
        method: 'POST',
        headers: { 'X-CSRF-Token': 'token' },
        body: JSON.stringify({ avatar_url: 'character-a.png', simple: true }),
    });

    response = { ok: false, status: 503 };
    assert.deepEqual(await host.listCharacterChatFiles('character-a.png'), {
        status: 'unresolved',
        hostId: 'character-a.png',
        reason: 'request-failed',
        httpStatus: 503,
    });
}

async function testRuntimeLifecycleDoesNotRetainOldScope() {
    const { createQQV2HostAdapter } = await importModule('modules/qq-v2/host/adapter.js');
    const { createQQV2Runtime } = await importModule('modules/qq-v2/runtime/runtime.js');
    let current = context();
    let readScopeCalls = 0;
    let destroyCalls = 0;
    const adapter = createQQV2HostAdapter({ getContext: () => current, getStoryTime: () => '' });
    const host = {
        ...adapter,
        readScope() {
            readScopeCalls += 1;
            return adapter.readScope();
        },
    };
    const transitions = [];
    const readySessions = [];
    const unavailableEvents = [];
    let destroyedDetails = null;
    let runtime;
    runtime = createQQV2Runtime({
        host,
        onScopeChanged(scope, generation, scopeSession, previousSession) {
            transitions.push({
                scope,
                generation,
                scopeSession,
                previousSession,
                previousAborted: previousSession?.signal.aborted ?? null,
                publishedScopeId: runtime.getActiveScope()?.scopeId || '',
                readyDuringTransition: scopeSession.isReady(),
            });
        },
        onScopeReady(scopeSession) {
            readySessions.push(scopeSession);
            assert.equal(scopeSession.isReady(), true);
        },
        onUnavailable(details) {
            unavailableEvents.push(details);
            assert.equal(details.previous?.signal.aborted, true);
        },
        onDestroy(details) {
            destroyCalls += 1;
            destroyedDetails = details;
        },
    });

    assert.equal(runtime.getStatus().phase, 'idle');
    assert.equal(await runtime.handleCharacterMessageRendered('before-init', 'normal'), null);
    assert.equal(await runtime.handleWorldInfoActivated([]), null);
    assert.equal(readScopeCalls, 0);

    await runtime.initialize();
    const firstSession = transitions[0].scopeSession;
    assert.deepEqual(runtime.getStatus(), {
        phase: 'ready',
        scopeId: 'st:character:character-a:chat-a.jsonl',
        worldbookScopeId: '',
        epoch: firstSession.generation,
    });
    assert.equal(firstSession.isReady(), true);
    assert.equal(transitions[0].readyDuringTransition, false);
    assert.equal(transitions[0].publishedScopeId, firstSession.scopeId);
    assert.equal(runtime.captureScopeSession(firstSession.scopeId), firstSession);
    assert.equal(runtime.captureScopeSession('missing-scope'), null);
    assert.equal(await runtime.runHostMutation(() => 'host-mutation'), 'host-mutation');

    current = context({
        chatId: 'chat-a-renamed',
        chatFile: 'chat-a.jsonl',
    });
    await runtime.handleChatChanged();
    const sameScopeSession = transitions[1].scopeSession;
    assert.equal(transitions.length, 2);
    assert.equal(sameScopeSession.scopeId, firstSession.scopeId);
    assert.equal(sameScopeSession.scope.chatId, 'chat-a-renamed');
    assert.equal(sameScopeSession.generation, firstSession.generation + 1);
    assert.notEqual(sameScopeSession, firstSession);
    assert.equal(transitions[1].previousAborted, true);
    assert.equal(transitions[1].previousSession, firstSession);
    assert.equal(transitions[1].readyDuringTransition, false);
    assert.equal(transitions[1].publishedScopeId, sameScopeSession.scopeId);
    assert.equal(firstSession.signal.aborted, true);
    assert.equal(firstSession.isCurrent(), false, 'same-scope refresh must not revive an aborted session');
    assert.equal(firstSession.isReady(), false);
    assert.equal(runtime.captureScopeSession(firstSession.scopeId), sameScopeSession);
    assert.equal(sameScopeSession.isReady(), true);
    assert.deepEqual(readySessions, [firstSession, sameScopeSession]);
    assert.equal(runtime.getActiveScope().chatId, 'chat-a-renamed');
    assert.equal(runtime.getStatus().epoch, sameScopeSession.generation);

    const worldbookFacts = await runtime.handleWorldInfoActivated([{ uid: 1, content: 'scope-a' }]);
    assert.equal(worldbookFacts.scopeSession, sameScopeSession);
    assert.equal(runtime.getWorldInfoLifecycle().scopeSession, sameScopeSession);

    current = context({
        chatId: 'chat-b',
        chatFile: 'chat-b.jsonl',
        groupId: 'group-b',
        characterId: '',
    });
    await runtime.handleChatChanged();
    const groupSession = transitions[2].scopeSession;
    assert.deepEqual(transitions.map(({ scope }) => scope.scopeId), [
        'st:character:character-a:chat-a.jsonl',
        'st:character:character-a:chat-a.jsonl',
        'st:group:group-b:chat-b.jsonl',
    ]);
    assert.equal(transitions[2].previousAborted, true);
    assert.equal(transitions[2].previousSession, sameScopeSession);
    assert.equal(transitions[2].readyDuringTransition, false);
    assert.equal(transitions[2].publishedScopeId, groupSession.scopeId);
    assert.equal(firstSession.signal.aborted, true);
    assert.equal(firstSession.isCurrent(), false);
    assert.equal(sameScopeSession.signal.aborted, true);
    assert.equal(sameScopeSession.isCurrent(), false);
    assert.equal(groupSession.isReady(), true);
    assert.deepEqual(readySessions, [firstSession, sameScopeSession, groupSession]);
    assert.equal(runtime.getWorldInfoLifecycle(), null);
    assert.equal(runtime.getStatus().epoch, groupSession.generation);

    runtime.destroy();
    runtime.destroy();
    assert.equal(groupSession.signal.aborted, true);
    assert.equal(groupSession.isCurrent(), false);
    assert.equal(runtime.getActiveScope(), null);
    assert.equal(runtime.getWorldInfoLifecycle(), null);
    assert.deepEqual(runtime.getStatus(), {
        phase: 'destroyed',
        scopeId: '',
        worldbookScopeId: '',
        epoch: groupSession.generation,
    });
    assert.equal(destroyCalls, 1);
    assert.equal(destroyedDetails.previous, groupSession);
    assert.deepEqual(unavailableEvents, []);
    await assert.rejects(runtime.initialize(), /不能再次初始化/);
    assert.equal(await runtime.handleChatChanged(), null);
}

async function testRuntimeEntryDeliversCurrentHostLifecycleFacts() {
    const { createQQV2HostAdapter } = await importModule('modules/qq-v2/host/adapter.js');
    const { createQQV2Runtime } = await importModule('modules/qq-v2/runtime/runtime.js');
    const { createQQV2RuntimeEntry } = await importModule('modules/qq-v2/runtime/default-runtime.js');
    let current = context({
        chat: [{ is_user: true, name: '用户 A', mes: '正文用户消息' }],
    });
    let readScopeCalls = 0;
    const adapter = createQQV2HostAdapter({
        getContext: () => current,
        getStoryTime: () => '2042-05-01 09:30',
    });
    const host = {
        ...adapter,
        readScope() {
            readScopeCalls += 1;
            return adapter.readScope();
        },
    };
    const scopeChanges = [];
    const scopeSessions = [];
    const characterEvents = [];
    const worldbookEvents = [];
    const entry = createQQV2RuntimeEntry({
        createHostAdapter: () => host,
        createRuntime: (options) => createQQV2Runtime({
            ...options,
            onScopeChanged(scope, _generation, scopeSession) {
                scopeChanges.push(scope.scopeId);
                scopeSessions.push(scopeSession);
            },
            onCharacterMessageRendered: (facts) => characterEvents.push(facts),
            onWorldInfoActivated: (facts) => worldbookEvents.push(facts.entries.map((entry) => entry.uid)),
        }),
    });

    await entry.initialize();
    await entry.initialize();
    assert.deepEqual(scopeChanges, [
        'st:character:character-a:chat-a.jsonl',
        'st:character:character-a:chat-a.jsonl',
    ]);
    assert.equal(readScopeCalls, 2);
    const firstSession = scopeSessions[0];
    const sameScopeSession = scopeSessions[1];
    assert.notEqual(sameScopeSession, firstSession);
    assert.equal(sameScopeSession.generation, firstSession.generation + 1);
    assert.equal(firstSession.signal.aborted, true);
    assert.equal(firstSession.isCurrent(), false, 'a repeated initialize must not revive its first scope session');
    assert.equal(sameScopeSession.isReady(), true);

    const characterFacts = await entry.handleCharacterMessageRendered('message-1', 'normal');
    assert.equal(characterFacts.scope.scopeId, 'st:character:character-a:chat-a.jsonl');
    assert.equal(characterFacts.scopeSession, sameScopeSession);
    assert.equal(characterFacts.generationType, 'normal');
    assert.equal(characterFacts.storyTime, '2042-05-01 09:30');
    assert.equal(characterFacts.storyMessages[0].content, '正文用户消息');
    assert.equal(characterEvents[0], characterFacts);
    assert.equal(readScopeCalls, 2, '正文事件不应刷新 host scope');

    const worldbookFacts = await entry.handleWorldInfoActivated({
        allActivatedEntries: [{ uid: 7, content: '当前正文世界书' }],
    });
    assert.equal(worldbookFacts.scopeSession, sameScopeSession);
    assert.deepEqual(worldbookFacts.entries, [{ uid: 7, content: '当前正文世界书' }]);
    assert.deepEqual(worldbookEvents, [[7]]);
    assert.deepEqual(entry.getWorldInfoLifecycle().entries, [{ uid: 7, content: '当前正文世界书' }]);
    assert.equal(entry.getWorldInfoLifecycle().scopeSession, sameScopeSession);
    assert.equal(readScopeCalls, 2, '世界书事件不应刷新 host scope');

    current = context({
        chatId: 'chat-b',
        chatFile: 'chat-b.jsonl',
        groupId: 'group-b',
        characterId: '',
    });
    const beforeChatChanged = await entry.handleCharacterMessageRendered('message-before-switch', 'normal');
    assert.equal(beforeChatChanged.scopeSession, sameScopeSession);
    assert.equal(readScopeCalls, 2);

    await entry.handleChatChanged();
    const groupSession = scopeSessions[2];
    assert.equal(readScopeCalls, 3);
    assert.equal(firstSession.signal.aborted, true);
    assert.equal(sameScopeSession.signal.aborted, true);
    assert.equal(groupSession.scopeId, 'st:group:group-b:chat-b.jsonl');
    assert.equal(entry.getStatus().epoch, groupSession.generation);
    assert.equal(entry.getWorldInfoLifecycle(), null);
    assert.deepEqual(scopeChanges, [
        'st:character:character-a:chat-a.jsonl',
        'st:character:character-a:chat-a.jsonl',
        'st:group:group-b:chat-b.jsonl',
    ]);

    entry.destroy();
    assert.equal(groupSession.signal.aborted, true);
    assert.equal(entry.getStatus().phase, 'idle');
    await entry.initialize();
    assert.equal(entry.getStatus().phase, 'ready');
    assert.equal(scopeChanges.at(-1), 'st:group:group-b:chat-b.jsonl');
}

async function testBootstrapAndExtensionWireQQV2Events() {
    const originalWindow = global.window;
    const originalDocument = global.document;
    const eventSource = createEventSource();
    const calls = [];
    global.window = { eventSource, event_types: {} };
    global.document = { getElementById: () => null };

    try {
        const { registerPhoneEventListeners } = await importModule('modules/bootstrap/event-registry.js');
        await registerPhoneEventListeners({
            onQQV2ChatChanged: (chatId) => calls.push(['chat', chatId]),
            onQQV2CharacterMessageRendered: (messageId, generationType) => calls.push([
                'character',
                messageId,
                generationType,
            ]),
            onQQV2WorldInfoActivated: (entries) => calls.push(['worldbook', entries]),
        });

        const entries = [{ uid: 7, content: '正文激活条目' }];
        eventSource.emit('chat_id_changed', 'chat-v2');
        eventSource.emit('character_message_rendered', 'message-v2', 'normal');
        eventSource.emit('world_info_activated', entries);
        await waitForAsyncEvents();

        assert.deepEqual(calls, [
            ['chat', 'chat-v2'],
            ['character', 'message-v2', 'normal'],
            ['worldbook', entries],
        ]);

        const indexSource = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
        const runtimeSource = fs.readFileSync(path.join(ROOT, 'modules/qq-v2/runtime/default-runtime.js'), 'utf8');
        assert.match(indexSource, /from '\.\/modules\/qq-v2\/runtime\/default-runtime\.js';/);
        assert.match(indexSource, /await initializeQQV2Runtime\(\);/);
        assert.match(indexSource, /destroyQQV2Runtime\(\);/);
        assert.match(indexSource, /requestCurrentPhoneRouteRender/);
        assert.match(indexSource, /async function handleQQV2ChatChangedAndRefreshRoute\(chatId\)/);
        assert.match(indexSource, /const scope = await handleQQV2ChatChanged\(chatId\);/);
        assert.match(indexSource, /if \(!scope\?\.scopeId \|\| isDestroying \|\| !isPhoneVisibleForHomeRefresh\(\)\) return scope;/);
        assert.match(indexSource, /if \(route !== 'qq' && !route\.startsWith\('qq:'\)\) return scope;/);
        assert.match(indexSource, /await requestCurrentPhoneRouteRender\(\{ reason: 'qq-chat-changed' \}\);/);
        assert.match(indexSource, /onQQV2ChatChanged: handleQQV2ChatChangedAndRefreshRoute/);
        assert.match(indexSource, /onQQV2CharacterMessageRendered: handleQQV2CharacterMessageRendered/);
        assert.match(indexSource, /onQQV2WorldInfoActivated: handleQQV2WorldInfoActivated/);
        assert.doesNotMatch(runtimeSource, /modules\/qq\//);
    } finally {
        if (originalWindow === undefined) delete global.window;
        else global.window = originalWindow;
        if (originalDocument === undefined) delete global.document;
        else global.document = originalDocument;
    }
}

async function testDefaultRuntimeExposesAndRecoversFromHostUnavailability() {
    const originalGetContext = global.getContext;
    let current = context();
    let runtime = null;
    global.getContext = () => current;

    try {
        runtime = await importModule('modules/qq-v2/runtime/default-runtime.js');
        await runtime.initializeQQV2Runtime();
        assert.equal(runtime.getQQV2RuntimeStatus().phase, 'ready');

        current = null;
        assert.equal(await runtime.handleQQV2ChatChanged(), null);
        assert.deepEqual(runtime.getQQV2RuntimeStatus(), {
            phase: 'unavailable',
            scopeId: '',
            worldbookScopeId: '',
            epoch: 1,
            errorCode: 'host_unavailable',
        });

        current = context({
            chatId: 'chat-recovered',
            chatFile: 'chat-recovered.jsonl',
            groupId: 'group-recovered',
            characterId: '',
        });
        const scope = await runtime.handleQQV2ChatChanged();
        assert.equal(scope.scopeId, 'st:group:group-recovered:chat-recovered.jsonl');
        assert.equal(runtime.getQQV2RuntimeStatus().phase, 'ready');
        assert.equal(runtime.getQQV2RuntimeStatus().epoch, 2);
    } finally {
        runtime?.destroyQQV2Runtime();
        if (originalGetContext === undefined) delete global.getContext;
        else global.getContext = originalGetContext;
    }
}

async function main() {
    await testHostFactsAlwaysFollowCurrentContext();
    await testChatIntegrityKeepsScopeStableAcrossFileRename();
    await testHostReadsStoryTimeFromThePhoneStatusData();
    await testHostListsCharacterChatFilesWithoutGuessingOnFailure();
    await testRuntimeLifecycleDoesNotRetainOldScope();
    await testRuntimeEntryDeliversCurrentHostLifecycleFacts();
    await testBootstrapAndExtensionWireQQV2Events();
    await testDefaultRuntimeExposesAndRecoversFromHostUnavailability();
    console.log('[qq-v2-host-contract] passed');
}

main().catch((error) => {
    console.error('[qq-v2-host-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
