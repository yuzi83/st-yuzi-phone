// modules/phone/phone-home.js
/**
 * 玉子的手机 - iOS 主屏
 * 动态 App 图标网格、SVG 图标系统、Dock 栏
 */

import {
    getTableData,
    getSheetKeys,
    openVisualizerWithStatus,
    openDatabaseSettingsWithStatus,
} from './phone-core/data-api.js';
import { navigateTo } from './phone-core/routing.js';
import { getPhoneSettings } from './settings.js';
import { clampNumber, escapeHtmlAttr } from './utils.js';
import { buildHomeScreenViewModel } from './phone-home/view-model.js';
import { bindHomeDockInteractions, bindHomeGridInteractions } from './phone-home/interactions.js';
import { buildHomeShellStyleText, buildHomeShellHtml, buildHomeAppItemHtml, buildDockItemHtml } from './phone-home/templates.js';

export { PHONE_ICONS } from './phone-home/icons.js';

export function renderHomeScreen(container) {
    if (!(container instanceof HTMLElement)) return;

    const rawData = getTableData();
    const phoneSettings = getPhoneSettings();

    const appIconSize = clampNumber(phoneSettings.appIconSize, 40, 88, 60);
    const appIconRadius = clampNumber(phoneSettings.appIconRadius, 6, 26, 14);
    const appGridColumns = clampNumber(phoneSettings.appGridColumns, 3, 6, 4);
    const appGridGap = clampNumber(phoneSettings.appGridGap, 8, 24, 12);
    const dockIconSize = clampNumber(phoneSettings.dockIconSize, 32, 72, 48);

    const bgStyle = phoneSettings.backgroundImage
        ? `background-image: url(${escapeHtmlAttr(phoneSettings.backgroundImage)}); background-size: cover; background-position: center;`
        : '';

    const homeShellStyle = buildHomeShellStyleText({
        bgStyle,
        appIconSize,
        appIconRadius,
        appGridColumns,
        appGridGap,
        dockIconSize,
    });

    container.innerHTML = buildHomeShellHtml(homeShellStyle);

    const grid = container.querySelector('.phone-app-grid');
    const dock = container.querySelector('.phone-dock');

    const viewModel = buildHomeScreenViewModel(rawData, phoneSettings, { getSheetKeys });

    if (grid instanceof HTMLElement) {
        viewModel.apps.forEach((item) => {
            const app = document.createElement('div');
            app.className = 'phone-app-item';
            app.dataset.sheetKey = item.key;
            if (item.route) {
                app.dataset.route = item.route;
            }
            app.style.animationDelay = item.animationDelay;
            app.innerHTML = buildHomeAppItemHtml(item.iconHtml, item.name);

            if (item.badgeText) {
                const badge = document.createElement('div');
                badge.className = 'phone-notif-badge phone-table-count-badge';
                badge.textContent = item.badgeText;
                badge.setAttribute('aria-label', `总条目数 ${item.totalCount}`);
                const iconWrap = app.querySelector('.phone-app-icon');
                if (iconWrap) iconWrap.appendChild(badge);
            }

            grid.appendChild(app);
        });
    }

    bindHomeGridInteractions(grid, { navigateTo });

    if (dock instanceof HTMLElement) {
        viewModel.dockApps.forEach((app) => {
            const el = document.createElement('div');
            el.className = `phone-dock-item phone-dock-item-${app.safeAppIdClass}`;
            el.innerHTML = buildDockItemHtml(app.iconHtml, app.name);
            el.dataset.dockAppId = app.id;
            dock.appendChild(el);
        });
    }

    bindHomeDockInteractions(dock, viewModel.dockApps, container, {
        navigateTo,
        openVisualizerWithStatus,
        openDatabaseSettingsWithStatus,
    });
}
