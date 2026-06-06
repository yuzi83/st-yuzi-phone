const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = process.cwd();
function toModuleUrl(relativePath) {
    return pathToFileURL(path.join(ROOT, relativePath)).href;
}

class FakeHTMLElement {
    constructor(props = {}) {
        Object.assign(this, props);
        this.innerHTML = '';
        this.style = this.style || {};
        this.dataset = this.dataset || {};
    }
    querySelector(selector) {
        return this.selectors?.[selector] || null;
    }
    querySelectorAll(selector) {
        return this.selectorLists?.[selector] || [];
    }
}

global.HTMLElement = FakeHTMLElement;
global.Element = FakeHTMLElement;
global.document = { body: new FakeHTMLElement() };
global.window = {
    setTimeout: setTimeout.bind(global),
    clearTimeout: clearTimeout.bind(global),
    requestAnimationFrame(callback) { callback(Date.now()); return 1; },
    cancelAnimationFrame() {},
};

const created = [];
const revoked = [];
global.URL = {
    createObjectURL(blob) {
        const url = `blob:test-${created.length + 1}`;
        created.push({ url, blob });
        return url;
    },
    revokeObjectURL(url) {
        revoked.push(url);
    },
};
global.Blob = global.Blob || class Blob { constructor(parts, options) { this.parts = parts; this.options = options; } };

function createRow({ checked = true, key = 'sheet_1', source = 'A' } = {}) {
    return new FakeHTMLElement({
        dataset: { key },
        selectors: {
            '.phone-fusion-check': { checked },
            '.phone-fusion-source-select': { value: source },
        },
    });
}

function createContainer(rows) {
    const resultEl = new FakeHTMLElement();
    return {
        resultEl,
        container: new FakeHTMLElement({
            selectors: { '#phone-fusion-result': resultEl },
            selectorLists: { '.phone-fusion-table-row': rows },
        }),
    };
}

async function main() {
    const { performFusionMerge } = await import(toModuleUrl('modules/phone-fusion/compare-merge.js'));
    const { cleanupFusionPageResources } = await import(toModuleUrl('modules/phone-fusion/runtime.js'));
    const templateA = { mate: { type: 'chatSheets', version: 1 }, sheet_1: { name: 'A', columns: [], rows: [] } };
    const templateB = { mate: { type: 'chatSheets', version: 1 } };

    const first = createContainer([createRow({ checked: true })]);
    performFusionMerge(first.container, templateA, templateB);
    assert.equal(created[0].url, 'blob:test-1');
    assert.match(first.resultEl.innerHTML, /blob:test-1/);

    first.container.selectorLists['.phone-fusion-table-row'] = [createRow({ checked: false })];
    performFusionMerge(first.container, templateA, templateB);
    assert.deepEqual(revoked, ['blob:test-1']);
    assert.ok(!first.resultEl.innerHTML.includes('blob:test-1'));

    const second = createContainer([createRow({ checked: true })]);
    performFusionMerge(second.container, templateA, templateB);
    performFusionMerge(second.container, templateA, templateB);
    assert.deepEqual(revoked, ['blob:test-1', 'blob:test-2']);
    assert.match(second.resultEl.innerHTML, /blob:test-3/);
    cleanupFusionPageResources();
    assert.deepEqual(revoked, ['blob:test-1', 'blob:test-2', 'blob:test-3']);

    console.log('[fusion-object-url-behavior-check] 检查通过');
}

main().catch((error) => {
    console.error('[fusion-object-url-behavior-check] 检查失败：');
    console.error(error);
    process.exitCode = 1;
});
