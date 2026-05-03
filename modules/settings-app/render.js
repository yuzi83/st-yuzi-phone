// modules/settings-app/render.js
/**
 * 玉子的手机 - 设置 App 渲染入口
 *
 * 这是 [`route-renderer.js:48`](modules/phone-core/route-renderer.js:48) 在路由进入 'settings'
 * 时通过动态 import 的入口。它负责：
 *   1. 创建 state（state-machine.js）
 *   2. 消费 intent 并应用到 state（intent.js）
 *   3. 创建 page runtime 管理器（page-runtime.js）
 *   4. 装配 page renderers 依赖项（依赖 settings-app/services + settings-app/page-renderers）
 *   5. 提供 render() 主循环，负责切换 mode 时 dispose 旧 page session、创建新 runtime、调用 page lifecycle
 *
 * 历史渊源：
 *   - 这段逻辑原本住在 modules/phone-settings.js 里（约 422 行单体）
 *   - 阶段二 step_9 拆分为四个文件后，phone-settings.js 已删除
 *   - 调用约定不变：唯一外部 API 仍是 export function renderSettings(container)
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
    // API 预设选择桥接
    getApiPresets,
    getTableApiPreset,
    setTableApiPreset,
    getPlotApiPreset,
    setPlotApiPreset,
} from '../phone-core/data-api.js';
import {
    deletePhoneAiInstructionPreset,
    exportAllPhoneAiInstructionPresetsPack,
    exportPhoneAiInstructionPresetPack,
    getCurrentPhoneAiInstructionPresetName,
    getPhoneAiInstructionPreset,
    getPhoneAiInstructionPresets,
    importPhoneAiInstructionPresetsFromData,
    savePhoneAiInstructionPreset,
    setCurrentPhoneAiInstructionPresetName,
} from '../phone-core/chat-support.js';
import { navigateBack } from '../phone-core/routing.js';
import { bindPhoneScrollGuards } from '../phone-core/scroll-guards.js';
import { getPhoneSettings, savePhoneSetting } from '../settings.js';
import { createScrollPreserver } from './ui/settings-scroll-binding.js';
import { showToast } from './ui/toast.js';
import {
    createDbPreset,
    getActiveDbPresetNameFromSettings,
    getDbPresetsFromPhoneSettings,
    normalizeDbManualSelection,
    normalizeDbUpdateConfig,
    saveDbPresetsToPhoneSettings,
    setActiveDbPresetNameToSettings,
} from './services/db-presets.js';
import { createDbConfigRuntime } from './services/db-config-runtime.js';
import { setupManualUpdateBtn } from './services/manual-update.js';
import {
    setupBgUpload,
    renderIconUploadList,
    setupAppearanceToggles,
    renderHiddenTableAppsList,
    setupIconLayoutSettings,
    getLayoutValue,
} from './services/appearance-settings.js';
import { createSettingsPageRenderers } from './page-renderers.js';
import { consumePendingSettingsIntent, projectIntentToStatePatch } from './intent.js';
import { createSettingsAppState, applyStatePatch } from './state-machine.js';
import { createPageRuntimeManager } from './page-runtime.js';

/**
 * 渲染设置 App。
 * @param {HTMLElement} container
 */
export function renderSettings(container) {
    /** @type {import('../../types').SettingsAppState} */
    const state = createSettingsAppState();

    const intent = consumePendingSettingsIntent();
    applyStatePatch(state, projectIntentToStatePatch(intent));

    const {
        pageRuntime,
        createCurrentPageRuntime,
        disposeCurrentPageRuntime,
        registerPageCleanup,
        bindPageEvent,
    } = createPageRuntimeManager();

    /** @type {{ mode: string, page: { update?: () => void, mount?: () => void, dispose?: () => void } | null } | null} */
    let currentPageSession = null;

    const disposeCurrentPageSession = () => {
        const currentPage = currentPageSession?.page;
        if (currentPage && typeof currentPage.dispose === 'function') {
            currentPage.dispose();
        }
        disposeCurrentPageRuntime();
        currentPageSession = null;
    };

    const { captureScroll, restoreScroll, createRerenderWithScroll } = createScrollPreserver(
        container,
        state,
        undefined,
        pageRuntime,
    );

    const getDbPresets = () => getDbPresetsFromPhoneSettings();
    /** @param {import('../../types').NamedSettingsEntry[]} presets */
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

    const renderLegacyPageByMode = (mode) => {
        if (mode === 'appearance') {
            pageRenderers.renderAppearancePage();
        } else if (mode === 'database') {
            pageRenderers.renderDatabasePage();
        } else if (mode === 'beautify') {
            pageRenderers.renderBeautifyTemplatePage();
        } else if (mode === 'button_style') {
            pageRenderers.renderButtonStylePage();
        } else if (mode === 'ai_instruction_presets') {
            pageRenderers.renderAiInstructionPresetsPage();
        } else if (mode === 'api_prompt_config') {
            pageRenderers.renderApiPromptConfigPage();
        } else if (mode === 'prompt_editor') {
            pageRenderers.renderPromptEditorPage();
        } else {
            pageRenderers.renderHomePage();
        }
    };

    const render = () => {
        const nextMode = String(state.mode || 'home');
        const pageDefinition = pageRenderers?.pages && typeof pageRenderers.pages === 'object'
            ? pageRenderers.pages[nextMode]
            : null;
        const currentPage = currentPageSession?.mode === nextMode
            ? currentPageSession.page
            : null;
        const canUpdateInPlace = !!currentPage && typeof currentPage.update === 'function';

        if (!canUpdateInPlace) {
            disposeCurrentPageSession();
            currentPageSession = {
                mode: nextMode,
                page: pageDefinition && typeof pageDefinition.createPage === 'function'
                    ? pageDefinition.createPage()
                    : null,
            };
        } else {
            disposeCurrentPageRuntime();
        }

        createCurrentPageRuntime(nextMode);

        const activePage = currentPageSession?.page;
        const lifecycleMethod = canUpdateInPlace ? 'update' : 'mount';
        if (activePage && typeof activePage[lifecycleMethod] === 'function') {
            activePage[lifecycleMethod]();
        } else {
            renderLegacyPageByMode(nextMode);
        }

        // 设置 App 内部子视图会反复 innerHTML 重渲染，需要每次重绑滚动守卫。
        bindPhoneScrollGuards(container);
    };

    const rerenderHomeKeepScroll = createRerenderWithScroll('homeScrollTop', render);
    const rerenderDatabaseKeepScroll = createRerenderWithScroll('databaseScrollTop', render);
    const rerenderBeautifyKeepScrollGlobal = createRerenderWithScroll('beautifyScrollTop', render);
    const rerenderApiPromptConfigKeepScroll = createRerenderWithScroll('apiPromptConfigScrollTop', render);

    /** @type {import('../../types').SettingsPageRendererGroupedDeps} */
    const pageRendererDeps = {
        common: {
            container,
            state,
            render,
            registerCleanup: registerPageCleanup,
            bindPageEvent,
            pageRuntime,
        },
        navigation: {
            navigateBack,
        },
        scroll: {
            captureScroll,
            restoreScroll,
            rerenderHomeKeepScroll,
            rerenderDatabaseKeepScroll,
            rerenderBeautifyKeepScroll: rerenderBeautifyKeepScrollGlobal,
            rerenderApiPromptConfigKeepScroll,
        },
        feedback: {
            showToast,
        },
        home: {
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

    /** @type {import('../../types').SettingsPageRenderers} */
    const pageRenderers = createSettingsPageRenderers(pageRendererDeps);

    render();
}
