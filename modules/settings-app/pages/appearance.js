import { buildAppearancePageHtml } from '../layout/frame.js';
import { downloadTextFile } from '../services/media-upload.js';

function createRuntimeBinder(runtime) {
    return runtime?.addEventListener
        ? runtime.addEventListener.bind(runtime)
        : (target, type, listener, options) => {
            if (!target || typeof target.addEventListener !== 'function') return () => {};
            target.addEventListener(type, listener, options);
            return () => target.removeEventListener(type, listener, options);
        };
}

function bindAppearanceFontLibraryActions(ctx, runtime) {
    const { container, render, appearancePageService } = ctx;
    const selectEl = container.querySelector('#phone-font-select');
    const importBtn = container.querySelector('#phone-import-font-btn');
    const deleteBtn = container.querySelector('#phone-delete-font-btn');
    const fileInput = container.querySelector('#phone-font-file');
    const showToast = typeof ctx.showToast === 'function'
        ? ctx.showToast
        : () => {};
    const rerenderKeepScroll = typeof ctx.rerenderAppearanceKeepScroll === 'function'
        ? ctx.rerenderAppearanceKeepScroll
        : render;
    const isDisposed = () => !!(runtime && typeof runtime.isDisposed === 'function' && runtime.isDisposed());
    const bindEvent = createRuntimeBinder(runtime);
    const cleanupFns = [];

    if (selectEl) {
        cleanupFns.push(bindEvent(selectEl, 'change', () => {
            const result = appearancePageService.selectAppearanceFont(selectEl.value);
            appearancePageService.applyAppearanceFontLibrary();
            showToast(container, result.message || (result.success ? '字体已应用' : '字体应用失败'), !result.success);
            rerenderKeepScroll();
        }));
    }

    if (importBtn && fileInput) {
        cleanupFns.push(bindEvent(importBtn, 'click', () => {
            fileInput.value = '';
            fileInput.click();
        }));

        cleanupFns.push(bindEvent(fileInput, 'change', async () => {
            const file = fileInput.files?.[0] || null;
            if (!file) return;
            const result = await appearancePageService.importAppearanceFontFile(file);
            if (isDisposed()) return;
            appearancePageService.applyAppearanceFontLibrary();
            showToast(container, result.message || (result.success ? '字体已导入' : '字体导入失败'), !result.success);
            if (result.success) {
                rerenderKeepScroll();
            }
        }));
    }

    if (deleteBtn) {
        cleanupFns.push(bindEvent(deleteBtn, 'click', () => {
            const fontId = selectEl?.value || '';
            const result = appearancePageService.deleteAppearanceFont(fontId);
            appearancePageService.applyAppearanceFontLibrary();
            showToast(container, result.message || (result.success ? '字体已删除' : '字体删除失败'), !result.success);
            if (result.success) {
                rerenderKeepScroll();
            }
        }));
    }

    return () => {
        cleanupFns.forEach((cleanup) => {
            if (typeof cleanup === 'function') cleanup();
        });
    };
}

function bindAppearanceResourcePackActions(ctx, runtime) {
    const { container, render, appearancePageService } = ctx;
    const importBtn = container.querySelector('#phone-import-appearance-pack');
    const exportBtn = container.querySelector('#phone-export-appearance-pack');
    const fileInput = container.querySelector('#phone-appearance-pack-file');
    const showToast = typeof ctx.showToast === 'function'
        ? ctx.showToast
        : () => {};
    const rerenderKeepScroll = typeof ctx.rerenderAppearanceKeepScroll === 'function'
        ? ctx.rerenderAppearanceKeepScroll
        : render;
    const isDisposed = () => !!(runtime && typeof runtime.isDisposed === 'function' && runtime.isDisposed());
    const bindEvent = createRuntimeBinder(runtime);
    const cleanupFns = [];

    if (importBtn && fileInput) {
        cleanupFns.push(bindEvent(importBtn, 'click', () => {
            fileInput.value = '';
            fileInput.click();
        }));

        cleanupFns.push(bindEvent(fileInput, 'change', () => {
            const file = fileInput.files?.[0] || null;
            if (!file) return;

            const reader = new FileReader();
            reader.onload = () => {
                if (isDisposed()) return;
                const content = typeof reader.result === 'string' ? reader.result : '';
                if (!content.trim()) {
                    showToast(container, '导入失败：文件为空', true);
                    return;
                }

                const result = appearancePageService.importAppearanceResourcePackFromData(content);
                showToast(container, result.message || (result.success ? '导入完成' : '导入失败'), !result.success);
                if (result.success) {
                    rerenderKeepScroll();
                }
            };
            reader.onerror = () => {
                if (isDisposed()) return;
                showToast(container, '导入失败：无法读取文件', true);
            };
            reader.readAsText(file, 'utf-8');
        }));
    }

    if (exportBtn) {
        cleanupFns.push(bindEvent(exportBtn, 'click', () => {
            const result = appearancePageService.exportAppearanceResourcePack({
                packName: '玉子手机外观资源包',
            });
            if (!result?.success || !result.pack) {
                showToast(container, '导出失败：外观资源包生成失败', true);
                return;
            }
            downloadTextFile('玉子手机外观资源包.json', JSON.stringify(result.pack, null, 2), 'application/json');
            showToast(container, '已导出当前外观资源包');
        }));
    }

    return () => {
        cleanupFns.forEach((cleanup) => {
            if (typeof cleanup === 'function') cleanup();
        });
    };
}

export function createAppearancePage(ctx) {
    return {
        mount() {
            renderAppearancePage(ctx);
        },
        update() {
            renderAppearancePage(ctx);
        },
        dispose() {},
    };
}

export function renderAppearancePage(ctx) {
    const {
        container,
        state,
        render,
        registerCleanup,
        pageRuntime,
        appearancePageService,
    } = ctx;
    const getLayoutValue = appearancePageService.getLayoutValue;
    const getPhoneSettings = appearancePageService.getPhoneSettings;
    const setupBgUpload = appearancePageService.setupBgUpload;
    const setupIconLayoutSettings = appearancePageService.setupIconLayoutSettings;
    const setupAppearanceToggles = appearancePageService.setupAppearanceToggles;
    const renderHiddenTableAppsList = appearancePageService.renderHiddenTableAppsList;
    const renderIconUploadList = appearancePageService.renderIconUploadList;
    const getAppearanceFontLibraryViewModel = appearancePageService.getAppearanceFontLibraryViewModel;
    const applyAppearanceFontLibrary = appearancePageService.applyAppearanceFontLibrary;
    const getReadableTextScalePercentValue = appearancePageService.getReadableTextScalePercentValue;
    const applyReadableTextScale = appearancePageService.applyReadableTextScale;
    const setupReadableTextScaleSettings = appearancePageService.setupReadableTextScaleSettings;
    const getHomeAppLabelColorModeValue = appearancePageService.getHomeAppLabelColorModeValue;
    const setupHomeAppLabelColorSettings = appearancePageService.setupHomeAppLabelColorSettings;

    const layoutValues = {
        appGridColumns: getLayoutValue('appGridColumns', 4),
        appIconSize: getLayoutValue('appIconSize', 60),
        appIconRadius: getLayoutValue('appIconRadius', 14),
        appGridGap: getLayoutValue('appGridGap', 12),
        dockIconSize: getLayoutValue('dockIconSize', 48),
    };

    container.innerHTML = buildAppearancePageHtml({
        layoutValues,
        hideTableCountBadge: !!getPhoneSettings().hideTableCountBadge,
        homeAppLabelColorMode: getHomeAppLabelColorModeValue(),
        fontLibrary: getAppearanceFontLibraryViewModel(),
        readableTextScalePercent: getReadableTextScalePercentValue(),
    });
    applyAppearanceFontLibrary();
    applyReadableTextScale();

    const runtime = pageRuntime && typeof pageRuntime === 'object' ? pageRuntime : null;
    const bindEvent = (target, type, listener, options) => {
        if (!runtime?.addEventListener) {
            return () => {};
        }
        return runtime.addEventListener(target, type, listener, options);
    };

    bindEvent(container.querySelector('.phone-nav-back'), 'click', () => {
        state.mode = 'home';
        render();
    });

    if (runtime?.registerCleanup) {
        runtime.registerCleanup(setupBgUpload(container, { runtime }));
        runtime.registerCleanup(setupIconLayoutSettings(container));
        runtime.registerCleanup(setupAppearanceToggles(container));
        runtime.registerCleanup(renderHiddenTableAppsList(container.querySelector('#phone-hidden-table-apps')));
        runtime.registerCleanup(renderIconUploadList(container.querySelector('#phone-icon-upload-list'), { runtime }));
        runtime.registerCleanup(bindAppearanceResourcePackActions(ctx, runtime));
        runtime.registerCleanup(bindAppearanceFontLibraryActions(ctx, runtime));
        runtime.registerCleanup(setupReadableTextScaleSettings(container));
        runtime.registerCleanup(setupHomeAppLabelColorSettings(container));
    } else if (typeof registerCleanup === 'function') {
        registerCleanup(setupBgUpload(container));
        registerCleanup(setupIconLayoutSettings(container));
        registerCleanup(setupAppearanceToggles(container));
        registerCleanup(renderHiddenTableAppsList(container.querySelector('#phone-hidden-table-apps')));
        registerCleanup(renderIconUploadList(container.querySelector('#phone-icon-upload-list')));
        registerCleanup(bindAppearanceResourcePackActions(ctx, null));
        registerCleanup(bindAppearanceFontLibraryActions(ctx, null));
        registerCleanup(setupReadableTextScaleSettings(container));
        registerCleanup(setupHomeAppLabelColorSettings(container));
    }
}
