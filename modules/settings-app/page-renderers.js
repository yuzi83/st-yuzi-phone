import { ErrorCodes, assert } from '../error-handler.js';
import { createEditorPageRenderers } from './page-renderers/editor-renderers.js';
import { createPersonalizationPageRenderers } from './page-renderers/personalization-renderers.js';
import { createPresetPageRenderers } from './page-renderers/preset-renderers.js';
import {
    createSettingsPageContexts,
    createSettingsRendererServices,
} from './page-renderers/page-context-builders.js';

function assertFunctionDeps(groupName, group, keys = []) {
    const safeGroup = group && typeof group === 'object' ? group : {};
    keys.forEach((key) => {
        assert(
            typeof safeGroup[key] === 'function',
            `[玉子手机] settings renderer 缺少 ${groupName}.${key}`,
            ErrorCodes.INVALID_SETTINGS,
        );
    });
}

function validateSettingsRendererDeps(deps = {}) {
    const common = deps.common && typeof deps.common === 'object' ? deps.common : {};
    const hasHTMLElement = typeof HTMLElement !== 'undefined';

    assert(
        !hasHTMLElement || common.container instanceof HTMLElement,
        '[玉子手机] settings renderer 缺少有效的 common.container',
        ErrorCodes.DOM_ELEMENT_NOT_FOUND,
    );
    assert(
        common.state && typeof common.state === 'object',
        '[玉子手机] settings renderer 缺少有效的 common.state',
        ErrorCodes.INVALID_SETTINGS,
    );
    assert(
        typeof common.render === 'function',
        '[玉子手机] settings renderer 缺少 common.render',
        ErrorCodes.INVALID_SETTINGS,
    );

    assertFunctionDeps('navigation', deps.navigation, ['navigateBack']);
    assertFunctionDeps('feedback', deps.feedback, ['showToast']);
    assertFunctionDeps('scroll', deps.scroll, [
        'captureScroll',
        'restoreScroll',
        'rerenderHomeKeepScroll',
        'rerenderAppearanceKeepScroll',
        'rerenderApiPresetsKeepScroll',
        'rerenderBeautifyKeepScroll',
        'rerenderAiInstructionPresetsKeepScroll',
        'rerenderWorldbookReadingKeepScroll',
        'rerenderImageGenerationKeepScroll',
    ]);
    assertFunctionDeps('appearance', deps.appearance, [
        'getLayoutValue',
        'getPhoneSettings',
        'setupBgUpload',
        'setupIconLayoutSettings',
        'setupAppearanceToggles',
        'renderHiddenTableAppsList',
        'renderIconUploadList',
        'importAppearanceResourcePackFromData',
        'listAppearancePacks',
        'importAppearancePackToRepository',
        'applyAppearancePackFromRepository',
        'deleteAppearancePackFromRepository',
        'getAppearancePackRepositoryStats',
        'exportAppearanceResourcePack',
        'clearAppearanceResourcePoolIcons',
        'getAppearanceFontLibraryViewModel',
        'importAppearanceFontFile',
        'importAppearanceFontCssUrl',
        'selectAppearanceFont',
        'deleteAppearanceFont',
        'applyAppearanceFontLibrary',
        'getReadableTextScalePercentValue',
        'applyReadableTextScale',
        'setupReadableTextScaleSettings',
        'getHomeAppLabelColorModeValue',
        'setupHomeAppLabelColorSettings',
        'getPhoneThemeModeValue',
        'applyPhoneThemeMode',
        'setupPhoneThemeModeSettings',
    ]);
    assertFunctionDeps('qqV2Presets', deps.qqV2Presets, [
        'readSharedResources',
        'saveApiPreset',
        'deleteApiPreset',
        'loadModels',
        'savePromptPreset',
        'deletePromptPreset',
        'restoreBuiltInPromptPreset',
        'restoreAllBuiltInPromptPresets',
        'importPromptPresets',
        'exportPromptPreset',
        'exportAllPromptPresets',
    ]);
    assertFunctionDeps('buttonStyle', deps.buttonStyle, [
        'getPhoneSettings',
        'savePhoneSetting',
    ]);
    assertFunctionDeps('contentPresetWorkshop', deps.contentPresetWorkshop, [
        'getSnapshot',
        'subscribe',
        'getViewModel',
        'prepareImport',
        'importPrepared',
        'exportPreset',
        'deletePreset',
        'setActive',
        'clearActive',
        'clearAllActive',
    ]);
    assertFunctionDeps('worldbookReading', deps.worldbookReading, [
        'load',
        'setSelected',
        'subscribe',
    ]);
    assertFunctionDeps('imageGeneration', deps.imageGeneration, [
        'loadViewModel',
        'saveConfig',
        'testGenerate',
    ]);
}

/**
 * @param {import('../../types').SettingsPageRendererGroupedDeps} deps
 * @returns {import('../../types').SettingsPageRenderers}
 */
export function createSettingsPageRenderers(deps = {}) {
    validateSettingsRendererDeps(deps);
    const services = createSettingsRendererServices(deps);
    const pageContexts = createSettingsPageContexts(services);
    const rendererScope = {
        deps,
        services,
        pageContexts,
    };

    const { pages: personalizationPages = {}, ...personalizationRenderers } = createPersonalizationPageRenderers(rendererScope);
    const { pages: presetPages = {}, ...presetRenderers } = createPresetPageRenderers(rendererScope);
    const { pages: editorPages = {}, ...editorRenderers } = createEditorPageRenderers(rendererScope);

    return {
        pages: {
            ...personalizationPages,
            ...presetPages,
            ...editorPages,
        },
        ...personalizationRenderers,
        ...presetRenderers,
        ...editorRenderers,
    };
}
