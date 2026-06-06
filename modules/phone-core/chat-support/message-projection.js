import { Logger } from '../../error-handler.js';
import { findAutoManagedRowIdColumnIndex } from '../../utils/table-column-metadata.js';
import { callApiWithTimeout, getDB } from '../db-bridge.js';
import { deleteTableRowsBatch, getTableData, insertTableRow, insertTableRowsBatch, updateTableRow } from '../data-api.js';

const logger = Logger.withScope({ scope: 'phone-core/chat-support/message-projection', feature: 'chat-support' });
const PHONE_MESSAGE_ARCHIVE_INSERT_TIMEOUT_MS = 30000;

const PHONE_MESSAGE_HEADER_CANDIDATES = Object.freeze({
    threadId: ['threadId', '会话ID', '会话Id', '会话编号', '对话ID'],
    threadTitle: ['threadTitle', '会话标题', '会话名称', '群聊标题', '标题'],
    sender: ['sender', '发送者', '发言者', '作者'],
    senderRole: ['senderRole', '发送者身份', '角色', '身份'],
    chatTarget: ['chatTarget', '聊天对象', '对话目标'],
    content: ['content', '消息内容', '三人消息内容', '文案', '正文'],
    sentAt: ['sentAt', '消息发送时间', '发送时间', '时间'],
    messageStatus: ['messageStatus', '消息状态', '状态'],
    imageDesc: ['imageDesc', '图片描述'],
    videoDesc: ['视频描述', 'videoDesc'],
    requestId: ['requestId', '请求ID', '请求Id', '请求编号'],
    replyToMessageId: ['replyToMessageId', '回复到消息ID', '回复消息ID', '回复到'],
});

function pickExistingHeader(headers, candidates = []) {
    const available = new Set((Array.isArray(headers) ? headers : []).map((item) => String(item || '').trim()).filter(Boolean));
    for (const candidate of candidates) {
        const key = String(candidate || '').trim();
        if (key && available.has(key)) {
            return key;
        }
    }
    return '';
}

function assignMessageField(payload, headers, candidateHeaders, value) {
    const header = pickExistingHeader(headers, candidateHeaders);
    if (!header || value === undefined) return;
    payload[header] = value === null ? '' : String(value);
}

function buildSheetDataSnapshot(rawData, sheetKey) {
    const safeSheetKey = String(sheetKey || '').trim();
    if (!safeSheetKey || !rawData || typeof rawData !== 'object') return null;

    const sheet = rawData?.[safeSheetKey];
    if (!sheet?.content || !Array.isArray(sheet.content) || sheet.content.length === 0) {
        return null;
    }

    const headers = Array.isArray(sheet.content[0])
        ? sheet.content[0].map((header, index) => String(header || '').trim() || `列${index + 1}`)
        : [];

    return {
        sheetKey: safeSheetKey,
        tableName: String(sheet.name || safeSheetKey),
        headers,
        rows: sheet.content.slice(1),
    };
}

export function getSheetDataByKey(sheetKey) {
    const rawData = getTableData();
    return buildSheetDataSnapshot(rawData, sheetKey);
}

function resolveNextRowIdFromRows(rows = [], headers = [], offset = 0) {
    const headerRow = Array.isArray(headers) ? headers : [];
    const rowIdColIndex = findAutoManagedRowIdColumnIndex(headerRow);
    if (rowIdColIndex < 0 || !Array.isArray(rows)) return '';
    const maxRowId = rows.reduce((max, row) => {
        if (!Array.isArray(row)) return max;
        const numeric = Number(row[rowIdColIndex]);
        return Number.isFinite(numeric) && numeric > max ? numeric : max;
    }, 0);
    return String(maxRowId + 1 + Math.max(0, Number(offset) || 0));
}

export function buildPhoneMessagePayloadFromHeaders(headers, message = {}) {
    const payload = {};
    assignMessageField(payload, headers, PHONE_MESSAGE_HEADER_CANDIDATES.threadId, message.threadId);
    assignMessageField(payload, headers, PHONE_MESSAGE_HEADER_CANDIDATES.threadTitle, message.threadTitle);
    assignMessageField(payload, headers, PHONE_MESSAGE_HEADER_CANDIDATES.sender, message.sender);
    assignMessageField(payload, headers, PHONE_MESSAGE_HEADER_CANDIDATES.senderRole, message.senderRole);
    assignMessageField(payload, headers, PHONE_MESSAGE_HEADER_CANDIDATES.chatTarget, message.chatTarget);
    assignMessageField(payload, headers, PHONE_MESSAGE_HEADER_CANDIDATES.content, message.content);
    assignMessageField(payload, headers, PHONE_MESSAGE_HEADER_CANDIDATES.sentAt, message.sentAt);
    assignMessageField(payload, headers, PHONE_MESSAGE_HEADER_CANDIDATES.imageDesc, message.imageDesc);
    assignMessageField(payload, headers, PHONE_MESSAGE_HEADER_CANDIDATES.videoDesc, message.videoDesc);
    assignMessageField(payload, headers, PHONE_MESSAGE_HEADER_CANDIDATES.requestId, message.requestId);
    assignMessageField(payload, headers, PHONE_MESSAGE_HEADER_CANDIDATES.replyToMessageId, message.replyToMessageId);
    return payload;
}

function materializeMessageRowFromPayload(headers, existingRows = [], payload = {}, rowOffset = 0) {
    const headerRow = Array.isArray(headers) ? headers : [];
    const rowIdColIndex = findAutoManagedRowIdColumnIndex(headerRow);

    return headerRow.map((header, colIndex) => {
        if (colIndex === rowIdColIndex) {
            return resolveNextRowIdFromRows(existingRows, headerRow, rowOffset);
        }

        const key = String(header ?? '').trim();
        if (!Object.prototype.hasOwnProperty.call(payload, key)) return '';
        const value = payload[key];
        return value === undefined || value === null ? '' : String(value);
    });
}

export function buildPhoneMessagePayload(sheetKey, message = {}) {
    const snapshot = getSheetDataByKey(sheetKey);
    if (!snapshot) {
        return null;
    }

    const headers = snapshot.headers;
    const payload = buildPhoneMessagePayloadFromHeaders(headers, message);

    return {
        tableName: snapshot.tableName,
        headers,
        payload,
    };
}

export async function insertPhoneMessageRecord(sheetKey, message = {}) {
    const built = buildPhoneMessagePayload(sheetKey, message);
    if (!built) {
        return {
            ok: false,
            code: 'sheet_not_found',
            message: '未找到消息记录表',
        };
    }

    const result = await insertTableRow(built.tableName, built.payload);
    return {
        ...result,
        tableName: built.tableName,
        payload: built.payload,
    };
}

export async function updatePhoneMessageRecord(sheetKey, rowIndex, message = {}) {
    const built = buildPhoneMessagePayload(sheetKey, message);
    if (!built) {
        return {
            ok: false,
            code: 'sheet_not_found',
            message: '未找到消息记录表',
        };
    }

    return updateTableRow(built.tableName, rowIndex, built.payload);
}

export async function appendPhoneMessageRecordsBatch(sheetKey, messages = [], options = {}) {
    const safeSheetKey = String(sheetKey || '').trim();
    const sourceMessages = Array.isArray(messages) ? messages : [];
    const normalizedMessages = sourceMessages.filter((message) => message && typeof message === 'object' && !Array.isArray(message));

    if (!safeSheetKey) {
        return {
            ok: false,
            code: 'sheet_key_missing',
            message: '批量归档失败：缺少消息记录表标识',
            payloads: [],
            rows: [],
            rowIndexes: [],
            refreshed: false,
        };
    }

    if (normalizedMessages.length === 0) {
        return {
            ok: false,
            code: 'empty_messages',
            message: '批量归档失败：没有可归档的消息',
            payloads: [],
            rows: [],
            rowIndexes: [],
            refreshed: false,
        };
    }

    const snapshot = getSheetDataByKey(safeSheetKey);
    if (!snapshot) {
        return {
            ok: false,
            code: 'sheet_not_found',
            message: '批量归档失败：未找到消息记录表',
            payloads: [],
            rows: [],
            rowIndexes: [],
            refreshed: false,
        };
    }

    const headers = snapshot.headers;
    const payloads = normalizedMessages.map((message) => buildPhoneMessagePayloadFromHeaders(headers, message));
    const rows = payloads.map((payload, index) => materializeMessageRowFromPayload(headers, snapshot.rows, payload, index));
    const insertResult = await insertTableRowsBatch(snapshot.tableName, payloads, {
        refreshProjection: options.refreshProjection,
        insertTimeoutMs: PHONE_MESSAGE_ARCHIVE_INSERT_TIMEOUT_MS,
    });

    if (!insertResult.ok) {
        return {
            ok: false,
            code: insertResult.code || 'insert_failed',
            message: insertResult.message || '批量归档失败：数据库行级插入失败',
            tableName: String(options.tableName || snapshot.tableName || safeSheetKey).trim(),
            payloads,
            rows,
            rowIndexes: insertResult.rowIndexes || [],
            refreshed: false,
            rollback: insertResult.rollback || null,
            failedAt: insertResult.failedAt,
            failureResult: insertResult.failureResult,
        };
    }

    const refreshed = insertResult.refreshed !== false;
    dispatchPhoneTableUpdated(safeSheetKey);

    return {
        ok: true,
        code: refreshed ? 'ok' : 'ok_refresh_failed',
        message: refreshed ? '批量归档成功' : '批量归档成功，但投影刷新失败',
        tableName: String(options.tableName || snapshot.tableName || safeSheetKey).trim(),
        payloads,
        rows,
        rowIndexes: insertResult.rowIndexes || [],
        refreshed,
    };
}

export async function refreshPhoneTableProjection() {
    const api = getDB();
    if (!api || typeof api.refreshDataAndWorldbook !== 'function') {
        return false;
    }

    try {
        const result = await callApiWithTimeout(
            () => api.refreshDataAndWorldbook(),
            12000,
            'refreshPhoneTableProjection',
        );
        return !!result;
    } catch (error) {
        logger.warn({
            action: 'projection.refresh',
            message: 'refreshDataAndWorldbook 调用失败',
            error,
        });
        return false;
    }
}

export async function refreshPhoneMessageProjection() {
    return refreshPhoneTableProjection();
}

export function dispatchPhoneTableUpdated(sheetKey) {
    const safeSheetKey = String(sheetKey || '').trim();
    if (!safeSheetKey) return false;

    window.dispatchEvent(new CustomEvent('yuzi-phone-table-updated', {
        detail: {
            sheetKey: safeSheetKey,
            data: getTableData(),
            version: `manual_${Date.now()}`,
        },
    }));
    return true;
}

function normalizePhoneDeleteRowIndexes(rowIndexes = [], maxRowCount = Infinity) {
    const maxRows = Number(maxRowCount);
    return Array.from(new Set((Array.isArray(rowIndexes) ? rowIndexes : [rowIndexes])
        .map((value) => Number(value))
        .filter(Number.isInteger)
        .filter((value) => value >= 0)
        .filter((value) => !Number.isFinite(maxRows) || value < maxRows)))
        .sort((a, b) => b - a);
}

function buildPhoneDeleteRowIndexResult({
    requestedRowIndexes = [],
    attemptedRowIndexes = [],
    deletedRowIndexes = [],
    failedRowIndexes = [],
    unattemptedRowIndexes,
    notDeletedRowIndexes,
} = {}) {
    const requested = normalizePhoneDeleteRowIndexes(requestedRowIndexes);
    const attempted = normalizePhoneDeleteRowIndexes(attemptedRowIndexes);
    const deleted = normalizePhoneDeleteRowIndexes(deletedRowIndexes);
    const failed = normalizePhoneDeleteRowIndexes(failedRowIndexes);
    const attemptedSet = new Set(attempted);
    const deletedSet = new Set(deleted);

    return {
        requestedRowIndexes: requested,
        attemptedRowIndexes: attempted,
        deletedRowIndexes: deleted,
        failedRowIndexes: failed,
        unattemptedRowIndexes: Array.isArray(unattemptedRowIndexes)
            ? normalizePhoneDeleteRowIndexes(unattemptedRowIndexes)
            : requested.filter((rowIndex) => !attemptedSet.has(rowIndex)),
        notDeletedRowIndexes: Array.isArray(notDeletedRowIndexes)
            ? normalizePhoneDeleteRowIndexes(notDeletedRowIndexes)
            : requested.filter((rowIndex) => !deletedSet.has(rowIndex)),
    };
}

export async function deletePhoneSheetRows(sheetKey, rowIndexes = [], options = {}) {
    const safeSheetKey = String(sheetKey || '').trim();
    const requestedFallbackRowIndexes = normalizePhoneDeleteRowIndexes(rowIndexes);
    const snapshot = getSheetDataByKey(safeSheetKey);
    if (!snapshot) {
        return {
            ok: false,
            code: 'sheet_not_found',
            message: '未找到对应表格',
            deletedCount: 0,
            refreshed: false,
            ...buildPhoneDeleteRowIndexResult({ requestedRowIndexes: requestedFallbackRowIndexes }),
        };
    }

    const normalizedRowIndexes = normalizePhoneDeleteRowIndexes(rowIndexes, snapshot.rows.length);
    const tableName = String(options.tableName || snapshot.tableName || '').trim();
    if (!tableName) {
        return {
            ok: false,
            code: 'table_name_missing',
            message: '删除失败：缺少表格名称',
            deletedCount: 0,
            refreshed: false,
            ...buildPhoneDeleteRowIndexResult({ requestedRowIndexes: normalizedRowIndexes }),
        };
    }

    if (normalizedRowIndexes.length === 0) {
        return {
            ok: false,
            code: 'empty_selection',
            message: '未选择可删除的条目',
            deletedCount: 0,
            refreshed: false,
            ...buildPhoneDeleteRowIndexResult(),
        };
    }

    const result = await deleteTableRowsBatch(tableName, normalizedRowIndexes, {
        refreshProjection: options.refreshProjection,
    });
    const resultDeletedRowIndexes = Array.isArray(result.deletedRowIndexes) ? result.deletedRowIndexes : [];
    const resultFailedRowIndexes = Array.isArray(result.failedRowIndexes) ? result.failedRowIndexes : [];
    const resultAttemptedRowIndexes = Array.isArray(result.attemptedRowIndexes)
        ? result.attemptedRowIndexes
        : [...resultDeletedRowIndexes, ...resultFailedRowIndexes];

    if (!result.ok) {
        if (result.deletedCount > 0) {
            dispatchPhoneTableUpdated(safeSheetKey);
        }
        return {
            ok: false,
            code: result.code || 'failed',
            message: result.message || '删除失败：数据库未确认删除目标行',
            deletedCount: result.deletedCount || 0,
            refreshed: result.refreshed ?? false,
            ...buildPhoneDeleteRowIndexResult({
                requestedRowIndexes: normalizedRowIndexes,
                attemptedRowIndexes: resultAttemptedRowIndexes,
                deletedRowIndexes: resultDeletedRowIndexes,
                failedRowIndexes: resultFailedRowIndexes,
                unattemptedRowIndexes: result.unattemptedRowIndexes,
                notDeletedRowIndexes: result.notDeletedRowIndexes,
            }),
        };
    }

    dispatchPhoneTableUpdated(safeSheetKey);

    return {
        ok: true,
        code: result.code || 'ok',
        message: result.message || (result.refreshed === false ? '删除成功，但刷新投影失败' : '删除成功'),
        deletedCount: result.deletedCount || normalizedRowIndexes.length,
        refreshed: result.refreshed ?? true,
        ...buildPhoneDeleteRowIndexResult({
            requestedRowIndexes: normalizedRowIndexes,
            attemptedRowIndexes: resultAttemptedRowIndexes.length > 0 ? resultAttemptedRowIndexes : normalizedRowIndexes,
            deletedRowIndexes: resultDeletedRowIndexes.length > 0 ? resultDeletedRowIndexes : normalizedRowIndexes,
            failedRowIndexes: resultFailedRowIndexes,
            unattemptedRowIndexes: result.unattemptedRowIndexes || [],
            notDeletedRowIndexes: result.notDeletedRowIndexes || [],
        }),
    };
}
