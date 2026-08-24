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

import { getTableData, getTableDataAsync } from '../phone-core/data-api.js';
import { navigateBack } from '../phone-core/routing.js';
import { bindPhoneScrollGuards } from '../phone-core/scroll-guards.js';
import { getPhoneSettings, savePhoneSetting } from '../settings.js';
import { createContentPresetWorkshopService, createUnavailableContentPresetWorkshopService } from '../content-presets/workshop-service.js';
import { isContentPresetFullPageRuntimeEnabled } from '../content-presets/activation-gate.js';
import { createScrollPreserver } from './ui/settings-scroll-binding.js';
import { showToast } from './ui/toast.js';
import { qqV2PresetSettingsService } from './services/qq-v2-preset-facade.js';
import { sillyTavernWorldbookReadingCatalog } from '../worldbook-reading/st-catalog-adapter.js';
import {
    buildCharacterMappingModel,
    composeCharacterImagePrompt,
} from '../image-generation/character-mapping.js';
import { sharedImageGenerationService } from '../image-generation/runtime.js';
import { createImageGenerationSettingsService } from '../image-generation/settings-service.js';
import {
    setupBgUpload,
    renderIconUploadList,
    setupAppearanceToggles,
    renderHiddenTableAppsList,
    setupIconLayoutSettings,
    importAppearanceResourcePackFromData,
    listAppearancePacks,
    importAppearancePackToRepository,
    applyAppearancePackFromRepository,
    deleteAppearancePackFromRepository,
    getAppearancePackRepositoryStats,
    exportAppearanceResourcePack,
    clearAppearanceResourcePoolIcons,
    getAppearanceFontLibraryViewModel,
    importAppearanceFontFile,
    importAppearanceFontCssUrl,
    selectAppearanceFont,
    deleteAppearanceFont,
    applyAppearanceFontLibrary,
    getReadableTextScalePercentValue,
    applyReadableTextScale,
    setupReadableTextScaleSettings,
    getHomeAppLabelColorModeValue,
    setupHomeAppLabelColorSettings,
    getPhoneThemeModeValue,
    applyPhoneThemeMode,
    setupPhoneThemeModeSettings,
    getLayoutValue,
} from './services/appearance-settings.js';
import { createSettingsPageRenderers } from './page-renderers.js';
import { createSettingsAppState } from './state-machine.js';
import { createPageRuntimeManager } from './page-runtime.js';

function selectContentPresetWorkshop(enabled, createAvailable, createUnavailable) {
    return enabled ? createAvailable() : createUnavailable();
}

function normalizeSettingsMode(mode, contentPresetFullPageRuntimeEnabled) {
    return mode === 'beautify' && !contentPresetFullPageRuntimeEnabled ? 'home' : mode;
}

export const __test__settingsGate = Object.freeze({
    normalizeSettingsMode,
    selectContentPresetWorkshop,
});

const imageGenerationSettingsService = createImageGenerationSettingsService({
    tableReader: getTableDataAsync,
    characterMapping: {
        buildCharacterMappingModel,
        composeCharacterImagePrompt,
    },
    imageGenerationService: sharedImageGenerationService,
});

/**
 * 渲染设置 App。
 * @param {HTMLElement} container
 */
export function renderSettings(container) {
    /** @type {import('../../types').SettingsAppState} */
    const state = createSettingsAppState();
    let disposed = false;
    const contentPresetWorkshop = selectContentPresetWorkshop(
        isContentPresetFullPageRuntimeEnabled(),
        () => createContentPresetWorkshopService({ getTableData }),
        () => createUnavailableContentPresetWorkshopService(),
    );

    applyPhoneThemeMode();

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

    const renderLegacyPageByMode = (mode) => {
        if (mode === 'appearance') {
            pageRenderers.renderAppearancePage();
        } else if (mode === 'api_presets') {
            pageRenderers.renderApiPresetsPage();
        } else if (mode === 'beautify') {
            if (isContentPresetFullPageRuntimeEnabled()) pageRenderers.renderBeautifyTemplatePage();
            else pageRenderers.renderHomePage();
        } else if (mode === 'button_style') {
            pageRenderers.renderButtonStylePage();
        } else if (mode === 'ai_instruction_presets') {
            pageRenderers.renderAiInstructionPresetsPage();
        } else {
            pageRenderers.renderHomePage();
        }
    };

    const render = () => {
        if (disposed) return;
        state.mode = normalizeSettingsMode(state.mode, isContentPresetFullPageRuntimeEnabled());
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
    const rerenderAppearanceKeepScroll = createRerenderWithScroll('appearanceScrollTop', render);
    const rerenderApiPresetsKeepScroll = createRerenderWithScroll('apiPresetsScrollTop', render);
    const rerenderBeautifyKeepScrollGlobal = createRerenderWithScroll('beautifyScrollTop', render);
    const rerenderAiInstructionPresetsKeepScroll = createRerenderWithScroll('aiInstructionPresetsScrollTop', render);
    const rerenderWorldbookReadingKeepScroll = createRerenderWithScroll('worldbookReadingScrollTop', render);
    const rerenderImageGenerationKeepScroll = createRerenderWithScroll('imageGenerationScrollTop', render);

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
            rerenderAppearanceKeepScroll,
            rerenderApiPresetsKeepScroll,
            rerenderBeautifyKeepScroll: rerenderBeautifyKeepScrollGlobal,
            rerenderAiInstructionPresetsKeepScroll,
            rerenderImageGenerationKeepScroll,
            rerenderWorldbookReadingKeepScroll,
        },
        feedback: {
            showToast,
        },
        appearance: {
            getLayoutValue,
            getPhoneSettings,
            setupBgUpload,
            setupIconLayoutSettings,
            setupAppearanceToggles,
            renderHiddenTableAppsList,
            renderIconUploadList,
            importAppearanceResourcePackFromData,
            listAppearancePacks,
            importAppearancePackToRepository,
            applyAppearancePackFromRepository,
            deleteAppearancePackFromRepository,
            getAppearancePackRepositoryStats,
            exportAppearanceResourcePack,
            clearAppearanceResourcePoolIcons,
            getAppearanceFontLibraryViewModel,
            importAppearanceFontFile,
            importAppearanceFontCssUrl,
            selectAppearanceFont,
            deleteAppearanceFont,
            applyAppearanceFontLibrary,
            getReadableTextScalePercentValue,
            applyReadableTextScale,
            setupReadableTextScaleSettings,
            getHomeAppLabelColorModeValue,
            setupHomeAppLabelColorSettings,
            getPhoneThemeModeValue,
            applyPhoneThemeMode,
            setupPhoneThemeModeSettings,
        },
        qqV2Presets: qqV2PresetSettingsService,
        buttonStyle: {
            getPhoneSettings,
            savePhoneSetting,
        },
        contentPresetWorkshop: {
            ...contentPresetWorkshop,
        },
        worldbookReading: sillyTavernWorldbookReadingCatalog,
        imageGeneration: imageGenerationSettingsService,
    };

    /** @type {import('../../types').SettingsPageRenderers} */
    const pageRenderers = createSettingsPageRenderers(pageRendererDeps);

    render();
    return () => {
        if (disposed) return;
        disposed = true;
        disposeCurrentPageSession();
    };
}
