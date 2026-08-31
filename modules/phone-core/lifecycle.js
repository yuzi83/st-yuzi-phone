import { Logger } from '../error-handler.js';
import { scheduleIdleTask } from '../runtime-manager.js';
import {
    applyAppearanceFontLibrary,
    applyPhoneThemeMode,
    applyReadableTextScale,
} from '../settings-app/services/appearance-settings.js';
import { destroyPhoneWindowInteractions } from '../window/runtime.js';
import { initPhoneShellDrag } from '../window/drag.js';
import { initPhoneShellResize } from '../window/resize.js';
import { unregisterTableFillStartListener, unregisterTableUpdateListener, initSmartRefreshListener } from './callbacks.js';
import { debugCheckAPI } from './data-api.js';
import {
    consumePhoneRouteRefreshPending,
    getPhoneCoreState,
    phoneRuntime,
    resetPhoneCoreState,
    resetPhoneRuntimeScope,
} from './state.js';
import { getCurrentRoute, navigateTo, onRouteChange } from './routing.js';
import { bindPhoneShellAppControls } from './shell-app-controls.js';
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

function disposeShellAppControls(state = getPhoneCoreState()) {
    state.shellAppControlsRouteCleanup?.();
    state.shellAppControlsRouteCleanup = null;
    state.shellAppControls?.dispose?.();
    state.shellAppControls = null;
}

function initializeShellAppControls(state = getPhoneCoreState()) {
    disposeShellAppControls(state);
    if (!state.phoneContainer) return;

    state.shellAppControls = bindPhoneShellAppControls(state.phoneContainer, {
        getCurrentRoute,
        navigateTo,
    });
    state.shellAppControlsRouteCleanup = onRouteChange(() => {
        state.shellAppControls?.refresh?.();
    });
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

function ensureRouteRenderSubscription(state = getPhoneCoreState()) {
    return ensureRouteRuntimeSubscription(state);
}

function clearRouteRenderSubscription(state = getPhoneCoreState()) {
    return clearRouteRuntimeSubscription(state);
}

function initializePhoneRuntimeBindings(state = getPhoneCoreState()) {
    ensureRouteRenderSubscription(state);
    scheduleIdleApiDebugTask(state);
    initSmartRefreshListener();
    scheduleShellWindowInteractions(state);

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

function hasCommittedPhoneRoutePage(state = getPhoneCoreState()) {
    const screen = state.phoneContainer?.querySelector?.('.yuzi-phone-screen');
    return !!screen?.querySelector?.('.phone-page.phone-page-active');
}

function activatePhoneRuntimeState(state = getPhoneCoreState(), options = {}) {
    state.isDestroying = false;
    state.isPhoneActive = true;
    startStatusClock(state);
    requestPhoneRuntimeActivationRoute(options);
}

function deactivatePhoneRuntimeState(state = getPhoneCoreState()) {
    state.isPhoneActive = false;
    clearStatusClockTimer(state);
    clearShellInteractionTimer(state);
}

function cleanupPhoneRuntimeBindings(state = getPhoneCoreState()) {
    clearIdleApiDebugTask(state);
    clearRouteRenderSubscription(state);
    unregisterTableUpdateListener();
    unregisterTableFillStartListener();
    destroyPhoneWindowInteractions();
    disposeShellAppControls(state);

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
    initializeShellAppControls(state);
    applyAppearanceFontLibrary(state.phoneContainer);
    applyPhoneThemeMode();
    applyReadableTextScale(state.phoneContainer);
    state.isPhoneUiInitialized = true;

    initializePhoneRuntimeBindings(state);
    consumePhoneRouteRefreshPending(state);
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

    applyAppearanceFontLibrary(state.phoneContainer);
    applyPhoneThemeMode();
    applyReadableTextScale(state.phoneContainer);
    const shouldRefreshRoute = consumePhoneRouteRefreshPending(state)
        || !hasCommittedPhoneRoutePage(state);
    activatePhoneRuntimeState(state, { requestRoute: shouldRefreshRoute });

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
    resetPhoneRuntimeScope();
    resetPhoneCoreState();

    logger.info({
        action: 'destroy',
        message: 'phone runtime 已销毁',
    });
    return true;
}
