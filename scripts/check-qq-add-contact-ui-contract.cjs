const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

const { FakeElement, installFakeDom, flushUi, findButton, privateConversation, createFakeFacade } = require('./helpers/qq-ui-fixture.cjs');

async function mountFixture(createQQApp, options) {
    const document = installFakeDom();
    const root = document.createElement('div');
    root._rootConnected = true;
    const { facade, calls } = createFakeFacade(options);
    const app = createQQApp({ facade });
    app.mount(root);
    await flushUi();
    return {
        root,
        viewport: root.querySelector('.yuzi-qq-viewport'),
        document,
        app,
        calls,
    };
}

async function openContactNameDialog(fixture) {
    const addContact = fixture.root.querySelector('[data-qq-add-contact]');
    assert.ok(addContact, '消息根页必须提供添加联系人的加号入口');
    await fixture.viewport.dispatch('click', { target: addContact });
    await flushUi();

    const anchoredLayer = fixture.root.querySelector('.yuzi-qq-anchored-menu-layer');
    const anchoredMenu = fixture.root.querySelector('.yuzi-qq-message-add-menu');
    assert.ok(anchoredLayer, '加号菜单必须挂载到专用锚定层');
    assert.equal(anchoredMenu?.closest('.yuzi-qq-anchored-menu-layer'), anchoredLayer,
        '加号菜单必须由锚定层直接管理位置');
    assert.equal(anchoredMenu?.closest('.yuzi-qq-overlay'), null,
        '加号菜单不得回退到通用居中遮罩');
    assert.equal(anchoredMenu?.closest('.yuzi-qq-dialog'), null,
        '加号菜单不得套用通用居中对话框外壳');

    const menuActions = fixture.root.querySelectorAll('.yuzi-qq-dialog-menu-item');
    const menuLabels = menuActions.map((item) => item.querySelector('.yuzi-qq-message-add-menu-label')?.textContent);
    assert.deepEqual(menuLabels, ['\u521b\u5efa\u7fa4\u804a', '\u521b\u5efa\u9891\u9053', '\u52a0\u597d\u53cb/\u7fa4'], 'Figma \u52a0\u53f7\u83dc\u5355\u4fdd\u7559\u4e09\u884c\u89c6\u89c9\u7ed3\u6784');
    assert.ok(fixture.root.querySelector('[data-qq-create-group]'), '\u521b\u5efa\u7fa4\u804a\u5fc5\u987b\u8fdb\u5165\u771f\u5b9e\u5efa\u7fa4\u6d41\u7a0b');
    assert.equal(menuActions[1].getAttribute('aria-hidden'), 'true', '\u521b\u5efa\u9891\u9053\u53ea\u4f5c\u89c6\u89c9\u5c55\u793a');
    const menuAction = fixture.root.querySelector('[data-qq-add-contact-menu]');
    assert.ok(menuAction, '\u52a0\u597d\u53cb/\u7fa4\u5217\u7ee7\u7eed\u8fdb\u5165\u6dfb\u52a0\u8054\u7cfb\u4eba\u6d41\u7a0b');
    await menuAction.click();
    const input = fixture.root.querySelector('input');
    const confirm = findButton(fixture.root, '创建联系人');
    assert.ok(input, '添加联系人菜单必须打开姓名输入框');
    assert.ok(confirm, '姓名输入框必须提供创建确认');
    assert.equal(fixture.document.activeElement, input, '姓名输入框必须自动获得焦点');
    assert.equal(confirm.disabled, true, '空姓名必须禁用确认');
    return { input, confirm };
}

async function submitNameWithEnter(fixture, input, name) {
    input.value = name;
    await input.dispatch('input', { target: input });
    const confirm = findButton(fixture.root, '创建联系人');
    assert.equal(confirm.disabled, false, '规范化后的非空姓名必须允许确认');
    await input.dispatch('keydown', { target: input, key: 'Enter', shiftKey: false });
    await flushUi();
}

async function testSuccessfulAddContactResult(createQQApp, outcome) {
    const fixture = await mountFixture(createQQApp, { outcome });
    try {
        const { input } = await openContactNameDialog(fixture);
        await submitNameWithEnter(fixture, input, outcome.submittedName);

        assert.deepEqual(
            fixture.calls.createPrivateConversation,
            [{ name: outcome.submittedName }],
            outcome.label + ' must submit the literal input text once',
        );
        assert.equal(fixture.calls.aiRequests, 0, outcome.label + ' must not create messages or trigger AI');
        assert.equal(fixture.root.querySelector('.yuzi-qq-overlay'), null, outcome.label + ' must close both add-contact layers');

        if (outcome.created === true) {
            assert.ok(fixture.root.querySelector('[data-qq-message-root]'), outcome.label + ' must return to the message root');
            const avatar = fixture.root.querySelector('.yuzi-qq-avatar');
            assert.equal(avatar?.textContent, Array.from(outcome.name)[0], outcome.label + ' must render the no-avatar initial');
        } else {
            assert.ok(fixture.root.querySelector('.yuzi-qq-profile-view'), outcome.label + ' must open the existing contact profile');
            assert.equal(fixture.root.querySelector('[data-qq-message-root]'), null, outcome.label + ' must not return to the message root');
        }
    } finally {
        fixture.app.destroy();
    }
}

async function testAllWhitespaceNameStaysDisabled(createQQApp) {
    const fixture = await mountFixture(createQQApp, {
        outcome: { name: 'unused', conversationId: 'unused', created: true, restored: false },
    });
    try {
        const { input, confirm } = await openContactNameDialog(fixture);
        input.value = ' \t\n';
        await input.dispatch('input', { target: input });
        assert.equal(confirm.disabled, true, 'all-whitespace input must keep creation disabled');
        await input.dispatch('keydown', { target: input, key: 'Enter', shiftKey: false });
        await flushUi();
        assert.deepEqual(fixture.calls.createPrivateConversation, [], 'all-whitespace input must not call the creation intent');
    } finally {
        fixture.app.destroy();
    }
}

async function testFailedAddPreservesDraft(createQQApp) {
    const fixture = await mountFixture(createQQApp, {
        outcome: { ok: false, name: 'unused', conversationId: 'unused' },
        errorMessage: 'Contact creation failed',
    });
    try {
        const { input, confirm } = await openContactNameDialog(fixture);
        const rawDraft = '  Failed Contact  ';
        input.value = rawDraft;
        await input.dispatch('input', { target: input });
        await confirm.click();
        await flushUi();

        assert.deepEqual(fixture.calls.createPrivateConversation, [{ name: rawDraft }], 'failure must still submit the literal input text');
        assert.equal(fixture.calls.aiRequests, 0, 'failure must not trigger AI');
        assert.ok(fixture.root.querySelector('.yuzi-qq-overlay'), 'failure must keep the dialog open');
        assert.equal(input.isConnected, true, 'failure must keep the original input mounted');
        assert.equal(input.value, rawDraft, 'failure must preserve the unsubmitted input text');
        assert.equal(fixture.root.querySelector('.yuzi-qq-form-error')?.textContent, 'Contact creation failed', 'failure must present the Facade error beside the input');
    } finally {
        fixture.app.destroy();
    }
}

async function testCreateGroupUsesTwoExistingFriends(createQQApp) {
    const alice = privateConversation('Alice', 'alice');
    const bob = privateConversation('Bob', 'bob');
    const fixture = await mountFixture(createQQApp, {
        initialConversations: [alice, bob],
        outcome: { name: 'unused', conversationId: 'unused', created: true, restored: false },
    });
    try {
        const addContact = fixture.root.querySelector('[data-qq-add-contact]');
        await fixture.viewport.dispatch('click', { target: addContact });
        await flushUi();
        await fixture.root.querySelector('[data-qq-create-group]').click();
        await flushUi();

        const name = fixture.root.querySelector('.yuzi-qq-create-group-name');
        const picker = fixture.root.querySelector('.yuzi-qq-group-picker-list');
        const choices = fixture.root.querySelectorAll('[data-qq-group-member-choice]');
        const confirm = findButton(fixture.root, '创建群聊');
        assert.ok(name && picker && confirm, '创建群聊必须打开群名和好友选择表单');
        assert.equal(choices.length, 2, '建群候选只能来自当前已有私聊好友');

        name.value = '周末群';
        choices.forEach((choice) => { choice.checked = true; });
        await name.dispatch('input', { target: name });
        await picker.dispatch('change', { target: choices[0] });
        assert.equal(confirm.disabled, false, '群名和两名好友齐全后允许创建');
        await confirm.click();
        await flushUi();

        assert.deepEqual(fixture.calls.createGroupConversation, [{
            name: '周末群',
            memberIds: [alice.personId, bob.personId],
        }]);
        assert.ok(fixture.root.querySelector('.yuzi-qq-group-chat-view'),
            '创建成功后必须直接进入新群聊天页');
        assert.equal(fixture.calls.aiRequests, 0, '用户手动建群本身不能触发 AI');
    } finally {
        fixture.app.destroy();
    }
}

async function main() {
    const originalGlobals = {
        document: global.document,
        window: global.window,
        HTMLElement: global.HTMLElement,
        Element: global.Element,
        HTMLFormElement: global.HTMLFormElement,
        requestAnimationFrame: global.requestAnimationFrame,
        cancelAnimationFrame: global.cancelAnimationFrame,
        getComputedStyle: global.getComputedStyle,
    };
    global.HTMLElement = FakeElement;
    global.Element = FakeElement;
    global.HTMLFormElement = class FakeFormElement extends FakeElement {};
    installFakeDom();

    try {
        const appSource = fs.readFileSync(path.join(ROOT, 'modules/qq-v2/ui/app.js'), 'utf8');
        const addMenuStart = appSource.indexOf('const openAddContact = (anchor) =>');
        const addMenuEnd = appSource.indexOf('const confirmFriendRemoval', addMenuStart);
        assert.notEqual(addMenuStart, -1, '加号菜单入口必须接收触发按钮作为锚点');
        assert.notEqual(addMenuEnd, -1, '加号菜单入口必须保持独立边界');
        const addMenuSource = appSource.slice(addMenuStart, addMenuEnd);
        assert.match(addMenuSource, /showAnchoredMenu\(anchor,\s*menu\)/,
            '加号菜单必须通过专用锚定层打开');
        assert.doesNotMatch(addMenuSource, /showDialog\(/,
            '加号菜单不得经过通用居中 showDialog');
        assert.match(appSource, /yuzi-qq-anchored-menu-layer/,
            '锚定菜单必须暴露稳定的 DOM 样式挂点');

        const { createQQApp } = await import(pathToFileURL(path.join(ROOT, 'modules/qq-v2/ui/app.js')).href);
        await testCreateGroupUsesTwoExistingFriends(createQQApp);
        await testSuccessfulAddContactResult(createQQApp, {
            label: 'new contact',
            submittedName: '  New Contact  ',
            name: 'New Contact',
            conversationId: 'private-new',
            created: true,
            restored: false,
        });
        await testSuccessfulAddContactResult(createQQApp, {
            label: 'existing friend reuse',
            submittedName: 'Exact Existing Contact',
            name: 'Exact Existing Contact',
            conversationId: 'private-existing',
            created: false,
            restored: false,
        });
        await testSuccessfulAddContactResult(createQQApp, {
            label: 'non-friend restore',
            submittedName: 'Restored Contact',
            name: 'Restored Contact',
            conversationId: 'private-restored',
            created: false,
            restored: true,
        });
        await testSuccessfulAddContactResult(createQQApp, {
            label: 'hard-deleted history replacement',
            submittedName: 'Replacement Contact',
            name: 'Replacement Contact',
            conversationId: 'private-fresh',
            created: true,
            restored: false,
        });
        await testAllWhitespaceNameStaysDisabled(createQQApp);
        await testFailedAddPreservesDraft(createQQApp);
        console.log('[qq-add-contact-ui-contract] passed');
    } finally {
        if (originalGlobals.document === undefined) delete global.document;
        else global.document = originalGlobals.document;
        if (originalGlobals.window === undefined) delete global.window;
        else global.window = originalGlobals.window;
        if (originalGlobals.HTMLElement === undefined) delete global.HTMLElement;
        else global.HTMLElement = originalGlobals.HTMLElement;
        if (originalGlobals.Element === undefined) delete global.Element;
        else global.Element = originalGlobals.Element;
        if (originalGlobals.HTMLFormElement === undefined) delete global.HTMLFormElement;
        else global.HTMLFormElement = originalGlobals.HTMLFormElement;
        if (originalGlobals.requestAnimationFrame === undefined) delete global.requestAnimationFrame;
        else global.requestAnimationFrame = originalGlobals.requestAnimationFrame;
        if (originalGlobals.cancelAnimationFrame === undefined) delete global.cancelAnimationFrame;
        else global.cancelAnimationFrame = originalGlobals.cancelAnimationFrame;
        if (originalGlobals.getComputedStyle === undefined) delete global.getComputedStyle;
        else global.getComputedStyle = originalGlobals.getComputedStyle;
    }
}

main().catch((error) => {
    console.error('[qq-add-contact-ui-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
