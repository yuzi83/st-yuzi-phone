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
import { createTableViewerScrollPreserver } from './scroll-preserver.js';
import { createRowDeleteController } from './row-delete-controller.js';
import { renderGenericListPage } from './list-page-renderer.js';
import { renderGenericDetailPage } from './detail-page-renderer.js';
import { showInlineToast } from './shared-ui.js';

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
    const scrollPreserver = createTableViewerScrollPreserver(container, state);

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
            captureListScroll,
            navigateBack,
            deleteRowFromList,
            toggleTableRowLock,
            getTableLockState,
            isTableRowLocked,
            insertTableRow,
            getTableData,
            setSuppressExternalTableUpdate: (next) => {
                viewerRuntime?.setSuppressExternalTableUpdate(next);
            },
        });
    };

    const renderKeepScroll = scrollPreserver.createRerenderWithScroll('listScrollTop', render);

    const handleTableUpdate = () => {
        if (!syncRowsFromSheet()) return;
        state.lockState = getTableLockState(sheetKey);
        renderKeepScroll();
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
        renderKeepScroll,
        captureListScroll,
        restoreListScroll,
    };
}
