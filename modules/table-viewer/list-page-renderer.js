import { createGenericTemplateStylePayload } from './generic-style-payload.js';
import { buildGenericListPageHtml } from './list-page-template.js';
import { bindGenericListPageController } from './list-page-controller.js';
import { showGenericAddRowModal } from './add-row-modal.js';
import { showInlineToast, bindWheelBridge } from './shared-ui.js';
import {
    normalizeCellDisplayValue,
    buildGenericRowViewModel,
} from './row-view-model.js';

export function renderGenericListPage(options = {}) {
    const {
        container,
        state,
        sheetKey,
        tableName = '',
        headers = [],
        rawHeaders = [],
        rows = [],
        genericMatch,
        addRowModalId = 'phone-add-row-modal',
        render,
        renderKeepScroll,
        captureListScroll,
        navigateBack,
        deleteRowFromList,
        toggleTableRowLock,
        getTableLockState,
        isTableRowLocked,
        insertTableRow,
        getTableData,
        setSuppressExternalTableUpdate,
    } = options;

    if (!(container instanceof HTMLElement) || !state) return;
    if (typeof getTableLockState !== 'function') return;

    state.lockState = getTableLockState(sheetKey);

    const totalRowCount = rows.length;
    const searchQuery = normalizeCellDisplayValue(state.listSearchQuery || '');
    const searchQueryLower = searchQuery.toLowerCase();
    const lockRows = new Set((state.lockState?.rows || []).filter(Number.isInteger));
    const deletingAny = state.deletingRowIndex >= 0;
    const genericStylePayload = createGenericTemplateStylePayload(genericMatch, 'list');
    const toolbarOptions = genericStylePayload.structureOptions?.toolbar || {};
    const listItemOptions = genericStylePayload.structureOptions?.listItem || {};
    const bottomBarOptions = genericStylePayload.structureOptions?.bottomBar || {};
    const showSearch = toolbarOptions.showSearch !== false;
    const showResultCount = toolbarOptions.showResultCount !== false;
    const showToolbarHint = toolbarOptions.showHint !== false;
    const showListIndex = listItemOptions.showIndex !== false;
    const showListStatus = listItemOptions.showStatus !== false;
    const showListTime = listItemOptions.showTime !== false;
    const showListArrow = listItemOptions.showArrow !== false;
    const showAddAction = bottomBarOptions.showAdd !== false;
    const showLockAction = bottomBarOptions.showLock !== false;
    const showDeleteAction = bottomBarOptions.showDelete !== false;

    const rowViewModels = rows.map((row, rowIndex) => buildGenericRowViewModel(
        row,
        rowIndex,
        headers,
        rawHeaders,
        lockRows.has(rowIndex),
        genericStylePayload.fieldBindings,
    ));
    const filteredRows = searchQueryLower
        ? rowViewModels.filter((viewModel) => viewModel.searchText.includes(searchQueryLower))
        : rowViewModels;
    const orderedFilteredRows = state.listSortDescending
        ? [...filteredRows].reverse()
        : filteredRows;

    const visibleCount = filteredRows.length;
    const emptyStateTitle = totalRowCount === 0
        ? '还没有任何条目'
        : '没有匹配到相关条目';
    const emptyStateDesc = totalRowCount === 0
        ? '你可以先创建第一条记录，后续会在这里以结构化列表形式展示。'
        : `试试缩短关键词，或清空当前搜索“${searchQuery}”。`;
    const toolbarHint = state.lockManageMode
        ? '锁定管理中：点击右侧标签切换条目锁定状态。'
        : state.deleteManageMode
            ? '删除管理中：点击右侧删除按钮即可移除条目。'
            : '点击条目进入详情页；支持搜索、锁定、删除与新增操作。';

    const openAddRowModal = () => {
        showGenericAddRowModal({
            addRowModalId,
            headers,
            rawHeaders,
            tableName,
            sheetKey,
            rows,
            state,
            container,
            insertTableRow,
            getTableData,
            getTableLockState,
            showInlineToast,
            renderKeepScroll,
        });
    };

    container.innerHTML = buildGenericListPageHtml({
        tableName,
        genericStylePayload,
        searchQuery,
        totalRowCount,
        visibleCount,
        toolbarHint,
        filteredRows: orderedFilteredRows,
        showSearch,
        showResultCount,
        showToolbarHint,
        showListIndex,
        showListStatus,
        showListTime,
        showListArrow,
        showAddAction,
        showLockAction,
        showDeleteAction,
        deletingAny,
        deletingRowIndex: state.deletingRowIndex,
        emptyStateTitle,
        emptyStateDesc,
        lockManageMode: state.lockManageMode,
        deleteManageMode: state.deleteManageMode,
        sortDescending: !!state.listSortDescending,
    });

    bindWheelBridge(container);

    bindGenericListPageController({
        container,
        state,
        sheetKey,
        navigateBack,
        captureListScroll,
        render,
        renderKeepScroll,
        showAddRowModal: openAddRowModal,
        deleteRowFromList,
        toggleTableRowLock,
        getTableLockState,
        isTableRowLocked,
        showInlineToast,
        setSuppressExternalTableUpdate,
    });
}
