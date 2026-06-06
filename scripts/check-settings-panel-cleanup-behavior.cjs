const path = require('path');
const { pathToFileURL } = require('url');
const assert = require('assert');

function createElement(id) {
    return {
        id,
        checked: true,
        removed: false,
        listeners: new Map(),
        addEventListener(type, handler) {
            const list = this.listeners.get(type) || [];
            list.push(handler);
            this.listeners.set(type, list);
        },
        removeEventListener(type, handler) {
            const list = this.listeners.get(type) || [];
            this.listeners.set(type, list.filter(item => item !== handler));
        },
        dispatch(type) {
            for (const handler of this.listeners.get(type) || []) handler({ type, target: this });
        },
        remove() {
            this.removed = true;
            elements.delete(this.id);
        },
    };
}

const elements = new Map();
for (const id of ['extensions_settings', 'yuzi-phone-settings', 'yuzi-phone-enabled', 'yuzi-phone-floating-toggle-enabled', 'yuzi-phone-reset-position']) {
    elements.set(id, createElement(id));
}

elements.get('extensions_settings').insertAdjacentHTML = () => {};

const jqueryHandlers = new Map();
function jqueryStub() {
    return {
        find() { return this; },
        off(eventName) { jqueryHandlers.delete(eventName); return this; },
        on(eventName, handler) { jqueryHandlers.set(eventName, handler); return this; },
        is() { return false; },
        slideUp() { return this; },
        slideDown() { return this; },
        removeClass() { return this; },
        addClass() { return this; },
    };
}

global.window = {
    dispatchEvent() {},
    setTimeout,
    clearTimeout,
    getContext: () => ({
        extensionSettings: { YuziPhone: { enabled: true, floatingToggleEnabled: true } },
        saveSettingsDebounced() {},
    }),
};
global.document = { getElementById: id => elements.get(id) || null };
global.CustomEvent = class CustomEvent { constructor(type) { this.type = type; } };
global.$ = jqueryStub;


async function main() {
    const modulePath = pathToFileURL(path.join(process.cwd(), 'modules/settings-panel.js')).href;
    const { createPhoneSettingsPanel, destroyPhoneSettingsPanel } = await import(`${modulePath}?cleanup=${Date.now()}`);
    const enabledCheckbox = elements.get('yuzi-phone-enabled');
    let callsA = 0;
    let callsB = 0;

    assert.strictEqual(createPhoneSettingsPanel(() => { callsA += 1; }), true);
    enabledCheckbox.dispatch('change');
    assert.strictEqual(callsA, 1, '首次绑定应触发 callbackA');

    assert.strictEqual(createPhoneSettingsPanel(() => { callsB += 1; }), true);
    enabledCheckbox.dispatch('change');
    assert.strictEqual(callsA, 1, '重绑后 callbackA 不应继续触发');
    assert.strictEqual(callsB, 1, '重绑后应只触发 callbackB');
    assert.ok(jqueryHandlers.has('click.yuziPhoneSettings'), 'drawer click 应使用命名空间事件绑定');

    destroyPhoneSettingsPanel();
    enabledCheckbox.dispatch('change');
    assert.strictEqual(callsB, 1, 'destroy 后旧 callback 不应触发');
    assert.strictEqual(elements.has('yuzi-phone-settings'), false, 'destroy 应移除 settings panel');
    assert.strictEqual(jqueryHandlers.has('click.yuziPhoneSettings'), false, 'destroy 应清理 drawer 命名空间事件');

    console.log('[settings-panel-cleanup-behavior-check] 检查通过');
}

main().catch((error) => {
    console.error('[settings-panel-cleanup-behavior-check] 检查失败：', error);
    process.exitCode = 1;
});
