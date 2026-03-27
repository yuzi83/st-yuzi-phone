import { PHONE_ICONS } from '../phone-home.js';
import {
    getPhoneSettings,
    savePhoneSetting,
    getDefaultPhoneTogglePosition,
    isMobileDevice,
    constrainPosition,
} from '../settings.js';
import { clampNumber, escapeCssUrl, EventManager } from '../utils.js';
import { Logger } from '../error-handler.js';

export const DOM_IDS = Object.freeze({
    root: 'yuzi-phone-root',
    container: 'yuzi-phone-standalone',
    toggle: 'yuzi-phone-toggle',
});

const toggleEventManager = new EventManager();
let boundToggleButton = null;

export function applyPhoneToggleVisualStyle(btn, settings = getPhoneSettings()) {
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

function getPhoneToggleMetrics(btn, settings = getPhoneSettings()) {
    if (btn instanceof HTMLElement) {
        const rect = btn.getBoundingClientRect();
        const width = Math.round(rect.width || btn.offsetWidth || 0);
        const height = Math.round(rect.height || btn.offsetHeight || 0);
        if (width > 0 && height > 0) {
            return { width, height };
        }
    }

    const size = clampNumber(settings?.phoneToggleStyleSize, 32, 72, 44);
    const shapeRaw = String(settings?.phoneToggleStyleShape || 'rounded').trim();
    const shape = shapeRaw === 'circle' ? 'circle' : 'rounded';

    if (shape === 'circle') {
        return { width: size, height: size };
    }

    return {
        width: Math.max(size, 110) + 28,
        height: size + 16,
    };
}

export function applyPhoneTogglePosition(btn, options = {}) {
    if (!(btn instanceof HTMLElement)) return null;

    const settings = options.settings || getPhoneSettings();
    const { width, height } = getPhoneToggleMetrics(btn, settings);
    const defaultPos = getDefaultPhoneTogglePosition(width, height);
    const rawSavedX = settings.phoneToggleX;
    const rawSavedY = settings.phoneToggleY;
    const savedX = rawSavedX === null || rawSavedX === undefined || rawSavedX === ''
        ? NaN
        : Number(rawSavedX);
    const savedY = rawSavedY === null || rawSavedY === undefined || rawSavedY === ''
        ? NaN
        : Number(rawSavedY);
    const targetX = options.useDefault
        ? defaultPos.x
        : (Number.isFinite(savedX) ? savedX : defaultPos.x);
    const targetY = options.useDefault
        ? defaultPos.y
        : (Number.isFinite(savedY) ? savedY : defaultPos.y);

    const constrained = constrainPosition(targetX, targetY, width, height);
    btn.style.left = constrained.x + 'px';
    btn.style.top = constrained.y + 'px';

    const shouldPersist = options.persist === true
        || (options.persistIfAdjusted === true
            && (constrained.x !== targetX || constrained.y !== targetY));

    if (shouldPersist) {
        savePhoneSetting('phoneToggleX', constrained.x);
        savePhoneSetting('phoneToggleY', constrained.y);
    }

    return constrained;
}

export function resetPhoneTogglePosition() {
    const btn = document.getElementById(DOM_IDS.toggle);
    if (!btn) return false;

    const pos = applyPhoneTogglePosition(btn, { useDefault: true, persist: true });
    if (!pos) return false;

    Logger.info('手机位置已重置');
    return true;
}

export function syncPhoneToggleVisualStyle() {
    const btn = document.getElementById(DOM_IDS.toggle);
    if (!btn) return;
    applyPhoneToggleVisualStyle(btn, getPhoneSettings());
    applyPhoneTogglePosition(btn, { persistIfAdjusted: true });
}

export function createPhoneRoot() {
    let root = document.getElementById(DOM_IDS.root);
    if (root) return root;

    root = document.createElement('div');
    root.id = DOM_IDS.root;
    root.className = 'yuzi-phone-root';
    document.body.appendChild(root);
    return root;
}

export function createPhoneContainer() {
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

function bindPhoneToggleDraggable(btn, onToggle) {
    if (!(btn instanceof HTMLElement)) return;

    toggleEventManager.dispose();
    boundToggleButton = btn;

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

        if (!hasMoved && Date.now() - startTime < 300 && typeof onToggle === 'function') {
            onToggle();
        }

        hasMoved = false;
        pointerId = null;
    };

    toggleEventManager.add(btn, 'contextmenu', onContextMenu);
    toggleEventManager.add(btn, 'pointerdown', onPointerDown);
    toggleEventManager.add(btn, 'pointermove', onPointerMove);
    toggleEventManager.add(btn, 'pointerup', onPointerUp);
    toggleEventManager.add(btn, 'pointercancel', onPointerUp);
}

export function createPhoneToggleButton(options = {}) {
    const { onToggle } = options;
    let btn = document.getElementById(DOM_IDS.toggle);

    if (btn && btn === boundToggleButton) {
        applyPhoneToggleVisualStyle(btn, getPhoneSettings());
        applyPhoneTogglePosition(btn, { persistIfAdjusted: true });
        return btn;
    }

    if (!btn) {
        const root = createPhoneRoot();
        const isMobile = isMobileDevice();

        btn = document.createElement('div');
        btn.id = DOM_IDS.toggle;
        btn.className = `yuzi-phone-toggle yuzi-phone-toggle-shape-rounded ${isMobile ? 'yuzi-phone-toggle-mobile' : ''}`;

        const iconSpan = document.createElement('span');
        iconSpan.className = 'yuzi-phone-toggle-icon';
        iconSpan.innerHTML = String(PHONE_ICONS.phone || '');

        const textSpan = document.createElement('span');
        textSpan.className = 'yuzi-phone-toggle-text';
        textSpan.textContent = '玉子手机';

        btn.appendChild(iconSpan);
        btn.appendChild(textSpan);
        btn.title = '拖拽移动 / 点击打开';
        btn.style.visibility = 'hidden';

        root.appendChild(btn);
    }

    applyPhoneToggleVisualStyle(btn, getPhoneSettings());
    applyPhoneTogglePosition(btn, { persistIfAdjusted: true });
    btn.style.visibility = '';
    bindPhoneToggleDraggable(btn, onToggle);
    return btn;
}

export function disposePhoneToggleInteractions() {
    toggleEventManager.dispose();
    boundToggleButton = null;
}
