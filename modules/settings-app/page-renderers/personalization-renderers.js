import { createAppearancePage, renderAppearancePage as renderAppearancePagePage } from '../pages/appearance.js';
import { createButtonStylePage, renderButtonStylePage as renderButtonStylePagePage } from '../pages/button-style.js';
import { createHomePage, renderHomePage as renderHomePagePage } from '../pages/home.js';
import {
    buildAppearancePageContext,
    buildButtonStylePageContext,
    buildHomePageContext,
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

    const renderHomePage = () => {
        renderHomePagePage(homeContext);
    };

    const renderAppearancePage = () => {
        renderAppearancePagePage(appearanceContext);
    };

    const renderButtonStylePage = () => {
        renderButtonStylePagePage(buttonStyleContext);
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
        },
        renderHomePage,
        renderAppearancePage,
        renderButtonStylePage,
    };
}
