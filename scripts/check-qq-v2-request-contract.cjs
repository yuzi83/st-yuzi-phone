const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

async function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    const imported = await import(`${href}?contract=${Date.now()}-${Math.random()}`);
    if (relativePath !== 'modules/qq-v2/request/service.js') return imported;
    return {
        ...imported,
        createQQV2RequestService(options = {}) {
            return imported.createQQV2RequestService({
                captureScopeSession: captureReadyScopeSession,
                ...options,
            });
        },
    };
}

async function testQQV2BackendRouterSelectsDatabaseVirtualPreset() {
    const { createQQV2BackendRouter } = await importModule('modules/qq-v2/request/database-current-api-backend.js');
    const calls = [];
    const router = createQQV2BackendRouter({
        primaryBackend: {
            async generate() {
                calls.push('primary');
                return { content: 'primary' };
            },
            async loadModels() {
                return ['primary-model'];
            },
        },
        databaseBackend: {
            async generate() {
                calls.push('database');
                return { content: 'database' };
            },
        },
    });

    assert.deepEqual(await router.generate({ preset: { id: 'qq-v2.database-current-api' } }), { content: 'database' });
    assert.deepEqual(await router.generate({ preset: { id: 'ordinary-api' } }), { content: 'primary' });
    assert.deepEqual(await router.loadModels({ preset: { id: 'ordinary-api' } }), ['primary-model']);
    assert.deepEqual(calls, ['database', 'primary']);
}

async function testDatabaseCurrentApiBackendUsesRestrictedCallAI() {
    const { createQQV2DatabaseCurrentApiBackend } = await importModule('modules/qq-v2/request/database-current-api-backend.js');
    const calls = [];
    const databaseApi = {
        async callAI(...args) {
            calls.push({ receiver: this, args });
            return '  <qq><none /></qq>  ';
        },
    };
    const backend = createQQV2DatabaseCurrentApiBackend({
        getDatabaseApi: () => databaseApi,
    });
    const messages = [{ role: 'system', content: 'reply with XML' }];

    const result = await backend.generate({
        preset: {
            id: 'qq-v2.database-current-api',
            endpoint: 'https://must-not-be-read.example/v1',
            apiKey: 'must-not-be-read',
            model: 'must-not-be-read',
        },
        messages,
    });

    assert.deepEqual(result, {
        content: '<qq><none /></qq>',
        model: '',
        finishReason: '',
    });
    assert.equal(calls.length, 1);
    assert.strictEqual(calls[0].receiver, databaseApi);
    assert.deepEqual(calls[0].args, [messages]);
}

async function testBackendProxyUsesSillyTavernAndRedactsTheKey() {
    const { createSillyTavernQQV2Backend } = await importModule('modules/qq-v2/request/backend-proxy.js');
    const calls = [];
    const debugEvents = [];
    const observedPrompts = [];
    const callOrder = [];
    const signal = new AbortController().signal;
    const backend = createSillyTavernQQV2Backend({
        fetchImpl: async (url, options) => {
            callOrder.push('fetch');
            calls.push({ url, options });
            return {
                ok: true,
                status: 200,
                async json() {
                    return {
                        model: 'reply-model',
                        choices: [{ message: { content: '<qq><none /></qq>' }, finish_reason: 'stop' }],
                    };
                },
            };
        },
        // SillyTavern may resolve request headers asynchronously. QQ must wait
        // for them instead of spreading a Promise into the request options.
        getRequestHeaders: async () => ({ 'X-CSRF-Token': 'csrf-token' }),
        logger: { debug: (event) => debugEvents.push(event) },
        onPromptReady: (prompt) => {
            callOrder.push('observer');
            observedPrompts.push(prompt);
            prompt.messages[0].content = 'mutated by observer';
            throw new Error('viewer unavailable');
        },
    });

    const result = await backend.generate({
        preset: {
            endpoint: 'http://192.168.1.50:8000/v1/chat/completions',
            apiKey: 'qq-v2-test-secret',
            model: 'test-model',
            temperature: 0.7,
            maxOutput: 777,
        },
        messages: [{ role: 'system', content: 'reply with XML' }],
        signal,
    });

    assert.deepEqual(result, {
        content: '<qq><none /></qq>',
        model: 'reply-model',
        finishReason: 'stop',
    });
    assert.equal(calls.length, 1);
    assert.deepEqual(callOrder, ['observer', 'fetch']);
    assert.equal(calls[0].url, '/api/backends/chat-completions/generate');
    assert.equal(calls[0].options.signal, signal);
    assert.deepEqual(calls[0].options.headers, {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'csrf-token',
    });
    const body = JSON.parse(calls[0].options.body);
    assert.deepEqual(body, {
        chat_completion_source: 'openai',
        reverse_proxy: 'http://192.168.1.50:8000/v1',
        proxy_password: 'qq-v2-test-secret',
        model: 'test-model',
        messages: [{ role: 'system', content: 'reply with XML' }],
        temperature: 0.7,
        max_tokens: 777,
        stream: false,
    });
    assert.equal(debugEvents.length, 1);
    assert.doesNotMatch(JSON.stringify(debugEvents[0]), /qq-v2-test-secret|proxy_password/i);
    assert.deepEqual(observedPrompts, [{
        model: 'test-model',
        messages: [{ role: 'system', content: 'mutated by observer' }],
    }]);
    assert.deepEqual(Object.keys(observedPrompts[0]).sort(), ['messages', 'model']);
    assert.doesNotMatch(JSON.stringify(observedPrompts[0]), /qq-v2-test-secret|proxy_password|reverse_proxy/i);
    assert.equal(body.messages[0].content, 'reply with XML');
}

async function testBackendProxyRejectsPublicHttpBeforeSending() {
    const { createSillyTavernQQV2Backend } = await importModule('modules/qq-v2/request/backend-proxy.js');
    let fetchCount = 0;
    const backend = createSillyTavernQQV2Backend({
        fetchImpl: async () => {
            fetchCount += 1;
            throw new Error('fetch should not run');
        },
    });

    await assert.rejects(
        backend.generate({
            preset: {
                endpoint: 'http://api.example.test/v1',
                apiKey: 'public-http-key',
                model: 'test-model',
            },
            messages: [{ role: 'user', content: 'reply with XML' }],
        }),
        (error) => error?.code === 'invalid_endpoint',
    );
    assert.equal(fetchCount, 0);
}

async function testBackendProxyLoadsModelsWithoutModelAndParsesCommonShapes() {
    const { createSillyTavernQQV2Backend } = await importModule('modules/qq-v2/request/backend-proxy.js');
    const cases = [
        {
            response: { models: [{ id: 'models-a' }, 'models-b', '', { id: 'models-a' }] },
            expected: ['models-a', 'models-b'],
        },
        {
            response: { data: ['data-a', { id: 'data-b' }, 'data-a'] },
            expected: ['data-a', 'data-b'],
        },
        {
            response: [{ id: 'top-a' }, 'top-b', { id: '' }, 'top-a'],
            expected: ['top-a', 'top-b'],
        },
    ];

    for (const { response, expected } of cases) {
        const calls = [];
        const backend = createSillyTavernQQV2Backend({
            fetchImpl: async (url, options) => {
                calls.push({ url, options });
                return {
                    ok: true,
                    status: 200,
                    async json() { return response; },
                };
            },
            getRequestHeaders: () => ({}),
        });

        assert.deepEqual(await backend.loadModels({
            preset: {
                endpoint: 'https://api.example.test/v1',
                apiKey: 'model-list-secret',
            },
        }), expected);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].url, '/api/backends/chat-completions/status');
        assert.deepEqual(JSON.parse(calls[0].options.body), {
            chat_completion_source: 'openai',
            reverse_proxy: 'https://api.example.test/v1',
            proxy_password: 'model-list-secret',
        });
    }
}

async function testFinalPromptViewerBridgePostsOnlyThePromptSnapshot() {
    const { observeFinalPromptForViewer } = await importModule('modules/integration/final-prompt-viewer-bridge.js');
    const originalWindow = globalThis.window;
    const posted = [];
    globalThis.window = {
        location: { origin: 'https://tavern.example.test' },
        postMessage(message, targetOrigin) {
            posted.push({ message, targetOrigin });
        },
    };
    try {
        observeFinalPromptForViewer({
            model: 42,
            messages: [
                { role: 'user', content: 'hello', secret: 'drop-me' },
                { role: 'assistant', content: 7 },
            ],
            proxy_password: 'must-not-leak',
        });
        assert.deepEqual(posted, [{
            message: {
                _fpv: true,
                model: '42',
                messages: [{ role: 'user', content: 'hello' }],
            },
            targetOrigin: 'https://tavern.example.test',
        }]);

        let blockedPosts = 0;
        globalThis.window = { location: { origin: 'null' }, postMessage() { blockedPosts += 1; } };
        assert.doesNotThrow(() => observeFinalPromptForViewer({ model: 'x', messages: [{ role: 'user', content: 'x' }] }));
        globalThis.window = { location: { origin: 'not-an-origin' }, postMessage() { blockedPosts += 1; } };
        assert.doesNotThrow(() => observeFinalPromptForViewer({ model: 'x', messages: [{ role: 'user', content: 'x' }] }));
        assert.equal(blockedPosts, 0);
        const attemptedOrigins = [];
        globalThis.window = {
            location: { origin: 'https://tavern.example.test' },
            postMessage(_message, targetOrigin) {
                attemptedOrigins.push(targetOrigin);
                throw new Error('host unavailable');
            },
        };
        assert.doesNotThrow(() => observeFinalPromptForViewer({ model: 'x', messages: [{ role: 'user', content: 'x' }] }));
        assert.deepEqual(attemptedOrigins, ['https://tavern.example.test']);
        let emptyMessagePosts = 0;
        globalThis.window = { location: { origin: 'https://tavern.example.test' }, postMessage() { emptyMessagePosts += 1; } };
        observeFinalPromptForViewer({ model: 'x', messages: [] });
        assert.equal(emptyMessagePosts, 0);
        delete globalThis.window;
        assert.doesNotThrow(() => observeFinalPromptForViewer({ model: 'x', messages: [] }));
    } finally {
        if (originalWindow === undefined) delete globalThis.window;
        else globalThis.window = originalWindow;
    }
}

function testProductionRuntimeWiresThePromptObserver() {
    const source = fs.readFileSync(path.join(ROOT, 'modules/qq-v2/application/production-runtime.js'), 'utf8');
    assert.match(source, /import \{ observeFinalPromptForViewer \} from '\.\.\/\.\.\/integration\/final-prompt-viewer-bridge\.js';/);
    assert.match(source, /onPromptReady:\s*observeFinalPromptForViewer/);
}

function createRepositoryFixture(options = {}) {
    const scopeId = options.scopeId ?? 'st:character:alice:chat-a';
    const conversationId = options.conversationId ?? 'private-a';
    const scope = {
        scopeId,
        settings: {
            activeApiPresetId: 'api-1',
            privateReplyPresetId: 'prompt-private',
            ...(options.settings ?? {}),
        },
    };
    const conversation = {
        conversationId,
        scopeId,
        kind: options.kind ?? 'private',
        status: 'active',
        lastHandledUserSequence: 0,
        ...(options.conversation ?? {}),
    };
    const messages = [...(options.messages ?? [])];
    let nextSequence = messages.reduce((highest, message) => Math.max(highest, message.sequence ?? 0), 0) + 1;
    const applied = [];
    const repository = {
        async getScope(requestedScopeId) {
            return requestedScopeId === scopeId ? { ...scope, settings: { ...scope.settings } } : null;
        },
        async getConversation(requestedScopeId, requestedConversationId) {
            return requestedScopeId === scopeId && requestedConversationId === conversationId ? { ...conversation } : null;
        },
        async listConversations(requestedScopeId) {
            return requestedScopeId === scopeId ? [{ ...conversation }] : [];
        },
        async listMessages(requestedScopeId, requestedConversationId) {
            if (requestedScopeId !== scopeId || requestedConversationId !== conversationId) return [];
            return messages.map((message) => ({ ...message }));
        },
        async appendMessages(requestedScopeId, requestedConversationId, inputs) {
            assert.equal(requestedScopeId, scopeId);
            assert.equal(requestedConversationId, conversationId);
            const created = inputs.map((input) => {
                const message = { messageId: `m-${nextSequence}`, sequence: nextSequence, ...input };
                nextSequence += 1;
                messages.push(message);
                return { ...message };
            });
            return created;
        },
        async applyAIActions(requestedScopeId, actions, applyOptions) {
            assert.equal(requestedScopeId, scopeId);
            applied.push({ actions, options: applyOptions });
            const sequence = applyOptions?.handledUserSequences?.[conversationId];
            if (sequence) conversation.lastHandledUserSequence = sequence;
            return { applied: actions };
        },
    };
    return { repository, scope, conversation, messages, applied, scopeId, conversationId };
}

function createQueueRepositoryFixture() {
    const scopeId = 'st:character:alice:queue-chat';
    const scope = {
        scopeId,
        settings: {
            activeApiPresetId: 'api-1',
            privateReplyPresetId: 'prompt-private',
        },
    };
    const conversations = new Map([
        ['private-a', { conversationId: 'private-a', scopeId, kind: 'private', status: 'active', lastHandledUserSequence: 0 }],
        ['private-b', { conversationId: 'private-b', scopeId, kind: 'private', status: 'active', lastHandledUserSequence: 0 }],
    ]);
    const messages = new Map([...conversations.keys()].map((id) => [id, []]));
    const applied = [];
    let nextSequence = 1;
    const repository = {
        async getScope(id) { return id === scopeId ? { ...scope, settings: { ...scope.settings } } : null; },
        async getConversation(id, conversationId) {
            return id === scopeId && conversations.has(conversationId) ? { ...conversations.get(conversationId) } : null;
        },
        async listConversations(id) { return id === scopeId ? [...conversations.values()].map((item) => ({ ...item })) : []; },
        async listMessages(id, conversationId) {
            return id === scopeId && messages.has(conversationId) ? messages.get(conversationId).map((item) => ({ ...item })) : [];
        },
        async appendMessages(id, conversationId, inputs) {
            assert.equal(id, scopeId);
            const bucket = messages.get(conversationId);
            return inputs.map((input) => {
                const message = { messageId: `m-${nextSequence}`, sequence: nextSequence, ...input };
                nextSequence += 1;
                bucket.push(message);
                return { ...message };
            });
        },
        async applyAIActions(id, _actions, options) {
            assert.equal(id, scopeId);
            applied.push({ options });
            for (const [conversationId, sequence] of Object.entries(options.handledUserSequences || {})) {
                conversations.get(conversationId).lastHandledUserSequence = sequence;
            }
            return { applied: [] };
        },
    };
    return { repository, scopeId, scope, messages, applied };
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

function captureReadyScopeSession(scopeId) {
    const controller = new AbortController();
    return Object.freeze({
        scopeId,
        signal: controller.signal,
        isCurrent: () => true,
        isReady: () => true,
    });
}

function createScopeSessionController(scopeId) {
    const controller = new AbortController();
    let current = true;
    let ready = true;
    return {
        captureScopeSession(requestedScopeId) {
            if (requestedScopeId !== scopeId) return null;
            return Object.freeze({
                scopeId,
                signal: controller.signal,
                isCurrent: () => current,
                isReady: () => ready,
            });
        },
        revoke(reason = 'scope-changed') {
            current = false;
            ready = false;
            controller.abort(reason);
        },
    };
}

async function waitUntil(predicate, description, timeoutMs = 1600) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    assert.fail(`Timed out waiting for ${description}`);
}

async function testManualRequestPersistsUserMessageThenCommitsValidatedActions() {
    const { createQQV2RequestService } = await importModule('modules/qq-v2/request/service.js');
    const fixture = createRepositoryFixture();
    const backendCalls = [];
    const service = createQQV2RequestService({
        repository: fixture.repository,
        apiPresetResolver: async (id) => ({ id, endpoint: 'https://example.test/v1', apiKey: 'secret', model: 'model-a' }),
        promptPresetResolver: async (id) => ({ id, messages: [{ role: 'system', content: 'rules' }] }),
        buildManualRequest: async ({ preset, history, currentMessage, scopeSession }) => {
            assert.equal(preset.id, 'prompt-private');
            assert.equal(history.length, 1);
            assert.equal(currentMessage.content, 'hello');
            assert.equal(scopeSession.scopeId, fixture.scopeId);
            assert.equal(scopeSession.isCurrent(), true);
            assert.equal(scopeSession.isReady(), true);
            return [{ role: 'system', content: 'rules' }, { role: 'user', content: currentMessage.content }];
        },
        backend: {
            async generate(input) {
                backendCalls.push(input);
                return { content: '<qq><message /></qq>' };
            },
        },
        parseResponse: () => [{ type: 'message', conversation: fixture.conversationId, messageType: 'text', sender: 'person-a', content: 'hi' }],
        validateActions: (actions, options) => {
            assert.equal(options.scenario, 'private-reply');
            assert.deepEqual([...options.visibleMessageRefs], ['m-1']);
            return actions;
        },
    });

    const sent = await service.sendManual({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversationId,
        message: { type: 'text', content: 'hello', storyTime: '2042-01-01 12:00' },
    });
    assert.equal(sent.message.content, 'hello');
    assert.equal(fixture.messages.length, 1);
    await service.waitForIdle();

    assert.equal(backendCalls.length, 1);
    assert.equal(backendCalls[0].preset.id, 'api-1');
    assert.deepEqual(backendCalls[0].messages, [
        { role: 'system', content: 'rules' },
        { role: 'user', content: 'hello' },
    ]);
    assert.equal(fixture.applied.length, 1);
    assert.deepEqual(fixture.applied[0].options.handledUserSequences, { [fixture.conversationId]: 1 });
    assert.deepEqual(service.getConversationState(fixture.scopeId, fixture.conversationId), {
        phase: 'idle',
        pendingUserMessageCount: 0,
        error: '',
    });
}

async function testManualGroupRequestUsesTheGroupReplyPipeline() {
    const { createQQV2RequestService } = await importModule('modules/qq-v2/request/service.js');
    const fixture = createRepositoryFixture({
        conversationId: 'group-a',
        kind: 'group',
        settings: { groupReplyPresetId: 'prompt-group' },
        conversation: { groupId: 'group-a' },
    });
    const service = createQQV2RequestService({
        repository: fixture.repository,
        apiPresetResolver: async (id) => ({ id, endpoint: 'https://example.test/v1', apiKey: 'secret', model: 'model-a' }),
        promptPresetResolver: async (id) => ({ id, messages: [{ role: 'system', content: 'group rules' }] }),
        buildManualRequest: async ({ preset, currentMessage }) => {
            assert.equal(preset.id, 'prompt-group');
            return [{ role: 'user', content: currentMessage.content }];
        },
        backend: { async generate() { return { content: '<qq><message /></qq>' }; } },
        parseResponse: () => [{
            type: 'message',
            conversation: fixture.conversationId,
            messageType: 'text',
            sender: 'person-a',
            content: 'group reply',
        }],
        validateActions: (actions, options) => {
            assert.equal(options.scenario, 'group-reply');
            return actions;
        },
    });

    const sent = await service.sendManual({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversationId,
        message: { type: 'text', content: 'hello group' },
    });
    await service.waitForIdle();

    assert.equal(sent.message.content, 'hello group');
    assert.equal(fixture.applied.length, 1);
    assert.equal(fixture.applied[0].actions[0].content, 'group reply');
}

async function testManualFallbackMapsStickerShortReferenceBeforeRepositoryCommit() {
    const { createQQV2RequestService } = await importModule('modules/qq-v2/request/service.js');
    const fixture = createRepositoryFixture();
    const service = createQQV2RequestService({
        repository: fixture.repository,
        apiPresetResolver: async () => ({ id: 'api-1' }),
        promptPresetResolver: async () => ({ messages: [] }),
        buildManualRequest: async () => [{ role: 'user', content: 'manual' }],
        listStickers: async () => [{ id: 'sticker-uuid-a', description: '开心' }],
        backend: { async generate() { return { content: '<qq />' }; } },
        parseResponse: () => [{
            type: 'message',
            conversation: fixture.conversationId,
            sender: 'person-a',
            messageType: 'sticker',
            stickerId: 'S1',
            content: '开心',
        }],
        validateActions: (actions, options) => {
            assert.deepEqual(options.stickers, new Set(['S1']));
            return actions;
        },
    });

    await service.sendManual({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversationId,
        message: { type: 'text', content: '发个表情' },
    });
    await service.waitForIdle();

    assert.equal(fixture.applied.length, 1);
    assert.equal(fixture.applied[0].actions[0].stickerId, 'sticker-uuid-a');
}

async function testModelLoadingUsesBackendAndClearsStaleCandidatesOnFailure() {
    const { createQQV2RequestService } = await importModule('modules/qq-v2/request/service.js');
    const fixture = createRepositoryFixture();
    let call = 0;
    const backendInputs = [];
    const service = createQQV2RequestService({
        repository: fixture.repository,
        apiPresetResolver: async (id) => ({ id, endpoint: 'https://example.test/v1', apiKey: 'secret', model: 'handwritten-model' }),
        promptPresetResolver: async () => ({ messages: [] }),
        buildManualRequest: async () => [],
        parseResponse: () => [],
        validateActions: (actions) => actions,
        backend: {
            async generate() { throw new Error('not used'); },
            async loadModels(input) {
                assert.deepEqual(Object.keys(input.preset).sort(), ['apiKey', 'endpoint']);
                backendInputs.push(input.preset);
                call += 1;
                if (call === 1) return ['model-b', 'model-a', 'model-b'];
                throw new Error('model endpoint unavailable');
            },
        },
    });

    assert.deepEqual(await service.loadModels({ apiPresetId: 'api-1' }), {
        ok: true,
        apiPresetId: 'api-1',
        models: ['model-b', 'model-a'],
        manualModel: 'handwritten-model',
        error: '',
    });
    assert.deepEqual(service.getModelState('api-1'), {
        phase: 'ready',
        models: ['model-b', 'model-a'],
        manualModel: 'handwritten-model',
        error: '',
    });
    assert.deepEqual(backendInputs[0], {
        endpoint: 'https://example.test/v1',
        apiKey: 'secret',
    });

    assert.deepEqual(await service.loadModels({ apiPresetId: 'api-1' }), {
        ok: false,
        apiPresetId: 'api-1',
        models: [],
        manualModel: 'handwritten-model',
        error: 'model endpoint unavailable',
    });
    assert.deepEqual(service.getModelState('api-1'), {
        phase: 'failed',
        models: [],
        manualModel: 'handwritten-model',
        error: 'model endpoint unavailable',
    });

    const unsavedService = createQQV2RequestService({
        repository: fixture.repository,
        apiPresetResolver: async (id) => ({ id, endpoint: 'https://example.test/v1', apiKey: 'stored-secret', model: 'handwritten-model' }),
        promptPresetResolver: async () => ({ messages: [] }),
        buildManualRequest: async () => [],
        parseResponse: () => [],
        validateActions: (actions) => actions,
        backend: {
            async generate() { throw new Error('not used'); },
            async loadModels(input) {
                assert.deepEqual(Object.keys(input.preset).sort(), ['apiKey', 'endpoint']);
                return ['draft-model'];
            },
        },
    });
    assert.deepEqual(await unsavedService.loadModels({
        draft: {
            endpoint: 'https://draft.example.test/v1',
            apiKey: 'draft-secret',
            model: 'draft-manual-model',
        },
    }), {
        ok: true,
        apiPresetId: '',
        models: ['draft-model'],
        manualModel: 'draft-manual-model',
        error: '',
    });
    assert.deepEqual(unsavedService.getModelState(''), {
        phase: 'idle',
        models: [],
        manualModel: '',
        error: '',
    });

    const savedDraftInputs = [];
    const savedDraftService = createQQV2RequestService({
        repository: fixture.repository,
        apiPresetResolver: async (id) => ({ id, endpoint: 'https://saved.example.test/v1', apiKey: 'stored-secret', model: 'saved-model' }),
        promptPresetResolver: async () => ({ messages: [] }),
        buildManualRequest: async () => [],
        parseResponse: () => [],
        validateActions: (actions) => actions,
        backend: {
            async generate() { throw new Error('not used'); },
            async loadModels(input) {
                savedDraftInputs.push(input.preset);
                return ['override-model'];
            },
        },
    });
    assert.deepEqual(await savedDraftService.loadModels({
        apiPresetId: 'api-1',
        draft: {
            endpoint: 'https://draft-override.example.test/v1',
            apiKey: '',
            model: 'draft-manual-model',
        },
    }), {
        ok: true,
        apiPresetId: 'api-1',
        models: ['override-model'],
        manualModel: 'draft-manual-model',
        error: '',
    });
    assert.deepEqual(savedDraftInputs, [{
        endpoint: 'https://draft-override.example.test/v1',
        apiKey: 'stored-secret',
    }]);
    assert.deepEqual(await savedDraftService.loadModels({
        apiPresetId: 'api-1',
        draft: {
            endpoint: '',
            apiKey: '',
            model: 'draft-manual-model',
        },
    }), {
        ok: false,
        apiPresetId: 'api-1',
        models: [],
        manualModel: 'draft-manual-model',
        error: 'Selected QQ API preset has no API endpoint',
    });
    assert.equal(savedDraftInputs.length, 1);
}

async function testSameConversationCancelsLateResultAndKeepsItsQueuePosition() {
    const { createQQV2RequestService } = await importModule('modules/qq-v2/request/service.js');
    const fixture = createQueueRepositoryFixture();
    const first = deferred();
    const second = deferred();
    const third = deferred();
    const backendCalls = [];
    const service = createQQV2RequestService({
        repository: fixture.repository,
        apiPresetResolver: async () => ({ endpoint: 'https://example.test/v1', apiKey: 'secret', model: 'model-a' }),
        promptPresetResolver: async () => ({ messages: [] }),
        buildManualRequest: async ({ history }) => [{ role: 'user', content: history.map((message) => message.content).join('|') }],
        backend: {
            async generate(input) {
                backendCalls.push(input);
                return [first, second, third][backendCalls.length - 1].promise;
            },
        },
        parseResponse: () => [],
        validateActions: (actions) => actions,
    });

    await service.sendManual({ scopeId: fixture.scopeId, conversationId: 'private-a', message: { type: 'text', content: 'a1' } });
    await waitUntil(() => backendCalls.length === 1, 'the first request to start');
    await service.sendManual({ scopeId: fixture.scopeId, conversationId: 'private-b', message: { type: 'text', content: 'b1' } });
    await service.sendManual({ scopeId: fixture.scopeId, conversationId: 'private-a', message: { type: 'text', content: 'a2' } });

    assert.equal(backendCalls[0].signal.aborted, true);
    first.resolve({ content: '<qq><message /></qq>' });
    await waitUntil(() => backendCalls.length === 2, 'the merged request to start');
    assert.deepEqual(backendCalls[1].messages, [{ role: 'user', content: 'a1|a2' }]);

    second.resolve({ content: '<qq><message /></qq>' });
    await waitUntil(() => backendCalls.length === 3, 'the later conversation to start');
    assert.deepEqual(backendCalls[2].messages, [{ role: 'user', content: 'b1' }]);
    third.resolve({ content: '<qq><message /></qq>' });
    await service.waitForIdle();
}

async function testFailureKeepsTheRealBatchForRetryWithoutDuplicatingUserMessages() {
    const { createQQV2RequestService } = await importModule('modules/qq-v2/request/service.js');
    const fixture = createRepositoryFixture();
    let attempts = 0;
    const service = createQQV2RequestService({
        repository: fixture.repository,
        apiPresetResolver: async () => ({ endpoint: 'https://example.test/v1', apiKey: 'secret', model: 'model-a' }),
        promptPresetResolver: async () => ({ messages: [] }),
        buildManualRequest: async ({ history }) => [{ role: 'user', content: history.map((message) => message.content).join('|') }],
        backend: {
            async generate() {
                attempts += 1;
                if (attempts === 1) throw new Error('network unavailable');
                return { content: '<qq><message /></qq>' };
            },
        },
        parseResponse: () => [],
        validateActions: (actions) => actions,
    });

    await service.sendManual({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversationId,
        message: { type: 'text', content: 'please retry' },
    });
    await service.waitForIdle();
    assert.deepEqual(service.getConversationState(fixture.scopeId, fixture.conversationId), {
        phase: 'failed',
        pendingUserMessageCount: 1,
        error: 'network unavailable',
    });
    assert.equal(fixture.messages.length, 1);
    assert.equal(fixture.applied.length, 0);

    await service.retry({ scopeId: fixture.scopeId, conversationId: fixture.conversationId });
    await waitUntil(() => attempts === 2, 'an explicit retry to start without the message coalescing wait', 250);
    await service.waitForIdle();
    assert.equal(attempts, 2);
    assert.equal(fixture.messages.length, 1);
    assert.equal(fixture.applied.length, 1);
    assert.deepEqual(service.getConversationState(fixture.scopeId, fixture.conversationId), {
        phase: 'idle',
        pendingUserMessageCount: 0,
        error: '',
    });
}

async function testManualFailureNotifiesTheCurrentConversationAfterEnteringFailedState() {
    const { createQQV2RequestService } = await importModule('modules/qq-v2/request/service.js');
    const fixture = createRepositoryFixture();
    const failures = [];
    const service = createQQV2RequestService({
        repository: fixture.repository,
        apiPresetResolver: async () => ({ endpoint: 'https://example.test/v1', apiKey: 'secret', model: 'model-a' }),
        promptPresetResolver: async () => ({ messages: [] }),
        buildManualRequest: async () => [{ role: 'user', content: 'manual' }],
        backend: { async generate() { return { content: '' }; } },
        parseResponse: () => {
            throw new Error('QQ XML 格式无效');
        },
        validateActions: (actions) => actions,
        async afterManualError(input) {
            failures.push({
                ...input,
                state: service.getConversationState(input.scopeId, input.conversationId),
            });
        },
    });

    await service.sendManual({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversationId,
        message: { type: 'text', content: '触发错误' },
    });
    await service.waitForIdle();

    assert.equal(failures.length, 1);
    assert.equal(failures[0].kind, 'request-failed');
    assert.equal(failures[0].scopeId, fixture.scopeId);
    assert.equal(failures[0].conversationId, fixture.conversationId);
    assert.equal(failures[0].error.message, 'QQ XML 格式无效');
    assert.deepEqual(failures[0].state, {
        phase: 'failed',
        pendingUserMessageCount: 1,
        error: 'QQ XML 格式无效',
    });
}

async function testManualCancellationKeepsTheBatchRetryableAndLeavesProactiveAlone() {
    const { createQQV2RequestService } = await importModule('modules/qq-v2/request/service.js');
    const fixture = createRepositoryFixture();
    const manual = deferred();
    const proactive = deferred();
    const backendCalls = [];
    let proactiveInput = null;
    const service = createQQV2RequestService({
        repository: fixture.repository,
        apiPresetResolver: async () => ({ endpoint: 'https://example.test/v1', apiKey: 'secret', model: 'model-a' }),
        promptPresetResolver: async () => ({ messages: [] }),
        buildManualRequest: async () => [{ role: 'user', content: 'manual' }],
        backend: {
            async generate(input) {
                backendCalls.push(input);
                return manual.promise;
            },
        },
        parseResponse: () => [],
        validateActions: (actions) => actions,
    });

    await service.sendManual({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversationId,
        message: { type: 'text', content: 'stop me' },
    });
    assert.deepEqual(await service.cancelManual({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversationId,
    }), {
        cancelled: true,
        phase: 'failed',
        pendingUserMessageCount: 1,
        error: 'AI 生成已终止',
    });
    assert.equal(backendCalls.length, 0, 'queued manual work must be removed before generation starts');

    await service.retry({ scopeId: fixture.scopeId, conversationId: fixture.conversationId });
    await waitUntil(() => backendCalls.length === 1, 'the cancelled batch retry to start');
    assert.deepEqual(await service.cancelManual({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversationId,
    }), {
        cancelled: true,
        phase: 'failed',
        pendingUserMessageCount: 1,
        error: 'AI 生成已终止',
    });
    assert.equal(backendCalls[0].signal.aborted, true, 'running manual work must abort its backend request');
    manual.resolve({ content: '<qq><message /></qq>' });
    await service.waitForIdle();
    assert.equal(fixture.messages.length, 1, 'manual cancellation must preserve the real user batch');
    assert.equal(fixture.applied.length, 0, 'a cancelled response must not commit late AI actions');
    assert.equal(service.getConversationState(fixture.scopeId, fixture.conversationId).phase, 'failed');

    service.enqueueProactive({
        scopeId: fixture.scopeId,
        execute: async (input) => {
            proactiveInput = input;
            return proactive.promise;
        },
    });
    await waitUntil(() => proactiveInput !== null, 'the proactive request to start');
    assert.equal((await service.cancelManual({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversationId,
    })).cancelled, false);
    assert.equal(proactiveInput.signal.aborted, false, 'manual cancellation must not stop proactive work');
    service.cancelProactive({ scopeId: fixture.scopeId });
    proactive.resolve();
    await service.waitForIdle();
}

async function testScopeSwitchCancelsOldWorkAndDropsItsLateResult() {
    const { createQQV2RequestService } = await importModule('modules/qq-v2/request/service.js');
    const fixture = createQueueRepositoryFixture();
    const delayed = deferred();
    const backendCalls = [];
    const scopeSessions = createScopeSessionController(fixture.scopeId);
    const service = createQQV2RequestService({
        repository: fixture.repository,
        captureScopeSession: scopeSessions.captureScopeSession,
        apiPresetResolver: async () => ({ endpoint: 'https://example.test/v1', apiKey: 'secret', model: 'model-a' }),
        promptPresetResolver: async () => ({ messages: [] }),
        buildManualRequest: async () => [{ role: 'user', content: 'message' }],
        backend: {
            async generate(input) {
                backendCalls.push(input);
                return delayed.promise;
            },
        },
        parseResponse: () => [],
        validateActions: (actions) => actions,
    });

    await service.sendManual({ scopeId: fixture.scopeId, conversationId: 'private-a', message: { type: 'text', content: 'old scope' } });
    await waitUntil(() => backendCalls.length === 1, 'the old-scope request to start');
    scopeSessions.revoke();
    assert.equal(backendCalls[0].signal.aborted, true);

    delayed.resolve({ content: '<qq><message /></qq>' });
    await service.waitForIdle();
    assert.equal(fixture.applied.length, 0);
    assert.deepEqual(service.getConversationState(fixture.scopeId, 'private-a'), {
        phase: 'idle',
        pendingUserMessageCount: 0,
        error: '',
    });
}

async function testStaleScopeCannotPersistAManualMessageOrQueueProactiveWork() {
    const { createQQV2RequestService, QQV2RequestError } = await importModule('modules/qq-v2/request/service.js');
    const fixture = createRepositoryFixture();
    const service = createQQV2RequestService({
        repository: fixture.repository,
        captureScopeSession: () => null,
        apiPresetResolver: async () => ({ endpoint: 'https://example.test/v1', apiKey: 'secret', model: 'model-a' }),
        promptPresetResolver: async () => ({ messages: [] }),
        buildManualRequest: async () => [{ role: 'user', content: 'message' }],
        backend: { async generate() { throw new Error('stale work must not run'); } },
        parseResponse: () => [],
        validateActions: (actions) => actions,
    });

    await assert.rejects(
        service.sendManual({
            scopeId: fixture.scopeId,
            conversationId: fixture.conversationId,
            message: { type: 'text', content: 'stale' },
        }),
        (error) => error instanceof QQV2RequestError && error.code === 'scope_stale',
    );
    assert.equal(fixture.messages.length, 0);
    assert.throws(
        () => service.enqueueProactive({ scopeId: fixture.scopeId, execute: async () => {} }),
        (error) => error instanceof QQV2RequestError && error.code === 'scope_stale',
    );
    assert.deepEqual(service.getQueueState(), { active: null, queued: [] });
}

async function testSessionRevokedAfterPersistenceKeepsMessageButSkipsAIWork() {
    const { createQQV2RequestService } = await importModule('modules/qq-v2/request/service.js');
    const fixture = createRepositoryFixture();
    const scopeSessions = createScopeSessionController(fixture.scopeId);
    const backendCalls = [];
    const service = createQQV2RequestService({
        repository: fixture.repository,
        captureScopeSession: scopeSessions.captureScopeSession,
        apiPresetResolver: async () => ({ endpoint: 'https://example.test/v1', apiKey: 'secret', model: 'model-a' }),
        promptPresetResolver: async () => ({ messages: [] }),
        buildManualRequest: async () => [{ role: 'user', content: 'message' }],
        backend: { async generate(input) { backendCalls.push(input); return { content: '<qq />' }; } },
        parseResponse: () => [],
        validateActions: (actions) => actions,
        afterManualMutation(input) {
            if (input.kind === 'user-message') scopeSessions.revoke('scope-changed-after-persistence');
        },
    });

    const result = await service.sendManual({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversationId,
        message: { type: 'text', content: 'persisted first' },
    });
    assert.equal(result.message.content, 'persisted first');
    assert.equal(fixture.messages.length, 1);
    await service.waitForIdle();
    assert.equal(backendCalls.length, 0);
    assert.equal(fixture.applied.length, 0);
    assert.deepEqual(service.getQueueState(), { active: null, queued: [] });
}

async function testCancelScopeClearsOnlyRequestWorkWithoutOwningTheScope() {
    const { createQQV2RequestService } = await importModule('modules/qq-v2/request/service.js');
    const fixture = createQueueRepositoryFixture();
    const first = deferred();
    const backendCalls = [];
    const service = createQQV2RequestService({
        repository: fixture.repository,
        apiPresetResolver: async () => ({ endpoint: 'https://example.test/v1', apiKey: 'secret', model: 'model-a' }),
        promptPresetResolver: async () => ({ messages: [] }),
        buildManualRequest: async ({ history }) => [{ role: 'user', content: history.map((message) => message.content).join('|') }],
        backend: {
            async generate(input) {
                backendCalls.push(input);
                if (backendCalls.length === 1) return first.promise;
                return { content: '<qq><message /></qq>' };
            },
        },
        parseResponse: () => [{
            type: 'message',
            conversation: 'private-a',
            messageType: 'text',
            sender: 'person-a',
            content: 'reply',
        }],
        validateActions: (actions) => actions,
    });

    await service.sendManual({
        scopeId: fixture.scopeId,
        conversationId: 'private-a',
        message: { type: 'text', content: 'active request' },
    });
    await waitUntil(() => backendCalls.length === 1, 'the active scope request to start');
    await service.sendManual({
        scopeId: fixture.scopeId,
        conversationId: 'private-b',
        message: { type: 'text', content: 'queued request' },
    });
    assert.equal(service.getQueueState().queued.length, 1);
    assert.equal(service.getConversationState(fixture.scopeId, 'private-b').phase, 'queued');

    assert.equal(service.cancelScope({ scopeId: fixture.scopeId, reason: 'scope-transition' }), true);
    assert.equal(backendCalls[0].signal.aborted, true);
    assert.equal(backendCalls[0].signal.reason, 'scope-transition');
    assert.deepEqual(service.getQueueState().queued, []);
    assert.deepEqual(service.getConversationState(fixture.scopeId, 'private-a'), {
        phase: 'idle',
        pendingUserMessageCount: 0,
        error: '',
    });
    assert.deepEqual(service.getConversationState(fixture.scopeId, 'private-b'), {
        phase: 'idle',
        pendingUserMessageCount: 0,
        error: '',
    });

    first.resolve({ content: '<qq><message /></qq>' });
    await service.waitForIdle();
    assert.equal(fixture.applied.length, 0, 'a cancelled scope must reject a late backend result');

    await service.sendManual({
        scopeId: fixture.scopeId,
        conversationId: 'private-a',
        message: { type: 'text', content: 'same scope remains current' },
    });
    await service.waitForIdle();
    assert.equal(backendCalls.length, 2);
    assert.equal(fixture.applied.length, 1, 'cancelScope must not revoke the coordinator-owned session');
}

async function testReconcileAfterDeletionCancelsWorkWithoutCreatingAnotherRequest() {
    const { createQQV2RequestService } = await importModule('modules/qq-v2/request/service.js');
    const fixture = createQueueRepositoryFixture();
    const delayed = deferred();
    const backendCalls = [];
    const service = createQQV2RequestService({
        repository: fixture.repository,
        apiPresetResolver: async () => ({ endpoint: 'https://example.test/v1', apiKey: 'secret', model: 'model-a' }),
        promptPresetResolver: async () => ({ messages: [] }),
        buildManualRequest: async () => [{ role: 'user', content: 'message' }],
        backend: {
            async generate(input) {
                backendCalls.push(input);
                return delayed.promise;
            },
        },
        parseResponse: () => [],
        validateActions: (actions) => actions,
    });

    await service.sendManual({ scopeId: fixture.scopeId, conversationId: 'private-a', message: { type: 'text', content: 'delete me' } });
    await waitUntil(() => backendCalls.length === 1, 'the request to start before deletion');
    fixture.messages.get('private-a').splice(0, 1);
    await service.reconcileConversation({ scopeId: fixture.scopeId, conversationId: 'private-a' });
    assert.equal(backendCalls[0].signal.aborted, true);

    delayed.resolve({ content: '<qq><message /></qq>' });
    await service.waitForIdle();
    assert.equal(backendCalls.length, 1);
    assert.equal(fixture.applied.length, 0);
    assert.deepEqual(service.getConversationState(fixture.scopeId, 'private-a'), {
        phase: 'idle',
        pendingUserMessageCount: 0,
        error: '',
    });
}

async function testManualResponseCannotMutateAnotherConversation() {
    const { createQQV2RequestService } = await importModule('modules/qq-v2/request/service.js');
    const fixture = createQueueRepositoryFixture();
    const service = createQQV2RequestService({
        repository: fixture.repository,
        apiPresetResolver: async () => ({ endpoint: 'https://example.test/v1', apiKey: 'secret', model: 'model-a' }),
        promptPresetResolver: async () => ({ messages: [] }),
        buildManualRequest: async () => [{ role: 'user', content: 'message' }],
        backend: { async generate() { return { content: '<qq><message /></qq>' }; } },
        parseResponse: () => [{ type: 'message', conversation: 'private-b', messageType: 'text', sender: 'person-b', content: 'wrong place' }],
        validateActions: (actions) => actions,
    });

    await service.sendManual({ scopeId: fixture.scopeId, conversationId: 'private-a', message: { type: 'text', content: 'only a' } });
    await service.waitForIdle();
    assert.equal(fixture.applied.length, 0);
    const state = service.getConversationState(fixture.scopeId, 'private-a');
    assert.equal(state.phase, 'failed');
    assert.equal(state.pendingUserMessageCount, 1);
    assert.match(state.error, /current conversation/i);
}

async function testQueuedRequestReadsTheLatestSelectedPresetAtExecutionTime() {
    const { createQQV2RequestService } = await importModule('modules/qq-v2/request/service.js');
    const fixture = createQueueRepositoryFixture();
    const first = deferred();
    const second = deferred();
    const backendCalls = [];
    const promptPresetIds = [];
    const requestRuntimeSettings = [];
    let globalApiPresetId = 'api-1';
    let globalReplyPresetId = 'prompt-private';
    const service = createQQV2RequestService({
        repository: fixture.repository,
        runtimeSettingsResolver: async (_scopeId, scope) => ({
            ...scope.settings,
            activeApiPresetId: globalApiPresetId,
            privateReplyPresetId: globalReplyPresetId,
        }),
        apiPresetResolver: async (id) => ({ id, endpoint: 'https://example.test/v1', apiKey: 'secret', model: id }),
        promptPresetResolver: async (id) => {
            promptPresetIds.push(id);
            return { messages: [] };
        },
        buildManualRequest: async ({ runtimeSettings }) => {
            requestRuntimeSettings.push(runtimeSettings);
            return [{ role: 'user', content: 'message' }];
        },
        backend: {
            async generate(input) {
                backendCalls.push(input);
                return [first, second][backendCalls.length - 1].promise;
            },
        },
        parseResponse: () => [],
        validateActions: (actions) => actions,
    });

    await service.sendManual({ scopeId: fixture.scopeId, conversationId: 'private-a', message: { type: 'text', content: 'a' } });
    await waitUntil(() => backendCalls.length === 1, 'the first request to start');
    await service.sendManual({ scopeId: fixture.scopeId, conversationId: 'private-b', message: { type: 'text', content: 'b' } });
    globalApiPresetId = 'api-new';
    globalReplyPresetId = 'prompt-new';

    first.resolve({ content: '<qq><message /></qq>' });
    await waitUntil(() => backendCalls.length === 2, 'the queued request to start');
    assert.equal(backendCalls[1].preset.id, 'api-new');
    assert.equal(promptPresetIds[1], 'prompt-new');
    assert.deepEqual(requestRuntimeSettings.map((settings) => ({
        activeApiPresetId: settings.activeApiPresetId,
        privateReplyPresetId: settings.privateReplyPresetId,
    })), [
        { activeApiPresetId: 'api-1', privateReplyPresetId: 'prompt-private' },
        { activeApiPresetId: 'api-new', privateReplyPresetId: 'prompt-new' },
    ]);
    second.resolve({ content: '<qq><message /></qq>' });
    await service.waitForIdle();
}

async function testManualMessagePreemptsAnActiveProactiveRequest() {
    const { createQQV2RequestService } = await importModule('modules/qq-v2/request/service.js');
    const fixture = createRepositoryFixture();
    const proactive = deferred();
    const manual = deferred();
    let proactiveInput = null;
    let manualCalls = 0;
    const service = createQQV2RequestService({
        repository: fixture.repository,
        apiPresetResolver: async () => ({ endpoint: 'https://example.test/v1', apiKey: 'secret', model: 'model-a' }),
        promptPresetResolver: async () => ({ messages: [] }),
        buildManualRequest: async () => [{ role: 'user', content: 'manual' }],
        backend: {
            async generate() {
                manualCalls += 1;
                return manual.promise;
            },
        },
        parseResponse: () => [],
        validateActions: (actions) => actions,
    });

    service.enqueueProactive({
        scopeId: fixture.scopeId,
        execute: async (input) => {
            proactiveInput = input;
            return proactive.promise;
        },
    });
    await waitUntil(() => proactiveInput !== null, 'the proactive request to start');
    await service.sendManual({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversationId,
        message: { type: 'text', content: 'manual message' },
    });
    assert.equal(proactiveInput.signal.aborted, true);
    proactive.resolve();
    await waitUntil(() => manualCalls === 1, 'the manual request to start after proactive cancellation');
    manual.resolve({ content: '<qq><message /></qq>' });
    await service.waitForIdle();
}

async function testProactiveRequestSkipsWhenManualWorkExists() {
    const { createQQV2RequestService } = await importModule('modules/qq-v2/request/service.js');
    const fixture = createRepositoryFixture();
    const manual = deferred();
    const service = createQQV2RequestService({
        repository: fixture.repository,
        apiPresetResolver: async () => ({ endpoint: 'https://example.test/v1', apiKey: 'secret', model: 'model-a' }),
        promptPresetResolver: async () => ({ messages: [] }),
        buildManualRequest: async () => [{ role: 'user', content: 'manual' }],
        backend: { async generate() { return manual.promise; } },
        parseResponse: () => [],
        validateActions: (actions) => actions,
    });

    await service.sendManual({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversationId,
        message: { type: 'text', content: 'manual message' },
    });
    await waitUntil(() => service.getConversationState(fixture.scopeId, fixture.conversationId).phase === 'running', 'the manual request to start');
    const result = service.enqueueProactive({
        scopeId: fixture.scopeId,
        execute: async () => { throw new Error('proactive work must not run'); },
    });
    assert.deepEqual(result, { queued: false, skipped: 'manual-pending' });
    manual.resolve({ content: '<qq><message /></qq>' });
    await service.waitForIdle();
}

async function testProactiveWorkCanBeObservedAndCancelled() {
    const { createQQV2RequestService } = await importModule('modules/qq-v2/request/service.js');
    const fixture = createRepositoryFixture();
    const delayed = deferred();
    let proactiveInput = null;
    const service = createQQV2RequestService({
        repository: fixture.repository,
        apiPresetResolver: async () => ({ endpoint: 'https://example.test/v1', apiKey: 'secret', model: 'model-a' }),
        promptPresetResolver: async () => ({ messages: [] }),
        buildManualRequest: async () => [{ role: 'user', content: 'manual' }],
        backend: { async generate() { return { content: '<qq><message /></qq>' }; } },
        parseResponse: () => [],
        validateActions: (actions) => actions,
    });

    const scheduled = service.enqueueProactive({
        scopeId: fixture.scopeId,
        execute: async (input) => {
            proactiveInput = input;
            return delayed.promise;
        },
    });
    await waitUntil(() => proactiveInput !== null, 'the proactive request to start');
    assert.equal(proactiveInput.scopeSession.scopeId, fixture.scopeId);
    assert.equal(proactiveInput.scopeSession.isCurrent(), true);
    assert.equal(proactiveInput.scopeSession.isReady(), true);
    const queue = service.getQueueState();
    assert.equal(queue.active.kind, 'proactive');
    assert.equal(queue.active.requestId, scheduled.requestId);
    assert.deepEqual(queue.queued, []);
    assert.equal(service.cancelProactive({ scopeId: fixture.scopeId }), true);
    assert.equal(proactiveInput.signal.aborted, true);
    delayed.resolve();
    await service.waitForIdle();
    assert.equal(service.getQueueState().active, null);
}

async function testProactiveFailureIsReportedThroughTheObserver() {
    const { createQQV2RequestService } = await importModule('modules/qq-v2/request/service.js');
    const fixture = createRepositoryFixture();
    const observed = [];
    const failure = Object.assign(new Error('proactive backend unavailable'), {
        code: 'backend_unavailable',
    });
    const service = createQQV2RequestService({
        repository: fixture.repository,
        apiPresetResolver: async () => ({ endpoint: 'https://example.test/v1', apiKey: 'secret', model: 'model-a' }),
        promptPresetResolver: async () => ({ messages: [] }),
        buildManualRequest: async () => [{ role: 'user', content: 'manual' }],
        backend: { async generate() { return { content: '<qq><message /></qq>' }; } },
        parseResponse: () => [],
        validateActions: (actions) => actions,
        onProactiveError(error, context) {
            observed.push({ error, context });
        },
    });

    const scheduled = service.enqueueProactive({
        scopeId: fixture.scopeId,
        execute: async () => {
            throw failure;
        },
    });
    await service.waitForIdle();

    assert.equal(observed.length, 1, '主动请求异常不得再被静默吞掉');
    assert.strictEqual(observed[0].error, failure);
    assert.deepEqual(observed[0].context, {
        scopeId: fixture.scopeId,
        requestId: scheduled.requestId,
        stage: 'execute',
    });
    assert.equal(service.getQueueState().active, null);
}

async function testManualMessagesResetTheOneSecondCoalescingWindow() {
    const { createQQV2RequestService } = await importModule('modules/qq-v2/request/service.js');
    const fixture = createRepositoryFixture();
    const backendCalls = [];
    const service = createQQV2RequestService({
        repository: fixture.repository,
        apiPresetResolver: async () => ({ endpoint: 'https://example.test/v1', apiKey: 'secret', model: 'model-a' }),
        promptPresetResolver: async () => ({ messages: [] }),
        buildManualRequest: async ({ history, currentMessage }) => {
            assert.equal(history.length, 2);
            assert.equal(currentMessage.content, 'second');
            return [{ role: 'user', content: 'manual' }];
        },
        backend: {
            async generate(input) {
                backendCalls.push(input);
                return { content: '<qq><message /></qq>' };
            },
        },
        parseResponse: () => [],
        validateActions: (actions) => actions,
    });

    await service.sendManual({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversationId,
        message: { type: 'text', content: 'first' },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    await service.sendManual({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversationId,
        message: { type: 'text', content: 'second' },
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(backendCalls.length, 0);
    await waitUntil(() => backendCalls.length === 1, 'the reset coalescing window to expire', 1400);
    await service.waitForIdle();
}

async function testManualRequestCanCommitThroughTheProductionActionSeam() {
    const { createQQV2RequestService } = await importModule('modules/qq-v2/request/service.js');
    const fixture = createRepositoryFixture();
    const committed = [];
    const mutations = [];
    const service = createQQV2RequestService({
        repository: fixture.repository,
        apiPresetResolver: async () => ({ endpoint: 'https://example.test/v1', apiKey: 'secret', model: 'model-a' }),
        promptPresetResolver: async () => ({ messages: [] }),
        buildManualRequest: async () => ({
            messages: [{ role: 'user', content: 'manual' }],
            references: { P1: fixture.conversationId },
            personReferences: { P1: 'person-a' },
            messageReferences: { M1: 'm-1' },
            visibleMessageRefs: ['M1'],
            stickerReferences: { S1: 'sticker-prompt-snapshot' },
        }),
        backend: { async generate() { return { content: '<qq><message /></qq>' }; } },
        parseResponse: () => {
            throw new Error('production action seam must own XML parsing');
        },
        validateActions: () => {
            throw new Error('production action seam must own XML validation');
        },
        listStickers: async () => [{ id: 'sticker-uuid-a', description: '开心' }],
        async commitManualActions(input) {
            committed.push(input);
            assert.equal(input.isCurrent(), true);
            return { createdConversationIds: [] };
        },
        async afterManualMutation(input) {
            mutations.push(input);
        },
        getStoryTime: () => '2042-05-01 10:00',
    });

    await service.sendManual({
        scopeId: fixture.scopeId,
        conversationId: fixture.conversationId,
        message: { type: 'text', content: 'hello' },
    });
    await service.waitForIdle();

    assert.equal(committed.length, 1);
    assert.deepEqual(committed[0].references, { P1: fixture.conversationId });
    assert.deepEqual(committed[0].personReferences, { P1: 'person-a' });
    assert.deepEqual(committed[0].messageReferences, { M1: 'm-1' });
    assert.deepEqual(committed[0].visibleMessageRefs, new Set(['M1']));
    assert.deepEqual(committed[0].stickers, new Set(['S1']));
    assert.deepEqual(committed[0].stickerReferences, { S1: 'sticker-prompt-snapshot' });
    assert.deepEqual(committed[0].handledUserSequences, { [fixture.conversationId]: 1 });
    assert.equal(mutations.length, 2);
    assert.equal(mutations[0].kind, 'user-message');
    assert.equal(mutations[1].kind, 'ai-actions');
    assert.strictEqual(mutations[1].scopeSession, mutations[0].scopeSession);
    assert.equal(mutations[1].scopeSession.scopeId, fixture.scopeId);
    assert.equal(mutations[1].scopeSession.isCurrent(), true);
    assert.equal(mutations[1].scopeSession.isReady(), true);
}

async function main() {
    await testDatabaseCurrentApiBackendUsesRestrictedCallAI();
    await testQQV2BackendRouterSelectsDatabaseVirtualPreset();
    await testBackendProxyUsesSillyTavernAndRedactsTheKey();
    await testBackendProxyRejectsPublicHttpBeforeSending();
    await testBackendProxyLoadsModelsWithoutModelAndParsesCommonShapes();
    await testFinalPromptViewerBridgePostsOnlyThePromptSnapshot();
    testProductionRuntimeWiresThePromptObserver();
    await testManualRequestPersistsUserMessageThenCommitsValidatedActions();
    await testManualGroupRequestUsesTheGroupReplyPipeline();
    await testManualFallbackMapsStickerShortReferenceBeforeRepositoryCommit();
    await testModelLoadingUsesBackendAndClearsStaleCandidatesOnFailure();
    await testSameConversationCancelsLateResultAndKeepsItsQueuePosition();
    await testFailureKeepsTheRealBatchForRetryWithoutDuplicatingUserMessages();
    await testManualFailureNotifiesTheCurrentConversationAfterEnteringFailedState();
    await testManualCancellationKeepsTheBatchRetryableAndLeavesProactiveAlone();
    await testScopeSwitchCancelsOldWorkAndDropsItsLateResult();
    await testStaleScopeCannotPersistAManualMessageOrQueueProactiveWork();
    await testSessionRevokedAfterPersistenceKeepsMessageButSkipsAIWork();
    await testCancelScopeClearsOnlyRequestWorkWithoutOwningTheScope();
    await testReconcileAfterDeletionCancelsWorkWithoutCreatingAnotherRequest();
    await testManualResponseCannotMutateAnotherConversation();
    await testQueuedRequestReadsTheLatestSelectedPresetAtExecutionTime();
    await testManualMessagePreemptsAnActiveProactiveRequest();
    await testProactiveRequestSkipsWhenManualWorkExists();
    await testProactiveWorkCanBeObservedAndCancelled();
    await testProactiveFailureIsReportedThroughTheObserver();
    await testManualMessagesResetTheOneSecondCoalescingWindow();
    await testManualRequestCanCommitThroughTheProductionActionSeam();
    console.log('[qq-v2-request-contract] passed');
}

main().catch((error) => {
    console.error('[qq-v2-request-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
