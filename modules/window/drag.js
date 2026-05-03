import { constrainPosition, savePhoneSetting } from '../settings.js';
import { DRAG_BOUND_ATTR, getWindowInteractionRuntime } from './runtime.js';

const dragDeps = {
    constrainPosition,
    savePhoneSetting,
    getWindowInteractionRuntime,
};

export function __test__setDeps(overrides = {}) {
    if (!overrides || typeof overrides !== 'object') return;
    Object.assign(dragDeps, overrides);
}

export function initPhoneShellDrag() {
    const phoneEl = document.getElementById('yuzi-phone-standalone');
    if (!phoneEl) return;
    const shell = phoneEl.querySelector('.phone-shell');
    if (!shell) return;

    const notch = shell.querySelector('.phone-notch');
    const statusBar = shell.querySelector('.phone-status-bar');
    const dragHandles = [notch, statusBar].filter((el) => el instanceof HTMLElement);
    if (dragHandles.length === 0) return;

    const unboundHandles = dragHandles.filter((el) => el.dataset[DRAG_BOUND_ATTR] !== '1');
    if (unboundHandles.length === 0) return;

    const runtime = dragDeps.getWindowInteractionRuntime();
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;
    let pointerId = null;

    function onContextMenu(event) {
        event.preventDefault();
    }

    function onPointerDown(event) {
        if (phoneEl.classList.contains('resizing')) return;

        isDragging = true;
        pointerId = event.pointerId;

        const rect = phoneEl.getBoundingClientRect();
        offsetX = event.clientX - rect.left;
        offsetY = event.clientY - rect.top;

        event.target.setPointerCapture(event.pointerId);
        phoneEl.classList.add('dragging');
        event.preventDefault();
    }

    function onPointerMove(event) {
        if (!isDragging || event.pointerId !== pointerId) return;

        const constrained = dragDeps.constrainPosition(
            event.clientX - offsetX,
            event.clientY - offsetY,
            phoneEl.offsetWidth,
            phoneEl.offsetHeight,
        );

        phoneEl.style.left = constrained.x + 'px';
        phoneEl.style.top = constrained.y + 'px';
        event.preventDefault();
    }

    function onPointerUp(event) {
        if (!isDragging || event.pointerId !== pointerId) return;

        isDragging = false;
        try {
            event.target.releasePointerCapture(event.pointerId);
        } catch {}
        phoneEl.classList.remove('dragging');

        const left = parseInt(phoneEl.style.left, 10);
        const top = parseInt(phoneEl.style.top, 10);
        dragDeps.savePhoneSetting('phoneContainerX', Number.isFinite(left) ? left : 0);
        dragDeps.savePhoneSetting('phoneContainerY', Number.isFinite(top) ? top : 0);

        pointerId = null;
    }

    unboundHandles.forEach((el) => {
        el.dataset[DRAG_BOUND_ATTR] = '1';
        el.style.cursor = 'grab';
        el.style.touchAction = 'none';
        el.style.pointerEvents = 'auto';
        runtime.addEventListener(el, 'contextmenu', onContextMenu);
        runtime.addEventListener(el, 'pointerdown', onPointerDown);
        runtime.addEventListener(el, 'pointermove', onPointerMove);
        runtime.addEventListener(el, 'pointerup', onPointerUp);
        runtime.addEventListener(el, 'pointercancel', onPointerUp);
    });

    runtime.registerCleanup(() => {
        unboundHandles.forEach((el) => {
            delete el.dataset[DRAG_BOUND_ATTR];
        });
    });
}
