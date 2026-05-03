import { Logger } from '../error-handler.js';
import { resolveTheaterSceneBySheetKey } from '../phone-theater/data.js';
import { escapeHtml } from '../utils/dom-escape.js';
import { getPhoneCoreState, phoneRuntime } from './state.js';
import { processTableData, getTableData } from './data-api.js';
import { navigateTo } from './routing.js';

const logger = Logger.withScope({ scope: 'phone-core/notifications', feature: 'notifications' });

export function getUnreadCount(sheetKey) {
    return getPhoneCoreState().unreadCounts[sheetKey] || 0;
}

export function clearUnreadBadge(sheetKey) {
    getPhoneCoreState().unreadCounts[sheetKey] = 0;
    updateBadgeUI(sheetKey);
}

function updateBadgeUI(sheetKey) {
    void sheetKey;
}

function getNotificationWatcherInterval() {
    if (document.hidden) return 15000;
    return 3500;
}

export function stopDataWatcherForNotifications() {
    const state = getPhoneCoreState();
    if (state.dataWatcherTimerId !== null) {
        phoneRuntime.clearInterval(state.dataWatcherTimerId);
        state.dataWatcherTimerId = null;
    }
}

function runDataWatcherTick() {
    try {
        const rawData = getTableData();
        if (!rawData) return;

        const state = getPhoneCoreState();
        const currentData = processTableData(rawData) || {};
        for (const tableName in currentData) {
            const table = currentData[tableName];
            const currentCount = table.rows.length;
            const prevCount = state.lastTableRowsCount[tableName];

            if (prevCount !== undefined && currentCount > prevCount) {
                const newRowsCount = currentCount - prevCount;
                const lastRow = table.rows[table.rows.length - 1];
                triggerPushNotification(tableName, table.key, lastRow, newRowsCount);
            }
            state.lastTableRowsCount[tableName] = currentCount;
        }
    } catch (error) {
        logger.warn({
            action: 'watcher.tick',
            message: '通知轮询异常',
            error,
        });
    }
}

export function startDataWatcherForNotifications() {
    const state = getPhoneCoreState();
    if (state.dataWatcherTimerId !== null) return;

    runDataWatcherTick();

    state.dataWatcherTimerId = phoneRuntime.setInterval(() => {
        runDataWatcherTick();
    }, getNotificationWatcherInterval());
}

function buildPhoneNotificationIconHtml(firstChar) {
    return `
        <div class="phone-notif-icon-box" style="background: linear-gradient(135deg, #FF4757, #FF6B81);">
            ${firstChar}
        </div>`;
}

function buildPhoneNotificationContentHtml(iconHtml, safeTitle, safeSummary) {
    return `
        ${iconHtml}
        <div class="phone-notif-content">
            <div class="phone-notif-title">${safeTitle} <span class="phone-notif-now">现在</span></div>
            <div class="phone-notif-text">${safeSummary}</div>
        </div>
    `;
}

function triggerPushNotification(tableName, sheetKey, lastRow, newCount) {
    const container = document.getElementById('phone-notif-container');
    if (!container) return;

    let summary = '收到新内容';
    if (lastRow && Array.isArray(lastRow) && lastRow.length > 0) {
        summary = lastRow[1] || lastRow[0] || summary;
    }

    const rawData = getTableData();
    const theaterScene = resolveTheaterSceneBySheetKey(rawData, sheetKey);
    const targetBadgeKey = theaterScene?.appKey || sheetKey;
    const targetRoute = theaterScene?.route || `app:${sheetKey}`;
    const displayTitle = theaterScene
        ? `${theaterScene.name} · ${tableName}`
        : tableName;

    const state = getPhoneCoreState();
    state.unreadCounts[targetBadgeKey] = (state.unreadCounts[targetBadgeKey] || 0) + newCount;
    updateBadgeUI(targetBadgeKey);

    const notif = document.createElement('div');
    notif.className = 'phone-notif-bubble';

    const firstChar = (theaterScene?.name || tableName || '新').trim().charAt(0).toUpperCase();
    const iconHtml = buildPhoneNotificationIconHtml(firstChar);

    const safeTitle = escapeHtml(String(displayTitle || ''));
    const safeSummary = escapeHtml(String(summary || ''));

    notif.innerHTML = buildPhoneNotificationContentHtml(iconHtml, safeTitle, safeSummary);

    const dismissNotification = () => {
        if (!notif.isConnected) return;
        notif.classList.remove('show');
        phoneRuntime.setTimeout(() => notif.remove(), 300);
    };

    phoneRuntime.addEventListener(notif, 'click', () => {
        dismissNotification();
        clearUnreadBadge(targetBadgeKey);
        navigateTo(targetRoute);
    });

    container.appendChild(notif);

    phoneRuntime.requestAnimationFrame(() => {
        if (notif.isConnected) {
            notif.classList.add('show');
        }
    });

    phoneRuntime.setTimeout(() => {
        dismissNotification();
    }, 4000);
}
