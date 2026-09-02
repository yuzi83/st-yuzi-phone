const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

class FakeStyle {
    constructor() {
        this.values = new Map();
    }

    setProperty(name, value) {
        this.values.set(name, String(value));
    }

    getPropertyValue(name) {
        return this.values.get(name) || '';
    }
}

class FakeElement {
    constructor(tagName = 'div') {
        this.tagName = String(tagName).toUpperCase();
        this.className = '';
        this.style = new FakeStyle();
        this.children = [];
        this.parentNode = null;
        this.textContent = '';
        this.attributes = new Map();
        this.listeners = new Map();
    }

    appendChild(child) {
        child.parentNode?.removeChild(child);
        child.parentNode = this;
        this.children.push(child);
        return child;
    }

    removeChild(child) {
        const index = this.children.indexOf(child);
        if (index >= 0) {
            this.children.splice(index, 1);
            child.parentNode = null;
        }
    }

    remove() {
        this.parentNode?.removeChild(this);
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
    }

    removeAttribute(name) {
        this.attributes.delete(name);
    }

    addEventListener(type, handler) {
        const handlers = this.listeners.get(type) || [];
        handlers.push(handler);
        this.listeners.set(type, handlers);
    }

    removeEventListener(type, handler) {
        const handlers = this.listeners.get(type) || [];
        this.listeners.set(type, handlers.filter(candidate => candidate !== handler));
    }

    getBoundingClientRect() {
        return this.className.includes('table-popup')
            ? { width: 300, height: 120 }
            : { width: 0, height: 0 };
    }
}

class FakeDocument {
    constructor() {
        this.defaultView = {
            innerWidth: 800,
            innerHeight: 600,
        };
    }

    createElement(tagName) {
        return new FakeElement(tagName);
    }
}

class FakeClock {
    constructor() {
        this.now = 0;
        this.nextId = 1;
        this.timers = new Map();
    }

    setTimeout(callback, delay = 0) {
        const id = this.nextId++;
        this.timers.set(id, {
            callback,
            dueAt: this.now + Math.max(0, Number(delay) || 0),
        });
        return id;
    }

    clearTimeout(id) {
        this.timers.delete(id);
    }

    tick(duration) {
        const target = this.now + Math.max(0, Number(duration) || 0);
        while (true) {
            const next = [...this.timers.entries()]
                .filter(([, timer]) => timer.dueAt <= target)
                .sort((left, right) => left[1].dueAt - right[1].dueAt || left[0] - right[0])[0];
            if (!next) break;
            const [id, timer] = next;
            this.timers.delete(id);
            this.now = timer.dueAt;
            timer.callback();
        }
        this.now = target;
    }
}

async function flushMicrotasks(rounds = 8) {
    for (let index = 0; index < rounds; index += 1) await Promise.resolve();
}

async function main() {
    const indexSource = fs.readFileSync(path.join(
        ROOT,
        'modules/fullscreen-overlay/index.js',
    ), 'utf8');
    assert.match(indexSource, /createGenericTableSourceAdapter/u);
    assert.match(indexSource, /createTablePopupRenderer/u);
    assert.match(indexSource, /\[TABLE_POPUP_MODEL_ID,\s*popupRenderer\]/u);

    const css = fs.readFileSync(path.join(
        ROOT,
        'styles/fullscreen-overlay/00-runtime.css',
    ), 'utf8');
    assert.match(css, /\.yuzi-phone-fullscreen-overlay-table-popup\s*\{/u);
    assert.match(css, /grid-template-columns:\s*repeat\(/u);
    assert.match(css, /pointer-events:\s*none/u);
    assert.match(css, /white-space:\s*pre-wrap/u, '完整长文本不得被单行截断');
    assert.doesNotMatch(
        css.match(/\.yuzi-phone-fullscreen-overlay-table-popup\s*\{[^}]*\}/su)?.[0] || '',
        /\b(?:border|box-shadow)\s*:/u,
        '普通表格弹窗外框必须保持无边框无阴影',
    );

    const moduleUrl = pathToFileURL(path.join(
        ROOT,
        'modules/fullscreen-overlay/renderers/table-popup.js',
    )).href;
    const {
        createTablePopupRenderer,
    } = await import(`${moduleUrl}?check=${Date.now()}`);

    const documentRef = new FakeDocument();
    const layer = new FakeElement('div');
    const clock = new FakeClock();
    const randomValues = [0, 0, 1, 1, 0.5, 0.5];
    const renderer = createTablePopupRenderer({
        documentRef,
        layerRuntime: {
            mount: () => layer,
            getElement: () => layer,
        },
        getSettings: () => ({
            maxConcurrent: 2,
            areaPercent: 75,
            intervalMs: 200,
            durationMs: 4000,
            columnCount: 2,
            sizePreset: 'large',
            borderRadiusPx: 20,
            backgroundColor: '#123456',
            opacity: 0.94,
        }),
        random: () => randomValues.shift() ?? 0.5,
        setTimeoutFn: clock.setTimeout.bind(clock),
        clearTimeoutFn: clock.clearTimeout.bind(clock),
    });

    const play = renderer.play({
        sourceId: 'generic-table',
        sheetKey: 'sheet_square',
        items: [{
            cells: [
                { label: '标题', value: '第一条' },
                { label: '备注', value: '' },
            ],
        }, {
            cells: [
                { label: '标题', value: '第二条' },
                { label: '正文', value: '完整内容' },
            ],
        }, {
            cells: [
                { label: '标题', value: '第三条' },
            ],
        }],
    });
    await flushMicrotasks();

    assert.equal(layer.children.length, 1, '首张卡片必须立即出现');
    const first = layer.children[0];
    assert.equal(first.className, 'yuzi-phone-fullscreen-overlay-table-popup');
    assert.equal(
        first.style.getPropertyValue('--yuzi-phone-fullscreen-overlay-popup-columns'),
        '2',
    );
    assert.equal(
        first.style.getPropertyValue('--yuzi-phone-fullscreen-overlay-popup-background'),
        'rgba(18, 52, 86, 0.94)',
        '背景透明度只应作用于背景色',
    );
    assert.equal(
        first.children[0].children[0].textContent,
        '标题',
        '每格必须先显示字段名',
    );
    assert.equal(first.children[0].children[1].textContent, '第一条');
    assert.equal(
        first.children[1].children[1].textContent,
        '—',
        '空值必须显示浅色占位符',
    );
    assert.equal(
        first.style.getPropertyValue('--yuzi-phone-fullscreen-overlay-popup-value-size'),
        '16.24px',
        '放大档必须同步放大卡片内部字号',
    );

    clock.tick(200);
    await flushMicrotasks();
    assert.equal(layer.children.length, 2, '并发上限为 2 时第二张应按交接间隔出现');

    clock.tick(400);
    await flushMicrotasks();
    assert.equal(
        layer.children.length,
        2,
        '达到并发上限后第三张必须等待，而不是继续堆 DOM',
    );

    clock.tick(3400);
    await flushMicrotasks();
    assert.equal(layer.children.length, 2, '首张离场后第三张必须补入空位');

    clock.tick(200);
    await flushMicrotasks();
    assert.deepEqual(
        await play,
        { status: 'completed', emittedCount: 3 },
        '最后一张完成入场后必须向 scheduler 交接，不等待全部卡片离场',
    );

    renderer.pause();
    assert.equal(layer.attributes.get('data-yuzi-phone-overlay-paused'), 'true');
    renderer.resume();
    assert.equal(layer.attributes.has('data-yuzi-phone-overlay-paused'), false);

    renderer.clear();
    assert.equal(layer.children.length, 0, '清空必须立即移除所有弹窗');
    assert.equal(renderer.getActiveCount(), 0);
    renderer.dispose();

    console.log('[fullscreen-overlay-popup-flow] passed');
}

main().catch((error) => {
    console.error('[fullscreen-overlay-popup-flow] failed');
    console.error(error);
    process.exitCode = 1;
});
