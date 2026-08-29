import {
    createFullscreenOverlayPage,
    renderFullscreenOverlayPage as renderFullscreenOverlayPageImpl,
} from '../pages/fullscreen-overlay.js';

export function buildFullscreenOverlayPageContext(deps = {}) {
    const common = deps?.common && typeof deps.common === 'object' ? deps.common : {};
    const scroll = deps?.scroll && typeof deps.scroll === 'object' ? deps.scroll : {};
    const feedback = deps?.feedback && typeof deps.feedback === 'object' ? deps.feedback : {};
    return {
        ...common,
        showToast: feedback.showToast,
        rerenderFullscreenOverlayKeepScroll: scroll.rerenderFullscreenOverlayKeepScroll,
        fullscreenOverlaySettingsService: deps.fullscreenOverlay,
    };
}

export function createFullscreenOverlayPageRenderers(rendererScope = {}) {
    const pageContexts = rendererScope?.pageContexts && typeof rendererScope.pageContexts === 'object'
        ? rendererScope.pageContexts
        : {};
    const deps = rendererScope?.deps && typeof rendererScope.deps === 'object'
        ? rendererScope.deps
        : rendererScope;
    const fullscreenOverlayContext = pageContexts.fullscreenOverlay
        || buildFullscreenOverlayPageContext(deps);

    return {
        pages: {
            fullscreen_overlay: {
                createPage() {
                    return createFullscreenOverlayPage(fullscreenOverlayContext);
                },
            },
        },
        renderFullscreenOverlayPage() {
            renderFullscreenOverlayPageImpl(fullscreenOverlayContext);
        },
    };
}
