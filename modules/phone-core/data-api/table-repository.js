import { Logger } from '../../error-handler.js';
import {
    DEFAULT_API_TIMEOUT,
    callApiWithTimeout,
    getDB,
    isDbBooleanSuccess,
    normalizeDbInsertedRowIndex,
    sleep,
} from '../db-bridge.js';
import { enqueueTableMutation } from './mutation-queue.js';

const logger = Logger.withScope({ scope: 'phone-core/data-api/table-repository', feature: 'db-api' });

function summarizeTablePayload(data = {}) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return {};
    }

    return Object.fromEntries(
        Object.entries(data)
            .slice(0, 6)
            .map(([key, value]) => {
                const text = String(value ?? '');
                return [String(key), text.length > 120 ? `${text.slice(0, 120)}…` : text];
            })
    );
}

function getTableSnapshotSummary(rawData, tableName) {
    const safeTableName = String(tableName || '').trim();
    if (!safeTableName || !rawData || typeof rawData !== 'object') {
        return {
            found: false,
            sheetKey: '',
            rowCount: null,
            contentLength: null,
        };
    }

    const matchedEntry = Object.entries(rawData).find(([, sheet]) => String(sheet?.name || '').trim() === safeTableName);
    if (!matchedEntry) {
        return {
            found: false,
            sheetKey: '',
            rowCount: null,
            contentLength: null,
        };
    }

    const [sheetKey, sheet] = matchedEntry;
    const content = Array.isArray(sheet?.content) ? sheet.content : null;
    return {
        found: true,
        sheetKey,
        rowCount: content ? Math.max(0, content.length - 1) : null,
        contentLength: content ? content.length : null,
    };
}

function readTableSnapshotSummaryFromApi(api, tableName, action = 'table-data.snapshot-read') {
    if (!api || typeof api.exportTableAsJson !== 'function') {
        return null;
    }

    try {
        return getTableSnapshotSummary(api.exportTableAsJson(), tableName);
    } catch (snapshotError) {
        logger.warn({
            action,
            message: '读取表格快照失败',
            context: { tableName },
            error: snapshotError,
        });
        return null;
    }
}

async function verifyInsertedRowBySnapshot(api, tableName, beforeSnapshotSummary, initialSnapshotSummary = null) {
    const beforeRowCount = Number.isInteger(beforeSnapshotSummary?.rowCount)
        ? beforeSnapshotSummary.rowCount
        : null;
    let snapshotSummary = initialSnapshotSummary;

    if (beforeRowCount === null) {
        return {
            snapshotVerifiedInsert: false,
            snapshotSummary,
        };
    }

    const hasRowGrowth = (summary) => Number.isInteger(summary?.rowCount) && summary.rowCount > beforeRowCount;
    if (hasRowGrowth(snapshotSummary)) {
        return {
            snapshotVerifiedInsert: true,
            snapshotSummary,
        };
    }

    for (const waitMs of [120, 320, 680]) {
        await sleep(waitMs);
        snapshotSummary = readTableSnapshotSummaryFromApi(api, tableName, 'insert-row.snapshot-retry-error');

        if (hasRowGrowth(snapshotSummary)) {
            return {
                snapshotVerifiedInsert: true,
                snapshotSummary,
            };
        }
    }

    return {
        snapshotVerifiedInsert: false,
        snapshotSummary,
    };
}

async function persistInsertedTableSnapshot(api, tableName) {
    if (!api || typeof api.exportTableAsJson !== 'function' || typeof api.importTableAsJson !== 'function') {
        return {
            persisted: false,
            refreshed: false,
            snapshotSummary: readTableSnapshotSummaryFromApi(api, tableName, 'insert-row.snapshot-persist-read-error'),
        };
    }

    let rawData = null;
    try {
        rawData = api.exportTableAsJson();
    } catch (error) {
        logger.warn({
            action: 'insert-row.persist-export-error',
            message: '插入后导出完整快照失败',
            context: { tableName },
            error,
        });
        return {
            persisted: false,
            refreshed: false,
            snapshotSummary: null,
        };
    }

    let persisted = false;
    try {
        const jsonString = JSON.stringify(rawData);
        const persistResult = await callApiWithTimeout(
            () => api.importTableAsJson(jsonString),
            DEFAULT_API_TIMEOUT,
            'insertTableRow.persistSnapshot',
        );
        persisted = isDbBooleanSuccess(persistResult);
    } catch (error) {
        logger.warn({
            action: 'insert-row.persist-import-error',
            message: '插入后回写完整快照失败',
            context: { tableName },
            error,
        });
    }

    let refreshed = false;
    if (persisted && typeof api.refreshDataAndWorldbook === 'function') {
        refreshed = !!(await callApiWithTimeout(
            () => api.refreshDataAndWorldbook(),
            12000,
            'insertTableRow.refreshProjection',
        ));
    }

    const snapshotSummary = readTableSnapshotSummaryFromApi(api, tableName, 'insert-row.snapshot-persist-read-error');

    return {
        persisted,
        refreshed,
        snapshotSummary,
    };
}

function cloneRawTableData(rawData) {
    if (!rawData || typeof rawData !== 'object') return null;

    try {
        return JSON.parse(JSON.stringify(rawData));
    } catch (error) {
        logger.warn({
            action: 'table-data.clone',
            message: '表格快照深拷贝失败',
            error,
        });
        return null;
    }
}

function findSheetEntryByTableName(rawData, tableName) {
    const safeTableName = String(tableName || '').trim();
    if (!safeTableName || !rawData || typeof rawData !== 'object') {
        return null;
    }

    return Object.entries(rawData).find(([, sheet]) => String(sheet?.name || '').trim() === safeTableName) || null;
}

async function fallbackPersistUpdatedRow(api, tableName, rowIndex, data) {
    if (!api || typeof api.exportTableAsJson !== 'function' || typeof api.importTableAsJson !== 'function') {
        return {
            persisted: false,
            refreshed: false,
            snapshotSummary: readTableSnapshotSummaryFromApi(api, tableName, 'update-row.fallback-read-error'),
            fallbackUsed: false,
        };
    }

    const rawData = cloneRawTableData(api.exportTableAsJson());
    const matchedEntry = findSheetEntryByTableName(rawData, tableName);
    if (!matchedEntry) {
        logger.warn({
            action: 'update-row.fallback-sheet-missing',
            message: 'updateRow fallback 未找到目标表',
            context: { tableName, rowIndex },
        });
        return {
            persisted: false,
            refreshed: false,
            snapshotSummary: readTableSnapshotSummaryFromApi(api, tableName, 'update-row.fallback-read-error'),
            fallbackUsed: false,
        };
    }

    const [, sheet] = matchedEntry;
    const content = Array.isArray(sheet?.content) ? sheet.content : null;
    const headerRow = Array.isArray(content?.[0]) ? content[0] : [];
    const targetRow = Array.isArray(content?.[rowIndex]) ? [...content[rowIndex]] : null;
    if (!content || !targetRow) {
        logger.warn({
            action: 'update-row.fallback-row-missing',
            message: 'updateRow fallback 未找到目标行',
            context: { tableName, rowIndex },
        });
        return {
            persisted: false,
            refreshed: false,
            snapshotSummary: readTableSnapshotSummaryFromApi(api, tableName, 'update-row.fallback-read-error'),
            fallbackUsed: false,
        };
    }

    Object.entries(data && typeof data === 'object' && !Array.isArray(data) ? data : {}).forEach(([key, value]) => {
        const colIndex = headerRow.findIndex((header) => String(header || '').trim() === String(key || '').trim());
        if (colIndex < 0) return;
        targetRow[colIndex] = value === undefined || value === null ? '' : value;
    });
    content[rowIndex] = targetRow;

    const jsonString = JSON.stringify(rawData);
    const persistResult = await callApiWithTimeout(
        () => api.importTableAsJson(jsonString),
        DEFAULT_API_TIMEOUT,
        'updateTableRow.fallbackSave',
    );
    const persisted = isDbBooleanSuccess(persistResult);
    let refreshed = false;

    if (persisted && typeof api.refreshDataAndWorldbook === 'function') {
        refreshed = !!(await callApiWithTimeout(
            () => api.refreshDataAndWorldbook(),
            12000,
            'updateTableRow.fallbackRefresh',
        ));
    }

    const snapshotSummary = readTableSnapshotSummaryFromApi(api, tableName, 'update-row.fallback-read-error');

    return {
        persisted,
        refreshed,
        snapshotSummary,
        fallbackUsed: true,
    };
}

function isRowIdHeader(header) {
    return /^row[\s_-]*id$/i.test(String(header ?? '').trim());
}

function resolveNextRowId(content, rowIdColIndex) {
    if (!Array.isArray(content) || rowIdColIndex < 0) return '';
    const maxRowId = content.slice(1).reduce((max, row) => {
        if (!Array.isArray(row)) return max;
        const numeric = Number(row[rowIdColIndex]);
        return Number.isFinite(numeric) && numeric > max ? numeric : max;
    }, 0);
    return String(maxRowId + 1);
}

function buildInsertedRowFromPayload(headerRow, content, data) {
    const safeData = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    const dataEntries = Object.entries(safeData);
    const rowIdColIndex = headerRow.findIndex((header) => isRowIdHeader(header));

    return headerRow.map((header, colIndex) => {
        if (colIndex === rowIdColIndex) {
            return resolveNextRowId(content, rowIdColIndex);
        }

        const headerText = String(header ?? '').trim();
        const matchedEntry = dataEntries.find(([key]) => String(key ?? '').trim() === headerText);
        if (!matchedEntry) return '';
        const [, value] = matchedEntry;
        return value === undefined || value === null ? '' : value;
    });
}

async function fallbackPersistInsertedRow(api, tableName, data) {
    if (!api || typeof api.exportTableAsJson !== 'function' || typeof api.importTableAsJson !== 'function') {
        return {
            persisted: false,
            refreshed: false,
            snapshotSummary: readTableSnapshotSummaryFromApi(api, tableName, 'insert-row.fallback-read-error'),
            fallbackUsed: false,
            rowIndex: undefined,
        };
    }

    const rawData = cloneRawTableData(api.exportTableAsJson());
    const matchedEntry = findSheetEntryByTableName(rawData, tableName);
    if (!matchedEntry) {
        logger.warn({
            action: 'insert-row.fallback-sheet-missing',
            message: 'insertRow fallback 未找到目标表',
            context: { tableName, payloadKeys: Object.keys(data || {}) },
        });
        return {
            persisted: false,
            refreshed: false,
            snapshotSummary: readTableSnapshotSummaryFromApi(api, tableName, 'insert-row.fallback-read-error'),
            fallbackUsed: false,
            rowIndex: undefined,
        };
    }

    const [, sheet] = matchedEntry;
    const content = Array.isArray(sheet?.content) ? sheet.content : null;
    const headerRow = Array.isArray(content?.[0]) ? content[0] : null;
    if (!content || !headerRow) {
        logger.warn({
            action: 'insert-row.fallback-content-invalid',
            message: 'insertRow fallback 目标表 content 或表头无效',
            context: { tableName, payloadKeys: Object.keys(data || {}) },
        });
        return {
            persisted: false,
            refreshed: false,
            snapshotSummary: readTableSnapshotSummaryFromApi(api, tableName, 'insert-row.fallback-read-error'),
            fallbackUsed: false,
            rowIndex: undefined,
        };
    }

    const insertedRow = buildInsertedRowFromPayload(headerRow, content, data);
    content.push(insertedRow);
    const fallbackRowIndex = content.length - 1;

    const jsonString = JSON.stringify(rawData);
    const persistResult = await callApiWithTimeout(
        () => api.importTableAsJson(jsonString),
        DEFAULT_API_TIMEOUT,
        'insertTableRow.fallbackSave',
    );
    const persisted = isDbBooleanSuccess(persistResult);
    let refreshed = false;

    if (persisted && typeof api.refreshDataAndWorldbook === 'function') {
        refreshed = !!(await callApiWithTimeout(
            () => api.refreshDataAndWorldbook(),
            12000,
            'insertTableRow.fallbackRefresh',
        ));
    }

    const snapshotSummary = readTableSnapshotSummaryFromApi(api, tableName, 'insert-row.fallback-read-error');

    return {
        persisted,
        refreshed,
        snapshotSummary,
        fallbackUsed: true,
        rowIndex: fallbackRowIndex,
    };
}

export function getTableData() {
    const api = getDB();
    if (api && typeof api.exportTableAsJson === 'function') {
        try {
            return api.exportTableAsJson();
        } catch (error) {
            logger.warn({
                action: 'table-data.get',
                message: 'getTableData 调用失败',
                error,
            });
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
    return enqueueTableMutation('saveTableData', async () => {
        const api = getDB();
        if (!api || typeof api.importTableAsJson !== 'function') return false;

        try {
            const jsonString = typeof rawData === 'string' ? rawData : JSON.stringify(rawData);
            const result = await callApiWithTimeout(
                () => api.importTableAsJson(jsonString),
                timeout,
                'saveTableData',
            );
            return isDbBooleanSuccess(result);
        } catch (error) {
            logger.warn({
                action: 'table-data.save',
                message: 'importTableAsJson 调用失败',
                error,
            });
            return false;
        }
    });
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
    return enqueueTableMutation('updateTableCell', async () => {
        const api = getDB();
        if (!api || typeof api.updateCell !== 'function') {
            return { ok: false, code: 'api_unavailable', message: '数据库API不可用' };
        }

        try {
            const result = await api.updateCell(tableName, rowIndex, colIdentifier, value);
            const ok = isDbBooleanSuccess(result);
            return { ok, code: ok ? 'ok' : 'failed' };
        } catch (error) {
            return { ok: false, code: 'error', message: error?.message || '未知错误' };
        }
    });
}

export async function updateTableRow(tableName, rowIndex, data) {
    return enqueueTableMutation('updateTableRow', async () => {
        const api = getDB();
        const payloadKeys = Object.keys(data && typeof data === 'object' && !Array.isArray(data) ? data : {});
        if (!api || typeof api.updateRow !== 'function') {
            return { ok: false, code: 'api_unavailable', message: '数据库API不可用' };
        }

        try {
            const apiResult = await api.updateRow(tableName, rowIndex, data);
            const apiUpdated = isDbBooleanSuccess(apiResult);
            let persistResult = {
                persisted: false,
                refreshed: false,
                snapshotSummary: readTableSnapshotSummaryFromApi(api, tableName, 'update-row.snapshot-error'),
                fallbackUsed: false,
            };

            if (apiUpdated) {
                persistResult = {
                    ...await persistInsertedTableSnapshot(api, tableName),
                    fallbackUsed: false,
                };
            } else {
                persistResult = await fallbackPersistUpdatedRow(api, tableName, rowIndex, data);
            }

            const finalOk = (apiUpdated || persistResult.fallbackUsed) && (persistResult.persisted || typeof api.importTableAsJson !== 'function');

            return {
                ok: finalOk,
                code: apiUpdated
                    ? (persistResult.persisted ? 'ok' : 'persist_failed')
                    : (persistResult.persisted ? 'ok_fallback' : 'failed'),
                persisted: persistResult.persisted,
                refreshed: persistResult.refreshed,
                fallbackUsed: !!persistResult.fallbackUsed,
                message: finalOk
                    ? (persistResult.fallbackUsed ? 'updateRow 原接口返回失败，已通过整表回写兜底成功' : undefined)
                    : 'updateRow 与整表回写兜底都失败了',
            };
        } catch (error) {
            logger.warn({
                action: 'update-row.error',
                message: 'updateRow 调用异常',
                context: {
                    tableName,
                    rowIndex,
                    payloadKeys,
                    payloadPreview: summarizeTablePayload(data),
                },
                error,
            });
            return { ok: false, code: 'error', message: error?.message || '未知错误' };
        }
    });
}

export async function insertTableRow(tableName, data) {
    return enqueueTableMutation('insertTableRow', async () => {
        const api = getDB();
        const payloadKeys = Object.keys(data && typeof data === 'object' && !Array.isArray(data) ? data : {});
        if (!api || typeof api.insertRow !== 'function') {
            logger.warn({
                action: 'insert-row.api-unavailable',
                message: 'insertRow 不可用',
                context: {
                    tableName,
                    payloadKeys,
                },
            });
            return { ok: false, code: 'api_unavailable', message: '数据库API不可用' };
        }

        const beforeSnapshotSummary = readTableSnapshotSummaryFromApi(api, tableName, 'insert-row.snapshot-before-error');

        try {
            const rawRowIndex = await api.insertRow(tableName, data);
            const rowIndex = normalizeDbInsertedRowIndex(rawRowIndex);
            let snapshotSummary = readTableSnapshotSummaryFromApi(api, tableName, 'insert-row.snapshot-error');
            let snapshotVerifiedInsert = false;
            let fallbackResult = {
                persisted: false,
                refreshed: false,
                snapshotSummary: null,
                fallbackUsed: false,
                rowIndex: undefined,
            };

            if (rowIndex < 0) {
                const verifyResult = await verifyInsertedRowBySnapshot(api, tableName, beforeSnapshotSummary, snapshotSummary);
                snapshotSummary = verifyResult.snapshotSummary ?? snapshotSummary;
                snapshotVerifiedInsert = verifyResult.snapshotVerifiedInsert;

                if (!snapshotVerifiedInsert) {
                    fallbackResult = await fallbackPersistInsertedRow(api, tableName, data);
                    snapshotSummary = fallbackResult.snapshotSummary ?? snapshotSummary;
                }
            }

            const fallbackInserted = !!fallbackResult.fallbackUsed && !!fallbackResult.persisted;
            const resolvedRowIndex = rowIndex >= 0
                ? rowIndex
                : (snapshotVerifiedInsert && Number.isInteger(snapshotSummary?.rowCount)
                    ? snapshotSummary.rowCount
                    : (fallbackInserted ? fallbackResult.rowIndex : undefined));
            const insertDetected = rowIndex >= 0 || snapshotVerifiedInsert || fallbackInserted;
            let persistResult = {
                persisted: fallbackResult.persisted,
                refreshed: fallbackResult.refreshed,
                snapshotSummary,
            };

            if (insertDetected && !fallbackInserted) {
                persistResult = await persistInsertedTableSnapshot(api, tableName);
                snapshotSummary = persistResult.snapshotSummary ?? snapshotSummary;
            }

            const finalOk = insertDetected;
            const resultCode = !insertDetected
                ? 'failed'
                : (fallbackInserted
                    ? 'ok_fallback'
                    : (persistResult.persisted
                        ? (rowIndex >= 0 ? 'ok' : 'ok_snapshot_verified')
                        : 'ok_persist_unconfirmed'));
            const resultMessage = !insertDetected
                ? 'insertRow 未确认插入成功'
                : (fallbackInserted
                    ? 'insertRow 原接口返回失败，已通过整表追加兜底成功'
                    : (persistResult.persisted
                        ? (snapshotVerifiedInsert ? 'insertRow 返回 -1，但快照确认已插入成功并已持久化' : undefined)
                        : '插入已确认，但二次持久化或刷新未确认'));

            return {
                ok: finalOk,
                code: resultCode,
                rowIndex: resolvedRowIndex,
                rawRowIndex,
                persisted: persistResult.persisted,
                refreshed: persistResult.refreshed,
                message: resultMessage,
                diagnostics: {
                    tableName,
                    payloadKeys,
                    beforeSnapshot: beforeSnapshotSummary,
                    afterInsertSnapshot: snapshotSummary,
                    persistedSnapshot: persistResult.snapshotSummary,
                    snapshotVerifiedInsert,
                    fallbackUsed: !!fallbackResult.fallbackUsed,
                },
            };
        } catch (error) {
            logger.warn({
                action: 'insert-row.error',
                message: 'insertRow 调用异常',
                context: {
                    tableName,
                    payloadKeys,
                    payloadPreview: summarizeTablePayload(data),
                },
                error,
            });
            return { ok: false, code: 'error', message: error?.message || '未知错误' };
        }
    });
}

export async function deleteTableRowViaApi(tableName, rowIndex) {
    return enqueueTableMutation('deleteTableRowViaApi', async () => {
        const api = getDB();
        if (!api || typeof api.deleteRow !== 'function') {
            return { ok: false, code: 'api_unavailable', message: '数据库API不可用' };
        }

        try {
            const result = await api.deleteRow(tableName, rowIndex);
            const ok = isDbBooleanSuccess(result);
            return { ok, code: ok ? 'ok' : 'failed' };
        } catch (error) {
            return { ok: false, code: 'error', message: error?.message || '未知错误' };
        }
    });
}
