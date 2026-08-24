import { registerPhoneTemporaryLayerHost } from './shell-temporary-layer-host.js';

const BOTTOM_BAR_SELECTOR = '[data-phone-bottom-bar]';
const HOME_REGION_BACKGROUND_PROPERTY = '--yuzi-phone-home-region-background';

function isHomeRoute(route) {
    return String(route || '').trim() === 'home';
}

function getCurrentPage(screen) {
    const pages = Array.from(screen?.children || []).filter((child) => (
        child?.classList?.contains?.('phone-page')
        && child.getAttribute?.('aria-hidden') !== 'true'
        && !child.classList.contains('phone-page-exit')
        && !child.classList.contains('phone-page-exit-back')
    ));
    return pages[pages.length - 1] || null;
}

function getComputedStyleFor(element) {
    const view = element?.ownerDocument?.defaultView;
    const readStyle = view?.getComputedStyle || globalThis.getComputedStyle;
    return typeof readStyle === 'function' ? readStyle.call(view || globalThis, element) : null;
}

function isVisibleWithinPage(element, page) {
    for (let current = element; current; current = current.parentElement || current.parentNode) {
        if (current.hidden || current.getAttribute?.('aria-hidden') === 'true') return false;

        const style = getComputedStyleFor(current);
        if (style?.display === 'none'
            || style?.visibility === 'hidden'
            || style?.visibility === 'collapse'
            || style?.pointerEvents === 'none') {
            return false;
        }

        if (current === page) return true;
    }
    return false;
}

function findVisibleBottomBar(screen) {
    const page = getCurrentPage(screen);
    if (!page) return null;

    return Array.from(page.querySelectorAll?.(BOTTOM_BAR_SELECTOR) || [])
        .find((bar) => isVisibleWithinPage(bar, page)) || null;
}

function getBottomBarBackground(bottomBar) {
    const style = getComputedStyleFor(bottomBar);
    if (!style) return '';

    if (style.backgroundImage && style.backgroundImage !== 'none') {
        return String(style.background || '').trim();
    }

    const backgroundColor = String(style.backgroundColor || '').trim();
    return backgroundColor === 'transparent' ? '' : backgroundColor;
}

function isComposerStyleMutation(mutation) {
    if (mutation?.type !== 'attributes' || mutation.attributeName !== 'style') {
        return false;
    }

    const target = mutation.target;
    return String(target?.tagName || '').toLowerCase() === 'textarea'
        || target?.classList?.contains?.('yuzi-qq-composer-input');
}

function shouldRefreshForMutations(mutations) {
    const records = Array.from(mutations || []);
    return records.length === 0 || records.some((mutation) => !isComposerStyleMutation(mutation));
}

export function bindPhoneShellAppControls(root, {
    getCurrentRoute = () => 'home',
    navigateTo = () => {},
} = {}) {
    const indicator = root?.querySelector?.('[data-yuzi-phone-home-indicator]') || null;
    const shell = root?.querySelector?.('.yuzi-phone-shell') || null;
    const screen = root?.querySelector?.('.yuzi-phone-screen') || null;
    const temporaryLayerHost = root?.querySelector?.('[data-yuzi-phone-temporary-layer-host]') || null;
    const unregisterTemporaryLayerHost = registerPhoneTemporaryLayerHost(temporaryLayerHost);

    const refresh = () => {
        if (!indicator) return;
        const hidden = isHomeRoute(getCurrentRoute());
        const bottomBar = hidden ? null : findVisibleBottomBar(screen);
        const layout = bottomBar ? 'docked' : 'floating';
        indicator.hidden = hidden;
        indicator.setAttribute?.('aria-hidden', String(hidden));
        indicator.tabIndex = hidden ? -1 : 0;
        shell?.setAttribute?.('data-yuzi-phone-home-indicator-layout', layout);

        const background = bottomBar ? getBottomBarBackground(bottomBar) : '';
        if (background) {
            shell?.style?.setProperty?.(HOME_REGION_BACKGROUND_PROPERTY, background);
        } else {
            shell?.style?.removeProperty?.(HOME_REGION_BACKGROUND_PROPERTY);
        }
    };

    const onIndicatorClick = (event) => {
        event?.preventDefault?.();
        if (isHomeRoute(getCurrentRoute())) return;
        navigateTo('home');
    };

    indicator?.addEventListener?.('click', onIndicatorClick);
    const view = root?.ownerDocument?.defaultView || globalThis.window;
    const MutationObserverClass = view?.MutationObserver || globalThis.MutationObserver;
    const observer = screen && typeof MutationObserverClass === 'function'
        ? new MutationObserverClass((mutations) => {
            if (shouldRefreshForMutations(mutations)) refresh();
        })
        : null;
    observer?.observe?.(screen, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-hidden', 'class', 'hidden', 'style', 'data-phone-bottom-bar'],
    });
    if (root && root !== screen) {
        observer?.observe?.(root, {
            attributes: true,
            attributeFilter: ['data-yuzi-phone-theme'],
        });
    }
    view?.addEventListener?.('resize', refresh);
    refresh();

    return {
        refresh,
        dispose() {
            indicator?.removeEventListener?.('click', onIndicatorClick);
            observer?.disconnect?.();
            view?.removeEventListener?.('resize', refresh);
            unregisterTemporaryLayerHost();
        },
    };
}
