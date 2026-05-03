const SETTINGS_RENDERER_SERVICE_KEYS = [
    'common',
    'navigation',
    'scroll',
    'feedback',
    'home',
    'appearance',
    'dataConfig',
    'buttonStyle',
    'apiPrompt',
    'promptEditor',
];

function ensureObject(value) {
    return value && typeof value === 'object' ? value : {};
}

function isSettingsRendererServices(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }

    return SETTINGS_RENDERER_SERVICE_KEYS.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function getSettingsRendererServices(deps = {}) {
    return isSettingsRendererServices(deps)
        ? deps
        : createSettingsRendererServices(deps);
}

export function createSettingsRendererServices(deps = {}) {
    return {
        common: ensureObject(deps.common),
        navigation: ensureObject(deps.navigation),
        scroll: ensureObject(deps.scroll),
        feedback: ensureObject(deps.feedback),
        home: ensureObject(deps.home),
        appearance: ensureObject(deps.appearance),
        dataConfig: ensureObject(deps.dataConfig),
        buttonStyle: ensureObject(deps.buttonStyle),
        apiPrompt: ensureObject(deps.apiPrompt),
        promptEditor: ensureObject(deps.promptEditor),
    };
}

function buildDatabasePresetService(services) {
    return {
        getDbConfigApiAvailability: services.dataConfig.getDbConfigApiAvailability,
        getDbPresets: services.dataConfig.getDbPresets,
        getActiveDbPresetName: services.dataConfig.getActiveDbPresetName,
        switchPresetByName: services.dataConfig.switchPresetByName,
    };
}

function buildManualUpdateService(services) {
    return {
        setupManualUpdateBtn: services.home.setupManualUpdateBtn,
    };
}

function buildHomePageContextFromServices(services) {
    const databasePresetService = buildDatabasePresetService(services);
    const apiPromptService = buildApiPromptService(services);
    const aiInstructionPresetService = buildAiInstructionPresetService(services);
    const manualUpdateService = buildManualUpdateService(services);

    return {
        ...services.common,
        navigateBack: services.navigation.navigateBack,
        rerenderHomeKeepScroll: services.scroll.rerenderHomeKeepScroll,
        showToast: services.feedback.showToast,
        databasePresetService,
        apiPromptService,
        aiInstructionPresetService,
        manualUpdateService,
    };
}

function buildAppearancePageService(services) {
    return {
        getLayoutValue: services.appearance.getLayoutValue,
        getPhoneSettings: services.appearance.getPhoneSettings,
        setupBgUpload: services.appearance.setupBgUpload,
        setupIconLayoutSettings: services.appearance.setupIconLayoutSettings,
        setupAppearanceToggles: services.appearance.setupAppearanceToggles,
        renderHiddenTableAppsList: services.appearance.renderHiddenTableAppsList,
        renderIconUploadList: services.appearance.renderIconUploadList,
    };
}

function buildAppearancePageContextFromServices(services) {
    const appearancePageService = buildAppearancePageService(services);

    return {
        ...services.common,
        appearancePageService,
    };
}

function buildButtonStylePageService(services) {
    return {
        getPhoneSettings: services.buttonStyle.getPhoneSettings,
        savePhoneSetting: services.buttonStyle.savePhoneSetting,
        showToast: services.feedback.showToast,
    };
}

function buildButtonStylePageContextFromServices(services) {
    const buttonStylePageService = buildButtonStylePageService(services);

    return {
        ...services.common,
        buttonStylePageService,
    };
}

function buildDatabaseConfigService(services) {
    return {
        getTableData: services.dataConfig.getTableData,
        getSheetKeys: services.dataConfig.getSheetKeys,
        getDbConfigApiAvailability: services.dataConfig.getDbConfigApiAvailability,
        readDbSnapshot: services.dataConfig.readDbSnapshot,
        getDbPresets: services.dataConfig.getDbPresets,
        getActiveDbPresetName: services.dataConfig.getActiveDbPresetName,
        switchPresetByName: services.dataConfig.switchPresetByName,
        clearActivePresetBindingIfNeeded: services.dataConfig.clearActivePresetBindingIfNeeded,
        normalizeDbManualSelection: services.dataConfig.normalizeDbManualSelection,
        normalizeDbUpdateConfig: services.dataConfig.normalizeDbUpdateConfig,
        createDbPreset: services.dataConfig.createDbPreset,
        saveDbPresets: services.dataConfig.saveDbPresets,
        setActiveDbPresetName: services.dataConfig.setActiveDbPresetName,
        writeDbUpdateConfigViaApi: services.dataConfig.writeDbUpdateConfigViaApi,
        writeManualTableSelectionViaApi: services.dataConfig.writeManualTableSelectionViaApi,
        clearManualTableSelectionViaApi: services.dataConfig.clearManualTableSelectionViaApi,
    };
}

function buildDatabasePageContextFromServices(services) {
    const databaseConfigService = buildDatabaseConfigService(services);

    return {
        ...services.common,
        showToast: services.feedback.showToast,
        rerenderDatabaseKeepScroll: services.scroll.rerenderDatabaseKeepScroll,
        databaseConfigService,
    };
}

function buildApiPromptService(services) {
    return {
        getDbConfigApiAvailability: services.apiPrompt.getDbConfigApiAvailability,
        getApiPresets: services.apiPrompt.getApiPresets,
        getTableApiPreset: services.apiPrompt.getTableApiPreset,
        setTableApiPreset: services.apiPrompt.setTableApiPreset,
        getPlotApiPreset: services.apiPrompt.getPlotApiPreset,
        setPlotApiPreset: services.apiPrompt.setPlotApiPreset,
    };
}

function buildApiPromptConfigPageContextFromServices(services) {
    const apiPromptService = buildApiPromptService(services);

    return {
        ...services.common,
        apiPromptService,
    };
}

function buildAiInstructionPresetService(services) {
    return {
        getPhoneAiInstructionPresets: services.apiPrompt.getPhoneAiInstructionPresets,
        getPhoneAiInstructionPreset: services.apiPrompt.getPhoneAiInstructionPreset,
        getCurrentPhoneAiInstructionPresetName: services.apiPrompt.getCurrentPhoneAiInstructionPresetName,
        setCurrentPhoneAiInstructionPresetName: services.apiPrompt.setCurrentPhoneAiInstructionPresetName,
        deletePhoneAiInstructionPreset: services.apiPrompt.deletePhoneAiInstructionPreset,
        importPhoneAiInstructionPresetsFromData: services.apiPrompt.importPhoneAiInstructionPresetsFromData,
        exportPhoneAiInstructionPresetPack: services.apiPrompt.exportPhoneAiInstructionPresetPack,
        exportAllPhoneAiInstructionPresetsPack: services.apiPrompt.exportAllPhoneAiInstructionPresetsPack,
    };
}

function buildAiInstructionPresetsPageContextFromServices(services) {
    const aiInstructionPresetService = buildAiInstructionPresetService(services);

    return {
        ...services.common,
        rerenderApiPromptConfigKeepScroll: services.scroll.rerenderApiPromptConfigKeepScroll,
        aiInstructionPresetService,
    };
}

function buildPromptEditorService(services) {
    return {
        getPhoneAiInstructionPreset: services.promptEditor.getPhoneAiInstructionPreset,
        savePhoneAiInstructionPreset: services.promptEditor.savePhoneAiInstructionPreset,
    };
}

function buildPromptEditorPageContextFromServices(services) {
    const promptEditorService = buildPromptEditorService(services);

    return {
        ...services.common,
        promptEditorService,
    };
}

function buildBeautifyTemplatePageContextFromServices(services) {
    return {
        ...services.common,
        captureScroll: services.scroll.captureScroll,
        restoreScroll: services.scroll.restoreScroll,
        rerenderBeautifyKeepScroll: services.scroll.rerenderBeautifyKeepScroll,
    };
}

export function buildHomePageContext(deps = {}) {
    return buildHomePageContextFromServices(getSettingsRendererServices(deps));
}

export function buildAppearancePageContext(deps = {}) {
    return buildAppearancePageContextFromServices(getSettingsRendererServices(deps));
}

export function buildButtonStylePageContext(deps = {}) {
    return buildButtonStylePageContextFromServices(getSettingsRendererServices(deps));
}

export function buildDatabasePageContext(deps = {}) {
    return buildDatabasePageContextFromServices(getSettingsRendererServices(deps));
}

export function buildApiPromptConfigPageContext(deps = {}) {
    return buildApiPromptConfigPageContextFromServices(getSettingsRendererServices(deps));
}

export function buildAiInstructionPresetsPageContext(deps = {}) {
    return buildAiInstructionPresetsPageContextFromServices(getSettingsRendererServices(deps));
}

export function buildPromptEditorPageContext(deps = {}) {
    return buildPromptEditorPageContextFromServices(getSettingsRendererServices(deps));
}

export function buildBeautifyTemplatePageContext(deps = {}) {
    return buildBeautifyTemplatePageContextFromServices(getSettingsRendererServices(deps));
}

export function createSettingsPageContexts(deps = {}) {
    const services = getSettingsRendererServices(deps);

    return {
        home: buildHomePageContextFromServices(services),
        appearance: buildAppearancePageContextFromServices(services),
        buttonStyle: buildButtonStylePageContextFromServices(services),
        database: buildDatabasePageContextFromServices(services),
        apiPromptConfig: buildApiPromptConfigPageContextFromServices(services),
        aiInstructionPresets: buildAiInstructionPresetsPageContextFromServices(services),
        promptEditor: buildPromptEditorPageContextFromServices(services),
        beautifyTemplate: buildBeautifyTemplatePageContextFromServices(services),
    };
}
