import { escapeHtml, escapeHtmlAttr } from '../../utils/dom-escape.js';
import { splitSemicolonText, normalizeText } from './table-index.js';

export function getInitial(name) {
    const text = normalizeText(name);
    if (!text) return '·';
    return [...text][0] || '·';
}

export function hashStringToIndex(text, modulo) {
    if (modulo <= 0) return 0;
    const value = String(text || '');
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
        hash = (hash * 31 + value.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % modulo;
}

export function splitTopicTokens(text) {
    return splitSemicolonText(text)
        .map(part => part.replace(/^#+/, '').trim())
        .filter(Boolean);
}

export function renderMetaLine(items = []) {
    const visible = items.map(item => normalizeText(item)).filter(Boolean);
    if (visible.length <= 0) return '';
    return `<div class="phone-theater-meta-line">${visible.map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div>`;
}

function normalizeClassTokenList(className = '') {
    return String(className || '')
        .split(/\s+/)
        .map(token => token.replace(/[^a-zA-Z0-9_-]/g, ''))
        .map(normalizeText)
        .filter(Boolean)
        .join(' ');
}

export function renderTag(text, className = '') {
    const safeText = normalizeText(text);
    if (!safeText) return '';
    const safeClassName = normalizeClassTokenList(className);
    return `<span class="phone-theater-tag${safeClassName ? ` ${safeClassName}` : ''}">${escapeHtml(safeText)}</span>`;
}

export function renderEmpty(message) {
    return `<div class="phone-empty-msg phone-theater-empty">${escapeHtml(message || '暂无内容')}</div>`;
}

export function renderDeleteSelectButton(deleteKey, uiState = {}) {
    if (!uiState.deleteManageMode) return '';
    const safeKey = normalizeText(deleteKey);
    if (!safeKey) return '';
    const selected = uiState.selectedKeys?.has(safeKey);
    return `
        <button type="button" class="phone-theater-select-toggle ${selected ? 'is-selected' : ''}" data-action="theater-toggle-select" data-theater-delete-key="${escapeHtmlAttr(safeKey)}" aria-pressed="${selected ? 'true' : 'false'}">${selected ? '✓' : ''}</button>
    `;
}

export const theaterRenderKit = Object.freeze({
    escapeHtml,
    escapeHtmlAttr,
    getInitial,
    hashStringToIndex,
    normalizeClassTokenList,
    normalizeText,
    renderDeleteSelectButton,
    renderEmpty,
    renderMetaLine,
    renderTag,
    splitSemicolonText,
    splitTopicTokens,
});
