import { renderBeautifyTemplatePage as renderBeautifyTemplatePagePage } from '../pages/beautify.js';
import { renderPromptEditorPage as renderPromptEditorPagePage } from '../pages/prompt-editor.js';

/**
 * @param {import('../../../types').SettingsPageRendererGroupedDeps} deps
 */
export function createEditorPageRenderers(deps = {}) {
    const common = /** @type {import('../../../types').SettingsPageRendererCommonDeps} */ (deps.common || {});
    const scroll = /** @type {import('../../../types').SettingsPageRendererScrollDeps} */ (deps.scroll || {});
    const promptEditor = /** @type {import('../../../types').SettingsPromptEditorPageRendererDeps} */ (deps.promptEditor || {});

    return {
        renderPromptEditorPage() {
            renderPromptEditorPagePage({
                ...common,
                ...promptEditor,
            });
        },

        renderBeautifyTemplatePage() {
            renderBeautifyTemplatePagePage({
                ...common,
                captureScroll: scroll.captureScroll,
                restoreScroll: scroll.restoreScroll,
            });
        },
    };
}
