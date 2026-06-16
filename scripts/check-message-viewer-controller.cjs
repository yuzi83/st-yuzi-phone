const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = process.cwd();

class FakeClassList {
    constructor(owner) {
        this.owner = owner;
        this.classes = new Set();
    }

    add(...classes) {
        for (const name of classes) this.classes.add(String(name));
    }

    contains(name) {
        return this.classes.has(String(name));
    }
}

class FakeElement {
    constructor(classNames = '') {
        this.dataset = {};
        this.children = [];
        this.parentElement = null;
        this.listeners = new Map();
        this.classList = new FakeClassList(this);
        this.disabled = false;
        this.value = '';
        this.attributes = new Map();
        for (const name of String(classNames || '').split(/\s+/).filter(Boolean)) this.classList.add(name);
    }

    appendChild(child) {
        child.parentElement = this;
        this.children.push(child);
        return child;
    }

    contains(target) {
        for (let node = target; node; node = node.parentElement) {
            if (node === this) return true;
        }
        return false;
    }

    addEventListener(type, listener) {
        const list = this.listeners.get(type) || [];
        list.push(listener);
        this.listeners.set(type, list);
    }

    removeEventListener(type, listener) {
        const list = this.listeners.get(type) || [];
        this.listeners.set(type, list.filter(item => item !== listener));
    }

    getAttribute(name) {
        return this.attributes.get(name) || '';
    }


    setAttribute(name, value) {
        this.attributes.set(name, String(value));
        if (name === 'aria-disabled') this.ariaDisabled = String(value);
    }

    closest(selector) {
        for (let node = this; node; node = node.parentElement) {
            if (selector === '[data-action]' && node.dataset && node.dataset.action) return node;
            if (selector.startsWith('.') && node.classList.contains(selector.slice(1))) return node;
        }
        return null;
    }

    querySelector() {
        return null;
    }
}

class FakeTextAreaElement extends FakeElement {}
class FakeButtonElement extends FakeElement {}

function installDomGlobals() {
    global.Element = FakeElement;
    global.HTMLElement = FakeElement;
    global.HTMLTextAreaElement = FakeTextAreaElement;
    global.HTMLButtonElement = FakeButtonElement;
}

function toModuleUrl(relativePath) {
    return pathToFileURL(path.join(ROOT, relativePath)).href;
}

function createEvent(type, target, props = {}) {
    return {
        type,
        target,
        timeStamp: props.timeStamp ?? Date.now(),
        pointerType: props.pointerType || 'mouse',
        key: props.key || '',
        shiftKey: !!props.shiftKey,
        isComposing: !!props.isComposing,
        defaultPrevented: false,
        propagationStopped: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() { this.propagationStopped = true; },
        ...props,
    };
}

function dispatch(container, type, target, props = {}) {
    const event = createEvent(type, target, props);
    for (const listener of container.listeners.get(type) || []) {
        listener(event);
    }
    return event;
}


function createHarness(bindMessageDetailController) {
    const container = new FakeElement('container');
    const calls = { render: 0, renderKeepScroll: 0, send: 0 };
    const state = {
        mode: 'detail',
        conversationId: 'conv_a',
        mediaPreview: null,
        draftByConversation: { conv_a: '原草稿' },
        composeMediaByConversation: {
            conv_a: { imageDesc: '旧图片', videoDesc: '旧视频' },
            conv_b: { imageDesc: '其他会话图片' },
        },
        attachmentDialog: { visible: false, conversationId: null, kind: null, draftValue: '' },
        sending: false,
        errorText: '',
    };
    bindMessageDetailController({
        container,
        state,
        conversationId: 'conv_a',
        detailTitle: '测试会话',
        tableName: '测试表',
        render: () => { calls.render += 1; },
        renderKeepScroll: () => { calls.renderKeepScroll += 1; },
        normalizeMediaDesc: (value) => String(value || '').trim(),
        handleSendMessage: () => { calls.send += 1; },
        closeMediaPreview: () => {
            state.mediaPreview = null;
            calls.renderKeepScroll += 1;
        },
    });
    return { container, calls, state };
}

function actionElement(action, options = {}) {
    const el = options.button ? new FakeButtonElement(options.className || '') : new FakeElement(options.className || '');
    el.dataset.action = action;
    if (options.conversationId) el.dataset.conversationId = options.conversationId;
    if (options.mediaKind) el.dataset.mediaKind = options.mediaKind;
    if (options.description) el.dataset.description = options.description;
    if (options.mediaLabel) el.dataset.mediaLabel = options.mediaLabel;
    if (options.disabled) el.disabled = true;
    if (options.ariaDisabled) el.setAttribute('aria-disabled', 'true');
    return el;
}

function attachmentInput(conversationId, kind, value) {
    const input = new FakeTextAreaElement('phone-special-message-attachment-textarea');
    input.dataset.conversationId = conversationId;
    input.dataset.mediaKind = kind;
    input.value = value;
    return input;
}

function composeInput(value) {
    const input = new FakeTextAreaElement('phone-special-message-compose-input');
    input.value = value;
    return input;
}


function testDisabledActionsAreIgnored(bindMessageDetailController) {
    const harness = createHarness(bindMessageDetailController);
    const disabledButton = actionElement('send-message', { button: true, disabled: true });
    harness.container.appendChild(disabledButton);
    dispatch(harness.container, 'pointerup', disabledButton, { timeStamp: 10 });
    dispatch(harness.container, 'click', disabledButton, { timeStamp: 20 });
    assert.equal(harness.calls.send, 0, 'disabled button action 不应触发发送');

    const ariaDisabled = actionElement('send-message', { ariaDisabled: true });
    harness.container.appendChild(ariaDisabled);
    dispatch(harness.container, 'click', ariaDisabled, { timeStamp: 1000 });
    assert.equal(harness.calls.send, 0, 'aria-disabled action 不应触发发送');

    const normalAction = actionElement('send-message');
    harness.container.appendChild(normalAction);
    dispatch(harness.container, 'click', normalAction, { timeStamp: 2000 });
    assert.equal(harness.calls.send, 1, '普通非 button action 不应被 disabled 保险误拦截');
}

function testAttachmentInputDoesNotTouchDraftOrSend(bindMessageDetailController) {
    const harness = createHarness(bindMessageDetailController);
    harness.state.attachmentDialog = { visible: true, conversationId: 'conv_a', kind: 'image', draftValue: '旧值' };
    const input = attachmentInput('conv_a', 'image', ' 新图片描述 ');
    harness.container.appendChild(input);

    dispatch(harness.container, 'input', input);
    assert.equal(harness.state.attachmentDialog.draftValue, ' 新图片描述 ');
    assert.equal(harness.state.draftByConversation.conv_a, '原草稿', '附件 textarea input 不得污染 draftByConversation');

    dispatch(harness.container, 'keydown', input, { key: 'Enter' });
    assert.equal(harness.calls.send, 0, '附件 textarea Enter 不得触发发送');
}

function testComposeInputStillUpdatesDraftAndSends(bindMessageDetailController) {
    const harness = createHarness(bindMessageDetailController);
    const input = composeInput('新草稿');
    harness.container.appendChild(input);

    dispatch(harness.container, 'input', input);
    assert.equal(harness.state.draftByConversation.conv_a, '新草稿');
    dispatch(harness.container, 'keydown', input, { key: 'Enter' });
    assert.equal(harness.calls.send, 1, 'compose textarea Enter 应继续触发发送');
}


function testOpenSaveClearAndCloseAttachmentDialog(bindMessageDetailController) {
    const harness = createHarness(bindMessageDetailController);

    const openImage = actionElement('open-attachment-dialog', { conversationId: 'conv_a', mediaKind: 'image' });
    harness.container.appendChild(openImage);
    dispatch(harness.container, 'click', openImage, { timeStamp: 3000 });
    assert.equal(harness.state.attachmentDialog.visible, true);
    assert.equal(harness.state.attachmentDialog.conversationId, 'conv_a');
    assert.equal(harness.state.attachmentDialog.kind, 'image');
    assert.equal(harness.state.attachmentDialog.draftValue, '旧图片');

    const wrongSave = actionElement('save-compose-media', { conversationId: 'conv_b', mediaKind: 'image' });
    harness.container.appendChild(wrongSave);
    harness.state.attachmentDialog.draftValue = '不应写入';
    dispatch(harness.container, 'click', wrongSave, { timeStamp: 4000 });
    assert.equal(harness.state.composeMediaByConversation.conv_a.imageDesc, '旧图片');
    assert.equal(harness.state.attachmentDialog.visible, true, 'conversationId 不匹配的保存不得关闭弹窗');

    const saveImage = actionElement('save-compose-media', { conversationId: 'conv_a', mediaKind: 'image' });
    harness.container.appendChild(saveImage);
    harness.state.attachmentDialog.draftValue = ' 新图片 ';
    dispatch(harness.container, 'click', saveImage, { timeStamp: 5000 });
    assert.equal(harness.state.composeMediaByConversation.conv_a.imageDesc, '新图片');
    assert.equal(harness.state.composeMediaByConversation.conv_a.videoDesc, '旧视频');
    assert.equal(harness.state.attachmentDialog.visible, false);

    const clearVideo = actionElement('clear-compose-media', { conversationId: 'conv_a', mediaKind: 'video' });
    harness.container.appendChild(clearVideo);
    dispatch(harness.container, 'click', clearVideo, { timeStamp: 6000 });
    assert.deepEqual(harness.state.composeMediaByConversation.conv_a, { imageDesc: '新图片' }, 'clear 只应清当前会话当前 kind');
    assert.deepEqual(harness.state.composeMediaByConversation.conv_b, { imageDesc: '其他会话图片' });

    harness.state.attachmentDialog = { visible: true, conversationId: 'conv_a', kind: 'image', draftValue: '待关闭' };
    const wrongClose = actionElement('close-attachment-dialog', { conversationId: 'conv_b' });
    harness.container.appendChild(wrongClose);
    dispatch(harness.container, 'click', wrongClose, { timeStamp: 7000 });
    assert.equal(harness.state.attachmentDialog.visible, true, 'conversationId 不匹配的 close 不应关闭弹窗');

    const close = actionElement('close-attachment-dialog', { conversationId: 'conv_a' });
    harness.container.appendChild(close);
    dispatch(harness.container, 'click', close, { timeStamp: 8000 });
    assert.equal(harness.state.attachmentDialog.visible, false);
}

function testMaskClickOnlyClosesOnMaskItself(bindMessageDetailController) {
    const harness = createHarness(bindMessageDetailController);
    const mask = new FakeElement('phone-special-attachment-dialog-mask');
    mask.dataset.conversationId = 'conv_a';
    const dialog = new FakeElement('phone-special-attachment-dialog');
    mask.appendChild(dialog);
    harness.container.appendChild(mask);

    harness.state.attachmentDialog = { visible: true, conversationId: 'conv_a', kind: 'image', draftValue: '保留' };
    dispatch(harness.container, 'click', dialog, { timeStamp: 9000 });
    assert.equal(harness.state.attachmentDialog.visible, true, '点击弹窗内部不得关闭');

    dispatch(harness.container, 'click', mask, { timeStamp: 10000 });
    assert.equal(harness.state.attachmentDialog.visible, false, '点击遮罩本体应关闭');
}

function testFreshAttachmentMaskClickDoesNotClose(bindMessageDetailController) {
    const harness = createHarness(bindMessageDetailController);
    const openImage = actionElement('open-attachment-dialog', { conversationId: 'conv_a', mediaKind: 'image' });
    harness.container.appendChild(openImage);

    dispatch(harness.container, 'pointerup', openImage, { timeStamp: 11000, pointerType: 'touch' });
    assert.equal(harness.state.attachmentDialog.visible, true, 'pointerup 应打开附件弹窗');

    const mask = new FakeElement('phone-special-attachment-dialog-mask');
    mask.dataset.conversationId = 'conv_a';
    harness.container.appendChild(mask);

    dispatch(harness.container, 'click', mask, { timeStamp: 11100 });
    assert.equal(harness.state.attachmentDialog.visible, true, '刚打开后的合成 click 不应立即关闭附件弹窗');

    dispatch(harness.container, 'click', mask, { timeStamp: 11600 });
    assert.equal(harness.state.attachmentDialog.visible, false, '保护窗后点击遮罩应关闭附件弹窗');
}

function testFreshMediaPreviewMaskClickDoesNotClose(bindMessageDetailController) {
    const harness = createHarness(bindMessageDetailController);
    const openMedia = actionElement('open-media-preview', {
        description: '一张图片',
        mediaLabel: '图片内容',
    });
    harness.container.appendChild(openMedia);

    dispatch(harness.container, 'pointerup', openMedia, { timeStamp: 12000, pointerType: 'touch' });
    assert.deepEqual(harness.state.mediaPreview, { title: '图片内容', content: '一张图片' }, 'pointerup 应打开媒体预览');

    const mask = new FakeElement('phone-special-media-preview-mask');
    harness.container.appendChild(mask);

    dispatch(harness.container, 'click', mask, { timeStamp: 12100 });
    assert.deepEqual(harness.state.mediaPreview, { title: '图片内容', content: '一张图片' }, '刚打开后的合成 click 不应立即关闭媒体预览');

    dispatch(harness.container, 'click', mask, { timeStamp: 12600 });
    assert.equal(harness.state.mediaPreview, null, '保护窗后点击遮罩应关闭媒体预览');
}

async function main() {
    installDomGlobals();
    const { bindMessageDetailController } = await import(toModuleUrl('modules/table-viewer/special/message-viewer/detail-controller.js'));

    testDisabledActionsAreIgnored(bindMessageDetailController);
    testAttachmentInputDoesNotTouchDraftOrSend(bindMessageDetailController);
    testComposeInputStillUpdatesDraftAndSends(bindMessageDetailController);
    testOpenSaveClearAndCloseAttachmentDialog(bindMessageDetailController);
    testMaskClickOnlyClosesOnMaskItself(bindMessageDetailController);
    testFreshAttachmentMaskClickDoesNotClose(bindMessageDetailController);
    testFreshMediaPreviewMaskClickDoesNotClose(bindMessageDetailController);

    console.log('[message-viewer-controller-check] 检查通过');
    console.log('- OK | disabled 与 aria-disabled action 被委托层拦截');
    console.log('- OK | 附件 textarea input 不污染草稿且 Enter 不触发发送');
    console.log('- OK | compose textarea 仍更新草稿且 Enter 发送');
    console.log('- OK | 附件 open/save/clear/close 校验 conversationId 与 media kind');
    console.log('- OK | 附件弹窗仅遮罩本体点击关闭');
    console.log('- OK | 附件弹窗刚打开后的合成遮罩 click 被保护');
    console.log('- OK | 媒体预览刚打开后的合成遮罩 click 被保护');
}

main().catch((error) => {
    console.error('[message-viewer-controller-check] 检查失败：');
    console.error(error);
    process.exitCode = 1;
});
