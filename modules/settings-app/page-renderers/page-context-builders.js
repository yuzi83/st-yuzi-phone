const SETTINGS_RENDERER_SERVICE_KEYS = [
    'common',
    'navigation',
    'scroll',
    'feedback',
    'appearance',
    'qqV2Presets',
    'buttonStyle',
    'contentPresetWorkshop',
    'worldbookReading',
    'imageGeneration',
    'tableContentReplacement',
    'fullscreenOverlay',
];

function ensureObject(value) {
    return value && typeof value === 'object' ? value : {};
}

function isSettingsRendererServices(value) {
    return !!value && typeof value === 'object'
        && SETTINGS_RENDERER_SERVICE_KEYS.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function getSettingsRendererServices(deps = {}) {
    return isSettingsRendererServices(deps) ? deps : createSettingsRendererServices(deps);
}

export function createSettingsRendererServices(deps = {}) {
    return {
        common: ensureObject(deps.common),
        navigation: ensureObject(deps.navigation),
        scroll: ensureObject(deps.scroll),
        feedback: ensureObject(deps.feedback),
        appearance: ensureObject(deps.appearance),
        qqV2Presets: ensureObject(deps.qqV2Presets),
        buttonStyle: ensureObject(deps.buttonStyle),
        contentPresetWorkshop: ensureObject(deps.contentPresetWorkshop),
        worldbookReading: ensureObject(deps.worldbookReading),
        imageGeneration: ensureObject(deps.imageGeneration),
        tableContentReplacement: ensureObject(deps.tableContentReplacement),
        fullscreenOverlay: ensureObject(deps.fullscreenOverlay),
    };
}

function buildHomePageContextFromServices(services) {
    return {
        ...services.common,
        navigateBack: services.navigation.navigateBack,
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
        importAppearanceResourcePackFromData: services.appearance.importAppearanceResourcePackFromData,
        listAppearancePacks: services.appearance.listAppearancePacks,
        importAppearancePackToRepository: services.appearance.importAppearancePackToRepository,
        applyAppearancePackFromRepository: services.appearance.applyAppearancePackFromRepository,
        deleteAppearancePackFromRepository: services.appearance.deleteAppearancePackFromRepository,
        getAppearancePackRepositoryStats: services.appearance.getAppearancePackRepositoryStats,
        exportAppearanceResourcePack: services.appearance.exportAppearanceResourcePack,
        clearAppearanceResourcePoolIcons: services.appearance.clearAppearanceResourcePoolIcons,
        getAppearanceFontLibraryViewModel: services.appearance.getAppearanceFontLibraryViewModel,
        importAppearanceFontFile: services.appearance.importAppearanceFontFile,
        importAppearanceFontCssUrl: services.appearance.importAppearanceFontCssUrl,
        selectAppearanceFont: services.appearance.selectAppearanceFont,
        deleteAppearanceFont: services.appearance.deleteAppearanceFont,
        applyAppearanceFontLibrary: services.appearance.applyAppearanceFontLibrary,
        getReadableTextScalePercentValue: services.appearance.getReadableTextScalePercentValue,
        applyReadableTextScale: services.appearance.applyReadableTextScale,
        setupReadableTextScaleSettings: services.appearance.setupReadableTextScaleSettings,
        getHomeAppLabelColorModeValue: services.appearance.getHomeAppLabelColorModeValue,
        setupHomeAppLabelColorSettings: services.appearance.setupHomeAppLabelColorSettings,
        getPhoneThemeModeValue: services.appearance.getPhoneThemeModeValue,
        applyPhoneThemeMode: services.appearance.applyPhoneThemeMode,
        setupPhoneThemeModeSettings: services.appearance.setupPhoneThemeModeSettings,
    };
}

function buildAppearancePageContextFromServices(services) {
    const appearancePageService = buildAppearancePageService(services);

    return {
        ...services.common,
        showToast: services.feedback.showToast,
        rerenderAppearanceKeepScroll: services.scroll.rerenderAppearanceKeepScroll,
        appearancePageService,
    };
}

function buildButtonStylePageContextFromServices(services) {
    return {
        ...services.common,
        buttonStylePageService: {
            getPhoneSettings: services.buttonStyle.getPhoneSettings,
            savePhoneSetting: services.buttonStyle.savePhoneSetting,
            showToast: services.feedback.showToast,
        },
    };
}

function buildWorldbookReadingPageContextFromServices(services) {
    return {
        ...services.common,
        rerenderWorldbookReadingKeepScroll: services.scroll.rerenderWorldbookReadingKeepScroll,
        worldbookReadingCatalog: services.worldbookReading,
    };
}

function buildImageGenerationPageContextFromServices(services) {
    return {
        ...services.common,
        showToast: services.feedback.showToast,
        rerenderImageGenerationKeepScroll: services.scroll.rerenderImageGenerationKeepScroll,
        imageGenerationSettingsService: services.imageGeneration,
        qqV2PresetService: services.qqV2Presets,
    };
}

function buildTableContentReplacementPageContextFromServices(services) {
    return {
        ...services.common,
        navigateBack: services.navigation.navigateBack,
        showToast: services.feedback.showToast,
        rerenderTableContentReplacementKeepScroll: services.scroll.rerenderTableContentReplacementKeepScroll,
        tableContentReplacementSettingsService: services.tableContentReplacement,
    };
}

function buildFullscreenOverlayPageContextFromServices(services) {
    return {
        ...services.common,
        showToast: services.feedback.showToast,
        rerenderFullscreenOverlayKeepScroll: services.scroll.rerenderFullscreenOverlayKeepScroll,
        fullscreenOverlaySettingsService: services.fullscreenOverlay,
    };
}

function buildBeautifyTemplatePageContextFromServices(services) {
    return {
        ...services.common,
        showToast: services.feedback.showToast,
        rerenderBeautifyKeepScroll: services.scroll.rerenderBeautifyKeepScroll,
        contentPresetWorkshopService: {
            getSnapshot: services.contentPresetWorkshop.getSnapshot,
            subscribe: services.contentPresetWorkshop.subscribe,
            getViewModel: services.contentPresetWorkshop.getViewModel,
            prepareImport: services.contentPresetWorkshop.prepareImport,
            importPrepared: services.contentPresetWorkshop.importPrepared,
            exportPreset: services.contentPresetWorkshop.exportPreset,
            deletePreset: services.contentPresetWorkshop.deletePreset,
            setActive: services.contentPresetWorkshop.setActive,
            clearActive: services.contentPresetWorkshop.clearActive,
            clearAllActive: services.contentPresetWorkshop.clearAllActive,
        },
    };
}

function buildAiInstructionPresetsPageContextFromServices(services) {
    return {
        ...services.common,
        showToast: services.feedback.showToast,
        rerenderAiInstructionPresetsKeepScroll: services.scroll.rerenderAiInstructionPresetsKeepScroll,
        qqV2PresetService: services.qqV2Presets,
    };
}

function buildApiPresetsPageContextFromServices(services) {
    return {
        ...services.common,
        showToast: services.feedback.showToast,
        rerenderApiPresetsKeepScroll: services.scroll.rerenderApiPresetsKeepScroll,
        qqV2PresetService: services.qqV2Presets,
    };
}

export function buildHomePageContext(deps = {}) { return buildHomePageContextFromServices(getSettingsRendererServices(deps)); }
export function buildAppearancePageContext(deps = {}) { return buildAppearancePageContextFromServices(getSettingsRendererServices(deps)); }
export function buildButtonStylePageContext(deps = {}) { return buildButtonStylePageContextFromServices(getSettingsRendererServices(deps)); }
export function buildWorldbookReadingPageContext(deps = {}) { return buildWorldbookReadingPageContextFromServices(getSettingsRendererServices(deps)); }
export function buildImageGenerationPageContext(deps = {}) { return buildImageGenerationPageContextFromServices(getSettingsRendererServices(deps)); }
export function buildTableContentReplacementPageContext(deps = {}) { return buildTableContentReplacementPageContextFromServices(getSettingsRendererServices(deps)); }
export function buildFullscreenOverlayPageContext(deps = {}) { return buildFullscreenOverlayPageContextFromServices(getSettingsRendererServices(deps)); }
export function buildBeautifyTemplatePageContext(deps = {}) { return buildBeautifyTemplatePageContextFromServices(getSettingsRendererServices(deps)); }
export function buildAiInstructionPresetsPageContext(deps = {}) { return buildAiInstructionPresetsPageContextFromServices(getSettingsRendererServices(deps)); }
export function buildApiPresetsPageContext(deps = {}) { return buildApiPresetsPageContextFromServices(getSettingsRendererServices(deps)); }

export function createSettingsPageContexts(deps = {}) {
    const services = getSettingsRendererServices(deps);
    return {
        home: buildHomePageContextFromServices(services),
        appearance: buildAppearancePageContextFromServices(services),
        buttonStyle: buildButtonStylePageContextFromServices(services),
        worldbookReading: buildWorldbookReadingPageContextFromServices(services),
        imageGeneration: buildImageGenerationPageContextFromServices(services),
        tableContentReplacement: buildTableContentReplacementPageContextFromServices(services),
        fullscreenOverlay: buildFullscreenOverlayPageContextFromServices(services),
        apiPresets: buildApiPresetsPageContextFromServices(services),
        beautifyTemplate: buildBeautifyTemplatePageContextFromServices(services),
        aiInstructionPresets: buildAiInstructionPresetsPageContextFromServices(services),
    };
}
