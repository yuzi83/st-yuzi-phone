import { bindPhoneScrollGuards } from '../phone-core.js';

export function showInlineToast(container, msg, isError = false) {
    const root = container.querySelector('.phone-app-page') || container;
    const existed = root.querySelector('.phone-inline-toast');
    if (existed) existed.remove();

    const el = document.createElement('div');
    el.className = `phone-inline-toast ${isError ? 'is-error' : 'is-success'}`.trim();
    el.textContent = String(msg || '');
    root.appendChild(el);

    setTimeout(() => el.classList.add('show'), 10);
    setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 220);
    }, 1600);
}

export function getPhoneBody(container) {
    return container.querySelector('.phone-app-body');
}

export function bindWheelBridge(container) {
    bindPhoneScrollGuards(container);
}
