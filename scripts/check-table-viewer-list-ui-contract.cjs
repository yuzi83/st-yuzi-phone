const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const ROOT = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

async function main() {
    const template = await import(pathToFileURL(path.join(ROOT, 'modules/table-viewer/list-page-template.js')));
    for (const count of [0, 1, 12]) {
        assert.equal(template.buildGenericListToolbarInfoHtml({ visibleCount: count, totalRowCount: 99, searchQuery: 'a', toolbarHint: '不要显示' }), `<span class="phone-generic-result-pill">${count}条</span>`);
    }
    assert.equal(template.buildGenericListToolbarInfoHtml({ showResultCount: false }), '');
    const search = { totalRowCount: 2, visibleCount: 0, searchQuery: '777' };
    const html = template.buildGenericListToolbarHtml(search) + template.buildGenericListContentHtml(search);
    assert.equal((html.match(/data-action="clear-search"/g) || []).length, 1);
    assert.doesNotMatch(html, /phone-generic-toolbar-hint/);
    assert.match(template.buildGenericListContentHtml({ totalRowCount: 0 }), /data-action="add-row"/);
    assert.match(template.buildGenericListContentHtml({ totalRowCount: 2, onlyShowReviewUpdates: true }), /data-action="toggle-review-updates-only"/);
    for (const sortDescending of [false, true]) {
        const sort = template.buildGenericListToolbarActionsHtml({ totalRowCount: 2, sortDescending });
        assert.match(sort, /class="phone-generic-sort-icon"/);
        assert.ok(sort.includes(`当前${sortDescending ? '倒序' : '正序'}，切换为${sortDescending ? '正序' : '倒序'}`));
        assert.doesNotMatch(sort, />(正序|倒序)<\/button>/);
    }

    // 模拟原生按钮 click；子元素（包含 SVG）冒泡只交付一次，无第二套键盘切换器。
    class Element {
        constructor(parent = null) { this.parent = parent; }
        closest() { return this.action ? this : this.parent?.closest(); }
    }
    class HTMLElement extends Element {
        constructor(attrs = {}) { super(); this.attrs = attrs; this.dataset = {}; this.listeners = {}; }
        getAttribute(name) { return this.attrs[name] ?? null; }
        querySelector() { return null; }
        contains() { return true; }
        addEventListener(name, listener) { this.listeners[name] = listener; }
        removeEventListener() {}
    }
    const sandbox = { Element, HTMLElement, HTMLInputElement: class {}, Logger: { withScope: () => ({ warn() {} }) } };
    vm.createContext(sandbox);
    vm.runInContext(read('modules/table-viewer/list-page-controller.js').replace(/^import .*;\r?\n/gm, '').replace('export function bindGenericListPageController', 'function bindGenericListPageController'), sandbox);
    const container = new HTMLElement();
    let locked = false, toggles = 0, opened = 0;
    const state = {
        lockManageMode: false, deleteManageMode: false, deletingRowIndex: -1,
        selectedDeleteRowIndexes: [], listSortDescending: false,
        set(key, value) { this[key] = value; },
        syncLockState() {},
        enterDetailMode() { opened++; },
        setSelectedDeleteRowIndexes(rows) { this.selectedDeleteRowIndexes = Array.from(rows); },
    };
    sandbox.bindGenericListPageController({
        container, state, sheetKey: 'sheet_demo', captureListScroll() {}, render() {},
        toggleTableRowLock() { toggles++; return locked = !locked; },
        getTableLockState() { return {}; }, isTableRowLocked() { return locked; },
        getVisibleDeleteRowIndexes() { return locked ? [] : [0]; }, showInlineToast() {},
    });
    assert.equal(container.listeners.keydown, undefined, 'native buttons own Enter/Space; do not double toggle');
    function row() {
        const html = template.buildGenericListRowHtml({ rowIndex: 0, title: '测试', previewText: '内容', nonEmptyCount: 8, rowLocked: locked, deleteSelected: state.selectedDeleteRowIndexes.includes(0) }, state);
        assert.equal((html.match(/data-action=/g) || []).length, 1, 'one action per row, no nested interactive chips');
        const attrs = Object.fromEntries([...html.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
        const el = new HTMLElement(attrs); el.action = true;
        el.dataset = { action: attrs['data-action'], rowIndex: attrs['data-row-index'] };
        return el;
    }
    async function click(target) { await container.listeners.click({ target, preventDefault() {}, stopPropagation() {} }); }
    await click(row()); assert.equal(opened, 1);
    state.lockManageMode = true;
    await click(new Element(row())); assert.equal(locked, true); assert.equal(toggles, 1);
    await click(row()); assert.equal(locked, false); assert.equal(toggles, 2); assert.equal(opened, 1);
    state.lockManageMode = false; state.deleteManageMode = true;
    await click(row()); assert.deepEqual(state.selectedDeleteRowIndexes, [0]);
    await click(new Element(row())); assert.deepEqual(state.selectedDeleteRowIndexes, []);
    locked = true; await click(row()); assert.deepEqual(state.selectedDeleteRowIndexes, []);
    locked = false; state.deletingSelection = true; await click(row()); assert.deepEqual(state.selectedDeleteRowIndexes, []);
    state.deletingSelection = false; state.deletingRowIndex = 0; await click(row()); assert.deepEqual(state.selectedDeleteRowIndexes, []);
    assert.equal(opened, 1);
    const sortButton = new HTMLElement(); sortButton.action = true; sortButton.dataset.action = 'toggle-sort';
    await click(new Element(sortButton)); assert.equal(state.listSortDescending, true, 'SVG descendants must reach sort action');

    const css = read('styles/05-phone-generic-template.css');
    const toolbar = template.buildGenericListToolbarHtml(search);
    assert.match(toolbar, /phone-generic-toolbar-main">\s*<div class="phone-generic-toolbar-info"[^>]*>[\s\S]*?<\/div>\s*<div class="phone-generic-toolbar-actions"/,
        'count and filter actions must be siblings in the same toolbar row');
    assert.ok(toolbar.indexOf('data-generic-toolbar-region="search"') < toolbar.indexOf('phone-generic-toolbar-main'),
        'search stays above the count/action row');
    assert.doesNotMatch(css, /\.phone-generic-toolbar-(?:main|info)[^{]*\{[^}]*flex-direction: column/,
        'compact layout must not stack count above the filter actions');
    assert.doesNotMatch(css, /\.phone-generic-list-item-head\s*\{[^}]*display: grid/,
        'compact rows must keep the name and badges in the shared flex row');
    assert.doesNotMatch(css, /\.phone-generic-list-badges\s*\{[^}]*(?:grid-column|width: 100%)/,
        'status badges must not be forced onto a separate full-width line');
    for (const statusText of ['在场', '离场']) {
        const rowHtml = template.buildGenericListRowHtml({ rowIndex: 0, title: '颜榕', statusText, statusTone: 'neutral', previewText: '家人 · 女', nonEmptyCount: 12 });
        assert.match(rowHtml, /phone-generic-slot-list-main">颜榕<\/span>\s*<span class="phone-generic-list-badges">/);
        assert.ok(rowHtml.includes(statusText));
    }
    const countRule = css.match(/\.phone-generic-result-pill\s*\{([^}]+)\}/)[1];
    assert.match(countRule, /border: none/); assert.match(countRule, /background: transparent/);
    assert.match(countRule, /align-self: flex-start/);
    const itemRules = [...css.matchAll(/\.phone-generic-slot-list-item(?::last-child)?\s*\{([^}]+)\}/g)].map(m => m[1]);
    assert.ok(itemRules.some(rule => /flex-direction: row/.test(rule) && /align-items: center/.test(rule)),
        'row content and actions must sit side by side and vertically centered');
    assert.ok(itemRules.every(rule => !/flex-direction: column/.test(rule)),
        'compact layout must not move actions below the summary');
    const previewRule = css.match(/\.phone-generic-list-preview\s*\{([^}]+)\}/)[1];
    assert.match(previewRule, /display: block/, 'summary must wrap instead of using the template line clamp');
    const contentRule = css.match(/\.phone-generic-list-item-content\s*\{([^}]+)\}/)[1];
    assert.match(contentRule, /min-width: 0/);
    assert.match(contentRule, /overflow-wrap: anywhere/);
    const sideRules = [...css.matchAll(/\.phone-generic-slot-list-side\s*\{([^}]+)\}/g)].map(m => m[1]);
    assert.ok(sideRules.some(rule => /flex-direction: column/.test(rule) && /align-self: center/.test(rule)));
    assert.ok(sideRules.every(rule => !/grid-template-columns: 1fr|(?:^|[;\n])\s*width: 100%|align-items: stretch/.test(rule)), 'narrow rows must not stretch the action across the screen');
}
main().then(() => console.log('[table-viewer-list-ui-contract] passed')).catch(error => { console.error(error); process.exitCode = 1; });
