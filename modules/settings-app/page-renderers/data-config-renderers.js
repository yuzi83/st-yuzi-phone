import {
    createAiInstructionPresetsPage,
    renderAiInstructionPresetsPage as renderAiInstructionPresetsPagePage,
} from '../pages/ai-instruction-presets.js';
import {
    createApiPromptConfigPage,
    renderApiPromptConfigPage as renderApiPromptConfigPagePage,
} from '../pages/api-prompt-config.js';
import { createDatabasePage, renderDatabasePage as renderDatabasePagePage } from '../pages/database.js';
import {
    buildAiInstructionPresetsPageContext,
    buildApiPromptConfigPageContext,
    buildDatabasePageContext,
} from './page-context-builders.js';

/**
 * @param {{
 *   deps?: import('../../../types').SettingsPageRendererGroupedDeps,
 *   pageContexts?: Record<string, any>,
 * } | import('../../../types').SettingsPageRendererGroupedDeps} rendererScope
 */
export function createDataConfigPageRenderers(rendererScope = {}) {
    const pageContexts = rendererScope?.pageContexts && typeof rendererScope.pageContexts === 'object'
        ? rendererScope.pageContexts
        : {};
    const deps = rendererScope?.deps && typeof rendererScope.deps === 'object'
        ? rendererScope.deps
        : rendererScope;

    const databaseContext = pageContexts.database || buildDatabasePageContext(deps);
    const apiPromptConfigContext = pageContexts.apiPromptConfig || buildApiPromptConfigPageContext(deps);
    const aiInstructionPresetsContext = pageContexts.aiInstructionPresets || buildAiInstructionPresetsPageContext(deps);

    const renderDatabasePage = () => {
        renderDatabasePagePage(databaseContext);
    };

    const renderApiPromptConfigPage = () => {
        renderApiPromptConfigPagePage(apiPromptConfigContext);
    };

    const renderAiInstructionPresetsPage = () => {
        renderAiInstructionPresetsPagePage(aiInstructionPresetsContext);
    };

    return {
        pages: {
            database: {
                createPage() {
                    return createDatabasePage(databaseContext);
                },
            },
            api_prompt_config: {
                createPage() {
                    return createApiPromptConfigPage(apiPromptConfigContext);
                },
            },
            ai_instruction_presets: {
                createPage() {
                    return createAiInstructionPresetsPage(aiInstructionPresetsContext);
                },
            },
        },
        renderDatabasePage,
        renderApiPromptConfigPage,
        renderAiInstructionPresetsPage,
    };
}
