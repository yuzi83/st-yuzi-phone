import { escapeHtml, escapeHtmlAttr } from '../utils/dom-escape.js';
import { PHONE_ICONS } from '../phone-home/icons.js';
import { TABLE_UPDATE_REVIEW_APP_NAME } from './constants.js';

function formatCount(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;
}

function formatChangeType(type) {
    if (type === 'insert') return '新增';
    if (type === 'delete') return '删除';
    return '修改';
}

function isReviewIdentityField(fieldName) {
    const normalized = String(fieldName ?? '').trim().toLowerCase();
    return normalized === 'row_id' || normalized === 'id' || normalized === '行号';
}

function getVisibleReviewFields(fields = []) {
    return (Array.isArray(fields) ? fields : []).filter((field) => !isReviewIdentityField(field?.field));
}

function formatAiReplyFloorText(floorId) {
    const realFloorId = Number(floorId);
    if (!Number.isInteger(realFloorId) || realFloorId < 0) return '最近 AI 回复';
    return `AI 回复第 ${Math.floor(realFloorId / 2) + 1} 楼`;
}

function buildFieldSummaryHtml(fields = []) {
    const displayFields = getVisibleReviewFields(fields);
    return displayFields.map((field) => `
        <span class="tur-field-block" title="${escapeHtmlAttr(`${field.field}: ${field.before || '空'} → ${field.after || '空'}`)}">
            <span class="tur-field-name">${escapeHtml(field.field || '字段')}</span>
            <span class="tur-field-value tur-field-before">${escapeHtml(field.before || '空')}</span>
            <span class="tur-field-arrow">→</span>
            <span class="tur-field-value tur-field-after">${escapeHtml(field.after || '空')}</span>
        </span>
    `).join('');
}

function buildChangeItemHtml(change = {}) {
    const typeText = formatChangeType(change.type);
    const rowLabel = `第 ${formatCount(change.rowIndex) + 1} 行`;
    const title = change.rowTitle || rowLabel;
    if (change.type === 'delete') {
        return `
            <article class="tur-change-item is-delete" data-change-type="delete">
                <span class="tur-change-type is-delete">${typeText}</span>
                <span class="tur-change-main">
                    <strong class="tur-row-title" title="${escapeHtmlAttr(title)}">${escapeHtml(title)}</strong>
                    <small>${escapeHtml(rowLabel)} · 已删除，仅展示净变化</small>
                </span>
                <span class="tur-change-fields">${buildFieldSummaryHtml(change.fields)}</span>
            </article>
        `;
    }
    return `
        <button type="button" class="tur-change-item is-${escapeHtmlAttr(change.type || 'update')}" data-action="open-review-change"
            data-sheet-key="${escapeHtmlAttr(change.sheetKey)}"
            data-row-id="${escapeHtmlAttr(change.rowId || '')}"
            data-row-index="${escapeHtmlAttr(String(change.rowIndex ?? -1))}"
            data-change-type="${escapeHtmlAttr(change.type || '')}">
            <span class="tur-change-type is-${escapeHtmlAttr(change.type || 'update')}">${typeText}</span>
            <span class="tur-change-main">
                <strong class="tur-row-title" title="${escapeHtmlAttr(title)}">${escapeHtml(title)}</strong>
                <small>${escapeHtml(rowLabel)}</small>
            </span>
            <span class="tur-change-fields">${buildFieldSummaryHtml(change.fields)}</span>
        </button>
    `;
}

function buildTableGroupHtml(table = {}) {
    const changes = Array.isArray(table.changes) ? table.changes : [];
    return `
        <details class="tur-table-card" data-sheet-key="${escapeHtmlAttr(table.sheetKey || '')}">
            <summary class="tur-table-summary tur-table-header">
                <div>
                    <h3>${escapeHtml(table.tableName || table.sheetKey || '未命名表格')}</h3>
                    <p>${formatCount(table.insertCount)} 新增 · ${formatCount(table.updateCount)} 修改 · ${formatCount(table.deleteCount)} 删除</p>
                </div>
                <span class="tur-table-count">${formatCount(table.changeCount)}</span>
            </summary>
            <div class="tur-change-list">${changes.map(buildChangeItemHtml).join('')}</div>
        </details>
    `;
}

export function buildTableUpdateReviewPageHtml(state = {}) {
    return `
        <div class="phone-app-page tur-page">
            <div class="phone-nav-bar tur-nav">
                <button type="button" class="phone-nav-back tur-nav-back" data-action="nav-back" aria-label="返回">${PHONE_ICONS.back}<span>返回</span></button>
                <span class="phone-nav-title">${escapeHtml(TABLE_UPDATE_REVIEW_APP_NAME)}</span>
            </div>
            <div class="phone-app-body tur-body">
                <div class="tur-content">${buildTableUpdateReviewContentHtml(state)}</div>
            </div>
        </div>
    `;
}

export function buildTableUpdateReviewContentHtml(state = {}) {
    const tables = Array.isArray(state.tables) ? state.tables : [];
    const statusClass = state.status === 'error' ? 'is-error' : state.changeCount > 0 ? 'is-ready' : 'is-empty';
    const floorText = formatAiReplyFloorText(state.floorId);
    const message = state.error?.message || state.message || '暂无本楼更新';
    return `
        <section class="tur-summary ${statusClass}">
            <div><span class="tur-kicker">${escapeHtml(floorText)}</span><h2>${escapeHtml(message)}</h2></div>
            <div class="tur-metrics"><span>${formatCount(state.tableCount)} 表</span><span>${formatCount(state.changeCount)} 更新</span></div>
        </section>
        ${tables.length > 0 ? `<div class="tur-table-list">${tables.map(buildTableGroupHtml).join('')}</div>` : '<div class="tur-empty">当前还没有可审核的本楼表格更新。</div>'}
    `;
}
