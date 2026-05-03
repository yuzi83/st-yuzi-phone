function getScrollableBody(container, selector) {
    const body = container.querySelector(selector);
    return body instanceof HTMLElement ? body : null;
}

function clampScrollTop(body, rawTop) {
    const maxTop = Math.max(0, (body.scrollHeight || 0) - (body.clientHeight || 0));
    return Math.min(Math.max(0, Number(rawTop) || 0), maxTop);
}

function requestRuntimeFrame(runtime, callback) {
    if (typeof callback !== 'function') return null;
    if (runtime && typeof runtime.requestAnimationFrame === 'function') {
        return runtime.requestAnimationFrame(callback);
    }
    return window.requestAnimationFrame(callback);
}

function restoreScrollInFrames(container, selector, targetTop, remainingFrames = 2, runtime = null) {
    if (!(container instanceof HTMLElement) || !container.isConnected) return;

    const body = getScrollableBody(container, selector);
    if (!body) return;

    body.scrollTop = clampScrollTop(body, targetTop);
    if (remainingFrames <= 0) return;

    requestRuntimeFrame(runtime, () => {
        restoreScrollInFrames(container, selector, targetTop, remainingFrames - 1, runtime);
    });
}

export function createRuntimeScrollPreserver(container, state, selector, runtime = null) {
    const captureScroll = (key) => {
        const body = getScrollableBody(container, selector);
        if (!body) return;
        state[key] = Math.max(0, Number(body.scrollTop) || 0);
    };

    const restoreScroll = (key) => {
        restoreScrollInFrames(container, selector, state[key], 2, runtime);
    };

    const createRerenderWithScroll = (key, renderFn) => {
        return () => {
            const prevContainerHeight = Math.max(0, container.offsetHeight || 0);
            captureScroll(key);

            if (prevContainerHeight > 0) {
                container.style.minHeight = `${prevContainerHeight}px`;
            }

            try {
                renderFn();
            } finally {
                restoreScroll(key);
                requestRuntimeFrame(runtime, () => {
                    requestRuntimeFrame(runtime, () => {
                        if (!container.isConnected) return;
                        container.style.removeProperty('min-height');
                    });
                });
            }
        };
    };

    return {
        captureScroll,
        restoreScroll,
        createRerenderWithScroll,
    };
}
