import { Logger } from '../../error-handler.js';
import { DEFAULT_API_TIMEOUT, callApiWithTimeout, getDB } from '../db-bridge.js';
import { enqueueTableMutation } from './mutation-queue.js';

const logger = Logger.withScope({ scope: 'phone-core/data-api/sql-repository', feature: 'db-api' });

function normalizeSqlInput(sqlOrOptions) {
    if (typeof sqlOrOptions === 'string') return sqlOrOptions.trim();
    if (sqlOrOptions && typeof sqlOrOptions === 'object') {
        return String(sqlOrOptions.sql || '').trim();
    }
    return '';
}

function normalizeParams(params) {
    return Array.isArray(params) ? params : [];
}

function normalizeOptions(options) {
    return options && typeof options === 'object' && !Array.isArray(options) ? { ...options } : {};
}

function buildFailure(code, message, extra = {}) {
    return {
        ok: false,
        code,
        message,
        result: null,
        rows: [],
        columns: [],
        values: [],
        rowCount: 0,
        errors: [],
        ...extra,
    };
}

function normalizeRows(result) {
    return Array.isArray(result?.rows) ? result.rows : [];
}

function normalizeColumns(result) {
    return Array.isArray(result?.columns) ? result.columns : [];
}

function normalizeValues(result) {
    return Array.isArray(result?.values) ? result.values : [];
}

function normalizeRowCount(result, rows, values) {
    if (Number.isInteger(result?.rowCount) && result.rowCount >= 0) return result.rowCount;
    if (rows.length > 0) return rows.length;
    if (values.length > 0) return values.length;
    return 0;
}

function normalizeQueryResult(result) {
    if (result === null) {
        return buildFailure('sqlite_unavailable', 'SQLite SQL 查询不可用或数据库 API 返回 null');
    }
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
        return buildFailure('query_failed', 'SQL 查询返回值不是对象', { rawResult: result });
    }
    if ('rows' in result && !Array.isArray(result.rows)) {
        return buildFailure('query_failed', 'SQL 查询 rows 字段不是数组', { result });
    }
    const errors = Array.isArray(result.errors) ? result.errors : [];
    if (errors.length > 0) return buildFailure('query_failed', 'SQL 查询返回错误', { result, errors });
    if (result.saved === false) return buildFailure('query_failed', 'SQL 查询未确认保存/读取状态', { result });
    if ('success' in result && result.success === false) return buildFailure('query_failed', 'SQL 查询未确认成功', { result });

    const rows = normalizeRows(result);
    const columns = normalizeColumns(result);
    const values = normalizeValues(result);
    const rowCount = normalizeRowCount(result, rows, values);
    return { ok: true, code: 'ok', result, rows, columns, values, rowCount };
}

export async function querySqlViaApi(sqlOrOptions, params = [], options = {}) {
    const sql = normalizeSqlInput(sqlOrOptions);
    if (!sql) return buildFailure('invalid_sql', 'SQL 查询失败：缺少 SQL');

    const api = getDB();
    if (!api) return buildFailure('api_unavailable', '数据库 API 不可用');

    const methodName = typeof api.querySql === 'function'
        ? 'querySql'
        : (typeof api.executeSqlQuery === 'function' ? 'executeSqlQuery' : '');
    if (!methodName) return buildFailure('method_missing', '数据库 API 缺少 querySql / executeSqlQuery');

    try {
        const result = await callApiWithTimeout(
            () => api[methodName](sqlOrOptions, normalizeParams(params), normalizeOptions(options)),
            DEFAULT_API_TIMEOUT,
            `querySqlViaApi.${methodName}`,
        );
        return normalizeQueryResult(result);
    } catch (error) {
        logger.warn({ action: 'query-sql.error', message: 'SQL 查询调用异常', error });
        return buildFailure('query_failed', error?.message || 'SQL 查询调用异常', { errors: [error] });
    }
}

function normalizeMutationResult(result) {
    if (result === null) return buildFailure('sqlite_unavailable', 'SQLite SQL 写入不可用或数据库 API 返回 null');
    if (result === undefined) return buildFailure('mutation_failed', 'SQL 写入返回 undefined');
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
        return buildFailure('mutation_failed', 'SQL 写入返回值不是对象', { rawResult: result });
    }
    const errors = Array.isArray(result.errors) ? result.errors : [];
    if (errors.length > 0) return buildFailure('mutation_failed', 'SQL 写入返回错误', { result, errors });
    if (result.saved === false) return buildFailure('save_failed', 'SQL 写入未确认保存成功', { result });
    if ('success' in result && result.success === false) return buildFailure('mutation_failed', 'SQL 写入未确认成功', { result });
    return { ok: true, code: 'ok', result, changes: Number.isFinite(Number(result.changes)) ? Number(result.changes) : null, saved: result.saved };
}

export async function executeSqlMutationViaApi(sqlOrOptions, params = [], options = {}) {
    const sql = normalizeSqlInput(sqlOrOptions);
    if (!sql) return buildFailure('invalid_sql', 'SQL 写入失败：缺少 SQL');

    return enqueueTableMutation('executeSqlMutationViaApi', async () => {
        const api = getDB();
        if (!api) return buildFailure('api_unavailable', '数据库 API 不可用');
        if (typeof api.executeSqlMutation !== 'function') {
            return buildFailure('method_missing', '数据库 API 缺少 executeSqlMutation');
        }

        try {
            const result = await callApiWithTimeout(
                () => api.executeSqlMutation(sqlOrOptions, normalizeParams(params), normalizeOptions(options)),
                DEFAULT_API_TIMEOUT,
                'executeSqlMutationViaApi.executeSqlMutation',
            );
            return normalizeMutationResult(result);
        } catch (error) {
            logger.warn({ action: 'execute-sql-mutation.error', message: 'SQL 写入调用异常', error });
            return buildFailure('mutation_failed', error?.message || 'SQL 写入调用异常', { errors: [error] });
        }
    });
}
