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

async function testActionServiceAppliesPendingTransferAtomically() {
    const { createQQV2ActionService } = await importModule('modules/qq-v2/protocol/action-service.js');
    const repository = await createRepository();
    const { conversation, person } = await repository.createPrivateConversation('scope-a', { name: '林知夏' });
    const [transfer] = await repository.appendMessages('scope-a', conversation.conversationId, [{
        senderId: '__self__',
        senderType: 'self',
        type: 'transfer',
        content: '给你的转账',
        storyTime: '2042-05-01 10:00',
        transfer: { amount: '88', note: '晚饭', recipientId: person.personId, status: 'pending' },
    }]);
    const service = createQQV2ActionService({
        repository,
        parseResponse: () => [{
            type: 'transfer',
            conversation: 'P1',
            message: transfer.messageId,
            actor: person.personId,
            action: 'accept',
        }],
    });

    await service.execute({
        scopeId: 'scope-a',
        response: '<qq/>',
        scenario: 'private-reply',
        references: { P1: conversation.conversationId },
        visibleMessageRefs: [transfer.messageId],
        storyTime: '2042-05-01 10:01',
    });
    assert.equal((await repository.listMessages('scope-a', conversation.conversationId))[0].transfer.status, 'accepted');

    const failing = createQQV2ActionService({
        repository,
        parseResponse: () => [{
            type: 'transfer',
            conversation: 'P1',
            message: transfer.messageId,
            actor: person.personId,
            action: 'reject',
        }, {
            type: 'message',
            conversation: 'P1',
            sender: 'not-the-private-person',
            messageType: 'text',
            content: '非法后续消息',
            mentions: [],
            mentionAll: false,
        }],
    });
    await assert.rejects(() => failing.execute({
        scopeId: 'scope-a',
        response: '<qq/>',
        scenario: 'private-reply',
        references: { P1: conversation.conversationId },
        visibleMessageRefs: [transfer.messageId],
        storyTime: '2042-05-01 10:02',
    }));
    const messages = await repository.listMessages('scope-a', conversation.conversationId);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].transfer.status, 'accepted');
}

async function testCreateGroupMapsMemberReferencesAndKeepsFriendBoundary() {
    const { createQQV2ActionService } = await importModule('modules/qq-v2/protocol/action-service.js');
    const repository = await createRepository();
    const alice = await repository.createPrivateConversation('scope-a', { name: '林知夏' });
    const bob = await repository.createPrivateConversation('scope-a', { name: '顾言' });
    const service = createQQV2ActionService({
        repository,
        parseResponse: () => [
            { type: 'create-group', id: 'G2', name: '新群', owner: 'N1', members: ['N1', 'N2'] },
            {
                type: 'message', conversation: 'G2', sender: 'N1', messageType: 'text', content: '欢迎加入。',
                mentions: [], mentionAll: false,
            },
        ],
    });

    const result = await service.execute({
        scopeId: 'scope-a',
        response: '<qq/>',
        scenario: 'group-proactive',
        references: {},
        personReferences: { N1: alice.person.personId, N2: bob.person.personId },
        storyTime: '2042-05-01 10:00',
    });
    assert.equal(result.createdConversationIds.length, 1);
    const groupConversation = await repository.getConversation('scope-a', result.createdConversationIds[0]);
    const group = await repository.getGroup('scope-a', groupConversation.groupId);
    assert.equal(group.ownerId, alice.person.personId);
    assert.deepEqual(group.memberIds, [alice.person.personId, bob.person.personId]);

    const invalidFriends = createQQV2ActionService({
        repository,
        parseResponse: () => [
            { type: 'create-group', id: 'G3', name: '非法群', owner: 'N1', members: ['N1', 'N3'] },
            {
                type: 'message', conversation: 'G3', sender: 'N1', messageType: 'text', content: '不应创建。',
                mentions: [], mentionAll: false,
            },
        ],
    });
    await assert.rejects(() => invalidFriends.execute({
        scopeId: 'scope-a',
        response: '<qq/>',
        scenario: 'group-proactive',
        references: {},
        personReferences: { N1: alice.person.personId },
        storyTime: '2042-05-01 10:01',
    }), /人物不存在|已有私聊好友/);
    assert.equal((await repository.listConversations('scope-a')).length, 3);
}

async function testGroupOwnerCanCreateNamedMemberAndUseReferenceInSameBatch() {
    const { createQQV2ActionService } = await importModule('modules/qq-v2/protocol/action-service.js');
    const repository = await createRepository();
    const alice = await repository.createPrivateConversation('scope-a', { name: '林知夏' });
    const bob = await repository.createPrivateConversation('scope-a', { name: '顾言' });
    const groupResult = await repository.createGroupConversation('scope-a', {
        name: '新群',
        memberIds: [alice.person.personId, bob.person.personId],
        ownerId: alice.person.personId,
    });
    const service = createQQV2ActionService({
        repository,
        parseResponse: () => [{
            type: 'group',
            conversation: 'G1',
            action: 'add',
            actor: 'N1',
            target: '',
            value: '',
            duration: '',
            id: 'N3',
            name: '沈星河',
        }, {
            type: 'message',
            conversation: 'G1',
            sender: 'N3',
            messageType: 'text',
            content: '大家好。',
            mentions: [],
            mentionAll: false,
        }],
    });

    await service.execute({
        scopeId: 'scope-a',
        response: '<qq/>',
        scenario: 'group-proactive',
        references: { G1: groupResult.conversation.conversationId },
        personReferences: { N1: alice.person.personId, N2: bob.person.personId },
        storyTime: '2042-05-01 10:02',
    });

    const group = await repository.getGroup('scope-a', groupResult.group.groupId);
    const newcomerId = group.memberIds.find((personId) => ![alice.person.personId, bob.person.personId].includes(personId));
    assert.ok(newcomerId, '按真名新增的群成员应获得稳定 personId');
    assert.equal((await repository.getPerson('scope-a', newcomerId)).formalName, '沈星河');
    assert.equal(
        (await repository.listConversations('scope-a')).filter((conversation) => conversation.kind === 'private').length,
        2,
        'NPC 拉入陌生成员不应伪造私聊会话',
    );
    const messages = await repository.listMessages('scope-a', groupResult.conversation.conversationId);
    assert.equal(messages.at(-1).senderId, newcomerId);
    assert.equal(messages.at(-1).content, '大家好。');
}

async function testNpcCanLeaveGroupThroughActionService() {
    const { createQQV2ActionService } = await importModule('modules/qq-v2/protocol/action-service.js');
    const repository = await createRepository();
    const alice = await repository.createPrivateConversation('scope-a', { name: '林知夏' });
    const bob = await repository.createPrivateConversation('scope-a', { name: '顾言' });
    const groupResult = await repository.createGroupConversation('scope-a', {
        name: 'NPC 退群测试',
        memberIds: [alice.person.personId, bob.person.personId],
        ownerId: alice.person.personId,
    });
    const [pendingTransfer] = await repository.appendMessages('scope-a', groupResult.conversation.conversationId, [{
        senderId: alice.person.personId,
        senderType: 'person',
        type: 'transfer',
        content: '给顾言的转账',
        storyTime: '2026-09-04 11:00',
        transfer: { amount: '18', recipientId: bob.person.personId, status: 'pending' },
    }]);
    const service = createQQV2ActionService({
        repository,
        parseResponse: () => [{
            type: 'group',
            conversation: 'G1',
            action: 'leave',
            actor: 'N2',
            target: '',
            value: '',
            duration: '',
        }],
    });

    await service.execute({
        scopeId: 'scope-a',
        response: '<qq/>',
        scenario: 'group-proactive',
        references: { G1: groupResult.conversation.conversationId },
        personReferences: { N1: alice.person.personId, N2: bob.person.personId },
        storyTime: '2026-09-04 11:01',
    });

    const group = await repository.getGroup('scope-a', groupResult.group.groupId);
    const messages = await repository.listMessages('scope-a', groupResult.conversation.conversationId);
    assert.equal(group.memberIds.includes(bob.person.personId), false);
    assert.equal(
        messages.find((message) => message.messageId === pendingTransfer.messageId).transfer.status,
        'returned',
    );
    assert.equal(messages.at(-1).content, '顾言退出了群聊');
}

async function testCancelledActionBatchNeverStartsItsRepositoryTransaction() {
    const { createQQV2ActionService } = await importModule('modules/qq-v2/protocol/action-service.js');
    const repository = await createRepository();
    const { conversation, person } = await repository.createPrivateConversation('scope-a', { name: '林知夏' });
    const service = createQQV2ActionService({
        repository,
        parseResponse: () => [{
            type: 'message', conversation: 'P1', sender: 'P1', messageType: 'text', content: '迟到回复',
            mentions: [], mentionAll: false,
        }],
    });

    await assert.rejects(() => service.execute({
        scopeId: 'scope-a',
        response: '<qq/>',
        scenario: 'private-reply',
        references: { P1: conversation.conversationId },
        personReferences: { P1: person.personId },
        isCurrent: () => false,
    }), (error) => error?.code === 'request_cancelled');
    assert.deepEqual(await repository.listMessages('scope-a', conversation.conversationId), []);
}

async function testPrivateProactiveMessageCannotQuoteAnotherConversation() {
    const { createQQV2ActionService } = await importModule('modules/qq-v2/protocol/action-service.js');
    const repository = await createRepository();
    const alice = await repository.createPrivateConversation('scope-a', { name: 'Alice' });
    const bob = await repository.createPrivateConversation('scope-a', { name: 'Bob' });
    const [bobMessage] = await repository.appendMessages('scope-a', bob.conversation.conversationId, [{
        senderId: bob.person.personId,
        senderType: 'person',
        type: 'text',
        content: 'Bob 的私聊原文',
        storyTime: '2042-05-01 10:00',
    }]);
    const service = createQQV2ActionService({
        repository,
        parseResponse: () => [{
            type: 'message',
            conversation: 'P1',
            sender: 'P1',
            messageType: 'text',
            content: '不应跨会话引用',
            quote: 'P2-M1',
            mentions: [],
            mentionAll: false,
        }],
    });

    await assert.rejects(() => service.execute({
        scopeId: 'scope-a',
        response: '<qq/>',
        scenario: 'private-proactive',
        references: { P1: alice.conversation.conversationId, P2: bob.conversation.conversationId },
        personReferences: { P1: alice.person.personId, P2: bob.person.personId },
        messageReferences: { 'P2-M1': bobMessage.messageId },
        visibleMessageRefs: ['P2-M1'],
        storyTime: '2042-05-01 10:01',
    }), (error) => error?.code === 'quote_conversation_mismatch');
    assert.deepEqual(await repository.listMessages('scope-a', alice.conversation.conversationId), []);
    assert.equal((await repository.listMessages('scope-a', bob.conversation.conversationId))[0].content, 'Bob 的私聊原文');
}

async function testStickerShortReferenceMapsToStoredResourceId() {
    const { createQQV2ActionService } = await importModule('modules/qq-v2/protocol/action-service.js');
    const repository = await createRepository();
    const { conversation, person } = await repository.createPrivateConversation('scope-a', { name: '林知夏' });
    const service = createQQV2ActionService({
        repository,
        parseResponse: () => [{
            type: 'message',
            conversation: 'P1',
            sender: 'P1',
            messageType: 'sticker',
            stickerId: 'S1',
            content: '开心',
            mentions: [],
            mentionAll: false,
        }],
    });

    await service.execute({
        scopeId: 'scope-a',
        response: '<qq/>',
        scenario: 'private-reply',
        references: { P1: conversation.conversationId },
        personReferences: { P1: person.personId },
        stickers: new Set(['S1']),
        stickerReferences: { S1: 'sticker-uuid-a' },
    });
    const [message] = await repository.listMessages('scope-a', conversation.conversationId);
    assert.equal(message.stickerId, 'sticker-uuid-a');
}

async function testAssistantAcceptsOnlyItsExactSenderName() {
    const { createQQV2ActionService } = await importModule('modules/qq-v2/protocol/action-service.js');
    const repository = await createRepository();
    await repository.ensureScope('assistant-sender');
    const { conversation, person } = await repository.openAssistant('assistant-sender', { name: '北白川玉子' });
    const service = createQQV2ActionService({ repository });
    const send = (senders, target = conversation, scenario = 'private-reply', stickerFirst = false) => {
        const children = senders.map((sender, index) => {
            const attributes = { conversation: 'P1', sender, type: 'text' };
            if (stickerFirst && index === 0) Object.assign(attributes, { type: 'sticker', sticker: 'S11' });
            return { nodeType: 1, tagName: 'message', children: [],
                textContent: '你好呀', childNodes: [{ nodeType: 3, textContent: '你好呀' }],
                attributes: Object.entries(attributes).map(([name, value]) => ({ name, value })),
                getAttribute: name => attributes[name] ?? null, hasAttribute: name => Object.hasOwn(attributes, name) };
        });
        const root = { nodeType: 1, tagName: 'qq', attributes: [], children, childNodes: children };
        return service.execute({ scopeId: 'assistant-sender', response: '<qq><message/></qq>', scenario,
            references: { P1: target.conversationId }, personReferences: { N1: target.personId || person.personId },
            stickers: new Set(['S11']), stickerReferences: { S11: 'test-sticker-11' },
            parseOptions: { parseDocument: () => ({ documentElement: root, childNodes: [root], getElementsByTagName: () => [] }) } });
    };
    await send(['北白川玉子']);
    const messages = await repository.listMessages('assistant-sender', conversation.conversationId);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].senderId, person.personId, '完整姓名只解析为当前陪聊人物的内部 ID');
    await send(['N1']);
    assert.equal((await repository.listMessages('assistant-sender', conversation.conversationId)).length, 2, '标准 N1 引用继续有效');
    for (const invalid of ['玉子', '北白川玉子！', '其他人']) {
        await assert.rejects(send(['北白川玉子', invalid]), { code: 'private_sender_invalid' });
        assert.equal((await repository.listMessages('assistant-sender', conversation.conversationId)).length, 2,
            '不匹配姓名使整批回滚，不保留前面的合法消息');
    }
    const ordinary = await repository.createPrivateConversation('assistant-sender', { name: '北白川玉子' });
    await assert.rejects(send(['北白川玉子'], ordinary.conversation), { code: 'private_sender_invalid' });
    assert.equal((await repository.listMessages('assistant-sender', ordinary.conversation.conversationId)).length, 0,
        '普通私聊即使同名也不启用姓名兼容');
    const friend = await repository.createPrivateConversation('assistant-sender', { name: '小绿' });
    const group = await repository.createGroupConversation('assistant-sender', {
        name: '普通群聊', memberIds: [ordinary.person.personId, friend.person.personId],
    });
    await assert.rejects(send(['北白川玉子'], group.conversation, 'group-reply'), { code: 'group_member_not_found' });
    assert.equal((await repository.listMessages('assistant-sender', group.conversation.conversationId)).length, 0,
        '群聊不因成员同名而启用姓名兼容');
    await repository.saveAssistantCharacter('assistant-sender', person.personId, { formalName: '玉子同学' });
    await assert.rejects(send(['北白川玉子']), { code: 'private_sender_invalid' });
    await send(['玉子同学']);
    assert.equal((await repository.listMessages('assistant-sender', conversation.conversationId)).at(-1).senderId, person.personId,
        '修改姓名后只匹配当前完整姓名，不保留旧别名');
    await repository.saveAssistantCharacter('assistant-sender', person.personId, { formalName: '北白川玉子' });
    await send(['北白川玉子', '北白川玉子', '北白川玉子'], conversation, 'private-reply', true);
    const batch = (await repository.listMessages('assistant-sender', conversation.conversationId)).slice(-3);
    assert.deepEqual(batch.map(message => message.type), ['sticker', 'text', 'text'], '复现用户的表情加两段文本回复');
    assert.ok(batch.every(message => message.senderId === person.personId));
    assert.equal(batch[0].stickerId, 'test-sticker-11', '姓名兼容不破坏表情短引用转换');


}

async function main() {
    await testAssistantAcceptsOnlyItsExactSenderName();
    await testActionServiceAppliesPendingTransferAtomically();
    await testCreateGroupMapsMemberReferencesAndKeepsFriendBoundary();
    await testGroupOwnerCanCreateNamedMemberAndUseReferenceInSameBatch();
    await testNpcCanLeaveGroupThroughActionService();
    await testCancelledActionBatchNeverStartsItsRepositoryTransaction();
    await testPrivateProactiveMessageCannotQuoteAnotherConversation();
    await testStickerShortReferenceMapsToStoredResourceId();
    console.log('[qq-v2-action-service-contract] passed');
}

main().catch((error) => {
    console.error('[qq-v2-action-service-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
