import { createRuntimeScope } from '../runtime-manager.js';

export const PHONE_DEFAULT_ROUTE = 'home';
export const MAX_ROUTE_HISTORY = 30;

function createPhoneRuntimeScope() {
    return createRuntimeScope('phone-core');
}

export let phoneRuntime = createPhoneRuntimeScope();

export function resetPhoneRuntimeScope() {
    phoneRuntime.dispose();
    phoneRuntime = createPhoneRuntimeScope();
    return phoneRuntime;
}

function createInitialState() {
    return {
        currentRoute: PHONE_DEFAULT_ROUTE,
        routeHistory: [],
        phoneContainer: null,
        onRouteChangeCallbacks: [],
        isPhoneUiInitialized: false,
        isPhoneActive: false,
        pendingRouteRefresh: false,
        pendingRouteRefreshReason: '',
        isDestroying: false,
        statusClockTimerId: null,
        shellInteractionTimerId: null,
        shellAppControls: null,
        shellAppControlsRouteCleanup: null,
        routeRenderRegistered: false,
        routeRenderCleanup: null,
        routeRenderToken: 0,
        idleApiDebugCancel: null,
        currentViewingSheetKey: null,
        lastDataVersion: null,
        registeredTableUpdateCallback: null,
        registeredTableFillStartCallback: null,
    };
}

const state = createInitialState();

export function getPhoneCoreState() {
    return state;
}

export function markPhoneRouteRefreshPending(reason = '', targetState = state) {
    if (!targetState || typeof targetState !== 'object' || targetState.isPhoneActive !== false) {
        return false;
    }

    targetState.pendingRouteRefresh = true;
    targetState.pendingRouteRefreshReason = String(reason || '').trim();
    return true;
}

export function consumePhoneRouteRefreshPending(targetState = state) {
    if (!targetState || typeof targetState !== 'object') return false;

    const pending = targetState.pendingRouteRefresh === true;
    targetState.pendingRouteRefresh = false;
    targetState.pendingRouteRefreshReason = '';
    return pending;
}

export function resetPhoneCoreState() {
    const next = createInitialState();
    state.currentRoute = next.currentRoute;
    state.routeHistory = next.routeHistory;
    state.phoneContainer = next.phoneContainer;
    state.onRouteChangeCallbacks = next.onRouteChangeCallbacks;
    state.isPhoneUiInitialized = next.isPhoneUiInitialized;
    state.isPhoneActive = next.isPhoneActive;
    state.pendingRouteRefresh = next.pendingRouteRefresh;
    state.pendingRouteRefreshReason = next.pendingRouteRefreshReason;
    state.isDestroying = next.isDestroying;
    state.statusClockTimerId = next.statusClockTimerId;
    state.shellInteractionTimerId = next.shellInteractionTimerId;
    state.shellAppControls = next.shellAppControls;
    state.shellAppControlsRouteCleanup = next.shellAppControlsRouteCleanup;
    state.routeRenderRegistered = next.routeRenderRegistered;
    state.routeRenderCleanup = next.routeRenderCleanup;
    state.routeRenderToken = next.routeRenderToken;
    state.idleApiDebugCancel = next.idleApiDebugCancel;
    state.currentViewingSheetKey = next.currentViewingSheetKey;
    state.lastDataVersion = next.lastDataVersion;
    state.registeredTableUpdateCallback = next.registeredTableUpdateCallback;
    state.registeredTableFillStartCallback = next.registeredTableFillStartCallback;
}
