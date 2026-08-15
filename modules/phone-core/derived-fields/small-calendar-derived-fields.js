import { Logger } from '../../error-handler.js';
import { executeSqlMutationViaApi, getTableAvailabilityViaApi, querySqlViaApi, queryTableRowsViaApi } from '../data-api.js';
import { subscribeTableFillStart, subscribeTableUpdate } from '../callbacks.js';
import { createDerivedFieldService, readDerivedField } from './derived-field-service.js';
import { resolveFirstAvailableTableCandidate } from './table-candidate-resolver.js';
import {
    SMALL_CALENDAR_DERIVED_FIELDS_REQUIRED_COLUMNS,
    SMALL_CALENDAR_DERIVED_FIELDS_TABLES,
    buildSmallCalendarDerivedFieldsSignatureSql,
    buildSmallCalendarDerivedFieldsUpdateSql,
} from './small-calendar-derived-fields-sql.js';

const defaultLogger = Logger.withScope({
    scope: 'phone-core/derived-fields/small-calendar-derived-fields',
    feature: 'derived-fields',
});

const defaultDeps = Object.freeze({
    setTimeout: (...args) => globalThis.setTimeout(...args),
    clearTimeout: (...args) => globalThis.clearTimeout(...args),
    subscribeUpdate: subscribeTableUpdate,
    subscribeFillStart: subscribeTableFillStart,
    getTableAvailability: getTableAvailabilityViaApi,
    queryTableRows: queryTableRowsViaApi,
    query: querySqlViaApi,
    mutation: executeSqlMutationViaApi,
    logger: defaultLogger,
});

function normalizeSignature(result) {
    return {
        sourceSignature: String(readDerivedField(result, 'source_signature', 0) ?? '').trim(),
        inputSignature: String(readDerivedField(result, 'input_signature', 1) ?? '').trim(),
        invalidCount: Number(readDerivedField(result, 'invalid_count', 2)) || 0,
        invalidRowIds: String(readDerivedField(result, 'invalid_row_ids', 3) ?? '').trim(),
        pendingUpdateCount: Number(readDerivedField(result, 'pending_update_count', 4)) || 0,
    };
}

export async function resolveSmallCalendarDerivedFieldsContext(deps, runtime = {}) {
    const candidate = await resolveFirstAvailableTableCandidate({
        deps,
        tableNames: SMALL_CALENDAR_DERIVED_FIELDS_TABLES,
        columns: SMALL_CALENDAR_DERIVED_FIELDS_REQUIRED_COLUMNS,
        runtime,
    });
    if (candidate.status === 'ready') return { status: 'ready', context: { tableName: candidate.tableName } };
    if (candidate.status === 'absent') return { status: 'completed' };
    if (candidate.status !== 'schema-blocked') return candidate;

    const failures = candidate.failures.map(({ tableName, result }) => ({
        tableName,
        code: result?.code || 'query_failed',
        message: result?.message || '未知结构错误',
    }));

    return {
        status: 'completed',
        warning: {
            key: failures.map((item) => `${item.tableName}:${item.code}:${item.message}`).join('|'),
            action: 'small-calendar-derived-fields.schema-blocked',
            message: '当前小日历表缺少相关字段，已跳过日期派生，不影响其他表格功能',
            context: { failures },
        },
    };
}

const service = createDerivedFieldService({
    actionPrefix: 'small-calendar-derived-fields',
    defaultDeps,
    maxMutationAttempts: 2,
    mutationRetryDelayMs: 2000,
    maxSignatureRetry: 1,
    resolveContext: resolveSmallCalendarDerivedFieldsContext,
    buildSignatureSql: (context) => buildSmallCalendarDerivedFieldsSignatureSql(context.tableName),
    normalizeSignature,
    buildMutationSql: (context) => buildSmallCalendarDerivedFieldsUpdateSql(context.tableName),
    getInvalidWarning(signature) {
        if (!signature?.invalidCount) return null;
        return {
            key: signature.invalidRowIds,
            action: 'small-calendar-derived-fields.invalid-date-text',
            message: '小日历表存在无法解析的“日期”，星期几和月份天数派生已跳过这些行',
            context: {
                invalidCount: signature.invalidCount,
                invalidRowIds: signature.invalidRowIds,
            },
        };
    },
    messages: {
        contextQueryFailed: '小日历派生字段可用性查询失败',
        signatureQueryFailed: '小日历派生字段输入签名查询失败',
        mutationFailed: '小日历派生字段 SQL 批量写入未确认成功',
        mutationUnconfirmed: '小日历派生字段写入返回成功，但写后仍存在待更新行',
        mutationCircuitOpen: '小日历同一日期输入已连续写入失败两次，已暂停继续写入，等待日期、聊天或启用状态变化',
        sourceChanged: '小日历派生字段写入期间日期源发生变化，将进行一次有界签名重跑',
        signatureRetryExhausted: '小日历派生字段未能在有界重跑内确认日期源稳定',
        runError: '小日历派生字段 SQL 回填异常',
    },
});

export function startSmallCalendarDerivedFieldsInjection() {
    return service.start();
}

export function stopSmallCalendarDerivedFieldsInjection() {
    service.stop();
}

export function __test__setDeps(overrides = {}) {
    service.setDeps(overrides);
}

export function __test__reset() {
    service.reset();
}

export function __test__getState() {
    return service.getState();
}
