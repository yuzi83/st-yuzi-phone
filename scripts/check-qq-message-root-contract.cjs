const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
    const { __test__ } = await import('../modules/qq-v2/ui/app.js');
    const calls = [];
    const facade = {
        query: {
            async conversations() {
                calls.push('conversations');
                return {
                    ok: true,
                    conversations: [
                        {
                            conversationId: 'empty-first', kind: 'private', status: 'active', title: 'Empty first', unreadCount: 0,
                        },
                        {
                            conversationId: 'yesterday', kind: 'private', status: 'active', title: 'Yesterday', unreadCount: 3,
                            lastMessage: { messageId: 'm-yesterday', type: 'voice', storyTime: '2042-05-19 07:20' },
                        },
                        {
                            conversationId: 'today', kind: 'private', status: 'active', title: 'Today', unreadCount: 120,
                            lastMessage: { messageId: 'm-today', type: 'text', content: 'Latest', storyTime: '2042-05-20 09:30' },
                        },
                        {
                            conversationId: 'group-visible', kind: 'group', status: 'active', title: 'Study group',
                            lastMessage: {
                                messageId: 'm-group',
                                type: 'text',
                                content: 'Latest group message',
                                senderType: 'person',
                                senderName: 'Alice',
                                storyTime: '2042-05-20 10:00',
                            },
                        },
                        {
                            conversationId: 'contact-hidden', kind: 'private', status: 'contact', title: 'Contact only',
                        },
                        {
                            conversationId: 'same-time-a', kind: 'private', status: 'active', title: 'Same time A',
                            lastMessage: { messageId: 'm-same-a', type: 'image', storyTime: '2042-05-18 11:00' },
                        },
                        {
                            conversationId: 'same-time-b', kind: 'private', status: 'active', title: 'Same time B',
                            lastMessage: { messageId: 'm-same-b', type: 'transfer', storyTime: '2042-05-18 11:00' },
                        },
                        {
                            conversationId: 'video', kind: 'private', status: 'active', title: 'Video',
                            lastMessage: { messageId: 'm-video', type: 'video', storyTime: '2042-05-17 11:00' },
                        },
                        {
                            conversationId: 'sticker', kind: 'private', status: 'active', title: 'Sticker',
                            lastMessage: { messageId: 'm-sticker', type: 'sticker', storyTime: '2042-04-01 11:00' },
                        },
                        {
                            conversationId: 'missing-time', kind: 'private', status: 'active', title: 'No time',
                            lastMessage: { messageId: 'm-no-time', type: 'text', content: 'No clock', storyTime: '' },
                        },
                    ],
                };
            },
            async currentContext() {
                calls.push('currentContext');
                return { ok: true, context: { storyTime: '2042-05-20 10:00' } };
            },
        },
    };

    const model = await __test__.loadMessageRootModel(facade);
    assert.deepEqual(new Set(calls), new Set(['conversations', 'currentContext']));
    assert.deepEqual(model.rows.map((row) => row.conversation.conversationId), [
        'group-visible', 'today', 'yesterday', 'same-time-a', 'same-time-b', 'video', 'sticker', 'missing-time', 'empty-first',
    ]);
    assert.equal(model.rows.find((row) => row.conversation.conversationId === 'group-visible').preview, 'Alice：Latest group message');
    assert.equal(model.rows.find((row) => row.conversation.conversationId === 'today').preview, 'Latest');
    assert.equal(model.rows.find((row) => row.conversation.conversationId === 'yesterday').preview, '[语音]');
    assert.equal(model.rows.find((row) => row.conversation.conversationId === 'same-time-a').preview, '[图片]');
    assert.equal(model.rows.find((row) => row.conversation.conversationId === 'video').preview, '[视频]');
    assert.equal(model.rows.find((row) => row.conversation.conversationId === 'same-time-b').preview, '[转账]');
    assert.equal(model.rows.find((row) => row.conversation.conversationId === 'sticker').preview, '[表情]');
    assert.equal(model.rows.find((row) => row.conversation.conversationId === 'today').time, '09:30');
    assert.equal(model.rows.find((row) => row.conversation.conversationId === 'yesterday').time, '昨天');
    assert.equal(model.rows.find((row) => row.conversation.conversationId === 'same-time-a').time, '2天前');
    assert.equal(model.rows.find((row) => row.conversation.conversationId === 'video').time, '3天前');
    assert.equal(model.rows.find((row) => row.conversation.conversationId === 'sticker').time, '2042-04-01');
    assert.equal(model.rows.find((row) => row.conversation.conversationId === 'missing-time').time, '');
    assert.equal(model.rows.find((row) => row.conversation.conversationId === 'empty-first').preview, '');
    assert.equal(model.rows.find((row) => row.conversation.conversationId === 'empty-first').time, '');
    assert.equal(model.rows.find((row) => row.conversation.conversationId === 'today').unreadLabel, '99+');
    assert.equal(__test__.chatStatusText({
        kind: 'group',
        group: { memberIds: ['alice', 'bob'], selfExited: false },
    }), '3名成员');
    assert.equal(__test__.chatStatusText({
        kind: 'group',
        group: { memberIds: ['alice', 'bob'], selfExited: true },
    }), '已退出 · 2名成员');
    assert.equal(__test__.groupRoleLabel({ ownerId: 'alice', adminIds: ['bob'] }, 'alice'), '群主');
    assert.equal(__test__.groupRoleLabel({ ownerId: 'alice', adminIds: ['bob'] }, 'bob'), '管理员');
    assert.equal(__test__.groupRoleLabel({ ownerId: 'alice', adminIds: ['bob'] }, 'carol'), '');
    const transferGroup = {
        kind: 'group',
        group: {
            members: [
                { personId: 'alice', formalName: 'Alice' },
                { personId: 'bob', formalName: 'Bob' },
            ],
        },
    };
    assert.deepEqual(__test__.groupTransferRecipients(transferGroup), [
        { personId: 'alice', formalName: 'Alice' },
        { personId: 'bob', formalName: 'Bob' },
    ]);
    assert.equal(__test__.transferRecipientName(transferGroup, {
        transfer: { recipientId: 'bob' },
    }), 'Bob');
    assert.equal(__test__.transferRecipientName(transferGroup, {
        transfer: { recipientId: '__self__' },
    }), '你');
    assert.equal(__test__.canCurrentUserHandleTransfer(transferGroup, {
        senderType: 'person',
        transfer: { recipientId: 'alice', status: 'pending' },
    }), false);
    assert.equal(__test__.canCurrentUserHandleTransfer(transferGroup, {
        senderType: 'person',
        transfer: { recipientId: '__self__', status: 'pending' },
    }), true);
    assert.deepEqual(__test__.groupMemberManagementActions({
        status: 'active',
        selfRole: 'owner',
        selfExited: false,
        ownerId: '__self__',
        adminIds: ['alice'],
        mutes: { alice: '永久' },
    }, 'alice'), ['revoke-admin', 'unmute', 'kick', 'transfer-owner']);
    assert.deepEqual(__test__.groupMemberManagementActions({
        status: 'active',
        selfRole: 'admin',
        selfExited: false,
        ownerId: 'alice',
        adminIds: ['__self__'],
        mutes: {},
    }, 'bob'), ['mute', 'kick']);
    assert.deepEqual(__test__.groupMemberManagementActions({
        status: 'active',
        selfRole: 'admin',
        selfExited: false,
        ownerId: 'alice',
        adminIds: ['__self__', 'bob'],
        mutes: {},
    }, 'bob'), []);
    assert.deepEqual(__test__.groupMemberManagementActions({
        status: 'active',
        selfRole: 'member',
        selfExited: false,
        ownerId: 'alice',
        adminIds: [],
        mutes: {},
    }, 'bob'), []);
    assert.equal(__test__.groupLifecycleAction({
        status: 'active',
        selfRole: 'owner',
        selfExited: false,
    }), 'dissolve');
    assert.equal(__test__.groupLifecycleAction({
        status: 'active',
        selfRole: 'admin',
        selfExited: false,
    }), 'leave');
    assert.equal(__test__.groupLifecycleAction({
        status: 'active',
        selfRole: 'member',
        selfExited: true,
    }), '');
    assert.deepEqual(__test__.groupFriendCandidates([
        { conversationId: 'p1', kind: 'private', status: 'active', personId: 'alice', formalName: 'Alice' },
        { conversationId: 'p2', kind: 'private', status: 'contact', personId: 'bob', formalName: 'Bob' },
        { conversationId: 'p3', kind: 'private', status: 'readonly', personId: 'carol', formalName: 'Carol' },
        { conversationId: 'g1', kind: 'group', status: 'active', groupId: 'group-1', title: '群聊' },
    ], ['alice']).map((conversation) => conversation.personId), ['bob']);
    assert.equal(__test__.canCreateUserGroup('新群', ['alice', 'bob']), true);
    assert.equal(__test__.canCreateUserGroup('新群', ['alice']), false);
    assert.equal(__test__.canCreateUserGroup('  ', ['alice', 'bob']), false);
    assert.equal(__test__.shouldRenameGroup({
        status: 'active',
        selfExited: false,
        selfRole: 'owner',
        name: '旧群名',
    }, '新群名'), true);
    assert.equal(__test__.shouldRenameGroup({
        status: 'active',
        selfExited: false,
        selfRole: 'owner',
        name: '旧群名',
    }, '旧群名'), false);
    assert.equal(__test__.shouldRenameGroup({
        status: 'active',
        selfExited: false,
        selfRole: 'member',
        name: '旧群名',
    }, '新群名'), false);
    assert.deepEqual(__test__.conversationDeletionCopy({
        kind: 'group',
        status: 'active',
        group: { status: 'active', selfExited: false },
    }), {
        title: '清空聊天记录',
        message: '只会清空当前群聊历史并从消息页隐藏，群联系人仍会保留。',
        confirmLabel: '清空',
    });
    assert.deepEqual(__test__.conversationDeletionCopy({
        kind: 'group',
        status: 'exited',
        group: { status: 'active', selfExited: true },
    }), {
        title: '删除群聊',
        message: '将永久删除该群聊及本地历史，删除后不可恢复。',
        confirmLabel: '删除',
    });

    const emptyModel = await __test__.loadMessageRootModel({
        query: {
            async conversations() { return { ok: true, conversations: [] }; },
            async currentContext() { return { ok: true, context: { storyTime: '2042-05-20 10:00' } }; },
        },
    });
    assert.equal(emptyModel.rows.length, 0, 'an empty message list must stay content-empty');
    assert.equal(emptyModel.chrome.hasSearch, true);
    assert.equal(emptyModel.chrome.hasPresence, true);
    assert.equal(emptyModel.chrome.hasAddMount, true);

    const anchor = __test__.planConversationListAnchor({
        previousConversationIds: ['alice', 'bravo', 'charlie'],
        nextConversationIds: ['new-top', 'alice', 'bravo', 'charlie'],
        anchorConversationId: 'bravo',
        previousScrollTop: 140,
        previousAnchorOffset: 12,
        nextAnchorOffset: 64,
    });
    assert.deepEqual(anchor, { conversationId: 'bravo', scrollTop: 192 });
    assert.equal(__test__.planConversationListAnchor({
        previousConversationIds: ['alice'],
        nextConversationIds: ['new-top'],
        anchorConversationId: 'alice',
        previousScrollTop: 20,
        previousAnchorOffset: 0,
        nextAnchorOffset: 20,
    }), null);

    const row = (conversationId, top, bottom) => ({
        dataset: { qqConversationId: conversationId },
        getBoundingClientRect: () => ({ top, bottom }),
    });
    const root = (rows, { top, bottom, scrollTop }) => ({
        scrollTop,
        querySelectorAll: () => rows,
        getBoundingClientRect: () => ({ top, bottom }),
    });
    const previousRoot = root([
        row('alice', 60, 100),
        row('bravo', 112, 152),
        row('charlie', 164, 204),
    ], { top: 100, bottom: 300, scrollTop: 140 });
    const capturedAnchor = __test__.captureConversationListAnchor(previousRoot);
    assert.deepEqual(capturedAnchor, {
        previousConversationIds: ['alice', 'bravo', 'charlie'],
        anchorConversationId: 'bravo',
        previousScrollTop: 140,
        previousAnchorOffset: 12,
    });

    const refreshedRoot = root([
        row('new-top', 112, 152),
        row('alice', 124, 164),
        row('bravo', 164, 204),
        row('charlie', 204, 244),
    ], { top: 100, bottom: 300, scrollTop: 0 });
    assert.equal(__test__.restoreConversationListAnchor(refreshedRoot, capturedAnchor), true);
    assert.equal(refreshedRoot.scrollTop, 192, 'refresh must retain the first visible conversation anchor');

    const staleRoot = root([
        row('new-top', 112, 152),
        row('alice', 124, 164),
        row('bravo', 164, 204),
        row('charlie', 204, 244),
    ], { top: 100, bottom: 300, scrollTop: 0 });
    let queuedRestore;
    __test__.scheduleConversationListAnchorRestore({
        anchor: capturedAnchor,
        token: 4,
        isActive: () => false,
        getRoot: () => staleRoot,
        enqueue: (callback) => { queuedRestore = callback; },
    });
    queuedRestore();
    assert.equal(staleRoot.scrollTop, 0, 'a stale render must not change the newest list scroll position');

    const appSource = fs.readFileSync(path.join(process.cwd(), 'modules/qq-v2/ui/app.js'), 'utf8');
    const cssSource = fs.readFileSync(path.join(process.cwd(), 'styles/phone-base/12-qq-app.css'), 'utf8');
    assert.match(appSource, /yuzi-qq-group-avatar/, 'group rows use member-composite avatars');
    assert.match(appSource, /yuzi-qq-group-message-identity/, 'incoming group messages show sender identity');
    assert.match(appSource, /data-qq-group-member-profile/, 'group message avatars open the sender profile in group context');
    assert.match(appSource, /conversation\.kind === 'group'[\s\S]*'data-qq-chat'/,
        'group rows in Contacts open the group conversation directly');
    assert.match(appSource, /dataset\.qqTransferRecipient/,
        'group transfer dialog exposes an explicit recipient selector');
    assert.match(appSource, /转给：/,
        'group transfer cards show their recipient');
    assert.match(appSource, /data-qq-group-members/,
        'group details expose a member grid');
    assert.match(appSource, /data-qq-add-group-member/,
        'group managers can add an existing QQ friend from group details');
    assert.match(appSource, /data-qq-group-lifecycle/,
        'group details expose leave or dissolve according to the current role');
    assert.match(appSource, /group-member-edit/,
        'group-only member management stays inside the group profile edit route');
    assert.match(appSource, /reset\(\)\s*\{[\s\S]*quoteDrafts\.clearAll\(\);[\s\S]*mentionDrafts\.clear\(\);/,
        'reset clears group quote and mention drafts');
    assert.match(appSource, /destroy\(\)\s*\{[\s\S]*quoteDrafts\.clearAll\(\);[\s\S]*mentionDrafts\.clear\(\);/,
        'destroy clears group quote and mention drafts');
    assert.match(cssSource, /\.yuzi-qq-group-avatar\b/, 'group avatar composition has scoped QQ styling');
    assert.match(cssSource, /\.yuzi-qq-group-message-identity\b/, 'group sender name and role badge have scoped QQ styling');
    assert.match(cssSource, /\.yuzi-qq-group-members\b/, 'group member grid has scoped QQ styling');
    assert.match(cssSource, /\.yuzi-qq-group-member-editor-actions\b/,
        'group member management actions remain reachable in the scoped editor');
}

main().then(() => console.log('[qq-message-root-contract] passed')).catch((error) => {
    console.error('[qq-message-root-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
