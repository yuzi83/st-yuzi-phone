const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = process.cwd();

function toModuleUrl(relativePath) {
    return pathToFileURL(path.join(ROOT, relativePath)).href;
}

class FakePointerTarget {
    constructor(name = 'target') {
        this.name = name;
        this.dataset = {};
        this.style = {};
        this.listeners = new Map();
        this.capturedPointerIds = [];
        this.releasedPointerIds = [];
    }

    addEventListener(type, handler) {
        this.listeners.set(type, handler);
    }

    removeEventListener(type, handler) {
        const current = this.listeners.get(type);
        if (current === handler) {
            this.listeners.delete(type);
        }
    }

    setPointerCapture(pointerId) {
        this.capturedPointerIds.push(pointerId);
    }

    releasePointerCapture(pointerId) {
        this.releasedPointerIds.push(pointerId);
    }
}

class FakePhoneElement {
    constructor() {
        this.id = 'yuzi-phone-standalone';
        this.dataset = {};
        this.style = { left: '0px', top: '0px', width: '320px', height: '640px' };
        this.offsetWidth = 320;
        this.offsetHeight = 640;
        this._classes = new Set();
        this.classList = {
            add: (...tokens) => tokens.forEach((token) => this._classes.add(token)),
            remove: (...tokens) => tokens.forEach((token) => this._classes.delete(token)),
            contains: (token) => this._classes.has(token),
        };
        this.notch = new FakePointerTarget('notch');
        this.statusBar = new FakePointerTarget('statusBar');
        this.resizeHandle = new FakePointerTarget('resizeHandle');
        this.resizeHandle.getAttribute = (key) => (key === 'data-dir' ? 'se' : '');
    }

    getBoundingClientRect() {
        return {
            left: 100,
            top: 120,
            width: this.offsetWidth,
            height: this.offsetHeight,
        };
    }

    querySelector(selector) {
        if (selector === '.phone-shell') {
            return {
                querySelector: (innerSelector) => {
                    if (innerSelector === '.phone-notch') return this.notch;
                    if (innerSelector === '.phone-status-bar') return this.statusBar;
                    return null;
                },
            };
        }
        return null;
    }

    querySelectorAll(selector) {
        if (selector === '.yuzi-phone-resize') {
            return [this.resizeHandle];
        }
        return [];
    }
}

function createFakeDocument(phoneEl) {
    return {
        getElementById(id) {
            if (id === 'yuzi-phone-standalone') {
                return phoneEl;
            }
            return null;
        },
    };
}

function createFakeWindow() {
    return {
        innerWidth: 1280,
        innerHeight: 900,
        setTimeout: global.setTimeout,
        clearTimeout: global.clearTimeout,
        setInterval: global.setInterval,
        clearInterval: global.clearInterval,
        requestAnimationFrame(callback) {
            if (typeof callback === 'function') {
                callback(Date.now());
            }
            return 1;
        },
        cancelAnimationFrame() {},
    };
}

function createPointerEvent({ pointerId = 1, clientX = 0, clientY = 0, target = null } = {}) {
    return {
        pointerId,
        clientX,
        clientY,
        target,
        defaultPrevented: false,
        propagationStopped: false,
        preventDefault() {
            this.defaultPrevented = true;
        },
        stopPropagation() {
            this.propagationStopped = true;
        },
    };
}

function createRuntimeStub() {
    const listeners = [];
    const cleanups = [];

    return {
        listeners,
        cleanups,
        addEventListener(target, type, handler, options) {
            target.addEventListener(type, handler, options);
            const record = { target, type, handler, options };
            listeners.push(record);
            return () => {
                target.removeEventListener(type, handler, options);
            };
        },
        registerCleanup(cleanup) {
            cleanups.push(cleanup);
            return () => {
                const index = cleanups.indexOf(cleanup);
                if (index >= 0) cleanups.splice(index, 1);
            };
        },
        dispose() {
            while (cleanups.length > 0) {
                const cleanup = cleanups.shift();
                cleanup?.();
            }
            listeners.length = 0;
        },
    };
}

async function importModules() {
    const runtimeModule = await import(toModuleUrl('modules/window/runtime.js'));
    const dragModule = await import(toModuleUrl('modules/window/drag.js'));
    const resizeModule = await import(toModuleUrl('modules/window/resize.js'));
    return { runtimeModule, dragModule, resizeModule };
}

async function testRuntimeReset(runtimeModule) {
    const runtimeA = runtimeModule.getWindowInteractionRuntime();
    runtimeModule.destroyPhoneWindowInteractions();
    const runtimeB = runtimeModule.getWindowInteractionRuntime();

    assert.notEqual(runtimeA, runtimeB);
}

async function testDragBehavior(runtimeModule, dragModule) {
    const phoneEl = new FakePhoneElement();
    global.document = createFakeDocument(phoneEl);
    global.window = createFakeWindow();
    global.HTMLElement = FakePointerTarget;

    const runtimeStub = createRuntimeStub();
    const saveCalls = [];
    dragModule.__test__setDeps({
        getWindowInteractionRuntime: () => runtimeStub,
        constrainPosition: (x, y) => ({ x, y }),
        savePhoneSetting: (key, value) => saveCalls.push({ key, value }),
    });

    dragModule.initPhoneShellDrag();
    assert.equal(phoneEl.notch.dataset[runtimeModule.DRAG_BOUND_ATTR], '1');
    assert.equal(phoneEl.statusBar.dataset[runtimeModule.DRAG_BOUND_ATTR], '1');

    const firstListenerCount = runtimeStub.listeners.length;
    dragModule.initPhoneShellDrag();
    assert.equal(runtimeStub.listeners.length, firstListenerCount);

    const down = createPointerEvent({ pointerId: 5, clientX: 140, clientY: 170, target: phoneEl.notch });
    runtimeStub.listeners.find((item) => item.target === phoneEl.notch && item.type === 'pointerdown').handler(down);

    const move = createPointerEvent({ pointerId: 5, clientX: 200, clientY: 230, target: phoneEl.notch });
    runtimeStub.listeners.find((item) => item.target === phoneEl.notch && item.type === 'pointermove').handler(move);
    assert.equal(phoneEl.style.left, '160px');
    assert.equal(phoneEl.style.top, '180px');

    const up = createPointerEvent({ pointerId: 5, clientX: 200, clientY: 230, target: phoneEl.notch });
    runtimeStub.listeners.find((item) => item.target === phoneEl.notch && item.type === 'pointerup').handler(up);
    assert.deepEqual(saveCalls, [
        { key: 'phoneContainerX', value: 160 },
        { key: 'phoneContainerY', value: 180 },
    ]);

    runtimeStub.dispose();
    assert.equal(phoneEl.notch.dataset[runtimeModule.DRAG_BOUND_ATTR], undefined);
    assert.equal(phoneEl.statusBar.dataset[runtimeModule.DRAG_BOUND_ATTR], undefined);
}

async function testResizeBehavior(runtimeModule, resizeModule) {
    const phoneEl = new FakePhoneElement();
    global.document = createFakeDocument(phoneEl);
    global.window = createFakeWindow();
    global.HTMLElement = FakePointerTarget;

    const runtimeStub = createRuntimeStub();
    const saveCalls = [];
    resizeModule.__test__setDeps({
        getWindowInteractionRuntime: () => runtimeStub,
        constrainPosition: (x, y) => ({ x: x + 5, y: y + 6 }),
        savePhoneSetting: (key, value) => saveCalls.push({ key, value }),
    });

    resizeModule.initPhoneShellResize();
    assert.equal(phoneEl.resizeHandle.dataset[runtimeModule.RESIZE_BOUND_ATTR], '1');

    const firstListenerCount = runtimeStub.listeners.length;
    resizeModule.initPhoneShellResize();
    assert.equal(runtimeStub.listeners.length, firstListenerCount);

    const down = createPointerEvent({ pointerId: 7, clientX: 100, clientY: 120, target: phoneEl.resizeHandle });
    runtimeStub.listeners.find((item) => item.target === phoneEl.resizeHandle && item.type === 'pointerdown').handler(down);

    const move = createPointerEvent({ pointerId: 7, clientX: 180, clientY: 210, target: phoneEl.resizeHandle });
    runtimeStub.listeners.find((item) => item.target === phoneEl.resizeHandle && item.type === 'pointermove').handler(move);
    phoneEl.offsetWidth = 400;
    phoneEl.offsetHeight = 730;
    assert.equal(phoneEl.style.width, '400px');
    assert.equal(phoneEl.style.height, '730px');

    phoneEl.style.left = '30px';
    phoneEl.style.top = '40px';
    const up = createPointerEvent({ pointerId: 7, clientX: 180, clientY: 210, target: phoneEl.resizeHandle });
    runtimeStub.listeners.find((item) => item.target === phoneEl.resizeHandle && item.type === 'pointerup').handler(up);

    assert.deepEqual(saveCalls, [
        { key: 'phoneContainerX', value: 35 },
        { key: 'phoneContainerY', value: 46 },
        { key: 'phoneContainerWidth', value: 400 },
        { key: 'phoneContainerHeight', value: 730 },
    ]);

    runtimeStub.dispose();
    assert.equal(phoneEl.resizeHandle.dataset[runtimeModule.RESIZE_BOUND_ATTR], undefined);
}

async function main() {
    const { runtimeModule, dragModule, resizeModule } = await importModules();

    await testRuntimeReset(runtimeModule);
    await testDragBehavior(runtimeModule, dragModule);
    await testResizeBehavior(runtimeModule, resizeModule);

    console.log('[window-behavior-check] 检查通过');
    console.log('- OK | destroyPhoneWindowInteractions() 会重建 runtime scope');
    console.log('- OK | initPhoneShellDrag() 防止重复绑定并在拖拽结束后写入位置设置');
    console.log('- OK | initPhoneShellResize() 防止重复绑定并在缩放结束后写入尺寸设置');
    console.log('- OK | cleanup 后 drag/resize 绑定标记会被清理');
}

main().catch((error) => {
    console.error('[window-behavior-check] 检查失败：');
    console.error(error);
    process.exitCode = 1;
});
