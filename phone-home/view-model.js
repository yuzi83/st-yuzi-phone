import { escapeHtmlAttr } from '../utils.js';
import { formatTableCountBadge, getHomeDockApps, getSheetRowCount, normalizeHiddenTableApps } from './home-data.js';
import { getIconForSheet } from './icons.js';

export function buildHomeScreenViewModel(rawData, phoneSettings, deps = {}) {
    const { getSheetKeys } = deps;

    const hiddenTableApps = normalizeHiddenTableApps(phoneSettings?.hiddenTableApps);
    const hideTableCountBadge = !!phoneSettings?.hideTableCountBadge;

    const apps = [];
    if (rawData && typeof getSheetKeys === 'function') {
        const sheetKeys = getSheetKeys(rawData);
        sheetKeys.forEach((key, index) => {
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

            apps.push({
                key,
                name,
                iconHtml,
                badgeText,
                totalCount,
                animationDelay: `${index * 0.04}s`,
            });
        });
    }

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
