const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = process.cwd();

class FakeElement {
    constructor(selector = '') {
        this.selector = selector;
        this.dataset = {};
        this.style = {};
        this.attributes = new Map();
    }
    closest(selector) { return selector === this.selector ? this : null; }
    matches(selector) { return selector === this.selector; }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
}

class FakeContainer extends FakeElement {
    constructor() {
        super('container');
        this.handlers = new Map();
    }
    addEventListener(type, handler) { this.handlers.set(type, handler); }
    removeEventListener() {}
    querySelectorAll() { return []; }
    contains() { return true; }
    async click(target) {
        const handler = this.handlers.get('click');
        assert.equal(typeof handler, 'function');
        await handler({
            target,
            preventDefault() {},
            stopPropagation() {},
        });
    }
}

global.HTMLElement = FakeElement;
global.HTMLTextAreaElement = class FakeTextArea extends FakeElement {};
global.HTMLSelectElement = class FakeSelect extends FakeElement {};

function createState(overrides = {}) {
    return {
        mode: 'detail',
        rowIndex: 0,
        editMode: true,
        saving: false,
        cellLockManageMode: true,
        draftValues: { 0: 'draft' },
        pendingExternalTableUpdate: null,
        set(key, value) { this[key] = value; },
        setEditMode(enabled) {
            this.editMode = !!enabled;
            if (!enabled) this.draftValues = {};
        },
        setCellLockManageMode(enabled) {
            this.cellLockManageMode = !!enabled;
            if (enabled) this.editMode = false;
        },
        returnToListMode() {
            this.mode = 'list';
            this.rowIndex = -1;
            this.editMode = false;
            this.cellLockManageMode = false;
            this.draftValues = {};
        },
        syncLockState(lockState) { this.lockState = lockState; },
        clearPendingExternalTableUpdate() { this.pendingExternalTableUpdate = null; },
        ...overrides,
    };
}


function pagerTarget(rowIndex) {
    const target = new FakeElement('[data-pager]');
    target.setAttribute('data-target-row-index', rowIndex);
    return target;
}

async function bindHarness(options = {}) {
    const moduleUrl = pathToFileURL(path.join(ROOT, 'modules/table-viewer/detail-edit-controller.js')).href;
    const { bindGenericDetailEditController } = await import(moduleUrl);
    const container = new FakeContainer();
    const calls = [];
    const state = options.state || createState();
    const rows = options.rows || [['row-0'], ['row-1'], ['row-2']];

    bindGenericDetailEditController({
        container,
        state,
        rowLocked: false,
        rowIndexForLock: 0,
        sheetKey: 'sheet_scroll',
        rawHeaders: ['name'],
        rows,
        ddlFieldMetadata: null,
        shouldHideLeadingPlaceholder: false,
        shouldSkipColumn: () => false,
        toLockColIndex: value => value,
        render: () => { calls.push(`render:${state.rowIndex}`); },
        restoreListScroll: () => { calls.push('restore-list'); },
        captureDetailScroll: () => { calls.push(`capture-detail:${state.rowIndex}`); },
        restoreDetailScroll: () => { calls.push(`restore-detail:${state.rowIndex}`); },
        renderKeepScroll: () => { calls.push('render-keep-scroll'); },
        getTableLockState: () => ({ rows: {} }),
        isTableRowLocked: () => false,
        toggleTableCellLock: () => false,
        isTableCellLocked: () => false,
        getLiveTableName: () => '测试表',
        updateTableRow: async () => ({ ok: true }),
        buildMutationDiagnostics: () => ({}),
        syncRowsFromSheet: () => true,
        showInlineToast: () => {},
        runtime: { isDisposed: () => false },
    });

    return { container, state, calls, rows };
}


async function testSiblingNavigationRestoresDetailScroll() {
    const harness = await bindHarness();
    await harness.container.click(pagerTarget(2));

    assert.equal(harness.state.rowIndex, 2, 'sibling 翻页应切换到目标 rowIndex');
    assert.equal(harness.state.editMode, false, 'sibling 翻页应退出编辑态');
    assert.equal(harness.state.cellLockManageMode, false, 'sibling 翻页应退出字段锁管理态');
    assert.deepEqual(harness.calls, [
        'capture-detail:0',
        'render:2',
        'restore-detail:2',
    ], 'sibling 翻页应按 capture -> render -> restore 顺序处理详情滚动');
}

async function testBackRestoresListScrollOnly() {
    const harness = await bindHarness();
    await harness.container.click(new FakeElement('[data-action="detail-back"]'));

    assert.equal(harness.state.mode, 'list', '返回按钮应返回列表模式');
    assert.equal(harness.state.rowIndex, -1, '返回按钮应清理详情 rowIndex');
    assert.deepEqual(harness.calls, [
        'render:-1',
        'restore-list',
    ], '返回列表只应恢复 listScrollTop，不应触发 detail scroll helper');
}

async function testGenericNavBackDoesNotTriggerDetailBack() {
    const harness = await bindHarness();
    await harness.container.click(new FakeElement('.phone-nav-back'));

    assert.equal(harness.state.mode, 'detail', '泛用 nav-back 不应被详情控制器当作详情返回处理');
    assert.equal(harness.state.rowIndex, 0, '泛用 nav-back 不应清理详情 rowIndex');
    assert.deepEqual(harness.calls, [], '泛用 nav-back 不应触发详情页本地返回副作用');
}

async function testInvalidPagerTargetDoesNotRestoreDetailScroll() {
    const harness = await bindHarness();
    await harness.container.click(pagerTarget(99));

    assert.equal(harness.state.rowIndex, 0, '非法 sibling target 不应切换 rowIndex');
    assert.deepEqual(harness.calls, [], '非法 sibling target 不应 capture/render/restore');
}

async function testSavingSkipsSiblingNavigation() {
    const harness = await bindHarness({ state: createState({ saving: true }) });
    await harness.container.click(pagerTarget(1));

    assert.equal(harness.state.rowIndex, 0, 'saving 时 sibling 翻页应被跳过');
    assert.deepEqual(harness.calls, [], 'saving 时不应 capture/render/restore');
}

async function testSingleRowSkipsSiblingNavigation() {
    const harness = await bindHarness({ rows: [['only-row']] });
    await harness.container.click(pagerTarget(0));

    assert.equal(harness.state.rowIndex, 0, '单行详情不应执行 sibling 翻页');
    assert.deepEqual(harness.calls, [], '单行详情不应 capture/render/restore');
}


async function testScrollPreserverClampAndNoBodyNoop() {
    const moduleUrl = pathToFileURL(path.join(ROOT, 'modules/ui-runtime/scroll-preserver-core.js')).href;
    const { createRuntimeScrollPreserver } = await import(moduleUrl);
    const frames = [];
    const runtime = { requestAnimationFrame(callback) { frames.push(callback); return frames.length; } };
    const state = { detailScrollTop: 0 };
    const body = new FakeElement('.phone-app-body');
    body.scrollTop = 180;
    body.scrollHeight = 520;
    body.clientHeight = 120;
    const container = new FakeContainer();
    container.isConnected = true;
    container.querySelector = selector => (selector === '.phone-app-body' ? body : null);

    const preserver = createRuntimeScrollPreserver(container, state, '.phone-app-body', runtime);
    preserver.captureScroll('detailScrollTop');
    assert.equal(state.detailScrollTop, 180, 'captureScroll 应记录当前详情 scrollTop');

    body.scrollTop = 0;
    body.scrollHeight = 240;
    body.clientHeight = 120;
    state.detailScrollTop = 300;
    preserver.restoreScroll('detailScrollTop');
    assert.equal(body.scrollTop, 120, 'restoreScroll 应在短详情中 clamp 到最大 scrollTop');
    while (frames.length > 0) frames.shift()();
    assert.equal(body.scrollTop, 120, '后续 RAF restore 仍应保持 clamp 后的位置');

    const noBodyContainer = new FakeContainer();
    noBodyContainer.isConnected = true;
    noBodyContainer.querySelector = () => null;
    const noBodyState = { detailScrollTop: 77 };
    const noBodyPreserver = createRuntimeScrollPreserver(noBodyContainer, noBodyState, '.phone-app-body', runtime);
    noBodyPreserver.captureScroll('detailScrollTop');
    noBodyPreserver.restoreScroll('detailScrollTop');
    assert.equal(noBodyState.detailScrollTop, 77, '无 .phone-app-body 时 capture/restore 应 no-op');
}

async function main() {
    await testSiblingNavigationRestoresDetailScroll();
    await testBackRestoresListScrollOnly();
    await testGenericNavBackDoesNotTriggerDetailBack();
    await testInvalidPagerTargetDoesNotRestoreDetailScroll();
    await testSavingSkipsSiblingNavigation();
    await testSingleRowSkipsSiblingNavigation();
    await testScrollPreserverClampAndNoBodyNoop();

    console.log('[generic-detail-sibling-scroll-behavior-check] 检查通过');
    console.log('- OK | sibling 翻页按 capture -> render -> restore 恢复详情滚动');
    console.log('- OK | 返回列表只恢复 listScrollTop');
    console.log('- OK | 详情控制器不再把泛用 nav-back 当作详情返回处理');
    console.log('- OK | 非法 target、saving、单行场景不触发详情滚动恢复');
    console.log('- OK | detailScrollTop 底层 capture/restore 支持 clamp 与无滚动容器 no-op');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
