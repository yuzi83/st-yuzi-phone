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

async function testManualRequestUsesTypedSemanticsForWorldbookActivation() {
    const { createMemoryQQV2StateStore } = await importModule('modules/qq-v2/storage/state-store.js');
    const { createWorldbookContextResolver } = await importModule('modules/worldbook-reading/context-resolver.js');
    const { createQQV2ProductionRuntime } = await importModule('modules/qq-v2/application/production-runtime.js');
    const scopeId = 'st:character:alice:chat-worldbook-reading-manual';
    const generatedPrompts = [];
    const worldbookContextResolver = createWorldbookContextResolver({
        async loadWorldbooks() {
            return [{
                name: '角色主书',
                entries: [{
                    uid: 7,
                    content: '林知夏一直记得院子里的海棠花。',
                    key: ['语音：今晚见'],
                    constant: false,
                    disable: false,
                }],
            }];
        },
        async readSelection() {
            return {};
        },
    });
    const runtime = createQQV2ProductionRuntime({
        host: {
            readScope() {
                return {
                    scopeId,
                    chatId: 'chat-worldbook-reading-manual',
                    chatFile: 'chat-worldbook-reading-manual',
                    hostType: 'character',
                    hostId: 'alice',
                };
            },
            readUserIdentity() { return { name: '旅行者', avatar: '' }; },
            readStoryTime() { return '2042-05-20 09:30'; },
            readStoryMessages() { return []; },
            readRawContext() { return { getRequestHeaders: () => ({}) }; },
        },
        stateStore: createMemoryQQV2StateStore(),
        cryptoApi: webcrypto,
        backend: {
            async generate({ messages }) {
                generatedPrompts.push(messages);
                return { content: '<qq><message conversation="P1" type="text">收到</message></qq>' };
            },
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
            async getCurrentCharacterBookNames() { return { primary: null, additional: [] }; },
        },
        worldbookContextResolver,
    });

    await runtime.initialize();
    const privateChat = await runtime.createPrivateConversation({ scopeId, name: '林知夏' });
    const apiPreset = await runtime.saveApiPreset({
        preset: {
            name: '统一世界书读取 API',
            endpoint: 'https://api.example.test/v1',
            apiKey: 'worldbook-reading-secret',
            model: 'worldbook-reading-model',
        },
    });
    const promptPreset = await runtime.savePromptPreset({
        preset: {
            name: '统一世界书读取指令',
            messages: [{
                id: 'worldbook-content',
                name: '世界书内容',
                role: 'system',
                content: '{{世界书内容}}',
            }],
        },
    });
    await runtime.updateGlobalSettings({
        scopeId,
        settings: {
            activeApiPresetId: apiPreset.id,
            privateReplyPresetId: promptPreset.id,
        },
    });

    await runtime.sendManual({
        scopeId,
        conversationId: privateChat.conversation.conversationId,
        message: { type: 'voice', content: '今晚见' },
    });
    await waitUntil(() => generatedPrompts.length === 1, 'the manual QQ request prompt');

    assert.equal(generatedPrompts[0][0].content, '林知夏一直记得院子里的海棠花。');
    runtime.destroy();
}

async function testProactiveRequestUsesTypedSemanticsForWorldbookActivation() {
    const { createMemoryQQV2StateStore } = await importModule('modules/qq-v2/storage/state-store.js');
    const { createQQV2Repository } = await importModule('modules/qq-v2/domain/repository.js');
    const { createWorldbookContextResolver } = await importModule('modules/worldbook-reading/context-resolver.js');
    const { createQQV2ProductionRuntime } = await importModule('modules/qq-v2/application/production-runtime.js');
    const scopeId = 'st:character:alice:chat-worldbook-reading-proactive';
    const generatedPrompts = [];
    let storyMessages = [];
    const stateStore = createMemoryQQV2StateStore();
    const repository = createQQV2Repository({ stateStore });
    const worldbookContextResolver = createWorldbookContextResolver({
        async loadWorldbooks() {
            return [{
                name: '角色主书',
                entries: [{
                    uid: 8,
                    content: '林知夏会在雨天主动问候朋友。',
                    key: ['语音：第三近况'],
                    constant: false,
                    disable: false,
                }],
            }];
        },
        async readSelection() {
            return {};
        },
    });
    const runtime = createQQV2ProductionRuntime({
        host: {
            readScope() {
                return {
                    scopeId,
                    chatId: 'chat-worldbook-reading-proactive',
                    chatFile: 'chat-worldbook-reading-proactive',
                    hostType: 'character',
                    hostId: 'alice',
                };
            },
            readUserIdentity() { return { name: '旅行者', avatar: '' }; },
            readStoryTime() { return '2042-05-20 09:30'; },
            readStoryMessages() { return storyMessages; },
            readRawContext() { return { getRequestHeaders: () => ({}) }; },
        },
        stateStore,
        repository,
        cryptoApi: webcrypto,
        proactiveStorySettleDelayMs: 0,
        backend: {
            async generate({ messages }) {
                generatedPrompts.push(messages);
                return { content: '<qq><none /></qq>' };
            },
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
            async getCurrentCharacterBookNames() { return { primary: null, additional: [] }; },
        },
        worldbookContextResolver,
    });

    await runtime.initialize();
    const privateChat = await runtime.createPrivateConversation({ scopeId, name: '林知夏' });
    await repository.appendMessages(scopeId, privateChat.conversation.conversationId, [
        { senderId: privateChat.person.personId, senderType: 'person', type: 'text', content: '过期近况' },
        { senderId: privateChat.person.personId, senderType: 'person', type: 'voice', content: '第三近况' },
        { senderId: privateChat.person.personId, senderType: 'person', type: 'text', content: '第二近况' },
        { senderId: privateChat.person.personId, senderType: 'person', type: 'text', content: '第一近况' },
    ]);
    const apiPreset = await runtime.saveApiPreset({
        preset: {
            name: '主动统一世界书读取 API',
            endpoint: 'https://api.example.test/v1',
            apiKey: 'proactive-worldbook-reading-secret',
            model: 'proactive-worldbook-reading-model',
        },
    });
    const promptPreset = await runtime.savePromptPreset({
        preset: {
            name: '主动统一世界书读取指令',
            messages: [{
                id: 'worldbook-content',
                name: '世界书内容',
                role: 'system',
                content: '{{世界书内容}}',
            }],
        },
    });
    await runtime.updateGlobalSettings({
        scopeId,
        settings: {
            activeApiPresetId: apiPreset.id,
            privateProactivePresetId: promptPreset.id,
            conversationHistoryLimit: 1,
        },
    });
    await runtime.configureProactive({ scopeId, settings: { enabled: true, everyTurns: 1 } });
    storyMessages = [{
        messageId: 'story-1',
        role: 'assistant',
        content: '窗外开始下雨。',
        isHidden: false,
        isSystem: false,
    }];

    await runtime.handleMessageReceived('story-1', 'normal');
    await waitUntil(() => generatedPrompts.length === 1, 'the proactive QQ request prompt');

    assert.equal(generatedPrompts[0][0].content, '林知夏会在雨天主动问候朋友。');
    runtime.destroy();
}

async function testDefaultProductionAdapterReadsCurrentCharacterWorldbooks() {
    const { createMemoryQQV2StateStore } = await importModule('modules/qq-v2/storage/state-store.js');
    const { createSillyTavernWorldbookReadingCatalog } = await importModule(
        'modules/worldbook-reading/st-catalog-adapter.js',
    );
    const { createQQV2ProductionRuntime } = await importModule('modules/qq-v2/application/production-runtime.js');
    const scopeId = 'st:character:alice:chat-worldbook-reading-production';
    const generatedPrompts = [];
    const loadedBooks = [];
    const rawContext = { getRequestHeaders: () => ({}) };
    const worldbookReadingCatalog = createSillyTavernWorldbookReadingCatalog({
        async getCurrentCharacterWorldbooks() {
            return { primary: '角色主书', additional: ['角色附加书'] };
        },
        async getWorldbook(name) {
            loadedBooks.push(name);
            return name === '角色主书'
                ? [{
                    uid: 11,
                    name: '主书蓝灯',
                    enabled: true,
                    strategy: {
                        type: 'constant',
                        keys: [],
                        keys_secondary: { logic: 'and_any', keys: [] },
                        scan_depth: 'same_as_global',
                    },
                    position: {
                        type: 'before_character_definition',
                        role: 'system',
                        depth: 0,
                        order: 100,
                    },
                    content: '默认生产读取器取得了主书蓝灯正文。',
                }]
                : [];
        },
        getPhoneSettings() {
            return { worldbookReadingSelection: {} };
        },
        savePhoneSetting() { return true; },
        async onWorldInfoUpdated() { return () => {}; },
    });
    const runtime = createQQV2ProductionRuntime({
        host: {
            readScope() {
                return {
                    scopeId,
                    chatId: 'chat-worldbook-reading-production',
                    chatFile: 'chat-worldbook-reading-production',
                    hostType: 'character',
                    hostId: 'alice',
                };
            },
            readUserIdentity() { return { name: '旅行者', avatar: '' }; },
            readStoryTime() { return '2042-05-20 09:30'; },
            readStoryMessages() { return []; },
            readRawContext() { return rawContext; },
        },
        stateStore: createMemoryQQV2StateStore(),
        cryptoApi: webcrypto,
        backend: {
            async generate({ messages }) {
                generatedPrompts.push(messages);
                return { content: '<qq><message conversation="P1" type="text">收到</message></qq>' };
            },
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
            async getCurrentCharacterBookNames() { return { primary: null, additional: [] }; },
        },
        worldbookReadingCatalog,
    });

    await runtime.initialize();
    const privateChat = await runtime.createPrivateConversation({ scopeId, name: '林知夏' });
    const apiPreset = await runtime.saveApiPreset({
        preset: {
            name: '默认生产世界书读取 API',
            endpoint: 'https://api.example.test/v1',
            apiKey: 'production-worldbook-reading-secret',
            model: 'production-worldbook-reading-model',
        },
    });
    const promptPreset = await runtime.savePromptPreset({
        preset: {
            name: '默认生产世界书读取指令',
            messages: [{
                id: 'worldbook-content',
                name: '世界书内容',
                role: 'system',
                content: '{{世界书内容}}',
            }],
        },
    });
    await runtime.updateGlobalSettings({
        scopeId,
        settings: {
            activeApiPresetId: apiPreset.id,
            privateReplyPresetId: promptPreset.id,
        },
    });

    await runtime.sendManual({
        scopeId,
        conversationId: privateChat.conversation.conversationId,
        message: { type: 'text', content: '读取角色世界书。' },
    });
    await waitUntil(() => generatedPrompts.length === 1, 'the default production worldbook prompt');

    assert.deepEqual(loadedBooks, ['角色主书', '角色附加书']);
    assert.equal(generatedPrompts[0][0].content, '默认生产读取器取得了主书蓝灯正文。');
    runtime.destroy();
}

async function testDefaultProductionRuntimesRenderPluginBackedWorldbookContent() {
    const { createMemoryQQV2StateStore } = await importModule('modules/qq-v2/storage/state-store.js');
    const { createQQV2ProductionRuntime } = await importModule('modules/qq-v2/application/production-runtime.js');
    const scopeId = 'st:character:alice:chat-worldbook-reading-plugin-runtimes';
    const generatedPrompts = [];
    const originalPlugins = {
        EjsTemplate: globalThis.EjsTemplate,
        Mvu: globalThis.Mvu,
        AutoCardUpdaterAPI: globalThis.AutoCardUpdaterAPI,
    };
    let runtime = null;

    globalThis.EjsTemplate = {
        async prepareContext() {
            return { person: '林知夏' };
        },
        async evalTemplate(template, context) {
            if (template.includes('!!(mvu.stage === 2)')) {
                return String(context.mvu?.stage === 2);
            }
            return template.replace('<%= person %>', context.person);
        },
    };
    globalThis.Mvu = {
        getMvuData({ message_id: messageId }) {
            assert.equal(messageId, 7);
            return { stat_data: { stage: 2 } };
        },
    };
    globalThis.AutoCardUpdaterAPI = {
        async querySql(sql, params) {
            assert.equal(sql, 'SELECT stock');
            assert.deepEqual(params, []);
            return { columns: ['stock'], values: [[9]] };
        },
    };

    try {
        runtime = createQQV2ProductionRuntime({
            host: {
                readScope() {
                    return {
                        scopeId,
                        chatId: 'chat-worldbook-reading-plugin-runtimes',
                        chatFile: 'chat-worldbook-reading-plugin-runtimes',
                        hostType: 'character',
                        hostId: 'alice',
                    };
                },
                readUserIdentity() { return { name: '旅行者', avatar: '' }; },
                readStoryTime() { return '2042-05-20 09:30'; },
                readStoryMessages() {
                    return [{ messageId: 7, role: 'assistant', content: '普通正文' }];
                },
                readRawContext() { return { getRequestHeaders: () => ({}) }; },
            },
            stateStore: createMemoryQQV2StateStore(),
            cryptoApi: webcrypto,
            backend: {
                async generate({ messages }) {
                    generatedPrompts.push(messages);
                    return { content: '<qq><message conversation="P1" type="text">收到</message></qq>' };
                },
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
                async getCurrentCharacterBookNames() { return { primary: null, additional: [] }; },
            },
            worldbookReadingCatalog: {
                async load() {
                    return {
                        entries: [{
                            ref: { bookName: '角色主书', uid: 21 },
                            enabled: true,
                            selected: true,
                            value: {
                                uid: 21,
                                constant: true,
                                content: '@@if mvu.stage === 2\n<%= person %>库存{[sql "SELECT stock"]}',
                            },
                        }],
                    };
                },
            },
        });

        await runtime.initialize();
        const privateChat = await runtime.createPrivateConversation({ scopeId, name: '林知夏' });
        const apiPreset = await runtime.saveApiPreset({
            preset: {
                name: '插件运行时 API',
                endpoint: 'https://api.example.test/v1',
                apiKey: 'plugin-runtime-secret',
                model: 'plugin-runtime-model',
            },
        });
        const promptPreset = await runtime.savePromptPreset({
            preset: {
                name: '插件运行时指令',
                messages: [{
                    id: 'worldbook-content',
                    name: '世界书内容',
                    role: 'system',
                    content: '{{世界书内容}}',
                }],
            },
        });
        await runtime.updateGlobalSettings({
            scopeId,
            settings: {
                activeApiPresetId: apiPreset.id,
                privateReplyPresetId: promptPreset.id,
            },
        });

        await runtime.sendManual({
            scopeId,
            conversationId: privateChat.conversation.conversationId,
            message: { type: 'text', content: '读取插件渲染后的世界书。' },
        });
        await waitUntil(() => generatedPrompts.length === 1, 'the plugin-rendered worldbook prompt');

        assert.equal(generatedPrompts[0][0].content, '林知夏库存9');
    } finally {
        runtime?.destroy();
        for (const [name, value] of Object.entries(originalPlugins)) {
            if (value === undefined) delete globalThis[name];
            else globalThis[name] = value;
        }
    }
}

async function main() {
    await testManualRequestUsesTypedSemanticsForWorldbookActivation();
    await testProactiveRequestUsesTypedSemanticsForWorldbookActivation();
    await testDefaultProductionAdapterReadsCurrentCharacterWorldbooks();
    await testDefaultProductionRuntimesRenderPluginBackedWorldbookContent();
    console.log('[qq-v2-worldbook-reading-integration] passed');
}

main().catch((error) => {
    console.error('[qq-v2-worldbook-reading-integration] failed');
    console.error(error);
    process.exitCode = 1;
});
