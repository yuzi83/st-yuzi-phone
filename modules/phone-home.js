// modules/phone/phone-home.js
/**
 * 玉子的手机 - iOS 主屏
 * 动态 App 图标网格、SVG 图标系统、Dock 栏
 */

import {
    getTableData,
    getSheetKeys,
    navigateTo,
    getPhoneSettings,
    openVisualizerWithStatus,
    openDatabaseSettingsWithStatus,
} from './phone-core.js';
import { clampNumber, escapeHtml, escapeHtmlAttr } from './utils.js';

// ===== SVG 图标库（零 emoji）=====

export const PHONE_ICONS = {
    // 状态栏
    signal: `<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><rect x="1" y="16" width="4" height="6" rx="1" opacity="0.4"/><rect x="7" y="12" width="4" height="10" rx="1" opacity="0.6"/><rect x="13" y="7" width="4" height="15" rx="1" opacity="0.8"/><rect x="19" y="2" width="4" height="20" rx="1"/></svg>`,
    wifi: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" stroke-linecap="round"><path d="M5 12.55a11 11 0 0114.08 0M1.42 9a16 16 0 0121.16 0M8.53 16.11a6 6 0 016.95 0M12 20h.01"/></svg>`,
    battery: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="18" height="14"><rect x="2" y="6" width="18" height="12" rx="2"/><rect x="4" y="8" width="14" height="8" rx="1" fill="currentColor" opacity="0.8"/><path d="M20 10h2v4h-2" fill="currentColor"/></svg>`,

    // 返回按钮
    back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 19l-7-7 7-7"/></svg>`,

    // Dock 固定 Apps
    gear: `<svg viewBox="0 0 48 48" fill="none"><rect x="4" y="4" width="40" height="40" rx="10" fill="#636366"/><circle cx="24" cy="24" r="8" stroke="white" stroke-width="2.5"/><circle cx="24" cy="24" r="3" fill="white"/><path d="M24 12v4M24 32v4M12 24h4M32 24h4M16.5 16.5l2.8 2.8M28.7 28.7l2.8 2.8M31.5 16.5l-2.8 2.8M19.3 28.7l-2.8 2.8" stroke="white" stroke-width="2.2" stroke-linecap="round"/></svg>`,

    refresh: `<svg viewBox="0 0 48 48" fill="none"><defs><linearGradient id="grefresh" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#4DB6AC"/><stop offset="100%" stop-color="#00695C"/></linearGradient></defs><rect x="4" y="4" width="40" height="40" rx="10" fill="url(#grefresh)"/><path d="M16 17a10 10 0 0117 2" stroke="white" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M33 14v6h-6" stroke="white" stroke-width="2.5" stroke-linecap="round" fill="none"/><path d="M32 31a10 10 0 01-17-2" stroke="white" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M15 34v-6h6" stroke="white" stroke-width="2.5" stroke-linecap="round" fill="none"/></svg>`,

    puzzle: `<svg viewBox="0 0 48 48" fill="none"><rect x="4" y="4" width="40" height="40" rx="10" fill="#FF9F0A"/><path d="M14 20h6v-2a3 3 0 016 0v2h6v6h-2a3 3 0 000 6h2v6H14V20z" fill="white"/></svg>`,

    // 上传图标
    upload: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 16V4M12 4l-4 4M12 4l4 4"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>`,
    
    // 手机 Tab 图标
    phone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="3"/><line x1="10" y1="18" x2="14" y2="18"/></svg>`,
};

// ===== 动态文字图标生成 =====

const ICON_COLORS = [
    ['#FF5E3A', '#FF2A68'],
    ['#FF9500', '#FF5E3A'],
    ['#4CD964', '#5AC8FA'],
    ['#1AD6FD', '#1D62F0'],
    ['#54C7FC', '#007AFF'],
    ['#FF0054', '#D02090'],
    ['#E42A58', '#E65636'],
];

function getHashColorPair(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % ICON_COLORS.length;
    return ICON_COLORS[index];
}

function getIconForSheet(sheetName) {
    const name = (sheetName || '表').trim();
    const firstChar = name.charAt(0).toUpperCase();
    const colors = getHashColorPair(name);

    return `
        <div style="width: 100%; height: 100%; background: linear-gradient(135deg, ${colors[0]}, ${colors[1]});
        display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: 600; color: #ffffff; border-radius: var(--phone-app-icon-radius, 12px); box-sizing: border-box;">
            ${firstChar}
        </div>
    `;
}

function getTextIcon(letter, colorA, colorB) {
    const text = String(letter || '').trim().charAt(0) || 'A';
    return `
        <div class="phone-dock-text-icon" style="--phone-dock-text-icon-start:${escapeHtmlAttr(colorA)};--phone-dock-text-icon-end:${escapeHtmlAttr(colorB)};">
            <span class="phone-dock-text-icon-glyph-wrap">
                <span class="phone-dock-text-icon-glyph">${escapeHtml(text)}</span>
            </span>
        </div>
    `;
}


function showHomeToast(container, msg, isError = false) {
    const existing = container.querySelector('.phone-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `phone-toast ${isError ? 'phone-toast-error' : 'phone-toast-success'}`;
    toast.textContent = String(msg || '');
    (container.querySelector('.phone-home') || container).appendChild(toast);

    setTimeout(() => toast.classList.add('phone-toast-show'), 10);
    setTimeout(() => {
        toast.classList.remove('phone-toast-show');
        setTimeout(() => toast.remove(), 300);
    }, 1900);
}

async function handleDockAction(app, container) {
    if (!app || app.action !== 'invoke') {
        navigateTo(app?.route || 'home');
        return;
    }

    showHomeToast(container, app.pendingMessage || '处理中...');

    let result = { ok: false, message: '操作失败' };
    try {
        if (app.id === 'visualizer') {
            result = await openVisualizerWithStatus({ timeoutMs: 4000 });
        } else if (app.id === 'db_settings') {
            result = await openDatabaseSettingsWithStatus({ timeoutMs: 4000 });
        } else {
            result = { ok: false, message: '未支持的快捷操作' };
        }
    } catch (e) {
        result = {
            ok: false,
            message: `操作异常：${e?.message || '未知错误'}`,
        };
    }

    showHomeToast(container, result.message, !result.ok);
}

// ===== 主屏渲染 =====

export function renderHomeScreen(container) {
    const rawData = getTableData();
    const phoneSettings = getPhoneSettings();

    const appIconSize = clampNumber(phoneSettings.appIconSize, 40, 88, 60);
    const appIconRadius = clampNumber(phoneSettings.appIconRadius, 6, 26, 14);
    const appGridColumns = clampNumber(phoneSettings.appGridColumns, 3, 6, 4);
    const appGridGap = clampNumber(phoneSettings.appGridGap, 8, 24, 12);
    const dockIconSize = clampNumber(phoneSettings.dockIconSize, 32, 72, 48);
    const hiddenTableApps = normalizeHiddenTableApps(phoneSettings.hiddenTableApps);
    const hideTableCountBadge = !!phoneSettings.hideTableCountBadge;

    // 背景
    const bgStyle = phoneSettings.backgroundImage
        ? `background-image: url(${phoneSettings.backgroundImage}); background-size: cover; background-position: center;`
        : '';

    container.innerHTML = `
        <div class="phone-home" style="${bgStyle}; --phone-app-icon-size:${appIconSize}px; --phone-app-icon-radius:${appIconRadius}px; --phone-app-grid-columns:${appGridColumns}; --phone-app-grid-gap:${appGridGap}px; --phone-dock-icon-size:${dockIconSize}px;">
            <div class="phone-home-overlay"></div>
            <div class="phone-app-grid"></div>
            <div class="phone-dock" data-dock-count="4"></div>
        </div>
    `;

    const grid = container.querySelector('.phone-app-grid');
    const dock = container.querySelector('.phone-dock');

    // 动态生成 App 图标
    if (rawData) {
        const sheetKeys = getSheetKeys(rawData);
        let renderedCount = 0;

        sheetKeys.forEach((key, index) => {
            if (hiddenTableApps[key]) return;

            const sheet = rawData[key];
            if (!sheet || !sheet.name) return;
            const name = sheet.name;
            const customIcon = phoneSettings.appIcons?.[key];
            const iconHtml = customIcon
                ? `<img src="${customIcon}" class="phone-app-icon-img" alt="${name}">`
                : `<div class="phone-app-icon-svg">${getIconForSheet(name)}</div>`;

            const app = document.createElement('div');
            app.className = 'phone-app-item';
            app.dataset.sheetKey = key;
            app.style.animationDelay = `${index * 0.04}s`;
            app.innerHTML = `
                <div class="phone-app-icon">${iconHtml}</div>
                <span class="phone-app-label">${name}</span>
            `;

            if (!hideTableCountBadge) {
                const totalCount = getSheetRowCount(sheet);
                const badgeText = formatTableCountBadge(totalCount);
                if (badgeText) {
                    const badge = document.createElement('div');
                    badge.className = 'phone-notif-badge phone-table-count-badge';
                    badge.textContent = badgeText;
                    badge.setAttribute('aria-label', `总条目数 ${totalCount}`);
                    const iconWrap = app.querySelector('.phone-app-icon');
                    if (iconWrap) iconWrap.appendChild(badge);
                }
            }

            grid.appendChild(app);
            renderedCount++;
        });

    }

    if (grid instanceof HTMLElement) {
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
            setTimeout(() => {
                navigateTo(`app:${sheetKey}`);
            }, 150);
        }, { passive: true });
    }

    // Dock 栏
    const dockApps = [
        { id: 'settings', name: '设置', icon: PHONE_ICONS.gear, route: 'settings' },
        {
            id: 'visualizer',
            name: '可视化',
            icon: getTextIcon('可', '#4DB6AC', '#009688'),
            action: 'invoke',
            pendingMessage: '正在打开可视化编辑器...',
        },
        {
            id: 'db_settings',
            name: '数据库',
            icon: getTextIcon('数', '#5AC8FA', '#007AFF'),
            action: 'invoke',
            pendingMessage: '正在打开数据库设置面板...',
        },
        { id: 'fusion', name: '缝合', icon: PHONE_ICONS.puzzle, route: 'fusion' },
    ];

    dockApps.forEach(app => {
        const customIcon = phoneSettings.appIcons?.[`dock_${app.id}`];
        const iconHtml = customIcon
            ? `<img src="${customIcon}" class="phone-app-icon-img" alt="${app.name}">`
            : `<div class="phone-app-icon-svg">${app.icon}</div>`;

        const safeAppIdClass = String(app.id || '').replace(/[^a-zA-Z0-9_-]/g, '').replace(/_/g, '-');

        const el = document.createElement('div');
        el.className = `phone-dock-item phone-dock-item-${safeAppIdClass}`;
        el.innerHTML = `
            <div class="phone-app-icon phone-dock-icon">${iconHtml}</div>
            <span class="phone-app-label">${app.name}</span>
        `;
        el.dataset.dockAppId = app.id;
        dock.appendChild(el);
    });

    if (dock instanceof HTMLElement) {
        dock.addEventListener('click', (e) => {
            const target = e.target instanceof Element ? e.target : null;
            if (!target) return;

            const itemEl = target.closest('.phone-dock-item');
            if (!(itemEl instanceof HTMLElement) || !dock.contains(itemEl)) return;

            const appId = String(itemEl.dataset.dockAppId || '').trim();
            if (!appId) return;

            const app = dockApps.find(it => String(it.id) === appId);
            if (!app) return;

            const iconEl = itemEl.querySelector('.phone-app-icon');
            if (iconEl) {
                iconEl.classList.add('phone-app-tap');
                setTimeout(() => iconEl.classList.remove('phone-app-tap'), 180);
            }
            setTimeout(() => {
                handleDockAction(app, container);
            }, 150);
        }, { passive: true });
    }
}


function normalizeHiddenTableApps(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const map = {};
    Object.entries(raw).forEach(([key, value]) => {
        if (!key) return;
        if (value) map[key] = true;
    });
    return map;
}

function formatTableCountBadge(totalCount) {
    const safeCount = Number.isFinite(Number(totalCount))
        ? Math.max(0, Math.floor(Number(totalCount)))
        : 0;

    if (safeCount <= 0) return '';
    if (safeCount >= 100) return '99+';
    return String(safeCount);
}

function getSheetRowCount(sheet) {
    if (!sheet?.content || !Array.isArray(sheet.content)) return 0;
    return Math.max(0, sheet.content.length - 1);
}
