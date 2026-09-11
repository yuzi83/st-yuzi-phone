const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const url = file => pathToFileURL(path.join(process.cwd(), file)).href;
const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
};

class FakeElement {
    constructor(action = 'delete') {
        this.dataset = { action, presetId: 'fixture.preset', itemId: 'fixture.item', sheetKey: 'fixture.sheet' };
        this.disabled = false;
        this.isConnected = true;
    }
    closest(selector) {
        if (selector === '.phone-nav-back') return null;
        if (selector === '[data-action]') return this;
        return null;
    }
}
class FakeButton extends FakeElement {}
global.Element = FakeElement;
global.HTMLButtonElement = FakeButton;

async function main() {
    const { createBeautifyPageBehavior } = await import(url('modules/settings-app/pages/beautify-behavior.js'));

    function createHarness(deleteImpl, refreshImpl = () => undefined) {
        const listeners = new Map();
        let confirmCallback = null;
        let deleteCalls = 0;
        let refreshCalls = 0;
        const toasts = [];
        const button = new FakeButton();
        const runtime = { disposed: false, isDisposed() { return this.disposed; } };
        const container = {
            addEventListener(type, handler) {
                assert.ok(['click', 'change'].includes(type), `未知的页面事件：${type}`);
                listeners.set(type, handler);
            },
            removeEventListener(type, handler) {
                assert.ok(['click', 'change'].includes(type), `未知的页面事件：${type}`);
                if (listeners.get(type) === handler) listeners.delete(type);
            },
        };
        const behavior = createBeautifyPageBehavior({
            container,
            runtime,
            waitForCommittedRefresh() { refreshCalls += 1; return refreshImpl(refreshCalls); },
        }, {
            contentPresetWorkshopService: {
                deletePreset(id) { deleteCalls += 1; assert.equal(id, 'fixture.preset'); return deleteImpl(deleteCalls); },
            },
            showConfirmDialog(_container, title, message, callback, confirmText, cancelText, passedRuntime) {
                assert.equal(title, '删除完整预设？');
                assert.match(message, /原子清除/);
                assert.equal(confirmText, '确认删除');
                assert.equal(cancelText, '取消');
                assert.equal(passedRuntime, runtime);
                confirmCallback = callback;
            },
            showToast(_container, message, isError, passedRuntime) { toasts.push({ message, isError, passedRuntime }); },
        });
        const cleanup = behavior.attachPageInteractions();
        return {
            button, runtime, toasts,
            click() { listeners.get('click')?.({ target: button }); },
            confirm() { return confirmCallback?.(); },
            cleanup,
            get deleteCalls() { return deleteCalls; },
            get refreshCalls() { return refreshCalls; },
            get hasConfirm() { return typeof confirmCallback === 'function'; },
        };
    }


    {
        const h = createHarness(() => undefined);
        h.click();
        assert.equal(h.hasConfirm, true);
        assert.equal(h.deleteCalls, 0, '未确认不得删除预设');
        assert.equal(h.toasts.length, 0);
    }

    {
        const pending = deferred();
        const h = createHarness(() => pending.promise);
        h.click();
        const first = h.confirm();
        const duplicate = h.confirm();
        assert.equal(h.button.disabled, true);
        assert.equal(h.deleteCalls, 1, 'pending 期间重复确认必须被 busy 锁阻止');
        pending.resolve();
        await Promise.all([first, duplicate]);
        assert.equal(h.button.disabled, false);
        assert.equal(h.refreshCalls, 1, '删除提交后必须等待一次 committed refresh');
        assert.deepEqual(h.toasts.at(-1), { message: '预设已删除', isError: false, passedRuntime: h.runtime });
    }

    {
        const h = createHarness(call => {
            if (call === 1) throw new Error('fixture delete failure');
        });
        h.click();
        await h.confirm();
        assert.equal(h.button.disabled, false);
        assert.equal(h.refreshCalls, 0, '删除失败不得等待不存在的 committed refresh');
        assert.equal(h.toasts.at(-1).isError, true);
        assert.match(h.toasts.at(-1).message, /fixture delete failure/);
        h.click();
        await h.confirm();
        assert.equal(h.deleteCalls, 2, '异常后必须释放 busy 锁并允许重试');
        assert.equal(h.refreshCalls, 1);
    }

    {
        const refresh = deferred();
        const h = createHarness(() => undefined, () => refresh.promise);
        h.click();
        const completion = h.confirm();
        await Promise.resolve();
        assert.equal(h.refreshCalls, 1);
        assert.equal(h.button.disabled, true, 'committed refresh 完成前必须保持 busy 锁');
        assert.equal(h.toasts.length, 0, 'committed refresh 完成前不得显示成功 toast');
        refresh.resolve();
        await completion;
        assert.equal(h.button.disabled, false);
        assert.deepEqual(h.toasts.at(-1), { message: '预设已删除', isError: false, passedRuntime: h.runtime });
    }

    {
        const pending = deferred();
        const h = createHarness(() => pending.promise);
        h.click();
        const completion = h.confirm();
        h.runtime.disposed = true;
        pending.resolve();
        await completion;
        assert.equal(h.toasts.length, 0, '页面销毁后不得显示完成 toast');
        assert.equal(h.refreshCalls, 0, '页面销毁后不得等待页面刷新');
        assert.equal(h.button.disabled, false);
    }

    {
        const h = createHarness(() => undefined);
        h.cleanup();
        h.click();
        assert.equal(h.hasConfirm, false, 'cleanup 后旧 listener 不得生效');
        assert.equal(h.deleteCalls, 0);
    }

    for (const scenario of [
        { action: 'clear-all-page', method: 'clearAllPageActive', args: [], toast: '全部页面已恢复默认展示' },
        { action: 'clear-all-popup', method: 'clearAllPopupActive', args: [], toast: '全部弹窗应用已清空' },
    ]) {
        const listeners = new Map();
        let confirmCallback = null;
        let operationCalls = 0;
        let refreshCalls = 0;
        const toasts = [];
        const button = new FakeButton(scenario.action);
        const runtime = { isDisposed: () => false };
        const service = {
            [scenario.method](...args) {
                operationCalls += 1;
                assert.deepEqual(args, scenario.args);
            },
        };
        const behavior = createBeautifyPageBehavior({
            container: {
                addEventListener(type, handler) { listeners.set(type, handler); },
                removeEventListener() {},
            },
            runtime,
            waitForCommittedRefresh() { refreshCalls += 1; },
        }, {
            contentPresetWorkshopService: service,
            showConfirmDialog(_container, _title, _message, callback) { confirmCallback = callback; },
            showToast(_container, message, isError) { toasts.push({ message, isError }); },
        });
        behavior.attachPageInteractions();
        listeners.get('click')({ target: button });
        await confirmCallback();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(operationCalls, 1, `${scenario.action} 必须只提交一次 mutation`);
        assert.equal(refreshCalls, 1, `${scenario.action} 必须只等待一次 committed refresh`);
        assert.deepEqual(toasts, [{ message: scenario.toast, isError: false }], `${scenario.action} 必须只显示一次成功 toast`);
    }

    for (const scenario of [
        { application: 'page', value: 'page.preset:page.item', method: 'setPageActive', args: ['fixture.sheet', 'page.preset', 'page.item'], toast: '已设为当前页面美化' },
        { application: 'popup', value: 'popup.preset', method: 'setPopupActive', args: ['fixture.sheet', 'popup.preset'], toast: '已设为当前弹窗美化' },
        { application: 'page', value: '', method: 'clearPageActive', args: ['fixture.sheet'], toast: '该表已恢复默认页面' },
        { application: 'popup', value: '', method: 'clearPopupActive', args: ['fixture.sheet'], toast: '该表已恢复内置展示' },
    ]) {
        const listeners = new Map();
        let operationCalls = 0;
        let refreshCalls = 0;
        const toasts = [];
        const select = new FakeElement();
        select.dataset = {
            contentPresetApplication: scenario.application,
            sheetKey: 'fixture.sheet',
        };
        select.value = scenario.value;
        select.selectedOptions = scenario.value ? [{
            dataset: {
                presetId: scenario.application === 'page' ? 'page.preset' : 'popup.preset',
                ...(scenario.application === 'page' ? { itemId: 'page.item' } : {}),
            },
        }] : [];
        const behavior = createBeautifyPageBehavior({
            container: {
                addEventListener(type, handler) { listeners.set(type, handler); },
                removeEventListener() {},
            },
            runtime: { isDisposed: () => false },
            waitForCommittedRefresh() { refreshCalls += 1; },
        }, {
            contentPresetWorkshopService: {
                [scenario.method](...args) {
                    operationCalls += 1;
                    assert.deepEqual(args, scenario.args);
                },
            },
            showToast(_container, message, isError) { toasts.push({ message, isError }); },
        });
        behavior.attachPageInteractions();
        listeners.get('change')({ target: select });
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(operationCalls, 1, `${scenario.application} 应用变更必须只提交一次 mutation`);
        assert.equal(refreshCalls, 1, `${scenario.application} 应用变更必须只等待一次 committed refresh`);
        assert.deepEqual(toasts, [{ message: scenario.toast, isError: false }], `${scenario.application} 应用变更必须只显示一次成功 toast`);
    }

    {
        const refreshError = new Error('操作已提交，但模板工坊刷新失败：fixture read failed');
        const h = createHarness(() => undefined, () => Promise.reject(refreshError));
        h.click();
        await h.confirm();
        assert.equal(h.deleteCalls, 1, '刷新失败时不得重试已提交删除');
        assert.equal(h.refreshCalls, 1);
        assert.equal(h.toasts.length, 1, '已提交但刷新失败只能显示一次明确错误');
        assert.equal(h.toasts[0].isError, true);
        assert.match(h.toasts[0].message, /操作已提交，但模板工坊刷新失败/);
    }

    for (const replacesExisting of [false, true]) {
        const listeners = new Map();
        let confirmCallback = null;
        let importCalls = 0;
        let refreshCalls = 0;
        const toasts = [];
        const button = new FakeButton('import');
        const prepared = { record: { id: 'fixture.preset' }, replacesExisting };
        const input = {
            type: '',
            accept: '',
            files: [{ text: async () => '{"fixture":true}' }],
            addEventListener(_type, handler) { this.changeHandler = handler; },
            click() { void this.changeHandler(); },
        };
        const previousDocument = global.document;
        global.document = { createElement(tag) { assert.equal(tag, 'input'); return input; } };
        try {
            const behavior = createBeautifyPageBehavior({
                container: {
                    addEventListener(type, handler) { listeners.set(type, handler); },
                    removeEventListener() {},
                },
                runtime: { isDisposed: () => false },
                waitForCommittedRefresh() { refreshCalls += 1; },
            }, {
                contentPresetWorkshopService: {
                    prepareImport: async text => { assert.equal(text, '{"fixture":true}'); return prepared; },
                    importPrepared(actual, allowReplace) {
                        importCalls += 1;
                        assert.equal(actual, prepared);
                        assert.equal(allowReplace, replacesExisting);
                    },
                },
                showConfirmDialog(_container, title, _message, callback) {
                    assert.equal(title, '覆盖同 ID 预设？');
                    confirmCallback = callback;
                },
                showToast(_container, message, isError) { toasts.push({ message, isError }); },
            });
            behavior.attachPageInteractions();
            listeners.get('click')({ target: button });
            await new Promise(resolve => setImmediate(resolve));
            if (replacesExisting) {
                assert.equal(importCalls, 0, '覆盖导入确认前不得提交');
                await confirmCallback();
            }
            await new Promise(resolve => setImmediate(resolve));
            assert.equal(importCalls, 1, `${replacesExisting ? '覆盖' : '首次'}导入必须只提交一次 mutation`);
            assert.equal(refreshCalls, 1, `${replacesExisting ? '覆盖' : '首次'}导入必须只等待一次 committed refresh`);
            assert.deepEqual(toasts, [{
                message: replacesExisting ? '预设已原子覆盖，旧绑定已清除' : '预设已导入',
                isError: false,
            }], `${replacesExisting ? '覆盖' : '首次'}导入必须只显示一次成功 toast`);
        } finally {
            global.document = previousDocument;
        }
    }


    const { buildBeautifyTemplatePageHtml } = await import(url('modules/settings-app/layout/page-builders/editor-builders.js'));
    const html = buildBeautifyTemplatePageHtml({
        status: 'ready',
        error: null,
        presets: [{ id: 'fixture.preset', name: 'Fixture', version: '1', author: 'test', items: [{ id: 'fixture.item' }], displays: [{ id: 'fixture.display' }], issues: [] }],
        tables: [{
            sheetKey: 'fixture.sheet', tableName: '角色表', headers: ['姓名'],
            pageActive: { presetId: 'fixture.preset', itemId: 'fixture.item' },
            pageCandidates: [{
                presetId: 'fixture.preset', itemId: 'fixture.item',
                preset: { name: 'Fixture' }, item: { name: 'Fixture item' },
            }],
            popupActive: { presetId: 'fixture.preset' },
            popupCandidates: [{
                presetId: 'fixture.preset',
                preset: { name: 'Fixture' },
                displays: [{ id: 'fixture.display', name: 'Fixture display', kind: 'inline' }],
            }],
        }, {
            sheetKey: 'fixture.second', tableName: '关系表', headers: ['姓名', '关系'],
            pageActive: null,
            pageCandidates: [{
                presetId: 'fixture.preset', itemId: 'fixture.second-item',
                preset: { name: 'Fixture' }, item: { name: '关系表 item' },
            }],
            popupActive: null,
            popupCandidates: [],
        }],
    });
    for (const action of ['import', 'export', 'delete', 'clear-all-page', 'clear-all-popup']) {
        assert.match(html, new RegExp(`data-action="${action}"`));
    }
    assert.match(html, /data-content-preset-application="page"/);
    assert.match(html, /data-content-preset-application="popup"/);
    assert.match(html, /表格美化应用/);
    assert.match(html, /弹窗应用/);
    assert.match(html, /data-preset-id="fixture\.preset"/);
    assert.match(html, /data-item-id="fixture\.item"/);
    assert.doesNotMatch(html, /data-item-id="fixture\.display"/, '弹窗应用只选择预设来源，具体样式不可写入应用下拉框');
    assert.match(html, /data-sheet-key="fixture\.sheet"/);
    assert.match(html, /data-item-id="fixture\.second-item"/);
    assert.match(html, /data-sheet-key="fixture\.second"/);
    assert.equal(html.includes('phone-beautify-restore-defaults-btn'), false);
    assert.equal(html.includes('phone-beautify-list'), false);

    console.log('[beautify-behavior-check] 检查通过');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
