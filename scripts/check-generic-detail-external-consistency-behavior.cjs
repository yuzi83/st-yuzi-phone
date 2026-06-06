const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = process.cwd();

class FakeElement {
    constructor(selector = '') {
        this.selector = selector;
        this.dataset = {};
        this.style = {};
    }
    closest(selector) { return selector === this.selector ? this : null; }
    matches() { return false; }
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
    async click(selector) {
        const handler = this.handlers.get('click');
        assert.equal(typeof handler, 'function');
        await handler({ target: new FakeElement(selector) });
    }
}

global.HTMLElement = FakeElement;
global.HTMLTextAreaElement = class FakeTextArea extends FakeElement {};
global.HTMLSelectElement = class FakeSelect extends FakeElement {};

function createState() {
    return {
        mode: 'detail', rowIndex: 0, editMode: true, saving: false, cellLockManageMode: false,
        draftValues: { 0: 'draft' }, pendingExternalTableUpdate: { reason: 'dirty_detail_draft' },
        setEditMode(enabled) { this.editMode = !!enabled; if (!enabled) { this.draftValues = {}; this.pendingExternalTableUpdate = null; } },
        setCellLockManageMode(enabled) { this.cellLockManageMode = !!enabled; if (enabled) { this.editMode = false; this.draftValues = {}; this.pendingExternalTableUpdate = null; } },
        syncLockState(lockState) { this.lockState = lockState; },
        clearPendingExternalTableUpdate() { this.pendingExternalTableUpdate = null; },
        returnToListMode() { this.mode = 'list'; this.rowIndex = -1; this.editMode = false; this.cellLockManageMode = false; this.draftValues = {}; this.pendingExternalTableUpdate = null; },
    };
}

async function runCase({ selector, rows, syncRowsFromSheet }) {
    const moduleUrl = pathToFileURL(path.join(ROOT, 'modules/table-viewer/detail-edit-controller.js')).href;
    const { bindGenericDetailEditController } = await import(moduleUrl);
    const container = new FakeContainer();
    const state = createState();
    let renders = 0;
    const toasts = [];
    bindGenericDetailEditController({
        container, state, rowLocked: false, rowIndexForLock: 0, sheetKey: 'sheet_phase4', rawHeaders: ['name'], rows,
        ddlFieldMetadata: null, shouldHideLeadingPlaceholder: false, shouldSkipColumn: () => false, toLockColIndex: value => value,
        render: () => { renders += 1; }, restoreListScroll: () => {}, renderKeepScroll: () => { renders += 1; },
        getTableLockState: () => ({ rows: {} }), isTableRowLocked: () => false, toggleTableCellLock: () => false, isTableCellLocked: () => false,
        getLiveTableName: () => '测试表', updateTableRow: async () => ({ ok: true }), buildMutationDiagnostics: () => ({}), syncRowsFromSheet,
        showInlineToast: (_container, message, warning) => toasts.push({ message, warning: !!warning }), runtime: { isDisposed: () => false },
    });
    await container.click(selector);
    return { state, rows, renders, toasts };
}

async function main() {
    let syncCalls = 0;
    const rowsA = [['old']];
    const resultA = await runCase({ selector: '#phone-toggle-edit-mode', rows: rowsA, syncRowsFromSheet: () => { syncCalls += 1; rowsA.splice(0, rowsA.length, ['fresh']); return true; } });
    assert.equal(syncCalls, 1);
    assert.equal(resultA.state.editMode, false);
    assert.equal(resultA.state.pendingExternalTableUpdate, null);
    assert.deepEqual(rowsA, [['fresh']]);
    assert.ok(resultA.toasts.some(toast => toast.message === '已同步外部表更新'));

    syncCalls = 0;
    const rowsB = [['old']];
    const resultB = await runCase({ selector: '#phone-cell-lock-mode-btn', rows: rowsB, syncRowsFromSheet: () => { syncCalls += 1; rowsB.length = 0; return true; } });
    assert.equal(syncCalls, 1);
    assert.equal(resultB.state.mode, 'list');
    assert.ok(resultB.toasts.some(toast => toast.message === '外部表更新后当前行已不存在，已返回列表' && toast.warning));

    console.log('check-generic-detail-external-consistency-behavior: ok');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
