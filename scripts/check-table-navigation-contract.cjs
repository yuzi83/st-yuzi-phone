const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

function sheet(name, orderNo, content = [['field']]) {
    return { name, orderNo, content };
}

async function main() {
    const moduleUrl = pathToFileURL(path.resolve('modules/table-navigation/catalog.js')).href;
    const {
        buildTableNavigationCatalog,
        resolveTableNavigationTarget,
        resolveAdjacentTableTarget,
    } = await import(moduleUrl);
    const controlsUrl = pathToFileURL(path.resolve('modules/table-navigation/controls.js')).href;
    const { buildTableNavigationControlState, requestTableNavigationSwitch } = await import(controlsUrl);
    const dataApiUrl = pathToFileURL(path.resolve('modules/phone-core/data-api.js')).href;
    const { getSheetKeys } = await import(dataApiUrl);
    const routeRendererUrl = pathToFileURL(path.resolve('modules/phone-core/route-renderer.js')).href;
    const {
        __test__discardReviewNavigationAttemptForRoute,
        __test__loadRouteRenderer,
    } = await import(routeRendererUrl);
    const reviewInteractionsUrl = pathToFileURL(path.resolve('modules/table-update-review/interactions.js')).href;
    const { executeTableUpdateReviewNavigation } = await import(reviewInteractionsUrl);
    const navigationIntentUrl = pathToFileURL(path.resolve('modules/table-update-review/navigation-intent.js')).href;
    const {
        clearPendingTableReviewNavigationIntent,
        consumePendingTableReviewNavigationIntent,
        discardPendingTableReviewNavigationIntent,
        peekPendingTableReviewNavigationIntent,
        setPendingTableReviewNavigationIntent,
    } = await import(navigationIntentUrl);
    const theaterDataUrl = pathToFileURL(path.resolve('modules/phone-theater/data.js')).href;
    const { resolveTheaterNavigationSheetKey } = await import(theaterDataUrl);
    const theaterInteractionsUrl = pathToFileURL(path.resolve('modules/phone-theater/interactions.js')).href;
    const { __test__navigateToEditableTable } = await import(theaterInteractionsUrl);

    assert.deepEqual(buildTableNavigationCatalog(null), []);
    assert.equal(resolveTableNavigationTarget({}, ''), null);

    const rawData = {
        mate: { type: 'chatSheets' },
        sheet_z: sheet('Z table', 2),
        sheet_b: sheet('B table', 1),
        sheet_a: sheet('A table', 1),
        sheet_invalid_order: sheet('Unordered table', '3'),
        sheet_contacts: sheet('Contacts', Number.NaN),
    };
    const catalog = buildTableNavigationCatalog(rawData);
    assert.deepEqual(catalog.map((item) => item.sheetKey), getSheetKeys(rawData));
    assert.deepEqual(catalog.map((item) => item.orderIndex), [0, 1, 2, 3, 4]);
    assert.equal(resolveTableNavigationTarget(rawData, 'sheet_contacts').presentation, 'generic');
    assert.equal(resolveTableNavigationTarget(rawData, 'sheet_a').presentation, 'generic');
    assert.equal(resolveTableNavigationTarget(rawData, 'sheet_a').route, 'table:sheet_a');
    assert.equal(resolveTableNavigationTarget(rawData, 'missing'), null);

    const theaterData = {
        sheet_square_posts: sheet('广场表', 1, [['postId'], ['post-1']]),
    };
    const theaterTarget = resolveTableNavigationTarget(theaterData, 'sheet_square_posts');
    assert.equal(theaterTarget.presentation, 'theater');
    assert.equal(theaterTarget.sceneId, 'square');
    assert.equal(theaterTarget.route, 'table:sheet_square_posts');

    const unavailableTheaterData = {
        sheet_calendar_relation: sheet('Calendar relation', 1),
    };
    assert.equal(resolveTableNavigationTarget(unavailableTheaterData, 'sheet_calendar_relation').presentation, 'generic');

    assert.equal(resolveAdjacentTableTarget({}, 'sheet_a', 'next').reason, 'empty_catalog');
    assert.equal(resolveAdjacentTableTarget({ sheet_a: sheet('A', 1) }, 'sheet_a', 'next').reason, 'single_table');
    assert.equal(resolveAdjacentTableTarget(rawData, 'missing', 'next').reason, 'anchor_not_found');
    assert.equal(resolveAdjacentTableTarget(rawData, 'sheet_a', 'sideways').reason, 'invalid_direction');
    assert.equal(resolveAdjacentTableTarget(rawData, 'sheet_a', 'previous').target.sheetKey, getSheetKeys(rawData).at(-1));
    assert.equal(resolveAdjacentTableTarget(rawData, getSheetKeys(rawData).at(-1), 'next').target.sheetKey, 'sheet_a');
    assert.equal(resolveAdjacentTableTarget(rawData, 'sheet_b', 'next').target.sheetKey, 'sheet_z');

    const singleControlState = buildTableNavigationControlState({ sheet_a: sheet('A', 1) }, 'sheet_a');
    assert.equal(singleControlState.disabled, true);
    assert.equal(singleControlState.reason, 'single_table');

    const blockedControlState = buildTableNavigationControlState(rawData, 'sheet_a', { blocked: true });
    assert.equal(blockedControlState.previous.disabled, true);
    assert.equal(blockedControlState.next.reason, 'blocked');

    const replacedRoutes = [];
    const switchResult = requestTableNavigationSwitch('sheet_a', 'next', {
        getTableData: () => rawData,
        replaceCurrentRoute: (route) => replacedRoutes.push(route),
        isActive: () => true,
    });
    assert.equal(switchResult.navigated, true);
    assert.deepEqual(replacedRoutes, ['table:sheet_b']);

    const blockedSwitch = requestTableNavigationSwitch('sheet_a', 'next', {
        blocked: true,
        getTableData: () => {
            throw new Error('blocked navigation must not read data');
        },
        replaceCurrentRoute: () => {
            throw new Error('blocked navigation must not change routes');
        },
    });
    assert.equal(blockedSwitch.reason, 'blocked');

    let activeChecks = 0;
    const inactiveAfterRead = requestTableNavigationSwitch('sheet_a', 'next', {
        getTableData: () => rawData,
        replaceCurrentRoute: () => {
            throw new Error('inactive navigation must not replace routes');
        },
        isActive: () => ++activeChecks === 1,
    });
    assert.equal(inactiveAfterRead.reason, 'inactive');

    const rendered = [];
    const presetCalls = [];
    let routeTableReadCount = 0;
    const routeDeps = {
        getTableData: () => {
            routeTableReadCount += 1;
            return rawData;
        },
        resolveTableNavigationTarget: (_data, sheetKey) => ({
            sheetKey,
            sceneId: 'square',
            presentation: sheetKey === 'theater' ? 'theater' : 'generic',
        }),
        renderTableViewer: (...args) => rendered.push({ kind: 'viewer', args }),
        renderTheaterScene: (...args) => rendered.push({ kind: 'theater', args }),
        tryRenderContentPreset: async (...args) => {
            presetCalls.push(args);
            return false;
        },
    };

    const genericRenderer = await __test__loadRouteRenderer('table:generic', 11, routeDeps);
    assert.equal(genericRenderer.routeType, 'table-generic-auto');
    assert.equal(routeTableReadCount, 1);
    await genericRenderer.render({ page: 'generic' });
    const genericRenderCall = rendered.pop();
    assert.equal(genericRenderCall.kind, 'viewer');
    assert.deepEqual(genericRenderCall.args.slice(0, 2), [{ page: 'generic' }, 'generic']);
    assert.equal(genericRenderCall.args[2].forceGenericList, true);
    assert.equal(genericRenderCall.args[2].navigationSheetKey, 'generic');
    assert.equal(genericRenderCall.args[2].initialTableData, rawData);
    assert.deepEqual(genericRenderCall.args[2].initialNavigationContext.catalog, catalog);
    assert.equal(presetCalls.length, 1);
    assert.equal(routeTableReadCount, 1);

    const theaterRenderer = await __test__loadRouteRenderer('table:theater', 13, routeDeps);
    assert.equal(theaterRenderer.routeType, 'table-theater');
    assert.equal(routeTableReadCount, 2);
    await theaterRenderer.render({ page: 'theater' });
    const theaterRenderCall = rendered.pop();
    assert.equal(theaterRenderCall.kind, 'theater');
    assert.deepEqual(theaterRenderCall.args.slice(0, 2), [{ page: 'theater' }, 'square']);
    assert.equal(theaterRenderCall.args[2].renderToken, 13);
    assert.equal(theaterRenderCall.args[2].navigationSheetKey, 'theater');
    assert.equal(theaterRenderCall.args[2].initialTableData, rawData);
    assert.deepEqual(theaterRenderCall.args[2].initialNavigationContext.catalog, catalog);
    assert.equal(presetCalls.length, 2);
    assert.equal(routeTableReadCount, 2);

    const appTheaterRenderer = await __test__loadRouteRenderer('app:theater', 14, routeDeps);
    assert.equal(appTheaterRenderer.routeType, 'theater-app-redirect');
    assert.equal(routeTableReadCount, 3);
    await appTheaterRenderer.render({ page: 'app-theater' });
    const appTheaterRenderCall = rendered.pop();
    assert.equal(appTheaterRenderCall.kind, 'theater');
    assert.deepEqual(appTheaterRenderCall.args.slice(0, 2), [{ page: 'app-theater' }, 'square']);
    assert.equal(appTheaterRenderCall.args[2].renderToken, 14);
    assert.equal(appTheaterRenderCall.args[2].navigationSheetKey, 'theater');
    assert.equal(appTheaterRenderCall.args[2].initialTableData, rawData);
    assert.deepEqual(appTheaterRenderCall.args[2].initialNavigationContext.catalog, catalog);
    assert.equal(presetCalls.length, 2);
    assert.equal(routeTableReadCount, 3);

    const appGenericRenderer = await __test__loadRouteRenderer('app:generic', 141, routeDeps);
    assert.equal(appGenericRenderer.routeType, 'app');
    assert.equal(routeTableReadCount, 4);
    await appGenericRenderer.render({ page: 'app-generic' });
    const appGenericRenderCall = rendered.pop();
    assert.equal(appGenericRenderCall.kind, 'viewer');
    assert.deepEqual(appGenericRenderCall.args.slice(0, 2), [{ page: 'app-generic' }, 'generic']);
    assert.equal(appGenericRenderCall.args[2].navigationSheetKey, 'generic');
    assert.equal(appGenericRenderCall.args[2].initialTableData, rawData);
    assert.deepEqual(appGenericRenderCall.args[2].initialNavigationContext.catalog, catalog);
    assert.equal(presetCalls.length, 2);
    assert.equal(routeTableReadCount, 4);

    const forcedGenericRenderer = await __test__loadRouteRenderer('table-generic:generic', 15, routeDeps);
    assert.equal(forcedGenericRenderer.routeType, 'table-generic');
    await forcedGenericRenderer.render({ page: 'forced-generic' });
    assert.deepEqual(rendered.pop(), {
        kind: 'viewer',
        args: [{ page: 'forced-generic' }, 'generic', { forceGenericList: true }],
    });
    assert.equal(presetCalls.length, 2);

    const explicitTheaterRenderer = await __test__loadRouteRenderer('theater:square', 16, routeDeps);
    assert.equal(explicitTheaterRenderer.routeType, 'theater');
    await explicitTheaterRenderer.render({ page: 'explicit-theater' });
    assert.deepEqual(rendered.pop(), {
        kind: 'theater',
        args: [{ page: 'explicit-theater' }, 'square', { renderToken: 16 }],
    });
    assert.equal(presetCalls.length, 2);

    const realTableTheaterRenderer = await __test__loadRouteRenderer('table:theater', 17, {
        getTableData: routeDeps.getTableData,
        resolveTableNavigationTarget: routeDeps.resolveTableNavigationTarget,
    });
    assert.equal(realTableTheaterRenderer.routeType, 'table-theater');
    assert.equal(typeof realTableTheaterRenderer.render, 'function');

    assert.equal(await __test__loadRouteRenderer('table:', 18, routeDeps), null);
    assert.equal(await __test__loadRouteRenderer('table:missing', 19, {
        ...routeDeps,
        resolveTableNavigationTarget: () => null,
    }), null);

    const reviewCalls = [];
    const reviewDeps = {
        getTableData: () => rawData,
        navigateTo: (route, options) => reviewCalls.push({ kind: 'navigate', route, options }),
        setPendingTableReviewNavigationIntent: (intent) => {
            reviewCalls.push({ kind: 'intent', intent });
            return true;
        },
        createTableReviewNavigationAttemptId: () => 'attempt-test',
    };
    const theaterReview = executeTableUpdateReviewNavigation({ sheetKey: 'theater', changeType: 'update' }, {
        ...reviewDeps,
        resolveTableNavigationTarget: () => ({ presentation: 'theater', route: 'table:theater' }),
    });
    assert.equal(theaterReview.route, 'table:theater');
    assert.equal(theaterReview.attemptId, 'attempt-test');
    assert.equal(reviewCalls[0].kind, 'intent');
    assert.deepEqual(reviewCalls[1], {
        kind: 'navigate',
        route: 'table:theater',
        options: { reviewNavigationAttemptId: 'attempt-test' },
    });

    reviewCalls.length = 0;
    const genericReview = executeTableUpdateReviewNavigation({
        sheetKey: 'sheet_contacts',
        rowId: 'r1',
        rowIndex: 2,
        changeType: 'update',
        createdAt: 1,
    }, {
        ...reviewDeps,
        resolveTableNavigationTarget: () => ({ presentation: 'generic', route: 'table:sheet_contacts' }),
    });
    assert.equal(genericReview.route, 'table:sheet_contacts');
    assert.equal(reviewCalls[0].kind, 'intent');
    assert.equal(reviewCalls[1].route, 'table:sheet_contacts');

    clearPendingTableReviewNavigationIntent();
    assert.equal(setPendingTableReviewNavigationIntent({ sheetKey: 'sheet_contacts', attemptId: 'attempt-a', changeType: 'update' }), true);
    assert.equal(setPendingTableReviewNavigationIntent({ sheetKey: 'sheet_contacts', attemptId: 'attempt-b', changeType: 'update' }), true);
    assert.equal(consumePendingTableReviewNavigationIntent('sheet_contacts', 'attempt-a'), null);
    assert.equal(discardPendingTableReviewNavigationIntent('sheet_contacts', 'attempt-a'), false);
    assert.equal(peekPendingTableReviewNavigationIntent().attemptId, 'attempt-b');
    assert.equal(consumePendingTableReviewNavigationIntent('sheet_contacts', 'attempt-b').attemptId, 'attempt-b');

    assert.equal(setPendingTableReviewNavigationIntent({ sheetKey: 'sheet_contacts', attemptId: 'attempt-a', changeType: 'update' }), true);
    assert.equal(setPendingTableReviewNavigationIntent({ sheetKey: 'sheet_contacts', attemptId: 'attempt-b', changeType: 'update' }), true);
    assert.equal(__test__discardReviewNavigationAttemptForRoute('table:sheet_contacts', { reviewNavigationAttemptId: 'attempt-a' }), false);
    assert.equal(peekPendingTableReviewNavigationIntent().attemptId, 'attempt-b');
    for (const route of ['app:sheet_contacts', 'table-generic:sheet_contacts', 'theater:square']) {
        assert.equal(__test__discardReviewNavigationAttemptForRoute(route, { reviewNavigationAttemptId: 'attempt-b' }), false);
        assert.equal(peekPendingTableReviewNavigationIntent().attemptId, 'attempt-b');
    }
    assert.equal(__test__discardReviewNavigationAttemptForRoute('table:sheet_contacts', { reviewNavigationAttemptId: 'attempt-b' }), true);
    assert.equal(peekPendingTableReviewNavigationIntent(), null);

    assert.equal(setPendingTableReviewNavigationIntent({ sheetKey: 'sheet_contacts', attemptId: 'attempt-a', changeType: 'update' }), true);
    assert.equal(setPendingTableReviewNavigationIntent({ sheetKey: 'sheet_contacts', attemptId: 'attempt-b', changeType: 'update' }), true);
    const staleFallbackRenderer = await __test__loadRouteRenderer('table:sheet_contacts', 20, {
        ...routeDeps,
        tryRenderContentPreset: async () => false,
    }, { reviewNavigationAttemptId: 'attempt-a' });
    await staleFallbackRenderer.render({ page: 'stale-fallback' });
    assert.equal(peekPendingTableReviewNavigationIntent().attemptId, 'attempt-b');

    assert.equal(setPendingTableReviewNavigationIntent({ sheetKey: 'sheet_contacts', attemptId: 'attempt-a', changeType: 'update' }), true);
    assert.equal(setPendingTableReviewNavigationIntent({ sheetKey: 'sheet_contacts', attemptId: 'attempt-b', changeType: 'update' }), true);
    const staleCommitRenderer = await __test__loadRouteRenderer('table:sheet_contacts', 21, {
        ...routeDeps,
        tryRenderContentPreset: async (_page, _target, options) => {
            options.onCommitted();
            return true;
        },
    }, { reviewNavigationAttemptId: 'attempt-a' });
    await staleCommitRenderer.render({ page: 'stale-commit' });
    assert.equal(peekPendingTableReviewNavigationIntent().attemptId, 'attempt-b');
    assert.equal(discardPendingTableReviewNavigationIntent('sheet_contacts', 'attempt-b'), true);
    assert.equal(peekPendingTableReviewNavigationIntent(), null);

    let deleteReadCount = 0;
    const deleteReview = executeTableUpdateReviewNavigation({ sheetKey: 'generic', changeType: 'delete' }, {
        getTableData: () => {
            deleteReadCount += 1;
            return rawData;
        },
    });
    assert.equal(deleteReview.reason, 'delete');
    assert.equal(deleteReadCount, 0);

    const navigationViewModel = {
        scene: { primaryTableRole: 'primary' },
        tables: {
            primary: null,
            later: { sheetKey: 'sheet_later' },
            earlier: { sheetKey: 'sheet_earlier' },
        },
    };
    const navigationRawData = {
        sheet_later: sheet('Later', 2),
        sheet_earlier: sheet('Earlier', 1),
    };
    assert.equal(resolveTheaterNavigationSheetKey(navigationRawData, navigationViewModel, 'sheet_later'), 'sheet_later');
    assert.equal(resolveTheaterNavigationSheetKey(navigationRawData, navigationViewModel, ''), 'sheet_earlier');

    const editNavigationCalls = [];
    const createEditDeps = (currentRoute, routeHistory) => ({
        getCurrentRoute: () => currentRoute,
        getRouteHistory: () => routeHistory,
        navigateTo: (route) => editNavigationCalls.push({ kind: 'push', route }),
        navigateToReplacingHistoryTop: (route) => editNavigationCalls.push({ kind: 'replace-history-top', route }),
    });
    assert.equal(__test__navigateToEditableTable({ sheetKey: '' }, createEditDeps('theater:square', [])), false);
    assert.equal(editNavigationCalls.length, 0);

    assert.equal(__test__navigateToEditableTable(
        { sheetKey: 'sheet_a' },
        createEditDeps('theater:square', [{ route: 'home' }]),
    ), true);
    assert.deepEqual(editNavigationCalls.pop(), { kind: 'push', route: 'table-generic:sheet_a' });

    assert.equal(__test__navigateToEditableTable(
        { sheetKey: 'sheet_review' },
        createEditDeps('table:sheet_review', [{ route: 'table-update-review' }]),
    ), true);
    assert.deepEqual(editNavigationCalls.pop(), { kind: 'push', route: 'table-generic:sheet_review' });

    for (const previousBrowsingRoute of ['app:sheet_a', 'theater:square', 'table:sheet_a']) {
        assert.equal(__test__navigateToEditableTable(
            { sheetKey: 'sheet_c' },
            createEditDeps('table:sheet_c', [{ route: 'home' }, { route: previousBrowsingRoute }]),
        ), true);
        assert.deepEqual(editNavigationCalls.pop(), {
            kind: 'replace-history-top',
            route: 'table-generic:sheet_c',
        });
    }

    const routeRenderer = fs.readFileSync(path.resolve('modules/phone-core/route-renderer.js'), 'utf8');
    const preload = fs.readFileSync(path.resolve('modules/phone-core/preload.js'), 'utf8');
    const controls = fs.readFileSync(path.resolve('modules/table-navigation/controls.js'), 'utf8');
    const tableRouteIndex = routeRenderer.indexOf('route.startsWith(TABLE_ROUTE_PREFIX)');
    const appRouteIndex = routeRenderer.indexOf("route.startsWith('app:')");
    assert(tableRouteIndex >= 0 && appRouteIndex > tableRouteIndex);
    assert.equal((routeRenderer.match(/const initialTableData = getTableData\(\);/g) || []).length, 2);
    assert(routeRenderer.includes('const navigationContext = buildTableNavigationContext(initialTableData);'));
    assert(routeRenderer.includes('resolveTableNavigationTarget(initialTableData, sheetKey, { navigationContext })'));
    assert(routeRenderer.includes("routeType: 'table-theater'")
        && routeRenderer.includes('renderTheaterScene(page, target.sceneId, {')
        && routeRenderer.includes('navigationSheetKey: target.sheetKey'));
    assert(routeRenderer.includes("routeType: 'table-generic-auto'")
        && routeRenderer.includes("forceGenericList: target.presentation === 'generic'"));
    assert(routeRenderer.includes('if (!sheetKey) return null;')
        && routeRenderer.includes('if (!target) return null;'));
    assert(preload.includes("'../table-navigation/catalog.js'")
        && preload.includes("'../table-viewer/render.js'")
        && preload.includes("'../phone-theater/render.js'"));
    assert(controls.includes("import { replaceCurrentRoute } from '../phone-core/routing.js';")
        && controls.includes('const replaceRoute = options.replaceCurrentRoute || replaceCurrentRoute;')
        && controls.includes('replaceRoute(result.target.route);'));
    assert(!controls.includes('navigateTo(')
        && !controls.includes('routeHistory')
        && !controls.includes('currentRoute ='));

    console.log('[table-navigation-contract-check] passed');
    console.log('- generic and theater catalog routing');
    console.log('- route loading, review navigation, and theater edit history');
}

main().catch((error) => {
    console.error('[table-navigation-contract-check] failed:', error);
    process.exitCode = 1;
});
