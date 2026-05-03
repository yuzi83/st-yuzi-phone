import { Logger } from '../error-handler.js';
import { createGenericTemplateStylePayload } from './generic-style-payload.js';
import {
    buildGenericListPageHtml,
    buildGenericListToolbarHtml,
    buildGenericListToolbarActionsHtml,
    buildGenericListToolbarInfoHtml,
    buildGenericListContentHtml,
    buildGenericListRowHtml,
    buildGenericListBottomBarHtml,
} from './list-page-template.js';
import { bindGenericListPageController } from './list-page-controller.js';
import { showGenericAddRowModal } from './add-row-modal.js';
import { showInlineToast, bindWheelBridge } from './shared-ui.js';
import {
    normalizeCellDisplayValue,
    buildGenericRowViewModel,
} from './row-view-model.js';

const logger = Logger.withScope({ scope: 'table-viewer/list-page-renderer', feature: 'table-viewer' });

const GENERIC_LIST_ROOT_SELECTOR = '.phone-generic-root';
const GENERIC_TOOLBAR_REGION_SELECTOR = '[data-generic-list-region="toolbar"]';
const GENERIC_TOOLBAR_ACTIONS_REGION_SELECTOR = '[data-generic-toolbar-region="actions"]';
const GENERIC_TOOLBAR_INFO_REGION_SELECTOR = '[data-generic-toolbar-region="info"]';
const GENERIC_CONTENT_REGION_SELECTOR = '[data-generic-list-region="content"]';
const GENERIC_BOTTOM_BAR_REGION_SELECTOR = '[data-generic-list-region="bottom-bar"]';

function buildGenericListPageViewModel(options = {}) {
    const {
        state,
        rows = [],
        headers = [],
        rawHeaders = [],
        genericMatch,
    } = options;

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

    const rowViewModels = rows.map((row, rowIndex) => {
        const rowViewModel = buildGenericRowViewModel(
            row,
            rowIndex,
            headers,
            rawHeaders,
            lockRows.has(rowIndex),
            genericStylePayload.fieldBindings,
        );
        const rowDataSignature = Array.isArray(row)
            ? row.map((value) => normalizeCellDisplayValue(value)).join('\u001f')
            : normalizeCellDisplayValue(row);
        return {
            ...rowViewModel,
            rowKey: `row:${rowIndex}`,
            rowVersion: [
                rowIndex,
                rowDataSignature,
                rowViewModel.title,
                rowViewModel.nonEmptyCount,
                rowViewModel.rowLocked ? 'locked' : 'unlocked',
                rowViewModel.statusText,
                rowViewModel.statusTone,
                rowViewModel.timeText,
                rowViewModel.previewText,
            ].join('\u001e'),
        };
    });
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

    return {
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
    };
}

function buildGenericListRegionHtml(tableName, viewModel) {
    return {
        fullPageHtml: buildGenericListPageHtml({
            tableName,
            ...viewModel,
        }),
        toolbarHtml: buildGenericListToolbarHtml(viewModel),
        toolbarSearchState: {
            showSearch: viewModel.showSearch,
            searchQuery: viewModel.searchQuery,
            totalRowCount: viewModel.totalRowCount,
        },
        toolbarActionsHtml: buildGenericListToolbarActionsHtml(viewModel),
        toolbarInfoHtml: buildGenericListToolbarInfoHtml(viewModel),
        contentHtml: buildGenericListContentHtml(viewModel),
        bottomBarHtml: buildGenericListBottomBarHtml(viewModel),
        viewModel,
    };
}

function buildGenericListRowPatchOptions(viewModel) {
    return {
        showListIndex: viewModel.showListIndex,
        showListStatus: viewModel.showListStatus,
        showListTime: viewModel.showListTime,
        showListArrow: viewModel.showListArrow,
        lockManageMode: viewModel.lockManageMode,
        deleteManageMode: viewModel.deleteManageMode,
        deletingAny: viewModel.deletingAny,
        deletingRowIndex: viewModel.deletingRowIndex,
    };
}

function buildGenericListRowRenderVersion(rowViewModel, rowPatchOptions) {
    return [
        rowViewModel.rowVersion || '',
        rowPatchOptions.showListIndex ? 'idx:1' : 'idx:0',
        rowPatchOptions.showListStatus ? 'status:1' : 'status:0',
        rowPatchOptions.showListTime ? 'time:1' : 'time:0',
        rowPatchOptions.showListArrow ? 'arrow:1' : 'arrow:0',
        rowPatchOptions.lockManageMode ? 'lock:1' : 'lock:0',
        rowPatchOptions.deleteManageMode ? 'delete:1' : 'delete:0',
        rowPatchOptions.deletingAny ? 'deleting:any' : 'deleting:none',
        `deleting:${rowPatchOptions.deletingRowIndex}`,
    ].join('|');
}

function createElementFromHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '').trim();
    const element = template.content.firstElementChild;
    return element instanceof HTMLElement ? element : null;
}

function patchGenericListRowNodes(list, viewModel) {
    if (!(list instanceof HTMLElement)) return false;

    const rowPatchOptions = buildGenericListRowPatchOptions(viewModel);
    const existingByKey = new Map();
    Array.from(list.children).forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        const key = String(node.dataset.rowKey || '').trim();
        if (key) existingByKey.set(key, node);
    });

    const nextKeys = new Set();
    const nextNodes = [];

    for (const rowViewModel of viewModel.filteredRows || []) {
        const rowKey = String(rowViewModel.rowKey || `row:${rowViewModel.rowIndex}`);
        const rowVersion = buildGenericListRowRenderVersion(rowViewModel, rowPatchOptions);
        nextKeys.add(rowKey);

        let rowNode = existingByKey.get(rowKey) || null;
        const shouldCreateReplacement = !(rowNode instanceof HTMLElement) || rowNode.dataset.rowVersion !== rowVersion;

        if (shouldCreateReplacement) {
            const replacement = createElementFromHtml(buildGenericListRowHtml({
                ...rowViewModel,
                rowKey,
                rowVersion,
            }, rowPatchOptions));
            if (!replacement) return false;

            if (rowNode instanceof HTMLElement && rowNode.parentNode === list) {
                rowNode.replaceWith(replacement);
            }
            rowNode = replacement;
            existingByKey.set(rowKey, rowNode);
        }

        nextNodes.push(rowNode);
    }

    for (const [key, node] of existingByKey.entries()) {
        if (!nextKeys.has(key) && node.parentNode === list) {
            node.remove();
        }
    }

    nextNodes.forEach((node, targetIndex) => {
        if (!(node instanceof HTMLElement)) return;
        if (list.children[targetIndex] === node) return;

        const referenceNode = list.children[targetIndex] || null;
        list.insertBefore(node, referenceNode);
    });

    return true;
}

function patchGenericListContentRegion(contentRegion, viewModel, fallbackHtml) {
    if (!(contentRegion instanceof HTMLElement)) return false;
    if (!viewModel || Number(viewModel.visibleCount || 0) <= 0) {
        contentRegion.innerHTML = fallbackHtml;
        return true;
    }

    const listPanel = contentRegion.querySelector('.phone-generic-list-panel');
    const list = contentRegion.querySelector('.phone-generic-slot-list');
    if (!(listPanel instanceof HTMLElement) || !(list instanceof HTMLElement)) {
        contentRegion.innerHTML = fallbackHtml;
        return true;
    }

    return patchGenericListRowNodes(list, viewModel);
}

function resolveGenericListRegionPatchPlan(changedKeys = []) {
    if (!Array.isArray(changedKeys) || changedKeys.length === 0) {
        return {
            preserveToolbarSearch: true,
            updateToolbarActions: true,
            updateToolbarInfo: true,
            updateContent: true,
            updateBottomBar: true,
        };
    }

    const changedKeySet = new Set(changedKeys);
    return {
        preserveToolbarSearch: true,
        updateToolbarActions: changedKeySet.has('listSearchQuery') || changedKeySet.has('listSortDescending'),
        updateToolbarInfo: changedKeySet.has('listSearchQuery') || changedKeySet.has('lockManageMode') || changedKeySet.has('deleteManageMode'),
        updateContent: changedKeySet.has('listSearchQuery')
            || changedKeySet.has('listSortDescending')
            || changedKeySet.has('lockManageMode')
            || changedKeySet.has('deleteManageMode')
            || changedKeySet.has('lockState')
            || changedKeySet.has('deletingRowIndex'),
        updateBottomBar: changedKeySet.has('lockManageMode') || changedKeySet.has('deleteManageMode'),
    };
}

function patchGenericListRegions(container, regionHtml, options = {}) {
    const {
        preserveToolbarSearch = false,
        updateToolbarActions = true,
        updateToolbarInfo = true,
        updateContent = true,
        updateBottomBar = true,
    } = options;
    const root = container.querySelector(GENERIC_LIST_ROOT_SELECTOR);
    const toolbarRegion = container.querySelector(GENERIC_TOOLBAR_REGION_SELECTOR);
    const toolbarActionsRegion = container.querySelector(GENERIC_TOOLBAR_ACTIONS_REGION_SELECTOR);
    const toolbarInfoRegion = container.querySelector(GENERIC_TOOLBAR_INFO_REGION_SELECTOR);
    const contentRegion = container.querySelector(GENERIC_CONTENT_REGION_SELECTOR);
    const bottomBarRegion = container.querySelector(GENERIC_BOTTOM_BAR_REGION_SELECTOR);

    if (!(root instanceof HTMLElement)) return false;
    if (!(toolbarRegion instanceof HTMLElement)) return false;
    if (!(contentRegion instanceof HTMLElement)) return false;
    if (!(bottomBarRegion instanceof HTMLElement)) return false;

    if (preserveToolbarSearch) {
        const searchState = regionHtml.toolbarSearchState || {};
        const preserveSearchNode = searchState.showSearch !== false;
        const existingSearchInput = /** @type {HTMLInputElement | null} */ (toolbarRegion.querySelector('#phone-generic-list-search'));

        if (!preserveSearchNode || !(existingSearchInput instanceof HTMLInputElement)) {
            toolbarRegion.innerHTML = regionHtml.toolbarHtml;
        } else {
            if (!(toolbarActionsRegion instanceof HTMLElement)) return false;
            if (!(toolbarInfoRegion instanceof HTMLElement)) return false;
            const nextSearchValue = String(searchState.searchQuery || '');
            const nextSearchDisabled = Number(searchState.totalRowCount || 0) === 0;
            if (existingSearchInput.value !== nextSearchValue) {
                existingSearchInput.value = nextSearchValue;
            }
            if (existingSearchInput.disabled !== nextSearchDisabled) {
                existingSearchInput.disabled = nextSearchDisabled;
            }
            if (updateToolbarActions) {
                toolbarActionsRegion.innerHTML = regionHtml.toolbarActionsHtml;
            }
            if (updateToolbarInfo) {
                toolbarInfoRegion.innerHTML = regionHtml.toolbarInfoHtml;
            }
        }
    } else {
        toolbarRegion.innerHTML = regionHtml.toolbarHtml;
    }
    if (updateContent) {
        try {
            const contentPatched = patchGenericListContentRegion(contentRegion, regionHtml.viewModel, regionHtml.contentHtml);
            if (!contentPatched) {
                contentRegion.innerHTML = regionHtml.contentHtml;
            }
        } catch (error) {
            logger.warn('列表内容局部刷新失败，已回退到全量内容刷新', error);
            contentRegion.innerHTML = regionHtml.contentHtml;
        }
    }
    if (updateBottomBar) {
        bottomBarRegion.innerHTML = regionHtml.bottomBarHtml;
    }
    return true;
}

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
        refreshListAfterDataMutation,
        captureListScroll,
        navigateBack,
        deleteRowFromList,
        toggleTableRowLock,
        getTableLockState,
        isTableRowLocked,
        insertTableRow,
        getTableData,
        setListRefreshHandler,
        setSuppressExternalTableUpdate,
        viewerRuntime,
    } = options;

    if (!(container instanceof HTMLElement) || !state) return;
    if (typeof getTableLockState !== 'function') return;

    state.syncLockState(getTableLockState(sheetKey));

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
            refreshListAfterDataMutation,
            viewerRuntime,
        });
    };

    const refreshListRegions = (changedKeys = []) => {
        state.syncLockState(getTableLockState(sheetKey));
        const nextViewModel = buildGenericListPageViewModel({
            state,
            rows,
            headers,
            rawHeaders,
            genericMatch,
        });
        const nextRegionHtml = buildGenericListRegionHtml(tableName, nextViewModel);
        const patchPlan = resolveGenericListRegionPatchPlan(changedKeys);
        const patched = patchGenericListRegions(container, nextRegionHtml, patchPlan);

        if (!patched) {
            container.innerHTML = nextRegionHtml.fullPageHtml;
        }

        bindWheelBridge(container);

        bindGenericListPageController({
            container,
            state,
            sheetKey,
            navigateBack,
            captureListScroll,
            render,
            renderKeepScroll,
            refreshListRegions,
            refreshListAfterDataMutation,
            showAddRowModal: openAddRowModal,
            deleteRowFromList,
            toggleTableRowLock,
            getTableLockState,
            isTableRowLocked,
            showInlineToast,
            setSuppressExternalTableUpdate,
            runtime: viewerRuntime,
        });
    };

    if (typeof setListRefreshHandler === 'function') {
        setListRefreshHandler(refreshListRegions);
    }

    const viewModel = buildGenericListPageViewModel({
        state,
        rows,
        headers,
        rawHeaders,
        genericMatch,
    });
    const regionHtml = buildGenericListRegionHtml(tableName, viewModel);
    const canPatchExistingList = !!container.querySelector(GENERIC_LIST_ROOT_SELECTOR);

    if (canPatchExistingList && patchGenericListRegions(container, regionHtml, {
        preserveToolbarSearch: false,
    })) {
        bindWheelBridge(container);
    } else {
        container.innerHTML = regionHtml.fullPageHtml;
        bindWheelBridge(container);
    }

    bindGenericListPageController({
        container,
        state,
        sheetKey,
        navigateBack,
        captureListScroll,
        render,
        renderKeepScroll,
        refreshListRegions,
        refreshListAfterDataMutation,
        showAddRowModal: openAddRowModal,
        deleteRowFromList,
        toggleTableRowLock,
        getTableLockState,
        isTableRowLocked,
        showInlineToast,
        setSuppressExternalTableUpdate,
        runtime: viewerRuntime,
    });
}
