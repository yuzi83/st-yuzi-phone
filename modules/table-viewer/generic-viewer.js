import {
    getTableData,
    navigateBack,
    saveTableData,
    getTableLockState,
    isTableRowLocked,
    isTableCellLocked,
    toggleTableRowLock,
    toggleTableCellLock,
    insertTableRow,
    setCurrentViewingSheet,
    resetDataVersion,
    getSheetDataByKey,
    deletePhoneSheetRows,
} from '../phone-core.js';
import { createTableViewerState } from './state.js';
import { createTableViewerScrollPreserver } from './scroll-preserver.js';
import { createRowDeleteController } from './row-delete-controller.js';
import { renderGenericListPage } from './list-page-renderer.js';
import { renderGenericDetailPage } from './detail-page-renderer.js';
import { showInlineToast } from './shared-ui.js';


export function renderGenericTableViewer(container, context, hooks = {}) {
    if (!(container instanceof HTMLElement)) return;

    const {
        sheetKey,
        tableName,
        headers,
        rawHeaders,
        rows,
        genericMatch,
    } = context;

    const viewerEventManager = hooks.viewerEventManager;
    const disposeViewerInstance = hooks.disposeViewerInstance;
    const onCleanupObserver = hooks.onCleanupObserver;
    const ADD_ROW_MODAL_ID = String(hooks.addRowModalId || 'phone-add-row-modal');

    const state = createTableViewerState(sheetKey);
    let suppressExternalTableUpdate = false;

    const syncRowsFromSheet = () => {
        const latestSheet = getSheetDataByKey(sheetKey);
        if (!latestSheet?.rows || !Array.isArray(latestSheet.rows)) {
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
    });

    const render = () => {
        if (state.mode === 'detail' && state.rowIndex >= 0) {
            renderGenericDetailPage({
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
            });
            return;
        }

        renderGenericListPage({
            container,
            state,
            sheetKey,
            tableName,
            headers,
            rawHeaders,
            rows,
            genericMatch,
            addRowModalId: ADD_ROW_MODAL_ID,
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
            setSuppressExternalTableUpdate: (next) => {
                suppressExternalTableUpdate = !!next;
            },
        });
    };

    const scrollPreserver = createTableViewerScrollPreserver(container, state);

    const renderKeepScroll = scrollPreserver.createRerenderWithScroll('listScrollTop', render);

    const captureListScroll = () => {
        if (state.mode !== 'list') return;
        scrollPreserver.captureScroll('listScrollTop');
    };

    const restoreListScroll = () => {
        if (state.mode !== 'list') return;
        scrollPreserver.restoreScroll('listScrollTop');
    };

    setCurrentViewingSheet(sheetKey);
    resetDataVersion();

    const handleTableUpdate = (event) => {
        if (event?.detail?.sheetKey !== sheetKey) return;
        if (suppressExternalTableUpdate) return;
        if (!syncRowsFromSheet()) return;
        state.lockState = getTableLockState(sheetKey);
        renderKeepScroll();
    };

    if (viewerEventManager && typeof viewerEventManager.add === 'function') {
        viewerEventManager.add(window, 'yuzi-phone-table-updated', handleTableUpdate);
    }

    const cleanupObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.removedNodes) {
                if (node === container || node.contains?.(container)) {
                    if (typeof disposeViewerInstance === 'function') {
                        disposeViewerInstance();
                    }
                    return;
                }
            }
        }
    });

    cleanupObserver.observe(document.body, { childList: true, subtree: true });
    if (typeof onCleanupObserver === 'function') {
        onCleanupObserver(cleanupObserver);
    }

    render();
}


