import { handleDockAction } from './actions.js';

const HOME_GRID_BOUND_FLAG = 'homeGridInteractionsBound';
const HOME_DOCK_BOUND_FLAG = 'homeDockInteractionsBound';
const HOME_DOCK_APPS_REF = 'homeDockAppsRef';

function addRuntimeListener(runtime, target, type, handler, options) {
    if (!target || typeof target.addEventListener !== 'function' || typeof handler !== 'function') {
        return () => {};
    }
    if (runtime && typeof runtime.addEventListener === 'function') {
        const cleanup = runtime.addEventListener(target, type, handler, options);
        return typeof cleanup === 'function' ? cleanup : () => {};
    }
    target.addEventListener(type, handler, options);
    return () => target.removeEventListener(type, handler, options);
}

function addRuntimeCleanup(runtime, cleanup) {
    if (typeof cleanup !== 'function') return;
    if (runtime && typeof runtime.registerCleanup === 'function') {
        runtime.registerCleanup(cleanup);
    }
}

function isRuntimeDisposed(runtime) {
    return Boolean(runtime && typeof runtime.isDisposed === 'function' && runtime.isDisposed());
}

function scheduleRuntimeTimeout(runtime, callback, delay) {
    if (runtime && typeof runtime.setTimeout === 'function') {
        return runtime.setTimeout(callback, delay);
    }
    return window.setTimeout(callback, delay);
}

export function bindHomeGridInteractions(grid, deps = {}) {
    const { navigateTo, runtime } = deps;
    if (!(grid instanceof HTMLElement)) return;

    if (grid.dataset[HOME_GRID_BOUND_FLAG] === 'true') {
        return;
    }

    grid.dataset[HOME_GRID_BOUND_FLAG] = 'true';
    addRuntimeCleanup(runtime, () => {
        if (grid.dataset[HOME_GRID_BOUND_FLAG] === 'true') {
            delete grid.dataset[HOME_GRID_BOUND_FLAG];
        }
    });

    addRuntimeListener(runtime, grid, 'click', (e) => {
        if (isRuntimeDisposed(runtime)) return;
        const target = e.target instanceof Element ? e.target : null;
        if (!target) return;
        const appEl = target.closest('.phone-app-item');
        if (!(appEl instanceof HTMLElement) || !grid.contains(appEl)) return;

        const sheetKey = String(appEl.dataset.sheetKey || '').trim();
        if (!sheetKey) return;

        const icon = appEl.querySelector('.phone-app-icon');
        if (icon instanceof HTMLElement) {
            icon.classList.add('phone-app-tap');
            scheduleRuntimeTimeout(runtime, () => icon.classList.remove('phone-app-tap'), 180);
        }

        // 系统 app（如变量管理器）使用 data-route 直接导航
        const systemRoute = String(appEl.dataset.route || '').trim();

        scheduleRuntimeTimeout(runtime, () => {
            if (isRuntimeDisposed(runtime) || typeof navigateTo !== 'function') return;
            if (systemRoute) {
                navigateTo(systemRoute);
            } else {
                navigateTo(`app:${sheetKey}`);
            }
        }, 150);
    }, { passive: true });
}

export function bindHomeDockInteractions(dock, dockApps, container, deps = {}) {
    const {
        navigateTo,
        openVisualizerWithStatus,
        openDatabaseSettingsWithStatus,
        runtime,
    } = deps;

    if (!(dock instanceof HTMLElement)) return;

    dock[HOME_DOCK_APPS_REF] = Array.isArray(dockApps) ? dockApps : [];

    if (dock.dataset[HOME_DOCK_BOUND_FLAG] === 'true') {
        return;
    }

    dock.dataset[HOME_DOCK_BOUND_FLAG] = 'true';
    addRuntimeCleanup(runtime, () => {
        if (dock.dataset[HOME_DOCK_BOUND_FLAG] === 'true') {
            delete dock.dataset[HOME_DOCK_BOUND_FLAG];
        }
        delete dock[HOME_DOCK_APPS_REF];
    });

    addRuntimeListener(runtime, dock, 'click', (e) => {
        if (isRuntimeDisposed(runtime)) return;
        const target = e.target instanceof Element ? e.target : null;
        if (!target) return;

        const itemEl = target.closest('.phone-dock-item');
        if (!(itemEl instanceof HTMLElement) || !dock.contains(itemEl)) return;

        const appId = String(itemEl.dataset.dockAppId || '').trim();
        if (!appId) return;

        const dockAppsRef = Array.isArray(dock[HOME_DOCK_APPS_REF])
            ? dock[HOME_DOCK_APPS_REF]
            : [];
        const app = dockAppsRef.find((it) => String(it.id) === appId);
        if (!app) return;

        const iconEl = itemEl.querySelector('.phone-app-icon');
        if (iconEl instanceof HTMLElement) {
            iconEl.classList.add('phone-app-tap');
            scheduleRuntimeTimeout(runtime, () => iconEl.classList.remove('phone-app-tap'), 180);
        }
        scheduleRuntimeTimeout(runtime, () => {
            if (isRuntimeDisposed(runtime)) return;
            handleDockAction(app, container, {
                navigateTo,
                openVisualizerWithStatus,
                openDatabaseSettingsWithStatus,
                runtime,
            });
        }, 150);
    }, { passive: true });
}
