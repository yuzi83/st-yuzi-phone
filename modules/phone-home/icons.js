import { escapeHtml, escapeHtmlAttr } from '../utils/dom-escape.js';

export const PHONE_ICONS = {
    signal: `<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><rect x="1" y="16" width="4" height="6" rx="1" opacity="0.4"/><rect x="7" y="12" width="4" height="10" rx="1" opacity="0.6"/><rect x="13" y="7" width="4" height="15" rx="1" opacity="0.8"/><rect x="19" y="2" width="4" height="20" rx="1"/></svg>`,
    wifi: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" stroke-linecap="round"><path d="M5 12.55a11 11 0 0114.08 0M1.42 9a16 16 0 0121.16 0M8.53 16.11a6 6 0 016.95 0M12 20h.01"/></svg>`,
    battery: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="18" height="14"><rect x="2" y="6" width="18" height="12" rx="2"/><rect x="4" y="8" width="14" height="8" rx="1" fill="currentColor" opacity="0.8"/><path d="M20 10h2v4h-2" fill="currentColor"/></svg>`,
    back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 19l-7-7 7-7"/></svg>`,
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
        display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: 600; color: #ffffff; border-radius: var(--phone-app-icon-radius, 12px); box-sizing: border-box;">
            ${escapeHtml(firstChar)}
        </div>
    `;
}

export function getTextIcon(letter, colorA, colorB) {
    const text = String(letter || '').trim().charAt(0) || 'A';
    return `
        <div class="phone-dock-text-icon" style="--phone-dock-text-icon-start:${escapeHtmlAttr(colorA)};--phone-dock-text-icon-end:${escapeHtmlAttr(colorB)};">
            <span class="phone-dock-text-icon-glyph-wrap">
                <span class="phone-dock-text-icon-glyph">${escapeHtml(text)}</span>
            </span>
        </div>
    `;
}
