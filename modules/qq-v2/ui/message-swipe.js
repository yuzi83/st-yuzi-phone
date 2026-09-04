const DEFAULT_THRESHOLD = 42;
const DEFAULT_AXIS_THRESHOLD = 6;
const CLICK_SUPPRESS_MS = 500;

export function resolveMessageQuoteSwipe(start, end, { threshold = DEFAULT_THRESHOLD } = {}) {
    const initial = start && typeof start === 'object' ? start : {};
    const current = end && typeof end === 'object' ? end : {};
    const horizontal = Number(current.x) - Number(initial.x);
    const vertical = Math.abs(Number(current.y) - Number(initial.y));
    const distance = Math.abs(Number(threshold) || DEFAULT_THRESHOLD);
    if (!Number.isFinite(horizontal) || !Number.isFinite(vertical)) return 'ignore';
    if (vertical > Math.abs(horizontal)) return 'ignore';
    return horizontal <= -distance ? 'quote' : 'ignore';
}

export function bindMessageQuoteSwipeGesture({
    row,
    onQuote = () => {},
    threshold = DEFAULT_THRESHOLD,
    axisThreshold = DEFAULT_AXIS_THRESHOLD,
} = {}) {
    if (!(row instanceof HTMLElement) || typeof onQuote !== 'function') return () => {};

    let activePointer = null;
    let suppressClickUntil = 0;

    const resetDragVisual = () => {
        row.classList.remove('is-quote-swiping');
        row.style.removeProperty('--yuzi-qq-message-quote-swipe-offset');
    };

    const releasePointer = () => {
        const pointerId = activePointer?.pointerId;
        activePointer = null;
        if (pointerId == null) return;
        try {
            if (row.hasPointerCapture?.(pointerId)) row.releasePointerCapture(pointerId);
        } catch {
            // Losing capture during rerender is harmless; the next render owns the row.
        }
    };

    const handlePointerDown = (event) => {
        if (event.isPrimary === false) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        activePointer = {
            pointerId: event.pointerId,
            startX: Number(event.clientX) || 0,
            startY: Number(event.clientY) || 0,
            axis: '',
        };
        try {
            row.setPointerCapture?.(event.pointerId);
        } catch {
            // Pointer capture is an enhancement; document hit testing remains usable.
        }
    };

    const handlePointerMove = (event) => {
        const state = activePointer;
        if (!state || state.pointerId !== event.pointerId) return;

        const horizontal = (Number(event.clientX) || 0) - state.startX;
        const vertical = (Number(event.clientY) || 0) - state.startY;
        if (!state.axis) {
            if (Math.max(Math.abs(horizontal), Math.abs(vertical)) < axisThreshold) return;
            state.axis = Math.abs(horizontal) >= Math.abs(vertical) ? 'horizontal' : 'vertical';
        }
        if (state.axis !== 'horizontal' || horizontal >= 0) {
            resetDragVisual();
            return;
        }

        event.preventDefault();
        row.classList.add('is-quote-swiping');
        row.style.setProperty(
            '--yuzi-qq-message-quote-swipe-offset',
            `${Math.max(-Math.abs(Number(threshold) || DEFAULT_THRESHOLD), horizontal)}px`,
        );
    };

    const handlePointerUp = (event) => {
        const state = activePointer;
        if (!state || state.pointerId !== event.pointerId) return;
        const end = { x: event.clientX, y: event.clientY };
        const direction = state.axis === 'horizontal'
            ? resolveMessageQuoteSwipe(
                { x: state.startX, y: state.startY },
                end,
                { threshold },
            )
            : 'ignore';
        if (direction === 'quote') {
            event.preventDefault();
            suppressClickUntil = Date.now() + CLICK_SUPPRESS_MS;
            onQuote(Object.freeze({ reason: 'left-swipe' }));
        }
        resetDragVisual();
        releasePointer();
    };

    const handlePointerCancel = (event) => {
        if (!activePointer || activePointer.pointerId !== event.pointerId) return;
        resetDragVisual();
        releasePointer();
    };

    const handleLostPointerCapture = (event) => {
        if (!activePointer || activePointer.pointerId !== event.pointerId) return;
        resetDragVisual();
        activePointer = null;
    };

    const handleClick = (event) => {
        if (Date.now() > suppressClickUntil) return;
        suppressClickUntil = 0;
        event.preventDefault();
        event.stopPropagation();
    };

    const preventNativeDrag = (event) => event.preventDefault();

    row.addEventListener('pointerdown', handlePointerDown);
    row.addEventListener('pointermove', handlePointerMove);
    row.addEventListener('pointerup', handlePointerUp);
    row.addEventListener('pointercancel', handlePointerCancel);
    row.addEventListener('lostpointercapture', handleLostPointerCapture);
    row.addEventListener('dragstart', preventNativeDrag);
    row.addEventListener('click', handleClick, true);

    return () => {
        row.removeEventListener('pointerdown', handlePointerDown);
        row.removeEventListener('pointermove', handlePointerMove);
        row.removeEventListener('pointerup', handlePointerUp);
        row.removeEventListener('pointercancel', handlePointerCancel);
        row.removeEventListener('lostpointercapture', handleLostPointerCapture);
        row.removeEventListener('dragstart', preventNativeDrag);
        row.removeEventListener('click', handleClick, true);
        resetDragVisual();
        activePointer = null;
    };
}
