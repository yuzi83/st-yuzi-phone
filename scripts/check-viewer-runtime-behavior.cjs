const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = process.cwd();

function toModuleUrl(relativePath) {
    return pathToFileURL(path.join(ROOT, relativePath)).href;
}

class FakeHTMLElement {
    constructor(name = 'element') {
        this.name = name;
        this.dataset = {};
        this.style = {};
        this.nodes = new Map();
        this.isConnected = true;
        this.parentElement = null;
    }

    querySelector(selector) {
        return this.nodes.get(selector) || null;
    }

    querySelectorAll() {
        return [];
    }

    setQuery(selector, value) {
        this.nodes.set(selector, value);
        return value;
    }

    contains(target) {
        return target === this;
    }

    addEventListener() {}

    removeEventListener() {}
}

function installDomGlobals(order = []) {
    global.HTMLElement = FakeHTMLElement;
    global.Element = FakeHTMLElement;
    global.requestAnimationFrame = (callback) => {
        if (typeof callback === 'function') {
            callback(Date.now());
        }
        return 1;
    };
    global.cancelAnimationFrame = () => {};

    class FakeMutationObserver {
        constructor(callback) {
            this.callback = callback;
            this.target = null;
            this.options = null;
        }

        observe(target, options = {}) {
            this.target = target;
            this.options = options;
            order.push(`observe:${target?.name || 'unknown'}`);
        }

        disconnect() {
            order.push('observer-disconnect');
        }
    }

    global.MutationObserver = FakeMutationObserver;

    const body = new FakeHTMLElement('body');
    const windowTarget = {
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {},
        setTimeout: global.setTimeout.bind(global),
        clearTimeout: global.clearTimeout.bind(global),
        requestAnimationFrame: global.requestAnimationFrame,
        cancelAnimationFrame: global.cancelAnimationFrame,
    };

    global.window = windowTarget;
    global.document = {
        body,
        getElementById() {
            return null;
        },
    };

    return { body, windowTarget };
}

async function importViewerModules() {
    const runtimeModule = await import(toModuleUrl('modules/table-viewer/runtime.js'));
    const genericRuntimeModule = await import(toModuleUrl('modules/table-viewer/generic-runtime.js'));
    const specialRuntimeModule = await import(toModuleUrl('modules/table-viewer/special/runtime.js'));
    return { runtimeModule, genericRuntimeModule, specialRuntimeModule };
}

async function testViewerRuntimeStartSession(runtimeModule) {
    const order = [];
    installDomGlobals(order);
    const container = new FakeHTMLElement('viewer-container');
    const observerRoot = new FakeHTMLElement('body');

    const runtime = runtimeModule.createViewerRuntime({
        container,
        sheetKey: 'sheet_runtime',
        rerenderViewer: () => {},
        runtimeDeps: {
            getModalById: () => null,
            setCurrentViewingSheet: (sheetKey) => order.push(`sheet:${sheetKey}`),
            resetDataVersion: () => order.push('reset'),
            bindTemplateDraftPreviewForViewer: (host, sheetKey) => {
                order.push(`draft:${sheetKey}`);
                host.__yuziDraftPreviewCleanup = () => {
                    order.push('draft-cleanup');
                };
            },
            getObserverRoot: () => observerRoot,
        },
    });

    assert.ok(runtime);
    assert.equal(runtime.startViewerSession(), true);
    assert.deepEqual(order.slice(0, 4), [
        'sheet:sheet_runtime',
        'reset',
        'draft:sheet_runtime',
        'observe:body',
    ]);

    runtime.dispose();
    assert.ok(order.includes('draft-cleanup'));
    assert.ok(order.includes('observer-disconnect'));
    assert.ok(order.includes('sheet:null'));
}

async function testGenericRuntimeStartOrder(genericRuntimeModule) {
    const order = [];
    const container = new FakeHTMLElement('generic-container');
    const viewerRuntime = {
        addRowModalId: 'modal-generic',
        bindExternalTableUpdate() {
            order.push('bind');
        },
        setSuppressExternalTableUpdate() {},
    };

    const runtime = genericRuntimeModule.createGenericTableViewerRuntime(
        container,
        {
            sheetKey: 'sheet_generic',
            tableName: '测试表',
            headers: [],
            rawHeaders: [],
            rows: [],
            genericMatch: null,
        },
        {
            viewerRuntime,
            renderListPage: () => {
                order.push('render');
            },
        },
    );

    assert.ok(runtime);
    assert.equal(runtime.start(), true);
    assert.deepEqual(order, ['bind', 'render']);
}

async function testSpecialRuntimeStartPath(specialRuntimeModule) {
    const container = new FakeHTMLElement('special-container');
    const viewerEventManager = { name: 'viewer-event-manager' };
    const messageCalls = [];

    const messageRuntime = specialRuntimeModule.createSpecialTableViewerRuntime(
        container,
        {
            sheetKey: 'sheet_message',
            tableName: '消息记录表',
            rows: [],
            headers: [],
            type: 'message',
            templateMatch: null,
        },
        {
            viewerRuntime: { viewerEventManager },
            renderMessageTable: (_container, _context, deps) => {
                messageCalls.push(deps);
            },
        },
    );

    assert.ok(messageRuntime);
    assert.equal(messageRuntime.viewerEventManager, viewerEventManager);
    assert.equal(messageRuntime.start(), true);
    assert.equal(messageCalls.length, 1);
    assert.equal(messageCalls[0].viewerEventManager, viewerEventManager);
    assert.equal(typeof messageCalls[0].createSpecialTemplateStylePayload, 'function');
}

async function main() {
    installDomGlobals();
    const { runtimeModule, genericRuntimeModule, specialRuntimeModule } = await importViewerModules();

    await testViewerRuntimeStartSession(runtimeModule);
    await testGenericRuntimeStartOrder(genericRuntimeModule);
    await testSpecialRuntimeStartPath(specialRuntimeModule);

    console.log('[viewer-runtime-behavior-check] 检查通过');
    console.log('- OK | startViewerSession() 保持 viewing sheet / reset / draft / observer 启动顺序');
    console.log('- OK | generic-runtime.start() 保持 bind -> render 顺序');
    console.log('- OK | special-runtime 保持 create -> start 路径与 viewerEventManager owner 传递');
}

main().catch((error) => {
    console.error('[viewer-runtime-behavior-check] 检查失败：');
    console.error(error);
    process.exitCode = 1;
});
