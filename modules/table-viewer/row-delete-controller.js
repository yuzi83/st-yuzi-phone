import { remapTableLockStateAfterRowsDelete } from '../phone-core/data-api.js';

function normalizeRowIndexes(rowIndexes = []) {
    return Array.from(new Set((Array.isArray(rowIndexes) ? rowIndexes : [rowIndexes])
        .map((value) => Number(value))
        .filter(Number.isInteger)
        .filter((value) => value >= 0)))
        .sort((a, b) => b - a);
}

function remapRemainingRowIndexes(rowIndexes = [], deletedRowIndexes = []) {
    const deletedSorted = normalizeRowIndexes(deletedRowIndexes).sort((a, b) => a - b);
    return normalizeRowIndexes(rowIndexes)
        .map((rowIndex) => rowIndex - deletedSorted.filter((deletedIndex) => deletedIndex < rowIndex).length)
        .filter((rowIndex) => rowIndex >= 0)
        .sort((a, b) => a - b);
}

function applyLockStateAfterRowsDelete(sheetKey, deletedRowIndexes = []) {
    remapTableLockStateAfterRowsDelete(sheetKey, deletedRowIndexes);
}

function isRuntimeDisposed(runtime) {
    return !!(runtime && typeof runtime.isDisposed === 'function' && runtime.isDisposed());
}

function isRuntimeActive(runtime) {
    return !isRuntimeDisposed(runtime);
}

function createDeleteOutcome({
    ok = false,
    deleted = false,
    message = '',
    refreshed = null,
    viewSynced = null,
    deletedCount = 0,
    requestedRowIndexes = [],
    deletedRowIndexes = [],
    failedRowIndexes = [],
    attemptedRowIndexes = [],
    unattemptedRowIndexes = [],
    notDeletedRowIndexes = [],
    failedViewRowIndexes = [],
    unattemptedViewRowIndexes = [],
    notDeletedViewRowIndexes = [],
} = {}) {
    return {
        ok,
        deleted,
        message,
        refreshed,
        viewSynced,
        deletedCount,
        requestedRowIndexes,
        deletedRowIndexes,
        failedRowIndexes,
        attemptedRowIndexes,
        unattemptedRowIndexes,
        notDeletedRowIndexes,
        failedViewRowIndexes,
        unattemptedViewRowIndexes,
        notDeletedViewRowIndexes,
    };
}

function createDeletePreflightFailureOutcome(message, requestedRowIndexes = []) {
    return createDeleteOutcome({
        message,
        requestedRowIndexes,
        failedRowIndexes: [],
        unattemptedRowIndexes: requestedRowIndexes,
        notDeletedRowIndexes: requestedRowIndexes,
        failedViewRowIndexes: [],
        unattemptedViewRowIndexes: requestedRowIndexes,
        notDeletedViewRowIndexes: requestedRowIndexes,
    });
}

export function createRowDeleteController(options) {
    const {
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
    } = options;

    const isViewerActive = () => isRuntimeActive(viewerRuntime);

    const deleteRowsFromList = async (rowIndexes = []) => {
        const requestedRowIndexes = normalizeRowIndexes(rowIndexes);
        if (requestedRowIndexes.length === 0) {
            const message = '未选择可删除的条目';
            showInlineToast(container, message, true);
            return createDeleteOutcome({ message });
        }

        const latestSheet = getSheetDataByKey(sheetKey);
        if (!latestSheet?.rows || !Array.isArray(latestSheet.rows)) {
            const message = '删除失败：表格不存在';
            showInlineToast(container, message, true);
            return createDeletePreflightFailureOutcome(message, requestedRowIndexes);
        }

        const invalidRowIndexes = requestedRowIndexes.filter((rowIndex) => !Array.isArray(latestSheet.rows[rowIndex]));
        if (invalidRowIndexes.length > 0) {
            const message = '删除失败：行不存在';
            showInlineToast(container, message, true);
            return createDeletePreflightFailureOutcome(message, requestedRowIndexes);
        }

        const lockedRowIndexes = requestedRowIndexes.filter((rowIndex) => isTableRowLocked(sheetKey, rowIndex));
        if (lockedRowIndexes.length > 0) {
            const message = lockedRowIndexes.length === 1 ? '删除失败：条目已锁定' : `删除失败：${lockedRowIndexes.length} 条已锁定`;
            showInlineToast(container, message, true);
            return createDeletePreflightFailureOutcome(message, requestedRowIndexes);
        }

        const liveTableName = getLiveTableName();
        if (!liveTableName) {
            const message = '删除失败：缺少表格名称';
            showInlineToast(container, message, true);
            return createDeletePreflightFailureOutcome(message, requestedRowIndexes);
        }

        const result = await deletePhoneSheetRows(sheetKey, requestedRowIndexes, {
            tableName: liveTableName,
        });
        const deletedRowIndexes = normalizeRowIndexes(result.deletedRowIndexes || []);
        const failedRowIndexes = normalizeRowIndexes(result.failedRowIndexes || []);
        const fallbackNotDeletedRowIndexes = requestedRowIndexes.filter((rowIndex) => !deletedRowIndexes.includes(rowIndex));
        const notDeletedRowIndexes = normalizeRowIndexes(result.notDeletedRowIndexes || fallbackNotDeletedRowIndexes);
        const attemptedRowIndexes = normalizeRowIndexes(result.attemptedRowIndexes || [...deletedRowIndexes, ...failedRowIndexes]);
        const unattemptedRowIndexes = normalizeRowIndexes(result.unattemptedRowIndexes || notDeletedRowIndexes.filter((rowIndex) => !failedRowIndexes.includes(rowIndex)));
        const hasDeletion = deletedRowIndexes.length > 0;
        const failedViewRowIndexes = remapRemainingRowIndexes(failedRowIndexes, deletedRowIndexes);
        const unattemptedViewRowIndexes = remapRemainingRowIndexes(unattemptedRowIndexes, deletedRowIndexes);
        const notDeletedViewRowIndexes = remapRemainingRowIndexes(notDeletedRowIndexes, deletedRowIndexes);

        if (!result.ok && !hasDeletion) {
            const message = result.message || '删除失败';
            if (isViewerActive()) {
                syncRowsFromSheet();
                showInlineToast(container, message, true);
            }
            return createDeleteOutcome({
                message,
                refreshed: result.refreshed ?? null,
                deletedCount: result.deletedCount || 0,
                requestedRowIndexes,
                deletedRowIndexes,
                failedRowIndexes,
                attemptedRowIndexes,
                unattemptedRowIndexes,
                notDeletedRowIndexes,
                failedViewRowIndexes: failedRowIndexes,
                unattemptedViewRowIndexes: unattemptedRowIndexes,
                notDeletedViewRowIndexes: notDeletedRowIndexes,
            });
        }

        if (hasDeletion) {
            applyLockStateAfterRowsDelete(sheetKey, deletedRowIndexes);
        }
        if (!isViewerActive()) {
            return createDeleteOutcome({
                ok: !!result.ok,
                deleted: hasDeletion,
                message: result.message || (result.ok ? '删除成功' : '删除已部分完成'),
                refreshed: result.refreshed ?? null,
                viewSynced: null,
                deletedCount: result.deletedCount || deletedRowIndexes.length,
                requestedRowIndexes,
                deletedRowIndexes,
                failedRowIndexes,
                attemptedRowIndexes,
                unattemptedRowIndexes,
                notDeletedRowIndexes,
                failedViewRowIndexes,
                unattemptedViewRowIndexes,
                notDeletedViewRowIndexes,
            });
        }

        const synced = syncRowsFromSheet();
        const message = result.message || (deletedRowIndexes.length > 1 ? `已删除 ${deletedRowIndexes.length} 条记录` : '删除成功');

        if (!synced) {
            return createDeleteOutcome({
                ok: !!result.ok || hasDeletion,
                deleted: hasDeletion,
                message: `${message}，但当前视图未同步到最新表格`,
                refreshed: result.refreshed ?? null,
                viewSynced: false,
                deletedCount: result.deletedCount || deletedRowIndexes.length,
                requestedRowIndexes,
                deletedRowIndexes,
                failedRowIndexes,
                attemptedRowIndexes,
                unattemptedRowIndexes,
                notDeletedRowIndexes,
                failedViewRowIndexes,
                unattemptedViewRowIndexes,
                notDeletedViewRowIndexes,
            });
        }

        if (rows.length === 0) {
            state.batchUpdate({
                rowIndex: -1,
                selectedDeleteRowIndexes: [],
            });
        } else if (notDeletedViewRowIndexes.length > 0) {
            state.setSelectedDeleteRowIndexes(notDeletedViewRowIndexes);
        } else {
            state.clearDeleteSelection();
        }

        return createDeleteOutcome({
            ok: !!result.ok,
            deleted: hasDeletion,
            message,
            refreshed: result.refreshed ?? null,
            viewSynced: true,
            deletedCount: result.deletedCount || deletedRowIndexes.length,
            requestedRowIndexes,
            deletedRowIndexes,
            failedRowIndexes,
            attemptedRowIndexes,
            unattemptedRowIndexes,
            notDeletedRowIndexes,
            failedViewRowIndexes,
            unattemptedViewRowIndexes,
            notDeletedViewRowIndexes,
        });
    };

    return {
        deleteRowsFromList,
    };
}
