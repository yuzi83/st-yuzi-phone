import { Logger } from '../../error-handler.js';
import { querySqlViaApi, executeSqlMutationViaApi } from '../data-api.js';
import { subscribeTableUpdate } from '../callbacks.js';
import {
    buildSmallCalendarDerivedFieldsAvailabilitySql,
    buildSmallCalendarDerivedFieldsSignatureSql,
    buildSmallCalendarDerivedFieldsUpdateSql,
} from './small-calendar-derived-fields-sql.js';

const logger = Logger.withScope({ scope: 'phone-core/derived-fields/small-calendar-derived-fields', feature: 'derived-fields' });

const MAX_SIGNATURE_RETRY = 1;

const runtime = {
    unsubscribe: null,
    running: false,
    pending: false,
    applying: false,
    lastInputSignature: null,
    lastInvalidWarningSignature: null,
};

function normalizeText(value) {
    return String(value ?? '').trim();
}

function readSignatureField(queryResult, fieldName, valueIndex) {
    const row = Array.isArray(queryResult?.rows) ? queryResult.rows[0] : null;
    if (row && typeof row === 'object' && !Array.isArray(row) && fieldName in row) {
        return row[fieldName];
    }
    if (Array.isArray(row)) return row[valueIndex];

    const valuesRow = Array.isArray(queryResult?.values) ? queryResult.values[0] : null;
    if (Array.isArray(valuesRow)) return valuesRow[valueIndex];
    return '';
}

function normalizeSignaturePayload(queryResult) {
    return {
        sourceSignature: normalizeText(readSignatureField(queryResult, 'source_signature', 0)),
        inputSignature: normalizeText(readSignatureField(queryResult, 'input_signature', 1)),
        invalidCount: Number(readSignatureField(queryResult, 'invalid_count', 2)) || 0,
        invalidRowIds: normalizeText(readSignatureField(queryResult, 'invalid_row_ids', 3)),
    };
}

function readAvailability(queryResult) {
    return Number(readSignatureField(queryResult, 'is_available', 0)) === 1;
}

async function querySmallCalendarAvailability() {
    const result = await querySqlViaApi(buildSmallCalendarDerivedFieldsAvailabilitySql());
    if (!result?.ok) {
        logger.debug({
            action: 'small-calendar-derived-fields.availability-query-failed',
            message: '小日历派生字段可用性查询失败，已降级跳过',
            context: { code: result?.code, message: result?.message },
        });
        return false;
    }
    return readAvailability(result);
}

async function queryInputSignature(stage) {
    const result = await querySqlViaApi(buildSmallCalendarDerivedFieldsSignatureSql());
    if (!result?.ok) {
        logger.warn({
            action: 'small-calendar-derived-fields.signature-query-failed',
            message: '小日历派生字段输入签名查询失败',
            context: { stage, code: result?.code, message: result?.message },
        });
        return null;
    }
    return normalizeSignaturePayload(result);
}


function warnInvalidDates(signaturePayload) {
    if (!signaturePayload || signaturePayload.invalidCount <= 0) return;
    const warningSignature = [
        String(signaturePayload.invalidCount),
        signaturePayload.invalidRowIds,
        signaturePayload.sourceSignature,
    ].join('\u001d');
    if (warningSignature === runtime.lastInvalidWarningSignature) return;
    runtime.lastInvalidWarningSignature = warningSignature;

    logger.warn({
        action: 'small-calendar-derived-fields.invalid-date-text',
        message: '小日历表存在无法解析的“日期”，星期几和月份几天派生将跳过这些行',
        context: {
            invalidCount: signaturePayload.invalidCount,
            invalidRowIds: signaturePayload.invalidRowIds,
        },
    });
}

async function executeSmallCalendarDerivedFieldsUpdate(preSignaturePayload, attempt) {
    const mutationResult = await executeSqlMutationViaApi(buildSmallCalendarDerivedFieldsUpdateSql());
    if (!mutationResult?.ok) {
        logger.warn({
            action: 'small-calendar-derived-fields.sql-update-failed',
            message: '小日历派生字段 SQL 批量写入未确认成功',
            context: {
                attempt,
                code: mutationResult?.code,
                message: mutationResult?.message,
            },
        });
        return false;
    }

    const postSignaturePayload = await queryInputSignature('post-update');
    if (!postSignaturePayload) return false;

    if (postSignaturePayload.sourceSignature === preSignaturePayload.sourceSignature) {
        runtime.lastInputSignature = postSignaturePayload.inputSignature;
        warnInvalidDates(postSignaturePayload);
        return true;
    }

    logger.warn({
        action: 'small-calendar-derived-fields.source-changed',
        message: '小日历派生字段 SQL 写入期间日期源发生变化，将进行有界重试',
        context: {
            attempt,
            maxRetry: MAX_SIGNATURE_RETRY,
        },
    });
    return null;
}


async function runSmallCalendarDerivedFieldsPass(attempt) {
    const available = await querySmallCalendarAvailability();
    if (!available) return true;

    const preSignaturePayload = await queryInputSignature('pre-update');
    if (!preSignaturePayload) return false;

    warnInvalidDates(preSignaturePayload);

    if (preSignaturePayload.inputSignature === runtime.lastInputSignature) {
        return true;
    }

    return executeSmallCalendarDerivedFieldsUpdate(preSignaturePayload, attempt);
}

async function runSmallCalendarDerivedFieldsInjection() {
    if (runtime.running) {
        runtime.pending = true;
        return;
    }

    runtime.running = true;
    try {
        do {
            runtime.pending = false;
            runtime.applying = true;
            let completed = false;
            for (let attempt = 0; attempt <= MAX_SIGNATURE_RETRY; attempt += 1) {
                const passResult = await runSmallCalendarDerivedFieldsPass(attempt);
                if (passResult === true) {
                    completed = true;
                    break;
                }
                if (passResult === false) {
                    completed = false;
                    break;
                }
            }
            if (!completed) {
                logger.warn({
                    action: 'small-calendar-derived-fields.retry-exhausted',
                    message: '小日历派生字段 SQL 回填未能在有界重试内确认日期源稳定',
                    context: { maxRetry: MAX_SIGNATURE_RETRY },
                });
            }
            runtime.applying = false;
        } while (runtime.pending);
    } catch (error) {
        logger.warn({
            action: 'small-calendar-derived-fields.run-error',
            message: '小日历派生字段 SQL 回填失败',
            error,
        });
    } finally {
        runtime.running = false;
        runtime.applying = false;
    }
}

function handleTableUpdate() {
    if (runtime.applying) {
        runtime.pending = true;
        return;
    }
    void runSmallCalendarDerivedFieldsInjection();
}

export function startSmallCalendarDerivedFieldsInjection() {
    if (runtime.unsubscribe) return true;
    const unsubscribe = subscribeTableUpdate(handleTableUpdate);
    runtime.unsubscribe = typeof unsubscribe === 'function' ? unsubscribe : null;
    if (!runtime.unsubscribe) return false;

    void runSmallCalendarDerivedFieldsInjection();
    return true;
}

export function stopSmallCalendarDerivedFieldsInjection() {
    if (typeof runtime.unsubscribe === 'function') {
        runtime.unsubscribe();
    }
    runtime.unsubscribe = null;
    runtime.running = false;
    runtime.pending = false;
    runtime.applying = false;
    runtime.lastInputSignature = null;
    runtime.lastInvalidWarningSignature = null;
}
