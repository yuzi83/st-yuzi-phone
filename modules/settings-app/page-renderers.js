import { ErrorCodes, assert } from '../error-handler.js';
import { createDataConfigPageRenderers } from './page-renderers/data-config-renderers.js';
import { createEditorPageRenderers } from './page-renderers/editor-renderers.js';
import { createPersonalizationPageRenderers } from './page-renderers/personalization-renderers.js';

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
        'rerenderDatabaseKeepScroll',
        'rerenderButtonStyleKeepScroll',
        'rerenderApiPromptConfigKeepScroll',
    ]);
    assertFunctionDeps('home', deps.home, [
        'getDbConfigApiAvailability',
        'getDbPresets',
        'getActiveDbPresetName',
        'getApiPresets',
        'getTableApiPreset',
        'setTableApiPreset',
        'getCurrentPhoneAiInstructionPresetName',
        'switchPresetByName',
        'setupManualUpdateBtn',
    ]);
    assertFunctionDeps('appearance', deps.appearance, [
        'getLayoutValue',
        'getPhoneSettings',
        'setupBgUpload',
        'setupIconLayoutSettings',
        'setupAppearanceToggles',
        'renderHiddenTableAppsList',
        'renderIconUploadList',
    ]);
    assertFunctionDeps('dataConfig', deps.dataConfig, [
        'getTableData',
        'getSheetKeys',
        'getDbConfigApiAvailability',
        'readDbSnapshot',
        'getDbPresets',
        'getActiveDbPresetName',
        'switchPresetByName',
        'clearActivePresetBindingIfNeeded',
        'normalizeDbManualSelection',
        'normalizeDbUpdateConfig',
        'createDbPreset',
        'saveDbPresets',
        'setActiveDbPresetName',
        'writeDbUpdateConfigViaApi',
        'writeManualTableSelectionViaApi',
        'clearManualTableSelectionViaApi',
    ]);
    assertFunctionDeps('buttonStyle', deps.buttonStyle, [
        'getPhoneSettings',
        'savePhoneSetting',
        'savePhoneSettingsPatch',
    ]);
    assertFunctionDeps('apiPrompt', deps.apiPrompt, [
        'getDbConfigApiAvailability',
        'getApiPresets',
        'getTableApiPreset',
        'setTableApiPreset',
        'getPlotApiPreset',
        'setPlotApiPreset',
        'getPhoneAiInstructionPresets',
        'getPhoneAiInstructionPreset',
        'getCurrentPhoneAiInstructionPresetName',
        'setCurrentPhoneAiInstructionPresetName',
        'deletePhoneAiInstructionPreset',
        'importPhoneAiInstructionPresetsFromData',
        'exportPhoneAiInstructionPresetPack',
        'exportAllPhoneAiInstructionPresetsPack',
    ]);
    assertFunctionDeps('promptEditor', deps.promptEditor, [
        'getPhoneAiInstructionPreset',
        'savePhoneAiInstructionPreset',
    ]);
}

/**
 * @param {import('../../types').SettingsPageRendererGroupedDeps} deps
 * @returns {import('../../types').SettingsPageRenderers}
 */
export function createSettingsPageRenderers(deps = {}) {
    validateSettingsRendererDeps(deps);

    return {
        ...createPersonalizationPageRenderers({
            common: deps.common,
            navigation: deps.navigation,
            scroll: deps.scroll,
            feedback: deps.feedback,
            home: deps.home,
            appearance: deps.appearance,
            buttonStyle: deps.buttonStyle,
        }),
        ...createDataConfigPageRenderers({
            common: deps.common,
            scroll: deps.scroll,
            feedback: deps.feedback,
            dataConfig: deps.dataConfig,
            apiPrompt: deps.apiPrompt,
        }),
        ...createEditorPageRenderers({
            common: deps.common,
            scroll: deps.scroll,
            promptEditor: deps.promptEditor,
        }),
    };
}
