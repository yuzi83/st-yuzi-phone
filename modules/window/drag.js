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
    const shell = phoneEl.querySelector('.yuzi-phone-shell');
    if (!shell) return;

    const notch = shell.querySelector('.yuzi-phone-notch');
    const statusBar = shell.querySelector('.yuzi-phone-status-bar');
    const dragHandles = [notch, statusBar].filter((el) => el instanceof HTMLElement);
    if (dragHandles.length === 0) return;

    const unboundHandles = dragHandles.filter((el) => el.dataset[DRAG_BOUND_ATTR] !== '1');
    if (unboundHandles.length === 0) return;

    const runtime = dragDeps.getWindowInteractionRuntime();
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;
    let pointerId = null;
    let startLeft = 0;
    let startTop = 0;
    let dragWidth = 0;
    let dragHeight = 0;
    let nextLeft = 0;
    let nextTop = 0;
    let hasMoved = false;
    let frameId = null;

    function renderPosition() {
        frameId = null;
        phoneEl.style.transform = `translate3d(${nextLeft - startLeft}px, ${nextTop - startTop}px, 0)`;
    }

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
        startLeft = rect.left;
        startTop = rect.top;
        dragWidth = rect.width;
        dragHeight = rect.height;
        nextLeft = startLeft;
        nextTop = startTop;
        hasMoved = false;

        event.target.setPointerCapture(event.pointerId);
        phoneEl.classList.add('dragging');
        event.preventDefault();
    }

    function onPointerMove(event) {
        if (!isDragging || event.pointerId !== pointerId) return;

        const constrained = dragDeps.constrainPosition(
            event.clientX - offsetX,
            event.clientY - offsetY,
            dragWidth,
            dragHeight,
        );

        nextLeft = constrained.x;
        nextTop = constrained.y;
        hasMoved = true;
        if (frameId === null) {
            frameId = runtime.requestAnimationFrame(renderPosition);
        }
        event.preventDefault();
    }

    function onPointerUp(event) {
        if (!isDragging || event.pointerId !== pointerId) return;

        isDragging = false;
        if (frameId !== null) {
            runtime.cancelAnimationFrame(frameId);
            frameId = null;
        }
        if (hasMoved) {
            phoneEl.style.left = nextLeft + 'px';
            phoneEl.style.top = nextTop + 'px';
        }
        phoneEl.style.transform = '';
        try {
            event.target.releasePointerCapture(event.pointerId);
        } catch {}
        phoneEl.classList.remove('dragging');

        const left = parseInt(phoneEl.style.left, 10);
        const top = parseInt(phoneEl.style.top, 10);
        dragDeps.savePhoneSetting('phoneContainerX', Number.isFinite(left) ? left : 0);
        dragDeps.savePhoneSetting('phoneContainerY', Number.isFinite(top) ? top : 0);

        pointerId = null;
        hasMoved = false;
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
        if (frameId !== null) {
            runtime.cancelAnimationFrame(frameId);
            frameId = null;
        }
        isDragging = false;
        pointerId = null;
        hasMoved = false;
        phoneEl.classList.remove('dragging');
        phoneEl.style.transform = '';
        unboundHandles.forEach((el) => {
            delete el.dataset[DRAG_BOUND_ATTR];
        });
    });
}
