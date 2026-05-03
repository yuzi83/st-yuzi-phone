import { buildShellRegionHtml } from '../view-regions.js';
import { escapeHtml, escapeHtmlAttr } from '../utils/dom-escape.js';

export function buildHomeShellStyleText({ bgStyle, appIconSize, appIconRadius, appGridColumns, appGridGap, dockIconSize }) {
    const styleChunks = [];

    if (bgStyle) {
        styleChunks.push(bgStyle);
    }

    styleChunks.push(`--phone-app-icon-size:${appIconSize}px`);
    styleChunks.push(`--phone-app-icon-radius:${appIconRadius}px`);
    styleChunks.push(`--phone-app-grid-columns:${appGridColumns}`);
    styleChunks.push(`--phone-app-grid-gap:${appGridGap}px`);
    styleChunks.push(`--phone-dock-icon-size:${dockIconSize}px`);

    return styleChunks.join('; ');
}

export function buildHomeShellHtml(styleText) {
    return `
        <div class="phone-home" data-home-shell="root" style="${escapeHtmlAttr(String(styleText || ''))}">
            <div class="phone-home-overlay"></div>
            ${buildShellRegionHtml({
                region: 'home-grid',
                className: 'phone-app-grid',
            })}
            ${buildShellRegionHtml({
                region: 'home-dock',
                className: 'phone-dock',
                attrs: 'data-dock-count="4"',
            })}
        </div>
    `;
}

export function buildHomeAppItemHtml(iconHtml, name) {
    return `
        <div class="phone-app-icon">${iconHtml}</div>
        <span class="phone-app-label">${escapeHtml(String(name || ''))}</span>
    `;
}

export function buildDockItemHtml(iconHtml, name) {
    return `
        <div class="phone-app-icon phone-dock-icon">${iconHtml}</div>
        <span class="phone-app-label">${escapeHtml(String(name || ''))}</span>
    `;
}
