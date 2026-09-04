const assert = require('node:assert/strict');

async function main() {
    const { createQQV2Facade } = await import('../modules/qq-v2/application/facade.js');
    const calls = [];
    const listeners = new Set();
    const privateConversation = {
        conversationId: 'private-1',
        kind: 'private',
        status: 'active',
        person: { personId: 'person-1', formalName: 'Alice', avatarAssetId: 'avatar-1', signature: 'Hello there', gender: 'female', birthday: '2000-01-01' },
        remark: 'Ali',
        unreadCount: 2,
        request: { phase: 'idle', pendingUserMessageCount: 0, error: '' },
    };
    const groupConversation = {
        conversationId: 'group-1',
        kind: 'group',
        status: 'active',
        group: {
            groupId: 'group-1',
            name: 'Hidden group',
            mutes: { 'person-1': '永久' },
        },
        unreadCount: 9,
    };
    const runtime = {
        async getSnapshot() {
            return {
                phase: 'ready',
                context: {
                    scopeId: 'scope-alpha',
                    user: { name: 'Traveler', avatar: 'user.webp', privateHostState: 'must-not-leak' },
                    storyTime: '2042-05-20 09:30',
                },
                globalSettings: {
                    activeApiPresetId: 'api-main',
                    privateReplyPresetId: 'private-reply',
                    privateProactivePresetId: 'private-proactive',
                    groupReplyPresetId: 'group-reply',
                    groupProactivePresetId: 'group-proactive',
                    proactive: { enabled: true, everyTurns: 3, privateWeight: 50 },
                },
            };
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        async listConversations(input) {
            calls.push(['listConversations', input]);
            return [privateConversation, groupConversation];
        },
        async getConversation(input) {
            calls.push(['getConversation', input]);
            return input.conversationId === 'group-1' ? groupConversation : privateConversation;
        },
        async listMessages(input) {
            calls.push(['listMessages', input]);
            return {
                items: [{
                    messageId: input.conversationId === 'group-1' ? 'group-message-1' : 'private-message-1',
                    conversationId: input.conversationId,
                    senderId: 'person-1',
                    senderType: 'person',
                    type: 'text',
                    content: input.conversationId === 'group-1' ? 'must-not-leak' : 'Hello',
                    ...(input.conversationId === 'group-1'
                        ? {
                            quote: {
                                status: 'available',
                                messageId: 'quoted-1',
                                content: 'quoted content',
                                senderName: 'Alice',
                                storyTime: '2042-05-20 09:29',
                            },
                        }
                        : {}),
                }],
                hasMore: false,
                nextBeforeSequence: null,
            };
        },
        async getRequestState(input) { calls.push(['getRequestState', input]); return { phase: 'idle' }; },
        async getUnreadState(input) {
            calls.push(['getUnreadState', input]);
            return { total: 11, byConversationId: { 'private-1': 2, 'group-1': 9 } };
        },
        async getProactiveState(input) {
            calls.push(['getProactiveState', input]);
            return { enabled: true, everyTurns: 3 };
        },
        async updateGlobalSettings(input) {
            calls.push(['updateGlobalSettings', input]);
            return { ...input.settings };
        },
        async sendManual(input) {
            calls.push(['sendManual', input]);
            return { message: { messageId: 'private-message-2', ...input.message } };
        },
        async openConversation(input) { calls.push(['openConversation', input]); return { unreadCount: 0 }; },
        async updatePrivateProfile(input) { calls.push(['updatePrivateProfile', input]); return {}; },
        async removePrivateFriend(input) { calls.push(['removePrivateFriend', input]); return {}; },
        async handleIncomingTransfer(input) {
            calls.push(['handleIncomingTransfer', input]);
            return { messageId: input.messageId, type: 'transfer' };
        },
        async setMessageSelectedForInjection(input) {
            calls.push(['setMessageSelectedForInjection', input]);
            return { message: { messageId: input.messageId }, injection: {} };
        },
        async setMessagesSelectedForInjection(input) {
            calls.push(['setMessagesSelectedForInjection', input]);
            return { messages: input.messageIds.map((messageId) => ({ messageId })), injection: {} };
        },
        async setConversationInjection(input) { calls.push(['setConversationInjection', input]); return {}; },
        async deleteConversation(input) {
            calls.push(['deleteConversation', input]);
            return { deleted: true, mode: input.conversationId === 'group-1' ? 'group-history' : 'private' };
        },
        async generateMessageImage(input) {
            calls.push(['generateMessageImage', input]);
            return { message: { messageId: input.messageId, type: 'image' } };
        },
        async deleteMessages(input) {
            calls.push(['deleteMessages', input]);
            return { deletedMessageIds: input.messageIds };
        },
        async retryManual(input) {
            calls.push(['retryManual', input]);
            return { queued: true, pendingUserMessageCount: 1 };
        },
        async cancelManualRequest(input) {
            calls.push(['cancelManualRequest', input]);
            return { cancelled: true, phase: 'failed', pendingUserMessageCount: 2 };
        },
        async createGroupConversation(input) {
            calls.push(['createGroupConversation', input]);
            return {
                group: { groupId: 'group-2', name: input.name, ownerId: '__self__', memberIds: ['person-1', 'person-2'] },
                conversation: { conversationId: 'group-2', kind: 'group', groupId: 'group-2' },
            };
        },
        async manageGroup(input) {
            calls.push(['manageGroup', input]);
            return { groupId: input.groupId, name: input.value || 'Hidden group', ownerId: '__self__', memberIds: ['person-1', 'person-2'] };
        },
        async updateGroupProfile(input) {
            calls.push(['updateGroupProfile', input]);
            return {
                group: groupConversation.group,
                conversation: { ...groupConversation, backgroundAssetId: input.profile.backgroundAssetId },
            };
        },
    };
    const facade = createQQV2Facade({ runtime });

    const bootstrap = await facade.query.bootstrap();
    assert.equal(bootstrap.ok, true);
    assert.deepEqual(bootstrap.context, {
        scopeId: 'scope-alpha',
        user: { name: 'Traveler', avatar: 'user.webp' },
        storyTime: '2042-05-20 09:30',
    });
    assert.equal(bootstrap.globalSettings.groupReplyPresetId, 'group-reply');
    assert.equal(bootstrap.globalSettings.groupProactivePresetId, 'group-proactive');
    assert.deepEqual(bootstrap.globalSettings.proactive, { enabled: true, everyTurns: 3, privateWeight: 50 });
    assert.equal(JSON.stringify(bootstrap).includes('must-not-leak'), false);

    calls.length = 0;
    const conversations = await facade.query.conversations();
    assert.deepEqual(calls, [['listConversations', { scopeId: 'scope-alpha' }]]);
    assert.deepEqual(conversations.conversations.map((conversation) => ({
        conversationId: conversation.conversationId,
        kind: conversation.kind,
        title: conversation.title,
    })), [
        { conversationId: 'private-1', kind: 'private', title: 'Ali' },
        { conversationId: 'group-1', kind: 'group', title: 'Hidden group' },
    ]);

    const privateProfile = await facade.query.conversation({ conversationId: 'private-1' });
    assert.equal(privateProfile.conversation.signature, 'Hello there');
    assert.equal(privateProfile.conversation.gender, 'female');
    assert.equal(privateProfile.conversation.birthday, '2000-01-01');
    calls.length = 0;
    const groupProfile = await facade.query.conversation({ conversationId: 'group-1' });
    assert.equal(groupProfile.conversation.kind, 'group');
    assert.deepEqual(groupProfile.conversation.group.mutes, { 'person-1': '永久' });
    assert.deepEqual(calls, [['getConversation', { scopeId: 'scope-alpha', conversationId: 'group-1' }]]);

    calls.length = 0;
    const groupMessages = await facade.query.messages({ conversationId: 'group-1' });
    assert.equal(groupMessages.page.items[0].content, 'must-not-leak');
    assert.equal(groupMessages.page.items[0].quote.senderName, 'Alice');
    assert.equal(groupMessages.page.items[0].quote.storyTime, '2042-05-20 09:29');
    assert.deepEqual(calls, [
        ['getConversation', { scopeId: 'scope-alpha', conversationId: 'group-1' }],
        ['listMessages', { scopeId: 'scope-alpha', conversationId: 'group-1' }],
    ]);

    calls.length = 0;
    assert.deepEqual(await facade.query.unread(), {
        ok: true,
        status: 'ready',
        unread: { total: 11, display: '11', byConversationId: { 'private-1': 2, 'group-1': 9 } },
    });
    assert.deepEqual(calls, [
        ['getUnreadState', { scopeId: 'scope-alpha' }],
        ['listConversations', { scopeId: 'scope-alpha' }],
    ]);

    calls.length = 0;
    assert.deepEqual(await facade.query.proactiveState(), {
        ok: true,
        status: 'ready',
        proactive: { enabled: true, everyTurns: 3, privateWeight: 50 },
    });
    assert.deepEqual(calls, [['getProactiveState', { scopeId: 'scope-alpha' }]]);

    calls.length = 0;
    assert.equal((await facade.intent.createGroupConversation({
        name: 'New group',
        memberIds: ['person-1', 'person-2'],
    })).ok, true);
    assert.equal((await facade.intent.manageGroup({
        groupId: 'group-1',
        action: 'rename',
        value: 'Renamed group',
    })).ok, true);
    assert.equal((await facade.intent.updateGroupProfile({
        conversationId: 'group-1',
        profile: { backgroundAssetId: 'background-1' },
    })).ok, true);
    assert.deepEqual(calls.map(([name]) => name), [
        'createGroupConversation',
        'manageGroup',
        'getConversation',
        'updateGroupProfile',
    ]);

    calls.length = 0;
    assert.deepEqual(await facade.intent.openConversation({ conversationId: 'group-1' }), {
        ok: true,
        status: 'accepted',
        unreadCount: 0,
    });
    assert.deepEqual(calls, [
        ['getConversation', { scopeId: 'scope-alpha', conversationId: 'group-1' }],
        ['openConversation', { scopeId: 'scope-alpha', conversationId: 'group-1' }],
    ]);

    calls.length = 0;
    for (const [name, run] of [
        ['update private profile', () => facade.intent.updatePrivateProfile({ conversationId: 'group-1', profile: {} })],
        ['remove private friend', () => facade.intent.removePrivateFriend({ conversationId: 'group-1' })],
    ]) {
        calls.length = 0;
        assert.deepEqual(await run(), {
            ok: false,
            status: 'not-found',
            reason: 'conversation-not-found',
        }, `${name} must remain private-only`);
        assert.deepEqual(calls, [['getConversation', { scopeId: 'scope-alpha', conversationId: 'group-1' }]]);
    }

    for (const [name, runtimeCall, run] of [
        ['request state', 'getRequestState', () => facade.query.requestState({ conversationId: 'group-1' })],
        ['handle incoming transfer', 'handleIncomingTransfer', () => facade.intent.handleIncomingTransfer({ conversationId: 'group-1', messageId: 'message-1', action: 'accept' })],
        ['set message injection', 'setMessageSelectedForInjection', () => facade.intent.setMessageInjection({ conversationId: 'group-1', messageId: 'message-1', selected: true })],
        ['set messages injection', 'setMessagesSelectedForInjection', () => facade.intent.setMessagesInjection({ conversationId: 'group-1', messageIds: ['message-1'], selected: true })],
        ['set conversation injection', 'setConversationInjection', () => facade.intent.setConversationInjection({ conversationId: 'group-1', injection: { enabled: true } })],
        ['delete conversation', 'deleteConversation', () => facade.intent.deleteConversation({ conversationId: 'group-1' })],
        ['generate message image', 'generateMessageImage', () => facade.intent.generateMessageImage({ conversationId: 'group-1', messageId: 'message-1' })],
        ['delete messages', 'deleteMessages', () => facade.intent.deleteMessages({ conversationId: 'group-1', messageIds: ['message-1'] })],
        ['retry request', 'retryManual', () => facade.intent.retryRequest({ conversationId: 'group-1' })],
        ['cancel manual request', 'cancelManualRequest', () => facade.intent.cancelManualRequest({ conversationId: 'group-1' })],
        ['send message', 'sendManual', () => facade.intent.sendMessage({ conversationId: 'group-1', message: { type: 'text', content: 'Hello group' } })],
    ]) {
        calls.length = 0;
        assert.equal((await run()).ok, true, `${name} must support group conversations`);
        assert.equal(calls[0][0], 'getConversation');
        assert.equal(calls[1][0], runtimeCall);
    }

    calls.length = 0;
    const updated = await facade.intent.updateGlobalSettings({
        settings: {
            privateReplyPresetId: 'private-next',
            groupReplyPresetId: 'group-reply-next',
            groupProactivePresetId: 'group-proactive-next',
            proactive: { privateWeight: 10 },
        },
    });
    assert.equal(updated.ok, true);
    assert.equal(updated.settings.groupReplyPresetId, 'group-reply-next');
    assert.equal(updated.settings.groupProactivePresetId, 'group-proactive-next');
    assert.equal(updated.settings.proactive.privateWeight, 10);
    assert.deepEqual(calls, [['updateGlobalSettings', {
        scopeId: 'scope-alpha',
        settings: {
            privateReplyPresetId: 'private-next',
            groupReplyPresetId: 'group-reply-next',
            groupProactivePresetId: 'group-proactive-next',
            proactive: { privateWeight: 10 },
        },
        userName: 'Traveler',
        storyTime: '2042-05-20 09:30',
    }]]);

    calls.length = 0;
    const toolMessages = [
        { type: 'voice', content: '我到了。' },
        { type: 'image', content: '雨后的站台' },
        { type: 'video', content: '列车驶过月台' },
        { type: 'transfer', content: '车费', transfer: { amount: '8.8', currency: '', note: '车费', status: 'pending' } },
        { type: 'sticker', content: '晚安', stickerId: 'sticker-1' },
    ];
    for (const message of toolMessages) {
        const sent = await facade.intent.sendMessage({ conversationId: 'private-1', message });
        assert.equal(sent.ok, true);
        assert.equal(sent.result.message.type, message.type);
        assert.equal(sent.result.message.content, message.content);
    }
    assert.deepEqual(calls.filter(([name]) => name === 'sendManual'), toolMessages.map((message) => ['sendManual', {
        scopeId: 'scope-alpha',
        conversationId: 'private-1',
        message,
        userName: 'Traveler',
        storyTime: '2042-05-20 09:30',
    }]));
    assert.equal((await facade.intent.sendMessage({
        conversationId: 'private-1',
        message: toolMessages[3],
    })).result.message.transfer.currency, '', 'Facade must not invent a fixed transfer currency');

    calls.length = 0;
    assert.deepEqual(await facade.intent.cancelManualRequest({ conversationId: 'private-1' }), {
        ok: true,
        status: 'accepted',
        result: { cancelled: true, phase: 'failed', pendingUserMessageCount: 2 },
    });
    assert.deepEqual(calls, [
        ['getConversation', { scopeId: 'scope-alpha', conversationId: 'private-1' }],
        ['cancelManualRequest', { scopeId: 'scope-alpha', conversationId: 'private-1' }],
    ]);

    calls.length = 0;
    assert.equal((await facade.intent.handleIncomingTransfer({
        conversationId: 'private-1',
        messageId: 'transfer-1',
        action: 'accept',
    })).ok, true);
    assert.deepEqual(calls, [
        ['getConversation', { scopeId: 'scope-alpha', conversationId: 'private-1' }],
        ['handleIncomingTransfer', {
            scopeId: 'scope-alpha',
            conversationId: 'private-1',
            messageId: 'transfer-1',
            action: 'accept',
            storyTime: '2042-05-20 09:30',
        }],
    ], 'Handling an incoming transfer must not start a manual AI request');
}

main().then(() => console.log('[qq-v2-facade-contract] passed')).catch((error) => {
    console.error('[qq-v2-facade-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
