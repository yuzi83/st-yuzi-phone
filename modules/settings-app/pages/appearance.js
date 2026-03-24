import { buildAppearancePageHtml } from '../layout/frame.js';

export function renderAppearancePage(ctx) {
    const {
        container,
        state,
        render,
        getLayoutValue,
        getPhoneSettings,
        setupBgUpload,
        setupIconLayoutSettings,
        setupAppearanceToggles,
        renderHiddenTableAppsList,
        renderIconUploadList,
    } = ctx;

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

    container.querySelector('.phone-nav-back')?.addEventListener('click', () => {
        state.mode = 'home';
        render();
    });

    setupBgUpload(container);
    setupIconLayoutSettings(container);
    setupAppearanceToggles(container);
    renderHiddenTableAppsList(container.querySelector('#phone-hidden-table-apps'));
    renderIconUploadList(container.querySelector('#phone-icon-upload-list'));
}
