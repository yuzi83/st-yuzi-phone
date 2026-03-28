import { handleDockAction } from './actions.js';

export function bindHomeGridInteractions(grid, deps = {}) {
    const { navigateTo } = deps;
    if (!(grid instanceof HTMLElement)) return;

    grid.addEventListener('click', (e) => {
        const target = e.target instanceof Element ? e.target : null;
        if (!target) return;
        const appEl = target.closest('.phone-app-item');
        if (!(appEl instanceof HTMLElement) || !grid.contains(appEl)) return;

        const sheetKey = String(appEl.dataset.sheetKey || '').trim();
        if (!sheetKey) return;

        const icon = appEl.querySelector('.phone-app-icon');
        if (icon instanceof HTMLElement) {
            icon.classList.add('phone-app-tap');
        }

        // 系统 app（如变量管理器）使用 data-route 直接导航
        const systemRoute = String(appEl.dataset.route || '').trim();

        setTimeout(() => {
            if (typeof navigateTo === 'function') {
                if (systemRoute) {
                    navigateTo(systemRoute);
                } else {
                    navigateTo(`app:${sheetKey}`);
                }
            }
        }, 150);
    }, { passive: true });
}

export function bindHomeDockInteractions(dock, dockApps, container, deps = {}) {
    const {
        navigateTo,
        openVisualizerWithStatus,
        openDatabaseSettingsWithStatus,
    } = deps;

    if (!(dock instanceof HTMLElement)) return;

    dock.addEventListener('click', (e) => {
        const target = e.target instanceof Element ? e.target : null;
        if (!target) return;

        const itemEl = target.closest('.phone-dock-item');
        if (!(itemEl instanceof HTMLElement) || !dock.contains(itemEl)) return;

        const appId = String(itemEl.dataset.dockAppId || '').trim();
        if (!appId) return;

        const app = Array.isArray(dockApps)
            ? dockApps.find((it) => String(it.id) === appId)
            : null;
        if (!app) return;

        const iconEl = itemEl.querySelector('.phone-app-icon');
        if (iconEl instanceof HTMLElement) {
            iconEl.classList.add('phone-app-tap');
            setTimeout(() => iconEl.classList.remove('phone-app-tap'), 180);
        }
        setTimeout(() => {
            handleDockAction(app, container, {
                navigateTo,
                openVisualizerWithStatus,
                openDatabaseSettingsWithStatus,
            });
        }, 150);
    }, { passive: true });
}
