import { createAppearancePage, renderAppearancePage as renderAppearancePagePage } from '../pages/appearance.js';
import { createButtonStylePage, renderButtonStylePage as renderButtonStylePagePage } from '../pages/button-style.js';
import { createHomePage, renderHomePage as renderHomePagePage } from '../pages/home.js';
import {
    createWorldbookReadingPage,
    renderWorldbookReadingPage as renderWorldbookReadingPagePage,
} from '../pages/worldbook-reading.js';
import {
    createImageGenerationPage,
    renderImageGenerationPage as renderImageGenerationPagePage,
} from '../pages/image-generation.js';
import {
    createFullscreenOverlayPage,
    renderFullscreenOverlayPage as renderFullscreenOverlayPagePage,
} from '../pages/fullscreen-overlay.js';
import {
    buildAppearancePageContext,
    buildButtonStylePageContext,
    buildFullscreenOverlayPageContext,
    buildHomePageContext,
    buildImageGenerationPageContext,
    buildWorldbookReadingPageContext,
} from './page-context-builders.js';

/**
 * @param {{
 *   deps?: import('../../../types').SettingsPageRendererGroupedDeps,
 *   pageContexts?: Record<string, any>,
 * } | import('../../../types').SettingsPageRendererGroupedDeps} rendererScope
 */
export function createPersonalizationPageRenderers(rendererScope = {}) {
    const pageContexts = rendererScope?.pageContexts && typeof rendererScope.pageContexts === 'object'
        ? rendererScope.pageContexts
        : {};
    const deps = rendererScope?.deps && typeof rendererScope.deps === 'object'
        ? rendererScope.deps
        : rendererScope;

    const homeContext = pageContexts.home || buildHomePageContext(deps);
    const appearanceContext = pageContexts.appearance || buildAppearancePageContext(deps);
    const buttonStyleContext = pageContexts.buttonStyle || buildButtonStylePageContext(deps);
    const worldbookReadingContext = pageContexts.worldbookReading || buildWorldbookReadingPageContext(deps);
    const imageGenerationContext = pageContexts.imageGeneration || buildImageGenerationPageContext(deps);
    const fullscreenOverlayContext = pageContexts.fullscreenOverlay || buildFullscreenOverlayPageContext(deps);

    const renderHomePage = () => {
        renderHomePagePage(homeContext);
    };

    const renderAppearancePage = () => {
        renderAppearancePagePage(appearanceContext);
    };

    const renderButtonStylePage = () => {
        renderButtonStylePagePage(buttonStyleContext);
    };

    const renderWorldbookReadingPage = () => {
        renderWorldbookReadingPagePage(worldbookReadingContext);
    };

    const renderImageGenerationPage = () => {
        renderImageGenerationPagePage(imageGenerationContext);
    };

    const renderFullscreenOverlayPage = () => {
        renderFullscreenOverlayPagePage(fullscreenOverlayContext);
    };

    return {
        pages: {
            home: {
                createPage() {
                    return createHomePage(homeContext);
                },
            },
            appearance: {
                createPage() {
                    return createAppearancePage(appearanceContext);
                },
            },
            button_style: {
                createPage() {
                    return createButtonStylePage(buttonStyleContext);
                },
            },
            worldbook_reading: {
                createPage() {
                    return createWorldbookReadingPage(worldbookReadingContext);
                },
            },
            image_generation: {
                createPage() {
                    return createImageGenerationPage(imageGenerationContext);
                },
            },
            fullscreen_overlay: {
                createPage() {
                    return createFullscreenOverlayPage(fullscreenOverlayContext);
                },
            },
        },
        renderHomePage,
        renderAppearancePage,
        renderButtonStylePage,
        renderWorldbookReadingPage,
        renderImageGenerationPage,
        renderFullscreenOverlayPage,
    };
}
