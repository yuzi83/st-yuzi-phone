import { bindPhoneScrollGuards } from '../phone-core/scroll-guards.js';
import { resolveViewerRuntime } from './runtime.js';

function resolveToastTimerApi(container) {
    const runtime = resolveViewerRuntime(container);
    if (runtime && typeof runtime.setTimeout === 'function') {
        return {
            setTimeout: runtime.setTimeout.bind(runtime),
        };
    }

    return {
        setTimeout: window.setTimeout.bind(window),
    };
}

export function showInlineToast(container, msg, isError = false) {
    const root = container.querySelector('.phone-app-page') || container;
    const existed = root.querySelector('.phone-inline-toast');
    if (existed) existed.remove();

    const el = document.createElement('div');
    el.className = `phone-inline-toast ${isError ? 'is-error' : 'is-success'}`.trim();
    el.textContent = String(msg || '');
    root.appendChild(el);

    const timerApi = resolveToastTimerApi(root instanceof HTMLElement ? root : container);
    timerApi.setTimeout(() => el.classList.add('show'), 10);
    timerApi.setTimeout(() => {
        el.classList.remove('show');
        timerApi.setTimeout(() => el.remove(), 220);
    }, 1600);
}

export function getPhoneBody(container) {
    return container.querySelector('.phone-app-body');
}

export function bindWheelBridge(container) {
    bindPhoneScrollGuards(container);
}
