export const TABLE_VIEWER_SCROLL_SELECTOR = '.phone-app-body';

function getScrollableBody(container, selector) {
    const body = container.querySelector(selector);
    return body instanceof HTMLElement ? body : null;
}

function clampScrollTop(body, rawTop) {
    const maxTop = Math.max(0, (body.scrollHeight || 0) - (body.clientHeight || 0));
    return Math.min(Math.max(0, Number(rawTop) || 0), maxTop);
}

function restoreScrollInFrames(container, selector, targetTop, remainingFrames = 2) {
    const body = getScrollableBody(container, selector);
    if (!body) return;

    body.scrollTop = clampScrollTop(body, targetTop);
    if (remainingFrames <= 0) return;

    requestAnimationFrame(() => {
        restoreScrollInFrames(container, selector, targetTop, remainingFrames - 1);
    });
}

export function createTableViewerScrollPreserver(container, state, selector = TABLE_VIEWER_SCROLL_SELECTOR) {
    const captureScroll = (key) => {
        const body = getScrollableBody(container, selector);
        if (!body) return;
        state[key] = Math.max(0, Number(body.scrollTop) || 0);
    };

    const restoreScroll = (key) => {
        restoreScrollInFrames(container, selector, state[key], 2);
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
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
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
