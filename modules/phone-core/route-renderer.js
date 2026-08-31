import { Logger } from '../error-handler.js';
import { tryRenderContentPreset } from '../content-presets/renderer.js';
import { resolveContentPresetRouteTarget } from '../content-presets/route-target.js';
import { discardPendingTableReviewNavigationIntent } from '../table-update-review/navigation-intent.js';
import { isTheaterRoute, normalizeTheaterSceneId } from '../phone-theater/config.js';
import { registerRoutePageCleanup, removeRoutePage } from './route-page-lifecycle.js';
import { clearRouteHistory } from './routing.js';
import { bindPhoneScrollGuards, hardenPhoneInteractionDefaults, logRouteScrollDebugSnapshot } from './scroll-guards.js';
import { getPhoneCoreState, markPhoneRouteRefreshPending, phoneRuntime } from './state.js';

const logger = Logger.withScope({ scope: 'phone-core/route-renderer', feature: 'route' });
const EXIT_ANIM_MS = 220;
const ROUTE_COMMIT_DELAY_MS = 16;
const TABLE_GENERIC_ROUTE_PREFIX = 'table-generic:';
const TABLE_ROUTE_PREFIX = 'table:';

function isActiveRouteRender(renderToken, state = getPhoneCoreState()) {
    if (!Number.isFinite(renderToken)) {
        return !state.isDestroying;
    }

    return !state.isDestroying && state.routeRenderToken === renderToken;
}

function isRenderableScreen(screen, renderToken, state = getPhoneCoreState()) {
    return screen instanceof HTMLElement
        && screen.isConnected
        && state.isPhoneActive !== false
        && isActiveRouteRender(renderToken, state);
}

function deferInactivePhoneRouteRender(state = getPhoneCoreState()) {
    if (state.isDestroying || state.isPhoneActive !== false) return false;
    markPhoneRouteRefreshPending('route-render-inactive', state);
    return true;
}

function showDefaultQQRouteToast(message, isError = true) {
    const container = getPhoneCoreState().phoneContainer;
    if (typeof HTMLElement === 'undefined' || !(container instanceof HTMLElement)) return;
    if (container.querySelector('[data-qq-route-toast]')) return;

    const toast = document.createElement('div');
    toast.className = `phone-toast ${isError ? 'phone-toast-error' : 'phone-toast-success'}`;
    toast.dataset.qqRouteToast = '1';
    toast.setAttribute('role', isError ? 'alert' : 'status');
    toast.textContent = message;
    (container.querySelector('.yuzi-phone-shell') || container).append(toast);
    phoneRuntime.setTimeout(() => toast.classList.add('phone-toast-show'), 10);
    phoneRuntime.setTimeout(() => {
        toast.classList.remove('phone-toast-show');
        phoneRuntime.setTimeout(() => toast.remove(), 300);
    }, 2000);
}

function resolveQQRouteShell(deps = {}) {
    if (typeof deps.getQQRouteShell === 'function') {
        return deps.getQQRouteShell() || {};
    }
    return Object.freeze({ showToast: showDefaultQQRouteToast });
}

function renderQQRouteFailure(page, shell) {
    page?.replaceChildren?.();
    try {
        shell?.showToast?.('QQ 暂时无法加载');
    } catch {
        // Error notification is advisory; the blank QQ shell remains usable.
    }
}

function renderQQRouteSkeleton(page) {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;
    const create = (tag, className, text = '') => {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text) element.textContent = text;
        return element;
    };
    const viewport = create('div', 'yuzi-qq-viewport yuzi-qq-route-skeleton');
    viewport.dataset.qqRouteSkeleton = '1';
    viewport.setAttribute('role', 'status');
    viewport.setAttribute('aria-label', 'QQ 正在加载');
    viewport.setAttribute('aria-busy', 'true');

    const main = create('main', 'yuzi-qq-view yuzi-qq-list-view yuzi-qq-message-root-view');
    const header = create('header', 'yuzi-qq-header');
    header.append(
        create('span', 'yuzi-qq-header-spacer'),
        create('h1', 'yuzi-qq-title', '消息'),
        create('span', 'yuzi-qq-header-actions'),
    );
    const sheet = create('section', 'yuzi-qq-list-sheet yuzi-qq-route-skeleton-list');
    for (let index = 0; index < 5; index += 1) {
        const row = create('div', 'yuzi-qq-conversation-row yuzi-qq-route-skeleton-row');
        const avatar = create('span', 'yuzi-qq-route-skeleton-avatar');
        const copy = create('span', 'yuzi-qq-row-main yuzi-qq-route-skeleton-copy');
        copy.append(
            create('span', 'yuzi-qq-route-skeleton-line is-title'),
            create('span', 'yuzi-qq-route-skeleton-line is-preview'),
        );
        row.append(avatar, copy, create('span', 'yuzi-qq-route-skeleton-line is-meta'));
        sheet.append(row);
    }
    main.append(header, sheet);

    const navigation = create('nav', 'yuzi-qq-nav yuzi-qq-root-tabbar');
    navigation.setAttribute('aria-hidden', 'true');
    ['消息', '联系人', '助手', '设置'].forEach((label, index) => {
        const item = create('span', `yuzi-qq-nav-item yuzi-qq-root-tab${index === 0 ? ' is-active' : ''}`);
        item.append(
            create('span', 'yuzi-qq-nav-icon yuzi-qq-route-skeleton-nav-icon'),
            create('span', 'yuzi-qq-nav-label', label),
        );
        navigation.append(item);
    });

    page?.classList?.add('yuzi-qq-app');
    page?.replaceChildren?.(viewport);
    viewport.append(main, navigation);
}

async function loadQQRouteDependencies(deps = {}) {
    if (typeof deps.loadQQRouteDependencies === 'function') {
        return deps.loadQQRouteDependencies();
    }

    const [{ createQQApp }, { createQQRouteLifecycle }, { getQQV2Facade }] = await Promise.all([
        import('../qq-v2/ui/app.js'),
        import('../qq-v2/ui/route-lifecycle.js'),
        import('../qq-v2/runtime/default-runtime.js'),
    ]);
    return { createQQApp, createQQRouteLifecycle, getQQV2Facade };
}

async function loadTableRouteDependencies(deps = {}) {
    const [dataApi, navigationApi] = await Promise.all([
        typeof deps.getTableData === 'function' ? null : import('./data-api.js'),
        typeof deps.buildTableNavigationContext === 'function'
            && typeof deps.resolveTableNavigationTarget === 'function'
            ? null
            : import('../table-navigation/catalog.js'),
    ]);
    return {
        getTableData: deps.getTableData || dataApi.getTableData,
        buildTableNavigationContext: deps.buildTableNavigationContext
            || navigationApi.buildTableNavigationContext,
        resolveTableNavigationTarget: deps.resolveTableNavigationTarget
            || navigationApi.resolveTableNavigationTarget,
    };
}

export function __test__discardReviewNavigationAttemptForRoute(route, opts = {}) {
    if (!String(route || '').startsWith(TABLE_ROUTE_PREFIX)) return false;
    const sheetKey = String(route).slice(TABLE_ROUTE_PREFIX.length).trim();
    const attemptId = String(opts.reviewNavigationAttemptId || '').trim();
    if (!sheetKey || !attemptId) return false;
    return discardPendingTableReviewNavigationIntent(sheetKey, attemptId);
}

async function loadRouteRenderer(route, renderToken, deps = {}, opts = {}) {
    if (route === 'home') {
        const { renderHomeScreen } = await import('../phone-home/render.js');
        return {
            routeType: 'home',
            render(page) {
                clearRouteHistory();
                renderHomeScreen(page);
            },
        };
    }

    if (route === 'qq' || route.startsWith('qq:')) {
        return {
            routeType: 'qq',
            render(page) {
                const shell = resolveQQRouteShell(deps);
                let lifecycle = null;
                let disposed = false;
                renderQQRouteSkeleton(page);
                registerRoutePageCleanup(page, () => {
                    disposed = true;
                    lifecycle?.destroy();
                });

                void (async () => {
                    try {
                        const qqDependencies = await loadQQRouteDependencies(deps);
                        if (disposed) return;
                        const getFacade = typeof deps.getQQV2Facade === 'function'
                            ? deps.getQQV2Facade
                            : qqDependencies.getQQV2Facade;
                        const facade = getFacade?.();
                        if (!facade) {
                            renderQQRouteFailure(page, shell);
                            return;
                        }

                        lifecycle = qqDependencies.createQQRouteLifecycle({
                            page,
                            facade,
                            createApp: qqDependencies.createQQApp,
                            shell,
                            isCurrent: () => !disposed && isActiveRouteRender(renderToken),
                        });
                        if (disposed) {
                            lifecycle.destroy();
                            return;
                        }
                        await lifecycle.mount();
                    } catch {
                        lifecycle?.destroy();
                        if (!disposed) renderQQRouteFailure(page, shell);
                    }
                })();
            },
        };
    }

    if (route === 'table-update-review') {
        const { renderTableUpdateReview } = await import('../table-update-review/index.js');
        return {
            routeType: 'table-update-review',
            render(page) {
                renderTableUpdateReview(page, { renderToken });
            },
        };
    }

    if (route.startsWith(TABLE_ROUTE_PREFIX)) {
        const sheetKey = route.slice(TABLE_ROUTE_PREFIX.length).trim();
        if (!sheetKey) return null;

        const {
            getTableData,
            buildTableNavigationContext,
            resolveTableNavigationTarget,
        } = await loadTableRouteDependencies(deps);
        const initialTableData = getTableData();
        const navigationContext = buildTableNavigationContext(initialTableData);
        const target = resolveTableNavigationTarget(initialTableData, sheetKey, { navigationContext });
        if (!target) return null;

        if (target.presentation === 'theater') {
            const { renderTheaterScene } = deps.renderTheaterScene
                ? { renderTheaterScene: deps.renderTheaterScene }
                : await import('../phone-theater/render.js');
            const originalRenderer = (page) => {
                renderTheaterScene(page, target.sceneId, {
                    renderToken,
                    navigationSheetKey: target.sheetKey,
                    initialTableData,
                    initialNavigationContext: navigationContext,
                });
                if (opts.reviewNavigationAttemptId) discardPendingTableReviewNavigationIntent(target.sheetKey, opts.reviewNavigationAttemptId);
            };
            return {
                routeType: 'table-theater',
                async render(page) {
                    const presetTarget = resolveContentPresetRouteTarget(route, initialTableData, { navigationContext });
                    const renderPreset = deps.tryRenderContentPreset || tryRenderContentPreset;
                    if (!await renderPreset(page, presetTarget, {
                        renderToken,
                        originalRenderer,
                        initialTableData,
                        onCommitted: () => discardPendingTableReviewNavigationIntent(target.sheetKey, opts.reviewNavigationAttemptId),
                    })) originalRenderer(page);
                },
            };
        }

        const { renderTableViewer } = deps.renderTableViewer
            ? { renderTableViewer: deps.renderTableViewer }
            : await import('../table-viewer/render.js');
        const originalRenderer = (page) => {
            const viewerOptions = {
                forceGenericList: target.presentation === 'generic',
                navigationSheetKey: target.sheetKey,
                initialTableData,
                initialNavigationContext: navigationContext,
            };
            if (opts.reviewNavigationAttemptId) {
                viewerOptions.reviewNavigationAttemptId = opts.reviewNavigationAttemptId;
            }
            renderTableViewer(page, target.sheetKey, viewerOptions);
        };
        return {
            routeType: 'table-generic-auto',
            async render(page) {
                const presetTarget = resolveContentPresetRouteTarget(route, initialTableData, { navigationContext });
                const renderPreset = deps.tryRenderContentPreset || tryRenderContentPreset;
                if (!await renderPreset(page, presetTarget, {
                    renderToken,
                    originalRenderer,
                    initialTableData,
                    onCommitted: () => discardPendingTableReviewNavigationIntent(target.sheetKey, opts.reviewNavigationAttemptId),
                })) originalRenderer(page);
            },
        };
    }

    if (route.startsWith('app:')) {
        const sheetKey = route.replace('app:', '').trim();
        const {
            getTableData,
            buildTableNavigationContext,
            resolveTableNavigationTarget,
        } = await loadTableRouteDependencies(deps);
        const initialTableData = getTableData();
        const navigationContext = buildTableNavigationContext(initialTableData);
        const target = resolveTableNavigationTarget(initialTableData, sheetKey, { navigationContext });
        if (target?.presentation === 'theater') {
            const { renderTheaterScene } = deps.renderTheaterScene
                ? { renderTheaterScene: deps.renderTheaterScene }
                : await import('../phone-theater/render.js');
            const originalRenderer = (page) => renderTheaterScene(page, target.sceneId, {
                renderToken,
                navigationSheetKey: target.sheetKey,
                initialTableData,
                initialNavigationContext: navigationContext,
            });
            return {
                routeType: 'theater-app-redirect',
                render: originalRenderer,
            };
        }

        const { renderTableViewer } = deps.renderTableViewer
            ? { renderTableViewer: deps.renderTableViewer }
            : await import('../table-viewer/render.js');
        const originalRenderer = (page) => renderTableViewer(page, sheetKey, {
            ...(target ? { navigationSheetKey: target.sheetKey } : {}),
            initialTableData,
            initialNavigationContext: navigationContext,
        });
        return {
            routeType: 'app',
            render: originalRenderer,
        };
    }

    if (route.startsWith(TABLE_GENERIC_ROUTE_PREFIX)) {
        const sheetKey = route.slice(TABLE_GENERIC_ROUTE_PREFIX.length).trim();
        const { renderTableViewer } = deps.renderTableViewer
            ? { renderTableViewer: deps.renderTableViewer }
            : await import('../table-viewer/render.js');
        return {
            routeType: 'table-generic',
            render(page) {
                const viewerOptions = { forceGenericList: true };
                if (opts.reviewNavigationAttemptId) viewerOptions.reviewNavigationAttemptId = opts.reviewNavigationAttemptId;
                renderTableViewer(page, sheetKey, viewerOptions);
            },
        };
    }

    if (isTheaterRoute(route)) {
        const sceneId = normalizeTheaterSceneId(route);
        const { renderTheaterScene } = deps.renderTheaterScene
            ? { renderTheaterScene: deps.renderTheaterScene }
            : await import('../phone-theater/render.js');
        const originalRenderer = (page) => renderTheaterScene(page, sceneId, { renderToken });
        return {
            routeType: 'theater',
            render: originalRenderer,
        };
    }

    if (route === 'settings') {
        const renderSettings = typeof deps.renderSettings === 'function'
            ? deps.renderSettings
            : (await import('../settings-app/render.js')).renderSettings;
        return {
            routeType: 'settings',
            render(page) {
                const dispose = renderSettings(page);
                if (typeof dispose === 'function') {
                    registerRoutePageCleanup(page, dispose);
                }
            },
        };
    }

    if (route === 'fusion') {
        const { renderFusion } = await import('../phone-fusion/render.js');
        return {
            routeType: 'fusion',
            render(page) {
                renderFusion(page);
            },
        };
    }

    if (route === 'variable-manager') {
        const { renderVariableManager } = await import('../variable-manager/index.js');
        return {
            routeType: 'variable-manager',
            render(page) {
                renderVariableManager(page, { renderToken });
            },
        };
    }

    return null;
}

export function __test__loadRouteRenderer(route, renderToken, deps = {}, opts = {}) {
    return loadRouteRenderer(route, renderToken, deps, opts);
}

async function resolveRouteRenderer(route, renderToken, opts = {}) {
    try {
        const routeRenderer = await loadRouteRenderer(route, renderToken, {}, opts);
        if (!routeRenderer) {
            logger.warn({
                action: 'resolve',
                message: '未知 route，跳过渲染',
                context: { route, renderToken },
            });
            return null;
        }

        return routeRenderer;
    } catch (error) {
        logger.error({
            action: 'resolve',
            message: '加载 route renderer 失败',
            context: { route, renderToken },
            error,
        });
        return null;
    }
}

function createRoutePage(isBack = false) {
    const page = document.createElement('div');
    page.className = `phone-page ${isBack ? 'phone-page-enter-back' : 'phone-page-enter'}`;
    return page;
}

function getRoutePages(screen) {
    if (!(screen instanceof HTMLElement)) {
        return [];
    }

    return Array.from(screen.children)
        .filter((child) => child instanceof HTMLElement && child.classList.contains('phone-page'));
}

function getCurrentRoutePage(screen) {
    const routePages = getRoutePages(screen);
    return routePages.length > 0 ? routePages[routePages.length - 1] : null;
}

function removeStaleRoutePages(screen, retainedPages = []) {
    const retainedPageSet = new Set(retainedPages.filter((page) => page instanceof HTMLElement));

    for (const routePage of getRoutePages(screen)) {
        if (retainedPageSet.has(routePage)) continue;
        routePage.setAttribute('aria-hidden', 'true');
        removeRoutePage(routePage);
    }
}

function createRouteRenderContext(route, opts = {}, state = getPhoneCoreState()) {
    const screen = document.querySelector('.yuzi-phone-screen');
    if (!(screen instanceof HTMLElement)) {
        logger.debug({
            action: 'context.skip',
            message: 'route 渲染跳过：phone screen 不存在',
            context: { route },
        });
        return null;
    }

    const renderToken = Number.isFinite(opts.renderToken)
        ? opts.renderToken
        : state.routeRenderToken;
    if (state.isDestroying || state.isPhoneActive === false || !isActiveRouteRender(renderToken, state)) {
        logger.debug({
            action: 'context.skip',
            message: 'route 渲染跳过：render token 已过期或 runtime 正在销毁',
            context: { route, renderToken },
        });
        return null;
    }

    const isBack = !!opts.isBack;
    return {
        route,
        state,
        screen,
        renderToken,
        isBack,
        oldContent: getCurrentRoutePage(screen),
        page: createRoutePage(isBack),
    };
}

function schedulePreviousPageRemoval(oldContent, exitClass) {
    if (!(oldContent instanceof HTMLElement)) {
        return false;
    }

    oldContent.classList.add(exitClass);
    oldContent.setAttribute('inert', '');
    oldContent.style.pointerEvents = 'none';

    phoneRuntime.setTimeout(() => {
        if (!oldContent.isConnected) {
            removeRoutePage(oldContent);
            return;
        }
        oldContent.setAttribute('aria-hidden', 'true');
        removeRoutePage(oldContent);
    }, EXIT_ANIM_MS);

    return true;
}

function activateCommittedRoutePage(page, route, renderToken) {
    phoneRuntime.requestAnimationFrame(() => {
        if (!page.isConnected || !isActiveRouteRender(renderToken)) return;
        if (deferInactivePhoneRouteRender()) return;
        logRouteScrollDebugSnapshot(route, page);
        page.classList.remove('phone-page-enter', 'phone-page-enter-back');
        page.classList.add('phone-page-active');
    });
}

async function renderResolvedRoutePage(routeRenderer, context) {
    try {
        await routeRenderer.render(context.page);
        return true;
    } catch (error) {
        logger.error({
            action: 'render',
            message: 'route 页面渲染失败',
            context: {
                route: context.route,
                renderToken: context.renderToken,
            },
            error,
        });
        return false;
    }
}

function commitRoutePage({ screen, page, oldContent, route, renderToken, isBack, opts }) {
    if (!isRenderableScreen(screen, renderToken)) {
        logger.warn({
            action: 'commit.skip',
            message: 'route 页面提交跳过：screen 不可渲染或 token 已过期',
            context: {
                route,
                renderToken,
                screenConnected: screen?.isConnected === true,
            },
        });
        removeRoutePage(page);
        if (!deferInactivePhoneRouteRender()) {
            __test__discardReviewNavigationAttemptForRoute(route, opts);
        }
        return false;
    }

    const exitClass = isBack ? 'phone-page-exit-back' : 'phone-page-exit';
    screen.appendChild(page);
    removeStaleRoutePages(screen, [oldContent, page]);
    bindPhoneScrollGuards(page);
    hardenPhoneInteractionDefaults(page);
    schedulePreviousPageRemoval(oldContent, exitClass);
    activateCommittedRoutePage(page, route, renderToken);

    return true;
}

function scheduleRouteCommit({ screen, page, oldContent, route, renderToken, isBack, opts }) {
    const delay = oldContent instanceof HTMLElement ? ROUTE_COMMIT_DELAY_MS : 0;

    phoneRuntime.setTimeout(() => {
        if (!isRenderableScreen(screen, renderToken)) {
            logger.debug({
                action: 'commit.schedule.skip',
                message: 'route 页面延迟提交跳过：screen 不可渲染或 token 已过期',
                context: {
                    route,
                    renderToken,
                    screenConnected: screen?.isConnected === true,
                },
            });
            removeRoutePage(page);
            if (!deferInactivePhoneRouteRender()) {
                __test__discardReviewNavigationAttemptForRoute(route, opts);
            }
            return;
        }
        commitRoutePage({ screen, page, oldContent, route, renderToken, isBack, opts });
    }, delay);

    return true;
}

export async function renderPhoneRoute(route, opts = {}) {
    const context = createRouteRenderContext(route, opts);
    if (!context) {
        logger.warn({
            action: 'render.skip',
            message: 'route 渲染失败：无法创建渲染上下文',
            context: {
                route,
                renderToken: opts.renderToken,
            },
        });
        if (!deferInactivePhoneRouteRender(context?.state)) {
            __test__discardReviewNavigationAttemptForRoute(route, opts);
        }
        return false;
    }

    const routeRenderer = await resolveRouteRenderer(context.route, context.renderToken, opts);
    if (!routeRenderer) {
        removeRoutePage(context.page);
        logger.warn({
            action: 'render.skip',
            message: 'route 渲染失败：未找到 route renderer',
            context: {
                route: context.route,
                renderToken: context.renderToken,
            },
        });
        if (!deferInactivePhoneRouteRender(context.state)) {
            __test__discardReviewNavigationAttemptForRoute(context.route, opts);
        }
        return false;
    }

    if (!isRenderableScreen(context.screen, context.renderToken, context.state)) {
        removeRoutePage(context.page);
        logger.warn({
            action: 'render.skip',
            message: 'route 渲染失败：screen 不可渲染或 render token 已过期',
            context: {
                route: context.route,
                renderToken: context.renderToken,
                activeRenderToken: context.state?.routeRenderToken,
                screenConnected: context.screen?.isConnected === true,
                isDestroying: context.state?.isDestroying === true,
            },
        });
        if (!deferInactivePhoneRouteRender(context.state)) {
            __test__discardReviewNavigationAttemptForRoute(context.route, opts);
        }
        return false;
    }

    if (!await renderResolvedRoutePage(routeRenderer, context)) {
        removeRoutePage(context.page);
        if (!deferInactivePhoneRouteRender(context.state)) {
            __test__discardReviewNavigationAttemptForRoute(context.route, opts);
        }
        return false;
    }

    scheduleRouteCommit({ ...context, opts });
    return true;
}
