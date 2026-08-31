import { escapeHtmlAttr } from '../utils/dom-escape.js';
import { formatTableCountBadge, getHomeDockApps, getSheetRowCount, normalizeHiddenTableApps } from './home-data.js';
import { getIconForSheet, getTextIcon } from './icons.js';
import { formatQQHomeUnreadBadge, normalizeQQHomeUnreadTotal } from './qq-unread.js';
import { VARIABLE_MANAGER_APP, getVariableManagerIcon } from '../variable-manager/index.js';
import { QQ_APP } from '../qq-v2/app-definition.js';
import { buildTableNavigationContext } from '../table-navigation/catalog.js';
import {
    TABLE_UPDATE_REVIEW_APP_ICON_TEXT,
    TABLE_UPDATE_REVIEW_APP_ID,
    TABLE_UPDATE_REVIEW_APP_NAME,
    TABLE_UPDATE_REVIEW_ROUTE,
} from '../table-update-review/constants.js';

function buildTheaterAppIconHtml(scene, customIcon = '') {
    const name = String(scene?.name || '小剧场');
    if (customIcon) {
        return `<img src="${escapeHtmlAttr(customIcon)}" class="phone-app-icon-img" alt="${escapeHtmlAttr(name)}">`;
    }

    const [colorA, colorB] = Array.isArray(scene?.iconColors) ? scene.iconColors : ['#8E8E93', '#636366'];
    return `<div class="phone-app-icon-svg">${getTextIcon(scene?.iconText || name, colorA, colorB)}</div>`;
}

export function buildHomeScreenViewModel(rawData, phoneSettings, options = {}) {
    const hiddenTableApps = normalizeHiddenTableApps(phoneSettings?.hiddenTableApps);
    const hideTableCountBadge = !!phoneSettings?.hideTableCountBadge;
    const qqUnreadTotal = normalizeQQHomeUnreadTotal(options?.qqUnreadTotal);
    const navigationContext = options.navigationContext
        || (rawData ? buildTableNavigationContext(rawData) : null);
    const tableCatalog = navigationContext?.catalog || [];
    const tableTargetBySheetKey = new Map(tableCatalog.map(target => [target.sheetKey, target]));

    const apps = [];

    if (!hiddenTableApps[TABLE_UPDATE_REVIEW_APP_ID]) {
        const reviewCustomIcon = phoneSettings?.appIcons?.[TABLE_UPDATE_REVIEW_APP_ID] || '';
        const reviewIconHtml = reviewCustomIcon
            ? `<img src="${escapeHtmlAttr(reviewCustomIcon)}" class="phone-app-icon-img" alt="${escapeHtmlAttr(TABLE_UPDATE_REVIEW_APP_NAME)}">`
            : `<div class="phone-app-icon-svg">${getTextIcon(TABLE_UPDATE_REVIEW_APP_ICON_TEXT, '#34C759', '#007AFF')}</div>`;
        apps.push({
            key: TABLE_UPDATE_REVIEW_APP_ID,
            name: TABLE_UPDATE_REVIEW_APP_NAME,
            iconHtml: reviewIconHtml,
            badgeText: '',
            totalCount: 0,
            animationDelay: '0s',
            isSystemApp: true,
            route: TABLE_UPDATE_REVIEW_ROUTE,
            sortOrder: Number.POSITIVE_INFINITY,
            sortName: TABLE_UPDATE_REVIEW_APP_NAME,
        });
    }

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

    if (!hiddenTableApps[QQ_APP.id]) {
        const qqCustomIcon = phoneSettings?.appIcons?.[QQ_APP.id] || '';
        const qqIconHtml = qqCustomIcon
            ? `<img src="${escapeHtmlAttr(qqCustomIcon)}" class="phone-app-icon-img" alt="${escapeHtmlAttr(QQ_APP.name)}">`
            : `<div class="phone-app-icon-svg">${getTextIcon(
                'Q',
                'var(--yuzi-phone-home-qq-icon-start)',
                'var(--yuzi-phone-home-qq-icon-end)',
            )}</div>`;
        apps.push({
            key: QQ_APP.id,
            name: QQ_APP.name,
            iconHtml: qqIconHtml,
            badgeText: formatQQHomeUnreadBadge(qqUnreadTotal),
            totalCount: qqUnreadTotal,
            animationDelay: '0s',
            isSystemApp: QQ_APP.isSystemApp,
            route: QQ_APP.route,
            sortOrder: Number.POSITIVE_INFINITY,
            sortName: QQ_APP.name,
        });
    }

    const groupedTheaterSheetKeys = navigationContext?.groupedTheaterSheetKeys || new Set();

    if (rawData) {
        (navigationContext?.theaterScenes || []).forEach((scene) => {
            if (hiddenTableApps[scene.appKey]) return;

            const target = tableTargetBySheetKey.get(scene.primarySheetKey);
            if (!target?.route) return;

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
                route: target.route,
                isTheaterApp: true,
                theaterSceneId: scene.id,
                childSheetKeys: scene.childSheetKeys,
                sortOrder: Number.isFinite(scene.orderNo) ? Number(scene.orderNo) : Number.POSITIVE_INFINITY,
                sortName: scene.name,
            });
        });
    }

    if (rawData) {
        tableCatalog.forEach((target) => {
            const key = target.sheetKey;
            if (groupedTheaterSheetKeys.has(key)) return;
            if (hiddenTableApps[key]) return;
            if (!target.route) return;

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
                route: target.route,
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
