import { Logger } from '../error-handler.js';
import { getPhoneCoreState, MAX_ROUTE_HISTORY, PHONE_DEFAULT_ROUTE } from './state.js';

function pushRouteHistory(route) {
    if (!route || typeof route !== 'string') return;

    const state = getPhoneCoreState();
    state.routeHistory.push({
        route,
        timestamp: Date.now(),
    });

    while (state.routeHistory.length > MAX_ROUTE_HISTORY) {
        state.routeHistory.shift();
    }
}

function emitRouteChange(route, opts = {}) {
    const state = getPhoneCoreState();
    state.onRouteChangeCallbacks.slice().forEach((callback) => {
        try {
            callback(route, opts);
        } catch (error) {
            Logger.warn('[玉子的手机] route callback failed:', error);
        }
    });
}

export function clearRouteHistory() {
    const state = getPhoneCoreState();
    state.routeHistory = [];
}

export function getRouteHistory() {
    return [...getPhoneCoreState().routeHistory];
}

export function getCurrentRoute() {
    return getPhoneCoreState().currentRoute;
}

export function navigateTo(route, opts = {}) {
    const state = getPhoneCoreState();
    if (state.currentRoute !== PHONE_DEFAULT_ROUTE) {
        pushRouteHistory(state.currentRoute);
    }
    state.currentRoute = route;
    emitRouteChange(route, opts);
}

export function navigateBack() {
    const state = getPhoneCoreState();
    const lastEntry = state.routeHistory.pop();
    const previousRoute = lastEntry?.route || PHONE_DEFAULT_ROUTE;
    state.currentRoute = previousRoute;
    emitRouteChange(previousRoute, { isBack: true });
    return previousRoute;
}

export function onRouteChange(callback) {
    if (typeof callback !== 'function') return () => {};

    const state = getPhoneCoreState();
    state.onRouteChangeCallbacks.push(callback);

    return () => {
        state.onRouteChangeCallbacks = state.onRouteChangeCallbacks.filter((item) => item !== callback);
    };
}
