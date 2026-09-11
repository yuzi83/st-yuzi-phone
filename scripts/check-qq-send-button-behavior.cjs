const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const assistantXml = '<qq><message conversation="P1" sender="N1" type="text">收到这批消息</message></qq>';
const noneXml = '<qq><none /></qq>';
const readXml = '<qq><read conversation="P1" /></qq>';
function element(tagName, attributes = {}, children = [], textContent = '') {
    return { nodeType: 1, tagName, textContent, children, childNodes: children.length ? children : textContent ? [{ nodeType: 3, textContent }] : [],
        attributes: Object.entries(attributes).map(([name, value]) => ({ name, value })),
        getAttribute: name => attributes[name] ?? null, hasAttribute: name => Object.hasOwn(attributes, name) };
}
// 浏览器 XML 边界替身；动作解析、校验和保存仍使用真实业务代码。
global.DOMParser = class { parseFromString(xml) {
    assert.ok([readXml, noneXml, assistantXml].includes(xml));
    const action = xml === assistantXml ? element('message', { conversation: 'P1', sender: 'N1', type: 'text' }, [], '收到这批消息') : xml === noneXml ? element('none') : element('read', { conversation: 'P1' });
    const root = element('qq', {}, [action]);
    return { documentElement: root, childNodes: [root], getElementsByTagName: () => [] };
} };
async function waitFor(predicate) {
    for (let i = 0; i < 400; i++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 5)); }
    assert.fail('等待请求状态超时');
}
const tick = () => new Promise(resolve => setTimeout(resolve, 1200));
async function main() {
    const { createMemoryQQV2StateStore } = await import('../modules/qq-v2/storage/state-store.js');
    const { createQQV2ProductionRuntime } = await import('../modules/qq-v2/application/production-runtime.js');
    const calls = [];
    let storyMessages = [];
    let hold = false;
    let backendXml = readXml;
    let release;
    let scopeId = 'send-button-test';
    const runtimeOptions = {
        stateStore: createMemoryQQV2StateStore(), cryptoApi: webcrypto, proactiveStorySettleDelayMs: 0,
        host: {
            readScope: () => ({ scopeId, chatId: scopeId, chatFile: scopeId, hostType: 'character', hostId: 'alice' }),
            readUserIdentity: () => ({ name: '用户' }), readStoryTime: () => '2042-05-20 09:30',
            readStoryMessages: () => storyMessages, readRawContext: () => ({}),
        },
        backend: { async generate(input) { calls.push(input); if (hold) await new Promise(resolve => { release = resolve; }); return { content: backendXml }; }, async loadModels() { return []; } },
        worldbookGateway: { async getCurrentCharacterBookNames() { return { primary: '', additional: [] }; }, async loadBook() { return { entries: {} }; }, async saveBook() {} },
        worldbookContextResolver: { async resolve() { return ''; } },
    };
    let runtime = createQQV2ProductionRuntime(runtimeOptions);
    try {
        await runtime.initialize();
        let facade = runtime.getFacade();
        assert.equal((await facade.query.globalSettings()).settings.sendButtonEnabled, false, '新用户默认关闭');
        const api = await facade.intent.saveApiPreset({ preset: { name: 'Test', endpoint: 'https://example.test/v1', model: 'test', apiKey: 'test' } });
        assert.equal(api.ok, true);
        const created = await facade.intent.createPrivateConversation({ name: 'Alice' });
        assert.equal(created.ok, true);
        const conversationId = created.result.conversation.conversationId;
        const saved = await facade.intent.updateGlobalSettings({ settings: { activeApiPresetId: api.apiPreset.presetId, sendButtonEnabled: true } });
        assert.equal(saved.ok, true);
        assert.equal(saved.settings.sendButtonEnabled, true, '开启设置应通过应用入口保存并返回');
        assert.equal((await facade.intent.sendMessage({ conversationId, message: { type: 'text', content: '第一条' } })).ok, true);
        await tick();
        assert.equal(calls.length, 0, '空闲时只保存消息，不调用回复 API');
        assert.equal((await facade.query.messages({ conversationId })).page.items.at(-1).content, '第一条');
        const send = content => facade.intent.sendMessage({ conversationId, message: { type: 'text', content } });
        const phase = async () => (await facade.query.conversation({ conversationId })).conversation.request.phase;
        await send('第二条');
        assert.equal((await facade.intent.retryRequest({ conversationId })).ok, true);
        await waitFor(async () => calls.length === 1 && await phase() === 'idle');
        assert.ok(JSON.stringify(calls[0]).includes('第一条') && JSON.stringify(calls[0]).includes('第二条'), '一次请求包含整批消息');
        await facade.intent.retryRequest({ conversationId });
        await tick();
        assert.equal(calls.length, 1, '已读处理批次后空提交不请求');
        await send('第三条');
        await tick();
        assert.equal(calls.length, 1, '回复完成后重新等待手动提交');
        hold = true;
        await facade.intent.retryRequest({ conversationId });
        await waitFor(() => calls.length === 2);
        await facade.intent.cancelManualRequest({ conversationId });
        await send('终止后第四条');
        hold = false;
        release();
        await tick();
        assert.equal(calls.length, 2, '终止后马上继续发消息也不得自动重启请求');
        const { createComposerBatchSubmitter, composerAction } = await import('../modules/qq-v2/ui/composer.js');
        assert.equal(composerAction({ enabled: true, phase: 'idle' }), 'send');
        assert.equal(composerAction({ enabled: true, phase: 'failed' }), 'send');
        assert.equal(composerAction({ enabled: true, phase: 'queued' }), 'stop');
        assert.equal(composerAction({ enabled: true, phase: 'running' }), 'stop');
        assert.equal(composerAction({ enabled: false, phase: 'idle' }), null);
        assert.equal(composerAction({ enabled: false, phase: 'running' }), 'stop');
        const submitBatch = createComposerBatchSubmitter({
            facade,
            submitDraft: async (id, value) => (await facade.intent.sendMessage({ conversationId: id, message: { type: 'text', content: value } })).ok,
        });
        const submissions = await Promise.all([
            submitBatch(conversationId, '纸飞机里的第五条'),
            submitBatch(conversationId, '纸飞机里的第五条'),
        ]);
        assert.equal(submissions[0].ok, true);
        await waitFor(async () => calls.length === 3 && await phase() === 'idle');
        assert.equal((await facade.query.messages({ conversationId })).page.items.filter(item => item.content === '纸飞机里的第五条').length, 1, '连续点击不重复保存草稿');
        assert.ok(JSON.stringify(calls[2]).includes('终止后第四条') && JSON.stringify(calls[2]).includes('纸飞机里的第五条'), '纸飞机先发送草稿再提交整批');
        await submitBatch(conversationId, '   ');
        await tick();
        assert.equal(calls.length, 3, '空白草稿且无未回复消息时不请求');
        await send('不能跨作用域提交');
        const stale = await facade.intent.retryRequest({ conversationId, scopeId: 'old-scope' });
        assert.equal(stale.status, 'stale', '纸飞机不得提交切换作用域后的同名会话');
        const bob = await facade.intent.createPrivateConversation({ name: 'Bob' });
        await facade.intent.updateGlobalSettings({ settings: { proactive: { enabled: true, everyTurns: 1, privateWeight: 100 } } });
        storyMessages = [{ messageId: 1, role: 'assistant', content: '故事继续', isHidden: false, isSystem: false }];
        await runtime.handleMessageReceived(1, 'normal');
        await waitFor(() => calls.length === 4);
        assert.equal(JSON.stringify(calls[3]).includes('不能跨作用域提交'), false, '主动消息不能读取并抢先处理尚未点纸飞机的会话');
        await facade.intent.updateGlobalSettings({ settings: { proactive: { enabled: false } } });
        hold = true;
        await submitBatch(conversationId, '');
        await waitFor(() => calls.length === 5);
        const oldRelease = release;
        await send('生成中追加');
        assert.equal(calls[4].signal.aborted, true, '生成中发送仍中止旧请求');
        await send('排队中追加');
        oldRelease();
        await waitFor(() => calls.length === 6);
        assert.ok(JSON.stringify(calls[5]).includes('生成中追加') && JSON.stringify(calls[5]).includes('排队中追加'), '自动重排包含排队期间的新消息');
        await facade.intent.retryRequest({ conversationId });
        hold = false;
        release();
        await tick();
        assert.equal(calls.length, 6, '生成期间重复提交不会启动第二次请求');
        const group = await facade.intent.createGroupConversation({ name: '测试群', memberIds: [created.result.person.personId, bob.result.person.personId] });
        assert.equal(group.ok, true);
        const library = await facade.query.assistantCharacters();
        const assistant = await facade.intent.openAssistant({ characterId: library.characters[0].characterId });
        assert.equal(assistant.ok, true);
        const groupId = group.result.conversation.conversationId;
        const assistantId = assistant.result.conversation.conversationId;
        for (const id of [conversationId, groupId, assistantId]) {
            for (const type of ['text', 'voice', 'image', 'video', 'transfer', 'sticker']) {
                const result = await facade.intent.sendMessage({ conversationId: id, message: { type, content: `等待提交的${type}`, ...(type === 'sticker' ? { stickerId: 'test-sticker' } : {}), ...(type === 'transfer' ? { transfer: { amount: '20', currency: '元', note: '等待提交的transfer', recipientId: id === assistantId ? assistant.result.conversation.personId : created.result.person.personId } } : {}) } });
                assert.equal(result.ok, true, `${id} / ${type} 保存成功`);
            }
        }
        await tick();
        assert.equal(calls.length, 6, '私聊、群聊和助手的各类消息均不自动调用 API');
        // Destroy/recreate is the reload boundary; the store is the same external persistence adapter.
        runtime.destroy();
        runtime = createQQV2ProductionRuntime(runtimeOptions);
        await runtime.initialize();
        facade = runtime.getFacade();
        assert.equal((await facade.query.globalSettings()).settings.sendButtonEnabled, true, '重建运行时后设置保持开启');
        assert.equal((await facade.query.messages({ conversationId: assistantId })).page.items.at(-1).content, '等待提交的sticker', '刷新后助手消息仍保留');
        await tick();
        assert.equal(calls.length, 6, '刷新不会提交已有消息');
        scopeId = 'send-button-other-scope';
        await runtime.handleChatChanged();
        assert.equal((await facade.query.globalSettings()).settings.sendButtonEnabled, true, '切换酒馆聊天后仍使用同一开关');
        scopeId = 'send-button-test';
        await runtime.handleChatChanged();
        await facade.intent.updateGlobalSettings({ settings: { sendButtonEnabled: false } });
        await tick();
        assert.equal(calls.length, 6, '关闭开关本身不提交已有消息');
        backendXml = assistantXml;
        await facade.intent.sendMessage({ conversationId: assistantId, message: { type: 'text', content: '关闭后继续' } });
        await waitFor(() => calls.length === 7);
        assert.ok(JSON.stringify(calls[6]).includes('等待提交的text') && JSON.stringify(calls[6]).includes('关闭后继续'), '关闭后助手恢复自动提交整个未回复批次');
        await waitFor(async () => { const request = (await facade.query.conversation({ conversationId: assistantId })).conversation.request; assert.notEqual(request.phase, 'failed', request.error); return request.phase === 'idle'; });
        await facade.intent.updateGlobalSettings({ settings: { sendButtonEnabled: true } });
        hold = true;
        backendXml = noneXml;
        const submitGroup = createComposerBatchSubmitter({
            facade,
            submitDraft: async (id, content) => (await facade.intent.sendMessage({ conversationId: id, message: { type: 'text', content } })).ok,
        });
        await submitGroup(groupId, '群聊纸飞机草稿');
        await waitFor(() => calls.length === 8);
        assert.ok(JSON.stringify(calls[7]).includes('等待提交的transfer') && JSON.stringify(calls[7]).includes('群聊纸飞机草稿'), '群聊提交包含类型消息和当前草稿');
        await facade.intent.updateGlobalSettings({ settings: { sendButtonEnabled: false } });
        await facade.intent.updateGlobalSettings({ settings: { sendButtonEnabled: true } });
        assert.equal(calls[7].signal.aborted, false, '生成中切换开关不取消现有请求');
        assert.equal(calls.length, 8, '切换开关不新增请求');
        hold = false;
        release();
        await waitFor(async () => (await facade.query.conversation({ conversationId: groupId })).conversation.request.phase === 'idle');
        const draftFailed = await submitGroup('missing-conversation', '不能保存的草稿');
        assert.equal(draftFailed.status, 'draft-failed');
        await tick();
        assert.equal(calls.length, 8, '草稿保存失败不继续提交请求');

    } finally { runtime.destroy(); }
}
main().then(() => console.log('[qq-send-button] passed')).catch(error => { console.error(error); process.exitCode = 1; });

