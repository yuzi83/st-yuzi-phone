import { Logger } from '../../error-handler.js';
import { getDB } from '../db-bridge.js';

function normalizeLockState(lockState) {
    if (!lockState || typeof lockState !== 'object') {
        return { rows: [], cols: [], cells: [] };
    }

    const rows = Array.isArray(lockState.rows)
        ? lockState.rows.map((value) => Number(value)).filter(Number.isInteger)
        : [];

    const cols = Array.isArray(lockState.cols)
        ? lockState.cols.map((value) => Number(value)).filter(Number.isInteger)
        : [];

    const cells = Array.isArray(lockState.cells)
        ? lockState.cells.map((value) => {
            if (Array.isArray(value) && value.length >= 2) {
                const row = Number(value[0]);
                const col = Number(value[1]);
                if (Number.isInteger(row) && Number.isInteger(col)) return `${row}:${col}`;
                return null;
            }
            return String(value || '').trim() || null;
        }).filter(Boolean)
        : [];

    return {
        rows: Array.from(new Set(rows)),
        cols: Array.from(new Set(cols)),
        cells: Array.from(new Set(cells)),
    };
}

function isTableColLocked(sheetKey, colIndex) {
    const lockState = getTableLockState(sheetKey);
    if (!lockState) return false;
    return lockState.cols.includes(Number(colIndex));
}

function setTableColLock(sheetKey, colIndex, locked) {
    const api = getDB();
    if (!api) return false;

    try {
        if (typeof api.lockTableCol === 'function') {
            return !!api.lockTableCol(sheetKey, colIndex, locked);
        }

        if (typeof api.getTableLockState === 'function' && typeof api.setTableLockState === 'function') {
            const current = normalizeLockState(api.getTableLockState(sheetKey));
            const nextCols = new Set(current.cols);
            if (locked) {
                nextCols.add(Number(colIndex));
            } else {
                nextCols.delete(Number(colIndex));
            }

            return !!api.setTableLockState(sheetKey, {
                rows: current.rows,
                cols: Array.from(nextCols).filter(Number.isInteger),
                cells: current.cells,
            }, { merge: false });
        }
    } catch (error) {
        Logger.warn('[玉子的手机] lockTableCol/setTableLockState 调用失败:', error);
        return false;
    }

    return false;
}

export function getTableLockState(sheetKey) {
    const api = getDB();
    if (!api || typeof api.getTableLockState !== 'function') {
        return { rows: [], cols: [], cells: [] };
    }

    try {
        const lockState = api.getTableLockState(sheetKey);
        return normalizeLockState(lockState);
    } catch (error) {
        Logger.warn('[玉子的手机] getTableLockState 调用失败:', error);
        return { rows: [], cols: [], cells: [] };
    }
}

export function setTableCellLock(sheetKey, rowIndex, colIndex, locked) {
    const api = getDB();
    if (!api || typeof api.lockTableCell !== 'function') return false;

    try {
        return !!api.lockTableCell(sheetKey, rowIndex, colIndex, locked);
    } catch (error) {
        Logger.warn('[玉子的手机] lockTableCell 调用失败:', error);
        return false;
    }
}

export function setTableRowLock(sheetKey, rowIndex, locked) {
    const api = getDB();
    if (!api) return false;

    try {
        if (typeof api.lockTableRow === 'function') {
            return !!api.lockTableRow(sheetKey, rowIndex, !!locked);
        }

        if (typeof api.getTableLockState === 'function' && typeof api.setTableLockState === 'function') {
            const current = normalizeLockState(api.getTableLockState(sheetKey));
            const nextRows = new Set(current.rows);
            if (locked) {
                nextRows.add(Number(rowIndex));
            } else {
                nextRows.delete(Number(rowIndex));
            }

            return !!api.setTableLockState(sheetKey, {
                rows: Array.from(nextRows).filter(Number.isInteger),
                cols: current.cols,
                cells: current.cells,
            }, { merge: false });
        }
    } catch (error) {
        Logger.warn('[玉子的手机] lockTableRow/setTableLockState 调用失败:', error);
        return false;
    }

    return false;
}

export function isTableRowLocked(sheetKey, rowIndex) {
    const lockState = getTableLockState(sheetKey);
    if (!lockState) return false;
    return lockState.rows.includes(Number(rowIndex));
}

export function isTableCellLocked(sheetKey, rowIndex, colIndex) {
    const lockState = getTableLockState(sheetKey);
    if (!lockState) return false;

    const numericRowIndex = Number(rowIndex);
    const numericColIndex = Number(colIndex);
    const rowLocked = lockState.rows.includes(numericRowIndex);
    const colLocked = lockState.cols.includes(numericColIndex);
    const key = `${numericRowIndex}:${numericColIndex}`;
    const cellLocked = lockState.cells.includes(key);
    return rowLocked || colLocked || cellLocked;
}

export function toggleTableRowLock(sheetKey, rowIndex) {
    const api = getDB();

    if (api && typeof api.toggleTableRowLock === 'function') {
        try {
            const result = api.toggleTableRowLock(sheetKey, rowIndex);
            return typeof result === 'boolean' ? result : isTableRowLocked(sheetKey, rowIndex);
        } catch (error) {
            Logger.warn('[玉子的手机] toggleTableRowLock 调用失败:', error);
        }
    }

    const currentLocked = isTableRowLocked(sheetKey, rowIndex);
    const success = setTableRowLock(sheetKey, rowIndex, !currentLocked);
    return success ? !currentLocked : currentLocked;
}

export function toggleTableCellLock(sheetKey, rowIndex, colIndex) {
    const api = getDB();

    if (api && typeof api.toggleTableCellLock === 'function') {
        try {
            const result = api.toggleTableCellLock(sheetKey, rowIndex, colIndex);
            return typeof result === 'boolean' ? result : isTableCellLocked(sheetKey, rowIndex, colIndex);
        } catch (error) {
            Logger.warn('[玉子的手机] toggleTableCellLock 调用失败:', error);
        }
    }

    const currentLocked = isTableCellLocked(sheetKey, rowIndex, colIndex);
    const success = setTableCellLock(sheetKey, rowIndex, colIndex, !currentLocked);
    return success ? !currentLocked : currentLocked;
}

export function toggleTableColLock(sheetKey, colIndex) {
    const api = getDB();

    if (api && typeof api.toggleTableColLock === 'function') {
        try {
            const result = api.toggleTableColLock(sheetKey, colIndex);
            return typeof result === 'boolean' ? result : isTableColLocked(sheetKey, colIndex);
        } catch (error) {
            Logger.warn('[玉子的手机] toggleTableColLock 调用失败:', error);
        }
    }

    const currentLocked = isTableColLocked(sheetKey, colIndex);
    const success = setTableColLock(sheetKey, colIndex, !currentLocked);
    return success ? !currentLocked : currentLocked;
}
