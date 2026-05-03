import { escapeHtmlAttr } from './utils/dom-escape.js';

export function buildShellRegionHtml({ region = '', contentHtml = '', className = '', attrs = '' }) {
    const resolvedRegion = String(region || '').trim();
    const resolvedClassName = String(className || '').trim();
    const resolvedAttrs = String(attrs || '').trim();
    const regionAttr = resolvedRegion ? ` data-shell-region="${escapeHtmlAttr(resolvedRegion)}"` : '';
    const classAttr = resolvedClassName ? ` class="${escapeHtmlAttr(resolvedClassName)}"` : '';
    const extraAttrs = resolvedAttrs ? ` ${resolvedAttrs}` : '';

    return `<div${classAttr}${regionAttr}${extraAttrs}>${contentHtml || ''}</div>`;
}
