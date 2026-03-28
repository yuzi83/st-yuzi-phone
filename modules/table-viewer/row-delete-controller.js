import { Logger } from '../error-handler.js';

function getRuntimeApi() {
    const w = window.parent || window;
    return (/** @type {any} */ (w)).AutoCardUpdaterAPI || (/** @type {any} */ (window)).AutoCardUpdaterAPI || null;
}

function normalizeLockStateForRemap(lockState) {
    if (!lockState || typeof lockState !== 'object') {
        return { rows: [], cols: [], cells: [] };
    }

    const rowsList = Array.isArray(lockState.rows)
        ? lockState.rows.map(v => Number(v)).filter(Number.isInteger)
        : [];

    const colsList = Array.isArray(lockState.cols)
        ? lockState.cols.map(v => Number(v)).filter(Number.isInteger)
        : [];

    const cellsList = Array.isArray(lockState.cells)
        ? lockState.cells.map((entry) => {
            if (Array.isArray(entry) && entry.length >= 2) {
                const r = Number(entry[0]);
                const c = Number(entry[1]);
                if (Number.isInteger(r) && Number.isInteger(c)) return `${r}:${c}`;
                return null;
            }

            const text = String(entry || '').trim();
            const parts = text.split(':');
            if (parts.length < 2) return null;
            const r = Number(parts[0]);
            const c = Number(parts[1]);
            if (!Number.isInteger(r) || !Number.isInteger(c)) return null;
            return `${r}:${c}`;
        }).filter(Boolean)
        : [];

    return {
        rows: Array.from(new Set(rowsList)),
        cols: Array.from(new Set(colsList)),
        cells: Array.from(new Set(cellsList)),
    };
}

function remapLockStateAfterRowDelete(lockState, deletedRowIndex) {
    const idx = Number(deletedRowIndex);
    if (!Number.isInteger(idx) || idx < 0) {
        return normalizeLockStateForRemap(lockState);
    }

    const current = normalizeLockStateForRemap(lockState);

    const rowsNext = current.rows
        .filter(rowIdx => rowIdx !== idx)
        .map(rowIdx => (rowIdx > idx ? rowIdx - 1 : rowIdx));

    const cellsNext = current.cells
        .map((key) => {
            const [rowPart, colPart] = String(key).split(':');
            const rowIdx = Number(rowPart);
            const colIdx = Number(colPart);
            if (!Number.isInteger(rowIdx) || !Number.isInteger(colIdx)) return null;
            if (rowIdx === idx) return null;
            const nextRowIdx = rowIdx > idx ? rowIdx - 1 : rowIdx;
            return `${nextRowIdx}:${colIdx}`;
        })
        .filter(Boolean);

    return {
        rows: Array.from(new Set(rowsNext)),
        cols: current.cols,
        cells: Array.from(new Set(cellsNext)),
    };
}

function applyLockStateAfterRowDelete(sheetKey, deletedRowIndex) {
    const api = getRuntimeApi();
    if (!api || typeof api.getTableLockState !== 'function' || typeof api.setTableLockState !== 'function') {
        return;
    }

    try {
        const current = api.getTableLockState(sheetKey);
        const next = remapLockStateAfterRowDelete(current, deletedRowIndex);
        api.setTableLockState(sheetKey, next, { merge: false });
    } catch (error) {
        Logger.warn('[玉子的手机] 删除后重排锁状态失败:', error);
    }
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
    } = options;

    const deleteRowFromList = async (rowIndex) => {
        const latestSheet = getSheetDataByKey(sheetKey);
        if (!latestSheet?.rows || !Array.isArray(latestSheet.rows)) {
            showInlineToast(container, '删除失败：表格不存在');
            return false;
        }

        if (!Array.isArray(latestSheet.rows[rowIndex])) {
            showInlineToast(container, '删除失败：行不存在');
            return false;
        }

        if (isTableRowLocked(sheetKey, rowIndex)) {
            showInlineToast(container, '删除失败：条目已锁定');
            return false;
        }

        const liveTableName = getLiveTableName();
        if (!liveTableName) {
            showInlineToast(container, '删除失败：缺少表格名称');
            return false;
        }

        const result = await deletePhoneSheetRows(sheetKey, [rowIndex], {
            tableName: liveTableName,
        });
        if (!result.ok) {
            syncRowsFromSheet();
            showInlineToast(container, result.message || '删除失败');
            return false;
        }

        const synced = syncRowsFromSheet();
        applyLockStateAfterRowDelete(sheetKey, rowIndex);

        if (!synced) {
            showInlineToast(container, `${result.message || '删除成功'}，但当前视图未同步到最新表格`);
            return false;
        }

        if (rows.length === 0) {
            state.mode = 'list';
            state.rowIndex = -1;
            state.editMode = false;
            state.draftValues = {};
            state.lockManageMode = false;
            state.deleteManageMode = false;
        } else if (state.rowIndex >= 0) {
            if (state.rowIndex === rowIndex) {
                state.rowIndex = Math.min(state.rowIndex, rows.length - 1);
            } else if (state.rowIndex > rowIndex) {
                state.rowIndex -= 1;
            }
        }

        return true;
    };

    return {
        deleteRowFromList,
    };
}
