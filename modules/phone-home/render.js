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
    getSheetKeys,
    openVisualizerWithStatus,
    openDatabaseSettingsWithStatus,
} from '../phone-core/data-api.js';
import { navigateTo } from '../phone-core/routing.js';
import { getPhoneSettings } from '../settings.js';
import { escapeHtmlAttr } from '../utils/dom-escape.js';
import { clampNumber } from '../utils/object.js';
import { buildHomeScreenViewModel } from './view-model.js';
import { bindHomeDockInteractions, bindHomeGridInteractions } from './interactions.js';
import { buildHomeShellStyleText, buildHomeShellHtml, buildHomeAppItemHtml, buildDockItemHtml } from './templates.js';
import { ensureHomeInteractionRuntime } from './runtime.js';

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

    if (currentRoot instanceof HTMLElement && currentGrid instanceof HTMLElement && currentDock instanceof HTMLElement) {
        currentRoot.setAttribute('style', String(homeShellStyle || ''));
        return {
            root: currentRoot,
            grid: currentGrid,
            dock: currentDock,
            bootstrapped: false,
        };
    }

    container.innerHTML = buildHomeShellHtml(homeShellStyle);

    return {
        root: container.querySelector('[data-home-shell="root"]') || container.querySelector('.phone-home'),
        grid: container.querySelector('[data-shell-region="home-grid"]') || container.querySelector('.phone-app-grid'),
        dock: container.querySelector('[data-shell-region="home-dock"]') || container.querySelector('.phone-dock'),
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
            badge.className = 'phone-notif-badge phone-table-count-badge';
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

    dock.replaceChildren();

    dockApps.forEach((app) => {
        const el = document.createElement('div');
        el.className = `phone-dock-item phone-dock-item-${app.safeAppIdClass}`;
        el.innerHTML = buildDockItemHtml(app.iconHtml, app.name);
        el.dataset.dockAppId = app.id;
        dock.appendChild(el);
    });
}

/**
 * 主屏渲染入口。
 * @param {HTMLElement} container
 */
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

    const interactionRuntime = ensureHomeInteractionRuntime(container);
    const shell = ensureHomeShell(container, homeShellStyle);
    const grid = shell.grid;
    const dock = shell.dock;
    const viewModel = buildHomeScreenViewModel(rawData, phoneSettings, { getSheetKeys });

    patchHomeGrid(grid, viewModel.apps);
    bindHomeGridInteractions(grid, { navigateTo, runtime: interactionRuntime });

    patchHomeDock(dock, viewModel.dockApps);
    bindHomeDockInteractions(dock, viewModel.dockApps, container, {
        navigateTo,
        openVisualizerWithStatus,
        openDatabaseSettingsWithStatus,
        runtime: interactionRuntime,
    });
}
