import { escapeHtml, escapeHtmlAttr } from '../utils.js';
import { PHONE_ICONS } from '../phone-home.js';

export function buildGenericListPageHtml(options = {}) {
    const {
        tableName = '',
        genericStylePayload,
        searchQuery = '',
        totalRowCount = 0,
        visibleCount = 0,
        toolbarHint = '',
        filteredRows = [],
        showSearch = true,
        showResultCount = true,
        showToolbarHint = true,
        showListIndex = true,
        showListStatus = true,
        showListTime = true,
        showListArrow = true,
        showAddAction = true,
        showLockAction = true,
        showDeleteAction = true,
        deletingAny = false,
        emptyStateTitle = '',
        emptyStateDesc = '',
        lockManageMode = false,
        deleteManageMode = false,
        sortDescending = false,
    } = options;

    return `
        <div class="phone-app-page phone-generic-root ${genericStylePayload.className}" data-generic-template-id="${escapeHtmlAttr(genericStylePayload.templateId)}" ${genericStylePayload.dataAttrs} style="${genericStylePayload.styleAttr}">
            ${genericStylePayload.scopedCss ? `<style class="phone-generic-template-inline-style">${genericStylePayload.scopedCss}</style>` : ''}
            <div class="phone-nav-bar phone-generic-slot-nav">
                <button type="button" class="phone-nav-back">${PHONE_ICONS.back}<span>返回</span></button>
                <span class="phone-nav-title">${escapeHtml(tableName)}</span>
            </div>
            <div class="phone-app-body phone-table-body phone-generic-slot-body">
                <div class="phone-generic-page-shell">
                    <section class="phone-generic-toolbar-card">
                        <div class="phone-generic-toolbar-main">
                            ${showSearch ? `
                                <label class="phone-generic-search-control" for="phone-generic-list-search">
                                    <span class="phone-generic-search-label">搜索条目</span>
                                    <input
                                        type="text"
                                        inputmode="search"
                                        enterkeyhint="search"
                                        autocomplete="off"
                                        autocapitalize="off"
                                        spellcheck="false"
                                        class="phone-generic-search-input"
                                        id="phone-generic-list-search"
                                        placeholder="搜索标题、字段内容或关键词"
                                        value="${escapeHtmlAttr(searchQuery)}"
                                        ${totalRowCount === 0 ? 'disabled' : ''}
                                    >
                                </label>
                            ` : '<div class="phone-generic-search-control is-hidden"></div>'}
                            <div class="phone-generic-toolbar-actions">
                                ${showSearch && searchQuery ? '<button type="button" class="phone-generic-toolbar-btn" data-clear-search="1">清空搜索</button>' : ''}
                                <button
                                    type="button"
                                    class="phone-generic-toolbar-btn phone-generic-sort-btn ${sortDescending ? 'is-active' : ''}"
                                    data-toggle-sort="1"
                                    aria-pressed="${sortDescending ? 'true' : 'false'}"
                                    ${totalRowCount <= 1 ? 'disabled' : ''}
                                >${sortDescending ? '正序' : '倒序'}</button>
                            </div>
                        </div>
                        <div class="phone-generic-toolbar-info">
                            ${showResultCount ? `<span class="phone-generic-result-pill">${searchQuery ? `筛选结果 ${visibleCount}/${totalRowCount}` : `共 ${totalRowCount} 条记录`}</span>` : ''}
                            ${showToolbarHint ? `<span class="phone-generic-toolbar-hint">${escapeHtml(toolbarHint)}</span>` : ''}
                        </div>
                    </section>

                    ${visibleCount > 0 ? `
                        <section class="phone-generic-list-panel">
                            <div class="phone-generic-list-header">
                                <div class="phone-generic-list-header-main">
                                    <span>条目</span>
                                    <span>摘要与状态</span>
                                </div>
                                <div class="phone-generic-list-header-side">字段 / 操作</div>
                            </div>
                            <div class="phone-nav-list phone-generic-slot-list">
                                ${filteredRows.map((viewModel) => {
                                    const deletingCurrent = deleteManageMode && viewModel.rowIndex === options.deletingRowIndex;
                                    const deleteDisabled = viewModel.rowLocked || deletingAny;

                                    return `
                                        <button type="button" class="phone-nav-list-item phone-generic-slot-list-item ${viewModel.rowLocked ? 'is-row-locked' : ''}" data-row-index="${viewModel.rowIndex}">
                                            <span class="phone-generic-list-item-content">
                                                <span class="phone-generic-list-item-head">
                                                    ${showListIndex ? `<span class="phone-generic-list-index">#${viewModel.rowIndex + 1}</span>` : ''}
                                                    <span class="phone-nav-list-main phone-generic-slot-list-main">${escapeHtml(viewModel.title)}</span>
                                                    ${showListStatus ? `
                                                        <span class="phone-generic-list-badges">
                                                            ${viewModel.rowLocked ? '<span class="phone-generic-status-chip is-warning">已锁定</span>' : ''}
                                                            ${viewModel.statusText && !viewModel.rowLocked ? `<span class="phone-generic-status-chip is-${escapeHtmlAttr(viewModel.statusTone)}">${escapeHtml(viewModel.statusText)}</span>` : ''}
                                                        </span>
                                                    ` : ''}
                                                </span>
                                                <span class="phone-generic-list-preview">${escapeHtml(viewModel.previewText)}</span>
                                            </span>
                                            <span class="phone-nav-list-side phone-generic-slot-list-side">
                                                <span class="phone-generic-list-side-meta">
                                                    <span class="phone-nav-list-meta phone-generic-slot-list-meta">${viewModel.nonEmptyCount} 项</span>
                                                    ${showListTime && viewModel.timeText ? `<span class="phone-generic-list-time">${escapeHtml(viewModel.timeText)}</span>` : ''}
                                                </span>
                                                ${lockManageMode
                                                    ? `<span class="phone-row-lock-chip ${viewModel.rowLocked ? 'locked' : ''}" data-row-lock="${viewModel.rowIndex}" role="button" tabindex="0">${viewModel.rowLocked ? '已锁定' : '锁定'}</span>`
                                                    : deleteManageMode
                                                        ? `<span class="phone-row-delete-chip ${viewModel.rowLocked ? 'locked' : ''} ${deletingCurrent ? 'pending' : ''} ${deleteDisabled ? 'disabled' : ''}" data-row-delete="${viewModel.rowIndex}" role="button" tabindex="0" aria-disabled="${deleteDisabled ? 'true' : 'false'}">${viewModel.rowLocked ? '已锁定' : (deletingCurrent ? '删除中...' : '删除')}</span>`
                                                        : (showListArrow ? '<span class="phone-nav-list-arrow phone-generic-slot-list-arrow">查看</span>' : '')
                                                }
                                            </span>
                                        </button>
                                    `;
                                }).join('')}
                            </div>
                        </section>
                    ` : `
                        <div class="phone-empty-msg phone-generic-empty-state">
                            <div class="phone-generic-empty-title">${escapeHtml(emptyStateTitle)}</div>
                            <div class="phone-generic-empty-desc">${escapeHtml(emptyStateDesc)}</div>
                            <button type="button" class="phone-generic-empty-action" data-empty-action="${totalRowCount === 0 ? 'add' : 'clear-search'}">${totalRowCount === 0 ? '新增第一条记录' : '清空搜索'}</button>
                        </div>
                    `}
                </div>
            </div>
            ${showAddAction || showLockAction || showDeleteAction ? `
                <div class="phone-list-bottom-bar phone-generic-slot-actions">
                    ${showAddAction ? '<button type="button" class="phone-list-bottom-btn" id="phone-list-add-btn">新增</button>' : ''}
                    ${showLockAction ? `<button type="button" class="phone-list-bottom-btn ${lockManageMode ? 'active' : ''}" id="phone-list-lock-btn">${lockManageMode ? '完成' : '锁定'}</button>` : ''}
                    ${showDeleteAction ? `<button type="button" class="phone-list-bottom-btn ${deleteManageMode ? 'active' : ''}" id="phone-list-delete-btn">${deleteManageMode ? '完成' : '删除'}</button>` : ''}
                </div>
            ` : ''}
        </div>
    `;
}
