import { Logger } from '../error-handler.js';
import { clearRouteHistory } from './routing.js';
import { bindPhoneScrollGuards, hardenPhoneInteractionDefaults, logRouteScrollDebugSnapshot } from './scroll-guards.js';
import { getPhoneCoreState, phoneRuntime } from './state.js';

const logger = Logger.withScope({ scope: 'phone-core/route-renderer', feature: 'route' });
const EXIT_ANIM_MS = 220;
const ROUTE_COMMIT_DELAY_MS = 16;

function isActiveRouteRender(renderToken, state = getPhoneCoreState()) {
    if (!Number.isFinite(renderToken)) {
        return !state.isDestroying;
    }

    return !state.isDestroying && state.routeRenderToken === renderToken;
}

function isRenderableScreen(screen, renderToken, state = getPhoneCoreState()) {
    return screen instanceof HTMLElement
        && screen.isConnected
        && isActiveRouteRender(renderToken, state);
}

async function loadRouteRenderer(route) {
    if (route === 'home') {
        const { renderHomeScreen } = await import('../phone-home.js');
        return {
            routeType: 'home',
            render(page) {
                clearRouteHistory();
                renderHomeScreen(page);
            },
        };
    }

    if (route.startsWith('app:')) {
        const sheetKey = route.replace('app:', '');
        const { renderTableViewer } = await import('../phone-table-viewer.js');
        return {
            routeType: 'app',
            render(page) {
                renderTableViewer(page, sheetKey);
            },
        };
    }

    if (route === 'settings') {
        const { renderSettings } = await import('../phone-settings.js');
        return {
            routeType: 'settings',
            render(page) {
                renderSettings(page);
            },
        };
    }

    if (route === 'fusion') {
        const { renderFusion } = await import('../phone-fusion.js');
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
                renderVariableManager(page);
            },
        };
    }

    return null;
}

async function resolveRouteRenderer(route, renderToken) {
    try {
        const routeRenderer = await loadRouteRenderer(route);
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

function createRouteRenderContext(route, opts = {}, state = getPhoneCoreState()) {
    const screen = document.querySelector('.phone-screen');
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
    if (state.isDestroying || !isActiveRouteRender(renderToken, state)) {
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
        oldContent: screen.firstElementChild,
        page: createRoutePage(isBack),
    };
}

function schedulePreviousPageRemoval(oldContent, exitClass, renderToken) {
    if (!(oldContent instanceof HTMLElement)) {
        return false;
    }

    oldContent.classList.add(exitClass);
    oldContent.setAttribute('inert', '');
    oldContent.style.pointerEvents = 'none';

    phoneRuntime.setTimeout(() => {
        if (!oldContent.isConnected || !isActiveRouteRender(renderToken)) return;
        oldContent.setAttribute('aria-hidden', 'true');
        oldContent.remove();
    }, EXIT_ANIM_MS);

    return true;
}

function activateCommittedRoutePage(page, route, renderToken) {
    phoneRuntime.requestAnimationFrame(() => {
        if (!page.isConnected || !isActiveRouteRender(renderToken)) return;
        logRouteScrollDebugSnapshot(route, page);
        page.classList.remove('phone-page-enter', 'phone-page-enter-back');
        page.classList.add('phone-page-active');
    });
}

function renderResolvedRoutePage(routeRenderer, context) {
    try {
        routeRenderer.render(context.page);
        logger.debug({
            action: 'render',
            message: 'route 页面渲染完成',
            context: {
                route: context.route,
                renderToken: context.renderToken,
            },
        });
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

function commitRoutePage({ screen, page, oldContent, route, renderToken, isBack }) {
    if (!isRenderableScreen(screen, renderToken)) {
        return false;
    }

    const exitClass = isBack ? 'phone-page-exit-back' : 'phone-page-exit';
    screen.appendChild(page);
    bindPhoneScrollGuards(page);
    hardenPhoneInteractionDefaults(page);
    schedulePreviousPageRemoval(oldContent, exitClass, renderToken);
    activateCommittedRoutePage(page, route, renderToken);

    logger.debug({
        action: 'commit',
        message: 'route 页面已提交',
        context: {
            route,
            renderToken,
            hasPreviousPage: oldContent instanceof HTMLElement,
        },
    });
    return true;
}

function scheduleRouteCommit({ screen, page, oldContent, route, renderToken, isBack }) {
    const delay = oldContent instanceof HTMLElement ? ROUTE_COMMIT_DELAY_MS : 0;

    phoneRuntime.setTimeout(() => {
        if (!isRenderableScreen(screen, renderToken)) return;
        commitRoutePage({ screen, page, oldContent, route, renderToken, isBack });
    }, delay);

    return true;
}

export async function renderPhoneRoute(route, opts = {}) {
    const context = createRouteRenderContext(route, opts);
    if (!context) {
        return false;
    }

    const routeRenderer = await resolveRouteRenderer(context.route, context.renderToken);
    if (!routeRenderer || !isRenderableScreen(context.screen, context.renderToken, context.state)) {
        return false;
    }

    if (!renderResolvedRoutePage(routeRenderer, context)) {
        return false;
    }

    scheduleRouteCommit(context);
    return true;
}
