import { renderAiInstructionPresetsPage as renderAiInstructionPresetsPagePage } from '../pages/ai-instruction-presets.js';
import { renderApiPromptConfigPage as renderApiPromptConfigPagePage } from '../pages/api-prompt-config.js';
import { renderDatabasePage as renderDatabasePagePage } from '../pages/database.js';

/**
 * @param {import('../../../types').SettingsPageRendererGroupedDeps} deps
 */
export function createDataConfigPageRenderers(deps = {}) {
    const common = /** @type {import('../../../types').SettingsPageRendererCommonDeps} */ (deps.common || {});
    const scroll = /** @type {import('../../../types').SettingsPageRendererScrollDeps} */ (deps.scroll || {});
    const feedback = /** @type {import('../../../types').SettingsPageRendererFeedbackDeps} */ (deps.feedback || {});
    const dataConfig = /** @type {import('../../../types').SettingsDataConfigPageRendererDeps} */ (deps.dataConfig || {});
    const apiPrompt = /** @type {import('../../../types').SettingsApiPromptPageRendererDeps} */ (deps.apiPrompt || {});

    return {
        renderDatabasePage() {
            renderDatabasePagePage({
                ...common,
                ...dataConfig,
                showToast: feedback.showToast,
                rerenderDatabaseKeepScroll: scroll.rerenderDatabaseKeepScroll,
            });
        },

        renderApiPromptConfigPage() {
            renderApiPromptConfigPagePage({
                ...common,
                ...apiPrompt,
                rerenderApiPromptConfigKeepScroll: scroll.rerenderApiPromptConfigKeepScroll,
            });
        },

        renderAiInstructionPresetsPage() {
            renderAiInstructionPresetsPagePage({
                ...common,
                ...apiPrompt,
                rerenderApiPromptConfigKeepScroll: scroll.rerenderApiPromptConfigKeepScroll,
            });
        },
    };
}
