// modules/utils.js
/**
 * Yuzi Phone - 通用工具函数
 */

export function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
}

export function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str || '');
    return div.innerHTML;
}

export function escapeHtmlAttr(value) {
    return escapeHtml(String(value || ''));
}

export function safeText(value) {
    return String(value ?? '');
}

export function safeTrim(value) {
    return String(value ?? '').trim();
}
