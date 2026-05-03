import {
    PHONE_TEMPLATE_TYPE_SPECIAL,
    PHONE_TEMPLATE_TYPE_GENERIC,
    PHONE_BEAUTIFY_TEMPLATE_EXPORT_MODE_ANNOTATED,
} from '../../phone-beautify-templates/shared.js';
import {
    getPhoneBeautifyTemplatesByType,
    deletePhoneBeautifyUserTemplate,
    getActiveBeautifyTemplateIdsForSpecial,
    getActiveBeautifyTemplateIdByType,
    setActiveBeautifyTemplateIdByType,
} from '../../phone-beautify-templates/repository.js';
import {
    importPhoneBeautifyPackFromData,
    exportPhoneBeautifyPack,
} from '../../phone-beautify-templates/import-export.js';
import { downloadTextFile } from '../services/media-upload.js';
import { buildBeautifyTemplatePageHtml as buildBeautifyTemplatePageHtmlFromFrame } from '../layout/frame.js';
import { showConfirmDialog } from '../ui/confirm-dialog.js';
import { showToast } from '../ui/toast.js';
import { createBeautifyPageBehavior } from './beautify-behavior.js';
import { buildBeautifyPageViewModel } from './beautify/view-model.js';
import { buildTemplateListHtml } from './beautify/template-builders.js';
import {
    createPageShellSnapshot,
    ensurePageShell,
    normalizePageShellRefreshPlan,
    patchPageShell,
} from '../ui/page-shell.js';

const BEAUTIFY_PAGE_ROOT_SELECTOR = '.phone-settings-page';
const BEAUTIFY_SHELL_REGION_SELECTORS = Object.freeze({
    hero: '[data-shell-region="beautify-hero"]',
    summary: '[data-shell-region="beautify-summary"]',
    special: '[data-shell-region="beautify-special-library"]',
    generic: '[data-shell-region="beautify-generic-library"]',
});

function buildBeautifyFramePayload(viewModel) {
    const specialListHtml = buildTemplateListHtml(viewModel.specialTemplates, {
        emptyText: '暂无专属小剧场模板',
        type: PHONE_TEMPLATE_TYPE_SPECIAL,
        activeSpecialRendererMap: viewModel.activeSpecialMap,
        activeGenericId: viewModel.activeGenericTemplateId,
    });
    const genericListHtml = buildTemplateListHtml(viewModel.genericTemplates, {
        emptyText: '暂无通用表格模板',
        type: PHONE_TEMPLATE_TYPE_GENERIC,
        activeSpecialRendererMap: viewModel.activeSpecialMap,
        activeGenericId: viewModel.activeGenericTemplateId,
    });

    return {
        activeSpecialSummary: viewModel.activeSpecialSummary,
        activeGenericSummary: viewModel.activeGenericSummary,
        specialListHtml,
        genericListHtml,
        allTemplatesCount: viewModel.allTemplatesCount,
        allSpecialTemplatesCount: viewModel.allSpecialTemplatesCount,
        allGenericTemplatesCount: viewModel.allGenericTemplatesCount,
    };
}

function createBeautifyShellSnapshot(viewModel) {
    const framePayload = buildBeautifyFramePayload(viewModel);
    return createPageShellSnapshot({
        buildHtml: buildBeautifyTemplatePageHtmlFromFrame,
        payload: framePayload,
        rootSelector: BEAUTIFY_PAGE_ROOT_SELECTOR,
    });
}

function normalizeBeautifyRefreshPlan(refreshPlan) {
    return normalizePageShellRefreshPlan(refreshPlan, {
        hero: true,
        summary: true,
        special: true,
        generic: true,
    });
}

export function createBeautifyTemplatePage(ctx) {
    return {
        mount() {
            renderBeautifyTemplatePage(ctx);
        },
        update() {
            renderBeautifyTemplatePage(ctx);
        },
        dispose() {},
    };
}

export function renderBeautifyTemplatePage(ctx, options = {}) {
    const { container, registerCleanup, pageRuntime, state } = ctx;

    const allSpecialTemplates = getPhoneBeautifyTemplatesByType(PHONE_TEMPLATE_TYPE_SPECIAL, {
        includeBuiltin: true,
        includeUser: true,
        enabledOnly: true,
    });
    const allGenericTemplates = getPhoneBeautifyTemplatesByType(PHONE_TEMPLATE_TYPE_GENERIC, {
        includeBuiltin: true,
        includeUser: true,
        enabledOnly: true,
    });

    const activeSpecialMap = getActiveBeautifyTemplateIdsForSpecial({
        withFallback: true,
        persist: false,
    });
    const activeGenericTemplateId = getActiveBeautifyTemplateIdByType(PHONE_TEMPLATE_TYPE_GENERIC, {
        withFallback: true,
        persist: false,
    });

    const viewModel = buildBeautifyPageViewModel({
        allSpecialTemplates,
        allGenericTemplates,
        activeSpecialMap,
        activeGenericTemplateId,
    });

    const shellSnapshot = createBeautifyShellSnapshot(viewModel);
    const shellState = ensurePageShell(container, shellSnapshot, {
        rootSelector: BEAUTIFY_PAGE_ROOT_SELECTOR,
        regionSelectors: BEAUTIFY_SHELL_REGION_SELECTORS,
    });
    if (!shellState.didBootstrap && shellState.pageRoot instanceof HTMLElement) {
        patchPageShell(shellState.pageRoot, shellSnapshot, {
            regionSelectors: BEAUTIFY_SHELL_REGION_SELECTORS,
            refreshPlan: normalizeBeautifyRefreshPlan(options?.refreshPlan),
        });
    }

    const runtime = pageRuntime && typeof pageRuntime === 'object'
        ? pageRuntime
        : {
            registerCleanup: typeof registerCleanup === 'function' ? registerCleanup : () => {},
            requestAnimationFrame(callback) {
                if (typeof callback === 'function') {
                    return requestAnimationFrame(callback);
                }
                return null;
            },
            addEventListener(target, type, listener, options) {
                if (!target || typeof target.addEventListener !== 'function' || typeof listener !== 'function') {
                    return () => {};
                }
                target.addEventListener(type, listener, options);
                return () => target.removeEventListener(type, listener, options);
            },
        };
    const pendingSpecialListScrollTop = Number(state?.beautifyPendingSpecialListScrollTop);
    const pendingGenericListScrollTop = Number(state?.beautifyPendingGenericListScrollTop);
    const hasPendingSpecialListScroll = Number.isFinite(pendingSpecialListScrollTop) && pendingSpecialListScrollTop >= 0;
    const hasPendingGenericListScroll = Number.isFinite(pendingGenericListScrollTop) && pendingGenericListScrollTop >= 0;

    const beautifyBehavior = createBeautifyPageBehavior({
        container,
        ctx,
        getTemplateById: viewModel.getTemplateById,
        renderPage: renderBeautifyTemplatePage,
        runtime,
    }, {
        setActiveBeautifyTemplateIdByType,
        importPhoneBeautifyPackFromData,
        exportPhoneBeautifyPack,
        deletePhoneBeautifyUserTemplate,
        downloadTextFile,
        showConfirmDialog,
        showToast,
        requestAnimationFrameImpl: requestAnimationFrame,
        createFileReader: () => new FileReader(),
        annotatedExportMode: PHONE_BEAUTIFY_TEMPLATE_EXPORT_MODE_ANNOTATED,
    });

    const cleanupInteractions = beautifyBehavior.attachPageInteractions();
    runtime.registerCleanup?.(cleanupInteractions);

    if (hasPendingSpecialListScroll || hasPendingGenericListScroll) {
        runtime.requestAnimationFrame?.(() => {
            runtime.requestAnimationFrame?.(() => {
                const nextSpecialList = container?.querySelector?.('#phone-beautify-list-special') || null;
                const nextGenericList = container?.querySelector?.('#phone-beautify-list-generic') || null;

                if (hasPendingSpecialListScroll && nextSpecialList) {
                    nextSpecialList.scrollTop = pendingSpecialListScrollTop;
                }

                if (hasPendingGenericListScroll && nextGenericList) {
                    nextGenericList.scrollTop = pendingGenericListScrollTop;
                }

                if (state && typeof state === 'object') {
                    delete state.beautifyPendingSpecialListScrollTop;
                    delete state.beautifyPendingGenericListScrollTop;
                }
            });
        });
    }
}
