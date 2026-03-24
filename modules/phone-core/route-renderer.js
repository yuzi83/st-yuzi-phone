import { clearRouteHistory } from './routing.js';
import { bindPhoneScrollGuards, hardenPhoneInteractionDefaults, logRouteScrollDebugSnapshot } from './scroll-guards.js';
import { phoneRuntime } from './state.js';

export async function renderPhoneRoute(route, opts = {}) {
    const screen = document.querySelector('.phone-screen');
    if (!screen) return;

    const isBack = opts.isBack || false;
    const oldContent = screen.firstElementChild;
    const EXIT_ANIM_MS = 220;
    const exitClass = isBack ? 'phone-page-exit-back' : 'phone-page-exit';

    const page = document.createElement('div');
    page.className = `phone-page ${isBack ? 'phone-page-enter-back' : 'phone-page-enter'}`;

    if (route === 'home') {
        clearRouteHistory();
        const { renderHomeScreen } = await import('../phone-home.js');
        renderHomeScreen(page);
    } else if (route.startsWith('app:')) {
        const sheetKey = route.replace('app:', '');
        const { renderTableViewer } = await import('../phone-table-viewer.js');
        renderTableViewer(page, sheetKey);
    } else if (route === 'settings') {
        const { renderSettings } = await import('../phone-settings.js');
        renderSettings(page);
    } else if (route === 'fusion') {
        const { renderFusion } = await import('../phone-fusion.js');
        renderFusion(page);
    }

    phoneRuntime.setTimeout(() => {
        if (!screen.isConnected) return;

        screen.appendChild(page);
        bindPhoneScrollGuards(page);
        hardenPhoneInteractionDefaults(page);

        if (oldContent instanceof HTMLElement) {
            oldContent.classList.add(exitClass);
            oldContent.setAttribute('inert', '');
            oldContent.style.pointerEvents = 'none';
            phoneRuntime.setTimeout(() => {
                if (!oldContent.isConnected) return;
                oldContent.setAttribute('aria-hidden', 'true');
                oldContent.remove();
            }, EXIT_ANIM_MS);
        }

        phoneRuntime.requestAnimationFrame(() => {
            logRouteScrollDebugSnapshot(route, page);
            page.classList.remove('phone-page-enter', 'phone-page-enter-back');
            page.classList.add('phone-page-active');
        });
    }, oldContent ? 16 : 0);
}
