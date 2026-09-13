const assert = require('node:assert/strict');

class Composer extends EventTarget {
    constructor(value = '') { super(); this.id = 'send_textarea'; this.value = value; this.selectionStart = this.selectionEnd = value.length; }
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
    setRangeText(text, start, end) { this.value = this.value.slice(0, start) + text + this.value.slice(end); }
}
function keyboard(document, type, props = {}) {
    const event = new Event(type, { cancelable: true });
    Object.defineProperty(event, 'target', { value: document.activeElement });
    Object.assign(event, { key: 'l', code: 'KeyL', ctrlKey: true, ...props });
    document.dispatchEvent(event);
    return event;
}
async function main() {
    const { createInputShortcutsRuntime } = await import('../modules/input-shortcuts/runtime.js');
    const document = new EventTarget();
    const composer = new Composer('你好世界');
    document.activeElement = composer;
    document.defaultView = new EventTarget();
    composer.setSelectionRange(2, 4);
    let inputs = 0;
    composer.addEventListener('input', () => inputs++);
    const runtime = createInputShortcutsRuntime({ document });
    runtime.configure({ enabled: true, rules: [{ id: 'greet', enabled: true, shortcut: { key: 'l', ctrl: true }, action: 'insert', text: '玉子' }] });
    assert.equal(keyboard(document, 'keydown').defaultPrevented, true);
    assert.equal(composer.value, '你好玉子');
    assert.deepEqual([composer.selectionStart, composer.selectionEnd, inputs], [4, 4, 1]);
    runtime.configure({ enabled: true, rules: [{ id: 'pair', enabled: true, shortcut: { key: 'l', ctrl: true }, action: 'wrap', left: '「', right: '」' }] });
    composer.value = '说你好呀'; composer.setSelectionRange(1, 3);
    keyboard(document, 'keydown');
    assert.equal(composer.value, '说「你好」呀');
    assert.deepEqual([composer.selectionStart, composer.selectionEnd], [2, 4]);
    keyboard(document, 'keyup');
    composer.value = ''; composer.setSelectionRange(0, 0);
    keyboard(document, 'keydown');
    assert.equal(composer.value, '「」');
    assert.deepEqual([composer.selectionStart, composer.selectionEnd], [1, 1]);
    assert.equal(keyboard(document, 'keydown', { repeat: true }).defaultPrevented, true, '长按不重复插入，也不穿透原动作');
    assert.equal(composer.value, '「」');
    keyboard(document, 'keyup');
    assert.equal(keyboard(document, 'keydown', { isComposing: true }).defaultPrevented, false);
    assert.equal(keyboard(document, 'keydown', { keyCode: 229 }).defaultPrevented, false);
    document.dispatchEvent(new Event('compositionstart'));
    keyboard(document, 'keydown');
    assert.equal(composer.value, '「」');
    document.dispatchEvent(new Event('compositionend'));
    composer.readOnly = true;
    assert.equal(keyboard(document, 'keydown').defaultPrevented, false);
    composer.readOnly = false;
    composer.disabled = true;
    assert.equal(keyboard(document, 'keydown').defaultPrevented, false);
    composer.disabled = false;
    document.activeElement = new Composer('other'); document.activeElement.id = 'other';
    assert.equal(keyboard(document, 'keydown').defaultPrevented, false);
    document.activeElement = composer;
    runtime.configure({ enabled: false, rules: [] });
    assert.equal(keyboard(document, 'keydown').defaultPrevented, false);
    runtime.configure({ enabled: true, rules: [{ id: 'single', enabled: true, shortcut: { key: 'enter' }, action: 'insert', text: '/cmd {{user}}\n' }] });
    composer.value = ''; composer.setSelectionRange(0, 0);
    keyboard(document, 'keydown', { key: 'Enter', code: 'Enter', ctrlKey: false });
    assert.equal(composer.value, '/cmd {{user}}\n');
    keyboard(document, 'keyup', { key: 'Enter', code: 'Enter', ctrlKey: false });
    runtime.configure({ enabled: true, rules: [] });
    runtime.configure({ enabled: true, rules: [] });
    runtime.dispose();
    assert.equal(keyboard(document, 'keydown').defaultPrevented, false);
    const { createInputShortcutsHost } = await import('../modules/integration/input-shortcuts.js');
    let settings = { enabled: true, inputShortcuts: { enabled: true, rules: [{ id: 'one', enabled: true, shortcut: { key: 'Control' }, action: 'insert', text: 'X' }] } };
    const subscribers = new Set();
    const host = createInputShortcutsHost({ document, getPhoneSettings: () => settings,
        subscribePhoneSettingsUpdates(listener) { subscribers.add(listener); return () => subscribers.delete(listener); } });
    composer.value = ''; composer.setSelectionRange(0, 0);
    host.start(); host.start();
    assert.equal(subscribers.size, 1);
    keyboard(document, 'keydown', { key: 'Control', code: 'ControlLeft', ctrlKey: true });
    assert.equal(composer.value, 'X', '允许独立修饰键，重复启动不会重复插入');
    keyboard(document, 'keyup', { key: 'Control', code: 'ControlLeft' });
    settings.inputShortcuts.enabled = false; subscribers.forEach(listener => listener({ key: 'inputShortcuts' }));
    keyboard(document, 'keydown', { key: 'Control', code: 'ControlLeft' });
    assert.equal(composer.value, 'X');
    settings.inputShortcuts.enabled = true; settings.enabled = false;
    subscribers.forEach(listener => listener({ key: 'enabled' }));
    keyboard(document, 'keydown', { key: 'Control', code: 'ControlLeft' });
    assert.equal(composer.value, 'X');
    settings.enabled = true; subscribers.forEach(listener => listener({ key: 'enabled' }));
    keyboard(document, 'keydown', { key: 'Control', code: 'ControlLeft' });
    assert.equal(composer.value, 'XX');
    host.stop(); host.stop();
    assert.equal(subscribers.size, 0);
    keyboard(document, 'keyup', { key: 'Control', code: 'ControlLeft' });
    keyboard(document, 'keydown', { key: 'Control', code: 'ControlLeft' });
    assert.equal(composer.value, 'XX');
    host.start();
    keyboard(document, 'keydown', { key: 'Control', code: 'ControlLeft' });
    assert.equal(composer.value, 'XXX');
    host.stop();
    console.log('[通过] 输入快捷键：选区替换并通知酒馆输入变化');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
