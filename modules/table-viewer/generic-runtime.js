import { Logger } from '../error-handler.js';
import {
    getTableData,
    getTableLockState,
    isTableRowLocked,
    isTableCellLocked,
    toggleTableRowLock,
    toggleTableCellLock,
    insertTableRow,
    updateTableRow,
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
import { createDdlFieldMetadata } from './ddl-field-metadata.js';
import { showInlineToast } from './shared-ui.js';

const logger = Logger.withScope({ scope: 'table-viewer/generic-runtime', feature: 'table-viewer' });

function summarizeMutationPayload(data = {}) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return {};
    }

    return Object.fromEntries(
        Object.entries(data)
            .slice(0, 8)
            .map(([key, value]) => {
                const text = String(value ?? '');
                return [String(key), text.length > 120 ? `${text.slice(0, 120)}…` : text];
            })
    );
}

function summarizeDdlLine(line = '') {
    const text = String(line || '').trim();
    return text.length > 180 ? `${text.slice(0, 180)}…` : text;
}

function collectRelevantDdlLines(ddl = '', fieldNames = []) {
    const lines = String(ddl || '').split(/\r?\n/);
    const safeFieldNames = Array.from(new Set((Array.isArray(fieldNames) ? fieldNames : [])
        .map((fieldName) => String(fieldName || '').trim())
        .filter(Boolean)));

    return lines
        .map((line, index) => ({ lineNumber: index + 1, text: summarizeDdlLine(line) }))
        .filter((entry) => {
            if (!entry.text) return false;
            if (/CHECK\s*\(/i.test(entry.text)) return true;
            if (safeFieldNames.length <= 0) return false;
            return safeFieldNames.some((fieldName) => entry.text.includes(`-- ${fieldName}`) || entry.text.includes(fieldName));
        })
        .slice(0, 12);
}

function buildSheetMutationDiagnostics(rawData, fallbackSheet, sheetKey, tableName, payload = {}, extra = {}) {
    const safeSheetKey = String(sheetKey || '').trim();
    const sheetFromSnapshot = rawData && typeof rawData === 'object' && safeSheetKey ? rawData[safeSheetKey] : null;
    const sheet = sheetFromSnapshot || fallbackSheet || null;
    const content = Array.isArray(sheet?.content) ? sheet.content : null;
    const sourceData = sheet && typeof sheet.sourceData === 'object' ? sheet.sourceData : null;
    const ddl = String(sourceData?.ddl || '');
    const payloadKeys = Object.keys(payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {});

    return {
        sheetKey: safeSheetKey,
        tableName: String(sheet?.name || tableName || '').trim(),
        sheetFound: !!sheet,
        contentLength: content ? content.length : null,
        rowCount: content ? Math.max(0, content.length - 1) : null,
        payloadKeys,
        payloadPreview: summarizeMutationPayload(payload),
        ddl: {
            exists: ddl.trim().length > 0,
            length: ddl.length,
            relevantLines: collectRelevantDdlLines(ddl, payloadKeys),
        },
        ...extra,
    };
}

export function createGenericTableViewerRuntime(container, context, hooks = {}) {
    if (!(container instanceof HTMLElement)) {
        return null;
    }

    const {
        sheet,
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
    const ddlFieldMetadata = createDdlFieldMetadata({
        ddl: sheet?.sourceData?.ddl || '',
        headers,
        rawHeaders,
    });
    const state = createTableViewerState(sheetKey);
    if (hooks.forceListMode === true || hooks.initialMode === 'list') {
        state.returnToListMode();
    }
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
        'selectedDeleteRowIndexes',
        'deletingSelection',
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

    const hasDirtyDetailDraft = () => {
        const draftValues = state?.draftValues;
        return state?.mode === 'detail'
            && state?.editMode === true
            && draftValues
            && typeof draftValues === 'object'
            && !Array.isArray(draftValues)
            && Object.keys(draftValues).length > 0;
    };

    const getDraftKeys = () => Object.keys(state?.draftValues && typeof state.draftValues === 'object' ? state.draftValues : {});

    const getLiveTableName = () => {
        const latestSheet = getSheetDataByKey(sheetKey);
        return String(latestSheet?.tableName || tableName || sheetKey || '').trim();
    };

    const buildMutationDiagnostics = (payload = {}, extra = {}) => buildSheetMutationDiagnostics(
        getTableData(),
        sheet,
        sheetKey,
        getLiveTableName() || tableName,
        payload,
        extra,
    );

    const { deleteRowsFromList } = createRowDeleteController({
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
                ddlFieldMetadata,
                render,
                restoreListScroll,
                renderKeepScroll,
                getTableLockState,
                isTableRowLocked,
                isTableCellLocked,
                toggleTableCellLock,
                getLiveTableName,
                updateTableRow,
                buildMutationDiagnostics,
                viewerRuntime,
                syncRowsFromSheet,
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
            ddlFieldMetadata,
            addRowModalId,
            render,
            renderKeepScroll,
            refreshListAfterDataMutation,
            captureListScroll,
            navigateBack,
            deleteRowsFromList,
            toggleTableRowLock,
            getTableLockState,
            isTableRowLocked,
            insertTableRow,
            getTableData,
            buildMutationDiagnostics,
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

    const handleTableUpdate = (event) => {
        if (hasDirtyDetailDraft()) {
            state.setPendingExternalTableUpdate({
                reason: 'dirty_detail_draft',
                sheetKey: String(sheetKey || ''),
                tableName: String(getLiveTableName() || ''),
                rowIndex: Number(state.rowIndex),
                draftKeys: getDraftKeys(),
                eventType: String(event?.type || 'yuzi-phone-table-updated'),
                receivedAt: Date.now(),
            });
            showInlineToast(container, '表格已有外部更新，当前草稿保存或退出编辑后再刷新', true);
            return;
        }

        if (!syncRowsFromSheet()) return;
        state.batchUpdate({
            lockState: getTableLockState(sheetKey),
            selectedDeleteRowIndexes: [],
            deletingSelection: false,
            pendingExternalTableUpdate: null,
        });
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
