const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const load = file => import(pathToFileURL(path.resolve(file)).href);

async function main() {
    const { resolveStableChatId } = await load('modules/integration/chat-identity.js');
    const { createContentPresetImageActions } = await load('modules/content-presets/image-actions.js');
    let context = { getCurrentChatId: () => 'chat-one' };
    const options = { getContext: () => context, getTavernHelper: () => ({ chatId: 'legacy-chat' }) };
    assert.equal(resolveStableChatId(options), 'chat-one', '优先当前宿主，不能被旧 helper 身份遮盖');
    context = { getCurrentChatId: () => 'chat-two' };
    assert.equal(resolveStableChatId(options), 'chat-two', '切换聊天后必须重新读取');
    for (const field of ['chatId', 'chat_id', 'chat_file']) {
        context = { [field]: 'field-chat', getCurrentChatId() { throw new Error('not ready'); } };
        assert.equal(resolveStableChatId(options), 'field-chat');
    }
    context = null;
    assert.equal(resolveStableChatId(options), 'legacy-chat', '保留旧 helper 兼容');
    const absent = { getContext: () => null, getTavernHelper: () => ({}) };
    assert.equal(resolveStableChatId(absent), '', '不得捏造聊天身份');
    assert.equal(resolveStableChatId({ getContext() { throw Error(); }, getTavernHelper() { throw Error(); } }), '');

    const row = { 姓名: '测试主角', 外貌: '短发' };
    const requests = [];
    const actions = createContentPresetImageActions({
        declaration: { imageGeneration: { canvases: [{ tableName: '主角表', canvas: 'avatar', stableIdentityFields: ['姓名'], promptFields: ['外貌'] }] } },
        getRawData: () => ({ sheet_hero: { name: '主角表', content: [['姓名', '外貌'], Object.values(row)] } }),
        getChatScope: () => resolveStableChatId({ getContext: () => context, getTavernHelper: () => ({}) }),
        isSourceActive: async () => true, isCurrent: () => true,
        isImageGenerationEnabled: async () => true, isTableEnabled: async () => true,
        imageGenerationService: {
            async generate(input) { requests.push(input); return { ok: true, status: 'generated' }; },
            async read() { return null; },
        },
    });
    assert.equal((await actions.generateImage('avatar', row)).reason, 'chat-unavailable');
    assert.equal(requests.length, 0);
    context = { getCurrentChatId: () => 'chat-a' };
    assert.equal((await actions.getImageGenerationState('avatar', row)).available, true);
    assert.equal((await actions.generateImage('avatar', row)).ok, true);
    assert.equal(requests[0].chatScope, 'chat-a');
    assert.deepEqual(requests[0].canvas.stableIdentityFields, ['姓名']);
    context = { getCurrentChatId: () => 'chat-b' };
    assert.equal(await requests[0].requestContext.isStillCurrent({ chatScope: 'chat-a', physicalTable: 'sheet_hero' }), false, '切换聊天后拒绝旧图回写');
    await actions.generateImage('avatar', row);
    assert.equal(requests[1].chatScope, 'chat-b');
    console.log('[content-presets-chat-identity] 通过：宿主身份读取、helper兼容、空聊天阻断、姓名标识与切聊复核；仅内存替身');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
