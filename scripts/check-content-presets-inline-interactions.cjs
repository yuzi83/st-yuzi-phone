const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');

async function load(relativePath) {
    return import(`${pathToFileURL(path.join(root, relativePath)).href}?t=${Date.now()}`);
}

function createComposer(value = '') {
    return {
        value,
        focused: 0,
        selectionStart: 0,
        selectionEnd: 0,
        events: [],
        sent: 0,
        focus() { this.focused += 1; },
        send() { this.sent += 1; },
        dispatchEvent(event) { this.events.push(event.type); return true; },
    };
}

function createDocument(composer) {
    return {
        querySelector(selector) {
            assert.equal(selector, '#send_textarea', '默认定位必须指向酒馆当前输入框');
            return composer;
        },
    };
}

function createEvent(type, init) {
    return { type, ...init };
}

async function testLocalExpandAndTab(factory) {
    const states = [];
    const interactions = factory({
        document: createDocument(createComposer()),
        createEvent,
        initialState: { expanded: false, activeTab: 'overview' },
        onStateChange(state) { states.push(state); },
    });

    assert.deepEqual(interactions.getState(), { expanded: false, activeTab: 'overview' }, '应暴露独立的初始本地状态');
    assert.deepEqual(interactions.expand(), { expanded: true, activeTab: 'overview' }, 'expand() 应仅切换本地展开状态');
    assert.deepEqual(interactions.tab('details'), { expanded: true, activeTab: 'details' }, 'tab() 应仅切换本地标签状态');
    assert.deepEqual(states, [
        { expanded: true, activeTab: 'overview' },
        { expanded: true, activeTab: 'details' },
    ], '本地动作应通过状态 seam 通知作者视图');
}

async function testAppendPreservesDraftFocusesAndNotifies(factory) {
    const composer = createComposer('已有草稿');
    const interactions = factory({ document: createDocument(composer), createEvent });

    const result = interactions.appendToComposer('，追加内容');
    assert.deepEqual(result, { ok: true, value: '已有草稿，追加内容' }, '追加成功应返回最终草稿，不触发发送');
    assert.equal(composer.value, '已有草稿，追加内容', '必须保留已有草稿并追加新文本');
    assert.equal(composer.selectionStart, composer.value.length, '光标起点必须移到草稿末尾');
    assert.equal(composer.selectionEnd, composer.value.length, '光标终点必须移到草稿末尾');
    assert.equal(composer.focused, 1, '追加后必须聚焦酒馆输入框');
    assert.deepEqual(composer.events, ['input', 'change'], '追加后必须派发 input 和 change 事件');
    assert.equal(composer.sent, 0, '交互模块绝不应发送消息');
}

async function testAppendFailsClearlyWithoutComposer(factory) {
    const interactions = factory({
        document: { querySelector() { return null; } },
        createEvent,
    });

    assert.deepEqual(
        interactions.appendToComposer('不会发送'),
        { ok: false, reason: 'composer-not-found' },
        '找不到酒馆输入框时必须明确失败，且不能做其他操作',
    );
}

async function main() {
    const { createContentPresetInlineInteractions } = await load('modules/content-presets/inline-interactions.js');
    assert.equal(typeof createContentPresetInlineInteractions, 'function', '必须暴露正文展示本地交互公开工厂');
    await testLocalExpandAndTab(createContentPresetInlineInteractions);
    await testAppendPreservesDraftFocusesAndNotifies(createContentPresetInlineInteractions);
    await testAppendFailsClearlyWithoutComposer(createContentPresetInlineInteractions);
    console.log('[content-presets-inline-interactions-check] 检查通过');
}

main().catch(error => {
    console.error('[content-presets-inline-interactions-check] 检查失败');
    console.error(error);
    process.exitCode = 1;
});