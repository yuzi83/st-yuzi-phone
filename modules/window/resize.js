import { constrainPosition, savePhoneSetting } from '../settings.js';
import { RESIZE_BOUND_ATTR, getWindowInteractionRuntime } from './runtime.js';

const resizeDeps = {
    constrainPosition,
    savePhoneSetting,
    getWindowInteractionRuntime,
};

export function __test__setDeps(overrides = {}) {
    if (!overrides || typeof overrides !== 'object') return;
    Object.assign(resizeDeps, overrides);
}

export function initPhoneShellResize() {
    const phoneEl = document.getElementById('yuzi-phone-standalone');
    if (!phoneEl) return;

    const runtime = resizeDeps.getWindowInteractionRuntime();

    phoneEl.querySelectorAll('.yuzi-phone-resize').forEach((handle) => {
        if (!(handle instanceof HTMLElement)) return;
        if (handle.dataset[RESIZE_BOUND_ATTR] === '1') return;

        handle.dataset[RESIZE_BOUND_ATTR] = '1';

        let isResizing = false;
        let pointerId = null;
        let dir = '';
        let startX = 0;
        let startY = 0;
        let startWidth = 0;
        let startHeight = 0;
        let startLeft = 0;
        let startTop = 0;

        function onContextMenu(event) {
            event.preventDefault();
        }

        function onPointerDown(event) {
            event.preventDefault();
            event.stopPropagation();

            dir = handle.getAttribute('data-dir') || '';
            const rect = phoneEl.getBoundingClientRect();

            isResizing = true;
            pointerId = event.pointerId;
            startX = event.clientX;
            startY = event.clientY;
            startWidth = rect.width;
            startHeight = rect.height;
            startLeft = rect.left;
            startTop = rect.top;

            handle.setPointerCapture(event.pointerId);
            phoneEl.classList.add('resizing');
        }

        function onPointerMove(event) {
            if (!isResizing || event.pointerId !== pointerId) return;

            event.preventDefault();

            const minWidth = Math.min(280, window.innerWidth);
            const minHeight = Math.min(520, window.innerHeight);
            const maxWidth = Math.max(minWidth, window.innerWidth - startLeft);
            const maxHeight = Math.max(minHeight, window.innerHeight - startTop);

            let nextWidth = startWidth;
            let nextHeight = startHeight;

            const deltaX = event.clientX - startX;
            const deltaY = event.clientY - startY;

            if (dir.includes('e')) {
                nextWidth = Math.max(minWidth, Math.min(startWidth + deltaX, maxWidth));
            }
            if (dir.includes('s')) {
                nextHeight = Math.max(minHeight, Math.min(startHeight + deltaY, maxHeight));
            }

            phoneEl.style.width = Math.round(nextWidth) + 'px';
            phoneEl.style.height = Math.round(nextHeight) + 'px';
        }

        function onPointerUp(event) {
            if (!isResizing || event.pointerId !== pointerId) return;

            isResizing = false;

            try {
                handle.releasePointerCapture(event.pointerId);
            } catch {}
            phoneEl.classList.remove('resizing');

            const left = parseInt(phoneEl.style.left, 10) || 0;
            const top = parseInt(phoneEl.style.top, 10) || 0;
            const constrained = resizeDeps.constrainPosition(left, top, phoneEl.offsetWidth, phoneEl.offsetHeight);

            phoneEl.style.left = constrained.x + 'px';
            phoneEl.style.top = constrained.y + 'px';

            resizeDeps.savePhoneSetting('phoneContainerX', constrained.x);
            resizeDeps.savePhoneSetting('phoneContainerY', constrained.y);
            resizeDeps.savePhoneSetting('phoneContainerWidth', phoneEl.offsetWidth);
            resizeDeps.savePhoneSetting('phoneContainerHeight', phoneEl.offsetHeight);

            pointerId = null;
            dir = '';
        }

        runtime.addEventListener(handle, 'contextmenu', onContextMenu);
        runtime.addEventListener(handle, 'pointerdown', onPointerDown);
        runtime.addEventListener(handle, 'pointermove', onPointerMove);
        runtime.addEventListener(handle, 'pointerup', onPointerUp);
        runtime.addEventListener(handle, 'pointercancel', onPointerUp);

        runtime.registerCleanup(() => {
            delete handle.dataset[RESIZE_BOUND_ATTR];
        });
    });
}
