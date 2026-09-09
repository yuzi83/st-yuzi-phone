const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync('modules/qq-v2/ui/app.js', 'utf8');
const quick = source.slice(source.indexOf('    const openMessageQuickMenu ='), source.indexOf('    const messageMenu = createMessageMenuController'));

async function main() {
    const buttons = [];
    const calls = [];
    const rect = { left: 0, top: 0, right: 300, bottom: 500, width: 300, height: 500 };
    let bubbleRect = { left: 230, top: 440, bottom: 480, width: 50 };
    const anchor = { querySelector: () => ({ getBoundingClientRect: () => bubbleRect }), dataset: { qqMessage: 'm1' }, getBoundingClientRect: () => ({ left: 20, top: 440, bottom: 480, width: 260 }) };
    const layer = { offsetWidth: 300, offsetHeight: 500, getBoundingClientRect: () => rect };
    let menu;
    let result = { ok: true };
    const element = () => ({
        offsetWidth: 112, offsetHeight: 60, style: { setProperty(key, value) { this[key] = value; } }, handlers: {}, children: [], classList: { toggle() {} },
        querySelectorAll() { return this.children; },
        append(...children) { this.children.push(...children); },
        setAttribute() {},
        addEventListener(type, handler) { this.handlers[type] = handler; },
    });
    const dependencies = {
        openMessageEditor: (...args) => calls.push(['edit', ...args]),
        recallMessage: async (...args) => calls.push(['recall', ...args]),
        viewport: { querySelectorAll: () => [anchor] },
        createElement: () => (menu = element()),
        createButton: () => { const b = element(); buttons.push(b); return b; },
        createIcon: (name) => name,
        document: { createTextNode: (text) => text },
        facade: { intent: { async deleteMessages(input) { calls.push(input); return result; } } },
        overlay: layer,
        clearOverlay: () => calls.push('close'),
        loadMessages: async () => calls.push('load'),
        render: async () => calls.push('render'),
        report: (error) => calls.push(error.message),
        enterMessageSelection: (...args) => calls.push(args),
        showAnchoredMenu: () => ({ layer }),
    };
    const open = new Function(...Object.keys(dependencies), quick + '\nreturn openMessageQuickMenu;')(...Object.values(dependencies));
    open('c1', { messageId: 'm1' });
    assert.equal(menu.children.length, 2);
    assert.equal(menu.style.top, '372px', '靠近底部时菜单应向上避让');
    assert.equal(menu.style.left, '180px');
    assert.equal(menu.style['--yuzi-qq-message-menu-arrow-left'], '75px', '右侧避让后箭头仍指向气泡中点');
    buttons[1].handlers.click();
    assert.deepEqual(calls.pop(), ['c1', 'm1'], '多选选中长按目标');
    await buttons[0].handlers.click();
    assert.deepEqual(calls.splice(0), [{ conversationId: 'c1', messageIds: ['m1'] }, 'close', 'load', 'render']);
    result = { ok: false, error: { message: '失败' } };
    await buttons[0].handlers.click();
    assert.equal(buttons[0].disabled, false);
    assert.equal(buttons[1].disabled, false);
    assert.deepEqual(calls.splice(0), [{ conversationId: 'c1', messageIds: ['m1'] }, '失败']);

    bubbleRect = { left: 100, top: 100, bottom: 140, width: 50 };
    open('c1', { messageId: 'm1' });
    assert.equal(menu.style.top, '148px', '空间足够时紧贴气泡下方');
    assert.equal(menu.style.left, '69px', '以气泡而非消息整行为中心');
    assert.equal(menu.style['--yuzi-qq-message-menu-arrow-left'], '56px');
    bubbleRect = { left: 20, top: 100, bottom: 140, width: 30 };
    open('c1', { messageId: 'm1' });
    assert.equal(menu.style.left, '8px');
    assert.equal(menu.style['--yuzi-qq-message-menu-arrow-left'], '27px', '左侧避让后箭头仍对准');
    // Phone CSS scaling must not offset the arrow or menu.
    bubbleRect = { left: 200, top: 200, bottom: 280, width: 100 };
    layer.getBoundingClientRect = () => ({ ...rect, width: 600, height: 1000 });
    open('c1', { messageId: 'm1' });
    assert.equal(menu.style.top, '148px');
    assert.equal(menu.style.left, '69px');
    assert.equal(menu.style['--yuzi-qq-message-menu-arrow-left'], '56px');

    open('c1', { messageId: 'm1', senderType: 'self', type: 'text' });
    assert.equal(menu.children.length, 4, '任意用户消息都显示四个操作，不依赖最新消息查询');
    menu.children[2].handlers.click();
    assert.equal(calls.shift()[0], 'edit');
    await menu.children[3].handlers.click();
    assert.deepEqual(calls.shift(), ['recall', 'c1', 'm1']);
    open('c1', { messageId: 'm1', senderType: 'person', type: 'text' });
    assert.equal(menu.children.length, 3, 'NPC 消息只有编辑，没有撤回');
    open('c1', { messageId: 'm1', senderType: 'system', type: 'system' });
    assert.equal(menu.children.length, 2, '系统通知不允许编辑或撤回');

    const click = source.match(/deleteAction\.addEventListener\('click', \(event\) => \{([\s\S]*?)\n        \}\);/)[1];
    const runClick = new Function('confirmImageLibraryDeletion', 'syncSelection', `let imageLibrarySelectionMode = false; const click = (event) => { ${click} }; return click;`)(() => calls.push('delete'), () => calls.push('select'));
    const event = { stopPropagation() {} };
    runClick(event);
    assert.deepEqual(calls.splice(0), ['select'], '首次点击只进入选择态');
    runClick(event);
    assert.deepEqual(calls.splice(0), ['delete'], '再次点击复用删除确认');
    assert.match(source, /deleteAction\.disabled = imageLibrarySelectionMode && selectedImageAssetIds\.size \+ selectedStickerIds\.size === 0/);
    console.log('[qq-quick-actions-contract] passed');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
