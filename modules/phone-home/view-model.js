import { escapeHtmlAttr } from '../utils/dom-escape.js';
import { formatTableCountBadge, getHomeDockApps, getSheetRowCount, normalizeHiddenTableApps } from './home-data.js';
import { getIconForSheet, getTextIcon } from './icons.js';
import { VARIABLE_MANAGER_APP, getVariableManagerIcon } from '../variable-manager/index.js';
import { getAvailableTheaterScenes, getGroupedTheaterSheetKeys } from '../phone-theater/data.js';

function buildTheaterAppIconHtml(scene, customIcon = '') {
    const name = String(scene?.name || '小剧场');
    if (customIcon) {
        return `<img src="${escapeHtmlAttr(customIcon)}" class="phone-app-icon-img" alt="${escapeHtmlAttr(name)}">`;
    }

    const [colorA, colorB] = Array.isArray(scene?.iconColors) ? scene.iconColors : ['#8E8E93', '#636366'];
    return `<div class="phone-app-icon-svg">${getTextIcon(scene?.iconText || name, colorA, colorB)}</div>`;
}

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

    const groupedTheaterSheetKeys = rawData ? getGroupedTheaterSheetKeys(rawData) : new Set();

    if (rawData) {
        getAvailableTheaterScenes(rawData).forEach((scene) => {
            if (hiddenTableApps[scene.appKey]) return;

            const customIcon = phoneSettings?.appIcons?.[scene.appKey] || '';
            const totalCount = Number.isFinite(Number(scene.rowCount)) ? Number(scene.rowCount) : 0;
            const badgeText = hideTableCountBadge ? '' : formatTableCountBadge(totalCount);
            apps.push({
                key: scene.appKey,
                name: scene.name,
                iconHtml: buildTheaterAppIconHtml(scene, customIcon),
                badgeText,
                totalCount,
                animationDelay: '0s',
                route: scene.route,
                isTheaterApp: true,
                theaterSceneId: scene.id,
                childSheetKeys: scene.childSheetKeys,
                sortOrder: Number.isFinite(scene.orderNo) ? Number(scene.orderNo) : Number.POSITIVE_INFINITY,
                sortName: scene.name,
            });
        });
    }

    if (rawData && typeof getSheetKeys === 'function') {
        const sheetKeys = getSheetKeys(rawData);
        sheetKeys.forEach((key) => {
            if (groupedTheaterSheetKeys.has(key)) return;
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
