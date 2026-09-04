const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');

async function main() {
    const { __test__ } = await import('../modules/qq-v2/ui/app.js');
    const { createMemoryQQV2StateStore } = await import('../modules/qq-v2/storage/state-store.js');
    const { createQQV2Repository } = await import('../modules/qq-v2/domain/repository.js');
    const { createQQV2ProductionRuntime } = await import('../modules/qq-v2/application/production-runtime.js');
    const scopeId = 'st:friend-profile'; const stateStore = createMemoryQQV2StateStore();

    const contactsModel = await __test__.loadContactsRootModel({
        query: {
            async conversations() {
                return {
                    ok: true,
                    conversations: [
                        { conversationId: 'contact-only', kind: 'private', status: 'contact', formalName: '无聊天好友' },
                        { conversationId: 'active-chat', kind: 'private', status: 'active', formalName: '有聊天好友', title: '聊天备注' },
                        { conversationId: 'readonly-history', kind: 'private', status: 'readonly', formalName: '非好友' },
                        {
                            conversationId: 'study-group',
                            kind: 'group',
                            status: 'active',
                            title: '学习群',
                            group: { selfExited: false },
                        },
                        {
                            conversationId: 'left-group',
                            kind: 'group',
                            status: 'exited',
                            title: '已退出群',
                            group: { selfExited: true },
                        },
                    ],
                };
            },
        },
    });
    assert.deepEqual(contactsModel.contacts.map((contact) => contact.conversationId), [
        'contact-only',
        'active-chat',
        'study-group',
        'left-group',
    ], 'contacts must mix private friends, joined groups and left read-only groups in Facade order');
    assert.equal(contactsModel.contacts[1].formalName, '有聊天好友', 'contacts must use the person name, not a chat remark');
    assert.equal(contactsModel.contacts[2].formalName, '学习群');
    assert.equal(contactsModel.contacts[3].formalName, '已退出群');

    const friendProfile = __test__.profileViewModel({ status: 'active', formalName: '有聊天好友' });
    assert.deepEqual(friendProfile.actions, ['remove-friend', 'edit-profile', 'message']);
    const readonlyProfile = __test__.profileViewModel({ status: 'readonly', formalName: '非好友' });
    assert.deepEqual(readonlyProfile.actions, ['restore-friend', 'edit-profile', 'message']);
    assert.equal(readonlyProfile.messageLabel, '查看消息');

    const runtime = createQQV2ProductionRuntime({
        host: { readScope: () => ({ scopeId, chatId: 'friend-profile', chatFile: 'friend-profile', hostType: 'character', hostId: 'test' }), readUserIdentity: () => ({ name: 'Traveler', avatar: '' }), readStoryTime: () => '2042-05-20 09:30', readStoryMessages: () => [], readRawContext: () => ({}) },
        stateStore, repository: createQQV2Repository({ stateStore }), cryptoApi: webcrypto, backend: { async generate() {}, async loadModels() { return []; } },
        worldbookGateway: { async loadBook() { return { entries: {} }; }, async saveBook() {} },
    });
    await runtime.initialize(); const facade = runtime.getFacade();
    const alice = await facade.intent.createPrivateConversation({ name: 'Alice' });
    const bob = await facade.intent.createPrivateConversation({ name: 'Bob' });
    assert.equal(alice.ok, true); assert.equal(bob.ok, true);
    const conversationId = alice.result.conversation.conversationId;
    const profile = await facade.query.conversation({ conversationId });
    assert.equal(profile.conversation.formalName, 'Alice', 'Facade conversations expose a person name separate from chat title');
    const removed = await facade.intent.removePrivateFriend({ conversationId });
    assert.equal(removed.ok, true); assert.equal(removed.result.removed, true);
    const readonly = await facade.query.conversation({ conversationId });
    assert.equal(readonly.conversation.readOnly, true);
    const system = await facade.query.messages({ conversationId });
    assert.match(system.page.items.at(-1).content, /Traveler.*Alice/);
    const whitespaceVariant = await facade.intent.createPrivateConversation({ name: '  Alice  ' });
    assert.equal(whitespaceVariant.ok, true); assert.equal(whitespaceVariant.result.created, true);
    assert.notEqual(whitespaceVariant.result.conversation.conversationId, conversationId);
    const restored = await facade.intent.createPrivateConversation({ name: 'Alice' });
    assert.equal(restored.ok, true); assert.equal(restored.result.restored, true);
    assert.equal(restored.result.conversation.conversationId, conversationId);
    assert.equal((await facade.query.conversation({ conversationId })).conversation.canSend, true);
    const renamed = await facade.intent.updatePrivateProfile({
        conversationId,
        profile: {
            formalName: 'Alice  New',
            signature: 'Meet me at dusk',
            gender: 'female',
            birthday: '2042-05-20',
        },
    });
    assert.equal(renamed.ok, true); assert.equal(renamed.result.person.formalName, 'Alice  New');
    const editedProfile = await facade.query.conversation({ conversationId });
    assert.equal(editedProfile.conversation.signature, 'Meet me at dusk');
    assert.equal(editedProfile.conversation.gender, 'female');
    assert.equal(editedProfile.conversation.birthday, '2042-05-20');
    const conflict = await facade.intent.updatePrivateProfile({ conversationId, profile: { formalName: 'Bob' } });
    assert.equal(conflict.ok, false); assert.equal(conflict.error.code, 'person_name_conflict');
    runtime.destroy();
}

main().then(() => console.log('[qq-friend-profile-contract] 检查通过')).catch((error) => { console.error('[qq-friend-profile-contract] failed'); console.error(error); process.exitCode = 1; });
