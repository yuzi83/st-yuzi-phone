import {
    createBeautifyTemplatePage,
    renderBeautifyTemplatePage as renderBeautifyTemplatePagePage,
} from '../pages/beautify.js';
import { createPromptEditorPage, renderPromptEditorPage as renderPromptEditorPagePage } from '../pages/prompt-editor.js';
import {
    buildBeautifyTemplatePageContext,
    buildPromptEditorPageContext,
} from './page-context-builders.js';

/**
 * @param {{
 *   deps?: import('../../../types').SettingsPageRendererGroupedDeps,
 *   pageContexts?: Record<string, any>,
 * } | import('../../../types').SettingsPageRendererGroupedDeps} rendererScope
 */
export function createEditorPageRenderers(rendererScope = {}) {
    const pageContexts = rendererScope?.pageContexts && typeof rendererScope.pageContexts === 'object'
        ? rendererScope.pageContexts
        : {};
    const deps = rendererScope?.deps && typeof rendererScope.deps === 'object'
        ? rendererScope.deps
        : rendererScope;

    const promptEditorContext = pageContexts.promptEditor || buildPromptEditorPageContext(deps);
    const beautifyTemplateContext = pageContexts.beautifyTemplate || buildBeautifyTemplatePageContext(deps);

    const renderPromptEditorPage = () => {
        renderPromptEditorPagePage(promptEditorContext);
    };

    const renderBeautifyTemplatePage = () => {
        renderBeautifyTemplatePagePage(beautifyTemplateContext);
    };

    return {
        pages: {
            prompt_editor: {
                createPage() {
                    return createPromptEditorPage(promptEditorContext);
                },
            },
            beautify: {
                createPage() {
                    return createBeautifyTemplatePage(beautifyTemplateContext);
                },
            },
        },
        renderPromptEditorPage,
        renderBeautifyTemplatePage,
    };
}
