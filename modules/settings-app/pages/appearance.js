import { buildAppearancePageHtml } from '../layout/frame.js';

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
    });

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
    } else if (typeof registerCleanup === 'function') {
        registerCleanup(setupBgUpload(container));
        registerCleanup(setupIconLayoutSettings(container));
        registerCleanup(setupAppearanceToggles(container));
        registerCleanup(renderHiddenTableAppsList(container.querySelector('#phone-hidden-table-apps')));
        registerCleanup(renderIconUploadList(container.querySelector('#phone-icon-upload-list')));
    }
}
