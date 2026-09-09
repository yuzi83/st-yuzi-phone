const assert = require('node:assert/strict');
const fs = require('node:fs');
const { webcrypto } = require('node:crypto');

async function main() {
    const { createMemoryQQV2StateStore } = await import('../modules/qq-v2/storage/state-store.js');
    const { createQQV2Repository } = await import('../modules/qq-v2/domain/repository.js');
    const { createQQV2ProductionRuntime } = await import('../modules/qq-v2/application/production-runtime.js');
    const stateStore = createMemoryQQV2StateStore();
    const repository = createQQV2Repository({ stateStore });
    const scopeId = 'st:character:alice:edit-recall';
    const events = [];
    const runtime = createQQV2ProductionRuntime({
        stateStore, repository, cryptoApi: webcrypto,
        host: {
            readScope: () => ({ scopeId, hostType: 'character', hostId: 'alice', chatId: 'edit-recall', chatFile: 'edit-recall' }),
            readUserIdentity: () => ({ name: '用户', avatar: '' }),
            readStoryTime: () => '2042-05-20 09:30',
            readStoryMessages: () => [],
            readRawContext: () => ({ getRequestHeaders: () => ({}) }),
        },
        requestService: {
            cancelScope() {},
            cancelProactive() {},
            enqueueProactive() { throw new Error("编辑或撤回不能排队生成"); },
            getConversationState: () => ({ phase: 'idle' }),
            async cancelConversation() { events.push('cancel'); },
            async reconcileConversation() { events.push('reconcile'); },
        },
        backend: { async generate() { throw new Error('编辑或撤回不能发起生成'); }, async loadModels() { return []; } },
        projectionService: { async retryPending() {}, async syncConversation() { events.push('sync'); } },
    });
    await runtime.initialize();
    try {
        const facade = runtime.getFacade();
        const { conversation, person } = await repository.createPrivateConversation(scopeId, { name: 'Alice' });
        const conversationId = conversation.conversationId;
        const self = (type, content, extra = {}) => ({ senderId: '__self__', senderType: 'self', type, content, ...extra });
        const npc = (content, extra = {}) => ({ senderId: person.personId, senderType: 'person', type: 'text', content, ...extra });
        const [first, reply, latest] = await repository.appendMessages(scopeId, conversationId, [self('text', '第一轮'), npc('第一轮回复'), self('text', '撤回原文')]);
        const [laterSelf] = await repository.appendMessages(scopeId, conversationId, [self('text', '更晚发送的用户消息')]);
        const tail = await repository.appendMessages(scopeId, conversationId, Array.from({ length: 70 }, (_, i) => npc(`后续回复 ${i}`)));
        const page = await facade.query.messages({ conversationId });
        assert.equal(page.page.items.length, 50);
        assert.equal(page.page.items.some((m) => m.messageId === latest.messageId), false, '待撤回旧消息不在当前末页');
        const older = await facade.query.messages({ conversationId, beforeSequence: tail[25].sequence });
        assert.equal(older.page.items.some((m) => m.messageId === latest.messageId), true, '加载历史页可找到待撤回的旧用户消息');

        events.length = 0;
        const edited = await facade.intent.editMessage({ conversationId, messageId: first.messageId, content: '  编辑后的原文\n第二行  ' });
        assert.equal(edited.ok, true);
        assert.equal(edited.result.message.messageId, first.messageId);
        assert.equal(edited.result.message.content, '  编辑后的原文\n第二行  ');
        assert.deepEqual(events, ['cancel', 'reconcile', 'sync']);
        assert.equal((await repository.listMessages(scopeId, conversationId)).length, 74);
        assert.equal((await facade.intent.editMessage({ conversationId, messageId: reply.messageId, content: '编辑 NPC' })).ok, true);
        assert.equal((await facade.intent.editMessage({ conversationId, messageId: reply.messageId, content: '  ' })).ok, false);
        assert.equal((await facade.intent.editMessage({ conversationId, messageId: reply.messageId, content: {} })).ok, false);

        assert.equal((await facade.intent.recallMessage({ conversationId, messageId: tail.at(-1).messageId })).ok, false);
        assert.equal((await repository.listMessages(scopeId, conversationId)).length, 74, '拒绝撤回 NPC 后原记录完整保留');
        events.length = 0;
        const recalled = await facade.intent.recallMessage({ conversationId, messageId: latest.messageId });
        assert.equal(recalled.ok, true);
        assert.equal(recalled.result.recalledMessage.content, '撤回原文');
        assert.equal(recalled.result.deletedMessageIds.length, 72, '撤回旧消息必须删除后续用户消息和超过一页的 NPC 回复');
        assert.equal(recalled.result.deletedMessageIds.includes(laterSelf.messageId), true);
        assert.deepEqual(events, ['cancel', 'reconcile', 'sync']);
        assert.deepEqual((await repository.listMessages(scopeId, conversationId)).map((m) => m.messageId), [first.messageId, reply.messageId]);
        assert.equal((await facade.intent.recallMessage({ conversationId, messageId: latest.messageId })).ok, false);

        const [transfer] = await repository.appendMessages(scopeId, conversationId, [self('transfer', '转账', { transfer: { amount: '10', currency: '元', note: '旧备注', status: 'accepted' } })]);
        const transferEdit = await facade.intent.editMessage({ conversationId, messageId: transfer.messageId, content: '' });
        assert.equal(transferEdit.ok, true, '转账备注可以清空');
        assert.deepEqual(transferEdit.result.message.transfer, { ...transfer.transfer, note: '' });
        const longNote = '  ' + '备注'.repeat(800) + '\n';
        assert.equal((await facade.intent.editMessage({ conversationId, messageId: transfer.messageId, content: longNote })).result.message.transfer.note, longNote, '编辑回读不能截断备注');
        const [system] = await repository.appendMessages(scopeId, conversationId, [npc('系统通知', { senderType: 'system', type: 'system' })]);
        assert.equal((await facade.intent.editMessage({ conversationId, messageId: system.messageId, content: '不能编辑系统通知' })).ok, false);
        assert.equal((await facade.intent.recallMessage({ conversationId, messageId: system.messageId })).ok, false, '系统通知不能作为撤回起点');
        const transferRecall = await facade.intent.recallMessage({ conversationId, messageId: transfer.messageId });
        assert.equal(transferRecall.result.recalledMessage.type, 'transfer');
        assert.deepEqual(transferRecall.result.deletedMessageIds, [transfer.messageId, system.messageId]);
        for (const type of ['image', 'video', 'voice', 'sticker']) {
            const [message] = await repository.appendMessages(scopeId, conversationId, [self(type, '旧描述')]);
            const result = await facade.intent.editMessage({ conversationId, messageId: message.messageId, content: '新描述' });
            assert.equal(result.ok, true, type);
            assert.equal(result.result.message.content, '新描述');
        }
        const another = await repository.createPrivateConversation(scopeId, { name: 'Bob' });
        assert.equal((await facade.intent.editMessage({ conversationId: another.conversation.conversationId, messageId: first.messageId, content: '越界' })).ok, false);
        assert.equal((await facade.intent.recallMessage({ conversationId: another.conversation.conversationId, messageId: first.messageId })).ok, false);
    } finally { runtime.destroy(); }

    // Execute the actual UI draft-restoration path with a small isolated harness.
    const source = fs.readFileSync('modules/qq-v2/ui/app.js', 'utf8');
    const body = source.slice(source.indexOf('    const recallMessage = async'), source.indexOf('    const openMessageQuickMenu ='));
    const drafts = new Map([['c', '现有草稿']]);
    let original = { type: 'text', content: '撤回正文' };
    const recall = new Function('currentScopeKey', 'facade', 'disposed', 'drafts', 'clearOverlay', 'loadMessages', 'render', body + '\nreturn recallMessage;')(
        () => 'scope', { intent: { recallMessage: async () => ({ ok: true, result: { recalledMessage: original } }) } }, false, drafts, () => {}, async () => {}, async () => {},
    );
    await recall('c', 'm');
    assert.equal(drafts.get('c'), '现有草稿\n撤回正文');
    drafts.clear();
    await recall('c', 'm');
    assert.equal(drafts.get('c'), '撤回正文');
    for (const type of ['voice', 'video', 'image', 'sticker', 'transfer']) {
        original = { type, content: '非文本不回填' };
        await recall('c', 'm');
        assert.equal(drafts.get('c'), '撤回正文');
    }
    const editorBody = source.slice(source.indexOf('    const openMessageEditor ='), source.indexOf('    const recallMessage = async'));
    const elements = [];
    const saved = [];
    let dialog;
    let editorResult = { ok: false, error: { message: '模拟保存失败' } };
    let closes = 0;
    const makeElement = () => {
        const element = { value: '', handlers: {}, setAttribute() {}, append() {}, focus() {}, addEventListener(name, handler) { this.handlers[name] = handler; } };
        elements.push(element);
        return element;
    };
    const editor = new Function('createElement', 'createButton', 'clearOverlay', 'facade', 'loadMessages', 'render', 'shouldSubmitComposerKey', 'showDialog', editorBody + '\nreturn openMessageEditor;')(
        makeElement, makeElement, () => { closes += 1; },
        { intent: { editMessage: async (input) => { saved.push(input); return editorResult; } } },
        async () => {}, async () => {}, () => false, (value) => { dialog = value; },
    );
    editor('c', { messageId: 'm', type: 'text', content: '原文' });
    const input = elements[1];
    assert.equal(input.value, '原文');
    input.value = '修改后的内容';
    await dialog.actions[1].handlers.click();
    assert.equal(closes, 0, '失败不关闭弹窗');
    assert.equal(input.value, '修改后的内容', '失败不清空输入');
    assert.equal(input.disabled, false);
    assert.equal(elements[2].textContent, '模拟保存失败');
    editorResult = { ok: true };
    await dialog.actions[1].handlers.click();
    assert.equal(closes, 1);
    assert.deepEqual(saved.at(-1), { conversationId: 'c', messageId: 'm', content: '修改后的内容' });
    console.log('[qq-message-edit-recall-contract] passed');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
