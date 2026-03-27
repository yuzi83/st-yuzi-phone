import { createRuntimeScope } from '../runtime-manager.js';

export const PHONE_DEFAULT_ROUTE = 'home';
export const MAX_ROUTE_HISTORY = 30;
export const phoneRuntime = createRuntimeScope('phone-core');

function createInitialState() {
    return {
        currentRoute: PHONE_DEFAULT_ROUTE,
        routeHistory: [],
        phoneContainer: null,
        onRouteChangeCallbacks: [],
        isPhoneUiInitialized: false,
        isPhoneActive: false,
        isDestroying: false,
        statusClockTimerId: null,
        shellInteractionTimerId: null,
        routeRenderRegistered: false,
        routeRenderCleanup: null,
        routeRenderToken: 0,
        dataWatcherTimerId: null,
        visibilityCleanup: null,
        idleApiDebugCancel: null,
        lastTableRowsCount: {},
        unreadCounts: {},
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

export function resetPhoneCoreState() {
    const next = createInitialState();
    state.currentRoute = next.currentRoute;
    state.routeHistory = next.routeHistory;
    state.phoneContainer = next.phoneContainer;
    state.onRouteChangeCallbacks = next.onRouteChangeCallbacks;
    state.isPhoneUiInitialized = next.isPhoneUiInitialized;
    state.isPhoneActive = next.isPhoneActive;
    state.isDestroying = next.isDestroying;
    state.statusClockTimerId = next.statusClockTimerId;
    state.shellInteractionTimerId = next.shellInteractionTimerId;
    state.routeRenderRegistered = next.routeRenderRegistered;
    state.routeRenderCleanup = next.routeRenderCleanup;
    state.routeRenderToken = next.routeRenderToken;
    state.dataWatcherTimerId = next.dataWatcherTimerId;
    state.visibilityCleanup = next.visibilityCleanup;
    state.idleApiDebugCancel = next.idleApiDebugCancel;
    state.lastTableRowsCount = next.lastTableRowsCount;
    state.unreadCounts = next.unreadCounts;
    state.currentViewingSheetKey = next.currentViewingSheetKey;
    state.lastDataVersion = next.lastDataVersion;
    state.registeredTableUpdateCallback = next.registeredTableUpdateCallback;
    state.registeredTableFillStartCallback = next.registeredTableFillStartCallback;
}
