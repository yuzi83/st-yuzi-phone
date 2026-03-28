import { escapeHtmlAttr } from '../utils.js';
import { formatTableCountBadge, getHomeDockApps, getSheetRowCount, normalizeHiddenTableApps } from './home-data.js';
import { getIconForSheet } from './icons.js';
import { VARIABLE_MANAGER_APP, getVariableManagerIcon } from '../variable-manager/index.js';

export function buildHomeScreenViewModel(rawData, phoneSettings, deps = {}) {
    const { getSheetKeys } = deps;

    const hiddenTableApps = normalizeHiddenTableApps(phoneSettings?.hiddenTableApps);
    const hideTableCountBadge = !!phoneSettings?.hideTableCountBadge;

    const apps = [];

    if (!hiddenTableApps[VARIABLE_MANAGER_APP.id]) {
        const vmCustomIcon = phoneSettings?.appIcons?.[VARIABLE_MANAGER_APP.id] || '';
        const vmIconHtml = vmCustomIcon
            ? `<img src="${escapeHtmlAttr(vmCustomIcon)}" class="phone-app-icon-img" alt="${escapeHtmlAttr(VARIABLE_MANAGER_APP.name)}">`
            : `<div class="phone-app-icon-svg">${getVariableManagerIcon()}</div>`;
        apps.push({
            key: VARIABLE_MANAGER_APP.id,
            name: VARIABLE_MANAGER_APP.name,
            iconHtml: vmIconHtml,
            badgeText: '',
            totalCount: 0,
            animationDelay: '0s',
            isSystemApp: true,
            route: VARIABLE_MANAGER_APP.route,
            sortOrder: Number.POSITIVE_INFINITY,
            sortName: VARIABLE_MANAGER_APP.name,
        });
    }

    if (rawData && typeof getSheetKeys === 'function') {
        const sheetKeys = getSheetKeys(rawData);
        sheetKeys.forEach((key) => {
            if (hiddenTableApps[key]) return;

            const sheet = rawData[key];
            if (!sheet || !sheet.name) return;

            const name = String(sheet.name || key);
            const customIcon = phoneSettings?.appIcons?.[key] || '';
            const iconHtml = customIcon
                ? `<img src="${escapeHtmlAttr(customIcon)}" class="phone-app-icon-img" alt="${escapeHtmlAttr(name)}">`
                : `<div class="phone-app-icon-svg">${getIconForSheet(name)}</div>`;

            const totalCount = getSheetRowCount(sheet);
            const badgeText = hideTableCountBadge ? '' : formatTableCountBadge(totalCount);
            const sortOrder = Number.isFinite(sheet?.orderNo) ? Number(sheet.orderNo) : Number.POSITIVE_INFINITY;

            apps.push({
                key,
                name,
                iconHtml,
                badgeText,
                totalCount,
                animationDelay: '0s',
                sortOrder,
                sortName: name,
            });
        });
    }

    apps.sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) {
            return a.sortOrder - b.sortOrder;
        }
        return String(a.sortName || a.name || '').localeCompare(String(b.sortName || b.name || ''), 'zh-CN');
    });

    apps.forEach((item, index) => {
        item.animationDelay = `${index * 0.04}s`;
        delete item.sortOrder;
        delete item.sortName;
    });

    const dockApps = getHomeDockApps().map((app) => {
        const customIcon = phoneSettings?.appIcons?.[`dock_${app.id}`] || '';
        const iconHtml = customIcon
            ? `<img src="${escapeHtmlAttr(customIcon)}" class="phone-app-icon-img" alt="${escapeHtmlAttr(app.name)}">`
            : `<div class="phone-app-icon-svg">${app.icon}</div>`;

        return {
            ...app,
            iconHtml,
            safeAppIdClass: String(app.id || '').replace(/[^a-zA-Z0-9_-]/g, '').replace(/_/g, '-'),
        };
    });

    return {
        hiddenTableApps,
        hideTableCountBadge,
        apps,
        dockApps,
    };
}
