const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = (file) => import(pathToFileURL(path.resolve(file)).href);

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((nextResolve, nextReject) => {
        resolve = nextResolve;
        reject = nextReject;
    });
    return { promise, resolve, reject };
}

function bootstrap(scopeId = 'scope-a') {
    return { ok: true, context: { scopeId } };
}

function createPage() {
    return {
        clearCount: 0,
        isConnected: true,
        replaceChildren() { this.clearCount += 1; },
    };
}

function createAppRecorder() {
    const created = [];
    const createApp = (options) => {
        const app = {
            options,
            mounts: [],
            refreshes: 0,
            destroys: 0,
            mount(page) { this.mounts.push(page); return this; },
            async refresh() { this.refreshes += 1; },
            destroy() { this.destroys += 1; },
        };
        created.push(app);
        return app;
    };
    return { created, createApp };
}

async function main() {
    const { createQQRouteLifecycle } = await load('modules/qq-v2/ui/route-lifecycle.js');

    const firstPage = createPage();
    const firstApps = createAppRecorder();
    let firstListener = null;
    const firstFacade = {
        query: { async bootstrap() { return bootstrap(); } },
        subscribe(listener) { firstListener = listener; return () => { firstListener = null; }; },
    };
    const shell = { toasts: [], showToast(message) { this.toasts.push(message); } };
    const first = createQQRouteLifecycle({
        page: firstPage,
        facade: firstFacade,
        createApp: firstApps.createApp,
        shell,
        isCurrent: () => true,
    });
    assert.equal(await first.mount(), true);
    await Promise.resolve();
    assert.equal(firstApps.created.length, 1, 'each QQ home launch creates a root app instance');
    assert.deepEqual(firstApps.created[0].mounts, [firstPage]);
    assert.equal(firstApps.created[0].options.facade, firstFacade);
    assert.equal(firstApps.created[0].options.shell, shell);
    await firstListener({ status: 'changed', scopeId: 'scope-a' });
    assert.equal(firstApps.created[0].refreshes, 1, 'same-scope Facade updates refresh the mounted QQ root');
    await firstListener({
        status: 'changed',
        scopeId: 'scope-a',
        reason: 'conversation-opened',
        conversationId: 'private-1',
    });
    assert.equal(firstApps.created[0].refreshes, 1,
        'opening a conversation updates external unread projections without rerendering the navigating QQ root');
    await firstListener({ status: 'changed', scopeId: 'scope-b' });
    assert.equal(firstApps.created[0].refreshes, 1, 'a mismatched scope event cannot update this QQ root');
    firstPage.isConnected = false;
    await firstListener({ status: 'changed', scopeId: 'scope-a' });
    assert.equal(firstApps.created[0].refreshes, 1, 'a detached QQ route page ignores later Facade updates');
    firstPage.isConnected = true;

    const secondPage = createPage();
    const secondApps = createAppRecorder();
    const second = createQQRouteLifecycle({
        page: secondPage,
        facade: { query: { async bootstrap() { return bootstrap(); } } },
        createApp: secondApps.createApp,
        shell,
        isCurrent: () => true,
    });
    assert.equal(await second.mount(), true);
    assert.notEqual(secondApps.created[0], firstApps.created[0], 'relaunches never restore the former QQ root state');

    const emptyScopePage = createPage();
    const emptyScopeApps = createAppRecorder();
    const emptyScopeShell = { toasts: [], showToast(message) { this.toasts.push(message); } };
    const emptyScope = createQQRouteLifecycle({
        page: emptyScopePage,
        facade: {
            query: {
                async bootstrap() {
                    return { ok: true, status: 'unavailable', context: { scopeId: '' } };
                },
            },
        },
        createApp: emptyScopeApps.createApp,
        shell: emptyScopeShell,
        isCurrent: () => true,
    });
    assert.equal(await emptyScope.mount(), true, 'no active Tavern chat still mounts the normal QQ root');
    assert.equal(emptyScopeApps.created.length, 1);
    assert.deepEqual(emptyScopeApps.created[0].mounts, [emptyScopePage]);
    assert.equal(emptyScopePage.clearCount, 0, 'an empty chat scope must not blank the QQ route page');
    assert.deepEqual(emptyScopeShell.toasts, [], 'an empty chat scope is not a QQ load failure');

    const scopeRead = deferred();
    let scopeListener = null;
    const scopedApps = createAppRecorder();
    const scoped = createQQRouteLifecycle({
        page: createPage(),
        facade: {
            query: {
                async bootstrap() {
                    return scopeRead.promise;
                },
            },
            subscribe(listener) { scopeListener = listener; return () => { scopeListener = null; }; },
        },
        createApp: scopedApps.createApp,
        shell,
        isCurrent: () => true,
    });
    const scopedMount = scoped.mount();
    scopeRead.resolve(bootstrap());
    assert.equal(await scopedMount, true);
    await Promise.resolve();
    const refreshRead = deferred();
    // Replace the facade read only after initial mount: the stale update below now observes a new scope.
    scopedApps.created[0].options.facade.query.bootstrap = async () => refreshRead.promise;
    const staleRefresh = scopeListener({ status: 'changed', scopeId: 'scope-a' });
    refreshRead.resolve(bootstrap('scope-b'));
    await staleRefresh;
    assert.equal(scopedApps.created[0].refreshes, 0, 'scope changes during an async read cannot write stale results');

    const coalescedRead = deferred();
    let coalescedListener = null;
    let coalescedBootstrapCalls = 0;
    const coalescedApps = createAppRecorder();
    const coalesced = createQQRouteLifecycle({
        page: createPage(),
        facade: {
            query: {
                async bootstrap() {
                    coalescedBootstrapCalls += 1;
                    if (coalescedBootstrapCalls === 2) return coalescedRead.promise;
                    return bootstrap();
                },
            },
            subscribe(listener) { coalescedListener = listener; return () => { coalescedListener = null; }; },
        },
        createApp: coalescedApps.createApp,
        shell,
        isCurrent: () => true,
    });
    assert.equal(await coalesced.mount(), true);
    await Promise.resolve();
    const firstRefresh = coalescedListener({ status: 'changed', scopeId: 'scope-a' });
    const secondRefresh = coalescedListener({ status: 'changed', scopeId: 'scope-a' });
    const thirdRefresh = coalescedListener({ status: 'changed', scopeId: 'scope-a' });
    coalescedRead.resolve(bootstrap());
    await Promise.all([firstRefresh, secondRefresh, thirdRefresh]);
    assert.equal(coalescedApps.created[0].refreshes, 2,
        'notification bursts collapse to one active refresh plus one latest pending refresh');
    assert.equal(coalescedBootstrapCalls, 3,
        'coalesced refreshes avoid redundant snapshot reads from the same burst');

    let routeToken = 20;
    const staleRead = deferred();
    const staleApps = createAppRecorder();
    const stale = createQQRouteLifecycle({
        page: createPage(),
        facade: { query: { async bootstrap() { return staleRead.promise; } } },
        createApp: staleApps.createApp,
        shell,
        isCurrent: () => routeToken === 20,
    });
    const staleMount = stale.mount();
    routeToken = 21;
    staleRead.resolve(bootstrap());
    assert.equal(await staleMount, false);
    assert.equal(staleApps.created.length, 0, 'a superseded render token cannot mount after an async load');

    const subscriptionRead = deferred();
    let pendingListener = null;
    let pendingUnsubscribed = 0;
    const pendingApps = createAppRecorder();
    const pending = createQQRouteLifecycle({
        page: createPage(),
        facade: {
            query: { async bootstrap() { return bootstrap(); } },
            subscribe(listener) {
                pendingListener = listener;
                return subscriptionRead.promise;
            },
        },
        createApp: pendingApps.createApp,
        shell,
        isCurrent: () => true,
    });
    assert.equal(await pending.mount(), true);
    pending.destroy();
    subscriptionRead.resolve(() => { pendingUnsubscribed += 1; });
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(pendingUnsubscribed, 1, 'a subscription resolving after destroy is immediately released');
    await pendingListener({ status: 'changed', scopeId: 'scope-a' });
    assert.equal(pendingApps.created[0].refreshes, 0, 'destroyed QQ roots ignore late subscriptions');

    const failedPage = createPage();
    const failedApps = createAppRecorder();
    const failedShell = { toasts: [], showToast(message) { this.toasts.push(message); } };
    const failed = createQQRouteLifecycle({
        page: failedPage,
        facade: { query: { async bootstrap() { return { ok: false }; } } },
        createApp: failedApps.createApp,
        shell: failedShell,
        isCurrent: () => true,
    });
    assert.equal(await failed.mount(), false);
    await failed.mount();
    assert.equal(failedApps.created.length, 0);
    assert.equal(failedPage.clearCount > 0, true, 'a failed Facade read leaves the QQ shell blank');
    assert.equal(failedShell.toasts.length, 1, 'a failed QQ load produces exactly one user-facing toast');

    first.destroy();
    second.destroy();
    emptyScope.destroy();
    scoped.destroy();
    coalesced.destroy();
    stale.destroy();
    failed.destroy();
    console.log('[qq-route-lifecycle-contract] passed');
}

main().catch((error) => {
    console.error('[qq-route-lifecycle-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
