const assert = require('node:assert/strict');
const path = require('node:path');
const { webcrypto } = require('node:crypto');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    return import(`${href}?contract=${Date.now()}-${Math.random()}`);
}

function scope(hostId, chatId) {
    return {
        scopeId: `st:character:${hostId}:${chatId}`,
        hostType: 'character',
        hostId,
        chatId,
        chatFile: chatId,
    };
}

async function createFixture() {
    const { createMemoryQQV2StateStore } = await importModule('modules/qq-v2/storage/state-store.js');
    const { createQQV2Repository } = await importModule('modules/qq-v2/domain/repository.js');
    const { createQQV2ProductionRuntime } = await importModule('modules/qq-v2/application/production-runtime.js');
    const stateStore = createMemoryQQV2StateStore();
    const baseRepository = createQQV2Repository({ stateStore });
    const current = { value: scope('alice.png', 'chat-a') };
    const events = [];
    const chatFileQueries = [];
    const chatFilesByHost = new Map();
    const unresolvedHostIds = new Set();
    let projectionStatus = 'removed';
    const deletedGeneratedImagePaths = [];
    const repository = Object.freeze({
        ...baseRepository,
        async deleteScope(scopeId) {
            events.push(['scope.delete', scopeId]);
            return baseRepository.deleteScope(scopeId);
        },
    });
    const projectionService = {
        async reconcileScope() { return []; },
        async retryPending() { return []; },
        async syncConversation() { return { status: 'synced' }; },
        async removeConversationProjection() { return { status: 'removed' }; },
        async removeScopeProjections(input) {
            events.push(['projection.remove', input.scopeId]);
            return { status: projectionStatus };
        },
    };
    const runtime = createQQV2ProductionRuntime({
        host: {
            readScope: () => current.value,
            readUserIdentity: () => ({ name: '用户', avatar: '' }),
            readStoryTime: () => '',
            readStoryMessages: () => [],
            readRawContext: () => ({ getRequestHeaders: () => ({}) }),
            async listCharacterChatFiles(hostId) {
                chatFileQueries.push(hostId);
                if (unresolvedHostIds.has(hostId)) {
                    return { status: 'unresolved', hostId, reason: 'request-failed' };
                }
                return {
                    status: 'resolved',
                    hostId,
                    chatFiles: [...(chatFilesByHost.get(hostId) || [])],
                };
            },
        },
        stateStore,
        repository,
        projectionService,
        worldbookGateway: {
            async getCurrentCharacterBookNames() { return { primary: null, additional: [] }; },
        },
        imageGenerationService: {
            async deleteStoredImage({ path: generatedImagePath }) {
                deletedGeneratedImagePaths.push(generatedImagePath);
                events.push(['generated-image.delete', generatedImagePath]);
                return { ok: true, status: 'deleted' };
            },
        },
        backend: { async generate() {}, async loadModels() { return []; } },
        cryptoApi: webcrypto,
    });
    await runtime.initialize();
    const sourceConversation = await runtime.createPrivateConversation({
        scopeId: current.value.scopeId,
        name: 'Alice',
    });
    const [sourceUniqueImage, sourceSharedImage] = await repository.appendMessages(
        current.value.scopeId,
        sourceConversation.conversation.conversationId,
        [{
            senderId: '__self__',
            senderType: 'self',
            type: 'image',
            content: '源聊天独占图片',
        }, {
            senderId: '__self__',
            senderType: 'self',
            type: 'image',
            content: '跨聊天共享图片',
        }],
    );
    const uniqueGeneratedImagePath = 'user/images/yuzi-phone-generated/source-only.png';
    const sharedGeneratedImagePath = 'user/images/yuzi-phone-generated/shared-across-scopes.png';
    await repository.replaceGeneratedMessageImage(
        current.value.scopeId,
        sourceConversation.conversation.conversationId,
        sourceUniqueImage.messageId,
        { path: uniqueGeneratedImagePath, generatedAt: 1 },
    );
    await repository.replaceGeneratedMessageImage(
        current.value.scopeId,
        sourceConversation.conversation.conversationId,
        sourceSharedImage.messageId,
        { path: sharedGeneratedImagePath, generatedAt: 2 },
    );
    const image = await repository.saveImageLibraryAsset(current.value.scopeId, {
        library: 'avatar',
        blob: new Blob(['global avatar'], { type: 'image/png' }),
        mimeType: 'image/png',
    });
    const sticker = await runtime.saveSticker({
        sticker: {
            description: 'Shared sticker',
            blob: new Blob(['global sticker'], { type: 'image/webp' }),
        },
    });
    const apiPreset = await runtime.saveApiPreset({
        preset: {
            name: 'Shared API preset',
            endpoint: 'https://api.example.test/v1',
            model: 'model-a',
            apiKey: 'shared-secret',
        },
    });
    current.value = scope('bob.png', 'chat-b');
    await runtime.handleChatChanged();
    const targetConversation = await runtime.createPrivateConversation({
        scopeId: current.value.scopeId,
        name: 'Bob',
    });
    const [targetSharedImage] = await repository.appendMessages(
        current.value.scopeId,
        targetConversation.conversation.conversationId,
        [{
            senderId: '__self__',
            senderType: 'self',
            type: 'image',
            content: '仍然引用共享图片',
        }],
    );
    await repository.replaceGeneratedMessageImage(
        current.value.scopeId,
        targetConversation.conversation.conversationId,
        targetSharedImage.messageId,
        { path: sharedGeneratedImagePath, generatedAt: 3 },
    );
    events.length = 0;

    return {
        runtime,
        repository,
        stateStore,
        events,
        chatFileQueries,
        chatFilesByHost,
        unresolvedHostIds,
        deletedGeneratedImagePaths,
        uniqueGeneratedImagePath,
        sharedGeneratedImagePath,
        image,
        sticker,
        apiPreset,
        sourceScopeId: 'st:character:alice.png:chat-a',
        targetScopeId: 'st:character:bob.png:chat-b',
        setProjectionStatus(status) { projectionStatus = status; },
    };
}

async function testHostDeletionRemovesProjectionBeforeScopeAndKeepsGlobalImages() {
    const fixture = await createFixture();
    const result = await fixture.runtime.handleChatDeleted('chat-a');

    assert.deepEqual(result, { status: 'deleted', scopeId: fixture.sourceScopeId });
    assert.deepEqual(fixture.events, [
        ['projection.remove', fixture.sourceScopeId],
        ['scope.delete', fixture.sourceScopeId],
        ['generated-image.delete', fixture.uniqueGeneratedImagePath],
    ]);
    assert.deepEqual(fixture.deletedGeneratedImagePaths, [fixture.uniqueGeneratedImagePath]);
    assert.equal(await fixture.repository.getScope(fixture.sourceScopeId), null);
    assert.equal((await fixture.repository.listImageLibraryAssets(fixture.targetScopeId, 'avatar'))[0].assetId, fixture.image.assetId);
    const resources = await fixture.runtime.listSharedResources();
    assert.equal(resources.apiPresets.some((item) => item.id === fixture.apiPreset.id), true);
    assert.equal(resources.stickers.some((item) => item.id === fixture.sticker.id), true);
    const state = await fixture.stateStore.read();
    assert.equal(state.sharedResources.imageLibraryAssets[fixture.image.assetId].assetId, fixture.image.assetId);
    fixture.runtime.destroy();
}

async function testProjectionFailureKeepsTheSourceScope() {
    const fixture = await createFixture();
    fixture.setProjectionStatus('pending');
    const result = await fixture.runtime.handleChatDeleted('chat-a');

    assert.deepEqual(result, { status: 'pending', scopeId: fixture.sourceScopeId });
    assert.deepEqual(fixture.events, [['projection.remove', fixture.sourceScopeId]]);
    assert.ok(await fixture.repository.getScope(fixture.sourceScopeId));
    assert.equal((await fixture.repository.listImageLibraryAssets(fixture.targetScopeId, 'avatar'))[0].assetId, fixture.image.assetId);
    fixture.runtime.destroy();
}

async function testDuplicateFilenamesAreDisambiguatedByRemainingHostChats() {
    const fixture = await createFixture();
    const duplicate = scope('bob.png', 'chat-a');
    await fixture.repository.ensureScope(duplicate.scopeId, duplicate);
    fixture.chatFilesByHost.set('alice.png', []);
    fixture.chatFilesByHost.set('bob.png', ['chat-a', 'chat-b']);
    const result = await fixture.runtime.handleChatDeleted({
        deletedChatId: 'chat-a',
        hostId: 'bob.png',
    });

    assert.deepEqual(result, { status: 'deleted', scopeId: fixture.sourceScopeId });
    assert.deepEqual([...fixture.chatFileQueries].sort(), ['alice.png', 'bob.png']);
    assert.equal(await fixture.repository.getScope(fixture.sourceScopeId), null);
    assert.ok(await fixture.repository.getScope(duplicate.scopeId));
    fixture.runtime.destroy();
}

async function testDuplicateFilenameLookupFailureKeepsEveryCandidateScope() {
    const fixture = await createFixture();
    const duplicate = scope('bob.png', 'chat-a');
    await fixture.repository.ensureScope(duplicate.scopeId, duplicate);
    fixture.chatFilesByHost.set('bob.png', ['chat-a', 'chat-b']);
    fixture.unresolvedHostIds.add('alice.png');

    const result = await fixture.runtime.handleChatDeleted({
        deletedChatId: 'chat-a',
        hostId: 'bob.png',
    });

    assert.equal(result.status, 'unresolved');
    assert.deepEqual(fixture.events, []);
    assert.ok(await fixture.repository.getScope(fixture.sourceScopeId));
    assert.ok(await fixture.repository.getScope(duplicate.scopeId));
    fixture.runtime.destroy();
}

async function testGroupDeletionStaysUnconfirmedWithoutCleanupSideEffects() {
    const fixture = await createFixture();
    const groupScope = {
        scopeId: 'st:group:group-a',
        hostType: 'group',
        hostId: 'group-a',
        chatId: 'group-a',
        chatFile: 'group-a',
    };
    await fixture.repository.ensureScope(groupScope.scopeId, groupScope);
    fixture.events.length = 0;

    const result = await fixture.runtime.handleGroupChatDeleted('group-a');

    assert.deepEqual(result, { status: 'skipped', reason: 'group-delete-not-confirmed' });
    assert.deepEqual(fixture.events, []);
    assert.ok(await fixture.repository.getScope(groupScope.scopeId));
    fixture.runtime.destroy();
}

async function main() {
    await testHostDeletionRemovesProjectionBeforeScopeAndKeepsGlobalImages();
    await testProjectionFailureKeepsTheSourceScope();
    await testDuplicateFilenamesAreDisambiguatedByRemainingHostChats();
    await testDuplicateFilenameLookupFailureKeepsEveryCandidateScope();
    await testGroupDeletionStaysUnconfirmedWithoutCleanupSideEffects();
    console.log('[qq-v2-host-delete-contract] passed');
}

main().catch((error) => {
    console.error('[qq-v2-host-delete-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
