import { escapeHtml, escapeHtmlAttr } from '../utils/dom-escape.js';

function resolveExtensionAssetUrl(assetPath) {
    const moduleUrl = String(import.meta.url || '');
    const extensionRoot = moduleUrl.includes('/dist/')
        ? new URL('../', moduleUrl)
        : new URL('../../', moduleUrl);
    return new URL(assetPath, extensionRoot).href;
}

const PHONE_STATUS_SIGNAL_ICON = resolveExtensionAssetUrl('assets/phone-status-signal.svg');
const PHONE_STATUS_WIFI_ICON = resolveExtensionAssetUrl('assets/phone-status-wifi.svg');
const PHONE_STATUS_BATTERY_ICON = resolveExtensionAssetUrl('assets/phone-status-battery.svg');

export const PHONE_NAV_ICON_PATHS = Object.freeze({
    back: 'M16 19L8 12L16 5',
    forward: 'M8 19L16 12L8 5',
});

function buildPhoneNavIcon(pathData) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${pathData}"/></svg>`;
}

export const PHONE_ICONS = {
    signal: `<img class="phone-status-icon" src="${PHONE_STATUS_SIGNAL_ICON}" alt="" aria-hidden="true">`,
    wifi: `<img class="phone-status-icon" src="${PHONE_STATUS_WIFI_ICON}" alt="" aria-hidden="true">`,
    battery: `<img class="phone-status-icon" src="${PHONE_STATUS_BATTERY_ICON}" alt="" aria-hidden="true">`,
    back: buildPhoneNavIcon(PHONE_NAV_ICON_PATHS.back),
    forward: buildPhoneNavIcon(PHONE_NAV_ICON_PATHS.forward),
    gear: `<svg viewBox="0 0 48 48" fill="none"><rect x="4" y="4" width="40" height="40" rx="10" fill="#636366"/><circle cx="24" cy="24" r="8" stroke="white" stroke-width="2.5"/><circle cx="24" cy="24" r="3" fill="white"/><path d="M24 12v4M24 32v4M12 24h4M32 24h4M16.5 16.5l2.8 2.8M28.7 28.7l2.8 2.8M31.5 16.5l-2.8 2.8M19.3 28.7l-2.8 2.8" stroke="white" stroke-width="2.2" stroke-linecap="round"/></svg>`,
    refresh: `<svg viewBox="0 0 48 48" fill="none"><defs><linearGradient id="grefresh" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#4DB6AC"/><stop offset="100%" stop-color="#00695C"/></linearGradient></defs><rect x="4" y="4" width="40" height="40" rx="10" fill="url(#grefresh)"/><path d="M16 17a10 10 0 0117 2" stroke="white" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M33 14v6h-6" stroke="white" stroke-width="2.5" stroke-linecap="round" fill="none"/><path d="M32 31a10 10 0 01-17-2" stroke="white" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M15 34v-6h6" stroke="white" stroke-width="2.5" stroke-linecap="round" fill="none"/></svg>`,
    puzzle: `<svg viewBox="0 0 48 48" fill="none"><rect x="4" y="4" width="40" height="40" rx="10" fill="#FF9F0A"/><path d="M14 20h6v-2a3 3 0 016 0v2h6v6h-2a3 3 0 000 6h2v6H14V20z" fill="white"/></svg>`,
    upload: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 16V4M12 4l-4 4M12 4l4 4"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>`,
    phone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="3"/><line x1="10" y1="18" x2="14" y2="18"/></svg>`,
};

const ICON_COLORS = [
    ['#FF5E3A', '#FF2A68'],
    ['#FF9500', '#FF5E3A'],
    ['#4CD964', '#5AC8FA'],
    ['#1AD6FD', '#1D62F0'],
    ['#54C7FC', '#007AFF'],
    ['#FF0054', '#D02090'],
    ['#E42A58', '#E65636'],
];

function getHashColorPair(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % ICON_COLORS.length;
    return ICON_COLORS[index];
}

export function getIconForSheet(sheetName) {
    const name = (sheetName || '表').trim();
    const firstChar = name.charAt(0).toUpperCase();
    const colors = getHashColorPair(name);

    return `
        <div style="width: 100%; height: 100%; background: linear-gradient(135deg, ${colors[0]}, ${colors[1]});
        display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: 600; color: #ffffff; border-radius: var(--yuzi-phone-home-app-icon-radius); box-sizing: border-box;">
            ${escapeHtml(firstChar)}
        </div>
    `;
}

export function getTextIcon(letter, colorA, colorB) {
    const text = String(letter || '').trim().charAt(0) || 'A';
    return `
        <div class="phone-dock-text-icon" style="--yuzi-phone-dock-text-icon-start:${escapeHtmlAttr(colorA)};--yuzi-phone-dock-text-icon-end:${escapeHtmlAttr(colorB)};">
            <span class="phone-dock-text-icon-glyph-wrap">
                <span class="phone-dock-text-icon-glyph">${escapeHtml(text)}</span>
            </span>
        </div>
    `;
}
