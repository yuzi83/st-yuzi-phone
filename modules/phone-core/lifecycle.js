import { scheduleIdleTask } from '../runtime-manager.js';
import { destroyPhoneWindowInteractions, initPhoneShellDrag, initPhoneShellResize } from '../window.js';
import { unregisterTableFillStartListener, unregisterTableUpdateListener, initSmartRefreshListener } from './callbacks.js';
import { debugCheckAPI } from './data-api.js';
import { getCurrentRoute, onRouteChange } from './routing.js';
import { getPhoneCoreState, phoneRuntime, resetPhoneCoreState } from './state.js';
import { startDataWatcherForNotifications, stopDataWatcherForNotifications } from './notifications.js';
import { buildPhoneShellHtml, updatePhoneStatusBarTime } from './shell-ui.js';
import { renderPhoneRoute } from './route-renderer.js';

export function getPhoneContainer() {
    return getPhoneCoreState().phoneContainer;
}

export function initPhoneUI() {
    const $container = $('#yuzi-phone-standalone');
    if (!$container.length) return;

    const state = getPhoneCoreState();
    state.phoneContainer = $container[0];

    $container.html(buildPhoneShellHtml());

    updatePhoneStatusBarTime(state.phoneContainer);
    if (state.statusClockTimerId !== null) {
        phoneRuntime.clearInterval(state.statusClockTimerId);
    }
    state.statusClockTimerId = phoneRuntime.setInterval(() => {
        updatePhoneStatusBarTime(getPhoneCoreState().phoneContainer);
    }, 30000);

    if (!state.routeRenderRegistered) {
        onRouteChange((route, opts) => {
            renderPhoneRoute(route, opts);
        });
        state.routeRenderRegistered = true;
    }

    if (state.idleApiDebugCancel) {
        state.idleApiDebugCancel();
        state.idleApiDebugCancel = null;
    }

    state.idleApiDebugCancel = scheduleIdleTask(() => {
        debugCheckAPI();
        getPhoneCoreState().idleApiDebugCancel = null;
    }, { timeout: 1200 });

    startDataWatcherForNotifications();
    initSmartRefreshListener();

    renderPhoneRoute('home');

    phoneRuntime.setTimeout(() => {
        if (!getPhoneCoreState().phoneContainer?.isConnected) return;
        initPhoneShellDrag();
        initPhoneShellResize();
    }, 100);

    if (!state.visibilityCleanup) {
        state.visibilityCleanup = phoneRuntime.addEventListener(document, 'visibilitychange', () => {
            const currentState = getPhoneCoreState();
            if (document.hidden) {
                stopDataWatcherForNotifications();
            } else if (currentState.isPhoneUiInitialized) {
                startDataWatcherForNotifications();
            }
        });
    }

    state.isPhoneUiInitialized = true;
}

export function onPhoneActivated() {
    const state = getPhoneCoreState();
    if (!state.phoneContainer) {
        initPhoneUI();
    } else {
        if (state.statusClockTimerId === null) {
            updatePhoneStatusBarTime(state.phoneContainer);
            state.statusClockTimerId = phoneRuntime.setInterval(() => {
                updatePhoneStatusBarTime(getPhoneCoreState().phoneContainer);
            }, 30000);
        }
        startDataWatcherForNotifications();
        renderPhoneRoute(getCurrentRoute());
    }
}

export function onPhoneDeactivated() {
    const state = getPhoneCoreState();
    stopDataWatcherForNotifications();
    if (state.statusClockTimerId !== null) {
        phoneRuntime.clearInterval(state.statusClockTimerId);
        state.statusClockTimerId = null;
    }
}

export function destroyPhoneRuntime() {
    const state = getPhoneCoreState();
    stopDataWatcherForNotifications();

    if (state.idleApiDebugCancel) {
        state.idleApiDebugCancel();
        state.idleApiDebugCancel = null;
    }

    if (state.visibilityCleanup) {
        state.visibilityCleanup();
        state.visibilityCleanup = null;
    }

    unregisterTableUpdateListener();
    unregisterTableFillStartListener();

    destroyPhoneWindowInteractions();
    phoneRuntime.dispose();
    resetPhoneCoreState();
}
