import { PHONE_ICONS } from '../phone-home/icons.js';

export function buildPhoneShellHtml() {
    return `
        <div class="yuzi-phone-shell">
            <div class="yuzi-phone-notch" aria-hidden="true"></div>
            <div class="yuzi-phone-status-bar">
                <span class="yuzi-phone-status-time"></span>
                <span class="yuzi-phone-status-icons">
                    <span class="yuzi-phone-signal">${PHONE_ICONS.signal}</span>
                    <span class="yuzi-phone-wifi">${PHONE_ICONS.wifi || ''}</span>
                    <span class="yuzi-phone-battery">${PHONE_ICONS.battery}</span>
                </span>
            </div>
            <div class="yuzi-phone-screen"></div>
            <div class="yuzi-phone-temporary-layer-host" data-yuzi-phone-temporary-layer-host></div>
            <button class="yuzi-phone-home-indicator" data-yuzi-phone-home-indicator type="button" aria-label="返回手机主页" hidden>
                <span aria-hidden="true"></span>
            </button>
        </div>
        <div class="yuzi-phone-resize yuzi-phone-resize-e" data-dir="e"></div>
        <div class="yuzi-phone-resize yuzi-phone-resize-se" data-dir="se"></div>
    `;
}

export function updatePhoneStatusBarTime(root = document) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const scope = root && typeof root.querySelector === 'function' ? root : document;
    const el = scope.querySelector('.yuzi-phone-status-time') || document.querySelector('.yuzi-phone-status-time');
    if (el) el.textContent = `${hh}:${mm}`;
}
