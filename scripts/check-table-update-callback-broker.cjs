const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = process.cwd();
const CALLBACKS_PATH = path.join(ROOT, 'modules/phone-core/callbacks.js');
const STATE_PATH = path.join(ROOT, 'modules/phone-core/state.js');

function createFakeApi(name) {
    const callbacks = new Set();
    const registerCalls = [];
    const unregisterCalls = [];

    return {
        name,
        registerCalls,
        unregisterCalls,
        registerTableUpdateCallback(callback) {
            registerCalls.push(callback);
            callbacks.add(callback);
        },
        unregisterTableUpdateCallback(callback) {
            unregisterCalls.push(callback);
            callbacks.delete(callback);
        },
        emit(payload) {
            Array.from(callbacks).forEach(callback => callback(payload));
        },
        has(callback) {
            return callbacks.has(callback);
        },
    };
}

async function loadFreshCallbacks(testName, initialApi) {
    const fakeWindow = { AutoCardUpdaterAPI: initialApi };
    fakeWindow.parent = fakeWindow;
    global.window = fakeWindow;

    const stateModule = await import(pathToFileURL(STATE_PATH).href);
    stateModule.resetPhoneCoreState();
    const callbacksModule = await import(
        `${pathToFileURL(CALLBACKS_PATH).href}?callback-broker=${encodeURIComponent(testName)}-${Date.now()}-${Math.random()}`
    );

    return { callbacksModule, stateModule, fakeWindow };
}

async function checkApiOwnerRebind() {
    const apiA = createFakeApi('A');
    const apiB = createFakeApi('B');
    const { callbacksModule, fakeWindow } = await loadFreshCallbacks('api-owner-rebind', apiA);
    const receivedByFirst = [];
    const receivedBySecond = [];

    const disposeFirst = callbacksModule.subscribeTableUpdate(payload => receivedByFirst.push(payload));
    assert.strictEqual(typeof disposeFirst, 'function', 'API A 上的首个订阅必须成功');
    assert.strictEqual(apiA.registerCalls.length, 1, '首个订阅必须在 API A 注册一个 native callback');
    const apiANativeCallback = apiA.registerCalls[0];

    fakeWindow.AutoCardUpdaterAPI = apiB;
    const disposeSecond = callbacksModule.subscribeTableUpdate(payload => receivedBySecond.push(payload));

    assert.strictEqual(typeof disposeSecond, 'function', 'API 切换后的订阅必须成功');
    assert.strictEqual(apiA.unregisterCalls.length, 1, '切换到 API B 时必须先从 API A 注销');
    assert.strictEqual(apiA.unregisterCalls[0], apiANativeCallback, 'API A 必须注销它真实拥有的 native callback');
    assert.strictEqual(apiB.registerCalls.length, 1, '切换后必须在 API B 重新注册 native callback');

    apiA.emit({ owner: 'A-after-rebind' });
    apiB.emit({ owner: 'B-after-rebind' });
    assert.deepStrictEqual(receivedByFirst, [{ owner: 'B-after-rebind' }], '既有订阅者必须跟随 broker 在 API B 继续接收');
    assert.deepStrictEqual(receivedBySecond, [{ owner: 'B-after-rebind' }], '新订阅者必须从 API B 接收');

    disposeSecond();
    disposeFirst();
    assert.strictEqual(apiB.unregisterCalls.length, 0, '单个 subscriber disposer 不得接管共享 native callback 生命周期');
    callbacksModule.unregisterTableUpdateListener();
    assert.strictEqual(apiB.unregisterCalls.length, 1, '无订阅者时公共注销入口必须从当前真实 owner API B 注销');
    assert.strictEqual(apiB.unregisterCalls[0], apiB.registerCalls[0], 'API B 必须注销自己注册的 native callback');
}

async function checkExplicitEnsureKeepsLongLivedSubscribersCurrent() {
    const apiA = createFakeApi('ensure-A');
    const apiB = createFakeApi('ensure-B');
    const { callbacksModule, fakeWindow } = await loadFreshCallbacks('explicit-ensure-owner-rebind', apiA);
    const received = [];

    const dispose = callbacksModule.subscribeTableUpdate(payload => received.push(payload));
    assert.strictEqual(typeof dispose, 'function', '长期订阅必须先在 API A 注册成功');
    const apiANativeCallback = apiA.registerCalls[0];

    fakeWindow.AutoCardUpdaterAPI = apiB;
    assert.strictEqual(
        callbacksModule.ensureTableUpdateListenerCurrent(),
        true,
        '没有新增 subscriber 时，显式 ensure 必须把长期订阅从 API A 重绑到 API B',
    );
    assert.strictEqual(apiA.unregisterCalls.length, 1, '显式 ensure 必须从真实 owner API A 注销');
    assert.strictEqual(apiA.unregisterCalls[0], apiANativeCallback, '显式 ensure 必须注销 API A 实际拥有的 callback');
    assert.strictEqual(apiB.registerCalls.length, 1, '显式 ensure 必须在 API B 注册 native callback');

    apiA.emit({ owner: 'A-after-explicit-ensure' });
    apiB.emit({ owner: 'B-after-explicit-ensure' });
    assert.deepStrictEqual(
        received,
        [{ owner: 'B-after-explicit-ensure' }],
        '原有长期 subscriber 必须在不重新 subscribe 的情况下从 API B 收到通知',
    );

    assert.strictEqual(
        callbacksModule.ensureTableUpdateListenerCurrent(),
        true,
        '当前 API owner 未变化时 ensure 应保持成功',
    );
    assert.strictEqual(apiA.unregisterCalls.length, 1, '当前 API 未变化时不得重复注销');
    assert.strictEqual(apiB.registerCalls.length, 1, '当前 API 未变化时不得重复注册');

    dispose();
    callbacksModule.unregisterTableUpdateListener();
    assert.strictEqual(apiB.unregisterCalls.length, 1, 'ensure 重绑后 stop/unregister 必须使用真实 owner API B');
    assert.strictEqual(apiB.unregisterCalls[0], apiB.registerCalls[0], 'API B 必须注销自己实际注册的 callback');
}

async function checkExplicitEnsureDoesNothingWithoutSubscribers() {
    const api = createFakeApi('ensure-empty');
    const { callbacksModule } = await loadFreshCallbacks('explicit-ensure-empty', api);

    assert.strictEqual(
        callbacksModule.ensureTableUpdateListenerCurrent(),
        false,
        '没有 subscriber 时显式 ensure 必须返回 false',
    );
    assert.strictEqual(api.registerCalls.length, 0, '没有 subscriber 时显式 ensure 不得注册 native callback');
    assert.strictEqual(api.unregisterCalls.length, 0, '没有 subscriber 时显式 ensure 不得触碰 owner 生命周期');
}

async function checkExplicitEnsureBestEffortWithoutOldUnregister() {
    const apiA = createFakeApi('ensure-no-unregister-A');
    const apiB = createFakeApi('ensure-no-unregister-B');
    delete apiA.unregisterTableUpdateCallback;
    const { callbacksModule, fakeWindow } = await loadFreshCallbacks('explicit-ensure-no-old-unregister', apiA);
    const received = [];

    const dispose = callbacksModule.subscribeTableUpdate(payload => received.push(payload));
    assert.strictEqual(typeof dispose, 'function', '缺少 unregister 的旧 API A 仍必须允许初始订阅');

    fakeWindow.AutoCardUpdaterAPI = apiB;
    assert.strictEqual(
        callbacksModule.ensureTableUpdateListenerCurrent(),
        true,
        '旧 owner 没有 unregister 能力时，ensure 必须 best-effort 清理本地 owner 并允许 API B 注册',
    );
    assert.strictEqual(apiB.registerCalls.length, 1, '旧 owner 无法注销时仍必须在 API B 完成重绑');

    apiB.emit({ owner: 'B-after-best-effort' });
    assert.deepStrictEqual(received, [{ owner: 'B-after-best-effort' }], '长期 subscriber 必须继续从 API B 收到通知');

    dispose();
    callbacksModule.unregisterTableUpdateListener();
    assert.strictEqual(apiB.unregisterCalls.length, 1, 'best-effort 重绑后的 stop/unregister 必须使用真实 owner API B');
    assert.strictEqual(apiB.unregisterCalls[0], apiB.registerCalls[0], 'API B 必须注销自己实际注册的 callback');
}

async function checkSingleDisposerIsolation() {
    const api = createFakeApi('single-disposer');
    const { callbacksModule } = await loadFreshCallbacks('single-disposer', api);
    const received = { first: 0, second: 0 };

    const disposeFirst = callbacksModule.subscribeTableUpdate(() => { received.first += 1; });
    const disposeSecond = callbacksModule.subscribeTableUpdate(() => { received.second += 1; });
    api.emit({ sequence: 1 });
    disposeFirst();
    api.emit({ sequence: 2 });

    assert.deepStrictEqual(received, { first: 1, second: 2 }, '单个 disposer 只能移除自己的订阅');
    assert.strictEqual(api.unregisterCalls.length, 0, '仍有订阅者时不得释放 native callback');

    disposeSecond();
    assert.strictEqual(api.unregisterCalls.length, 0, 'subscriber disposer 只负责移除自己，不得释放共享 native callback');
    callbacksModule.unregisterTableUpdateListener();
    assert.strictEqual(api.unregisterCalls.length, 1, '无订阅者时公共注销入口必须释放 native callback');
}

async function checkExplicitUnregisterUsesOwnerApi() {
    const apiA = createFakeApi('owner-A');
    const apiB = createFakeApi('current-B');
    const { callbacksModule, fakeWindow } = await loadFreshCallbacks('explicit-owner-unregister', apiA);

    assert.strictEqual(
        callbacksModule.registerTableUpdateListener(() => {}),
        true,
        '兼容 listener 必须先在 API A 注册成功',
    );
    const apiANativeCallback = apiA.registerCalls[0];
    fakeWindow.AutoCardUpdaterAPI = apiB;

    callbacksModule.unregisterTableUpdateListener();

    assert.strictEqual(apiA.unregisterCalls.length, 1, '公共注销入口必须调用真实 owner API A');
    assert.strictEqual(apiA.unregisterCalls[0], apiANativeCallback, 'API A 必须收到它实际注册的 native callback');
    assert.strictEqual(apiB.unregisterCalls.length, 0, '公共注销入口不得把 API A 的 callback 交给当前全局 API B');
}

async function checkLegacyListenerUnregisterIsolation() {
    const api = createFakeApi('legacy-listener');
    const { callbacksModule } = await loadFreshCallbacks('legacy-listener', api);
    const received = { review: 0, overlay: 0, legacy: 0 };

    const disposeReview = callbacksModule.subscribeTableUpdate(() => { received.review += 1; });
    const disposeOverlay = callbacksModule.subscribeTableUpdate(() => { received.overlay += 1; });
    assert.strictEqual(
        callbacksModule.registerTableUpdateListener(() => { received.legacy += 1; }),
        true,
        '兼容 registerTableUpdateListener 必须注册成功',
    );

    api.emit({ sequence: 1 });
    callbacksModule.unregisterTableUpdateListener();
    assert.strictEqual(api.unregisterCalls.length, 0, '仍有审核/浮层订阅时不得注销共享 native callback');

    api.emit({ sequence: 2 });
    assert.deepStrictEqual(
        received,
        { review: 2, overlay: 2, legacy: 1 },
        'unregisterTableUpdateListener 只能移除自己的兼容订阅，不得清空审核或浮层订阅',
    );

    disposeReview();
    assert.strictEqual(api.unregisterCalls.length, 0, '浮层订阅仍存在时不得释放 native callback');
    disposeOverlay();
    assert.strictEqual(api.unregisterCalls.length, 0, '审核/浮层 disposer 不得直接释放共享 native callback');
    callbacksModule.unregisterTableUpdateListener();
    assert.strictEqual(api.unregisterCalls.length, 1, '所有订阅者都移除后必须释放 native callback');
}

async function checkSubscriberFailureIsolation() {
    const api = createFakeApi('subscriber-failure');
    const { callbacksModule } = await loadFreshCallbacks('subscriber-failure', api);
    let healthyCalls = 0;

    const disposeThrowing = callbacksModule.subscribeTableUpdate(() => {
        throw new Error('subscriber boom');
    });
    const disposeHealthy = callbacksModule.subscribeTableUpdate(() => {
        healthyCalls += 1;
    });

    assert.doesNotThrow(() => api.emit({ sequence: 1 }), '单个订阅者异常不得逃出 broker');
    assert.strictEqual(healthyCalls, 1, '单个订阅者异常不得阻断其他订阅者');

    disposeThrowing();
    disposeHealthy();
}

async function main() {
    const previousWindow = global.window;
    const checks = [
        ['API owner 切换与真实 owner 注销', checkApiOwnerRebind],
        ['显式 ensure 保持长期订阅 owner 最新', checkExplicitEnsureKeepsLongLivedSubscribersCurrent],
        ['显式 ensure 无 subscriber 时不注册', checkExplicitEnsureDoesNothingWithoutSubscribers],
        ['显式 ensure 兼容旧 owner 无 unregister', checkExplicitEnsureBestEffortWithoutOldUnregister],
        ['单个 disposer 隔离', checkSingleDisposerIsolation],
        ['显式注销使用真实 owner API', checkExplicitUnregisterUsesOwnerApi],
        ['兼容 listener 注销隔离', checkLegacyListenerUnregisterIsolation],
        ['订阅者异常隔离', checkSubscriberFailureIsolation],
    ];
    const failures = [];

    try {
        for (const [name, check] of checks) {
            try {
                await check();
                console.log(`✓ ${name}`);
            } catch (error) {
                failures.push({ name, error });
                console.error(`✗ ${name}`);
                console.error(error);
            }
        }
    } finally {
        if (previousWindow === undefined) {
            delete global.window;
        } else {
            global.window = previousWindow;
        }
    }

    if (failures.length > 0) {
        process.exitCode = 1;
        return;
    }

    console.log('[table-update-callback-broker] passed');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
