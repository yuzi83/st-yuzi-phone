const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');

async function main() {
    const { createMemoryQQV2StateStore } = await import('../modules/qq-v2/storage/state-store.js');
    const { createQQV2Repository } = await import('../modules/qq-v2/domain/repository.js');
    const { createQQV2ProductionRuntime } = await import('../modules/qq-v2/application/production-runtime.js');
    const scopeId = 'st:private-ui-boundary';
    const stateStore = createMemoryQQV2StateStore();
    const repository = createQQV2Repository({ stateStore });
    const runtime = createQQV2ProductionRuntime({
        host: {
            readScope: () => ({ scopeId, chatId: 'private-ui-boundary', chatFile: 'private-ui-boundary', hostType: 'character', hostId: 'test' }),
            readUserIdentity: () => ({ name: 'User', avatar: '' }), readStoryTime: () => '2042-05-20 09:30', readStoryMessages: () => [], readRawContext: () => ({}),
        }, stateStore, repository, cryptoApi: webcrypto, backend: { async generate() {}, async loadModels() { return []; } },
        worldbookGateway: { async loadBook() { return { entries: {} }; }, async saveBook() {} },
    });
    await runtime.initialize();
    const friend = await runtime.createPrivateConversation({ scopeId, name: 'Alice' });
    const secondFriend = await runtime.createPrivateConversation({ scopeId, name: 'Bob' });
    // Existing group data remains in storage for a future re-enable, but the
    // private-only runtime must make it unreachable through its public API.
    const group = await repository.createGroupConversation(scopeId, {
        name: 'Hidden group',
        memberIds: [friend.person.personId, secondFriend.person.personId],
    });
    await repository.appendMessages(scopeId, group.conversation.conversationId, [{
        senderId: friend.person.personId,
        senderType: 'person',
        type: 'text',
        content: 'This group history stays stored but hidden.',
        storyTime: '2042-05-20 09:30',
    }]);
    await repository.incrementConversationUnread(scopeId, group.conversation.conversationId, 7);
    const facade = runtime.getFacade();
    const settings = (await facade.query.globalSettings()).settings;
    assert.equal(Object.hasOwn(settings, 'groupReplyPresetId'), false);
    assert.equal(Object.hasOwn(settings, 'groupProactivePresetId'), false);
    const conversations = await facade.query.conversations();
    assert.equal(conversations.ok, true);
    assert.equal(conversations.conversations.every((item) => item.kind === 'private'), true, 'Facade must not expose groups');
    assert.equal((await facade.query.conversation({ conversationId: group.conversation.conversationId })).status, 'not-found');
    assert.equal((await facade.intent.createGroupConversation({ name: 'Nope', memberIds: [] })).status, 'disabled');
    assert.equal((await facade.intent.manageGroup({ groupId: 'anything', action: 'rename' })).status, 'disabled');
    assert.equal((await facade.intent.updateGroupProfile({
        conversationId: group.conversation.conversationId,
        profile: { backgroundAssetId: 'asset-hidden-group' },
    })).status, 'disabled');
    assert.deepEqual(await runtime.listMessages({ scopeId, conversationId: group.conversation.conversationId }), {
        items: [], hasMore: false, nextBeforeSequence: null,
    });
    assert.equal(await runtime.getConversation({ scopeId, conversationId: group.conversation.conversationId }), null);
    assert.deepEqual(await runtime.getUnreadState({ scopeId }), {
        total: 0,
        byConversationId: {
            [friend.conversation.conversationId]: 0,
            [secondFriend.conversation.conversationId]: 0,
        },
    });
    for (const attempt of [
        () => runtime.openConversation({ scopeId, conversationId: group.conversation.conversationId }),
        () => runtime.updateGroupProfile({ scopeId, conversationId: group.conversation.conversationId, profile: { name: 'Nope' } }),
        () => runtime.manageGroup({ scopeId, groupId: group.group.groupId, action: 'rename', value: 'Nope' }),
        () => runtime.setConversationInjection({ scopeId, conversationId: group.conversation.conversationId, injection: { enabled: true } }),
        () => runtime.setMessageSelectedForInjection({ scopeId, conversationId: group.conversation.conversationId, messageId: 'missing', selected: true }),
        () => runtime.deleteMessages({ scopeId, conversationId: group.conversation.conversationId, messageIds: ['missing'] }),
        () => runtime.deleteConversation({ scopeId, conversationId: group.conversation.conversationId }),
        () => runtime.sendManual({ scopeId, conversationId: group.conversation.conversationId, message: { type: 'text', content: 'Nope' } }),
        () => runtime.retryManual({ scopeId, conversationId: group.conversation.conversationId }),
    ]) {
        await assert.rejects(attempt, (error) => error?.code === 'private_only');
    }
    const retainedGroup = await repository.getConversation(scopeId, group.conversation.conversationId);
    const retainedMessages = await repository.listMessages(scopeId, group.conversation.conversationId);
    assert.equal(retainedGroup?.kind, 'group');
    assert.equal(retainedGroup?.unreadCount, 7);
    assert.deepEqual(retainedMessages.map((message) => message.content), ['This group history stays stored but hidden.']);
    runtime.destroy();
}

main().then(() => console.log('[qq-private-ui-boundary] 检查通过')).catch((error) => { console.error('[qq-private-ui-boundary] failed'); console.error(error); process.exitCode = 1; });
