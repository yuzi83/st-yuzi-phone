const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = (file) => import(pathToFileURL(path.resolve(file)).href);

function bootstrap(scopeId = 'scope-a') {
    return { ok: true, context: { scopeId } };
}

function createAppFactory(records) {
    return (options) => {
        const app = {
            options,
            mounted: null,
            destroyed: 0,
            mount(page) { this.mounted = page; return this; },
            async refresh() {},
            destroy() { this.destroyed += 1; },
        };
        records.push(app);
        return app;
    };
}

function nextTurn() {
    return new Promise((resolve) => setImmediate(resolve));
}

async function main() {
    const { __test__loadRouteRenderer } = await load('modules/phone-core/route-renderer.js');
    const { disposeRoutePage } = await load('modules/phone-core/route-page-lifecycle.js');

    const records = [];
    const shell = { toasts: [], showToast(message) { this.toasts.push(message); } };
    const facade = {
        query: { async bootstrap() { return bootstrap(); } },
        subscribe() { return () => {}; },
    };
    const routeDeps = {
        loadQQRouteDependencies: async () => ({
            createQQApp: createAppFactory(records),
            createQQRouteLifecycle: (options) => ({
                async mount() {
                    const app = options.createApp({ facade: options.facade, shell: options.shell });
                    app.mount(options.page);
                    return true;
                },
                destroy() { records.at(-1)?.destroy(); },
            }),
            getQQV2Facade: () => facade,
        }),
        getQQRouteShell: () => shell,
    };

    const rootRoute = await __test__loadRouteRenderer('qq', 401, routeDeps);
    assert.equal(rootRoute.routeType, 'qq');
    const rootPage = {};
    await rootRoute.render(rootPage);
    await nextTurn();
    assert.equal(records.length, 1);
    assert.equal(records[0].mounted, rootPage);
    assert.equal(records[0].options.facade, facade);
    assert.equal(records[0].options.shell, shell);
    disposeRoutePage(rootPage);
    assert.equal(records[0].destroyed, 1, 'route page cleanup destroys the QQ root');

    const nestedRoute = await __test__loadRouteRenderer('qq:old-chat-state-must-not-restore', 402, routeDeps);
    const nestedPage = {};
    await nestedRoute.render(nestedPage);
    await nextTurn();
    assert.equal(records.length, 2, 'every qq:* launch receives a new QQ root instance');
    assert.equal(records[1].mounted, nestedPage);

    let blanked = 0;
    const missingFacadeRoute = await __test__loadRouteRenderer('qq', 403, {
        ...routeDeps,
        loadQQRouteDependencies: async () => ({
            createQQApp: createAppFactory([]),
            createQQRouteLifecycle: () => { throw new Error('must not create without a Facade'); },
            getQQV2Facade: () => null,
        }),
    });
    await missingFacadeRoute.render({ replaceChildren() { blanked += 1; } });
    await nextTurn();
    assert.equal(blanked, 1, 'missing Facade keeps the QQ shell content blank');
    assert.equal(shell.toasts.length, 1, 'missing Facade reports one shell toast');

    const failedShell = { toasts: [], showToast(message) { this.toasts.push(message); } };
    const loadFailure = await __test__loadRouteRenderer('qq', 404, {
        loadQQRouteDependencies: async () => { throw new Error('simulated dynamic import failure'); },
        getQQRouteShell: () => failedShell,
    });
    let failedBlanked = 0;
    await loadFailure.render({ replaceChildren() { failedBlanked += 1; } });
    await nextTurn();
    assert.equal(loadFailure.routeType, 'qq');
    assert.equal(failedBlanked, 1, 'dynamic loader failures keep the QQ shell content blank');
    assert.equal(failedShell.toasts.length, 1, 'dynamic loader failures produce one safe toast');

    let resolveDelayedDependencies;
    let delayedLifecycleCreated = 0;
    const delayedRoute = await __test__loadRouteRenderer('qq', 405, {
        ...routeDeps,
        loadQQRouteDependencies: () => new Promise((resolve) => {
            resolveDelayedDependencies = resolve;
        }),
    });
    const delayedPage = {};
    assert.equal(delayedRoute.render(delayedPage), undefined, 'QQ 路由不得等待动态模块和 bootstrap 才返回');
    disposeRoutePage(delayedPage);
    resolveDelayedDependencies({
        createQQApp: createAppFactory([]),
        createQQRouteLifecycle: () => {
            delayedLifecycleCreated += 1;
            return { async mount() {}, destroy() {} };
        },
        getQQV2Facade: () => facade,
    });
    await nextTurn();
    assert.equal(delayedLifecycleCreated, 0, '路由页提前销毁后不得再挂载迟到的 QQ App');

    const fs = require('node:fs');
    const routeSource = fs.readFileSync(path.resolve('modules/phone-core/route-renderer.js'), 'utf8');
    assert.match(routeSource, /dataset\.qqRouteSkeleton/u,
        'QQ 路由必须先提交可见骨架');
    assert.match(routeSource, /void \(async \(\) => \{[\s\S]*loadQQRouteDependencies/u,
        'QQ 动态依赖与 bootstrap 必须在骨架之后异步加载');

    const appSource = fs.readFileSync(path.resolve('modules/qq-v2/ui/app.js'), 'utf8');
    assert.doesNotMatch(appSource, /phone-status-bar|phone-home-indicator/, 'QQ must consume shell status and Home Indicator instead of duplicating them');
    assert.doesNotMatch(appSource, /navigateTo\(|replaceCurrentRoute\(|routeHistory|currentRoute\s*=/,
        'QQ root tab switches must stay inside the app and never mutate phone route history');
    console.log('[qq-route-integration-contract] passed');
}

main().catch((error) => {
    console.error('[qq-route-integration-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
