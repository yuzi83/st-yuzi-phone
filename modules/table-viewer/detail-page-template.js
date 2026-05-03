import { escapeHtml, escapeHtmlAttr } from '../utils/dom-escape.js';
import { PHONE_ICONS } from '../phone-home/icons.js';

export function buildGenericDetailPageHtml(options = {}) {
    const {
        title = '',
        kvPairs = [],
        rowLocked = false,
        pagerInfo = {},
        genericStylePayload,
        state,
    } = options;

    const pagerDisabled = !!pagerInfo.disabled;
    const prevIndex = Number.isInteger(pagerInfo.prevIndex) ? pagerInfo.prevIndex : -1;
    const nextIndex = Number.isInteger(pagerInfo.nextIndex) ? pagerInfo.nextIndex : -1;
    const pagerDisabledAttr = pagerDisabled ? 'disabled aria-disabled="true"' : 'aria-disabled="false"';

    return `
        <div class="phone-app-page phone-generic-root ${genericStylePayload.className}" data-generic-template-id="${escapeHtmlAttr(genericStylePayload.templateId)}" ${genericStylePayload.dataAttrs} style="${genericStylePayload.styleAttr}">
            ${genericStylePayload.scopedCss ? `<style class="phone-generic-template-inline-style">${genericStylePayload.scopedCss}</style>` : ''}
            <div class="phone-nav-bar phone-generic-slot-nav">
                <button type="button" class="phone-nav-back">${PHONE_ICONS.back}<span>返回</span></button>
                <span class="phone-nav-title">${escapeHtml(title)}</span>
            </div>
            <div class="phone-app-body phone-table-body phone-generic-slot-body">
                <div class="phone-generic-detail-page phone-generic-detail-page-flow">
                    <div class="phone-row-detail-card phone-generic-slot-detail phone-generic-detail-flow-list">
                        ${kvPairs.map((pair) => `
                            <div class="phone-row-detail-kv phone-generic-slot-detail-field ${pair.isLocked ? 'is-locked' : ''} ${pair.preferFullRow ? 'is-long-content' : ''} ${state.cellLockManageMode ? 'show-lock-tools' : ''}" data-col-index="${pair.rawColIndex}">
                                <div class="phone-generic-field-header">
                                    <span class="phone-row-detail-key">${escapeHtml(pair.key)}</span>
                                    ${pair.isLocked ? `<span class="phone-generic-field-lock-state">${pair.cellLocked ? '字段锁定' : '整行锁定'}</span>` : ''}
                                </div>
                                ${state.editMode
                                    ? `<textarea class="phone-row-detail-input" data-input-col="${pair.rawColIndex}" ${pair.isLocked ? 'disabled' : ''}>${escapeHtml(pair.value)}</textarea>`
                                    : `<span class="phone-row-detail-value">${escapeHtml(pair.value || '—')}</span>`
                                }
                                <div class="phone-row-detail-tools phone-generic-slot-detail-tools">
                                    <button type="button" class="phone-cell-lock-btn ${pair.cellLocked ? 'locked' : ''}" data-cell-lock="${pair.lockColIndex}" data-cell-raw="${pair.rawColIndex}" ${rowLocked ? 'disabled' : ''}>${pair.cellLocked ? '已锁定' : '锁定'}</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
            <div class="phone-detail-pager-bar phone-generic-slot-pager" aria-label="详情页翻页">
                <button type="button" class="phone-detail-pager-btn" data-pager="prev" data-target-row-index="${escapeHtmlAttr(String(prevIndex))}" aria-label="上一条" ${pagerDisabledAttr}>‹</button>
                <button type="button" class="phone-detail-pager-btn" data-pager="next" data-target-row-index="${escapeHtmlAttr(String(nextIndex))}" aria-label="下一条" ${pagerDisabledAttr}>›</button>
            </div>
            <div class="phone-detail-bottom-bar phone-generic-slot-actions">
                <button type="button" class="phone-detail-bottom-btn" id="phone-toggle-edit-mode">${state.editMode ? '退出编辑' : '进入编辑'}</button>
                <button type="button" class="phone-detail-bottom-btn" id="phone-save-row" ${state.editMode && !rowLocked ? '' : 'disabled'}>${state.saving ? '保存中...' : '保存更改'}</button>
                <button type="button" class="phone-detail-bottom-btn ${state.cellLockManageMode ? 'active' : ''}" id="phone-cell-lock-mode-btn">${state.cellLockManageMode ? '完成' : '字段锁定'}</button>
            </div>
        </div>
    `;
}
