import { showToast } from '../../modules/settings-app/ui/toast.js';
import { createInputShortcutsPage } from '../../modules/settings-app/pages/input-shortcuts.js';
import { createInputShortcutsSettingsService } from '../../modules/input-shortcuts/settings-service.js';
import { createInputShortcutsRuntime } from '../../modules/input-shortcuts/runtime.js';
import { createRuntimeScope } from '../../modules/runtime-manager.js';

function assert(value, message) { if (!value) throw new Error(message); }
function fire(element, type, data = {}) {
    const event = type.startsWith('key') ? new KeyboardEvent(type, { bubbles: true, cancelable: true, ...data }) : new Event(type, { bubbles: true });
    element.dispatchEvent(event);
    return event;
}
async function test() {
    const container = document.querySelector('#test-phone');
    const composer = document.querySelector('#send_textarea');
    let settings = { inputShortcuts: { enabled: true, rules: Array.from({ length: 8 }, (_, i) => ({
        id: `rule-${i}`, enabled: true, shortcut: { key: `F${i + 1}` }, action: 'insert', text: `文本${i}`, left: '', right: '',
    })) } };
    let failSave = false;
    const runtime = createInputShortcutsRuntime({ document });
    const service = createInputShortcutsSettingsService({ getPhoneSettings: () => settings,
        savePhoneSetting(key, value) { if (failSave) return false; settings[key] = structuredClone(value); runtime.configure(value); return true; } });
    runtime.configure(service.readConfig());
    const scope = createRuntimeScope('input-shortcuts-browser-test');
    const state = { mode: 'input_shortcuts', inputShortcutsScrollTop: 0 };
    const page = createInputShortcutsPage({ container, state, pageRuntime: scope, inputShortcutsSettingsService: service,
        showToast, render() {} });
    page.mount();
    const settle = () => new Promise(resolve => setTimeout(resolve, 80));
    await settle();
    const body = () => container.querySelector('.phone-settings-scroll');
    const rule = id => Array.from(container.querySelectorAll('[data-rule-id]')).find(item => item.dataset.ruleId === id);
    const click = (id, action) => rule(id).querySelector(`[data-action="${action}"]`).click();
    const change = (id, field, value) => { const input = rule(id).querySelector(`[data-field="${field}"]`); input.value = value; fire(input, field === 'action' ? 'change' : 'input'); };
    body().scrollTop = 250;
    const randomUUID = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    container.querySelector('[data-action="add"]').click();
    Object.defineProperty(crypto, 'randomUUID', { value: randomUUID, configurable: true });
    assert(container.querySelectorAll('[data-rule-id]').length === 9, '新增规则没有显示');
    await settle();
    assert(body().scrollTop === 250, '新增规则导致回到顶部');
    const id = container.querySelector('[data-rule-id]:last-child').dataset.ruleId;
    assert(service.readConfig().rules.length === 8, '新增草稿提前生效');
    const beforeRecording = composer.value;
    click(id, 'record');
    let record = rule(id).querySelector('[data-action="record"]');
    assert(document.activeElement === record, '录制按钮未获得焦点');
    fire(record, 'keydown', { key: 'Control', code: 'ControlLeft', ctrlKey: true });
    fire(record, 'keydown', { key: 'l', code: 'KeyL', ctrlKey: true });
    fire(record, 'keyup', { key: 'l', code: 'KeyL', ctrlKey: true });
    fire(record, 'keyup', { key: 'Control', code: 'ControlLeft' });
    assert(composer.value === beforeRecording, '录制期间写入了酒馆');
    assert(rule(id).textContent.includes('Ctrl + L'), '没有录制完整组合键');
    assert(body().scrollTop === 250, '录制按键改变了滚动位置');
    change(id, 'action', 'wrap');
    await settle();
    assert(body().scrollTop === 250, '切换动作导致回顶');
    for (const width of [280, 390]) {
        container.style.width = `${width}px`;
        assert(body().scrollWidth <= body().clientWidth + 1, `${width}px 下规则表单横向溢出`);
    }
    change(id, 'left', '「'); change(id, 'right', '」');
    click(id, 'save');
    assert(service.readConfig().rules.length === 9, '保存后规则未生效');
    await settle();
    assert(body().scrollTop === 250, '保存导致回顶');
    failSave = true;
    const failedSwitch = container.querySelector('[data-field="enabled"]'); failedSwitch.checked = false; fire(failedSwitch, 'change');
    assert(container.querySelector('[data-field="enabled"]').checked, '开关保存失败时未恢复实际状态');
    assert(container.querySelector('.phone-toast-error')?.textContent.includes('失败'), '开关保存失败反馈被重绘吞掉');
    failSave = false;
    composer.value = '你好'; composer.setSelectionRange(0, 2); composer.focus();
    assert(fire(composer, 'keydown', { key: 'l', code: 'KeyL', ctrlKey: true }).defaultPrevented, '命中未阻止原动作');
    fire(composer, 'keyup', { key: 'l', code: 'KeyL', ctrlKey: true });
    assert(composer.value === '「你好」' && composer.selectionStart === 1 && composer.selectionEnd === 3, '成对包裹或选区错误');
    change(id, 'left', '【');
    const toggle = rule(id).querySelector('[data-field="rule-enabled"]'); toggle.checked = false; fire(toggle, 'change');
    assert(service.readConfig().rules.find(item => item.id === id).left === '「', '启停把未保存内容带入配置');
    assert(rule(id).querySelector('[data-field="left"]').value === '【', '启停丢失编辑草稿');
    assert(service.readConfig().rules.find(item => item.id === id).enabled === false, '单条停用未保存');
    failSave = true; click(id, 'save');
    assert(service.readConfig().rules.find(item => item.id === id).left === '「', '失败保存覆盖旧配置');
    assert(rule(id).querySelector('[data-field="left"]').value === '【' && container.querySelector('.phone-toast-error')?.textContent.includes('失败'), '失败时没有保留草稿或反馈');
    failSave = false;
    click(id, 'delete');
    assert(service.readConfig().rules.length === 8 && container.querySelectorAll('[data-rule-id]').length === 8, '删除未生效');
    await settle();
    assert(body().scrollTop === 250, '删除导致回顶');
    const colors = [];
    for (const mode of ['light', 'dark']) {
        document.documentElement.setAttribute('data-yuzi-phone-theme', mode);
        colors.push(getComputedStyle(container.querySelector('textarea')).color);
        for (const input of container.querySelectorAll('textarea, select, option')) {
            const style = getComputedStyle(input);
            assert(style.color !== style.backgroundColor, `${mode} 模式控件前景背景相同`);
            assert(style.color !== 'rgb(0, 0, 0)' || style.backgroundColor !== 'rgb(0, 0, 0)', '酒馆黑底黑字泄漏');
        }
    }
    assert(colors[0] !== colors[1], '实际没有切换小手机深浅色主题');
    const topSwitch = container.querySelector('[data-field="enabled"]'); topSwitch.checked = false; fire(topSwitch, 'change');
    composer.value = ''; composer.focus(); fire(composer, 'keydown', { key: 'F1', code: 'F1' });
    assert(composer.value === '' && !service.readConfig().enabled, '总开关关闭后仍然生效');
    click('rule-0', 'record');
    page.dispose(); scope.dispose(); runtime.dispose();
    assert(!container.querySelector('[aria-pressed="true"]'), '离开页面后录制态未释放');
    return '新增、录制、草稿隔离、包裹、启停、保存失败保留、删除、滚动、主题与清理均通过';
}
test().then(message => { document.querySelector('#result').textContent = `PASS: ${message}`; })
    .catch(error => { document.querySelector('#result').textContent = `FAIL: ${error.stack}`; });
