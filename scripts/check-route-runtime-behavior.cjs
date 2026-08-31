const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = process.cwd();

function toModuleUrl(relativePath) {
    return pathToFileURL(path.join(ROOT, relativePath)).href;
}

function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function createRouteRuntimeState(overrides = {}) {
    return {
        isDestroying: false,
        isPhoneActive: true,
        currentRoute: 'home',
        routeHistory: [],
        routeRenderToken: 0,
        routeRenderCleanup: null,
        routeRenderRegistered: false,
        ...overrides,
    };
}

async function importModules() {
    const routeRuntimeModule = await import(toModuleUrl('modules/phone-core/route-runtime.js'));
    const lifecycleModule = await import(toModuleUrl('modules/phone-core/lifecycle.js'));
    const routingModule = await import(toModuleUrl('modules/phone-core/routing.js'));
    const stateModule = await import(toModuleUrl('modules/phone-core/state.js'));
    return { routeRuntimeModule, lifecycleModule, routingModule, stateModule };
}

async function testRouteRuntimeSkip(routeRuntimeModule) {
    const state = createRouteRuntimeState({ isDestroying: true, routeRenderToken: 7 });
    let renderCalls = 0;

    routeRuntimeModule.__test__setRouteRuntimeDeps({
        getPhoneCoreState: () => state,
        getCurrentRoute: () => 'settings',
        renderPhoneRoute: async () => {
            renderCalls += 1;
            return true;
        },
    });

    const result = await routeRuntimeModule.requestPhoneRouteRender(undefined, { isBack: true });
    assert.equal(result, false);
    assert.equal(renderCalls, 0);
    assert.equal(state.routeRenderToken, 7);
}

async function testInactiveRouteRequestsDefer(routeRuntimeModule, stateModule) {
    const state = createRouteRuntimeState({
        isPhoneActive: false,
        routeRenderToken: 7,
    });
    let renderCalls = 0;

    routeRuntimeModule.__test__setRouteRuntimeDeps({
        getPhoneCoreState: () => state,
        getCurrentRoute: () => 'settings',
        renderPhoneRoute: async () => {
            renderCalls += 1;
            return true;
        },
    });

    assert.equal(
        await routeRuntimeModule.requestCurrentPhoneRouteRender({ reason: 'inactive-route' }),
        true,
        '隐藏状态把路由刷新延后，而不是视作失败',
    );
    assert.equal(renderCalls, 0, '隐藏状态不进入实际 route renderer');
    assert.equal(state.routeRenderToken, 7, '隐藏状态不创建新的渲染 token');
    assert.equal(state.pendingRouteRefresh, true, '隐藏状态记录一次待刷新');
    assert.equal(state.pendingRouteRefreshReason, 'inactive-route');
    assert.equal(stateModule.consumePhoneRouteRefreshPending(state), true, '重新显示时可消费待刷新标记');
    assert.equal(state.pendingRouteRefresh, false, '消费后清空待刷新标记');
}

async function testInactiveRouteCompletionDefersWithoutRollback(routeRuntimeModule) {
    const state = createRouteRuntimeState({
        currentRoute: 'app:message',
        routeHistory: [{ route: 'settings', timestamp: 1 }],
    });

    routeRuntimeModule.__test__setRouteRuntimeDeps({
        getPhoneCoreState: () => state,
        getCurrentRoute: () => state.currentRoute,
        renderPhoneRoute: async () => {
            state.isPhoneActive = false;
            return false;
        },
    });

    assert.equal(
        await routeRuntimeModule.requestPhoneRouteRender('app:message', {
            fromRoute: 'settings',
            pushedHistory: true,
        }),
        true,
        '关闭发生在异步渲染中时保留目标路由，等待下次打开再渲染',
    );
    assert.equal(state.currentRoute, 'app:message', '隐藏不触发 route 回滚');
    assert.deepEqual(state.routeHistory, [{ route: 'settings', timestamp: 1 }]);
    assert.equal(state.pendingRouteRefresh, true, '异步渲染中隐藏同样会标记待刷新');
}

async function testCurrentAndHomeRouteRequests(routeRuntimeModule) {
    const calls = [];
    const state = createRouteRuntimeState();

    routeRuntimeModule.__test__setRouteRuntimeDeps({
        getPhoneCoreState: () => state,
        getCurrentRoute: () => 'settings',
        renderPhoneRoute: async (route, opts) => {
            calls.push({ route, opts });
            return true;
        },
    });

    await routeRuntimeModule.requestCurrentPhoneRouteRender();
    await routeRuntimeModule.requestHomePhoneRouteRender({ isBack: true });

    assert.equal(calls[0].route, 'settings');
    assert.equal(calls[0].opts.requestMode, 'current');
    assert.equal(calls[0].opts.renderToken, 1);

    assert.equal(calls[1].route, 'home');
    assert.equal(calls[1].opts.requestMode, 'home');
    assert.equal(calls[1].opts.isBack, true);
    assert.equal(calls[1].opts.renderToken, 2);
}

async function testFailedRouteRollback(routeRuntimeModule) {
    const state = createRouteRuntimeState({
        currentRoute: 'app:message',
        routeHistory: [{ route: 'settings', timestamp: 1 }],
    });

    routeRuntimeModule.__test__setRouteRuntimeDeps({
        getPhoneCoreState: () => state,
        getCurrentRoute: () => 'app:message',
        renderPhoneRoute: async () => false,
    });

    const result = await routeRuntimeModule.requestPhoneRouteRender('app:message', {
        fromRoute: 'settings',
        pushedHistory: true,
    });

    assert.equal(result, false);
    assert.equal(state.currentRoute, 'settings');
    assert.equal(state.routeHistory.length, 0);
    assert.equal(state.routeRenderToken, 1);
}

async function testRoutingNavigationMetadata(routingModule, stateModule) {
    const state = stateModule.getPhoneCoreState();
    const events = [];
    state.currentRoute = 'settings';
    state.routeHistory = [];
    state.onRouteChangeCallbacks = [(route, opts) => events.push({ route, opts })];

    routingModule.navigateTo('fusion');
    assert.equal(events[0].opts.navigationMode, 'push');
    assert.equal(events[0].opts.fromRoute, 'settings');
    assert.equal(events[0].opts.pushedHistory, true);
    assert.equal(events[0].opts.isBack, false);

    const historyBeforeReplace = state.routeHistory.map(entry => ({ ...entry }));
    routingModule.replaceCurrentRoute('variable-manager');
    assert.equal(events[1].opts.navigationMode, 'replace');
    assert.equal(events[1].opts.fromRoute, 'fusion');
    assert.equal(events[1].opts.pushedHistory, false);
    assert.deepEqual(state.routeHistory, historyBeforeReplace);

    state.currentRoute = 'table:sheet_c';
    state.routeHistory = [{ route: 'app:sheet_a', timestamp: 2 }];
    routingModule.navigateToReplacingHistoryTop('table-generic:sheet_c');
    assert.equal(events[2].opts.navigationMode, 'push-replace-history-top');
    assert.equal(events[2].opts.fromRoute, 'table:sheet_c');
    assert.equal(events[2].opts.pushedHistory, true);
    assert.equal(events[2].opts.displacedHistoryEntry.route, 'app:sheet_a');
    assert.deepEqual(state.routeHistory.map(entry => entry.route), ['table:sheet_c']);

    routingModule.navigateBack();
    assert.equal(events[3].opts.navigationMode, 'back');
    assert.equal(events[3].opts.fromRoute, 'table-generic:sheet_c');
    assert.equal(events[3].opts.pushedHistory, false);
    assert.equal(events[3].opts.isBack, true);
    assert.equal(events[3].opts.poppedHistoryEntry.route, 'table:sheet_c');
    assert.equal(state.currentRoute, 'table:sheet_c');

    state.currentRoute = 'table:review_theater';
    state.routeHistory = [{ route: 'table-update-review', timestamp: 3 }];
    routingModule.navigateTo('table-generic:review_theater');
    assert.equal(events[4].opts.navigationMode, 'push');
    assert.deepEqual(state.routeHistory.map(entry => entry.route), ['table-update-review', 'table:review_theater']);
}

async function testReplaceAndBackFailureRollback(routeRuntimeModule) {
    const historyEntry = { route: 'review', timestamp: 1 };
    const replaceState = createRouteRuntimeState({
        currentRoute: 'table:sheet_b',
        routeHistory: [historyEntry],
    });
    routeRuntimeModule.__test__setRouteRuntimeDeps({
        getPhoneCoreState: () => replaceState,
        getCurrentRoute: () => replaceState.currentRoute,
        renderPhoneRoute: async () => false,
    });
    await routeRuntimeModule.requestPhoneRouteRender('table:sheet_b', {
        navigationMode: 'replace',
        fromRoute: 'table:sheet_a',
        pushedHistory: false,
    });
    assert.equal(replaceState.currentRoute, 'table:sheet_a');
    assert.deepEqual(replaceState.routeHistory, [historyEntry]);

    const poppedEntry = { route: 'review', timestamp: 2 };
    const backState = createRouteRuntimeState({
        currentRoute: 'review',
        routeHistory: [],
    });
    routeRuntimeModule.__test__setRouteRuntimeDeps({
        getPhoneCoreState: () => backState,
        getCurrentRoute: () => backState.currentRoute,
        renderPhoneRoute: async () => false,
    });
    await routeRuntimeModule.requestPhoneRouteRender('review', {
        navigationMode: 'back',
        fromRoute: 'table:sheet_a',
        pushedHistory: false,
        poppedHistoryEntry: poppedEntry,
        isBack: true,
    });
    assert.equal(backState.currentRoute, 'table:sheet_a');
    assert.deepEqual(backState.routeHistory, [poppedEntry]);

    const displacedEntry = { route: 'app:sheet_a', timestamp: 3 };
    const compressedPushState = createRouteRuntimeState({
        currentRoute: 'table-generic:sheet_c',
        routeHistory: [{ route: 'table:sheet_c', timestamp: 4 }],
    });
    routeRuntimeModule.__test__setRouteRuntimeDeps({
        getPhoneCoreState: () => compressedPushState,
        getCurrentRoute: () => compressedPushState.currentRoute,
        renderPhoneRoute: async () => false,
    });
    await routeRuntimeModule.requestPhoneRouteRender('table-generic:sheet_c', {
        navigationMode: 'push-replace-history-top',
        fromRoute: 'table:sheet_c',
        pushedHistory: true,
        displacedHistoryEntry: displacedEntry,
    });
    assert.equal(compressedPushState.currentRoute, 'table:sheet_c');
    assert.deepEqual(compressedPushState.routeHistory, [displacedEntry], '压缩编辑失败必须原子恢复被替换的旧浏览锚点');
}

async function testStaleFailuresDoNotRollback(routeRuntimeModule) {
    const state = createRouteRuntimeState({ currentRoute: 'table:sheet_b' });
    const pending = [];
    routeRuntimeModule.__test__setRouteRuntimeDeps({
        getPhoneCoreState: () => state,
        getCurrentRoute: () => state.currentRoute,
        renderPhoneRoute: () => {
            const deferred = createDeferred();
            pending.push(deferred);
            return deferred.promise;
        },
    });

    const oldB = routeRuntimeModule.requestPhoneRouteRender('table:sheet_b', {
        navigationMode: 'replace',
        fromRoute: 'table:sheet_a',
    });
    state.currentRoute = 'table:sheet_c';
    const middleC = routeRuntimeModule.requestPhoneRouteRender('table:sheet_c', {
        navigationMode: 'replace',
        fromRoute: 'table:sheet_b',
    });
    state.currentRoute = 'table:sheet_b';
    const latestB = routeRuntimeModule.requestPhoneRouteRender('table:sheet_b', {
        navigationMode: 'replace',
        fromRoute: 'table:sheet_c',
    });

    state.routeHistory = [{ route: 'table:latest', timestamp: 5 }];
    pending[0].resolve(false);
    assert.equal(await oldB, false);
    assert.equal(state.currentRoute, 'table:sheet_b', 'ABA 旧 B 失败不得回滚最新 B');
    assert.deepEqual(state.routeHistory.map(entry => entry.route), ['table:latest'], '旧 token 失败不得改写最新 history');

    pending[1].reject(new Error('stale C reject'));
    assert.equal(await middleC, false);
    assert.equal(state.currentRoute, 'table:sheet_b', '旧 route reject 不得回滚当前 route');

    pending[2].resolve(true);
    assert.equal(await latestB, true);
    assert.equal(state.routeRenderToken, 3);
}

async function testSameRouteOverlapAndLatestFailure(routeRuntimeModule) {
    const state = createRouteRuntimeState({ currentRoute: 'table:sheet_b' });
    const pending = [];
    routeRuntimeModule.__test__setRouteRuntimeDeps({
        getPhoneCoreState: () => state,
        getCurrentRoute: () => state.currentRoute,
        renderPhoneRoute: () => {
            const deferred = createDeferred();
            pending.push(deferred);
            return deferred.promise;
        },
    });

    const first = routeRuntimeModule.requestPhoneRouteRender('table:sheet_b', {
        navigationMode: 'replace',
        fromRoute: 'table:sheet_a',
    });
    const second = routeRuntimeModule.requestPhoneRouteRender('table:sheet_b', {
        navigationMode: 'replace',
        fromRoute: 'table:sheet_c',
    });
    pending[0].resolve(false);
    assert.equal(await first, false);
    assert.equal(state.currentRoute, 'table:sheet_b', '同 route 旧请求失败不得回滚新请求');

    pending[1].resolve(false);
    assert.equal(await second, false);
    assert.equal(state.currentRoute, 'table:sheet_c', '最新 token 失败必须恢复其 fromRoute');
}

async function testLifecycleActivationRoutePaths(lifecycleModule) {
    const calls = [];

    lifecycleModule.__test__setLifecycleRouteRequestDeps({
        requestPhoneRouteRender: (route, opts) => {
            calls.push({ kind: 'explicit', route, opts });
            return Promise.resolve(true);
        },
        requestCurrentPhoneRouteRender: (opts) => {
            calls.push({ kind: 'current', opts });
            return Promise.resolve(true);
        },
        requestHomePhoneRouteRender: (opts) => {
            calls.push({ kind: 'home', opts });
            return Promise.resolve(true);
        },
    });

    assert.equal(lifecycleModule.__test__requestPhoneRuntimeActivationRoute({ requestRoute: false }), false);
    assert.equal(calls.length, 0);

    assert.equal(
        lifecycleModule.__test__requestPhoneRuntimeActivationRoute({ routeMode: 'home', requestOptions: { isBack: true } }),
        'home',
    );
    assert.deepEqual(calls[0], { kind: 'home', opts: { isBack: true } });

    assert.equal(
        lifecycleModule.__test__requestPhoneRuntimeActivationRoute({ route: 'fusion', requestOptions: { source: 'manual' } }),
        'explicit',
    );
    assert.equal(calls[1].kind, 'explicit');
    assert.equal(calls[1].route, 'fusion');
    assert.equal(calls[1].opts.requestMode, 'explicit');
    assert.equal(calls[1].opts.source, 'manual');

    assert.equal(
        lifecycleModule.__test__requestPhoneRuntimeActivationRoute({ requestOptions: { source: 'activate' } }),
        'current',
    );
    assert.deepEqual(calls[2], { kind: 'current', opts: { source: 'activate' } });
}

async function main() {
    const { routeRuntimeModule, lifecycleModule, routingModule, stateModule } = await importModules();

    await testRouteRuntimeSkip(routeRuntimeModule);
    await testInactiveRouteRequestsDefer(routeRuntimeModule, stateModule);
    await testInactiveRouteCompletionDefersWithoutRollback(routeRuntimeModule);
    await testCurrentAndHomeRouteRequests(routeRuntimeModule);
    await testFailedRouteRollback(routeRuntimeModule);
    await testRoutingNavigationMetadata(routingModule, stateModule);
    await testReplaceAndBackFailureRollback(routeRuntimeModule);
    await testStaleFailuresDoNotRollback(routeRuntimeModule);
    await testSameRouteOverlapAndLatestFailure(routeRuntimeModule);
    await testLifecycleActivationRoutePaths(lifecycleModule);

    console.log('[route-runtime-behavior-check] 检查通过');
    console.log('- OK | requestPhoneRouteRender() 在 destroying 时命中 skip 分支');
    console.log('- OK | requestCurrentPhoneRouteRender() / requestHomePhoneRouteRender() 保持正确 route 分流');
    console.log('- OK | requestPhoneRouteRender() 在页面渲染失败时回退 currentRoute 与历史栈');
    console.log('- OK | push / replace / back / history-top replacement 发布稳定导航元数据');
    console.log('- OK | replace / back / 压缩编辑失败分别保持或原子恢复 history');
    console.log('- OK | ABA、不同 route reject、同 route overlap 的旧 token 不得误回滚');
    console.log('- OK | 隐藏状态延后 route 渲染，重新显示时仅补一次');
    console.log('- OK | requestPhoneRuntimeActivationRoute() 保持 disabled/home/current/explicit 路径语义');
}

main().catch((error) => {
    console.error('[route-runtime-behavior-check] 检查失败：');
    console.error(error);
    process.exitCode = 1;
});
