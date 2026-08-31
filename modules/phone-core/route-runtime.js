import { Logger } from '../error-handler.js';
import { getCurrentRoute, onRouteChange } from './routing.js';
import { renderPhoneRoute } from './route-renderer.js';
import { getPhoneCoreState, markPhoneRouteRefreshPending } from './state.js';

const logger = Logger.withScope({ scope: 'phone-core/route-runtime', feature: 'route' });
const routeRuntimeDeps = {
    getCurrentRoute: () => getCurrentRoute(),
    onRouteChange: (callback) => onRouteChange(callback),
    renderPhoneRoute: (route, opts) => renderPhoneRoute(route, opts),
    getPhoneCoreState: () => getPhoneCoreState(),
};

export function __test__setRouteRuntimeDeps(overrides = {}) {
    if (!overrides || typeof overrides !== 'object') return;
    Object.assign(routeRuntimeDeps, overrides);
}

function bumpRouteRenderToken(state = routeRuntimeDeps.getPhoneCoreState()) {
    const currentToken = Number.isFinite(state.routeRenderToken)
        ? state.routeRenderToken
        : 0;
    state.routeRenderToken = currentToken + 1;
    return state.routeRenderToken;
}

function resolveRequestedRoute(route) {
    return typeof route === 'string' && route
        ? route
        : routeRuntimeDeps.getCurrentRoute();
}

function buildRouteRequestContext(route, renderToken, opts = {}) {
    return {
        route,
        renderToken,
        navigationMode: String(opts.navigationMode || ''),
        isBack: !!opts.isBack,
        requestMode: String(opts.requestMode || 'explicit'),
        fromRoute: String(opts.fromRoute || ''),
        pushedHistory: !!opts.pushedHistory,
        poppedHistoryEntry: opts.poppedHistoryEntry || null,
        displacedHistoryEntry: opts.displacedHistoryEntry || null,
    };
}

export function getActiveRouteRenderToken(state = routeRuntimeDeps.getPhoneCoreState()) {
    return Number.isFinite(state.routeRenderToken) ? state.routeRenderToken : 0;
}

function rollbackFailedRouteRequest(nextRoute, opts = {}, state = routeRuntimeDeps.getPhoneCoreState()) {
    const failedRoute = String(nextRoute || '').trim();
    if (!failedRoute || state?.isDestroying) return false;
    if (String(state?.currentRoute || '').trim() !== failedRoute) return false;
    if (!Number.isFinite(opts.renderToken) || state.routeRenderToken !== opts.renderToken) return false;

    const previousRoute = String(opts.fromRoute || 'home').trim() || 'home';
    const routeHistory = Array.isArray(state?.routeHistory) ? state.routeHistory : null;
    if (opts.pushedHistory === true && routeHistory && routeHistory.length > 0) {
        const lastEntry = state.routeHistory[state.routeHistory.length - 1];
        if (String(lastEntry?.route || '').trim() === previousRoute) {
            state.routeHistory.pop();
        }
    }

    if (opts.navigationMode === 'push-replace-history-top' && routeHistory && opts.displacedHistoryEntry) {
        routeHistory.push(opts.displacedHistoryEntry);
    }

    if (opts.navigationMode === 'back' && routeHistory && opts.poppedHistoryEntry) {
        routeHistory.push(opts.poppedHistoryEntry);
    }

    state.currentRoute = previousRoute;
    logger.warn({
        action: 'render.rollback',
        message: 'route 渲染失败，已回退当前 route',
        context: {
            failedRoute,
            previousRoute,
            pushedHistory: !!opts.pushedHistory,
            navigationMode: String(opts.navigationMode || ''),
            renderToken: opts.renderToken,
        },
    });
    return true;
}

export function requestPhoneRouteRender(route = routeRuntimeDeps.getCurrentRoute(), opts = {}) {
    const state = routeRuntimeDeps.getPhoneCoreState();
    const nextRoute = resolveRequestedRoute(route);
    if (state.isDestroying) {
        logger.debug({
            action: 'render.skip',
            message: 'route 渲染被跳过：runtime 正在销毁',
            context: buildRouteRequestContext(nextRoute, getActiveRouteRenderToken(state), opts),
        });
        return Promise.resolve(false);
    }

    if (state.isPhoneActive === false) {
        markPhoneRouteRefreshPending(opts.reason || 'route-request', state);
        logger.debug({
            action: 'render.defer',
            message: 'route 渲染已延后：小手机当前隐藏',
            context: buildRouteRequestContext(nextRoute, getActiveRouteRenderToken(state), opts),
        });
        return Promise.resolve(true);
    }

    const renderToken = bumpRouteRenderToken(state);
    const requestContext = buildRouteRequestContext(nextRoute, renderToken, opts);

    logger.debug({
        action: 'render.request',
        message: '请求 route 渲染',
        context: requestContext,
    });

    return routeRuntimeDeps.renderPhoneRoute(nextRoute, {
        ...opts,
        renderToken,
    }).then((result) => {
        if (result === false && state.isPhoneActive === false) {
            markPhoneRouteRefreshPending(opts.reason || 'route-render-inactive', state);
            return true;
        }
        if (result === false) {
            rollbackFailedRouteRequest(nextRoute, { ...opts, renderToken }, state);
        }
        return result;
    }).catch((error) => {
        if (state.isPhoneActive === false) {
            markPhoneRouteRefreshPending(opts.reason || 'route-render-inactive', state);
            return true;
        }
        rollbackFailedRouteRequest(nextRoute, { ...opts, renderToken }, state);
        logger.error({
            action: 'render.request',
            message: 'route 渲染请求失败',
            context: requestContext,
            error,
        });
        return false;
    });
}

export function requestCurrentPhoneRouteRender(opts = {}) {
    return requestPhoneRouteRender(routeRuntimeDeps.getCurrentRoute(), {
        ...opts,
        requestMode: 'current',
    });
}

export function requestHomePhoneRouteRender(opts = {}) {
    return requestPhoneRouteRender('home', {
        ...opts,
        requestMode: 'home',
    });
}

export function ensureRouteRuntimeSubscription(state = routeRuntimeDeps.getPhoneCoreState()) {
    if (typeof state.routeRenderCleanup === 'function') {
        return false;
    }

    state.routeRenderCleanup = routeRuntimeDeps.onRouteChange((route, opts) => {
        void requestPhoneRouteRender(route, opts);
    });
    state.routeRenderRegistered = true;

    logger.debug({
        action: 'subscription.bind',
        message: 'route 渲染订阅已注册',
    });
    return true;
}

export function clearRouteRuntimeSubscription(state = routeRuntimeDeps.getPhoneCoreState()) {
    if (typeof state.routeRenderCleanup === 'function') {
        try {
            state.routeRenderCleanup();
        } catch (error) {
            logger.warn({
                action: 'subscription.clear',
                message: 'route 渲染订阅清理失败',
                error,
            });
        }
    }

    state.routeRenderCleanup = null;
    state.routeRenderRegistered = false;
    bumpRouteRenderToken(state);

    logger.debug({
        action: 'subscription.clear',
        message: 'route 渲染订阅已清理',
        context: {
            renderToken: getActiveRouteRenderToken(state),
        },
    });
    return true;
}
