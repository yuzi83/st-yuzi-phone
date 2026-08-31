// modules/phone-home/render.js
/**
 * 玉子的手机 - 主屏渲染入口
 *
 * 这是 [`route-renderer.js`](modules/phone-core/route-renderer.js:25) 在路由进入 'home' 时
 * 通过动态 import 的入口。
 *
 * 渲染流程：
 *   1. 读取 phoneSettings + tableData 算出尺寸/布局/badge
 *   2. ensureHomeShell(container)：复用既有 shell DOM 或重建（路线图阶段三 step_13 类似的 in-place patch 思路）
 *   3. ensureHomeInteractionRuntime(container)：拿到 runtime（销毁时自动清理）
 *   4. 通过 view-model.js 计算 apps + dockApps
 *   5. patchHomeGrid / patchHomeDock：用 replaceChildren + DOM 创建（不是 innerHTML 字符串拼接）做 grid / dock 局部刷新
 *   6. bindHomeGridInteractions / bindHomeDockInteractions：把 grid/dock 的点击委托接到 runtime
 *
 * 注意：ensureHomeShell 必须保留"复用既有节点"路径，这是首屏不闪烁的关键。
 */

import {
    getTableData,
    openVisualizerWithStatus,
    openDatabaseUiWithStatus,
} from '../phone-core/data-api.js';
import { navigateTo } from '../phone-core/routing.js';
import { defaultSettings, getPhoneSettings } from '../settings.js';
import { escapeHtmlAttr } from '../utils/dom-escape.js';
import { clampNumber } from '../utils/object.js';
import { buildHomeScreenViewModel } from './view-model.js';
import {
    ensureQQHomeUnreadProjection,
    formatQQHomeUnreadBadge,
    normalizeQQHomeUnreadTotal,
} from './qq-unread.js';
import { bindHomeDockInteractions, bindHomeGridInteractions } from './interactions.js';
import { buildHomeShellStyleText, buildHomeShellHtml, buildHomeAppItemHtml, buildDockItemHtml, buildStatusBarHtml } from './templates.js';
import { ensureHomeInteractionRuntime } from './runtime.js';
import { resolveStatusBarData } from './status-bar-data.js';
import { getQQV2Facade } from '../qq-v2/runtime/default-runtime.js';
import { QQ_APP } from '../qq-v2/app-definition.js';
import { buildTableNavigationContext } from '../table-navigation/catalog.js';

function resolveHomeAppLabelColorTokens(mode) {
    if (mode === 'black') {
        return {
            color: 'var(--yuzi-phone-home-app-label-color-on-light)',
            shadow: 'var(--yuzi-phone-home-app-label-shadow-on-light)',
        };
    }

    return {
        color: 'var(--yuzi-phone-home-app-label-color-on-dark)',
        shadow: 'var(--yuzi-phone-home-app-label-shadow-on-dark)',
    };
}

function clampHomeGridGap(value) {
    const parsed = Number(value);
    const resolved = Number.isFinite(parsed) ? parsed : defaultSettings.appGridGap;
    return Math.max(8, Math.min(24, resolved));
}

/**
 * 复用或重建主屏 shell DOM。
 * @param {HTMLElement} container
 * @param {string} homeShellStyle 内联样式串
 * @returns {{ root: HTMLElement, grid: HTMLElement, dock: HTMLElement, bootstrapped: boolean }}
 */
export function ensureHomeShell(container, homeShellStyle) {
    const currentRoot = container.querySelector('[data-home-shell="root"]') || container.querySelector('.phone-home');
    const currentGrid = container.querySelector('[data-shell-region="home-grid"]') || container.querySelector('.phone-app-grid');
    const currentDock = container.querySelector('[data-shell-region="home-dock"]') || container.querySelector('.phone-dock');
    const currentStatusBar = container.querySelector('[data-shell-region="home-status-bar"]');

    if (currentRoot instanceof HTMLElement && currentGrid instanceof HTMLElement && currentDock instanceof HTMLElement) {
        currentRoot.setAttribute('style', String(homeShellStyle || ''));
        return {
            root: currentRoot,
            grid: currentGrid,
            dock: currentDock,
            statusBar: currentStatusBar,
            bootstrapped: false,
        };
    }

    container.innerHTML = buildHomeShellHtml(homeShellStyle);

    return {
        root: container.querySelector('[data-home-shell="root"]') || container.querySelector('.phone-home'),
        grid: container.querySelector('[data-shell-region="home-grid"]') || container.querySelector('.phone-app-grid'),
        dock: container.querySelector('[data-shell-region="home-dock"]') || container.querySelector('.phone-dock'),
        statusBar: container.querySelector('[data-shell-region="home-status-bar"]'),
        bootstrapped: true,
    };
}

/**
 * 局部更新主屏 grid 区域（不重建 shell）。
 * @param {HTMLElement | null | undefined} grid
 * @param {Array} apps view-model 输出的 apps 列表
 */
export function patchHomeGrid(grid, apps = []) {
    if (!(grid instanceof HTMLElement)) return;

    grid.replaceChildren();

    apps.forEach((item) => {
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
            badge.className = 'phone-table-count-badge';
            badge.textContent = item.badgeText;
            badge.setAttribute('aria-label', `总条目数 ${item.totalCount}`);
            const iconWrap = app.querySelector('.phone-app-icon');
            if (iconWrap) iconWrap.appendChild(badge);
        }

        grid.appendChild(app);
    });
}

/**
 * 局部更新主屏 dock 区域。
 * @param {HTMLElement | null | undefined} dock
 * @param {Array} dockApps view-model 输出的 dockApps 列表
 */
export function patchHomeDock(dock, dockApps = []) {
    if (!(dock instanceof HTMLElement)) return;

    const material = document.createElement('div');
    material.className = 'phone-dock-material';
    dock.replaceChildren();
    dock.appendChild(material);

    dockApps.forEach((app) => {
        const el = document.createElement('div');
        el.className = `phone-dock-item phone-dock-item-${app.safeAppIdClass}`;
        el.innerHTML = buildDockItemHtml(app.iconHtml, app.name);
        el.dataset.dockAppId = app.id;
        el.setAttribute('aria-label', String(app.name || ''));
        material.appendChild(el);
    });
}

export function patchQQHomeUnreadBadge(grid, unreadTotal = 0) {
    if (!(grid instanceof HTMLElement)) return false;
    const qqApp = Array.from(grid.querySelectorAll('.phone-app-item'))
        .find(item => item instanceof HTMLElement && item.dataset.sheetKey === QQ_APP.id);
    if (!(qqApp instanceof HTMLElement)) return false;

    const iconWrap = qqApp.querySelector('.phone-app-icon');
    if (!(iconWrap instanceof HTMLElement)) return false;

    const normalizedTotal = normalizeQQHomeUnreadTotal(unreadTotal);
    const badgeText = formatQQHomeUnreadBadge(normalizedTotal);
    let badge = iconWrap.querySelector('.phone-table-count-badge');
    if (!badgeText) {
        badge?.remove();
        return true;
    }

    if (!(badge instanceof HTMLElement)) {
        badge = document.createElement('div');
        badge.className = 'phone-table-count-badge';
        iconWrap.appendChild(badge);
    }
    badge.textContent = badgeText;
    badge.setAttribute('aria-label', `未读消息 ${normalizedTotal}`);
    return true;
}

/**
 * 主屏渲染入口。
 * @param {HTMLElement} container
 */
export function renderHomeScreen(container) {
    if (!(container instanceof HTMLElement)) return;

    const rawData = getTableData();
    const phoneSettings = getPhoneSettings();

    const appIconSize = clampNumber(phoneSettings.appIconSize, 40, 88, defaultSettings.appIconSize);
    const appIconRadius = clampNumber(phoneSettings.appIconRadius, 6, 26, defaultSettings.appIconRadius);
    const appGridColumns = clampNumber(phoneSettings.appGridColumns, 3, 6, defaultSettings.appGridColumns);
    const appGridGap = clampHomeGridGap(phoneSettings.appGridGap);
    const dockIconSize = clampNumber(phoneSettings.dockIconSize, 32, 72, defaultSettings.dockIconSize);
    const { color: homeAppLabelColor, shadow: homeAppLabelShadow } = resolveHomeAppLabelColorTokens(phoneSettings.homeAppLabelColorMode);

    const bgStyle = phoneSettings.backgroundImage
        ? `background-image: url(${escapeHtmlAttr(phoneSettings.backgroundImage)}); background-size: cover; background-position: center;`
        : '';

    const homeShellStyle = buildHomeShellStyleText({
        bgStyle,
        homeAppLabelColor,
        homeAppLabelShadow,
        appIconSize,
        appIconRadius,
        appGridColumns,
        appGridGap,
        dockIconSize,
    });

    const interactionRuntime = ensureHomeInteractionRuntime(container);
    const shell = ensureHomeShell(container, homeShellStyle);
    if (shell.root instanceof HTMLElement) {
        shell.root.dataset.homeAppLabelColorMode = phoneSettings.homeAppLabelColorMode === 'black' ? 'black' : 'white';
    }
    const grid = shell.grid;
    const dock = shell.dock;
    const unreadProjection = ensureQQHomeUnreadProjection({
        container,
        facade: getQQV2Facade(),
        runtime: interactionRuntime,
        onChange: (qqUnreadTotal) => {
            if (interactionRuntime.isDisposed()) return;
            patchQQHomeUnreadBadge(grid, qqUnreadTotal);
        },
    });
    const navigationContext = rawData ? buildTableNavigationContext(rawData) : null;
    const viewModel = buildHomeScreenViewModel(rawData, phoneSettings, {
        qqUnreadTotal: unreadProjection?.getTotal() || 0,
        navigationContext,
    });
    patchHomeGrid(grid, viewModel.apps);
    bindHomeGridInteractions(grid, { navigateTo, runtime: interactionRuntime });

    const statusBarData = resolveStatusBarData(rawData);
    patchStatusBar(shell.statusBar, statusBarData, shell.root);

    patchHomeDock(dock, viewModel.dockApps);
    bindHomeDockInteractions(dock, viewModel.dockApps, container, {
        navigateTo,
        openVisualizerWithStatus,
        openDatabaseUiWithStatus,
        runtime: interactionRuntime,
    });
}


/**
 * 局部更新主屏时间栏内容。
 * @param {HTMLElement | null | undefined} statusBarEl
 * @param {object} data
 * @param {HTMLElement | null | undefined} rootEl
 */
export function patchStatusBar(statusBarEl, data, rootEl) {
    if (!(statusBarEl instanceof HTMLElement)) return;

    const hasData = data && (data.currentTime || data.weekday || data.dayStatus || data.weather || data.majorEvent);

    if (!hasData) {
        statusBarEl.style.display = 'none';
        statusBarEl.innerHTML = '';
        if (rootEl instanceof HTMLElement) rootEl.classList.remove('has-status-bar');
        return;
    }

    if (rootEl instanceof HTMLElement) rootEl.classList.add('has-status-bar');
    statusBarEl.style.display = '';
    statusBarEl.innerHTML = buildStatusBarHtml(data);
}
