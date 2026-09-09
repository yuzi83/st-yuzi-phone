const assert = require('node:assert/strict');
(async () => {
    const { getInlineMessageTarget } = await import('../modules/integration/inline-message-bridge.js');
    let chat = [{ is_user: false, mes: '开场白' }, { is_user: true, mes: '你好' }];
    global.window = { SillyTavern: { getContext: () => ({ chat }) } };
    const greeting = {}, latest = {};
    const nodes = new Map([['#chat > .mes[mesid="0"]', { getClientRects: () => [1], querySelector: () => greeting }]]);
    const doc = { querySelector: key => nodes.get(key) };
    assert.equal(getInlineMessageTarget(doc).element, greeting, '开场白是合法 AI 楼层，不选择末尾用户楼');
    chat = [...chat, { is_user: false, mes: '新正文' }];
    nodes.set('#chat > .mes[mesid="2"]', { getClientRects: () => [1], querySelector: () => latest });
    assert.equal(getInlineMessageTarget(doc).element, latest, '每次读取 fresh context');
    assert.equal(getInlineMessageTarget(doc).text, '新正文');
    chat = [{ is_user: true, mes: '无 AI 开场' }];
    assert.equal(getInlineMessageTarget(doc), null);
    delete global.window;
    console.log('[通过] 正文宿主目标、开场白与缺少目标');
})().catch(error => { console.error(error); process.exitCode = 1; });
