// modules/phone/phone-settings.js
/**
 * 玉子的手机 - 设置 App
 * 一级入口：外观设置 / 美化模板 / 按钮调节 / 数据库配置
 */

import {
    getTableData,
    getSheetKeys,
    getDbConfigApiAvailability,
    readDbUpdateConfigViaApi,
    writeDbUpdateConfigViaApi,
    readManualTableSelectionViaApi,
    writeManualTableSelectionViaApi,
    clearManualTableSelectionViaApi,
    // API预设选择桥接
    getApiPresets,
    getTableApiPreset,
    setTableApiPreset,
    getPlotApiPreset,
    setPlotApiPreset,
} from './phone-core/data-api.js';
import {
    createDefaultPhoneAiInstructionPreset,
    deletePhoneAiInstructionPreset,
    exportAllPhoneAiInstructionPresetsPack,
    exportPhoneAiInstructionPresetPack,
    getCurrentPhoneAiInstructionPresetName,
    getPhoneAiInstructionPreset,
    getPhoneAiInstructionPresets,
    importPhoneAiInstructionPresetsFromData,
    savePhoneAiInstructionPreset,
    setCurrentPhoneAiInstructionPresetName,
} from './phone-core/chat-support.js';
import { navigateBack } from './phone-core/routing.js';
import { bindPhoneScrollGuards } from './phone-core/scroll-guards.js';
import { getPhoneSettings, savePhoneSetting, savePhoneSettingsPatch } from './settings.js';
import { createScrollPreserver } from './settings-app/ui/scroll-preserver.js';
import { showToast } from './settings-app/ui/toast.js';
import {
    createDbPreset,
    getActiveDbPresetNameFromSettings,
    getDbPresetsFromPhoneSettings,
    normalizeDbManualSelection,
    normalizeDbUpdateConfig,
    saveDbPresetsToPhoneSettings,
    setActiveDbPresetNameToSettings,
} from './settings-app/services/db-presets.js';
import { createDbConfigRuntime } from './settings-app/services/db-config-runtime.js';
import { setupManualUpdateBtn as setupManualUpdateBtnService } from './settings-app/services/manual-update.js';
import {
    setupBgUpload as setupBgUploadService,
    renderIconUploadList as renderIconUploadListService,
    setupAppearanceToggles as setupAppearanceTogglesService,
    renderHiddenTableAppsList as renderHiddenTableAppsListService,
    setupIconLayoutSettings as setupIconLayoutSettingsService,
    getLayoutValue as getLayoutValueService,
} from './settings-app/services/appearance-settings.js';
import { createSettingsPageRenderers } from './settings-app/page-renderers.js';

const setupManualUpdateBtn = setupManualUpdateBtnService;
const setupBgUpload = setupBgUploadService;
const renderIconUploadList = renderIconUploadListService;
const setupAppearanceToggles = setupAppearanceTogglesService;
const renderHiddenTableAppsList = renderHiddenTableAppsListService;
const setupIconLayoutSettings = setupIconLayoutSettingsService;
const getLayoutValue = getLayoutValueService;
const SETTINGS_INTENT_GLOBAL_KEY = '__YUZI_PHONE_SETTINGS_INTENT__';

function consumePendingSettingsIntent() {
    try {
        const safeWindow = typeof window !== 'undefined' ? window : null;
        const intent = safeWindow?.[SETTINGS_INTENT_GLOBAL_KEY] || null;
        if (safeWindow && Object.prototype.hasOwnProperty.call(safeWindow, SETTINGS_INTENT_GLOBAL_KEY)) {
            delete safeWindow[SETTINGS_INTENT_GLOBAL_KEY];
        }
        return intent && typeof intent === 'object' ? intent : null;
    } catch (error) {
        return null;
    }
}

/**
 * @param {HTMLElement} container
 */
export function renderSettings(container) {
    /** @type {import('../types').SettingsAppState} */
    const state = {
        mode: 'home', // home | appearance | database | beautify | button_style | ai_instruction_presets | api_prompt_config | prompt_editor
        databaseScrollTop: 0,
        appearanceScrollTop: 0,
        beautifyScrollTop: 0,
        buttonStyleScrollTop: 0,
        apiPromptConfigScrollTop: 0,
        // 提示词编辑器状态
        promptEditorName: '',
        promptEditorContent: '',
        promptEditorIsNew: true,
        promptEditorOriginalName: '',
        // AI 指令预设页状态
        aiInstructionSelectedPresetName: '',
        aiInstructionDraftName: '',
        aiInstructionDraftOriginalName: '',
        aiInstructionDraftImagePrefix: '',
        aiInstructionDraftVideoPrefix: '',
        aiInstructionDraftPromptGroup: [],
        // API提示词配置页面状态
        apiPromptConfigSelectedTemplate: '',
        // 世界书条目读取状态
        worldbookLoading: false,
        worldbookError: null,
        worldbookList: [],           // 所有世界书名称列表
        currentWorldbook: '',        // 当前选中的世界书名称
        worldbookSourceMode: 'manual',
        boundWorldbookNames: [],
        worldbookEntries: [],        // 当前世界书的条目列表
        worldbookSearchQuery: '',    // 搜索关键词
        worldbookEventCleanup: null,
    };

    const pendingSettingsIntent = consumePendingSettingsIntent();
    if (pendingSettingsIntent) {
        const targetPresetName = String(pendingSettingsIntent.presetName || '').trim();
        if (targetPresetName) {
            state.apiPromptConfigSelectedTemplate = targetPresetName;
            state.aiInstructionSelectedPresetName = targetPresetName;
        }

        if (pendingSettingsIntent.mode === 'prompt_editor') {
            const preset = targetPresetName
                ? getPhoneAiInstructionPreset(targetPresetName)
                : createDefaultPhoneAiInstructionPreset();
            const promptGroup = preset?.promptGroup || preset?.segments || createDefaultPhoneAiInstructionPreset().promptGroup || [];
            state.promptEditorName = String(preset?.name || '').trim();
            state.promptEditorContent = JSON.stringify(promptGroup, null, 2);
            state.promptEditorIsNew = !preset || !targetPresetName;
            state.promptEditorOriginalName = String(preset?.name || '').trim();
            state.mode = 'prompt_editor';
        } else if (pendingSettingsIntent.mode === 'ai_instruction_presets') {
            state.mode = 'ai_instruction_presets';
        } else if (pendingSettingsIntent.mode === 'api_prompt_config') {
            state.mode = 'api_prompt_config';
        }
    }

    // ===== 统一的滚动位置管理辅助函数 =====
    const { captureScroll, restoreScroll, createRerenderWithScroll } = createScrollPreserver(container, state);

    const getDbPresets = () => getDbPresetsFromPhoneSettings();
    /** @param {import('../types').NamedSettingsEntry[]} presets */
    const saveDbPresets = (presets) => saveDbPresetsToPhoneSettings(presets);
    const getActiveDbPresetName = () => getActiveDbPresetNameFromSettings();
    /** @param {string} name */
    const setActiveDbPresetName = (name) => setActiveDbPresetNameToSettings(name);

    const {
        readDbSnapshot,
        switchPresetByName,
        clearActivePresetBindingIfNeeded,
    } = createDbConfigRuntime({
        getDbConfigApiAvailability,
        readDbUpdateConfigViaApi,
        writeDbUpdateConfigViaApi,
        readManualTableSelectionViaApi,
        writeManualTableSelectionViaApi,
        clearManualTableSelectionViaApi,
        getDbPresets,
        getActiveDbPresetName,
        setActiveDbPresetName,
        showToast,
    });

    const render = () => {
        if (state.mode === 'appearance') {
            pageRenderers.renderAppearancePage();
        } else if (state.mode === 'database') {
            pageRenderers.renderDatabasePage();
        } else if (state.mode === 'beautify') {
            pageRenderers.renderBeautifyTemplatePage();
        } else if (state.mode === 'button_style') {
            pageRenderers.renderButtonStylePage();
        } else if (state.mode === 'ai_instruction_presets') {
            pageRenderers.renderAiInstructionPresetsPage();
        } else if (state.mode === 'api_prompt_config') {
            pageRenderers.renderApiPromptConfigPage();
        } else if (state.mode === 'prompt_editor') {
            pageRenderers.renderPromptEditorPage();
        } else {
            pageRenderers.renderHomePage();
        }

        // 设置 App 内部子视图会反复 innerHTML 重渲染，需要每次重绑滚动守卫。
        bindPhoneScrollGuards(container);
    };

    const rerenderHomeKeepScroll = createRerenderWithScroll('homeScrollTop', render);
    const rerenderDatabaseKeepScroll = createRerenderWithScroll('databaseScrollTop', render);
    const rerenderAppearanceKeepScroll = createRerenderWithScroll('appearanceScrollTop', render);
    const rerenderBeautifyKeepScrollGlobal = createRerenderWithScroll('beautifyScrollTop', render);
    const rerenderButtonStyleKeepScroll = createRerenderWithScroll('buttonStyleScrollTop', render);
    const rerenderApiPromptConfigKeepScroll = createRerenderWithScroll('apiPromptConfigScrollTop', render);

    /** @type {import('../types').SettingsPageRendererGroupedDeps} */
    const pageRendererDeps = {
        common: {
            container,
            state,
            render,
        },
        navigation: {
            navigateBack,
        },
        scroll: {
            captureScroll,
            restoreScroll,
            rerenderHomeKeepScroll,
            rerenderDatabaseKeepScroll,
            rerenderButtonStyleKeepScroll,
            rerenderApiPromptConfigKeepScroll,
        },
        feedback: {
            showToast,
        },
        home: {
            getDbConfigApiAvailability,
            getDbPresets,
            getActiveDbPresetName,
            getApiPresets,
            getTableApiPreset,
            setTableApiPreset,
            getCurrentPhoneAiInstructionPresetName,
            switchPresetByName,
            setupManualUpdateBtn,
        },
        appearance: {
            getLayoutValue,
            getPhoneSettings,
            setupBgUpload,
            setupIconLayoutSettings,
            setupAppearanceToggles,
            renderHiddenTableAppsList,
            renderIconUploadList,
        },
        dataConfig: {
            getTableData,
            getSheetKeys,
            getDbConfigApiAvailability,
            readDbSnapshot,
            getDbPresets,
            getActiveDbPresetName,
            switchPresetByName,
            clearActivePresetBindingIfNeeded,
            normalizeDbManualSelection,
            normalizeDbUpdateConfig,
            createDbPreset,
            saveDbPresets,
            setActiveDbPresetName,
            writeDbUpdateConfigViaApi,
            writeManualTableSelectionViaApi,
            clearManualTableSelectionViaApi,
        },
        buttonStyle: {
            getPhoneSettings,
            savePhoneSetting,
            savePhoneSettingsPatch,
        },
        apiPrompt: {
            getDbConfigApiAvailability,
            getApiPresets,
            getTableApiPreset,
            setTableApiPreset,
            getPlotApiPreset,
            setPlotApiPreset,
            getPhoneAiInstructionPresets,
            getPhoneAiInstructionPreset,
            getCurrentPhoneAiInstructionPresetName,
            setCurrentPhoneAiInstructionPresetName,
            deletePhoneAiInstructionPreset,
            importPhoneAiInstructionPresetsFromData,
            exportPhoneAiInstructionPresetPack,
            exportAllPhoneAiInstructionPresetsPack,
        },
        promptEditor: {
            getPhoneAiInstructionPreset,
            savePhoneAiInstructionPreset,
        },
    };

    /** @type {import('../types').SettingsPageRenderers} */
    const pageRenderers = createSettingsPageRenderers(pageRendererDeps);

    render();
}

// ===== 工具函数 =====

