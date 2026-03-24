import { Logger } from '../error-handler.js';
import { getPhoneCoreState, phoneRuntime } from './state.js';

const PHONE_SCROLL_ROOT_SELECTOR = '.phone-app-body, .phone-app-grid';
const PHONE_SCROLL_GUARD_BOUND_ATTR = 'phoneScrollGuardBound';
const PHONE_SCROLL_EDGE_EPSILON = 1;
const PHONE_SCROLL_EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';
const PHONE_SCROLL_DEBUG_GLOBAL_KEY = 'TAMAKO_PHONE_SCROLL_DEBUG';
const PHONE_SCROLL_DEBUG_CANDIDATE_SELECTOR = '.phone-app-body, .phone-app-grid, .phone-table-body, .phone-nav-list, .phone-row-detail-card, .phone-special-message-list, .phone-special-moments-list, .phone-settings-scroll';
const PHONE_INTERACTION_GUARD_BOUND_ATTR = 'phoneInteractionGuardBound';

function isPhoneScrollDebugEnabled() {
    return !!window[PHONE_SCROLL_DEBUG_GLOBAL_KEY];
}

function formatElementDebugName(el) {
    if (!(el instanceof Element)) return String(el);

    const tag = el.tagName ? el.tagName.toLowerCase() : 'unknown';
    const id = el.id ? `#${el.id}` : '';
    const classes = typeof el.className === 'string'
        ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 3)
        : [];
    const classText = classes.length ? `.${classes.join('.')}` : '';
    return `<${tag}${id}${classText}>`;
}

function getElementScrollDebugSnapshot(el) {
    if (!(el instanceof HTMLElement)) return null;
    const style = window.getComputedStyle(el);

    return {
        name: formatElementDebugName(el),
        overflowY: style.overflowY,
        overflowX: style.overflowX,
        position: style.position,
        pointerEvents: style.pointerEvents,
        touchAction: style.touchAction,
        overscrollBehaviorY: style.overscrollBehaviorY,
        minHeight: style.minHeight,
        height: style.height,
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
        scrollTop: el.scrollTop,
        canScrollY: isElementScrollableY(el),
    };
}

function collectScrollDebugCandidates(scope) {
    if (!(scope instanceof Element)) return [];

    const candidates = [];
    if (scope.matches?.(PHONE_SCROLL_DEBUG_CANDIDATE_SELECTOR)) {
        candidates.push(scope);
    }

    scope.querySelectorAll(PHONE_SCROLL_DEBUG_CANDIDATE_SELECTOR).forEach((el) => {
        candidates.push(el);
    });

    return Array.from(new Set(candidates));
}

function logPhoneScrollDebug(title, payload) {
    if (!isPhoneScrollDebugEnabled()) return;

    if (payload === undefined) {
        Logger.info(`[玉子的手机][ScrollDebug] ${title}`);
        return;
    }

    Logger.info(`[玉子的手机][ScrollDebug] ${title}`, payload);
}

export function logRouteScrollDebugSnapshot(route, page) {
    if (!isPhoneScrollDebugEnabled()) return;

    const candidates = collectScrollDebugCandidates(page)
        .map(getElementScrollDebugSnapshot)
        .filter(Boolean);

    logPhoneScrollDebug(`route=${route} layout snapshot`, {
        route,
        page: formatElementDebugName(page),
        candidates,
    });
}

function hasOverflowingContentY(el) {
    if (!(el instanceof HTMLElement)) return false;
    return el.scrollHeight > el.clientHeight + PHONE_SCROLL_EDGE_EPSILON;
}

function canElementScrollInDirectionLoose(el, deltaY) {
    if (!(el instanceof HTMLElement)) return false;
    if (!hasOverflowingContentY(el)) return false;

    const scrollTop = el.scrollTop;
    const maxScrollTop = el.scrollHeight - el.clientHeight;

    if (deltaY < 0) {
        return scrollTop > PHONE_SCROLL_EDGE_EPSILON;
    }
    if (deltaY > 0) {
        return scrollTop < (maxScrollTop - PHONE_SCROLL_EDGE_EPSILON);
    }

    return false;
}

function collectOverflowingChain(target, boundary) {
    const chain = [];
    let cursor = target instanceof Element ? target : boundary;

    while (cursor && cursor !== boundary) {
        if (cursor instanceof HTMLElement && hasOverflowingContentY(cursor)) {
            chain.push(cursor);
        }
        cursor = cursor.parentElement;
    }

    if (boundary instanceof HTMLElement && hasOverflowingContentY(boundary)) {
        chain.push(boundary);
    }

    return chain;
}

function applyWheelFallbackScroll(target, boundary, deltaY) {
    const overflowingChain = collectOverflowingChain(target, boundary);
    const host = overflowingChain.find((el) => canElementScrollInDirectionLoose(el, deltaY));

    if (!(host instanceof HTMLElement)) {
        return false;
    }

    const before = host.scrollTop;
    host.scrollTop = before + deltaY;
    const moved = Math.abs(host.scrollTop - before) > PHONE_SCROLL_EDGE_EPSILON;

    if (moved) {
        logPhoneScrollDebug('wheel fallback applied', {
            target: formatElementDebugName(target),
            boundary: formatElementDebugName(boundary),
            host: formatElementDebugName(host),
            deltaY,
            before,
            after: host.scrollTop,
        });
    }

    return moved;
}

function isElementScrollableY(el) {
    if (!(el instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(el);
    const overflowY = style.overflowY;
    const canScroll = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
    return canScroll && hasOverflowingContentY(el);
}

function shouldAllowNestedScroll(target, boundary, deltaY) {
    const chain = collectOverflowingChain(target, boundary);
    return chain.some((el) => canElementScrollInDirectionLoose(el, deltaY));
}

function findNearestScrollBoundary(target, scope) {
    if (!(scope instanceof Element)) return null;

    if (target instanceof Element) {
        let cursor = target;
        while (cursor && cursor !== scope) {
            if (cursor instanceof HTMLElement && cursor.matches(PHONE_SCROLL_ROOT_SELECTOR)) {
                return cursor;
            }
            cursor = cursor.parentElement;
        }
    }

    if (scope.matches?.(PHONE_SCROLL_ROOT_SELECTOR)) {
        return scope;
    }

    return scope.querySelector(PHONE_SCROLL_ROOT_SELECTOR);
}

function shouldIgnoreGuardTarget(target) {
    if (!(target instanceof Element)) return false;
    return !!target.closest(PHONE_SCROLL_EDITABLE_SELECTOR);
}

function bindWheelGuard(boundary, scope) {
    if (!(boundary instanceof HTMLElement)) return;
    if (boundary.dataset[PHONE_SCROLL_GUARD_BOUND_ATTR] === '1') return;
    boundary.dataset[PHONE_SCROLL_GUARD_BOUND_ATTR] = '1';

    boundary.addEventListener('wheel', (event) => {
        if (event.defaultPrevented) return;
        if (shouldIgnoreGuardTarget(event.target)) return;

        const target = event.target instanceof Element ? event.target : boundary;
        const deltaY = Number(event.deltaY || 0);
        if (!deltaY) return;

        const allowNested = shouldAllowNestedScroll(target, boundary, deltaY);
        if (allowNested) return;

        const moved = applyWheelFallbackScroll(target, boundary, deltaY);
        if (!moved) {
            event.preventDefault();
        }

        logPhoneScrollDebug('wheel guard', {
            scope: formatElementDebugName(scope),
            boundary: formatElementDebugName(boundary),
            target: formatElementDebugName(target),
            deltaY,
            allowNested,
            moved,
        });
    }, { passive: false });
}

function bindTouchGuard(boundary, scope) {
    if (!(boundary instanceof HTMLElement)) return;

    let lastTouchY = 0;

    boundary.addEventListener('touchstart', (event) => {
        if (shouldIgnoreGuardTarget(event.target)) return;
        const touch = event.touches?.[0];
        if (!touch) return;
        lastTouchY = touch.clientY;
    }, { passive: true });

    boundary.addEventListener('touchmove', (event) => {
        if (event.defaultPrevented) return;
        if (shouldIgnoreGuardTarget(event.target)) return;
        const touch = event.touches?.[0];
        if (!touch) return;

        const deltaY = lastTouchY - touch.clientY;
        lastTouchY = touch.clientY;
        if (!deltaY) return;

        const target = event.target instanceof Element ? event.target : boundary;
        const allowNested = shouldAllowNestedScroll(target, boundary, deltaY);
        if (!allowNested && !applyWheelFallbackScroll(target, boundary, deltaY)) {
            event.preventDefault();
        }

        logPhoneScrollDebug('touch guard', {
            scope: formatElementDebugName(scope),
            boundary: formatElementDebugName(boundary),
            target: formatElementDebugName(target),
            deltaY,
            allowNested,
        });
    }, { passive: false });
}

export function bindPhoneScrollGuards(scope) {
    if (!(scope instanceof Element)) return;

    const boundaries = new Set();
    const rootBoundary = findNearestScrollBoundary(scope, scope);
    if (rootBoundary instanceof HTMLElement) {
        boundaries.add(rootBoundary);
    }

    scope.querySelectorAll(PHONE_SCROLL_ROOT_SELECTOR).forEach((el) => {
        if (el instanceof HTMLElement) {
            boundaries.add(el);
        }
    });

    boundaries.forEach((boundary) => {
        bindWheelGuard(boundary, scope);
        bindTouchGuard(boundary, scope);
    });
}

function shouldBlockPointerDefault(target) {
    if (!(target instanceof Element)) return false;
    if (target.closest(PHONE_SCROLL_EDITABLE_SELECTOR)) return false;
    return !!target.closest('.phone-nav-list-item, .phone-cell-lock-btn, .phone-row-lock-chip, .phone-row-delete-chip, .phone-list-bottom-btn, .phone-detail-bottom-btn');
}

export function hardenPhoneInteractionDefaults(scope) {
    if (!(scope instanceof Element)) return;
    if (scope.dataset[PHONE_INTERACTION_GUARD_BOUND_ATTR] === '1') return;
    scope.dataset[PHONE_INTERACTION_GUARD_BOUND_ATTR] = '1';

    scope.addEventListener('pointerdown', (event) => {
        const target = event.target;
        if (shouldBlockPointerDefault(target)) {
            return;
        }

        const boundary = findNearestScrollBoundary(target instanceof Element ? target : scope, scope);
        if (!boundary) return;

        const targetEl = target instanceof Element ? target : boundary;
        if (shouldAllowNestedScroll(targetEl, boundary, 1) || shouldAllowNestedScroll(targetEl, boundary, -1)) {
            return;
        }

        logPhoneScrollDebug('pointerdown hardened', {
            scope: formatElementDebugName(scope),
            boundary: formatElementDebugName(boundary),
            target: formatElementDebugName(targetEl),
        });
    }, { passive: true });
}

export function bindPhoneInteractionGuards(scope) {
    bindPhoneScrollGuards(scope);
    hardenPhoneInteractionDefaults(scope);
}
