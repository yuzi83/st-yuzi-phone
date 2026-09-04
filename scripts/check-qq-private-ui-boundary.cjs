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
            readUserIdentity: () => ({ name: 'User', avatar: '' }), readStoryTime: () => '2026-09-04 09:30', readStoryMessages: () => [], readRawContext: () => ({}),
        }, stateStore, repository, cryptoApi: webcrypto, backend: { async generate() {}, async loadModels() { return []; } },
        worldbookGateway: { async loadBook() { return { entries: {} }; }, async saveBook() {} },
    });
    await runtime.initialize();
    const friend = await runtime.createPrivateConversation({ scopeId, name: 'Alice' });
    const secondFriend = await runtime.createPrivateConversation({ scopeId, name: 'Bob' });
    const group = await repository.createGroupConversation(scopeId, {
        name: 'Visible group',
        memberIds: [friend.person.personId, secondFriend.person.personId],
    });
    await repository.appendMessages(scopeId, group.conversation.conversationId, [{
        senderId: friend.person.personId,
        senderType: 'person',
        type: 'text',
        content: 'This group history is public through QQ v2.',
        storyTime: '2026-09-04 09:30',
    }]);
    await repository.incrementConversationUnread(scopeId, group.conversation.conversationId, 7);
    const facade = runtime.getFacade();
    const settings = (await facade.query.globalSettings()).settings;
    assert.equal(settings.groupReplyPresetId, 'builtin-group-reply');
    assert.equal(settings.groupProactivePresetId, 'builtin-group-proactive');
    const conversations = await facade.query.conversations();
    assert.equal(conversations.ok, true);
    assert.equal(
        conversations.conversations.some((item) => item.conversationId === group.conversation.conversationId && item.kind === 'group'),
        true,
        'Facade exposes active groups beside private conversations',
    );
    assert.equal(
        (await facade.query.conversation({ conversationId: group.conversation.conversationId })).conversation.kind,
        'group',
    );
    assert.equal(
        (await facade.query.messages({ conversationId: group.conversation.conversationId })).page.items[0].content,
        'This group history is public through QQ v2.',
    );
    assert.equal((await facade.query.unread()).unread.byConversationId[group.conversation.conversationId], 7);
    assert.equal((await facade.intent.openConversation({
        conversationId: group.conversation.conversationId,
    })).ok, true);
    assert.equal((await facade.query.unread()).unread.byConversationId[group.conversation.conversationId], 0);
    assert.equal((await facade.intent.createGroupConversation({
        name: 'Another group',
        memberIds: [friend.person.personId, secondFriend.person.personId],
    })).ok, true);
    assert.equal((await facade.intent.manageGroup({
        groupId: group.group.groupId,
        action: 'rename',
        value: 'Renamed group',
    })).ok, true);
    assert.equal((await facade.intent.updateGroupProfile({
        conversationId: group.conversation.conversationId,
        profile: { backgroundAssetId: '' },
    })).ok, true);
    assert.equal((await facade.intent.deleteConversation({
        conversationId: group.conversation.conversationId,
    })).ok, true);
    const retainedGroup = await repository.getConversation(scopeId, group.conversation.conversationId);
    const retainedMessages = await repository.listMessages(scopeId, group.conversation.conversationId);
    assert.equal(retainedGroup?.kind, 'group');
    assert.equal(retainedGroup?.hiddenFromMessages, true);
    assert.deepEqual(retainedMessages, []);
    for (const attempt of [
        () => facade.intent.updatePrivateProfile({ conversationId: group.conversation.conversationId, profile: {} }),
        () => facade.intent.removePrivateFriend({ conversationId: group.conversation.conversationId }),
    ]) {
        assert.equal((await attempt()).status, 'not-found', 'private-profile actions remain private-only');
    }
    runtime.destroy();
}

main().then(() => console.log('[qq-private-ui-boundary] 检查通过')).catch((error) => { console.error('[qq-private-ui-boundary] failed'); console.error(error); process.exitCode = 1; });
