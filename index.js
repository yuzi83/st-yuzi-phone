// index.js
/**
 * 玉子手机 - 独立扩展入口
 * @version 1.0.0
 */

import { PHONE_ICONS } from './modules/phone-home.js';
import { onPhoneActivated, onPhoneDeactivated, destroyPhoneRuntime } from './modules/phone-core.js';
import {
    getPhoneSettings,
    savePhoneSetting,
    migrateLegacyPhoneSettings,
    getDefaultPhoneTogglePosition,
    isMobileDevice,
    constrainPosition,
    flushPhoneSettingsSave,
} from './modules/settings.js';
import { createPhoneSettingsPanel } from './modules/settings-panel.js';

const DOM_IDS = {
    root: 'yuzi-phone-root',
    container: 'yuzi-phone-standalone',
    toggle: 'yuzi-phone-toggle',
};

function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
}

function escapeCssUrl(url) {
    return String(url || '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n|\r/g, '');
}

function applyPhoneToggleVisualStyle(btn, settings = getPhoneSettings()) {
    if (!(btn instanceof HTMLElement)) return;

    const size = clampNumber(settings?.phoneToggleStyleSize, 32, 72, 44);
    const shapeRaw = String(settings?.phoneToggleStyleShape || 'rounded').trim();
    const shape = shapeRaw === 'circle' ? 'circle' : 'rounded';
    const coverRaw = typeof settings?.phoneToggleCoverImage === 'string'
        ? settings.phoneToggleCoverImage.trim()
        : '';

    btn.style.setProperty('--yuzi-phone-toggle-size', `${size}px`);
    btn.style.setProperty('--yuzi-phone-toggle-cover-image', coverRaw ? `url("${escapeCssUrl(coverRaw)}")` : 'none');

    btn.classList.toggle('yuzi-phone-toggle-shape-circle', shape === 'circle');
    btn.classList.toggle('yuzi-phone-toggle-shape-rounded', shape !== 'circle');
    btn.classList.toggle('yuzi-phone-toggle-has-cover', !!coverRaw);
    btn.classList.toggle('yuzi-phone-toggle-cover-only', !!coverRaw);
}

function syncPhoneToggleVisualStyle() {
    const btn = document.getElementById(DOM_IDS.toggle);
    if (!btn) return;
    applyPhoneToggleVisualStyle(btn, getPhoneSettings());
}

function createPhoneRoot() {
    let root = document.getElementById(DOM_IDS.root);
    if (root) return root;

    root = document.createElement('div');
    root.id = DOM_IDS.root;
    root.className = 'yuzi-phone-root';
    document.body.appendChild(root);
    return root;
}

function createPhoneContainer() {
    let container = document.getElementById(DOM_IDS.container);
    if (container) return container;

    const root = createPhoneRoot();
    container = document.createElement('div');
    container.id = DOM_IDS.container;
    container.className = 'yuzi-phone-standalone';

    const settings = getPhoneSettings();
    const defaultWidth = 320;
    const defaultHeight = 640;

    const savedWidth = Number(settings.phoneContainerWidth);
    const savedHeight = Number(settings.phoneContainerHeight);

    const width = Number.isFinite(savedWidth) && savedWidth > 0 ? savedWidth : defaultWidth;
    const height = Number.isFinite(savedHeight) && savedHeight > 0 ? savedHeight : defaultHeight;

    const defaultX = Math.max(10, window.innerWidth - width - 40);
    const defaultY = Math.max(60, Math.floor((window.innerHeight - height) / 2));

    const savedX = Number(settings.phoneContainerX);
    const savedY = Number(settings.phoneContainerY);

    const initialX = Number.isFinite(savedX) ? savedX : defaultX;
    const initialY = Number.isFinite(savedY) ? savedY : defaultY;

    const constrained = constrainPosition(initialX, initialY, width, height);

    container.style.left = constrained.x + 'px';
    container.style.top = constrained.y + 'px';
    container.style.width = width + 'px';
    container.style.height = height + 'px';

    root.appendChild(container);
    return container;
}

function createPhoneToggleButton() {
    let btn = document.getElementById(DOM_IDS.toggle);
    if (btn) {
        applyPhoneToggleVisualStyle(btn, getPhoneSettings());
        return btn;
    }

    const root = createPhoneRoot();
    const settings = getPhoneSettings();
    const isMobile = isMobileDevice();
    const defaultPos = getDefaultPhoneTogglePosition();

    btn = document.createElement('div');
    btn.id = DOM_IDS.toggle;
    btn.className = `yuzi-phone-toggle yuzi-phone-toggle-shape-rounded ${isMobile ? 'yuzi-phone-toggle-mobile' : ''}`;
    btn.innerHTML = `<span class="yuzi-phone-toggle-icon">${PHONE_ICONS.phone}</span><span class="yuzi-phone-toggle-text">玉子手机</span>`;
    btn.title = '拖拽移动 / 点击打开';

    btn.style.left = (settings.phoneToggleX ?? defaultPos.x) + 'px';
    btn.style.top = (settings.phoneToggleY ?? defaultPos.y) + 'px';

    applyPhoneToggleVisualStyle(btn, settings);

    root.appendChild(btn);
    initPhoneToggleDraggable(btn);
    return btn;
}

function initPhoneToggleDraggable(btn) {
    let hasMoved = false;
    let startX = 0;
    let startY = 0;
    let offsetX = 0;
    let offsetY = 0;
    let pointerId = null;
    let startTime = 0;

    const DRAG_THRESHOLD = 5;

    const onContextMenu = (e) => e.preventDefault();
    const onPointerDown = (e) => {
        startTime = Date.now();
        hasMoved = false;
        pointerId = e.pointerId;

        const rect = btn.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        startX = e.clientX;
        startY = e.clientY;

        btn.setPointerCapture(e.pointerId);
        btn.classList.add('dragging');
        e.preventDefault();
    };

    const onPointerMove = (e) => {
        if (e.pointerId !== pointerId) return;

        if (Math.abs(e.clientX - startX) > DRAG_THRESHOLD || Math.abs(e.clientY - startY) > DRAG_THRESHOLD) {
            hasMoved = true;
        }
        if (!hasMoved) return;

        const newX = e.clientX - offsetX;
        const newY = e.clientY - offsetY;
        const constrained = constrainPosition(newX, newY, btn.offsetWidth, btn.offsetHeight);

        btn.style.left = constrained.x + 'px';
        btn.style.top = constrained.y + 'px';

        e.preventDefault();
    };

    const onPointerUp = (e) => {
        if (e.pointerId !== pointerId) return;

        try { btn.releasePointerCapture(e.pointerId); } catch {}
        btn.classList.remove('dragging');

        if (hasMoved) {
            savePhoneSetting('phoneToggleX', parseInt(btn.style.left, 10));
            savePhoneSetting('phoneToggleY', parseInt(btn.style.top, 10));
        }

        if (!hasMoved && Date.now() - startTime < 300) {
            togglePhone();
        }

        hasMoved = false;
        pointerId = null;
    };

    btn.addEventListener('contextmenu', onContextMenu);
    btn.addEventListener('pointerdown', onPointerDown);
    btn.addEventListener('pointermove', onPointerMove);
    btn.addEventListener('pointerup', onPointerUp);
    btn.addEventListener('pointercancel', onPointerUp);
}

function togglePhone(show) {
    const container = document.getElementById(DOM_IDS.container);
    const btn = document.getElementById(DOM_IDS.toggle);
    if (!container || !btn) return;

    const nextShow = show ?? !container.classList.contains('visible');
    container.classList.toggle('visible', nextShow);
    btn.classList.toggle('active', nextShow);

    if (nextShow) {
        onPhoneActivated();
    } else {
        onPhoneDeactivated();
    }
}

function setPhoneEnabledWithUI(enabled) {
    if (enabled) {
        createPhoneRoot();
        createPhoneContainer();
        createPhoneToggleButton();
    } else {
        document.getElementById(DOM_IDS.container)?.classList.remove('visible');
        document.getElementById(DOM_IDS.toggle)?.classList.remove('active');
        document.getElementById(DOM_IDS.container)?.remove();
        document.getElementById(DOM_IDS.toggle)?.remove();
        const root = document.getElementById(DOM_IDS.root);
        if (root && root.childElementCount === 0) {
            root.remove();
        }
    }
}

(function init() {
    window.addEventListener('yuzi-phone-toggle-style-updated', () => {
        syncPhoneToggleVisualStyle();
    });

    const onReady = () => {
        try {
            migrateLegacyPhoneSettings();
            const settings = getPhoneSettings();

            const hasPanel = createPhoneSettingsPanel((enabled) => {
                setPhoneEnabledWithUI(enabled);
            });

            if (settings.enabled !== false || !hasPanel) {
                createPhoneRoot();
                createPhoneContainer();
                createPhoneToggleButton();
            }

            console.log('[玉子手机] v1.0.0');
        } catch (e) {
            console.error('[玉子手机] 初始化错误:', e);
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onReady);
    } else {
        setTimeout(onReady, 100);
    }
})();

export function destroy() {
    try {
        destroyPhoneRuntime();
        document.getElementById(DOM_IDS.toggle)?.remove();
        document.getElementById(DOM_IDS.container)?.remove();
        document.getElementById(DOM_IDS.root)?.remove();
        flushPhoneSettingsSave();
        console.log('[玉子手机] 扩展已卸载');
    } catch (e) {
        console.error('[玉子手机] 卸载错误:', e);
    }
}
