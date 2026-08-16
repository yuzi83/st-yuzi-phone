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
        group: { groupId: 'group-1', name: 'Hidden group' },
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
                    proactive: { enabled: true, everyTurns: 3 },
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
            return { ...input.settings, groupReplyPresetId: 'group-reply', groupProactivePresetId: 'group-proactive' };
        },
        async sendManual(input) {
            calls.push(['sendManual', input]);
            return { message: { messageId: 'private-message-2', ...input.message } };
        },
        async openConversation(input) { calls.push(['openConversation', input]); return { unreadCount: 0 }; },
        async updatePrivateProfile(input) { calls.push(['updatePrivateProfile', input]); return {}; },
        async removePrivateFriend(input) { calls.push(['removePrivateFriend', input]); return {}; },
        async handleIncomingTransfer(input) { calls.push(['handleIncomingTransfer', input]); return {}; },
        async setMessageSelectedForInjection(input) { calls.push(['setMessageSelectedForInjection', input]); return {}; },
        async setConversationInjection(input) { calls.push(['setConversationInjection', input]); return {}; },
        async deleteConversation(input) { calls.push(['deleteConversation', input]); return {}; },
        async deleteMessages(input) { calls.push(['deleteMessages', input]); return {}; },
        async retryManual(input) { calls.push(['retryManual', input]); return {}; },
        async cancelManualRequest(input) {
            calls.push(['cancelManualRequest', input]);
            return { cancelled: true, phase: 'failed', pendingUserMessageCount: 2 };
        },
        async createGroupConversation(input) { calls.push(['createGroupConversation', input]); },
        async manageGroup(input) { calls.push(['manageGroup', input]); },
        async updateGroupProfile(input) { calls.push(['updateGroupProfile', input]); },
    };
    const facade = createQQV2Facade({ runtime });

    const bootstrap = await facade.query.bootstrap();
    assert.equal(bootstrap.ok, true);
    assert.deepEqual(bootstrap.context, {
        scopeId: 'scope-alpha',
        user: { name: 'Traveler', avatar: 'user.webp' },
        storyTime: '2042-05-20 09:30',
    });
    assert.equal(Object.hasOwn(bootstrap.globalSettings, 'groupReplyPresetId'), false);
    assert.equal(Object.hasOwn(bootstrap.globalSettings, 'groupProactivePresetId'), false);
    assert.deepEqual(bootstrap.globalSettings.proactive, { enabled: true, everyTurns: 3 });
    assert.equal(JSON.stringify(bootstrap).includes('must-not-leak'), false);

    calls.length = 0;
    const conversations = await facade.query.conversations();
    assert.deepEqual(calls, [['listConversations', { scopeId: 'scope-alpha' }]]);
    assert.deepEqual(conversations.conversations.map((conversation) => ({
        conversationId: conversation.conversationId,
        kind: conversation.kind,
        title: conversation.title,
    })), [{ conversationId: 'private-1', kind: 'private', title: 'Ali' }]);

    const privateProfile = await facade.query.conversation({ conversationId: 'private-1' });
    assert.equal(privateProfile.conversation.signature, 'Hello there');
    assert.equal(privateProfile.conversation.gender, 'female');
    assert.equal(privateProfile.conversation.birthday, '2000-01-01');
    calls.length = 0;
    assert.deepEqual(await facade.query.conversation({ conversationId: 'group-1' }), {
        ok: false,
        status: 'not-found',
        reason: 'conversation-not-found',
    });
    assert.deepEqual(calls, [['getConversation', { scopeId: 'scope-alpha', conversationId: 'group-1' }]]);

    calls.length = 0;
    assert.deepEqual(await facade.query.messages({ conversationId: 'group-1' }), {
        ok: false,
        status: 'not-found',
        reason: 'conversation-not-found',
    });
    assert.deepEqual(calls, [['getConversation', { scopeId: 'scope-alpha', conversationId: 'group-1' }]]);

    calls.length = 0;
    assert.deepEqual(await facade.query.unread(), {
        ok: true,
        status: 'ready',
        unread: { total: 2, display: '2', byConversationId: { 'private-1': 2 } },
    });
    assert.deepEqual(calls, [
        ['getUnreadState', { scopeId: 'scope-alpha' }],
        ['listConversations', { scopeId: 'scope-alpha' }],
    ]);

    calls.length = 0;
    assert.deepEqual(await facade.query.proactiveState(), {
        ok: true,
        status: 'ready',
        proactive: { enabled: true, everyTurns: 3 },
    });
    assert.deepEqual(calls, [['getProactiveState', { scopeId: 'scope-alpha' }]]);

    calls.length = 0;
    assert.equal((await facade.intent.createGroupConversation({ name: 'Hidden group' })).status, 'disabled');
    assert.equal((await facade.intent.manageGroup({ groupId: 'group-1', action: 'rename' })).status, 'disabled');
    assert.equal((await facade.intent.updateGroupProfile({ conversationId: 'group-1' })).status, 'disabled');
    assert.deepEqual(calls, []);

    calls.length = 0;
    for (const [name, run] of [
        ['request state', () => facade.query.requestState({ conversationId: 'group-1' })],
        ['open conversation', () => facade.intent.openConversation({ conversationId: 'group-1' })],
        ['update private profile', () => facade.intent.updatePrivateProfile({ conversationId: 'group-1', profile: {} })],
        ['remove private friend', () => facade.intent.removePrivateFriend({ conversationId: 'group-1' })],
        ['handle incoming transfer', () => facade.intent.handleIncomingTransfer({ conversationId: 'group-1', messageId: 'message-1', action: 'accept' })],
        ['set message injection', () => facade.intent.setMessageInjection({ conversationId: 'group-1', messageId: 'message-1', selected: true })],
        ['set conversation injection', () => facade.intent.setConversationInjection({ conversationId: 'group-1', injection: { enabled: true } })],
        ['delete conversation', () => facade.intent.deleteConversation({ conversationId: 'group-1' })],
        ['delete messages', () => facade.intent.deleteMessages({ conversationId: 'group-1', messageIds: ['message-1'] })],
        ['retry request', () => facade.intent.retryRequest({ conversationId: 'group-1' })],
        ['cancel manual request', () => facade.intent.cancelManualRequest({ conversationId: 'group-1' })],
        ['send message', () => facade.intent.sendMessage({ conversationId: 'group-1', message: { type: 'text', content: 'No group messages' } })],
    ]) {
        calls.length = 0;
        assert.deepEqual(await run(), {
            ok: false,
            status: 'not-found',
            reason: 'conversation-not-found',
        }, `${name} must hide a group conversation from the UI`);
        assert.deepEqual(calls, [['getConversation', { scopeId: 'scope-alpha', conversationId: 'group-1' }]],
            `${name} must not forward a group conversation to its runtime action`);
    }

    calls.length = 0;
    const updated = await facade.intent.updateGlobalSettings({
        settings: {
            privateReplyPresetId: 'private-next',
            groupReplyPresetId: 'must-not-save',
            groupProactivePresetId: 'must-not-save',
        },
    });
    assert.equal(updated.ok, true);
    assert.equal(Object.hasOwn(updated.settings, 'groupReplyPresetId'), false);
    assert.equal(Object.hasOwn(updated.settings, 'groupProactivePresetId'), false);
    assert.deepEqual(calls, [['updateGlobalSettings', {
        scopeId: 'scope-alpha',
        settings: { privateReplyPresetId: 'private-next' },
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
