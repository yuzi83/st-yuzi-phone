import { Logger } from '../../error-handler.js';
import {
    DEFAULT_API_TIMEOUT,
    callApiWithTimeout,
    getDB,
} from '../db-bridge.js';

export function getTableData() {
    const api = getDB();
    if (api && typeof api.exportTableAsJson === 'function') {
        try {
            return api.exportTableAsJson();
        } catch (error) {
            Logger.warn('[玉子的手机] getTableData 调用失败:', error);
            return null;
        }
    }
    return null;
}

export async function getTableDataAsync(timeout = DEFAULT_API_TIMEOUT) {
    const api = getDB();
    if (api && typeof api.exportTableAsJson === 'function') {
        return callApiWithTimeout(
            () => api.exportTableAsJson(),
            timeout,
            'getTableDataAsync',
        );
    }
    return null;
}

export async function saveTableData(rawData, timeout = DEFAULT_API_TIMEOUT) {
    const api = getDB();
    if (!api || typeof api.importTableAsJson !== 'function') return false;

    try {
        const jsonString = typeof rawData === 'string' ? rawData : JSON.stringify(rawData);
        const result = await callApiWithTimeout(
            () => api.importTableAsJson(jsonString),
            timeout,
            'saveTableData',
        );
        return result === true || result === 'true' || result !== null;
    } catch (error) {
        Logger.warn('[玉子的手机] importTableAsJson 调用失败:', error);
        return false;
    }
}

export function processTableData(rawData) {
    if (!rawData || typeof rawData !== 'object') return null;
    const tables = {};
    for (const sheetId in rawData) {
        const sheet = rawData[sheetId];
        if (sheet?.name && sheet?.content) {
            tables[sheet.name] = {
                key: sheetId,
                headers: sheet.content[0] || [],
                rows: sheet.content.slice(1),
            };
        }
    }
    return Object.keys(tables).length > 0 ? tables : null;
}

export function getSheetKeys(rawData) {
    if (!rawData || typeof rawData !== 'object') return [];
    const keys = Object.keys(rawData).filter((key) => key.startsWith('sheet_'));
    return keys.sort((a, b) => {
        const aSheet = rawData[a];
        const bSheet = rawData[b];
        const aOrder = Number.isFinite(aSheet?.orderNo) ? aSheet.orderNo : Infinity;
        const bOrder = Number.isFinite(bSheet?.orderNo) ? bSheet.orderNo : Infinity;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return String(aSheet?.name || a).localeCompare(String(bSheet?.name || b));
    });
}

export async function updateTableCell(tableName, rowIndex, colIdentifier, value) {
    const api = getDB();
    if (!api || typeof api.updateCell !== 'function') {
        return { ok: false, code: 'api_unavailable', message: '数据库API不可用' };
    }

    try {
        const result = await api.updateCell(tableName, rowIndex, colIdentifier, value);
        return { ok: !!result, code: result ? 'ok' : 'failed' };
    } catch (error) {
        return { ok: false, code: 'error', message: error?.message || '未知错误' };
    }
}

export async function updateTableRow(tableName, rowIndex, data) {
    const api = getDB();
    if (!api || typeof api.updateRow !== 'function') {
        return { ok: false, code: 'api_unavailable', message: '数据库API不可用' };
    }

    try {
        const result = await api.updateRow(tableName, rowIndex, data);
        return { ok: !!result, code: result ? 'ok' : 'failed' };
    } catch (error) {
        return { ok: false, code: 'error', message: error?.message || '未知错误' };
    }
}

export async function insertTableRow(tableName, data) {
    const api = getDB();
    if (!api || typeof api.insertRow !== 'function') {
        return { ok: false, code: 'api_unavailable', message: '数据库API不可用' };
    }

    try {
        const rowIndex = await api.insertRow(tableName, data);
        return {
            ok: rowIndex >= 0,
            code: rowIndex >= 0 ? 'ok' : 'failed',
            rowIndex: rowIndex >= 0 ? rowIndex : undefined,
        };
    } catch (error) {
        return { ok: false, code: 'error', message: error?.message || '未知错误' };
    }
}

export async function deleteTableRowViaApi(tableName, rowIndex) {
    const api = getDB();
    if (!api || typeof api.deleteRow !== 'function') {
        return { ok: false, code: 'api_unavailable', message: '数据库API不可用' };
    }

    try {
        const result = await api.deleteRow(tableName, rowIndex);
        return { ok: !!result, code: result ? 'ok' : 'failed' };
    } catch (error) {
        return { ok: false, code: 'error', message: error?.message || '未知错误' };
    }
}
