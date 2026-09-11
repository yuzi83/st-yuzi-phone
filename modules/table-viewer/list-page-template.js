import { escapeHtml, escapeHtmlAttr } from '../utils/dom-escape.js';
import {
    buildPhoneBackButton,
    buildPhoneNavBar,
    buildPhoneNavTitleSwitcher,
    buildPhoneSwitchButton,
} from '../phone-core/navigation-ui.js';

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
        onlyShowReviewUpdates = false,
        reviewUpdatedRowCount = 0,
    } = options;
    const reviewCount = Math.max(0, Number(reviewUpdatedRowCount || 0));

    return `
        ${showSearch && searchQuery ? '<button type="button" class="phone-generic-toolbar-btn" data-action="clear-search" data-clear-search="1">清空搜索</button>' : ''}
        <button
            type="button"
            class="phone-generic-toolbar-btn phone-generic-review-filter-btn ${onlyShowReviewUpdates ? 'is-active' : ''}"
            data-action="toggle-review-updates-only"
            data-toggle-review-updates-only="1"
            aria-pressed="${onlyShowReviewUpdates ? 'true' : 'false'}"
            ${!onlyShowReviewUpdates && reviewCount <= 0 ? 'disabled' : ''}
        >${onlyShowReviewUpdates ? `本楼更新 ${reviewCount}` : '只看本楼更新'}</button>
        <button
            type="button"
            class="phone-generic-toolbar-btn phone-generic-sort-btn ${sortDescending ? 'is-active' : ''}"
            data-action="toggle-sort"
            data-toggle-sort="1"
            aria-pressed="${sortDescending ? 'true' : 'false'}"
            ${totalRowCount <= 1 ? 'disabled' : ''}
            aria-label="当前${sortDescending ? '倒序' : '正序'}，切换为${sortDescending ? '正序' : '倒序'}"
            title="当前${sortDescending ? '倒序' : '正序'}，切换为${sortDescending ? '正序' : '倒序'}"
        ><svg class="phone-generic-sort-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path class="phone-generic-sort-up" d="M7 20V4m-4 4 4-4 4 4"/><path class="phone-generic-sort-down" d="M17 4v16m-4-4 4 4 4-4"/></svg></button>
    `;
}

export function buildGenericListToolbarInfoHtml({ visibleCount = 0, showResultCount = true } = {}) {
    return showResultCount ? `<span class="phone-generic-result-pill">${visibleCount}条</span>` : '';
}

export function buildGenericListToolbarHtml(options = {}) {
    return `
        <section class="phone-generic-toolbar-card">
            <div data-generic-toolbar-region="search">
                ${buildGenericListToolbarSearchHtml(options)}
            </div>
            <div class="phone-generic-toolbar-main">
                <div class="phone-generic-toolbar-info" data-generic-toolbar-region="info">
                    ${buildGenericListToolbarInfoHtml(options)}
                </div>
                <div class="phone-generic-toolbar-actions" data-generic-toolbar-region="actions">
                    ${buildGenericListToolbarActionsHtml(options)}
                </div>
            </div>
        </section>
    `;
}

function buildGenericTitleNavigationHtml(tableName, navigationControlState = {}, showNavigation = true) {
    const previous = navigationControlState.previous || {};
    const next = navigationControlState.next || {};
    return buildPhoneNavTitleSwitcher({
        title: tableName,
        previousHtml: showNavigation ? buildPhoneSwitchButton('previous', {
            className: 'phone-generic-table-navigation-btn',
            action: 'switch-table-previous',
            label: '上一张表',
            disabled: previous.disabled === true,
            attributes: { 'aria-disabled': previous.disabled ? 'true' : 'false' },
        }) : '',
        nextHtml: showNavigation ? buildPhoneSwitchButton('next', {
            className: 'phone-generic-table-navigation-btn',
            action: 'switch-table-next',
            label: '下一张表',
            disabled: next.disabled === true,
            attributes: { 'aria-disabled': next.disabled ? 'true' : 'false' },
        }) : '',
        className: `phone-generic-title-navigation ${showNavigation ? 'phone-generic-table-navigation' : 'is-title-only'}`,
        attributes: showNavigation ? { 'aria-label': '切换表格' } : {},
    });
}

export function buildGenericListNavHtml(options = {}) {
    const {
        tableName = '',
        deleteManageMode = false,
        deletingSelection = false,
        selectedDeleteCount = 0,
        selectableDeleteCount = 0,
        allVisibleDeleteRowsSelected = false,
        navigationControlState,
    } = options;
    const selectedCount = Math.max(0, Number(selectedDeleteCount || 0));
    const selectableCount = Math.max(0, Number(selectableDeleteCount || 0));
    const selectAllDisabled = deletingSelection || selectableCount <= 0;
    const clearDisabled = deletingSelection || selectedCount <= 0;
    const deleteDisabled = deletingSelection || selectedCount <= 0;

    const actionsHtml = deleteManageMode ? `
                <div class="phone-nav-secondary-actions phone-generic-nav-delete-actions" aria-label="批量删除操作">
                    <button type="button" class="phone-generic-nav-delete-btn ${allVisibleDeleteRowsSelected ? 'is-active' : ''}" data-action="select-all-delete-rows" aria-pressed="${allVisibleDeleteRowsSelected ? 'true' : 'false'}" ${selectAllDisabled ? 'disabled' : ''}>全选</button>
                    <button type="button" class="phone-generic-nav-delete-btn" data-action="clear-delete-selection" ${clearDisabled ? 'disabled' : ''}>清空</button>
                    <button type="button" class="phone-generic-nav-delete-btn is-danger" data-action="delete-selected-rows" ${deleteDisabled ? 'disabled' : ''}>${deletingSelection ? '删除中...' : `删 ${selectedCount}`}</button>
                </div>
            ` : '';

    return buildPhoneNavBar({
        className: `phone-generic-slot-nav ${deleteManageMode ? 'is-generic-delete-mode has-secondary-actions' : ''}`,
        attributes: { 'data-generic-list-region': 'nav' },
        leadingHtml: buildPhoneBackButton({ action: 'nav-back' }),
        centerHtml: buildGenericTitleNavigationHtml(tableName, navigationControlState, !deleteManageMode),
        trailingHtml: actionsHtml,
    });
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
    const deleteSelected = !!viewModel.deleteSelected;
    const deleteDisabled = viewModel.rowLocked || deletingAny;
    const rowKey = viewModel.rowKey || `row:${viewModel.rowIndex}`;
    const rowVersion = viewModel.rowVersion || '';
    const rowAction = lockManageMode ? 'toggle-row-lock' : deleteManageMode ? 'toggle-delete-selection' : 'open-row';
    const manageAttrs = lockManageMode
        ? `data-row-lock="${viewModel.rowIndex}" aria-pressed="${viewModel.rowLocked ? 'true' : 'false'}"`
        : deleteManageMode
            ? `data-row-delete="${viewModel.rowIndex}" aria-pressed="${deleteSelected ? 'true' : 'false'}" aria-disabled="${deleteDisabled ? 'true' : 'false'}"`
            : '';

    return `
        <button type="button" class="phone-nav-list-item phone-generic-slot-list-item ${viewModel.rowLocked ? 'is-row-locked' : ''} ${deleteSelected ? 'is-delete-selected' : ''}" data-action="${rowAction}" ${manageAttrs} data-row-index="${viewModel.rowIndex}" data-row-key="${escapeHtmlAttr(rowKey)}" data-row-version="${escapeHtmlAttr(rowVersion)}">
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
                    ? `<span class="phone-row-lock-chip ${viewModel.rowLocked ? 'locked' : ''}" aria-hidden="true">${viewModel.rowLocked ? '已锁定' : '锁定'}</span>`
                    : deleteManageMode
                        ? `<span class="phone-row-select-circle ${deleteSelected ? 'is-selected' : ''} ${deletingCurrent ? 'pending' : ''} ${deleteDisabled ? 'disabled' : ''}" aria-hidden="true" title="${viewModel.rowLocked ? '条目已锁定' : (deleteSelected ? '取消选择' : '选择删除')}">${deleteSelected ? '✓' : ''}</span>`
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
        searchQuery = '',
        onlyShowReviewUpdates = false,
        reviewUpdatedRowCount = 0,
    } = options;
    const reviewCount = Math.max(0, Number(reviewUpdatedRowCount || 0));
    const hasSearchQuery = String(searchQuery || '').trim().length > 0;
    let emptyAction = 'clear-search';
    let emptyActionType = 'clear-search';
    let emptyActionLabel = '清空搜索';

    if (totalRowCount === 0) {
        emptyAction = 'add-row';
        emptyActionType = 'add';
        emptyActionLabel = '新增第一条记录';
    } else if (onlyShowReviewUpdates && (!hasSearchQuery || reviewCount <= 0)) {
        emptyAction = 'toggle-review-updates-only';
        emptyActionType = 'show-all';
        emptyActionLabel = '显示全部条目';
    }

    return `
        <div class="phone-empty-msg phone-generic-empty-state">
            <div class="phone-generic-empty-title">${escapeHtml(emptyStateTitle)}</div>
            <div class="phone-generic-empty-desc">${escapeHtml(emptyStateDesc)}</div>
            ${emptyAction !== 'clear-search' ? `<button type="button" class="phone-generic-empty-action" data-action="${emptyAction}" data-empty-action="${emptyActionType}">${emptyActionLabel}</button>` : ''}
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
        searchQuery = '',
        onlyShowReviewUpdates = false,
        reviewUpdatedRowCount = 0,
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
        searchQuery,
        onlyShowReviewUpdates,
        reviewUpdatedRowCount,
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
        <div class="phone-list-bottom-bar phone-generic-slot-actions" data-phone-bottom-bar>
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
        filteredRows = [],
        showSearch = true,
        showResultCount = true,
        showListIndex = true,
        showListStatus = true,
        showListTime = true,
        showListArrow = true,
        showAddAction = true,
        showLockAction = true,
        showDeleteAction = true,
        deletingAny = false,
        deletingRowIndex = -1,
        deletingSelection = false,
        selectedDeleteCount = 0,
        selectableDeleteCount = 0,
        allVisibleDeleteRowsSelected = false,
        emptyStateTitle = '',
        emptyStateDesc = '',
        lockManageMode = false,
        deleteManageMode = false,
        sortDescending = false,
        onlyShowReviewUpdates = false,
        reviewUpdatedRowCount = 0,
        navigationControlState,
    } = options;

    return `
        <div class="phone-app-page phone-generic-root ${genericStylePayload.className} ${deleteManageMode ? 'is-generic-delete-mode' : ''}" data-generic-template-id="${escapeHtmlAttr(genericStylePayload.templateId)}" ${genericStylePayload.dataAttrs} style="${genericStylePayload.styleAttr}">
            ${genericStylePayload.scopedCss ? `<style class="phone-generic-template-inline-style">${genericStylePayload.scopedCss}</style>` : ''}
            ${buildGenericListNavHtml({
                tableName,
                deleteManageMode,
                deletingSelection,
                selectedDeleteCount,
                selectableDeleteCount,
                allVisibleDeleteRowsSelected,
                navigationControlState,
            })}
            <div class="phone-app-body phone-table-body phone-generic-slot-body">
                <div class="phone-generic-page-shell">
                    <div data-generic-list-region="toolbar">
                        ${buildGenericListToolbarHtml({
                            searchQuery,
                            totalRowCount,
                            visibleCount,
                            showSearch,
                            showResultCount,
                            sortDescending,
                            onlyShowReviewUpdates,
                            reviewUpdatedRowCount,
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
                            searchQuery,
                            onlyShowReviewUpdates,
                            reviewUpdatedRowCount,
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
