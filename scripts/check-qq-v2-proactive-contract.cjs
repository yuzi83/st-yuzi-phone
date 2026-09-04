const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    return import(`${href}?contract=${Date.now()}-${Math.random()}`);
}

function createRequestServiceFixture() {
    const proactiveEntries = [];
    return {
        proactiveEntries,
        async enqueueProactive(input) {
            proactiveEntries.push(input);
            return { queued: true };
        },
        cancelProactive() {
            return 0;
        },
    };
}

function createRepositoryFixture(options = {}) {
    const scopeId = 'st:character:alice:proactive-execution';
    const scope = { scopeId, settings: {} };
    const conversations = options.conversations || [
        { conversationId: 'private-1', kind: 'private', personId: 'person-alice', status: 'active' },
    ];
    const people = options.people || {
        'person-alice': { personId: 'person-alice', formalName: '林知夏' },
    };
    const groups = options.groups || {};
    const messages = options.messages || {
        'private-1': [
            { messageId: 'p-user', senderType: 'self', type: 'text', content: '今天怎么样？' },
            { messageId: 'p-npc', senderType: 'person', type: 'text', content: '还不错。' },
        ],
    };
    const assertScope = (id) => assert.equal(id, scopeId);
    return {
        scopeId,
        conversations,
        groups,
        messages,
        repository: {
            async ensureScope(id) {
                assertScope(id);
                return scope;
            },
            async getScope(id) {
                assertScope(id);
                return scope;
            },
            async listConversations(id) {
                assertScope(id);
                return conversations;
            },
            async getPerson(id, personId) {
                assertScope(id);
                return people[personId] || null;
            },
            async getGroup(id, groupId) {
                assertScope(id);
                return groups[groupId] || null;
            },
            async listMessages(id, conversationId) {
                assertScope(id);
                return messages[conversationId] || [];
            },
        },
    };
}

async function runProactiveCycle(options = {}) {
    const { createQQV2ProactiveService } = await importModule('modules/qq-v2/proactive/service.js');
    const fixture = options.fixture || createRepositoryFixture();
    const requestService = createRequestServiceFixture();
    const syncCalls = [];
    const committedMessageCalls = [];
    const service = createQQV2ProactiveService({
        repository: fixture.repository,
        requestService,
        runtimeSettingsResolver: async () => ({
            activeApiPresetId: 'api-1',
            privateProactivePresetId: 'prompt-private',
            groupProactivePresetId: 'prompt-group',
            conversationHistoryLimit: 100,
            proactive: { enabled: true, everyTurns: 1 },
        }),
        apiPresetResolver: async (presetId) => ({ presetId }),
        promptPresetResolver: async (presetId) => ({ presetId }),
        buildProactiveSections: () => '最近聊天记录',
        buildProactiveRequest: async () => [{ role: 'system', content: '主动周期。' }],
        backend: {
            async generate() {
                return { content: options.backendContent || '' };
            },
        },
        commitActions: options.commitActions || (async () => options.actionResult),
        async syncWorldbook(input) {
            syncCalls.push(input);
            return options.syncWorldbook?.(input);
        },
        async onMessagesCommitted(input) {
            committedMessageCalls.push(input);
            return options.onMessagesCommitted?.(input);
        },
        onProjectionError: options.onProjectionError,
    });

    await service.enqueueProactiveCycle({ scopeId: fixture.scopeId, kind: options.kind });
    const result = await requestService.proactiveEntries[0].execute({
        scopeId: fixture.scopeId,
        signal: new AbortController().signal,
    });
    return { fixture, result, syncCalls, committedMessageCalls };
}

async function testEnabledPrivateCycleCallsBackendAndCommitsActions() {
    const { createQQV2ProactiveService } = await importModule('modules/qq-v2/proactive/service.js');
    const { repository, scopeId } = createRepositoryFixture();
    const requestService = createRequestServiceFixture();
    const backendCalls = [];
    const committedActions = [];
    const service = createQQV2ProactiveService({
        repository,
        requestService,
        runtimeSettingsResolver: async () => ({
            activeApiPresetId: 'api-1',
            privateProactivePresetId: 'prompt-private',
            groupProactivePresetId: 'prompt-group',
            conversationHistoryLimit: 100,
            proactive: { enabled: true, everyTurns: 1 },
        }),
        apiPresetResolver: async (presetId) => ({ presetId }),
        promptPresetResolver: async (presetId) => ({ presetId }),
        buildProactiveSections: () => '最近聊天记录',
        buildProactiveRequest: async ({ kind, candidates }) => {
            assert.equal(kind, 'private');
            assert.equal(candidates.length, 1);
            return [{ role: 'system', content: '主动发一条 QQ 消息。' }];
        },
        backend: {
            async generate(input) {
                backendCalls.push(input);
                return { content: '我来找你聊聊天。' };
            },
        },
        commitActions: async (input) => {
            committedActions.push(input);
            return { conversationIds: ['private-1'] };
        },
    });

    assert.deepEqual(await service.enqueueProactiveCycle({ scopeId }), {
        triggered: true,
        cycleKind: 'private',
        queued: true,
        skipped: '',
    });
    assert.equal(requestService.proactiveEntries.length, 1);

    const result = await requestService.proactiveEntries[0].execute({ scopeId, signal: new AbortController().signal });

    assert.deepEqual(result, { status: 'succeeded' });
    assert.equal(backendCalls.length, 1);
    assert.equal(committedActions.length, 1);
    assert.equal(committedActions[0].response, '我来找你聊聊天。');
    assert.deepEqual(committedActions[0].references, { P1: 'private-1' });
    assert.deepEqual(committedActions[0].personReferences, { P1: 'person-alice' });
}

async function testNoneActionSkipsWorldbookSync() {
    const { result, syncCalls, committedMessageCalls } = await runProactiveCycle({
        backendContent: '<none />',
        actionResult: {
            applied: [{ type: 'none' }],
            createdConversationIds: [],
        },
    });

    assert.deepEqual(result, { status: 'succeeded' });
    assert.equal(syncCalls.length, 0, 'none 动作不应重写世界书投影');
    assert.equal(committedMessageCalls.length, 0, 'none 动作不得冒充 NPC 主动消息');
}

async function testReadActionSkipsWorldbookSync() {
    const { result, syncCalls, committedMessageCalls } = await runProactiveCycle({
        backendContent: '<read conversation="P1" />',
        actionResult: {
            applied: [{ type: 'read', conversationId: 'private-1' }],
            createdConversationIds: [],
        },
    });

    assert.deepEqual(result, { status: 'succeeded' });
    assert.equal(syncCalls.length, 0, 'read 动作只处理已读边界，不应重写世界书投影');
    assert.equal(committedMessageCalls.length, 0, '纯已读动作不得触发 QQ 浮层通知');
}

async function testEmptyAppliedBatchSkipsWorldbookSync() {
    const { result, syncCalls, committedMessageCalls } = await runProactiveCycle({
        actionResult: {
            applied: [],
            createdConversationIds: [],
        },
    });

    assert.deepEqual(result, { status: 'succeeded' });
    assert.equal(syncCalls.length, 0, '空动作批次不应重写世界书投影');
    assert.equal(committedMessageCalls.length, 0);
}

async function testMessageActionSyncsOnlyAffectedConversation() {
    const fixture = createRepositoryFixture({
        conversations: [
            { conversationId: 'private-1', kind: 'private', personId: 'person-alice', status: 'active' },
            { conversationId: 'private-2', kind: 'private', personId: 'person-bob', status: 'active' },
        ],
        people: {
            'person-alice': { personId: 'person-alice', formalName: '林知夏' },
            'person-bob': { personId: 'person-bob', formalName: '周景明' },
        },
        messages: {
            'private-1': [
                { messageId: 'alice-old', senderType: 'person', type: 'text', content: '旧消息一' },
            ],
            'private-2': [
                { messageId: 'bob-old', senderType: 'person', type: 'text', content: '旧消息二' },
            ],
        },
    });
    const { result, syncCalls, committedMessageCalls } = await runProactiveCycle({
        fixture,
        backendContent: '<message conversation="P2">新消息</message>',
        commitActions: async () => {
            fixture.messages['private-2'].push({
                messageId: 'bob-new',
                senderType: 'person',
                type: 'text',
                content: '新消息',
            });
            return {
                applied: [{ type: 'message', messageId: 'bob-new' }],
                createdConversationIds: [],
            };
        },
    });

    assert.deepEqual(result, { status: 'succeeded' });
    assert.equal(syncCalls.length, 1);
    assert.deepEqual(syncCalls[0].conversationIds, ['private-2']);
    assert.equal(committedMessageCalls.length, 1);
    assert.deepEqual(
        committedMessageCalls[0].conversationIds,
        ['private-2'],
        '主动消息提交观察者必须只收到真正写入 NPC 消息的会话，并按会话去重',
    );
}

async function testTransferActionSyncsOnlyAffectedConversation() {
    const fixture = createRepositoryFixture({
        conversations: [
            { conversationId: 'private-1', kind: 'private', personId: 'person-alice', status: 'active' },
            { conversationId: 'private-2', kind: 'private', personId: 'person-bob', status: 'active' },
        ],
        people: {
            'person-alice': { personId: 'person-alice', formalName: '林知夏' },
            'person-bob': { personId: 'person-bob', formalName: '周景明' },
        },
        messages: {
            'private-1': [
                {
                    messageId: 'transfer-1',
                    senderType: 'self',
                    type: 'transfer',
                    content: '',
                    transfer: { amount: '10.00', status: 'pending' },
                },
            ],
            'private-2': [
                {
                    messageId: 'transfer-2',
                    senderType: 'self',
                    type: 'transfer',
                    content: '',
                    transfer: { amount: '20.00', status: 'pending' },
                },
            ],
        },
    });
    const { result, syncCalls } = await runProactiveCycle({
        fixture,
        backendContent: '<transfer conversation="P2" message="P2-M1" action="accept" />',
        commitActions: async () => {
            fixture.messages['private-2'][0].transfer.status = 'accepted';
            return {
                applied: [{ type: 'transfer', messageId: 'transfer-2', status: 'accepted' }],
                createdConversationIds: [],
            };
        },
    });

    assert.deepEqual(result, { status: 'succeeded' });
    assert.equal(syncCalls.length, 1);
    assert.deepEqual(syncCalls[0].conversationIds, ['private-2']);
}

async function testGroupProjectionActionSyncsOnlyAffectedConversation() {
    const fixture = createRepositoryFixture({
        conversations: [
            { conversationId: 'private-1', kind: 'private', personId: 'person-alice', status: 'active' },
            { conversationId: 'private-2', kind: 'private', personId: 'person-bob', status: 'active' },
            { conversationId: 'group-conversation-1', kind: 'group', groupId: 'group-1', status: 'active' },
            { conversationId: 'group-conversation-2', kind: 'group', groupId: 'group-2', status: 'active' },
        ],
        people: {
            'person-alice': { personId: 'person-alice', formalName: '林知夏' },
            'person-bob': { personId: 'person-bob', formalName: '周景明' },
        },
        groups: {
            'group-1': {
                groupId: 'group-1',
                name: '旧群名一',
                memberIds: ['person-alice', 'person-bob'],
                ownerId: 'person-alice',
                adminIds: [],
                selfExited: false,
                status: 'active',
            },
            'group-2': {
                groupId: 'group-2',
                name: '旧群名二',
                memberIds: ['person-alice', 'person-bob'],
                ownerId: 'person-bob',
                adminIds: [],
                selfExited: false,
                status: 'active',
            },
        },
        messages: {
            'private-1': [],
            'private-2': [],
            'group-conversation-1': [],
            'group-conversation-2': [],
        },
    });
    const { result, syncCalls } = await runProactiveCycle({
        fixture,
        kind: 'group',
        backendContent: '<group conversation="G2" action="rename" value="新群名二" />',
        commitActions: async () => {
            fixture.groups['group-2'].name = '新群名二';
            return {
                applied: [{ type: 'group', action: 'rename' }],
                createdConversationIds: [],
            };
        },
    });

    assert.deepEqual(result, { status: 'succeeded' });
    assert.equal(syncCalls.length, 1);
    assert.deepEqual(syncCalls[0].conversationIds, ['group-conversation-2']);
}

async function testGroupMemberChangeDoesNotSyncUnchangedLaterGroup() {
    const fixture = createRepositoryFixture({
        conversations: [
            { conversationId: 'group-conversation-1', kind: 'group', groupId: 'group-1', status: 'active' },
            { conversationId: 'group-conversation-2', kind: 'group', groupId: 'group-2', status: 'active' },
            { conversationId: 'private-eve', kind: 'private', personId: 'person-eve', status: 'active' },
        ],
        people: {
            'person-alice': { personId: 'person-alice', formalName: '林知夏' },
            'person-bob': { personId: 'person-bob', formalName: '周景明' },
            'person-carol': { personId: 'person-carol', formalName: '许清禾' },
            'person-dave': { personId: 'person-dave', formalName: '陈叙白' },
            'person-eve': { personId: 'person-eve', formalName: '沈星河' },
        },
        groups: {
            'group-1': {
                groupId: 'group-1',
                name: '群聊一',
                memberIds: ['person-alice', 'person-bob'],
                ownerId: 'person-alice',
                adminIds: [],
                selfExited: false,
                status: 'active',
            },
            'group-2': {
                groupId: 'group-2',
                name: '群聊二',
                memberIds: ['person-carol', 'person-dave'],
                ownerId: 'person-carol',
                adminIds: [],
                selfExited: false,
                status: 'active',
            },
        },
        messages: {
            'group-conversation-1': [],
            'group-conversation-2': [],
            'private-eve': [],
        },
    });
    const { result, syncCalls } = await runProactiveCycle({
        fixture,
        kind: 'group',
        backendContent: '<group conversation="G1" action="add-member" member="N5" />',
        commitActions: async () => {
            fixture.groups['group-1'].memberIds.push('person-eve');
            return {
                applied: [{ type: 'group', action: 'add-member' }],
                createdConversationIds: [],
            };
        },
    });

    assert.deepEqual(result, { status: 'succeeded' });
    assert.equal(syncCalls.length, 1);
    assert.deepEqual(
        syncCalls[0].conversationIds,
        ['group-conversation-1'],
        '第一个群成员变化造成的全局 N 编号重排，不应误同步未变化的后续群',
    );
}

async function testCreatedConversationFirstMessageStillSyncsWorldbook() {
    const fixture = createRepositoryFixture({
        conversations: [
            { conversationId: 'private-1', kind: 'private', personId: 'person-alice', status: 'active' },
        ],
        people: {
            'person-alice': { personId: 'person-alice', formalName: '林知夏' },
            'person-new': { personId: 'person-new', formalName: '沈星河' },
        },
        messages: {
            'private-1': [],
        },
    });
    const { result, syncCalls } = await runProactiveCycle({
        fixture,
        backendContent: '<create-private id="P2" name="沈星河" /><message conversation="P2">初次见面。</message>',
        commitActions: async () => {
            fixture.conversations.push({
                conversationId: 'private-new',
                kind: 'private',
                personId: 'person-new',
                status: 'active',
            });
            fixture.messages['private-new'] = [{
                messageId: 'new-first-message',
                senderType: 'person',
                type: 'text',
                content: '初次见面。',
            }];
            return {
                applied: [
                    { type: 'create-private', reference: 'P2' },
                    { type: 'message', messageId: 'new-first-message' },
                ],
                createdConversationIds: ['private-new'],
            };
        },
    });

    assert.deepEqual(result, { status: 'succeeded' });
    assert.equal(syncCalls.length, 1);
    assert.deepEqual(syncCalls[0].conversationIds, ['private-new']);
}

async function testProjectionFailureDoesNotRollbackCommittedActions() {
    const fixture = createRepositoryFixture();
    const projectionErrors = [];
    const { result } = await runProactiveCycle({
        fixture,
        backendContent: '<message conversation="P1">已提交消息</message>',
        commitActions: async () => {
            fixture.messages['private-1'].push({
                messageId: 'committed-before-projection-error',
                senderType: 'person',
                type: 'text',
                content: '已提交消息',
            });
            return {
                applied: [{ type: 'message', messageId: 'committed-before-projection-error' }],
                createdConversationIds: [],
            };
        },
        syncWorldbook() {
            throw new Error('世界书保存失败');
        },
        onProjectionError(error, context) {
            projectionErrors.push({ error, context });
        },
    });

    assert.deepEqual(result, { status: 'succeeded' });
    assert.equal(
        fixture.messages['private-1'].some((message) => message.messageId === 'committed-before-projection-error'),
        true,
        '世界书失败后已提交 QQ 动作必须保留',
    );
    assert.equal(projectionErrors.length, 1);
    assert.deepEqual(projectionErrors[0].context.conversationIds, ['private-1']);
}

async function main() {
    await testEnabledPrivateCycleCallsBackendAndCommitsActions();
    await testNoneActionSkipsWorldbookSync();
    await testReadActionSkipsWorldbookSync();
    await testEmptyAppliedBatchSkipsWorldbookSync();
    await testMessageActionSyncsOnlyAffectedConversation();
    await testTransferActionSyncsOnlyAffectedConversation();
    await testGroupProjectionActionSyncsOnlyAffectedConversation();
    await testGroupMemberChangeDoesNotSyncUnchangedLaterGroup();
    await testCreatedConversationFirstMessageStillSyncsWorldbook();
    await testProjectionFailureDoesNotRollbackCommittedActions();
    console.log('[qq-v2-proactive-contract] passed');
}

main().catch((error) => {
    console.error('[qq-v2-proactive-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
