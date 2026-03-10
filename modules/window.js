// window.js
/**
 * Yuzi Phone - 独立容器拖拽/缩放
 */

import { constrainPosition, savePhoneSetting } from './settings.js';

export function initPhoneShellDrag() {
    const phoneEl = document.getElementById('yuzi-phone-standalone');
    if (!phoneEl) return;
    const shell = phoneEl.querySelector('.phone-shell');
    if (!shell) return;

    const notch = shell.querySelector('.phone-notch');
    const statusBar = shell.querySelector('.phone-status-bar');

    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;
    let pointerId = null;

    function onContextMenu(e) { e.preventDefault(); }

    function onPointerDown(e) {
        if (phoneEl.classList.contains('resizing')) return;

        isDragging = true;
        pointerId = e.pointerId;

        const rect = phoneEl.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;

        e.target.setPointerCapture(e.pointerId);
        phoneEl.classList.add('dragging');
        e.preventDefault();
    }

    function onPointerMove(e) {
        if (!isDragging || e.pointerId !== pointerId) return;

        const constrained = constrainPosition(
            e.clientX - offsetX,
            e.clientY - offsetY,
            phoneEl.offsetWidth,
            phoneEl.offsetHeight,
        );

        phoneEl.style.left = constrained.x + 'px';
        phoneEl.style.top = constrained.y + 'px';
        e.preventDefault();
    }

    function onPointerUp(e) {
        if (!isDragging || e.pointerId !== pointerId) return;

        isDragging = false;
        try { e.target.releasePointerCapture(e.pointerId); } catch {}
        phoneEl.classList.remove('dragging');

        const left = parseInt(phoneEl.style.left, 10);
        const top = parseInt(phoneEl.style.top, 10);
        savePhoneSetting('phoneContainerX', Number.isFinite(left) ? left : 0);
        savePhoneSetting('phoneContainerY', Number.isFinite(top) ? top : 0);

        pointerId = null;
    }

    [notch, statusBar].forEach((el) => {
        if (!(el instanceof HTMLElement)) return;
        el.style.cursor = 'grab';
        el.style.touchAction = 'none';
        el.style.pointerEvents = 'auto';
        el.addEventListener('contextmenu', onContextMenu);
        el.addEventListener('pointerdown', onPointerDown);
        el.addEventListener('pointermove', onPointerMove);
        el.addEventListener('pointerup', onPointerUp);
        el.addEventListener('pointercancel', onPointerUp);
    });
}

export function initPhoneShellResize() {
    const phoneEl = document.getElementById('yuzi-phone-standalone');
    if (!phoneEl) return;

    phoneEl.querySelectorAll('.yuzi-phone-resize').forEach((handle) => {
        if (!(handle instanceof HTMLElement)) return;

        if (handle.dataset.resizeBound === '1') return;
        handle.dataset.resizeBound = '1';

        let isResizing = false;
        let pointerId = null;
        let dir = '';
        let startX = 0;
        let startY = 0;
        let startWidth = 0;
        let startHeight = 0;
        let startLeft = 0;
        let startTop = 0;

        function onContextMenu(e) {
            e.preventDefault();
        }

        function onPointerDown(e) {
            e.preventDefault();
            e.stopPropagation();

            dir = handle.getAttribute('data-dir') || '';
            const rect = phoneEl.getBoundingClientRect();

            isResizing = true;
            pointerId = e.pointerId;
            startX = e.clientX;
            startY = e.clientY;
            startWidth = rect.width;
            startHeight = rect.height;
            startLeft = rect.left;
            startTop = rect.top;

            handle.setPointerCapture(e.pointerId);
            phoneEl.classList.add('resizing');
        }

        function onPointerMove(e) {
            if (!isResizing || e.pointerId !== pointerId) return;

            e.preventDefault();

            const minWidth = Math.min(280, window.innerWidth);
            const minHeight = Math.min(520, window.innerHeight);
            const maxWidth = Math.max(minWidth, window.innerWidth - startLeft);
            const maxHeight = Math.max(minHeight, window.innerHeight - startTop);

            let nextWidth = startWidth;
            let nextHeight = startHeight;

            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;

            if (dir.includes('e')) {
                nextWidth = Math.max(minWidth, Math.min(startWidth + deltaX, maxWidth));
            }
            if (dir.includes('s')) {
                nextHeight = Math.max(minHeight, Math.min(startHeight + deltaY, maxHeight));
            }

            phoneEl.style.width = Math.round(nextWidth) + 'px';
            phoneEl.style.height = Math.round(nextHeight) + 'px';
        }

        function onPointerUp(e) {
            if (!isResizing || e.pointerId !== pointerId) return;

            isResizing = false;

            try { handle.releasePointerCapture(e.pointerId); } catch {}
            phoneEl.classList.remove('resizing');

            const left = parseInt(phoneEl.style.left, 10) || 0;
            const top = parseInt(phoneEl.style.top, 10) || 0;
            const constrained = constrainPosition(left, top, phoneEl.offsetWidth, phoneEl.offsetHeight);

            phoneEl.style.left = constrained.x + 'px';
            phoneEl.style.top = constrained.y + 'px';

            savePhoneSetting('phoneContainerX', constrained.x);
            savePhoneSetting('phoneContainerY', constrained.y);
            savePhoneSetting('phoneContainerWidth', phoneEl.offsetWidth);
            savePhoneSetting('phoneContainerHeight', phoneEl.offsetHeight);

            pointerId = null;
            dir = '';
        }

        handle.addEventListener('contextmenu', onContextMenu);
        handle.addEventListener('pointerdown', onPointerDown);
        handle.addEventListener('pointermove', onPointerMove);
        handle.addEventListener('pointerup', onPointerUp);
        handle.addEventListener('pointercancel', onPointerUp);
    });
}
