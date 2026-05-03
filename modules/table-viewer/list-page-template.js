import { escapeHtml, escapeHtmlAttr } from '../utils/dom-escape.js';
import { PHONE_ICONS } from '../phone-home/icons.js';

export function buildGenericListToolbarSearchHtml(options = {}) {
    const {
        searchQuery = '',
        totalRowCount = 0,
        showSearch = true,
    } = options;

    return showSearch ? `
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
    ` : '<div class="phone-generic-search-control is-hidden"></div>';
}

export function buildGenericListToolbarActionsHtml(options = {}) {
    const {
        searchQuery = '',
        totalRowCount = 0,
        showSearch = true,
        sortDescending = false,
    } = options;

    return `
        ${showSearch && searchQuery ? '<button type="button" class="phone-generic-toolbar-btn" data-action="clear-search" data-clear-search="1">清空搜索</button>' : ''}
        <button
            type="button"
            class="phone-generic-toolbar-btn phone-generic-sort-btn ${sortDescending ? 'is-active' : ''}"
            data-action="toggle-sort"
            data-toggle-sort="1"
            aria-pressed="${sortDescending ? 'true' : 'false'}"
            ${totalRowCount <= 1 ? 'disabled' : ''}
        >${sortDescending ? '正序' : '倒序'}</button>
    `;
}

export function buildGenericListToolbarInfoHtml(options = {}) {
    const {
        searchQuery = '',
        totalRowCount = 0,
        visibleCount = 0,
        toolbarHint = '',
        showResultCount = true,
        showToolbarHint = true,
    } = options;

    return `
        ${showResultCount ? `<span class="phone-generic-result-pill">${searchQuery ? `筛选结果 ${visibleCount}/${totalRowCount}` : `共 ${totalRowCount} 条记录`}</span>` : ''}
        ${showToolbarHint ? `<span class="phone-generic-toolbar-hint">${escapeHtml(toolbarHint)}</span>` : ''}
    `;
}

export function buildGenericListToolbarHtml(options = {}) {
    return `
        <section class="phone-generic-toolbar-card">
            <div class="phone-generic-toolbar-main">
                <div data-generic-toolbar-region="search">
                    ${buildGenericListToolbarSearchHtml(options)}
                </div>
                <div class="phone-generic-toolbar-actions" data-generic-toolbar-region="actions">
                    ${buildGenericListToolbarActionsHtml(options)}
                </div>
            </div>
            <div class="phone-generic-toolbar-info" data-generic-toolbar-region="info">
                ${buildGenericListToolbarInfoHtml(options)}
            </div>
        </section>
    `;
}

export function buildGenericListRowHtml(viewModel, options = {}) {
    const {
        showListIndex = true,
        showListStatus = true,
        showListTime = true,
        showListArrow = true,
        lockManageMode = false,
        deleteManageMode = false,
        deletingAny = false,
        deletingRowIndex = -1,
    } = options;

    const deletingCurrent = deleteManageMode && viewModel.rowIndex === deletingRowIndex;
    const deleteDisabled = viewModel.rowLocked || deletingAny;
    const rowKey = viewModel.rowKey || `row:${viewModel.rowIndex}`;
    const rowVersion = viewModel.rowVersion || '';

    return `
        <button type="button" class="phone-nav-list-item phone-generic-slot-list-item ${viewModel.rowLocked ? 'is-row-locked' : ''}" data-action="open-row" data-row-index="${viewModel.rowIndex}" data-row-key="${escapeHtmlAttr(rowKey)}" data-row-version="${escapeHtmlAttr(rowVersion)}">
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
                    ? `<span class="phone-row-lock-chip ${viewModel.rowLocked ? 'locked' : ''}" data-action="toggle-row-lock" data-row-lock="${viewModel.rowIndex}" role="button" tabindex="0">${viewModel.rowLocked ? '已锁定' : '锁定'}</span>`
                    : deleteManageMode
                        ? `<span class="phone-row-delete-chip ${viewModel.rowLocked ? 'locked' : ''} ${deletingCurrent ? 'pending' : ''} ${deleteDisabled ? 'disabled' : ''}" data-action="delete-row" data-row-delete="${viewModel.rowIndex}" role="button" tabindex="0" aria-disabled="${deleteDisabled ? 'true' : 'false'}">${viewModel.rowLocked ? '已锁定' : (deletingCurrent ? '删除中...' : '删除')}</span>`
                        : (showListArrow ? '<span class="phone-nav-list-arrow phone-generic-slot-list-arrow">查看</span>' : '')
                }
            </span>
        </button>
    `;
}

export function buildGenericListRowsHtml(options = {}) {
    const {
        filteredRows = [],
        showListIndex = true,
        showListStatus = true,
        showListTime = true,
        showListArrow = true,
        lockManageMode = false,
        deleteManageMode = false,
        deletingAny = false,
        deletingRowIndex = -1,
    } = options;

    return filteredRows.map((viewModel) => buildGenericListRowHtml(viewModel, {
        showListIndex,
        showListStatus,
        showListTime,
        showListArrow,
        lockManageMode,
        deleteManageMode,
        deletingAny,
        deletingRowIndex,
    })).join('');
}

function buildGenericEmptyStateHtml(options = {}) {
    const {
        totalRowCount = 0,
        emptyStateTitle = '',
        emptyStateDesc = '',
    } = options;

    return `
        <div class="phone-empty-msg phone-generic-empty-state">
            <div class="phone-generic-empty-title">${escapeHtml(emptyStateTitle)}</div>
            <div class="phone-generic-empty-desc">${escapeHtml(emptyStateDesc)}</div>
            <button type="button" class="phone-generic-empty-action" data-action="${totalRowCount === 0 ? 'add-row' : 'clear-search'}" data-empty-action="${totalRowCount === 0 ? 'add' : 'clear-search'}">${totalRowCount === 0 ? '新增第一条记录' : '清空搜索'}</button>
        </div>
    `;
}

export function buildGenericListContentHtml(options = {}) {
    const {
        visibleCount = 0,
        filteredRows = [],
        showListIndex = true,
        showListStatus = true,
        showListTime = true,
        showListArrow = true,
        deletingAny = false,
        deletingRowIndex = -1,
        emptyStateTitle = '',
        emptyStateDesc = '',
        lockManageMode = false,
        deleteManageMode = false,
        totalRowCount = 0,
    } = options;

    if (visibleCount > 0) {
        return `
            <section class="phone-generic-list-panel">
                <div class="phone-generic-list-header">
                    <div class="phone-generic-list-header-main">
                        <span>条目</span>
                        <span>摘要与状态</span>
                    </div>
                    <div class="phone-generic-list-header-side">字段 / 操作</div>
                </div>
                <div class="phone-nav-list phone-generic-slot-list">
                    ${buildGenericListRowsHtml({
                        filteredRows,
                        showListIndex,
                        showListStatus,
                        showListTime,
                        showListArrow,
                        lockManageMode,
                        deleteManageMode,
                        deletingAny,
                        deletingRowIndex,
                    })}
                </div>
            </section>
        `;
    }

    return buildGenericEmptyStateHtml({
        totalRowCount,
        emptyStateTitle,
        emptyStateDesc,
    });
}

export function buildGenericListBottomBarHtml(options = {}) {
    const {
        showAddAction = true,
        showLockAction = true,
        showDeleteAction = true,
        lockManageMode = false,
        deleteManageMode = false,
    } = options;

    if (!showAddAction && !showLockAction && !showDeleteAction) {
        return '';
    }

    return `
        <div class="phone-list-bottom-bar phone-generic-slot-actions">
            ${showAddAction ? '<button type="button" class="phone-list-bottom-btn" id="phone-list-add-btn" data-action="add-row">新增</button>' : ''}
            ${showLockAction ? `<button type="button" class="phone-list-bottom-btn ${lockManageMode ? 'active' : ''}" id="phone-list-lock-btn" data-action="toggle-lock-mode">${lockManageMode ? '完成' : '锁定'}</button>` : ''}
            ${showDeleteAction ? `<button type="button" class="phone-list-bottom-btn ${deleteManageMode ? 'active' : ''}" id="phone-list-delete-btn" data-action="toggle-delete-mode">${deleteManageMode ? '完成' : '删除'}</button>` : ''}
        </div>
    `;
}

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
        deletingRowIndex = -1,
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
                <button type="button" class="phone-nav-back" data-action="nav-back">${PHONE_ICONS.back}<span>返回</span></button>
                <span class="phone-nav-title">${escapeHtml(tableName)}</span>
            </div>
            <div class="phone-app-body phone-table-body phone-generic-slot-body">
                <div class="phone-generic-page-shell">
                    <div data-generic-list-region="toolbar">
                        ${buildGenericListToolbarHtml({
                            searchQuery,
                            totalRowCount,
                            visibleCount,
                            toolbarHint,
                            showSearch,
                            showResultCount,
                            showToolbarHint,
                            sortDescending,
                        })}
                    </div>
                    <div data-generic-list-region="content">
                        ${buildGenericListContentHtml({
                            visibleCount,
                            filteredRows,
                            showListIndex,
                            showListStatus,
                            showListTime,
                            showListArrow,
                            deletingAny,
                            deletingRowIndex,
                            emptyStateTitle,
                            emptyStateDesc,
                            lockManageMode,
                            deleteManageMode,
                            totalRowCount,
                        })}
                    </div>
                </div>
            </div>
            <div data-generic-list-region="bottom-bar">
                ${buildGenericListBottomBarHtml({
                    showAddAction,
                    showLockAction,
                    showDeleteAction,
                    lockManageMode,
                    deleteManageMode,
                })}
            </div>
        </div>
    `;
}
