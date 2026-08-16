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

function createRepositoryFixture() {
    const scopeId = 'st:character:alice:proactive-execution';
    const scope = { scopeId, settings: {} };
    const conversations = [
        { conversationId: 'private-1', kind: 'private', personId: 'person-alice', status: 'active' },
    ];
    const people = {
        'person-alice': { personId: 'person-alice', formalName: '林知夏' },
    };
    const messages = {
        'private-1': [
            { messageId: 'p-user', senderType: 'self', type: 'text', content: '今天怎么样？' },
            { messageId: 'p-npc', senderType: 'person', type: 'text', content: '还不错。' },
        ],
    };
    const assertScope = (id) => assert.equal(id, scopeId);
    return {
        scopeId,
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
            async listMessages(id, conversationId) {
                assertScope(id);
                return messages[conversationId] || [];
            },
        },
    };
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

async function main() {
    await testEnabledPrivateCycleCallsBackendAndCommitsActions();
    console.log('[qq-v2-proactive-contract] passed');
}

main().catch((error) => {
    console.error('[qq-v2-proactive-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
