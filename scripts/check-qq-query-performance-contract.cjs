const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    return import(`${href}?contract=${Date.now()}-${Math.random()}`);
}


async function testConversationReadsAndMessagePages() {
    const { createMemoryQQV2StateStore } = await importModule('modules/qq-v2/storage/state-store.js');
    const { createQQV2Repository } = await importModule('modules/qq-v2/domain/repository.js');
    const { createQQV2ProductionRuntime } = await importModule('modules/qq-v2/application/production-runtime.js');
    const base = createMemoryQQV2StateStore();
    let reads = 0;
    const stateStore = { ...base, async read() { reads += 1; return base.read(); } };
    const repository = createQQV2Repository({ stateStore });
    const scopeId = 'st:character:alice:perf';
    const runtime = createQQV2ProductionRuntime({
        stateStore, repository,
        cryptoApi: require('node:crypto').webcrypto,
        host: {
            readScope: () => ({ scopeId, chatId: 'perf', chatFile: 'perf', hostType: 'character', hostId: 'alice' }),
            readUserIdentity: () => ({ name: '用户', avatar: '' }),
            readStoryTime: () => '', readStoryMessages: () => [],
            readRawContext: () => ({ getRequestHeaders: () => ({}) }),
        },
        backend: { async generate() {}, async loadModels() { return []; } },
        worldbookGateway: { async loadBook() { return { entries: {} }; }, async saveBook() {} },
    });
    try {
        await runtime.initialize();
        const alice = await repository.createPrivateConversation(scopeId, { name: 'Alice' });
        const bob = await repository.createPrivateConversation(scopeId, { name: 'Bob' });
        const group = await repository.createGroupConversation(scopeId, {
            name: '群', memberIds: [alice.person.personId, bob.person.personId], ownerId: alice.person.personId,
        });
        reads = 0;
        const conversations = await runtime.listConversations({ scopeId });
        assert.equal(reads, 1, '整个会话列表连同群成员只读一次状态');
        const summary = conversations.find(item => item.conversationId === group.conversation.conversationId);
        const expectedMembers = await Promise.all(group.group.memberIds.map(id => repository.getPerson(scopeId, id)));
        assert.deepEqual(summary.group.members, expectedMembers, '成员顺序和空成员语义保持不变');
        reads = 0;
        assert.deepEqual(await runtime.getConversation({ scopeId, conversationId: summary.conversationId }), summary);
        assert.equal(reads, 1, '群详情连同成员只读一次状态');

        const conversationId = alice.conversation.conversationId;
        const inputs = Array.from({ length: 273 }, (_, i) => ({
            senderId: '__self__', senderType: 'self', type: 'text', content: '消息' + i, storyTime: '',
        }));
        const inserted = await repository.appendMessages(scopeId, conversationId, inputs);
        await repository.appendMessages(scopeId, conversationId, [{ ...inputs[0], quoteMessageId: inserted[0].messageId }]);
        const all = await repository.listMessages(scopeId, conversationId);
        const collected = [];
        let beforeSequence;
        do {
            reads = 0;
            const page = await runtime.listMessages({ scopeId, conversationId, beforeSequence });
            assert.equal(reads, 1, '消息页不得先读会话再读取消息');
            const expected = all.filter(m => beforeSequence === undefined || m.sequence < beforeSequence).slice(-50);
            assert.deepEqual(page.items, expected, '分页与原全量模型一致，包括页外引用');
            collected.unshift(...page.items);
            beforeSequence = page.nextBeforeSequence;
            if (!page.hasMore) break;
        } while (true);
        assert.deepEqual(collected, all, '翻页无遗漏或重复');
        for (const limit of [1, 200, 500, 0, -1, 2.5]) {
            const page = await runtime.listMessages({ scopeId, conversationId, limit });
            const size = Math.max(1, Math.min(200, Number(limit) || 50));
            assert.deepEqual(page.items, all.slice(-size));
        }
        reads = 0;
        const window = await runtime.listMessages({ scopeId, conversationId, fromSequence: all[1].sequence });
        assert.deepEqual(window.items, all.slice(1), '展开窗口超过200条也不能被分页上限截断');
        assert.equal(reads, 1, '窗口刷新只读一次根状态，不逐页重读');
        assert.equal(window.hasMore, true);
        await assert.rejects(repository.listMessagePage(scopeId, conversationId, { fromSequence: -1 }));
        await assert.rejects(repository.listMessagePage(scopeId, conversationId, { fromSequence: 1, beforeSequence: 3 }));
        const empty = { items: [], hasMore: false, nextBeforeSequence: null };
        assert.deepEqual(await runtime.listMessages({ scopeId, conversationId, beforeSequence: 0 }), empty);
        assert.deepEqual(await runtime.listMessages({ scopeId, conversationId: 'missing' }), empty);
        await repository.deleteMessages(scopeId, conversationId, [inserted[0].messageId]);
        const page = await runtime.listMessages({ scopeId, conversationId, limit: 1 });
        assert.equal(page.items[0].quote.status, 'deleted');
        assert.equal(page.items[0].quote.content, '');
        assert.equal((await repository.listMessages(scopeId, conversationId)).length, all.length - 1,
            '完整业务历史不受 UI 分页限制');
        const cutoff = all.at(-10).sequence;
        await repository.deleteMessages(scopeId, conversationId, all.filter(message => message.sequence >= cutoff).map(message => message.messageId));
        const survivors = await repository.listMessages(scopeId, conversationId);
        reads = 0;
        const fallback = await runtime.listMessages({ scopeId, conversationId, fromSequence: cutoff });
        assert.deepEqual(fallback.items, survivors.slice(-50), '整个窗口删除后回退到剩余最新页');
        assert.equal(reads, 1, '删除回退也不能额外读一次状态');
        await repository.deleteMessages(scopeId, conversationId, survivors.map(message => message.messageId));
        assert.deepEqual(await runtime.listMessages({ scopeId, conversationId, fromSequence: cutoff }), empty);
    } finally {
        runtime.destroy();
    }
}

async function main() {
    await testConversationReadsAndMessagePages();
    const { createMemoryQQV2StateStore } = await importModule('modules/qq-v2/storage/state-store.js');
    const { createQQV2GlobalRuntimeSettings } = await importModule(
        'modules/qq-v2/application/global-runtime-settings.js',
    );
    const baseStore = createMemoryQQV2StateStore();
    let reads = 0;
    let writes = 0;
    const stateStore = {
        async read() {
            reads += 1;
            return baseStore.read();
        },
        transact(mutator) {
            writes += 1;
            return baseStore.transact(mutator);
        },
    };
    const settings = createQQV2GlobalRuntimeSettings({ stateStore });
    await settings.get('scope-a');
    reads = 0;
    writes = 0;
    await settings.get('scope-a');
    assert.equal(reads, 1, '普通全局设置查询只读一次根状态');
    assert.equal(writes, 0, '已迁移的全局设置查询不得再写回整份根状态');

    const runtimeSource = fs.readFileSync(
        path.join(ROOT, 'modules/qq-v2/application/production-runtime.js'),
        'utf8',
    );
    assert.doesNotMatch(runtimeSource, /getExistingScope/u,
        'QQ 查询热路径不得保留“先确认 scope 再查询”的双读 helper');
    assert.match(runtimeSource, /const queryExistingScope = async[\s\S]*error\?\.code === 'scope_not_found'/u,
        '直接查询仍需保留 scope 不存在时的空结果语义');
    const querySlice = runtimeSource.slice(
        runtimeSource.indexOf('async listConversations({ scopeId })'),
        runtimeSource.indexOf('async releaseMediaRender({ scopeId, leaseId })'),
    );
    assert.doesNotMatch(querySlice, /repository\.getScope/u,
        '会话、资料和媒体查询不得额外读取一次完整 scope');
    assert.match(runtimeSource, /if \(snapshotReadPromise\) return snapshotReadPromise;/u,
        '同一轮 bootstrap 查询应复用正在进行的快照读取');
    assert.match(runtimeSource, /queueMicrotask\(\(\) => \{[\s\S]*snapshotReadPromise = null/u,
        '快照合并只能持续一个微任务，不得形成陈旧长期缓存');

    console.log('[qq-query-performance-contract] passed');
}

main().catch((error) => {
    console.error('[qq-query-performance-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
