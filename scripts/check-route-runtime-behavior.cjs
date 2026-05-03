const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = process.cwd();

function toModuleUrl(relativePath) {
    return pathToFileURL(path.join(ROOT, relativePath)).href;
}

function createRouteRuntimeState(overrides = {}) {
    return {
        isDestroying: false,
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
    return { routeRuntimeModule, lifecycleModule };
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
    const { routeRuntimeModule, lifecycleModule } = await importModules();

    await testRouteRuntimeSkip(routeRuntimeModule);
    await testCurrentAndHomeRouteRequests(routeRuntimeModule);
    await testFailedRouteRollback(routeRuntimeModule);
    await testLifecycleActivationRoutePaths(lifecycleModule);

    console.log('[route-runtime-behavior-check] 检查通过');
    console.log('- OK | requestPhoneRouteRender() 在 destroying 时命中 skip 分支');
    console.log('- OK | requestCurrentPhoneRouteRender() / requestHomePhoneRouteRender() 保持正确 route 分流');
    console.log('- OK | requestPhoneRouteRender() 在页面渲染失败时回退 currentRoute 与历史栈');
    console.log('- OK | requestPhoneRuntimeActivationRoute() 保持 disabled/home/current/explicit 路径语义');
}

main().catch((error) => {
    console.error('[route-runtime-behavior-check] 检查失败：');
    console.error(error);
    process.exitCode = 1;
});
