import { PHONE_ICONS } from '../phone-home/icons.js';

export function buildPhoneShellHtml() {
    return `
        <div class="phone-shell">
            <div class="phone-notch"></div>
            <div class="phone-status-bar">
                <span class="phone-status-time"></span>
                <span class="phone-status-icons">
                    <span class="phone-signal">${PHONE_ICONS.signal}</span>
                    <span class="phone-wifi">${PHONE_ICONS.wifi || ''}</span>
                    <span class="phone-battery">${PHONE_ICONS.battery}</span>
                </span>
            </div>
            <div class="phone-screen"></div>
            <div class="phone-notification-overlay" id="phone-notif-container"></div>
            <div class="phone-home-indicator"></div>
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
    const el = scope.querySelector('.phone-status-time') || document.querySelector('.phone-status-time');
    if (el) el.textContent = `${hh}:${mm}`;
}
