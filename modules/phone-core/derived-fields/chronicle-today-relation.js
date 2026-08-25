import { Logger } from '../../error-handler.js';
import { executeSqlMutationViaApi, getTableAvailabilityViaApi, querySqlViaApi, queryTableRowsViaApi } from '../data-api.js';
import { subscribeTableFillStart, subscribeTableUpdate } from '../callbacks.js';
import { createDerivedFieldService, readDerivedField } from './derived-field-service.js';
import { resolveFirstAvailableTableCandidate } from './table-candidate-resolver.js';
import {
    CHRONICLE_TODAY_RELATION_ANCHOR_COLUMN_ALIASES,
    CHRONICLE_TODAY_RELATION_ANCHOR_REQUIRED_COLUMNS,
    CHRONICLE_TODAY_RELATION_ANCHOR_TABLES,
    CHRONICLE_TODAY_RELATION_COLUMN_ALIASES,
    CHRONICLE_TODAY_RELATION_REQUIRED_COLUMNS,
    CHRONICLE_TODAY_RELATION_TABLES,
    buildChronicleTodayRelationSignatureSql,
    buildChronicleTodayRelationUpdateSql,
} from './chronicle-today-relation-sql.js';

export { CHRONICLE_TODAY_RELATION_ANCHOR_TABLES, CHRONICLE_TODAY_RELATION_TABLES };

const defaultLogger = Logger.withScope({
    scope: 'phone-core/derived-fields/chronicle-today-relation',
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

function normalizeText(value) {
    return String(value ?? '').trim();
}

function normalizeInvalidRowIds(value) {
    return [...new Set(normalizeText(value)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
        .join(',');
}

function normalizeSignature(result) {
    const invalidRowIds = normalizeInvalidRowIds(readDerivedField(result, 'invalid_row_ids', 3));
    return {
        sourceSignature: normalizeText(readDerivedField(result, 'source_signature', 0)),
        inputSignature: normalizeText(readDerivedField(result, 'input_signature', 1)),
        invalidCount: invalidRowIds ? invalidRowIds.split(',').length : 0,
        invalidRowIds,
        pendingUpdateCount: Number(readDerivedField(result, 'pending_update_count', 4)) || 0,
    };
}

function buildSchemaBlockedResult(failures) {
    const details = failures.map(({ tableName, result }) => ({
        tableName,
        code: result?.code || 'query_failed',
        message: result?.message || '未知结构错误',
    }));
    const key = details.map((item) => `${item.tableName}:${item.code}:${item.message}`).join('|');
    return {
        status: 'completed',
        warning: {
            key,
            action: 'chronicle-today-relation.schema-blocked',
            message: '当前纪要表缺少相关表或字段，已跳过“与今天的关系”自动计算，不影响其他表格功能',
            context: { failures: details },
        },
    };
}

function normalizeCandidateContextResult(candidate) {
    if (candidate.status === 'schema-blocked') return buildSchemaBlockedResult(candidate.failures);
    if (candidate.status === 'absent') return { status: 'completed' };
    return candidate;
}

export async function resolveChronicleTodayRelationContext(deps, runtime = {}) {
    const chronicleCandidate = await resolveFirstAvailableTableCandidate({
        deps,
        tableNames: CHRONICLE_TODAY_RELATION_TABLES,
        columns: CHRONICLE_TODAY_RELATION_REQUIRED_COLUMNS,
        columnAliases: CHRONICLE_TODAY_RELATION_COLUMN_ALIASES,
        runtime,
    });
    if (chronicleCandidate.status !== 'ready') return normalizeCandidateContextResult(chronicleCandidate);

    const anchorCandidate = await resolveFirstAvailableTableCandidate({
        deps,
        tableNames: CHRONICLE_TODAY_RELATION_ANCHOR_TABLES,
        columns: CHRONICLE_TODAY_RELATION_ANCHOR_REQUIRED_COLUMNS,
        columnAliases: CHRONICLE_TODAY_RELATION_ANCHOR_COLUMN_ALIASES,
        runtime,
    });
    if (anchorCandidate.status !== 'ready') return normalizeCandidateContextResult(anchorCandidate);

    return {
        status: 'ready',
        context: {
            chronicleTable: chronicleCandidate.tableName,
            anchorTable: anchorCandidate.tableName,
        },
    };
}

const service = createDerivedFieldService({
    actionPrefix: 'chronicle-today-relation',
    defaultDeps,
    maxMutationAttempts: 2,
    mutationRetryDelayMs: 2000,
    maxSignatureRetry: 1,
    resolveContext: resolveChronicleTodayRelationContext,
    buildSignatureSql: (context) => buildChronicleTodayRelationSignatureSql(context.anchorTable, context.chronicleTable),
    normalizeSignature,
    buildMutationSql: (context) => buildChronicleTodayRelationUpdateSql(context.anchorTable, context.chronicleTable),
    getInvalidWarning(signature) {
        if (!signature?.invalidRowIds) return null;
        return {
            key: signature.invalidRowIds,
            action: 'chronicle-today-relation.invalid-time-span',
            message: '纪要表存在无法解析的“时间跨度”，SQL 派生已跳过这些行',
            context: {
                invalidCount: signature.invalidCount,
                invalidRowIds: signature.invalidRowIds,
            },
        };
    },
    messages: {
        contextQueryFailed: '纪要表结构检查查询失败',
        signatureQueryFailed: '纪要表“与今天的关系”输入签名查询失败',
        mutationFailed: '纪要表“与今天的关系”SQL 批量写入未确认成功',
        mutationUnconfirmed: '纪要表派生写入返回成功，但写后仍存在待更新行',
        mutationCircuitOpen: '纪要表同一业务输入已连续写入失败两次，已暂停继续写入，等待时间、聊天或启用状态变化',
        sourceChanged: '纪要表派生写入期间源数据发生变化，将进行一次有界签名重跑',
        signatureRetryExhausted: '纪要表“与今天的关系”未能在有界重跑内确认源数据稳定',
        runError: '纪要表“与今天的关系”SQL 派生异常',
    },
});

export function startChronicleTodayRelationInjection() {
    return service.start();
}

export function stopChronicleTodayRelationInjection() {
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
