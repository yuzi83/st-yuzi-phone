import { Logger } from '../error-handler.js';
import {
    getTableData,
    saveTableData,
    getTableLockState,
    isTableRowLocked,
    isTableCellLocked,
    toggleTableRowLock,
    toggleTableCellLock,
    insertTableRow,
} from '../phone-core/data-api.js';
import { navigateBack } from '../phone-core/routing.js';
import {
    getSheetDataByKey,
    deletePhoneSheetRows,
} from '../phone-core/chat-support.js';
import { createTableViewerState } from './state.js';
import { createTableViewerScrollPreserver } from './list-scroll-binding.js';
import { createRowDeleteController } from './row-delete-controller.js';
import { renderGenericListPage } from './list-page-renderer.js';
import { renderGenericDetailPage } from './detail-page-renderer.js';
import { showInlineToast } from './shared-ui.js';

const logger = Logger.withScope({ scope: 'table-viewer/generic-runtime', feature: 'table-viewer' });

export function createGenericTableViewerRuntime(container, context, hooks = {}) {
    if (!(container instanceof HTMLElement)) {
        return null;
    }

    const {
        sheetKey,
        tableName,
        headers,
        rawHeaders,
        rows,
        genericMatch,
    } = context;

    const viewerRuntime = hooks.viewerRuntime;
    const renderListPage = hooks.renderListPage || renderGenericListPage;
    const renderDetailPage = hooks.renderDetailPage || renderGenericDetailPage;
    const addRowModalId = String(viewerRuntime?.addRowModalId || hooks.addRowModalId || 'phone-add-row-modal');
    const state = createTableViewerState(sheetKey);
    const scrollPreserver = createTableViewerScrollPreserver(container, state, undefined, viewerRuntime);
    let activeListRefreshHandler = null;
    let isDispatchingListStateRefresh = false;
    const LIST_STATE_REFRESH_KEYS = new Set([
        'listSearchQuery',
        'listSortDescending',
        'lockManageMode',
        'deleteManageMode',
        'lockState',
        'deletingRowIndex',
    ]);

    const setListRefreshHandler = (handler) => {
        activeListRefreshHandler = typeof handler === 'function' ? handler : null;
    };

    const dispatchSubscribedListRefresh = (changedKeys = []) => {
        if (isDispatchingListStateRefresh) return;
        if (typeof activeListRefreshHandler !== 'function') return;

        isDispatchingListStateRefresh = true;
        try {
            activeListRefreshHandler(Array.isArray(changedKeys) ? changedKeys : []);
        } finally {
            isDispatchingListStateRefresh = false;
        }
    };

    state.subscribe((changedKeys = []) => {
        if (state.mode !== 'list') return;
        if (!Array.isArray(changedKeys)) return;
        if (!changedKeys.some((key) => LIST_STATE_REFRESH_KEYS.has(key))) return;
        dispatchSubscribedListRefresh(changedKeys);
    });

    const syncRowsFromSheet = () => {
        const latestSheet = getSheetDataByKey(sheetKey);
        if (!latestSheet?.rows || !Array.isArray(latestSheet.rows)) {
            logger.warn({
                action: 'rows.sync.failed',
                message: '通用表 rows 同步失败：最新 sheet 无有效 rows',
                context: {
                    sheetKey: String(sheetKey || ''),
                    tableName: String(tableName || ''),
                    latestFound: !!latestSheet,
                },
            });
            return false;
        }

        rows.length = 0;
        rows.push(...latestSheet.rows.map((row) => (Array.isArray(row) ? [...row] : row)));
        return true;
    };

    const getLiveTableName = () => {
        const latestSheet = getSheetDataByKey(sheetKey);
        return String(latestSheet?.tableName || tableName || sheetKey || '').trim();
    };

    const { deleteRowFromList } = createRowDeleteController({
        sheetKey,
        rows,
        state,
        container,
        getSheetDataByKey,
        getLiveTableName,
        syncRowsFromSheet,
        isTableRowLocked,
        deletePhoneSheetRows,
        showInlineToast,
        viewerRuntime,
    });

    const captureListScroll = () => {
        if (state.mode !== 'list') return;
        scrollPreserver.captureScroll('listScrollTop');
    };

    const restoreListScroll = () => {
        if (state.mode !== 'list') return;
        scrollPreserver.restoreScroll('listScrollTop');
    };

    const render = () => {
        if (state.mode === 'detail' && state.rowIndex >= 0) {
            renderDetailPage({
                container,
                state,
                sheetKey,
                headers,
                rawHeaders,
                rows,
                genericMatch,
                render,
                restoreListScroll,
                renderKeepScroll,
                getTableLockState,
                isTableRowLocked,
                isTableCellLocked,
                toggleTableCellLock,
                getTableData,
                saveTableData,
                viewerRuntime,
            });
            return;
        }

        renderListPage({
            container,
            state,
            sheetKey,
            tableName,
            headers,
            rawHeaders,
            rows,
            genericMatch,
            addRowModalId,
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
            viewerRuntime,
            setSuppressExternalTableUpdate: (next) => {
                viewerRuntime?.setSuppressExternalTableUpdate(next);
            },
        });
    };

    const renderKeepScroll = scrollPreserver.createRerenderWithScroll('listScrollTop', render);

    const refreshListAfterDataMutation = () => {
        if (state.mode === 'list' && typeof activeListRefreshHandler === 'function') {
            activeListRefreshHandler([]);
            return;
        }
        renderKeepScroll();
    };

    const handleTableUpdate = () => {
        if (!syncRowsFromSheet()) return;
        state.syncLockState(getTableLockState(sheetKey));
        refreshListAfterDataMutation();
    };

    const bind = () => {
        if (viewerRuntime && typeof viewerRuntime.bindExternalTableUpdate === 'function') {
            viewerRuntime.bindExternalTableUpdate(handleTableUpdate);
        }
    };

    const start = () => {
        bind();
        render();
        return true;
    };

    return {
        state,
        viewerRuntime,
        render,
        bind,
        start,
        handleTableUpdate,
        refreshListAfterDataMutation,
        renderKeepScroll,
        captureListScroll,
        restoreListScroll,
    };
}
