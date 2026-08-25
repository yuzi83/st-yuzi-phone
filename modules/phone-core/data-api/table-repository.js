import { Logger } from '../../error-handler.js';
import {
    DEFAULT_API_TIMEOUT,
    callApiWithTimeout,
    callMutationApiToSettlement,
    getDB,
    isDbBooleanSuccess,
    normalizeDbInsertedRowIndex,
} from '../db-bridge.js';
import { normalizeSqlMutationSettlement } from './mutation-settlement.js';
import { enqueueTableMutation } from './mutation-queue.js';

const logger = Logger.withScope({ scope: 'phone-core/data-api/table-repository', feature: 'db-api' });
const SQL_DELETE_MAX_BOUND_PARAMS = 900;

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

function summarizeApiResult(value) {
    if (value === null) {
        return { type: 'null', value: null };
    }
    if (value === undefined) {
        return { type: 'undefined' };
    }

    const valueType = Array.isArray(value) ? 'array' : typeof value;
    if (valueType === 'string') {
        const text = String(value);
        return {
            type: valueType,
            value: text.length > 120 ? `${text.slice(0, 120)}…` : text,
        };
    }
    if (valueType === 'number' || valueType === 'boolean' || valueType === 'bigint') {
        return { type: valueType, value: String(value) };
    }
    if (valueType === 'object') {
        return {
            type: valueType,
            keys: Object.keys(value || {}).slice(0, 12),
        };
    }

    return { type: valueType };
}

function normalizeTableName(tableName) {
    return String(tableName || '').trim();
}

function normalizeTableAlias(tableName) {
    return normalizeTableName(tableName).toLowerCase();
}

function normalizePayload(data) {
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

function getPayloadKeys(data) {
    return Object.keys(normalizePayload(data));
}

function getTableSnapshotSummary(rawData, tableName) {
    const safeTableName = normalizeTableName(tableName);
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

function buildDeleteBatchDiagnostics({ tableName = '', deleteStrategy = 'none', fallbackReason = '', requestedRowIndexes = [] } = {}) {
    return {
        tableName,
        deleteStrategy,
        fallbackReason,
        requestedRowIndexes: normalizeDeleteRowIndexes(requestedRowIndexes),
    };
}

function buildApiUnavailableResult(message = '数据库API不可用') {
    return {
        ok: false,
        code: 'api_unavailable',
        message,
        refreshed: false,
    };
}

function buildMethodMissingResult(methodName, message = '') {
    const safeMethodName = String(methodName || '').trim() || 'unknown';
    return {
        ok: false,
        code: 'method_missing',
        message: message || `数据库 API 缺少方法：${safeMethodName}`,
        refreshed: false,
    };
}

function normalizeBooleanMutationResult(result, operationName) {
    if (isDbBooleanSuccess(result)) {
        return { ok: true, code: 'ok', message: '' };
    }
    if (result === null) {
        return { ok: false, code: 'mutation_result_null', message: `${operationName} 返回 null` };
    }
    if (result === false) {
        return { ok: false, code: 'mutation_failed', message: `${operationName} 明确返回失败` };
    }
    return {
        ok: false,
        code: 'mutation_result_invalid',
        message: `${operationName} 返回值无效`,
    };
}

function normalizeInsertMutationResult(rawRowIndex) {
    const rowIndex = normalizeDbInsertedRowIndex(rawRowIndex);
    if (rowIndex >= 1) {
        return { ok: true, code: 'ok', message: '', rowIndex };
    }
    if (rawRowIndex === null) {
        return { ok: false, code: 'mutation_result_null', message: 'insertRow 返回 null', rowIndex };
    }
    if (rawRowIndex === false) {
        return { ok: false, code: 'mutation_failed', message: 'insertRow 明确返回失败', rowIndex };
    }
    return {
        ok: false,
        code: 'mutation_result_invalid',
        message: 'insertRow 未返回有效数据行索引',
        rowIndex,
    };
}

function buildTableNameMissingResult(actionName) {
    return {
        ok: false,
        code: 'table_name_missing',
        message: `${actionName}失败：缺少表格名称`,
        refreshed: false,
    };
}

function normalizeDeleteRowIndexes(rowIndexes = []) {
    return Array.from(new Set((Array.isArray(rowIndexes) ? rowIndexes : [rowIndexes])
        .map((value) => Number(value))
        .filter(Number.isInteger)
        .filter((value) => value >= 0)))
        .sort((a, b) => b - a);
}

function normalizeDbDeleteRowIndexes(rowIndexes = []) {
    return normalizeDeleteRowIndexes(rowIndexes).map((rowIndex) => rowIndex + 1);
}

function buildBatchDeleteRowIndexResult({
    requestedRowIndexes = [],
    attemptedRowIndexes = [],
    deletedRowIndexes = [],
    failedRowIndexes = [],
} = {}) {
    const requested = normalizeDeleteRowIndexes(requestedRowIndexes);
    const attempted = normalizeDeleteRowIndexes(attemptedRowIndexes);
    const deleted = normalizeDeleteRowIndexes(deletedRowIndexes);
    const failed = normalizeDeleteRowIndexes(failedRowIndexes);
    const attemptedSet = new Set(attempted);
    const deletedSet = new Set(deleted);

    return {
        requestedRowIndexes: requested,
        attemptedRowIndexes: attempted,
        deletedRowIndexes: deleted,
        failedRowIndexes: failed,
        unattemptedRowIndexes: requested.filter((rowIndex) => !attemptedSet.has(rowIndex)),
        notDeletedRowIndexes: requested.filter((rowIndex) => !deletedSet.has(rowIndex)),
    };
}

async function callDeleteRowApi(api, tableName, dbRowIndex) {
    const result = await callMutationApiToSettlement(
        () => api.deleteRow(tableName, dbRowIndex),
        'deleteTableRows.deleteRow',
    );
    return {
        ...normalizeBooleanMutationResult(result, 'deleteRow'),
        result,
    };
}

function isSafeSqlIdentifier(value) {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(value || '').trim());
}

function findSheetEntryByTableName(rawData, tableName) {
    const safeTableName = normalizeTableName(tableName);
    if (!safeTableName || !rawData || typeof rawData !== 'object') {
        return null;
    }

    const entry = Object.entries(rawData)
        .find(([, sheet]) => String(sheet?.name || '').trim() === safeTableName);
    return entry ? { sheetKey: entry[0], sheet: entry[1] } : null;
}

function resolvePhysicalTableNameFromSheet(sheet, fallbackTableName = '') {
    const ddl = String(sheet?.sourceData?.ddl || sheet?.ddl || '').trim();
    const ddlMatch = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`\[]?([A-Za-z_][A-Za-z0-9_]*)["'`\]]?/i.exec(ddl);
    if (ddlMatch && isSafeSqlIdentifier(ddlMatch[1])) {
        return ddlMatch[1];
    }

    const directName = String(sheet?.sourceData?.tableName || sheet?.sourceData?.physicalTableName || '').trim();
    if (isSafeSqlIdentifier(directName)) {
        return directName;
    }

    const fallbackName = normalizeTableName(fallbackTableName);
    return isSafeSqlIdentifier(fallbackName) ? fallbackName : '';
}

function isSheetTableAliasMatch(sheetKey, sheet, tableName) {
    const safeTableName = normalizeTableAlias(tableName);
    if (!safeTableName) return false;

    const sourceData = sheet?.sourceData && typeof sheet.sourceData === 'object' ? sheet.sourceData : {};
    const aliases = [
        sheetKey,
        sheet?.uid,
        sheet?.name,
        sourceData.tableName,
        sourceData.physicalTableName,
        resolvePhysicalTableNameFromSheet(sheet),
        ...(Array.isArray(sourceData.tableAliases) ? sourceData.tableAliases : []),
    ];
    return aliases.some((alias) => normalizeTableAlias(alias) === safeTableName);
}

function getSheetColumnAliases(sheet) {
    const content = Array.isArray(sheet?.content) ? sheet.content : [];
    if (!Array.isArray(content[0])) return null;

    const columns = content[0]
        .map((column) => String(column ?? '').trim())
        .filter(Boolean);
    const sourceData = sheet?.sourceData && typeof sheet.sourceData === 'object' ? sheet.sourceData : {};
    const declaredAliases = sourceData.columnAliases;
    if (declaredAliases && typeof declaredAliases === 'object' && !Array.isArray(declaredAliases)) {
        for (const [physicalName, aliases] of Object.entries(declaredAliases)) {
            const normalizedPhysicalName = String(physicalName || '').trim();
            if (normalizedPhysicalName) columns.push(normalizedPhysicalName);
            if (Array.isArray(aliases)) {
                columns.push(...aliases.map((alias) => String(alias ?? '').trim()).filter(Boolean));
            }
        }
    }

    return [...new Set(columns)];
}

function normalizeRowId(value) {
    const rowId = Number(value);
    return Number.isInteger(rowId) && rowId > 0 ? rowId : null;
}

function resolveDeleteRowIdMappingsFromSnapshot(rawData, tableName, rowIndexes = []) {
    const sheetEntry = findSheetEntryByTableName(rawData, tableName);
    if (!sheetEntry) {
        return { ok: false, code: 'sheet_missing', reason: '未找到表格快照' };
    }

    const { sheet } = sheetEntry;
    const content = Array.isArray(sheet?.content) ? sheet.content : [];
    const headers = Array.isArray(content[0]) ? content[0].map((header) => String(header || '').trim()) : [];
    const rowIdColumnIndex = headers.indexOf('row_id');
    if (rowIdColumnIndex < 0) {
        return { ok: false, code: 'row_id_missing', reason: '表格快照缺少 row_id 列' };
    }

    const mappings = [];
    for (const rowIndex of rowIndexes) {
        const row = content[rowIndex + 1];
        const rowId = Array.isArray(row) ? normalizeRowId(row[rowIdColumnIndex]) : null;
        if (!rowId) {
            return { ok: false, code: 'row_id_unresolved', reason: `第 ${rowIndex} 行无法映射 row_id` };
        }
        mappings.push({ rowIndex, rowId });
    }

    const physicalTableName = resolvePhysicalTableNameFromSheet(sheet, tableName);
    if (!physicalTableName) {
        return { ok: false, code: 'physical_table_missing', reason: '无法解析安全物理表名' };
    }

    return { ok: true, sheetKey: sheetEntry.sheetKey, physicalTableName, mappings };
}

function buildDeleteRowsSql(physicalTableName, rowCount) {
    const placeholders = Array(rowCount).fill('?').join(', ');
    return `DELETE FROM ${physicalTableName} WHERE row_id IN (${placeholders})`;
}

function buildSelectExistingRowIdsSql(physicalTableName, rowCount) {
    const placeholders = Array(rowCount).fill('?').join(', ');
    return `SELECT row_id FROM ${physicalTableName} WHERE row_id IN (${placeholders})`;
}

function normalizeExistingRowIdQueryResult(result) {
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
        return { ok: false, rowIds: [] };
    }
    if ('errors' in result && !Array.isArray(result.errors)) {
        return { ok: false, rowIds: [] };
    }

    const errors = Array.isArray(result.errors) ? result.errors : [];
    if (errors.length > 0 || result.saved === false || result.ok === false || result.success === false) {
        return { ok: false, rowIds: [] };
    }

    const columns = Array.isArray(result.columns)
        ? result.columns.map((column) => String(column || '').trim().toLowerCase())
        : null;
    const rows = Array.isArray(result.rows) ? result.rows : null;
    const values = Array.isArray(result.values) ? result.values : null;
    const rowCount = result.rowCount;
    const rowIdColumnIndex = columns?.indexOf('row_id') ?? -1;
    if (
        !columns
        || !rows
        || !values
        || !Number.isInteger(rowCount)
        || rowCount < 0
        || rowIdColumnIndex < 0
        || rows.length !== rowCount
        || values.length !== rowCount
    ) {
        return { ok: false, rowIds: [] };
    }

    const rowIds = [];
    for (let index = 0; index < rowCount; index++) {
        const row = rows[index];
        const valueRow = values[index];
        const rowValue = row && typeof row === 'object' && !Array.isArray(row)
            ? (row.row_id ?? row.ROW_ID)
            : undefined;
        const valueRowValue = Array.isArray(valueRow) ? valueRow[rowIdColumnIndex] : undefined;
        const rowId = normalizeRowId(rowValue ?? valueRowValue);
        if (!rowId) {
            return { ok: false, rowIds: [] };
        }
        rowIds.push(rowId);
    }

    if (new Set(rowIds).size !== rowIds.length) {
        return { ok: false, rowIds: [] };
    }

    return { ok: true, rowIds: Array.from(new Set(rowIds)) };
}

async function queryExistingRowIdsAfterSqlDelete(api, physicalTableName, rowIds) {
    const methodName = typeof api.querySql === 'function'
        ? 'querySql'
        : (typeof api.executeSqlQuery === 'function' ? 'executeSqlQuery' : '');
    if (!methodName) {
        return { ok: false, rowIds: [] };
    }

    const sql = buildSelectExistingRowIdsSql(physicalTableName, rowIds.length);
    const result = await callApiWithTimeout(
        () => api[methodName](sql, rowIds),
        DEFAULT_API_TIMEOUT,
        `deleteTableRowsBatch.${methodName}`,
    );
    const queryResult = normalizeExistingRowIdQueryResult(result);
    if (!queryResult.ok) {
        return queryResult;
    }

    const requestedRowIds = new Set(rowIds);
    if (queryResult.rowIds.some((rowId) => !requestedRowIds.has(rowId))) {
        return { ok: false, rowIds: [] };
    }
    return queryResult;
}

async function tryDeleteRowsViaSqlMutation(api, safeTableName, normalizedRowIndexes) {
    if (!api || typeof api.executeSqlMutation !== 'function') {
        return { shouldFallback: true, fallbackReason: 'executeSqlMutation_missing' };
    }
    if (!api || typeof api.exportTableAsJson !== 'function') {
        return { shouldFallback: true, fallbackReason: 'snapshot_api_missing' };
    }

    let rawData = null;
    try {
        rawData = api.exportTableAsJson();
    } catch (error) {
        logger.warn({
            action: 'delete-rows-batch.sql.snapshot-error',
            message: 'SQL 批量删除读取表格快照失败，回退 deleteRow 循环',
            context: { tableName: safeTableName },
            error,
        });
        return { shouldFallback: true, fallbackReason: 'snapshot_read_failed' };
    }

    const mappingResult = resolveDeleteRowIdMappingsFromSnapshot(rawData, safeTableName, normalizedRowIndexes);
    if (!mappingResult.ok) {
        return { shouldFallback: true, fallbackReason: mappingResult.code || 'row_id_mapping_failed' };
    }

    const rowIds = mappingResult.mappings.map((mapping) => mapping.rowId);
    if (rowIds.length > SQL_DELETE_MAX_BOUND_PARAMS) {
        return { shouldFallback: true, fallbackReason: 'sql_param_limit_exceeded' };
    }
    const sql = buildDeleteRowsSql(mappingResult.physicalTableName, rowIds.length);
    let mutationResult = null;
    try {
        const rawResult = await callMutationApiToSettlement(
            () => api.executeSqlMutation(sql, rowIds),
            'deleteTableRowsBatch.executeSqlMutation',
        );
        mutationResult = normalizeSqlMutationSettlement(rawResult);
    } catch (error) {
        logger.warn({
            action: 'delete-rows-batch.sql-error',
            message: 'SQL 批量删除调用异常，已可能写入，不执行 deleteRow 回退',
            context: { tableName: safeTableName, physicalTableName: mappingResult.physicalTableName, rowIds },
            error,
        });
        mutationResult = { ok: false, code: 'mutation_rejected', message: error?.message || 'SQL 批量删除调用异常', changes: null, errors: [error] };
    }

    const attemptedRowIndexes = normalizedRowIndexes;
    let deletedRowIndexes = [];
    let failedRowIndexes = [];
    let queryResult = null;
    const changesMatchesRequest = mutationResult.ok && mutationResult.changes === rowIds.length;
    const requiresReconciliation = !changesMatchesRequest;

    if (changesMatchesRequest) {
        deletedRowIndexes = normalizedRowIndexes;
    } else if (requiresReconciliation) {
        try {
            queryResult = await queryExistingRowIdsAfterSqlDelete(api, mappingResult.physicalTableName, rowIds);
            if (queryResult.ok) {
                const existingRowIds = new Set(queryResult.rowIds);
                deletedRowIndexes = mappingResult.mappings
                    .filter((mapping) => !existingRowIds.has(mapping.rowId))
                    .map((mapping) => mapping.rowIndex);
                failedRowIndexes = mappingResult.mappings
                    .filter((mapping) => existingRowIds.has(mapping.rowId))
                    .map((mapping) => mapping.rowIndex);
            }
        } catch (error) {
            logger.warn({
                action: 'delete-rows-batch.sql-reconcile-error',
                message: 'SQL 批量删除对账查询失败，不执行 deleteRow 回退',
                context: { tableName: safeTableName, physicalTableName: mappingResult.physicalTableName, rowIds },
                error,
            });
            queryResult = { ok: false, rowIds: [] };
        }
    }

    const batchRowIndexes = buildBatchDeleteRowIndexResult({
        requestedRowIndexes: normalizedRowIndexes,
        attemptedRowIndexes,
        deletedRowIndexes,
        failedRowIndexes,
    });
    const allDeleted = batchRowIndexes.notDeletedRowIndexes.length === 0 && failedRowIndexes.length === 0;
    const partialUnknown = requiresReconciliation && queryResult?.ok !== true;
    const refreshed = mutationResult.ok && deletedRowIndexes.length > 0;
    const confirmedFailureCode = mutationResult.ok ? 'mutation_failed' : (mutationResult.code || 'mutation_failed');
    const confirmedFailureMessage = mutationResult.ok
        ? '删除失败：数据库已确认未删除目标行'
        : (mutationResult.message || '删除失败：数据库未确认删除目标行');

    return {
        shouldFallback: false,
        ok: allDeleted,
        code: allDeleted
            ? 'ok'
            : (partialUnknown
                ? 'partial_unknown'
                : (deletedRowIndexes.length > 0 ? 'partial_failed' : confirmedFailureCode)),
        message: allDeleted
            ? '删除成功'
            : (partialUnknown
                ? 'SQL 批量删除结果无法完整确认，已可能写入，不执行逐行回退'
                : (deletedRowIndexes.length > 0
                    ? `部分删除失败：已删除 ${deletedRowIndexes.length} 行，仍有 ${batchRowIndexes.notDeletedRowIndexes.length} 行未删除`
                    : confirmedFailureMessage)),
        tableName: safeTableName,
        ...batchRowIndexes,
        deletedCount: deletedRowIndexes.length,
        refreshed,
        deleteStrategy: 'sql_executeSqlMutation',
        fallbackReason: '',
        diagnostics: {
            deleteStrategy: 'sql_executeSqlMutation',
            physicalTableName: mappingResult.physicalTableName,
            sheetKey: mappingResult.sheetKey,
            rowIds,
            sqlChanges: mutationResult.changes,
            mutationCode: mutationResult.code,
            mutationSettled: true,
            reconciliationRequired: requiresReconciliation,
            queryChecked: !!queryResult,
            queryConfirmed: queryResult?.ok === true,
        },
    };
}

async function deleteRowsViaLegacyDeleteRowLoop(api, safeTableName, normalizedRowIndexes, options = {}) {
    const dbRowIndexes = normalizeDbDeleteRowIndexes(normalizedRowIndexes);
    const attemptedRowIndexes = [];
    const deletedRowIndexes = [];
    const failedRowIndexes = [];
    let failureCode = '';
    let failureMessage = '';

    for (let index = 0; index < dbRowIndexes.length; index++) {
        const dbRowIndex = dbRowIndexes[index];
        const uiRowIndex = normalizedRowIndexes[index];
        try {
            attemptedRowIndexes.push(uiRowIndex);
            const deletion = await callDeleteRowApi(api, safeTableName, dbRowIndex);
            if (deletion.ok) {
                deletedRowIndexes.push(uiRowIndex);
            } else {
                failedRowIndexes.push(uiRowIndex);
                failureCode = deletion.code;
                failureMessage = deletion.message;
                break;
            }
        } catch (error) {
            failedRowIndexes.push(uiRowIndex);
            failureCode = 'mutation_rejected';
            failureMessage = error?.message || 'deleteRow 调用异常';
            logger.warn({
                action: 'delete-rows-batch.error',
                message: '批量 deleteRow 调用异常',
                context: { tableName: safeTableName, rowIndex: dbRowIndex, uiRowIndex },
                error,
            });
            break;
        }
    }

    const batchRowIndexes = buildBatchDeleteRowIndexResult({
        requestedRowIndexes: normalizedRowIndexes,
        attemptedRowIndexes,
        deletedRowIndexes,
        failedRowIndexes,
    });
    const allDeleted = batchRowIndexes.notDeletedRowIndexes.length === 0 && failedRowIndexes.length === 0;
    const refreshed = deletedRowIndexes.length > 0;

    return {
        ok: allDeleted,
        code: allDeleted
            ? 'ok'
            : (deletedRowIndexes.length > 0 ? 'partial_failed' : (failureCode || 'mutation_failed')),
        message: allDeleted
            ? '删除成功'
            : (deletedRowIndexes.length > 0
                ? `部分删除失败：已删除 ${deletedRowIndexes.length} 行，仍有 ${batchRowIndexes.notDeletedRowIndexes.length} 行未删除`
                : (failureMessage || '删除失败：数据库未确认删除目标行')),
        tableName: safeTableName,
        ...batchRowIndexes,
        deletedCount: deletedRowIndexes.length,
        refreshed,
        deleteStrategy: 'legacy_deleteRow_loop',
        fallbackReason: options.fallbackReason || '',
        diagnostics: {
            deleteStrategy: 'legacy_deleteRow_loop',
            fallbackReason: options.fallbackReason || '',
            attemptedDbRowIndexes: dbRowIndexes.slice(0, attemptedRowIndexes.length),
            requestedRowIndexes: normalizedRowIndexes,
            failureCode,
        },
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

export function getTableAvailabilityViaApi(tableName) {
    const safeTableName = normalizeTableAlias(tableName);
    if (!safeTableName) return { status: 'absent' };

    try {
        const api = getDB();
        if (!api || typeof api.exportTableAsJson !== 'function') {
            return { status: 'unavailable' };
        }

        const rawData = api.exportTableAsJson();
        if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
            return { status: 'unavailable' };
        }

        const entry = Object.entries(rawData)
            .find(([sheetKey, sheet]) => isSheetTableAliasMatch(sheetKey, sheet, safeTableName));
        if (!entry) return { status: 'absent' };

        const columns = getSheetColumnAliases(entry[1]);
        return columns ? { status: 'present', columns } : { status: 'present' };
    } catch {
        return { status: 'unavailable' };
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

export async function updateTableCell(tableName, rowIndex, colIdentifier, value, options = {}) {
    return enqueueTableMutation('updateTableCell', async () => {
        void options;
        const api = getDB();
        const safeTableName = normalizeTableName(tableName);
        if (!safeTableName) return buildTableNameMissingResult('单元格更新');
        if (!api) return buildApiUnavailableResult();
        if (typeof api.updateCell !== 'function') return buildMethodMissingResult('updateCell');

        try {
            const result = await callMutationApiToSettlement(
                () => api.updateCell(safeTableName, rowIndex, colIdentifier, value),
                'updateTableCell.updateCell',
            );
            const mutation = normalizeBooleanMutationResult(result, 'updateCell');
            return {
                ok: mutation.ok,
                code: mutation.code,
                refreshed: mutation.ok,
                message: mutation.message || undefined,
            };
        } catch (error) {
            logger.warn({
                action: 'update-cell.error',
                message: 'updateCell 调用异常',
                context: { tableName: safeTableName, rowIndex, colIdentifier },
                error,
            });
            return { ok: false, code: 'mutation_rejected', message: error?.message || '未知错误', refreshed: false };
        }
    });
}

export async function updateTableRow(tableName, rowIndex, data, options = {}) {
    return enqueueTableMutation('updateTableRow', async () => {
        void options;
        const api = getDB();
        const safeTableName = normalizeTableName(tableName);
        const payload = normalizePayload(data);
        const payloadKeys = getPayloadKeys(payload);
        if (!safeTableName) return buildTableNameMissingResult('行更新');
        if (!Number.isInteger(Number(rowIndex)) || Number(rowIndex) < 1) {
            return { ok: false, code: 'row_index_invalid', message: '行更新失败：行索引无效', refreshed: false };
        }
        if (!api) return buildApiUnavailableResult();
        if (typeof api.updateRow !== 'function') return buildMethodMissingResult('updateRow');

        try {
            const apiResult = await callMutationApiToSettlement(
                () => api.updateRow(safeTableName, Number(rowIndex), payload),
                'updateTableRow.updateRow',
            );
            const mutation = normalizeBooleanMutationResult(apiResult, 'updateRow');
            const diagnostics = {
                tableName: safeTableName,
                rowIndex: Number(rowIndex),
                payloadKeys,
                payloadPreview: summarizeTablePayload(payload),
                apiResult: summarizeApiResult(apiResult),
                refreshed: mutation.ok,
            };

            if (!mutation.ok) {
                logger.warn({
                    action: 'update-row.unconfirmed',
                    message: 'updateRow 未确认更新成功',
                    context: diagnostics,
                });
            }

            return {
                ok: mutation.ok,
                code: mutation.code,
                persisted: mutation.ok,
                refreshed: mutation.ok,
                fallbackUsed: false,
                message: mutation.message || undefined,
                diagnostics,
            };
        } catch (error) {
            logger.warn({
                action: 'update-row.error',
                message: 'updateRow 调用异常',
                context: {
                    tableName: safeTableName,
                    rowIndex,
                    payloadKeys,
                    payloadPreview: summarizeTablePayload(payload),
                },
                error,
            });
            return { ok: false, code: 'mutation_rejected', message: error?.message || '未知错误', persisted: false, refreshed: false };
        }
    });
}

export async function insertTableRow(tableName, data, options = {}) {
    return enqueueTableMutation('insertTableRow', async () => {
        void options;
        const api = getDB();
        const safeTableName = normalizeTableName(tableName);
        const payload = normalizePayload(data);
        const payloadKeys = getPayloadKeys(payload);
        if (!safeTableName) return buildTableNameMissingResult('新增行');
        if (!api) {
            logger.warn({
                action: 'insert-row.api-unavailable',
                message: '数据库 API 不可用',
                context: {
                    tableName: safeTableName,
                    payloadKeys,
                },
            });
            return buildApiUnavailableResult();
        }
        if (typeof api.insertRow !== 'function') return buildMethodMissingResult('insertRow');

        const beforeSnapshotSummary = readTableSnapshotSummaryFromApi(api, safeTableName, 'insert-row.snapshot-before-error');

        try {
            const rawRowIndex = await callMutationApiToSettlement(
                () => api.insertRow(safeTableName, payload),
                'insertTableRow.insertRow',
            );
            const mutation = normalizeInsertMutationResult(rawRowIndex);
            const rowIndex = mutation.rowIndex;
            const afterSnapshotSummary = readTableSnapshotSummaryFromApi(api, safeTableName, 'insert-row.snapshot-after-error');
            const diagnostics = {
                tableName: safeTableName,
                payloadKeys,
                payloadPreview: summarizeTablePayload(payload),
                rawRowIndex,
                rawRowIndexSummary: summarizeApiResult(rawRowIndex),
                normalizedRowIndex: rowIndex,
                beforeSnapshot: beforeSnapshotSummary,
                afterSnapshot: afterSnapshotSummary,
                refreshed: mutation.ok,
            };

            if (!mutation.ok) {
                logger.warn({
                    action: 'insert-row.unconfirmed',
                    message: 'insertRow 未返回有效数据行索引，未执行全量快照兜底',
                    context: diagnostics,
                });
            }

            return {
                ok: mutation.ok,
                code: mutation.code,
                rowIndex: mutation.ok ? rowIndex : undefined,
                rawRowIndex,
                persisted: mutation.ok,
                refreshed: mutation.ok,
                fallbackUsed: false,
                message: mutation.message || undefined,
                diagnostics,
            };
        } catch (error) {
            logger.warn({
                action: 'insert-row.error',
                message: 'insertRow 调用异常',
                context: {
                    tableName: safeTableName,
                    payloadKeys,
                    payloadPreview: summarizeTablePayload(payload),
                },
                error,
            });
            return { ok: false, code: 'mutation_rejected', message: error?.message || '未知错误', persisted: false, refreshed: false };
        }
    });
}

export async function insertTableRowsBatch(tableName, rows = [], options = {}) {
    return enqueueTableMutation('insertTableRowsBatch', async () => {
        void options;
        const api = getDB();
        const safeTableName = normalizeTableName(tableName);
        const sourceRows = Array.isArray(rows) ? rows : [];
        const payloads = sourceRows.filter((row) => row && typeof row === 'object' && !Array.isArray(row)).map(normalizePayload);
        if (!safeTableName) return { ...buildTableNameMissingResult('批量新增行'), payloads: [], rowIndexes: [], rollback: null };
        if (payloads.length === 0) {
            return { ok: false, code: 'empty_rows', message: '批量新增失败：没有可新增的行', payloads: [], rowIndexes: [], refreshed: false, rollback: null };
        }
        if (!api) {
            return { ...buildApiUnavailableResult(), payloads, rowIndexes: [], rollback: null };
        }
        if (typeof api.insertRow !== 'function') {
            return { ...buildMethodMissingResult('insertRow'), payloads, rowIndexes: [], rollback: null };
        }

        const insertedRowIndexes = [];
        let failedAt = -1;
        let failureResult = null;

        try {
            for (let index = 0; index < payloads.length; index++) {
                const payload = payloads[index];
                const rawRowIndex = await callMutationApiToSettlement(
                    () => api.insertRow(safeTableName, payload),
                    `insertTableRowsBatch.insertRow.${index + 1}`,
                );
                const mutation = normalizeInsertMutationResult(rawRowIndex);
                if (!mutation.ok) {
                    failedAt = index;
                    failureResult = {
                        code: mutation.code,
                        message: mutation.message,
                        rawRowIndex,
                        rowIndex: mutation.rowIndex,
                        payloadKeys: getPayloadKeys(payload),
                    };
                    break;
                }
                insertedRowIndexes.push(mutation.rowIndex);
            }
        } catch (error) {
            logger.warn({
                action: 'insert-rows-batch.error',
                message: '批量 insertRow 调用异常',
                context: {
                    tableName: safeTableName,
                    insertedRowIndexes,
                    failedAt,
                },
                error,
            });
            failedAt = failedAt < 0 ? insertedRowIndexes.length : failedAt;
            failureResult = {
                code: 'mutation_rejected',
                message: error?.message || '未知错误',
                errorMessage: error?.message || '未知错误',
            };
        }

        if (failedAt >= 0) {
            const rollback = await rollbackInsertedRows(api, safeTableName, insertedRowIndexes);
            const failureCode = failureResult?.code || 'mutation_failed';
            return {
                ok: false,
                code: rollback.ok ? `${failureCode}_rolled_back` : `${failureCode}_rollback_failed`,
                message: rollback.ok
                    ? `批量新增失败：第 ${failedAt + 1} 行未确认写入，已回滚本批次已插入行`
                    : `批量新增失败：第 ${failedAt + 1} 行未确认写入，且回滚部分已插入行失败`,
                tableName: safeTableName,
                payloads,
                rowIndexes: insertedRowIndexes,
                failedAt,
                failureResult,
                failureCode,
                rollback,
                refreshed: false,
            };
        }

        return {
            ok: true,
            code: 'ok',
            message: '批量新增成功',
            tableName: safeTableName,
            payloads,
            rowIndexes: insertedRowIndexes,
            refreshed: true,
            rollback: null,
        };
    });
}

async function rollbackInsertedRows(api, tableName, insertedRowIndexes = []) {
    const dbIndexes = Array.from(new Set((Array.isArray(insertedRowIndexes) ? insertedRowIndexes : [])
        .map((value) => Number(value))
        .filter(Number.isInteger)
        .filter((value) => value >= 1)))
        .sort((a, b) => b - a);

    const failed = [];
    let deletedCount = 0;

    if (!api || typeof api.deleteRow !== 'function') {
        return {
            ok: dbIndexes.length === 0,
            deletedCount: 0,
            failedRowIndexes: dbIndexes,
            message: dbIndexes.length === 0 ? '没有需要回滚的行' : '回滚失败：deleteRow 不可用',
        };
    }

    for (const dbRowIndex of dbIndexes) {
        try {
            const deletion = await callDeleteRowApi(api, tableName, dbRowIndex);
            if (deletion.ok) {
                deletedCount += 1;
            } else {
                failed.push(dbRowIndex);
            }
        } catch (error) {
            failed.push(dbRowIndex);
            logger.warn({
                action: 'insert-rows-batch.rollback-error',
                message: '批量新增回滚删除异常',
                context: { tableName, dbRowIndex },
                error,
            });
        }
    }

    return {
        ok: failed.length === 0,
        deletedCount,
        failedRowIndexes: failed,
        message: failed.length === 0 ? '回滚成功' : `回滚失败：${failed.length} 行未删除`,
    };
}

export async function deleteTableRowViaApi(tableName, rowIndex, options = {}) {
    return enqueueTableMutation('deleteTableRowViaApi', async () => {
        void options;
        const api = getDB();
        const safeTableName = normalizeTableName(tableName);
        const dbRowIndex = Number(rowIndex);
        if (!safeTableName) return buildTableNameMissingResult('删除行');
        if (!Number.isInteger(dbRowIndex) || dbRowIndex < 1) {
            return { ok: false, code: 'row_index_invalid', message: '删除失败：行索引无效', refreshed: false };
        }
        if (!api) return buildApiUnavailableResult();
        if (typeof api.deleteRow !== 'function') return buildMethodMissingResult('deleteRow');

        try {
            const deletion = await callDeleteRowApi(api, safeTableName, dbRowIndex);
            return {
                ok: deletion.ok,
                code: deletion.code,
                message: deletion.message || undefined,
                rowIndex: dbRowIndex,
                deletedCount: deletion.ok ? 1 : 0,
                refreshed: deletion.ok,
            };
        } catch (error) {
            logger.warn({
                action: 'delete-row.error',
                message: 'deleteRow 调用异常',
                context: { tableName: safeTableName, rowIndex: dbRowIndex },
                error,
            });
            return { ok: false, code: 'mutation_rejected', message: error?.message || '未知错误', refreshed: false };
        }
    });
}

export async function deleteTableRowsBatch(tableName, rowIndexes = [], options = {}) {
    return enqueueTableMutation('deleteTableRowsBatch', async () => {
        const api = getDB();
        const safeTableName = normalizeTableName(tableName);
        const normalizedRowIndexes = normalizeDeleteRowIndexes(rowIndexes);

        if (!safeTableName) {
            const fallbackReason = 'table_name_missing';
            return {
                ...buildTableNameMissingResult('批量删除行'),
                tableName: safeTableName,
                deletedCount: 0,
                ...buildBatchDeleteRowIndexResult({ requestedRowIndexes: normalizedRowIndexes }),
                deleteStrategy: 'none',
                fallbackReason,
                diagnostics: buildDeleteBatchDiagnostics({ tableName: safeTableName, deleteStrategy: 'none', fallbackReason, requestedRowIndexes: normalizedRowIndexes }),
            };
        }
        if (normalizedRowIndexes.length === 0) {
            const fallbackReason = 'empty_selection';
            return {
                ok: false,
                code: 'empty_selection',
                message: '未选择可删除的条目',
                tableName: safeTableName,
                deletedCount: 0,
                ...buildBatchDeleteRowIndexResult(),
                refreshed: false,
                deleteStrategy: 'none',
                fallbackReason,
                diagnostics: buildDeleteBatchDiagnostics({ tableName: safeTableName, deleteStrategy: 'none', fallbackReason, requestedRowIndexes: normalizedRowIndexes }),
            };
        }
        if (!api) {
            const fallbackReason = 'api_unavailable';
            return {
                ...buildApiUnavailableResult(),
                tableName: safeTableName,
                deletedCount: 0,
                ...buildBatchDeleteRowIndexResult({ requestedRowIndexes: normalizedRowIndexes }),
                deleteStrategy: 'none',
                fallbackReason,
                diagnostics: buildDeleteBatchDiagnostics({ tableName: safeTableName, deleteStrategy: 'none', fallbackReason, requestedRowIndexes: normalizedRowIndexes }),
            };
        }

        const sqlResult = await tryDeleteRowsViaSqlMutation(api, safeTableName, normalizedRowIndexes);
        if (!sqlResult.shouldFallback) {
            return sqlResult;
        }

        if (typeof api.deleteRow !== 'function') {
            const fallbackReason = sqlResult.fallbackReason || 'deleteRow_missing';
            return {
                ...buildMethodMissingResult('deleteRow', '数据库 API 缺少 executeSqlMutation 快路径及 deleteRow 回退方法'),
                tableName: safeTableName,
                deletedCount: 0,
                ...buildBatchDeleteRowIndexResult({ requestedRowIndexes: normalizedRowIndexes }),
                deleteStrategy: 'none',
                fallbackReason,
                diagnostics: buildDeleteBatchDiagnostics({ tableName: safeTableName, deleteStrategy: 'none', fallbackReason, requestedRowIndexes: normalizedRowIndexes }),
            };
        }

        return deleteRowsViaLegacyDeleteRowLoop(api, safeTableName, normalizedRowIndexes, {
            ...options,
            fallbackReason: sqlResult.fallbackReason || 'sql_fast_path_unavailable',
        });
    });
}
