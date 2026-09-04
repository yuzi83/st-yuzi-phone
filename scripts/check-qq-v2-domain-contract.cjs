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

async function testScopeIsolationAndStablePeople() {
    const repository = await createRepository();
    const first = await repository.createPrivateConversation('scope-a', { name: '  林知夏  ' });
    const duplicate = await repository.createPrivateConversation('scope-a', { name: '林知夏' });
    const otherScope = await repository.createPrivateConversation('scope-b', { name: '林知夏' });

    assert.equal(first.created, true);
    assert.equal(duplicate.created, true);
    assert.notEqual(duplicate.conversation.conversationId, first.conversation.conversationId);
    assert.notEqual(otherScope.person.personId, first.person.personId);
    assert.equal((await repository.listConversations('scope-a')).length, 2);
    assert.equal((await repository.listConversations('scope-b')).length, 1);
}

async function testMessagesKeepStoryTimeAndDeletedQuotesDoNotLeakOriginalContent() {
    const repository = await createRepository();
    const { conversation, person } = await repository.createPrivateConversation('scope-a', { name: '林知夏' });
    const [first] = await repository.appendMessages('scope-a', conversation.conversationId, [{
        senderId: '__self__',
        senderType: 'self',
        type: 'text',
        content: '第一句',
        storyTime: '',
    }]);
    const [reply] = await repository.appendMessages('scope-a', conversation.conversationId, [{
        senderId: person.personId,
        senderType: 'person',
        type: 'text',
        content: '回复第一句',
        quoteMessageId: first.messageId,
        storyTime: '2042-05-01 10:00',
    }]);

    assert.equal(first.storyTime, '');
    assert.equal(first.sequence, 1);
    assert.equal(reply.sequence, 2);
    const beforeDeletion = await repository.listMessages('scope-a', conversation.conversationId);
    assert.equal(beforeDeletion.at(-1).quote.senderName, '用户');
    assert.equal(beforeDeletion.at(-1).quote.storyTime, '');
    const deletion = await repository.deleteMessages('scope-a', conversation.conversationId, [first.messageId, 'missing-message']);
    assert.deepEqual(deletion.deletedMessageIds, [first.messageId]);
    const messages = await repository.listMessages('scope-a', conversation.conversationId);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].quote.status, 'deleted');
    assert.equal(messages[0].quote.content, '');

}

async function testGroupPermissionsMuteExitAndReinvite() {
    const repository = await createRepository();
    const alice = await repository.createPrivateConversation('scope-a', { name: 'Alice' });
    const bob = await repository.createPrivateConversation('scope-a', { name: 'Bob' });
    const group = await repository.createGroupConversation('scope-a', {
        name: '测试群',
        memberIds: [alice.person.personId, bob.person.personId],
        ownerId: alice.person.personId,
    });

    await repository.appointAdministrator('scope-a', group.group.groupId, alice.person.personId, bob.person.personId, '2042-05-01 10:00');
    const managementMessages = await repository.listMessages('scope-a', group.conversation.conversationId);
    assert.equal(
        managementMessages.at(-1).content,
        'Bob已被设为管理员',
        'group management system messages must show the member real name instead of the internal person id',
    );
    await repository.muteGroupMember('scope-a', group.group.groupId, bob.person.personId, '__self__', '1 小时', '2042-05-01 10:00');
    await assert.rejects(() => repository.appendMessages('scope-a', group.conversation.conversationId, [{
        senderId: '__self__',
        senderType: 'self',
        type: 'text',
        content: '我被禁言了',
        storyTime: '2042-05-01 10:30',
    }]), /禁言/);

    await repository.kickGroupMember('scope-a', group.group.groupId, alice.person.personId, '__self__', '2042-05-01 10:31');
    assert.equal((await repository.getConversation('scope-a', group.conversation.conversationId)).status, 'exited');
    await repository.reinviteSelf('scope-a', group.group.groupId, alice.person.personId, '2042-05-01 10:32');
    assert.equal((await repository.getConversation('scope-a', group.conversation.conversationId)).status, 'active');
    const groupAfterInvite = await repository.getGroup('scope-a', group.group.groupId);
    assert.equal(groupAfterInvite.selfRole, 'member');
}

async function testNpcGroupMessagesContinueAfterCurrentUserExits() {
    const repository = await createRepository();
    const alice = await repository.createPrivateConversation('scope-a', { name: 'Alice' });
    const bob = await repository.createPrivateConversation('scope-a', { name: 'Bob' });
    const group = await repository.createGroupConversation('scope-a', {
        name: '后台继续聊天群',
        memberIds: [alice.person.personId, bob.person.personId],
        ownerId: alice.person.personId,
    });

    await repository.kickGroupMember(
        'scope-a',
        group.group.groupId,
        alice.person.personId,
        '__self__',
        '2026-09-04 10:00',
    );
    const [message] = await repository.appendMessages('scope-a', group.conversation.conversationId, [{
        senderId: bob.person.personId,
        senderType: 'person',
        type: 'text',
        content: '她退群之后我们继续聊。',
        storyTime: '2026-09-04 10:01',
    }]);

    assert.equal(message.content, '她退群之后我们继续聊。');
    await assert.rejects(() => repository.appendMessages('scope-a', group.conversation.conversationId, [{
        senderId: '__self__',
        senderType: 'self',
        type: 'text',
        content: '退出后不能发言',
        storyTime: '2026-09-04 10:02',
    }]), /已退出|只读|不在当前群聊/);
}

async function testCurrentUserCanLeaveGroupButOwnerMustTransferFirst() {
    const repository = await createRepository();
    const alice = await repository.createPrivateConversation('scope-a', { name: 'Alice' });
    const bob = await repository.createPrivateConversation('scope-a', { name: 'Bob' });
    const memberGroup = await repository.createGroupConversation('scope-a', {
        name: '成员退群测试',
        memberIds: [alice.person.personId, bob.person.personId],
        ownerId: alice.person.personId,
    });
    const [pendingTransfer] = await repository.appendMessages('scope-a', memberGroup.conversation.conversationId, [{
        senderId: alice.person.personId,
        senderType: 'person',
        type: 'transfer',
        content: '退群前给你的转账',
        storyTime: '2026-09-04 10:00',
        transfer: { amount: '100', recipientId: '__self__', status: 'pending' },
    }]);

    await repository.manageGroup('scope-a', {
        groupId: memberGroup.group.groupId,
        action: 'leave',
        storyTime: '2026-09-04 10:01',
    });

    const leftGroup = await repository.getGroup('scope-a', memberGroup.group.groupId);
    const leftConversation = await repository.getConversation('scope-a', memberGroup.conversation.conversationId);
    const messages = await repository.listMessages('scope-a', memberGroup.conversation.conversationId);
    assert.equal(leftGroup.selfExited, true);
    assert.equal(leftGroup.selfRole, 'member');
    assert.equal(leftConversation.status, 'exited');
    assert.equal(
        messages.find((message) => message.messageId === pendingTransfer.messageId).transfer.status,
        'returned',
    );
    assert.equal(messages.at(-1).content, '用户退出了群聊');
    await assert.rejects(() => repository.appendMessages('scope-a', memberGroup.conversation.conversationId, [{
        senderId: '__self__',
        senderType: 'self',
        type: 'text',
        content: '退出后不能再发言',
        storyTime: '2026-09-04 10:02',
    }]), (error) => error?.code === 'group_read_only');
    assert.equal((await repository.appendMessages('scope-a', memberGroup.conversation.conversationId, [{
        senderId: bob.person.personId,
        senderType: 'person',
        type: 'text',
        content: 'NPC 继续聊天',
        storyTime: '2026-09-04 10:03',
    }]))[0].content, 'NPC 继续聊天');

    const ownerGroup = await repository.createGroupConversation('scope-a', {
        name: '群主退群测试',
        memberIds: [alice.person.personId, bob.person.personId],
    });
    await assert.rejects(() => repository.manageGroup('scope-a', {
        groupId: ownerGroup.group.groupId,
        action: 'leave',
        storyTime: '2026-09-04 10:04',
    }), (error) => error?.code === 'group_owner_must_transfer');
    assert.equal((await repository.getConversation(
        'scope-a',
        ownerGroup.conversation.conversationId,
    )).status, 'active');
}

async function testConversationDeletionCleansOwnedAssetsButRetainsPersonUsedByGroup() {
    const repository = await createRepository();
    const alice = await repository.createPrivateConversation('scope-a', { name: 'Alice' });
    const bob = await repository.createPrivateConversation('scope-a', { name: 'Bob' });
    await repository.createGroupConversation('scope-a', {
        name: '测试群',
        memberIds: [alice.person.personId, bob.person.personId],
    });
    await repository.saveScopeAsset('scope-a', {
        conversationId: alice.conversation.conversationId,
        kind: 'background',
        blob: new Blob(['asset']),
    });

    await repository.deleteConversation('scope-a', alice.conversation.conversationId);
    assert.equal(await repository.getPerson('scope-a', alice.person.personId) !== null, true);
    assert.equal((await repository.listScopeAssets('scope-a', alice.conversation.conversationId)).length, 0);
}

async function testConversationDeletionReportsItsUserFacingDisposition() {
    const repository = await createRepository();
    const alice = await repository.createPrivateConversation('scope-a', { name: 'Alice' });
    const bob = await repository.createPrivateConversation('scope-a', { name: 'Bob' });
    const charlie = await repository.createPrivateConversation('scope-a', { name: 'Charlie' });

    assert.equal((await repository.deleteConversation('scope-a', charlie.conversation.conversationId)).mode, 'private');

    const ownedGroup = await repository.createGroupConversation('scope-a', {
        name: 'Owned group',
        memberIds: [alice.person.personId, bob.person.personId],
    });
    await repository.appendMessages('scope-a', ownedGroup.conversation.conversationId, [{
        senderId: '__self__',
        senderType: 'self',
        type: 'text',
        content: '清空前的群消息',
        storyTime: '2026-09-04 11:00',
    }]);
    assert.equal((await repository.deleteConversation('scope-a', ownedGroup.conversation.conversationId)).mode, 'group-history');
    assert.ok(await repository.getGroup('scope-a', ownedGroup.group.groupId));
    assert.ok(await repository.getConversation('scope-a', ownedGroup.conversation.conversationId));
    assert.deepEqual(await repository.listMessages('scope-a', ownedGroup.conversation.conversationId), []);

    const joinedGroup = await repository.createGroupConversation('scope-a', {
        name: 'Joined group',
        memberIds: [alice.person.personId, bob.person.personId],
        ownerId: alice.person.personId,
    });
    assert.equal((await repository.deleteConversation('scope-a', joinedGroup.conversation.conversationId)).mode, 'group-history');
    assert.ok(await repository.getGroup('scope-a', joinedGroup.group.groupId));
}

async function testDeletingPrivateConversationRetainsItsFriendAvatar() {
    const repository = await createRepository();
    const privateChat = await repository.createPrivateConversation('scope-a', { name: 'Alice' });
    const avatar = await repository.saveScopeAsset('scope-a', {
        kind: 'avatar',
        blob: new Blob(['avatar'], { type: 'image/webp' }),
        mimeType: 'image/webp',
    });
    await repository.updatePrivateProfile('scope-a', privateChat.conversation.conversationId, {
        avatarAssetId: avatar.assetId,
    });

    await repository.deleteConversation('scope-a', privateChat.conversation.conversationId);
    assert.equal((await repository.getPerson('scope-a', privateChat.person.personId)).formalName, 'Alice');
    assert.equal((await repository.listScopeAssets('scope-a')).some((asset) => asset.assetId === avatar.assetId), true);
}

async function testHistoricalNpcMessagesKeepTheirSenderSnapshot() {
    const repository = await createRepository();
    const privateChat = await repository.createPrivateConversation('scope-a', { name: 'Alice' });
    const originalAvatar = await repository.saveScopeAsset('scope-a', {
        kind: 'avatar',
        blob: new Blob(['original avatar'], { type: 'image/webp' }),
        mimeType: 'image/webp',
    });
    await repository.updatePrivateProfile('scope-a', privateChat.conversation.conversationId, {
        avatarAssetId: originalAvatar.assetId,
    });
    await repository.appendMessages('scope-a', privateChat.conversation.conversationId, [{
        senderId: privateChat.person.personId,
        senderType: 'person',
        type: 'text',
        content: 'A historical reply',
        storyTime: '2042-05-01 10:00',
    }]);
    const replacementAvatar = await repository.saveScopeAsset('scope-a', {
        kind: 'avatar',
        blob: new Blob(['replacement avatar'], { type: 'image/webp' }),
        mimeType: 'image/webp',
    });
    await repository.updatePrivateProfile('scope-a', privateChat.conversation.conversationId, {
        avatarAssetId: replacementAvatar.assetId,
    });

    const [message] = await repository.listMessages('scope-a', privateChat.conversation.conversationId);
    assert.equal(message.senderName, 'Alice');
    assert.equal(message.senderAvatarAssetId, replacementAvatar.assetId);
    assert.equal((await repository.listScopeAssets('scope-a')).some((asset) => asset.assetId === originalAvatar.assetId), false);

    await repository.deleteMessages('scope-a', privateChat.conversation.conversationId, [message.messageId]);
    assert.equal((await repository.listScopeAssets('scope-a')).some((asset) => asset.assetId === originalAvatar.assetId), false);
}

async function testDeletingConversationReleasesHistoricalAvatarSnapshots() {
    const repository = await createRepository();
    const privateChat = await repository.createPrivateConversation('scope-a', { name: 'Alice' });
    const originalAvatar = await repository.saveScopeAsset('scope-a', {
        kind: 'avatar',
        blob: new Blob(['original avatar'], { type: 'image/webp' }),
        mimeType: 'image/webp',
    });
    await repository.updatePrivateProfile('scope-a', privateChat.conversation.conversationId, {
        avatarAssetId: originalAvatar.assetId,
    });
    await repository.appendMessages('scope-a', privateChat.conversation.conversationId, [{
        senderId: privateChat.person.personId,
        senderType: 'person',
        type: 'text',
        content: 'A historical reply',
        storyTime: '2042-05-01 10:00',
    }]);
    const replacementAvatar = await repository.saveScopeAsset('scope-a', {
        kind: 'avatar',
        blob: new Blob(['replacement avatar'], { type: 'image/webp' }),
        mimeType: 'image/webp',
    });
    await repository.updatePrivateProfile('scope-a', privateChat.conversation.conversationId, {
        avatarAssetId: replacementAvatar.assetId,
    });

    await repository.deleteConversation('scope-a', privateChat.conversation.conversationId);
    const remainingAssetIds = new Set((await repository.listScopeAssets('scope-a')).map((asset) => asset.assetId));
    assert.equal(remainingAssetIds.has(originalAvatar.assetId), false);
    assert.equal(remainingAssetIds.has(replacementAvatar.assetId), true);
}

async function testHandlingIncomingTransferChangesOnlyItsPersistedState() {
    const repository = await createRepository();
    const privateChat = await repository.createPrivateConversation('scope-a', { name: 'Alice' });
    const [transfer] = await repository.appendMessages('scope-a', privateChat.conversation.conversationId, [{
        senderId: privateChat.person.personId,
        senderType: 'person',
        type: 'transfer',
        content: 'Travel funds',
        storyTime: '2042-05-01 10:00',
        transfer: { amount: '88', currency: 'USD', note: 'Travel funds', status: 'pending' },
    }]);

    const handled = await repository.handleIncomingTransfer(
        'scope-a',
        privateChat.conversation.conversationId,
        transfer.messageId,
        'accept',
        '2042-05-01 10:05',
    );

    assert.equal(handled.transfer.status, 'accepted');
    assert.equal(handled.transfer.handledStoryTime, '2042-05-01 10:05');
    const [stored] = await repository.listMessages('scope-a', privateChat.conversation.conversationId);
    assert.equal(stored.transfer.status, 'accepted');
    await assert.rejects(() => repository.handleIncomingTransfer(
        'scope-a',
        privateChat.conversation.conversationId,
        transfer.messageId,
        'return',
        '2042-05-01 10:06',
    ), (error) => error?.code === 'transfer_not_pending');
}

async function testGroupTransfersRespectRecipientsAndReturnWhenTheyLeave() {
    const repository = await createRepository();
    const alice = await repository.createPrivateConversation('scope-a', { name: 'Alice' });
    const bob = await repository.createPrivateConversation('scope-a', { name: 'Bob' });
    const group = await repository.createGroupConversation('scope-a', {
        name: 'Transfer group',
        memberIds: [alice.person.personId, bob.person.personId],
    });
    const conversationId = group.conversation.conversationId;
    const [incoming] = await repository.appendMessages('scope-a', conversationId, [{
        senderId: alice.person.personId,
        senderType: 'person',
        type: 'transfer',
        content: '给你',
        storyTime: '2026-09-04 10:00',
        transfer: { amount: '100', recipientId: '__self__', status: 'pending' },
    }]);
    assert.equal((await repository.handleIncomingTransfer(
        'scope-a',
        conversationId,
        incoming.messageId,
        'accept',
        '2026-09-04 10:01',
    )).transfer.status, 'accepted');

    const [npcTransfer] = await repository.appendMessages('scope-a', conversationId, [{
        senderId: alice.person.personId,
        senderType: 'person',
        type: 'transfer',
        content: '给 Bob',
        storyTime: '2026-09-04 10:02',
        transfer: { amount: '8', recipientId: bob.person.personId, status: 'pending' },
    }]);
    await repository.applyAIActions('scope-a', [{
        type: 'transfer',
        conversation: 'G1',
        message: npcTransfer.messageId,
        actor: bob.person.personId,
        action: 'accept',
    }], {
        references: { G1: conversationId },
        storyTime: '2026-09-04 10:03',
    });
    assert.equal((await repository.listMessages('scope-a', conversationId))
        .find((message) => message.messageId === npcTransfer.messageId).transfer.status, 'accepted');

    const [pendingForAlice] = await repository.appendMessages('scope-a', conversationId, [{
        senderId: '__self__',
        senderType: 'self',
        type: 'transfer',
        content: '待退回',
        storyTime: '2026-09-04 10:04',
        transfer: { amount: '20', recipientId: alice.person.personId, status: 'pending' },
    }]);
    await repository.manageGroup('scope-a', {
        groupId: group.group.groupId,
        action: 'kick',
        targetPersonId: alice.person.personId,
        storyTime: '2026-09-04 10:05',
    });
    assert.equal((await repository.listMessages('scope-a', conversationId))
        .find((message) => message.messageId === pendingForAlice.messageId).transfer.status, 'returned');
}

async function testPrivateProfileUsesOnlyScopedMediaAndPreservesPersonIdentity() {
    const repository = await createRepository();
    const privateChat = await repository.createPrivateConversation('scope-a', { name: 'Alice' });
    const avatar = await repository.saveScopeAsset('scope-a', {
        kind: 'avatar',
        blob: new Blob(['avatar'], { type: 'image/webp' }),
        mimeType: 'image/webp',
    });
    const background = await repository.saveScopeAsset('scope-a', {
        conversationId: privateChat.conversation.conversationId,
        kind: 'background',
        blob: new Blob(['background'], { type: 'image/webp' }),
        mimeType: 'image/webp',
    });
    await repository.ensureScope('scope-b');
    const foreignAsset = await repository.saveScopeAsset('scope-b', {
        kind: 'avatar',
        blob: new Blob(['foreign'], { type: 'image/webp' }),
        mimeType: 'image/webp',
    });

    const result = await repository.updatePrivateProfile('scope-a', privateChat.conversation.conversationId, {
        remark: 'Alicia',
        avatarAssetId: avatar.assetId,
        backgroundAssetId: background.assetId,
        formalName: 'Alicia',
    });
    assert.equal(result.person.formalName, 'Alicia');
    assert.equal(result.person.avatarAssetId, avatar.assetId);
    assert.equal(result.conversation.remark, 'Alicia');
    assert.equal(result.conversation.backgroundAssetId, background.assetId);

    const replacementAvatar = await repository.saveScopeAsset('scope-a', {
        kind: 'avatar',
        blob: new Blob(['replacement avatar'], { type: 'image/webp' }),
        mimeType: 'image/webp',
    });
    await repository.updatePrivateProfile('scope-a', privateChat.conversation.conversationId, {
        avatarAssetId: replacementAvatar.assetId,
    });
    assert.equal((await repository.listScopeAssets('scope-a')).some((asset) => asset.assetId === avatar.assetId), false);

    await assert.rejects(() => repository.updatePrivateProfile('scope-a', privateChat.conversation.conversationId, {
        avatarAssetId: foreignAsset.assetId,
    }), (error) => error?.code === 'asset_not_found');
    await assert.rejects(() => repository.updatePrivateProfile('scope-a', privateChat.conversation.conversationId, {
        avatarAssetId: background.assetId,
    }), (error) => error?.code === 'asset_kind_mismatch');
    await assert.rejects(() => repository.updatePrivateProfile('scope-a', privateChat.conversation.conversationId, {
        backgroundAssetId: replacementAvatar.assetId,
    }), (error) => error?.code === 'asset_kind_mismatch');
}

async function testGroupProfileOnlyOwnsLocalBackground() {
    const repository = await createRepository();
    const alice = await repository.createPrivateConversation('scope-a', { name: 'Alice' });
    const bob = await repository.createPrivateConversation('scope-a', { name: 'Bob' });
    const groupChat = await repository.createGroupConversation('scope-a', {
        name: 'Original group',
        memberIds: [alice.person.personId, bob.person.personId],
    });
    const background = await repository.saveScopeAsset('scope-a', {
        conversationId: groupChat.conversation.conversationId,
        kind: 'background',
        blob: new Blob(['group background'], { type: 'image/webp' }),
        mimeType: 'image/webp',
    });

    const result = await repository.updateGroupProfile('scope-a', groupChat.conversation.conversationId, {
        backgroundAssetId: background.assetId,
        name: 'Must not bypass group management',
    });
    assert.equal(result.group.name, 'Original group');
    assert.equal(result.conversation.backgroundAssetId, background.assetId);
    await assert.rejects(() => repository.updateGroupProfile('scope-a', alice.conversation.conversationId, {}), (error) => (
        error?.code === 'group_conversation_required'
    ));
}

async function testOpeningConversationClearsItsUnreadCounter() {
    const repository = await createRepository();
    const privateChat = await repository.createPrivateConversation('scope-a', { name: 'Alice' });
    const conversationId = privateChat.conversation.conversationId;

    assert.equal((await repository.incrementConversationUnread('scope-a', conversationId, 2)).unreadCount, 2);
    assert.equal((await repository.getConversation('scope-a', conversationId)).unreadCount, 2);
    assert.equal((await repository.openConversation('scope-a', conversationId)).unreadCount, 0);
    assert.equal((await repository.getConversation('scope-a', conversationId)).unreadCount, 0);
    await assert.rejects(() => repository.incrementConversationUnread('scope-a', conversationId, 0), (error) => (
        error?.code === 'unread_increment_invalid'
    ));
}

async function testGroupManagementUsesCurrentUsersRealPermission() {
    const repository = await createRepository();
    const alice = await repository.createPrivateConversation('scope-a', { name: 'Alice' });
    const bob = await repository.createPrivateConversation('scope-a', { name: 'Bob' });
    const charlie = await repository.createPrivateConversation('scope-a', { name: 'Charlie' });
    const groupChat = await repository.createGroupConversation('scope-a', {
        name: 'Original group',
        memberIds: [alice.person.personId, bob.person.personId],
    });
    const groupId = groupChat.group.groupId;

    assert.equal((await repository.manageGroup('scope-a', {
        groupId,
        action: 'rename',
        value: 'Renamed group',
        storyTime: '2042-05-01 10:00',
    })).name, 'Renamed group');
    assert.deepEqual((await repository.manageGroup('scope-a', {
        groupId,
        action: 'add',
        targetPersonId: charlie.person.personId,
        storyTime: '2042-05-01 10:01',
    })).memberIds.sort(), [alice.person.personId, bob.person.personId, charlie.person.personId].sort());
    await repository.manageGroup('scope-a', {
        groupId,
        action: 'appoint-admin',
        targetPersonId: alice.person.personId,
        storyTime: '2042-05-01 10:02',
    });
    await repository.manageGroup('scope-a', {
        groupId,
        action: 'mute',
        targetPersonId: alice.person.personId,
        duration: '1 小时',
        storyTime: '2042-05-01 10:03',
    });
    await assert.rejects(() => repository.appendMessages('scope-a', groupChat.conversation.conversationId, [{
        senderId: alice.person.personId,
        senderType: 'person',
        type: 'text',
        content: 'Muted message',
        storyTime: '2042-05-01 10:04',
    }]), (error) => error?.code === 'group_member_muted');

    await repository.manageGroup('scope-a', {
        groupId,
        action: 'transfer-owner',
        targetPersonId: alice.person.personId,
        storyTime: '2042-05-01 10:05',
    });
    await assert.rejects(() => repository.manageGroup('scope-a', {
        groupId,
        action: 'rename',
        value: 'Forbidden rename',
    }), (error) => error?.code === 'permission_denied');
}

async function testAiActionBatchIsAtomicAndNewConversationNeedsFirstMessage() {
    const repository = await createRepository();
    const alice = await repository.createPrivateConversation('scope-a', { name: 'Alice' });
    const bob = await repository.createPrivateConversation('scope-a', { name: 'Bob' });
    const group = await repository.createGroupConversation('scope-a', {
        name: '测试群',
        memberIds: [alice.person.personId, bob.person.personId],
    });

    await assert.rejects(() => repository.applyAIActions('scope-a', [
        {
            type: 'message',
            conversation: 'P1',
            sender: alice.person.personId,
            messageType: 'text',
            content: '这条不能留下',
            mentions: [],
            mentionAll: false,
        },
        {
            type: 'group',
            conversation: 'G1',
            action: 'kick',
            actor: bob.person.personId,
            target: alice.person.personId,
        },
    ], {
        references: { P1: alice.conversation.conversationId, G1: group.conversation.conversationId },
        storyTime: '2042-05-01 10:00',
    }));
    assert.equal((await repository.listMessages('scope-a', alice.conversation.conversationId)).length, 0);

    await assert.rejects(() => repository.applyAIActions('scope-a', [{
        type: 'create-private',
        id: 'P2',
        name: '新人物',
    }], { references: {}, storyTime: '2042-05-01 10:00' }), /首条消息/);

    const result = await repository.applyAIActions('scope-a', [
        { type: 'create-private', id: 'P2', name: '新人物' },
        {
            type: 'message',
            conversation: 'P2',
            sender: 'new-person',
            senderPersonReference: 'P2',
            messageType: 'text',
            content: '你好，我来加你好友。',
            mentions: [],
            mentionAll: false,
        },
    ], { references: {}, storyTime: '2042-05-01 10:00' });
    assert.equal(result.createdConversationIds.length, 1);
    assert.equal((await repository.getConversation('scope-a', result.createdConversationIds[0])).unreadCount, 0);
    assert.equal((await repository.listMessages('scope-a', result.createdConversationIds[0])).length, 1);
}

async function testScopedProjectionWriteRevalidatesInsideTransaction() {
    const { createMemoryQQV2StateStore } = await importModule('modules/qq-v2/storage/state-store.js');
    const { createQQV2Repository } = await importModule('modules/qq-v2/domain/repository.js');
    const stateStore = createMemoryQQV2StateStore();
    const repository = createQQV2Repository({ stateStore });
    const { conversation } = await repository.createPrivateConversation('scope-a', { name: 'Alice' });
    const before = (await repository.getConversation('scope-a', conversation.conversationId)).injection.projection;

    let releaseBlocker;
    let markBlockerEntered;
    const blockerEntered = new Promise((resolve) => { markBlockerEntered = resolve; });
    const blocker = stateStore.transact(async () => {
        markBlockerEntered();
        await new Promise((resolve) => { releaseBlocker = resolve; });
    });
    await blockerEntered;

    let current = true;
    const scopeSession = {
        scopeId: 'scope-a',
        isCurrent: () => current,
        assertCurrent() {
            if (current) return this;
            const error = new Error('QQ scope scope-a is no longer current');
            error.code = 'scope_inactive';
            throw error;
        },
    };
    const write = repository.setConversationProjection(
        'scope-a',
        conversation.conversationId,
        { bookName: '不应写入', managedBookNames: ['不应写入'], pending: true },
        { scopeSession },
    );
    const rejected = assert.rejects(write, (error) => error?.code === 'scope_inactive');
    current = false;
    releaseBlocker();

    await blocker;
    await rejected;
    assert.deepEqual(
        (await repository.getConversation('scope-a', conversation.conversationId)).injection.projection,
        before,
        '失效 Scope Session 的排队事务不得修改 projection 状态',
    );
}

async function testScopedConversationOpenRevalidatesInsideTransaction() {
    const { createMemoryQQV2StateStore } = await importModule('modules/qq-v2/storage/state-store.js');
    const { createQQV2Repository } = await importModule('modules/qq-v2/domain/repository.js');
    const stateStore = createMemoryQQV2StateStore();
    const repository = createQQV2Repository({ stateStore });
    const { conversation } = await repository.createPrivateConversation('scope-a', { name: 'Alice' });
    await repository.incrementConversationUnread('scope-a', conversation.conversationId, 2);

    let releaseBlocker;
    let markBlockerEntered;
    const blockerEntered = new Promise((resolve) => { markBlockerEntered = resolve; });
    const blocker = stateStore.transact(async () => {
        markBlockerEntered();
        await new Promise((resolve) => { releaseBlocker = resolve; });
    });
    await blockerEntered;

    let current = true;
    const scopeSession = {
        scopeId: 'scope-a',
        isCurrent: () => current,
        assertCurrent() {
            if (current) return this;
            const error = new Error('QQ scope scope-a is no longer current');
            error.code = 'scope_inactive';
            throw error;
        },
    };
    const open = repository.openConversation('scope-a', conversation.conversationId, { scopeSession });
    const rejected = assert.rejects(open, (error) => error?.code === 'scope_inactive');
    current = false;
    releaseBlocker();

    await blocker;
    await rejected;
    assert.equal(
        (await repository.getConversation('scope-a', conversation.conversationId)).unreadCount,
        2,
        'A queued stale Scope Session must not clear unread state.',
    );
}

async function main() {
    await testScopeIsolationAndStablePeople();
    await testMessagesKeepStoryTimeAndDeletedQuotesDoNotLeakOriginalContent();
    await testGroupPermissionsMuteExitAndReinvite();
    await testNpcGroupMessagesContinueAfterCurrentUserExits();
    await testCurrentUserCanLeaveGroupButOwnerMustTransferFirst();
    await testConversationDeletionCleansOwnedAssetsButRetainsPersonUsedByGroup();
    await testConversationDeletionReportsItsUserFacingDisposition();
    await testDeletingPrivateConversationRetainsItsFriendAvatar();
    await testHistoricalNpcMessagesKeepTheirSenderSnapshot();
    await testDeletingConversationReleasesHistoricalAvatarSnapshots();
    await testHandlingIncomingTransferChangesOnlyItsPersistedState();
    await testGroupTransfersRespectRecipientsAndReturnWhenTheyLeave();
    await testPrivateProfileUsesOnlyScopedMediaAndPreservesPersonIdentity();
    await testGroupProfileOnlyOwnsLocalBackground();
    await testOpeningConversationClearsItsUnreadCounter();
    await testGroupManagementUsesCurrentUsersRealPermission();
    await testAiActionBatchIsAtomicAndNewConversationNeedsFirstMessage();
    await testScopedProjectionWriteRevalidatesInsideTransaction();
    await testScopedConversationOpenRevalidatesInsideTransaction();
    console.log('[qq-v2-domain-contract] passed');
}

main().catch((error) => {
    console.error('[qq-v2-domain-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
