// window.js
/**
 * Yuzi Phone - 独立容器拖拽/缩放
 */

import { constrainPosition, savePhoneSetting } from './settings.js';

export function initPhoneShellDrag() {
    const $phone = $('#yuzi-phone-standalone');
    const shell = $phone.find('.phone-shell')[0];
    if (!shell) return;

    const notch = shell.querySelector('.phone-notch');
    const statusBar = shell.querySelector('.phone-status-bar');

    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;
    let pointerId = null;

    function onContextMenu(e) { e.preventDefault(); }

    function onPointerDown(e) {
        if ($phone.hasClass('resizing')) return;

        isDragging = true;
        pointerId = e.pointerId;

        const rect = $phone[0].getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;

        e.target.setPointerCapture(e.pointerId);
        $phone.addClass('dragging');
        e.preventDefault();
    }

    function onPointerMove(e) {
        if (!isDragging || e.pointerId !== pointerId) return;

        const constrained = constrainPosition(
            e.clientX - offsetX,
            e.clientY - offsetY,
            $phone[0].offsetWidth,
            $phone[0].offsetHeight,
        );

        $phone[0].style.left = constrained.x + 'px';
        $phone[0].style.top = constrained.y + 'px';
        e.preventDefault();
    }

    function onPointerUp(e) {
        if (!isDragging || e.pointerId !== pointerId) return;

        isDragging = false;
        try { e.target.releasePointerCapture(e.pointerId); } catch {}
        $phone.removeClass('dragging');

        savePhoneSetting('phoneContainerX', parseInt($phone.css('left'), 10));
        savePhoneSetting('phoneContainerY', parseInt($phone.css('top'), 10));

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
    const $phone = $('#yuzi-phone-standalone');
    if (!$phone.length) return;

    $phone.find('.yuzi-phone-resize').each(function() {
        const handle = this;

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
            const rect = $phone[0].getBoundingClientRect();

            isResizing = true;
            pointerId = e.pointerId;
            startX = e.clientX;
            startY = e.clientY;
            startWidth = rect.width;
            startHeight = rect.height;
            startLeft = rect.left;
            startTop = rect.top;

            handle.setPointerCapture(e.pointerId);
            $phone.addClass('resizing');
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

            $phone[0].style.width = Math.round(nextWidth) + 'px';
            $phone[0].style.height = Math.round(nextHeight) + 'px';
        }

        function onPointerUp(e) {
            if (!isResizing || e.pointerId !== pointerId) return;

            isResizing = false;

            try { handle.releasePointerCapture(e.pointerId); } catch {}
            $phone.removeClass('resizing');

            const left = parseInt($phone.css('left'), 10) || 0;
            const top = parseInt($phone.css('top'), 10) || 0;
            const constrained = constrainPosition(left, top, $phone[0].offsetWidth, $phone[0].offsetHeight);

            $phone.css({
                left: constrained.x + 'px',
                top: constrained.y + 'px',
            });

            savePhoneSetting('phoneContainerX', constrained.x);
            savePhoneSetting('phoneContainerY', constrained.y);
            savePhoneSetting('phoneContainerWidth', $phone[0].offsetWidth);
            savePhoneSetting('phoneContainerHeight', $phone[0].offsetHeight);

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
