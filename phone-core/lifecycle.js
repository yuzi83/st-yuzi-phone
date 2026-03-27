import { Logger } from '../error-handler.js';
import { scheduleIdleTask } from '../runtime-manager.js';
import { destroyPhoneWindowInteractions, initPhoneShellDrag, initPhoneShellResize } from '../window.js';
import { unregisterTableFillStartListener, unregisterTableUpdateListener, initSmartRefreshListener } from './callbacks.js';
import { debugCheckAPI } from './data-api.js';
import { getPhoneCoreState, phoneRuntime, resetPhoneCoreState } from './state.js';
import { startDataWatcherForNotifications, stopDataWatcherForNotifications } from './notifications.js';
import {
    ensureRouteRuntimeSubscription,
    clearRouteRuntimeSubscription,
    requestCurrentPhoneRouteRender,
    requestHomePhoneRouteRender,
    requestPhoneRouteRender,
} from './route-runtime.js';
import { buildPhoneShellHtml, updatePhoneStatusBarTime } from './shell-ui.js';

const logger = Logger.withScope({ scope: 'phone-core/lifecycle', feature: 'lifecycle' });
const STATUS_CLOCK_INTERVAL_MS = 30000;
const SHELL_INTERACTION_DELAY_MS = 100;
const lifecycleRouteRequestDeps = {
    requestPhoneRouteRender: (route, opts) => requestPhoneRouteRender(route, opts),
    requestCurrentPhoneRouteRender: (opts) => requestCurrentPhoneRouteRender(opts),
    requestHomePhoneRouteRender: (opts) => requestHomePhoneRouteRender(opts),
};

export function __test__setLifecycleRouteRequestDeps(overrides = {}) {
    if (!overrides || typeof overrides !== 'object') return;
    Object.assign(lifecycleRouteRequestDeps, overrides);
}

export function getPhoneContainer() {
    return getPhoneCoreState().phoneContainer;
}

function clearStatusClockTimer(state = getPhoneCoreState()) {
    if (state.statusClockTimerId === null) return;
    phoneRuntime.clearInterval(state.statusClockTimerId);
    state.statusClockTimerId = null;
}

function startStatusClock(state = getPhoneCoreState()) {
    if (!(state.phoneContainer instanceof HTMLElement)) {
        return false;
    }

    updatePhoneStatusBarTime(state.phoneContainer);
    clearStatusClockTimer(state);
    state.statusClockTimerId = phoneRuntime.setInterval(() => {
        updatePhoneStatusBarTime(getPhoneCoreState().phoneContainer);
    }, STATUS_CLOCK_INTERVAL_MS);

    logger.debug({
        action: 'status-clock.start',
        message: '状态栏时钟已启动',
    });
    return true;
}

function clearIdleApiDebugTask(state = getPhoneCoreState()) {
    if (!state.idleApiDebugCancel) return;
    state.idleApiDebugCancel();
    state.idleApiDebugCancel = null;
}

function scheduleIdleApiDebugTask(state = getPhoneCoreState()) {
    clearIdleApiDebugTask(state);
    state.idleApiDebugCancel = scheduleIdleTask(() => {
        debugCheckAPI();
        getPhoneCoreState().idleApiDebugCancel = null;
    }, { timeout: 1200 });
}

function clearShellInteractionTimer(state = getPhoneCoreState()) {
    if (state.shellInteractionTimerId === null) return;
    phoneRuntime.clearTimeout(state.shellInteractionTimerId);
    state.shellInteractionTimerId = null;
}

function scheduleShellWindowInteractions(state = getPhoneCoreState()) {
    clearShellInteractionTimer(state);
    state.shellInteractionTimerId = phoneRuntime.setTimeout(() => {
        const currentState = getPhoneCoreState();
        currentState.shellInteractionTimerId = null;
        if (currentState.isDestroying || !currentState.phoneContainer?.isConnected) {
            return;
        }

        initPhoneShellDrag();
        initPhoneShellResize();
    }, SHELL_INTERACTION_DELAY_MS);
}

function syncNotificationWatcher(active, state = getPhoneCoreState(), options = {}) {
    const shouldStart = !!active
        && !!state.isPhoneActive
        && (options.force === true || !!state.isPhoneUiInitialized)
        && !document.hidden;

    if (shouldStart) {
        startDataWatcherForNotifications();
        logger.debug({
            action: 'notifications.start',
            message: '通知 watcher 已启动',
            context: {
                force: !!options.force,
            },
        });
        return true;
    }

    stopDataWatcherForNotifications();
    logger.debug({
        action: 'notifications.stop',
        message: '通知 watcher 已停止',
        context: {
            reason: active ? 'document-hidden-or-ui-inactive' : 'inactive',
        },
    });
    return false;
}

function ensureRouteRenderSubscription(state = getPhoneCoreState()) {
    return ensureRouteRuntimeSubscription(state);
}

function clearRouteRenderSubscription(state = getPhoneCoreState()) {
    return clearRouteRuntimeSubscription(state);
}

function clearVisibilityLifecycle(state = getPhoneCoreState()) {
    if (typeof state.visibilityCleanup === 'function') {
        state.visibilityCleanup();
        state.visibilityCleanup = null;
    }
}

function ensureVisibilityLifecycle(state = getPhoneCoreState()) {
    if (state.visibilityCleanup) {
        return false;
    }

    state.visibilityCleanup = phoneRuntime.addEventListener(document, 'visibilitychange', () => {
        const currentState = getPhoneCoreState();
        syncNotificationWatcher(!document.hidden, currentState);
    });

    return true;
}

function initializePhoneRuntimeBindings(state = getPhoneCoreState()) {
    ensureRouteRenderSubscription(state);
    scheduleIdleApiDebugTask(state);
    initSmartRefreshListener();
    scheduleShellWindowInteractions(state);
    ensureVisibilityLifecycle(state);

    logger.debug({
        action: 'bindings.init',
        message: 'phone runtime 绑定已初始化',
    });
}

function requestPhoneRuntimeActivationRoute(options = {}) {
    if (options.requestRoute === false) {
        return false;
    }

    if (options.routeMode === 'home') {
        void lifecycleRouteRequestDeps.requestHomePhoneRouteRender(options.requestOptions);
        return 'home';
    }

    if (typeof options.route === 'string' && options.route) {
        void lifecycleRouteRequestDeps.requestPhoneRouteRender(options.route, {
            ...options.requestOptions,
            requestMode: 'explicit',
        });
        return 'explicit';
    }

    void lifecycleRouteRequestDeps.requestCurrentPhoneRouteRender(options.requestOptions);
    return 'current';
}

export function __test__requestPhoneRuntimeActivationRoute(options = {}) {
    return requestPhoneRuntimeActivationRoute(options);
}

function activatePhoneRuntimeState(state = getPhoneCoreState(), options = {}) {
    state.isDestroying = false;
    state.isPhoneActive = true;
    startStatusClock(state);
    syncNotificationWatcher(true, state, { force: true });
    requestPhoneRuntimeActivationRoute(options);
}

function deactivatePhoneRuntimeState(state = getPhoneCoreState()) {
    state.isPhoneActive = false;
    syncNotificationWatcher(false, state);
    clearStatusClockTimer(state);
    clearShellInteractionTimer(state);
}

function cleanupPhoneRuntimeBindings(state = getPhoneCoreState()) {
    clearIdleApiDebugTask(state);
    clearVisibilityLifecycle(state);
    clearRouteRenderSubscription(state);
    unregisterTableUpdateListener();
    unregisterTableFillStartListener();
    destroyPhoneWindowInteractions();

    logger.debug({
        action: 'bindings.destroy',
        message: 'phone runtime 绑定已清理',
    });
}

export function initPhoneUI() {
    const $container = $('#yuzi-phone-standalone');
    if (!$container.length) {
        logger.warn({
            action: 'ui.init',
            message: 'phone 容器不存在，初始化跳过',
        });
        return false;
    }

    const state = getPhoneCoreState();
    if (state.isDestroying) {
        logger.debug({
            action: 'ui.init.skip',
            message: 'runtime 正在销毁，初始化跳过',
        });
        return false;
    }

    state.phoneContainer = $container[0];

    $container.html(buildPhoneShellHtml());
    state.isPhoneUiInitialized = true;

    initializePhoneRuntimeBindings(state);
    activatePhoneRuntimeState(state, { routeMode: 'home' });

    logger.info({
        action: 'ui.init',
        message: 'phone UI 已初始化',
        context: { route: 'home' },
    });
    return true;
}

export function onPhoneActivated() {
    const state = getPhoneCoreState();
    if (state.isDestroying) return;

    if (!state.phoneContainer || !state.phoneContainer.isConnected) {
        initPhoneUI();
        return;
    }

    activatePhoneRuntimeState(state);

    logger.debug({
        action: 'activate',
        message: 'phone runtime 已激活',
    });
}

export function onPhoneDeactivated() {
    const state = getPhoneCoreState();
    deactivatePhoneRuntimeState(state);

    logger.debug({
        action: 'deactivate',
        message: 'phone runtime 已停用',
    });
}

export function destroyPhoneRuntime() {
    const state = getPhoneCoreState();
    if (state.isDestroying) return false;

    state.isDestroying = true;
    deactivatePhoneRuntimeState(state);
    cleanupPhoneRuntimeBindings(state);
    phoneRuntime.dispose();
    resetPhoneCoreState();

    logger.info({
        action: 'destroy',
        message: 'phone runtime 已销毁',
    });
    return true;
}
