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

async function testRepositoryReplacesGeneratedImageOnTheOriginalMessage() {
    const repository = await createRepository();
    const { conversation } = await repository.createPrivateConversation('scope-image', { name: '星野铃' });
    const [message] = await repository.appendMessages('scope-image', conversation.conversationId, [{
        senderId: '__self__',
        senderType: 'self',
        type: 'image',
        content: '站在窗边自拍',
    }]);

    assert.equal(message.generatedImagePath, '');
    assert.equal(message.generatedAt, 0);

    const first = await repository.replaceGeneratedMessageImage(
        'scope-image',
        conversation.conversationId,
        message.messageId,
        {
            path: 'user/images/yuzi-phone-generated/first.png',
            generatedAt: 1_787_558_400_000,
        },
    );

    assert.equal(first.previousImagePath, '');
    assert.equal(first.message.content, '站在窗边自拍');
    assert.equal(first.message.generatedImagePath, 'user/images/yuzi-phone-generated/first.png');
    assert.equal(first.message.generatedAt, 1_787_558_400_000);

    const second = await repository.replaceGeneratedMessageImage(
        'scope-image',
        conversation.conversationId,
        message.messageId,
        {
            path: 'user/images/yuzi-phone-generated/second.png',
            generatedAt: 1_787_558_400_001,
        },
    );

    assert.equal(second.previousImagePath, 'user/images/yuzi-phone-generated/first.png');
    assert.equal(second.message.generatedImagePath, 'user/images/yuzi-phone-generated/second.png');
}

async function testRepositoryOnlyReleasesGeneratedImagesThatAreNoLongerReferenced() {
    const repository = await createRepository();
    const firstConversation = await repository.createPrivateConversation('scope-cleanup', { name: '星野铃' });
    const secondConversation = await repository.createPrivateConversation('scope-cleanup-other', { name: '木下' });
    const [firstMessage] = await repository.appendMessages('scope-cleanup', firstConversation.conversation.conversationId, [{
        senderId: '__self__',
        senderType: 'self',
        type: 'image',
        content: '第一张图',
    }]);
    const [secondMessage] = await repository.appendMessages('scope-cleanup-other', secondConversation.conversation.conversationId, [{
        senderId: '__self__',
        senderType: 'self',
        type: 'image',
        content: '第二张图',
    }]);
    const sharedPath = 'user/images/yuzi-phone-generated/shared.png';
    await repository.replaceGeneratedMessageImage(
        'scope-cleanup',
        firstConversation.conversation.conversationId,
        firstMessage.messageId,
        { path: sharedPath, generatedAt: 1 },
    );
    await repository.replaceGeneratedMessageImage(
        'scope-cleanup-other',
        secondConversation.conversation.conversationId,
        secondMessage.messageId,
        { path: sharedPath, generatedAt: 2 },
    );

    const firstDeletion = await repository.deleteMessages(
        'scope-cleanup',
        firstConversation.conversation.conversationId,
        [firstMessage.messageId],
    );
    assert.deepEqual(firstDeletion.releasedGeneratedImagePaths, []);

    const conversationDeletion = await repository.deleteConversation(
        'scope-cleanup-other',
        secondConversation.conversation.conversationId,
    );
    assert.deepEqual(conversationDeletion.releasedGeneratedImagePaths, [sharedPath]);
}

async function testRepositoryOnlyReleasesReplacedImagesAfterTheirLastReferenceMovesAway() {
    const repository = await createRepository();
    const firstConversation = await repository.createPrivateConversation('scope-replace-a', { name: '星野铃' });
    const secondConversation = await repository.createPrivateConversation('scope-replace-b', { name: '木下' });
    const [firstMessage] = await repository.appendMessages(
        'scope-replace-a',
        firstConversation.conversation.conversationId,
        [{
            senderId: '__self__',
            senderType: 'self',
            type: 'image',
            content: '第一张图',
        }],
    );
    const [secondMessage] = await repository.appendMessages(
        'scope-replace-b',
        secondConversation.conversation.conversationId,
        [{
            senderId: '__self__',
            senderType: 'self',
            type: 'image',
            content: '第二张图',
        }],
    );
    const sharedPath = 'user/images/yuzi-phone-generated/shared-before-replace.png';
    await repository.replaceGeneratedMessageImage(
        'scope-replace-a',
        firstConversation.conversation.conversationId,
        firstMessage.messageId,
        { path: sharedPath, generatedAt: 1 },
    );
    await repository.replaceGeneratedMessageImage(
        'scope-replace-b',
        secondConversation.conversation.conversationId,
        secondMessage.messageId,
        { path: sharedPath, generatedAt: 2 },
    );

    const firstReplacement = await repository.replaceGeneratedMessageImage(
        'scope-replace-a',
        firstConversation.conversation.conversationId,
        firstMessage.messageId,
        {
            path: 'user/images/yuzi-phone-generated/replacement-a.png',
            generatedAt: 3,
        },
    );
    assert.equal(firstReplacement.previousImagePath, sharedPath);
    assert.deepEqual(firstReplacement.releasedGeneratedImagePaths, []);

    const secondReplacement = await repository.replaceGeneratedMessageImage(
        'scope-replace-b',
        secondConversation.conversation.conversationId,
        secondMessage.messageId,
        {
            path: 'user/images/yuzi-phone-generated/replacement-b.png',
            generatedAt: 4,
        },
    );
    assert.equal(secondReplacement.previousImagePath, sharedPath);
    assert.deepEqual(secondReplacement.releasedGeneratedImagePaths, [sharedPath]);
}

async function createImageRuntimeFixture(options = {}) {
    const { createMemoryQQV2StateStore } = await importModule('modules/qq-v2/storage/state-store.js');
    const { createQQV2Repository } = await importModule('modules/qq-v2/domain/repository.js');
    const { createQQV2ProductionRuntime } = await importModule('modules/qq-v2/application/production-runtime.js');
    const scopeId = options.scopeId || 'st:character:alice:image-contract';
    const currentScope = {
        value: {
            scopeId,
            chatId: 'image-contract',
            chatFile: 'image-contract',
            hostType: 'character',
            hostId: 'alice',
        },
    };
    const stateStore = createMemoryQQV2StateStore();
    const repository = createQQV2Repository({ stateStore });
    const generationInputs = [];
    const deletedPaths = [];
    let runtime;
    const imageGenerationService = {
        async generateAndStore(input) {
            generationInputs.push(input);
            if (typeof options.generateAndStore === 'function') {
                return options.generateAndStore({
                    input,
                    repository,
                    runtime,
                    currentScope,
                });
            }
            return {
                ok: true,
                status: 'stored',
                path: 'user/images/yuzi-phone-generated/default-generated.png',
                generatedAt: 1_787_558_400_000,
            };
        },
        async deleteStoredImage({ path: generatedImagePath }) {
            deletedPaths.push(generatedImagePath);
            if (typeof options.deleteStoredImage === 'function') {
                return options.deleteStoredImage({
                    path: generatedImagePath,
                    repository,
                    runtime,
                    currentScope,
                });
            }
            return { ok: true, status: 'deleted' };
        },
    };
    runtime = createQQV2ProductionRuntime({
        host: {
            readScope() { return currentScope.value; },
            readUserIdentity() { return { name: '界面昵称', avatar: '' }; },
            readStoryTime() { return '2042-05-20 09:30'; },
            readStoryMessages() { return []; },
            readRawContext() { return {}; },
        },
        stateStore,
        repository,
        getPersonaName() { return '主角 Persona'; },
        composeCharacterImagePrompt(input) {
            return {
                prompt: `${input.explicitNames.join('，')}，${input.description}`,
            };
        },
        imageGenerationService,
        ...(typeof options.getImageGenerationConfig === 'function'
            ? { getImageGenerationConfig: options.getImageGenerationConfig }
            : {}),
        ...(options.promptTranslationService
            ? { promptTranslationService: options.promptTranslationService }
            : {}),
        projectionService: {
            async reconcileScope() { return []; },
            async retryPending() { return []; },
            async syncConversation() { return { status: 'synced' }; },
            async removeConversationProjection() { return { status: 'removed' }; },
            async removeScopeProjections() { return { status: 'removed' }; },
        },
        backend: {
            async generate() { throw new Error('本测试不会调用 QQ 文本生成'); },
            async loadModels() { return []; },
        },
        worldbookGateway: {
            async getCurrentCharacterBookNames() { return { primary: '', additional: [] }; },
            async loadBook() { return { entries: {} }; },
            async saveBook() {},
        },
    });
    await runtime.initialize();
    return {
        scopeId,
        currentScope,
        stateStore,
        repository,
        runtime,
        generationInputs,
        deletedPaths,
    };
}

async function testRuntimeUsesPromptTranslationOutputBeforeCallingImageGeneration() {
    const translationCalls = [];
    const fixture = await createImageRuntimeFixture({
        getImageGenerationConfig: () => ({
            enabled: true,
            timeoutMs: 90_000,
            roleMappings: [],
            promptTranslationEnabled: true,
            promptTranslationApiPresetId: 'translator-api',
            promptTranslationPresetId: 'image-preset',
        }),
        promptTranslationService: {
            async translate(input) {
                translationCalls.push(input);
                return {
                    ok: true,
                    status: 'translated',
                    content: '模型任意输出\n<not-a-tag>',
                };
            },
        },
    });
    const created = await fixture.repository.createPrivateConversation(fixture.scopeId, { name: '星野铃' });
    const [message] = await fixture.repository.appendMessages(
        fixture.scopeId,
        created.conversation.conversationId,
        [{
            senderId: created.person.personId,
            senderType: 'person',
            type: 'image',
            content: '站在窗边',
        }],
    );

    await fixture.runtime.generateMessageImage({
        scopeId: fixture.scopeId,
        conversationId: created.conversation.conversationId,
        messageId: message.messageId,
    });

    assert.equal(translationCalls.length, 1);
    assert.equal(translationCalls[0].prompt, '星野铃，站在窗边');
    assert.equal(translationCalls[0].apiPresetId, 'translator-api');
    assert.deepEqual(translationCalls[0].messages, []);
    assert.equal(
        Object.prototype.hasOwnProperty.call(translationCalls[0], 'imageGenerationPresetId'),
        false,
    );
    assert.equal(fixture.generationInputs.length, 1);
    assert.equal(fixture.generationInputs[0].prompt, '模型任意输出\n<not-a-tag>');

    fixture.runtime.destroy();
}

async function testRuntimeSkipsPromptTranslationWhenItsSwitchIsOff() {
    let translationCalls = 0;
    const fixture = await createImageRuntimeFixture({
        getImageGenerationConfig: () => ({
            enabled: true,
            timeoutMs: 90_000,
            roleMappings: [],
            promptTranslationEnabled: false,
            promptTranslationApiPresetId: 'translator-api',
            promptTranslationPresetId: 'image-preset',
        }),
        promptTranslationService: {
            async translate() {
                translationCalls += 1;
                return { ok: true, status: 'translated', content: '不应被使用' };
            },
        },
    });
    const created = await fixture.repository.createPrivateConversation(fixture.scopeId, { name: '星野铃' });
    const [message] = await fixture.repository.appendMessages(
        fixture.scopeId,
        created.conversation.conversationId,
        [{
            senderId: created.person.personId,
            senderType: 'person',
            type: 'image',
            content: '站在窗边',
        }],
    );

    await fixture.runtime.generateMessageImage({
        scopeId: fixture.scopeId,
        conversationId: created.conversation.conversationId,
        messageId: message.messageId,
    });

    assert.equal(translationCalls, 0);
    assert.equal(fixture.generationInputs[0].prompt, '星野铃，站在窗边');

    fixture.runtime.destroy();
}

async function testRuntimeDeletesTheNewFileWhenMessageReplacementFails() {
    let conversationId = '';
    let messageId = '';
    const generatedPath = 'user/images/yuzi-phone-generated/compensated.png';
    const fixture = await createImageRuntimeFixture({
        async generateAndStore({ repository, currentScope }) {
            await repository.deleteMessages(
                currentScope.value.scopeId,
                conversationId,
                [messageId],
            );
            return {
                ok: true,
                status: 'stored',
                path: generatedPath,
                generatedAt: 1_787_558_400_001,
            };
        },
    });
    const created = await fixture.repository.createPrivateConversation(fixture.scopeId, { name: '星野铃' });
    conversationId = created.conversation.conversationId;
    const [message] = await fixture.repository.appendMessages(fixture.scopeId, conversationId, [{
        senderId: created.person.personId,
        senderType: 'person',
        type: 'image',
        content: '更新前被删除的图片消息',
    }]);
    messageId = message.messageId;

    await assert.rejects(
        fixture.runtime.generateMessageImage({
            scopeId: fixture.scopeId,
            conversationId,
            messageId,
        }),
        (error) => error?.code === 'message_not_found',
    );
    assert.deepEqual(fixture.deletedPaths, [generatedPath]);
    assert.deepEqual(await fixture.repository.listMessages(fixture.scopeId, conversationId), []);

    fixture.runtime.destroy();
}

async function testRuntimeRejectsNonImageMessagesBeforeCallingTheGenerationService() {
    const fixture = await createImageRuntimeFixture();
    const created = await fixture.repository.createPrivateConversation(fixture.scopeId, { name: '星野铃' });
    const [message] = await fixture.repository.appendMessages(
        fixture.scopeId,
        created.conversation.conversationId,
        [{
            senderId: created.person.personId,
            senderType: 'person',
            type: 'text',
            content: '这不是图片消息',
        }],
    );

    await assert.rejects(
        fixture.runtime.generateMessageImage({
            scopeId: fixture.scopeId,
            conversationId: created.conversation.conversationId,
            messageId: message.messageId,
        }),
        (error) => error?.code === 'message_type_invalid',
    );
    assert.deepEqual(fixture.generationInputs, []);
    assert.deepEqual(fixture.deletedPaths, []);

    fixture.runtime.destroy();
}

async function testRuntimeCleansUpTheGeneratedFileWhenTheScopeChangesMidRequest() {
    const generatedPath = 'user/images/yuzi-phone-generated/stale-scope.png';
    const fixture = await createImageRuntimeFixture({
        async generateAndStore({ currentScope, runtime }) {
            currentScope.value = {
                scopeId: 'st:character:bob:other-chat',
                chatId: 'other-chat',
                chatFile: 'other-chat',
                hostType: 'character',
                hostId: 'bob',
            };
            await runtime.handleChatChanged();
            return {
                ok: true,
                status: 'stored',
                path: generatedPath,
                generatedAt: 1_787_558_400_002,
            };
        },
    });
    const created = await fixture.repository.createPrivateConversation(fixture.scopeId, { name: '星野铃' });
    const [message] = await fixture.repository.appendMessages(
        fixture.scopeId,
        created.conversation.conversationId,
        [{
            senderId: created.person.personId,
            senderType: 'person',
            type: 'image',
            content: '切换聊天时仍在生成',
        }],
    );

    await assert.rejects(
        fixture.runtime.generateMessageImage({
            scopeId: fixture.scopeId,
            conversationId: created.conversation.conversationId,
            messageId: message.messageId,
        }),
        (error) => error?.code === 'scope_inactive',
    );
    assert.deepEqual(fixture.deletedPaths, [generatedPath]);
    const [storedMessage] = await fixture.repository.listMessages(
        fixture.scopeId,
        created.conversation.conversationId,
    );
    assert.equal(storedMessage.generatedImagePath, '');
    assert.equal(storedMessage.generatedAt, 0);

    fixture.runtime.destroy();
}

async function testRuntimeDeletesReleasedFilesAfterMessageAndConversationDeletion() {
    const fixture = await createImageRuntimeFixture();
    const messageConversation = await fixture.repository.createPrivateConversation(
        fixture.scopeId,
        { name: '星野铃' },
    );
    const conversationDeletion = await fixture.repository.createPrivateConversation(
        fixture.scopeId,
        { name: '木下' },
    );
    const [messageToDelete] = await fixture.repository.appendMessages(
        fixture.scopeId,
        messageConversation.conversation.conversationId,
        [{
            senderId: messageConversation.person.personId,
            senderType: 'person',
            type: 'image',
            content: '删除单条消息时释放',
        }],
    );
    const [conversationImage] = await fixture.repository.appendMessages(
        fixture.scopeId,
        conversationDeletion.conversation.conversationId,
        [{
            senderId: conversationDeletion.person.personId,
            senderType: 'person',
            type: 'image',
            content: '删除会话时释放',
        }],
    );
    const messagePath = 'user/images/yuzi-phone-generated/delete-message.png';
    const conversationPath = 'user/images/yuzi-phone-generated/delete-conversation.png';
    await fixture.repository.replaceGeneratedMessageImage(
        fixture.scopeId,
        messageConversation.conversation.conversationId,
        messageToDelete.messageId,
        { path: messagePath, generatedAt: 1 },
    );
    await fixture.repository.replaceGeneratedMessageImage(
        fixture.scopeId,
        conversationDeletion.conversation.conversationId,
        conversationImage.messageId,
        { path: conversationPath, generatedAt: 2 },
    );

    await fixture.runtime.deleteMessages({
        scopeId: fixture.scopeId,
        conversationId: messageConversation.conversation.conversationId,
        messageIds: [messageToDelete.messageId],
    });
    assert.deepEqual(fixture.deletedPaths, [messagePath]);

    const deletedConversation = await fixture.runtime.deleteConversation({
        scopeId: fixture.scopeId,
        conversationId: conversationDeletion.conversation.conversationId,
    });
    assert.equal(deletedConversation.deleted, true);
    assert.deepEqual(fixture.deletedPaths, [messagePath, conversationPath]);

    fixture.runtime.destroy();
}

async function testRuntimeKeepsAReplacedOldFileWhileAnotherScopeStillReferencesIt() {
    const replacementPath = 'user/images/yuzi-phone-generated/runtime-replacement.png';
    const fixture = await createImageRuntimeFixture({
        async generateAndStore() {
            return {
                ok: true,
                status: 'stored',
                path: replacementPath,
                generatedAt: 1_787_558_400_003,
            };
        },
    });
    const activeConversation = await fixture.repository.createPrivateConversation(
        fixture.scopeId,
        { name: '星野铃' },
    );
    const [activeMessage] = await fixture.repository.appendMessages(
        fixture.scopeId,
        activeConversation.conversation.conversationId,
        [{
            senderId: activeConversation.person.personId,
            senderType: 'person',
            type: 'image',
            content: '重新生成共享旧图',
        }],
    );
    const otherScopeId = 'st:character:bob:shared-image-contract';
    const otherConversation = await fixture.repository.createPrivateConversation(
        otherScopeId,
        { name: '木下' },
    );
    const [otherMessage] = await fixture.repository.appendMessages(
        otherScopeId,
        otherConversation.conversation.conversationId,
        [{
            senderId: otherConversation.person.personId,
            senderType: 'person',
            type: 'image',
            content: '仍然引用共享旧图',
        }],
    );
    const sharedPath = 'user/images/yuzi-phone-generated/runtime-shared-old.png';
    await fixture.repository.replaceGeneratedMessageImage(
        fixture.scopeId,
        activeConversation.conversation.conversationId,
        activeMessage.messageId,
        { path: sharedPath, generatedAt: 1 },
    );
    await fixture.repository.replaceGeneratedMessageImage(
        otherScopeId,
        otherConversation.conversation.conversationId,
        otherMessage.messageId,
        { path: sharedPath, generatedAt: 2 },
    );

    const generated = await fixture.runtime.generateMessageImage({
        scopeId: fixture.scopeId,
        conversationId: activeConversation.conversation.conversationId,
        messageId: activeMessage.messageId,
    });

    assert.equal(generated.previousImagePath, sharedPath);
    assert.equal(generated.message.generatedImagePath, replacementPath);
    assert.deepEqual(fixture.deletedPaths, []);
    const [stillReferencing] = await fixture.repository.listMessages(
        otherScopeId,
        otherConversation.conversation.conversationId,
    );
    assert.equal(stillReferencing.generatedImagePath, sharedPath);

    fixture.runtime.destroy();
}

async function testRuntimeGeneratesForAiAndSelfThenSafelyReplacesTheOldImage() {
    const { createMemoryQQV2StateStore } = await importModule('modules/qq-v2/storage/state-store.js');
    const { createQQV2Repository } = await importModule('modules/qq-v2/domain/repository.js');
    const { createQQV2ProductionRuntime } = await importModule('modules/qq-v2/application/production-runtime.js');
    const scopeId = 'st:character:alice:image-runtime';
    const stateStore = createMemoryQQV2StateStore();
    const repository = createQQV2Repository({ stateStore });
    const { conversation, person } = await repository.createPrivateConversation(scopeId, { name: '星野铃' });
    const [aiMessage, selfMessage] = await repository.appendMessages(scopeId, conversation.conversationId, [{
        senderId: person.personId,
        senderType: 'person',
        type: 'image',
        content: '我和木下坐在咖啡店',
    }, {
        senderId: '__self__',
        senderType: 'self',
        type: 'image',
        content: '站在海边',
    }]);
    const promptInputs = [];
    const generationInputs = [];
    const deletedPaths = [];
    const generatedPaths = [
        'user/images/yuzi-phone-generated/ai-first.png',
        'user/images/yuzi-phone-generated/self.png',
        'user/images/yuzi-phone-generated/ai-second.png',
    ];
    let generatedIndex = 0;
    const runtime = createQQV2ProductionRuntime({
        host: {
            readScope() {
                return {
                    scopeId,
                    chatId: 'image-runtime',
                    chatFile: 'image-runtime',
                    hostType: 'character',
                    hostId: 'alice',
                };
            },
            readUserIdentity() { return { name: '界面昵称', avatar: '' }; },
            readStoryTime() { return '2042-05-20 09:30'; },
            readStoryMessages() { return []; },
            readRawContext() { return {}; },
        },
        stateStore,
        repository,
        getPersonaName() {
            return '主角 Persona';
        },
        composeCharacterImagePrompt(input) {
            promptInputs.push(input);
            return {
                prompt: `${input.explicitNames.join('，')}，已整理，${input.description}`,
            };
        },
        imageGenerationService: {
            async generateAndStore(input) {
                generationInputs.push(input);
                const path = generatedPaths[generatedIndex];
                generatedIndex += 1;
                return {
                    ok: true,
                    status: 'stored',
                    path,
                    generatedAt: 1_787_558_400_000 + generatedIndex,
                };
            },
            async deleteStoredImage({ path }) {
                deletedPaths.push(path);
                return { ok: true, status: 'deleted' };
            },
        },
        backend: {
            async generate() { throw new Error('本测试不会调用 QQ 文本生成'); },
            async loadModels() { return []; },
        },
        worldbookGateway: {
            async getCurrentCharacterBookNames() { return { primary: '', additional: [] }; },
            async loadBook() { return { entries: {} }; },
            async saveBook() {},
        },
    });
    await runtime.initialize();
    const notifications = [];
    const unsubscribe = runtime.subscribe((event) => notifications.push(event));

    const first = await runtime.generateMessageImage({
        scopeId,
        conversationId: conversation.conversationId,
        messageId: aiMessage.messageId,
    });
    const self = await runtime.generateMessageImage({
        scopeId,
        conversationId: conversation.conversationId,
        messageId: selfMessage.messageId,
    });
    const second = await runtime.generateMessageImage({
        scopeId,
        conversationId: conversation.conversationId,
        messageId: aiMessage.messageId,
    });

    assert.deepEqual(promptInputs.map((input) => input.explicitNames), [
        ['星野铃'],
        ['主角 Persona'],
        ['星野铃'],
    ]);
    assert.deepEqual(promptInputs.map((input) => ({
        description: input.description,
        scanDescription: input.scanDescription,
    })), [{
        description: '我和木下坐在咖啡店',
        scanDescription: true,
    }, {
        description: '站在海边',
        scanDescription: true,
    }, {
        description: '我和木下坐在咖啡店',
        scanDescription: true,
    }]);
    assert.deepEqual(generationInputs.map((input) => ({
        prompt: input.prompt,
        width: input.width,
        height: input.height,
    })), [{
        prompt: '星野铃，已整理，我和木下坐在咖啡店',
        width: null,
        height: null,
    }, {
        prompt: '主角 Persona，已整理，站在海边',
        width: null,
        height: null,
    }, {
        prompt: '星野铃，已整理，我和木下坐在咖啡店',
        width: null,
        height: null,
    }]);
    assert.equal(first.message.generatedImagePath, generatedPaths[0]);
    assert.equal(self.message.generatedImagePath, generatedPaths[1]);
    assert.equal(second.previousImagePath, generatedPaths[0]);
    assert.equal(second.message.generatedImagePath, generatedPaths[2]);
    assert.deepEqual(deletedPaths, [generatedPaths[0]]);
    assert.deepEqual(notifications, [first, self, second].map(() => ({
        status: 'changed',
        scopeId,
        reason: 'message-image-generated',
        conversationId: conversation.conversationId,
    })));

    const storedMessages = await repository.listMessages(scopeId, conversation.conversationId);
    assert.equal(
        storedMessages.find((message) => message.messageId === aiMessage.messageId).generatedImagePath,
        generatedPaths[2],
    );
    assert.equal(
        storedMessages.find((message) => message.messageId === selfMessage.messageId).generatedImagePath,
        generatedPaths[1],
    );

    unsubscribe();
    runtime.destroy();
}

async function testFacadeExposesGeneratedImageIntentWithoutLeakingRuntimeDetails() {
    const { createQQV2Facade } = await importModule('modules/qq-v2/application/facade.js');
    const calls = [];
    const runtime = {
        async getSnapshot() {
            return {
                phase: 'ready',
                context: {
                    scopeId: 'scope-facade-image',
                    user: { name: '主角 Persona', avatar: '' },
                    storyTime: '2042-05-20 09:30',
                },
            };
        },
        async getConversation({ scopeId, conversationId }) {
            calls.push(['getConversation', { scopeId, conversationId }]);
            return {
                conversationId,
                kind: 'private',
                status: 'active',
                person: { personId: 'person-1', formalName: '星野铃' },
            };
        },
        async generateMessageImage(input) {
            calls.push(['generateMessageImage', input]);
            return {
                message: {
                    messageId: input.messageId,
                    conversationId: input.conversationId,
                    senderId: 'person-1',
                    senderType: 'person',
                    type: 'image',
                    content: '站在窗边自拍',
                    generatedImagePath: 'user/images/yuzi-phone-generated/facade.png',
                    generatedAt: 1_787_558_400_000,
                },
                previousImagePath: 'user/images/yuzi-phone-generated/old.png',
            };
        },
    };
    const facade = createQQV2Facade({ runtime });

    const result = await facade.intent.generateMessageImage({
        conversationId: 'conversation-1',
        messageId: 'message-1',
    });

    assert.deepEqual(calls, [
        ['getConversation', {
            scopeId: 'scope-facade-image',
            conversationId: 'conversation-1',
        }],
        ['generateMessageImage', {
            scopeId: 'scope-facade-image',
            conversationId: 'conversation-1',
            messageId: 'message-1',
        }],
    ]);
    assert.equal(result.ok, true);
    assert.equal(result.status, 'accepted');
    assert.equal(result.result.previousImagePath, 'user/images/yuzi-phone-generated/old.png');
    assert.equal(result.result.message.content, '站在窗边自拍');
    assert.equal(result.result.message.generatedImagePath, 'user/images/yuzi-phone-generated/facade.png');
    assert.equal(result.result.message.generatedAt, 1_787_558_400_000);
    assert.equal(Object.isFrozen(result.result.message), true);
}

async function main() {
    await testRepositoryReplacesGeneratedImageOnTheOriginalMessage();
    await testRepositoryOnlyReleasesGeneratedImagesThatAreNoLongerReferenced();
    await testRepositoryOnlyReleasesReplacedImagesAfterTheirLastReferenceMovesAway();
    await testRuntimeDeletesTheNewFileWhenMessageReplacementFails();
    await testRuntimeRejectsNonImageMessagesBeforeCallingTheGenerationService();
    await testRuntimeCleansUpTheGeneratedFileWhenTheScopeChangesMidRequest();
    await testRuntimeDeletesReleasedFilesAfterMessageAndConversationDeletion();
    await testRuntimeKeepsAReplacedOldFileWhileAnotherScopeStillReferencesIt();
    await testRuntimeGeneratesForAiAndSelfThenSafelyReplacesTheOldImage();
    await testRuntimeUsesPromptTranslationOutputBeforeCallingImageGeneration();
    await testRuntimeSkipsPromptTranslationWhenItsSwitchIsOff();
    await testFacadeExposesGeneratedImageIntentWithoutLeakingRuntimeDetails();
}

main().then(() => {
    console.log('[qq-image-generation-contract] passed');
}).catch((error) => {
    console.error('[qq-image-generation-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
