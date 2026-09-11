const assert = require('node:assert/strict');
// 浏览器 DOM 边界替身；只接受本测试后端返回的固定 XML，不替换业务解析器。
const readXml = '<qq><read conversation="P1" /></qq>';
const imageXml = '<qq><message conversation="P1" sender="N1" type="image">和林月合影</message></qq>';
let backendReply = '';
const replyXml = '<qq><message conversation="P1" sender="N1" type="text">一起聊聊呀。</message></qq>';
function element(tagName, attributes = {}, textContent = '', children = []) {
    return { nodeType: 1, tagName, textContent, children,
        childNodes: children.length ? children : textContent ? [{ nodeType: 3, textContent }] : [],
        attributes: Object.entries(attributes).map(([name, value]) => ({ name, value })),
        getAttribute: name => attributes[name] ?? null, hasAttribute: name => Object.hasOwn(attributes, name) };
}
global.DOMParser = class {
    parseFromString(xml) {
        assert.ok([replyXml, imageXml, readXml].includes(xml));
        const root = element('qq', {}, '', [xml === readXml ? element('read', { conversation: 'P1' }) : element('message', { conversation: 'P1', sender: 'N1', type: xml === imageXml ? 'image' : 'text' }, xml === imageXml ? '和林月合影' : '一起聊聊呀。')]);
        return { documentElement: root, childNodes: [root], getElementsByTagName: () => [] };
    }
};
async function main() {
    const { createMemoryQQV2StateStore } = await import('../modules/qq-v2/storage/state-store.js');
    const { createWorldbookContextResolver } = await import('../modules/worldbook-reading/context-resolver.js');
    const { createQQV2ProductionRuntime } = await import('../modules/qq-v2/application/production-runtime.js');
    let scopeId = 'assistant-test-a';
    let sentPrompt = null;
    const { composeCharacterImagePrompt } = await import('../modules/image-generation/character-mapping.js');
    const generatedPrompts = [], removedImages = [];
    let finishImage = null, imageStarted = null, delayImage = false;
    const rawData = { sheet_people: { name: '人物表', content: [['姓名', '外貌'], ['林月', '红发']] } };
    const mappings = [{ mappingId: 'people', sheetKey: 'sheet_people', nameColumn: { columnIndex: 0, headerSnapshot: '姓名' }, promptColumns: [{ columnIndex: 1, headerSnapshot: '外貌' }] }];
    const runtime = createQQV2ProductionRuntime({
        stateStore: createMemoryQQV2StateStore(),
        worldbookContextResolver: createWorldbookContextResolver({
            loadWorldbooks: async () => [{ name: '测试设定', entries: [
                { uid: 1, key: ['北白川玉子'], content: '世界书命中人物', preventRecursion: true },
                { uid: 2, key: ['山谷'], content: '世界书命中新正文', preventRecursion: true },
                { uid: 3, key: ['剧情'], content: '世界书命中陪聊', preventRecursion: true },
                { uid: 4, key: ['旧钥匙'], content: '旧楼层不应命中', preventRecursion: true },
            ] }], readSelection: async () => ({}),
        }),
        composeCharacterImagePrompt: input => composeCharacterImagePrompt({ ...input, rawData, mappings }),
        getImageGenerationConfig: () => ({ enabled: true, promptTranslationEnabled: false }),
        imageGenerationService: {
            generateAndStore: async input => {
                generatedPrompts.push(input.prompt);
                if (delayImage) { imageStarted(); await new Promise(resolve => { finishImage = resolve; }); }
                return { ok: true, path: `user/images/yuzi-phone-generated/assistant-${generatedPrompts.length}.png` };
            },
            deleteStoredImage: async ({ path }) => { removedImages.push(path); },
        },
        host: {
            readScope: () => ({ scopeId, hostType: 'character', hostId: 'test', chatId: scopeId, chatFile: scopeId }),
            readUserIdentity: () => ({ name: '读者' }), readStoryTime: () => '', readStoryMessages: () => [{ role: 'user', content: '旧钥匙' }, { role: 'user', content: '山谷' }, { role: 'assistant', content: '<content>落雨</content>' }],
        },
        backend: { generate: async ({ messages }) => { sentPrompt = messages; return { content: backendReply || replyXml };  }, loadModels: async () => [] },
        worldbookGateway: { getCurrentCharacterBookNames: async () => ({ primary: '', additional: [] }), loadBook: async () => ({ entries: {} }), saveBook: async () => { throw new Error('assistant must not write worldbooks'); } },
    });
    await runtime.initialize();
    const facade = runtime.getFacade();
    const presets = (await facade.query.sharedResources()).promptPresets;
    const companion = presets.find(item => item.name === '陪聊');
    assert.ok(companion, '内置陪聊预设可通过既有管理入口读取');
    assert.equal(companion.messages[0].role, 'system');
    assert.equal(companion.messages.at(-2).role, 'system');
    assert.equal(companion.messages.at(-1).role, 'assistant');
    assert.ok(companion.messages.some(item => item.content.includes('{{人物人设}}')));
    assert.equal((await facade.query.globalSettings()).settings.assistantReplyPresetId, companion.presetId);
    const chosen = await facade.intent.savePromptPreset({ preset: { name: '我的陪聊', messages: companion.messages } });
    assert.equal(chosen.ok, true);
    await facade.intent.updateGlobalSettings({ settings: { assistantReplyPresetId: chosen.promptPreset.presetId } });
    assert.equal((await facade.query.globalSettings()).settings.assistantReplyPresetId, chosen.promptPreset.presetId, '陪聊预设选择可以独立保存');
    const library = await facade.query.assistantCharacters();
    assert.equal(library.ok, true);
    assert.equal(library.characters[0].formalName, '北白川玉子');
    const opened = await facade.intent.openAssistant({ characterId: library.characters[0].characterId });
    assert.equal(opened.ok, true);
    const bg = await facade.intent.saveMedia({ media: { conversationId: opened.result.conversation.conversationId, kind: 'background', blob: new Blob(['background'], { type: 'image/png' }), mimeType: 'image/png' } });
    assert.equal(bg.ok, true);
    const background = await facade.intent.updatePrivateProfile({ conversationId: opened.result.conversation.conversationId, profile: { backgroundAssetId: bg.media.assetId } });
    assert.equal(background.ok, true, '助手聊天背景继续复用私聊资料更新入口');
    const again = await facade.intent.openAssistant({ characterId: library.characters[0].characterId });
    assert.equal(again.result.conversation.conversationId, opened.result.conversation.conversationId);
    assert.equal((await facade.query.conversations()).conversations.length, 0, '助手不出现在普通消息页');
    assert.equal((await facade.query.assistantConversations()).conversations.length, 1);
    const characterId = library.characters[0].characterId;
    const saved = await facade.intent.saveAssistantCharacter({ characterId, patch: { persona: '我是会陪你吐槽的玉子。' } });
    assert.equal(saved.ok, true);
    const api = await facade.intent.saveApiPreset({ preset: { name: 'test', endpoint: 'https://example.test/v1', apiKey: 'test', model: 'test' } });
    await facade.intent.updateGlobalSettings({ settings: { activeApiPresetId: api.apiPreset.presetId } });
    const conversationId = opened.result.conversation.conversationId;
    assert.equal((await facade.intent.sendMessage({ conversationId, message: { type: 'text', content: '这段剧情怎么看？' } })).ok, true);
    for (let i = 0; i < 200; i++) {
        const messages = (await facade.query.messages({ conversationId })).page.items;
        if (messages.some(item => item.content === '一起聊聊呀。')) break;
        await new Promise(resolve => setTimeout(resolve, 5));
    }
    const promptText = sentPrompt.map(item => item.content).join('\n');
    for (const expected of ['世界书命中人物', '世界书命中新正文', '世界书命中陪聊']) assert.ok(promptText.includes(expected));
    assert.equal(promptText.includes('旧楼层不应命中'), false, '世界书激活沿用最近两条合格正文，而非整段正文上下文');
    assert.ok(sentPrompt?.some(item => item.content.includes('我是会陪你吐槽的玉子。')), '请求使用保存的人设');
    assert.ok((await facade.query.messages({ conversationId })).page.items.some(item => item.content === '一起聊聊呀。'), '实际请求通过私聊协议落库');
    assert.equal((await facade.intent.setConversationInjection({ conversationId, injection: { enabled: true } })).ok, false, '助手拒绝世界书写入入口');
    assert.equal((await facade.intent.openAssistant({ characterId: '__proto__' })).ok, false, '未知人物 ID 不能使用原型属性');
    backendReply = imageXml;
    await facade.intent.sendMessage({ conversationId, message: { type: 'text', content: '来张合影' } });
    let imageMessage;
    for (let i = 0; i < 200; i++) {
        imageMessage = (await facade.query.messages({ conversationId })).page.items.find(item => item.type === 'image');
        if (imageMessage) break;
        await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.ok(imageMessage, '陪聊可以发图片消息');
    const imageInput = { conversationId, messageId: imageMessage.messageId };
    assert.equal((await facade.intent.generateMessageImage(imageInput)).ok, true);
    assert.equal(generatedPrompts[0], '北白川玉子，林月，红发，和林月合影', '复用合影人物识别与表格映射');
    delayImage = true;
    const started = new Promise(resolve => { imageStarted = resolve; });
    const pendingImage = facade.intent.generateMessageImage(imageInput);
    await started;
    assert.equal((await facade.intent.deleteConversation({ conversationId })).ok, true);
    finishImage();
    assert.equal((await pendingImage).ok, false, '删除之后的迟到生图不得重新挂回会话');
    assert.ok(removedImages.includes('user/images/yuzi-phone-generated/assistant-1.png'));
    assert.ok(removedImages.includes('user/images/yuzi-phone-generated/assistant-2.png'));
    assert.equal((await facade.query.assistantConversations()).conversations.length, 0);
    backendReply = readXml;
    const refusing = await facade.intent.openAssistant({ characterId });
    const refusingId = refusing.result.conversation.conversationId;
    await facade.intent.sendMessage({ conversationId: refusingId, message: { type: 'text', content: '不要已读不回' } });
    let refused;
    for (let i = 0; i < 200; i++) {
        refused = (await facade.query.conversation({ conversationId: refusingId })).conversation.request;
        if (refused.phase === 'failed') break;
        await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.equal(refused.phase, 'failed', '陪聊不允许沿用私聊已读不回动作');
    assert.equal((await facade.query.messages({ conversationId: refusingId })).page.items.length, 1);
    await facade.intent.deleteConversation({ conversationId: refusingId });
    backendReply = '';
    scopeId = 'assistant-test-b'; await runtime.handleChatChanged();
    assert.equal((await facade.query.assistantConversations()).conversations.length, 0);
    const second = await facade.intent.openAssistant({ characterId });
    assert.notEqual(second.result.conversation.conversationId, opened.result.conversation.conversationId);
    const shared = (await facade.query.assistantCharacters()).characters[0];
    assert.equal(shared.persona, '我是会陪你吐槽的玉子。');
    assert.ok(shared.defaultPersona.includes('年龄：16岁'));
    assert.equal((await facade.intent.deleteConversation({ conversationId: second.result.conversation.conversationId })).ok, true);
    assert.equal((await facade.query.assistantConversations()).conversations.length, 0);
    assert.equal((await facade.query.assistantCharacters()).characters[0].persona, '我是会陪你吐槽的玉子。');
    const custom = await facade.intent.openAssistant({ name: '自建陪聊' });
    const customId = custom.result.conversation.assistantCharacterId;
    scopeId = 'assistant-test-a'; await runtime.handleChatChanged();
    await facade.intent.openAssistant({ characterId: customId });
    assert.equal((await facade.intent.deleteAssistantCharacter({ characterId: customId })).ok, true);
    assert.equal((await facade.query.assistantCharacters()).characters.some(item => item.characterId === customId), false);
    scopeId = 'assistant-test-b'; await runtime.handleChatChanged();
    assert.equal((await facade.query.assistantConversations()).conversations.length, 0);
    assert.equal((await facade.intent.deleteAssistantCharacter({ characterId })).ok, false);
    await runtime.destroy();
    console.log('QQ assistant: characters, scope isolation, deletion, presets, reply protocol, worldbook read-only and image lifecycle passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
