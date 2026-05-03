import { Logger } from '../../error-handler.js';
import { callApiWithTimeout, getDB } from '../db-bridge.js';
import { deleteTableRowViaApi, getTableData, insertTableRow, saveTableData, updateTableRow } from '../data-api.js';

const logger = Logger.withScope({ scope: 'phone-core/chat-support/message-projection', feature: 'chat-support' });

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
    videoDesc: ['videoDesc', '视频描述'],
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

function cloneRawTableData(rawData, label = '表格数据') {
    if (!rawData || typeof rawData !== 'object') return null;

    try {
        return JSON.parse(JSON.stringify(rawData));
    } catch (error) {
        logger.warn({
            action: 'table-data.clone',
            message: `${label}深拷贝失败`,
            context: { label },
            error,
        });
        return null;
    }
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

function isRowIdHeader(header) {
    return /^row[\s_-]*id$/i.test(String(header ?? '').trim());
}

function resolveNextRowId(content, rowIdColIndex, offset = 0) {
    if (!Array.isArray(content) || rowIdColIndex < 0) return '';
    const maxRowId = content.slice(1).reduce((max, row) => {
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

function materializeMessageRowFromPayload(headers, content, payload = {}, rowOffset = 0) {
    const headerRow = Array.isArray(headers) ? headers : [];
    const rowIdColIndex = headerRow.findIndex((header) => isRowIdHeader(header));

    return headerRow.map((header, colIndex) => {
        if (colIndex === rowIdColIndex) {
            return resolveNextRowId(content, rowIdColIndex, rowOffset);
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

    const rawData = cloneRawTableData(getTableData(), '批量消息归档基线快照');
    if (!rawData) {
        return {
            ok: false,
            code: 'snapshot_clone_failed',
            message: '批量归档失败：无法创建表格快照',
            payloads: [],
            rows: [],
            rowIndexes: [],
            refreshed: false,
        };
    }

    const snapshot = buildSheetDataSnapshot(rawData, safeSheetKey);
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

    const sheet = rawData[safeSheetKey];
    if (!sheet?.content || !Array.isArray(sheet.content) || sheet.content.length === 0) {
        return {
            ok: false,
            code: 'invalid_sheet_content',
            message: '批量归档失败：消息记录表内容格式无效',
            tableName: snapshot.tableName,
            payloads: [],
            rows: [],
            rowIndexes: [],
            refreshed: false,
        };
    }

    const headers = snapshot.headers;
    const content = sheet.content;
    const payloads = normalizedMessages.map((message) => buildPhoneMessagePayloadFromHeaders(headers, message));
    const rows = payloads.map((payload, index) => materializeMessageRowFromPayload(headers, content, payload, index));
    const firstRowIndex = Math.max(1, content.length);
    const rowIndexes = rows.map((_, index) => firstRowIndex + index);

    sheet.content = [
        ...content,
        ...rows,
    ];

    const saved = await saveTableData(rawData, options.timeoutMs);
    if (!saved) {
        return {
            ok: false,
            code: 'save_failed',
            message: '批量归档失败：数据库写入失败',
            tableName: String(options.tableName || snapshot.tableName || safeSheetKey).trim(),
            payloads,
            rows,
            rowIndexes,
            refreshed: false,
        };
    }

    const refreshed = options.refreshProjection === false ? true : await refreshPhoneMessageProjection();
    dispatchPhoneTableUpdated(safeSheetKey);

    return {
        ok: true,
        code: refreshed ? 'ok' : 'ok_refresh_failed',
        message: refreshed ? '批量归档成功' : '批量归档成功，但投影刷新失败',
        tableName: String(options.tableName || snapshot.tableName || safeSheetKey).trim(),
        payloads,
        rows,
        rowIndexes,
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

export async function deletePhoneSheetRows(sheetKey, rowIndexes = [], options = {}) {
    const safeSheetKey = String(sheetKey || '').trim();
    const rawDataBeforeDelete = cloneRawTableData(getTableData(), '删除基线快照');
    if (!rawDataBeforeDelete) {
        return {
            ok: false,
            code: 'baseline_clone_failed',
            message: '删除失败：无法创建删除基线快照',
            deletedCount: 0,
            refreshed: false,
        };
    }

    const snapshot = buildSheetDataSnapshot(rawDataBeforeDelete, safeSheetKey);
    if (!snapshot) {
        return {
            ok: false,
            code: 'sheet_not_found',
            message: '未找到对应表格',
            deletedCount: 0,
            refreshed: false,
        };
    }

    const tableName = String(options.tableName || snapshot.tableName || '').trim();
    if (!tableName) {
        return {
            ok: false,
            code: 'table_name_missing',
            message: '删除失败：缺少表格名称',
            deletedCount: 0,
            refreshed: false,
        };
    }

    const normalizedRowIndexes = Array.from(new Set((Array.isArray(rowIndexes) ? rowIndexes : [rowIndexes])
        .map((value) => Number(value))
        .filter(Number.isInteger)
        .filter((value) => value >= 0 && value < snapshot.rows.length)))
        .sort((a, b) => b - a);

    if (normalizedRowIndexes.length === 0) {
        return {
            ok: false,
            code: 'empty_selection',
            message: '未选择可删除的条目',
            deletedCount: 0,
            refreshed: false,
        };
    }

    const expectedRowCount = Math.max(0, snapshot.rows.length - normalizedRowIndexes.length);
    let deletedCount = 0;

    const cloneBaselineData = () => cloneRawTableData(rawDataBeforeDelete, '删除回退数据');

    const verifySnapshotUpdated = () => {
        const latestSnapshot = getSheetDataByKey(safeSheetKey);
        if (!latestSnapshot?.rows || !Array.isArray(latestSnapshot.rows)) {
            return false;
        }
        return latestSnapshot.rows.length === expectedRowCount;
    };

    const refreshProjection = async () => {
        if (options.refreshProjection === false) {
            return true;
        }
        return await refreshPhoneTableProjection();
    };

    const applyFallbackSave = async (reasonMessage = '') => {
        const fallbackRawData = cloneBaselineData();
        if (!fallbackRawData) {
            return {
                ok: false,
                code: 'fallback_data_missing',
                message: reasonMessage ? `${reasonMessage}，且无法创建整表回退数据` : '删除失败：无法创建整表回退数据',
                deletedCount,
                refreshed: false,
            };
        }

        const targetSheet = fallbackRawData?.[safeSheetKey];
        if (!targetSheet?.content || !Array.isArray(targetSheet.content)) {
            return {
                ok: false,
                code: 'fallback_sheet_missing',
                message: reasonMessage ? `${reasonMessage}，且整表回退时未找到目标表格` : '删除失败：整表回退时未找到目标表格',
                deletedCount,
                refreshed: false,
            };
        }

        for (const rowIndex of normalizedRowIndexes) {
            const realRowIndex = rowIndex + 1;
            if (!Array.isArray(targetSheet.content[realRowIndex])) {
                return {
                    ok: false,
                    code: 'fallback_row_missing',
                    message: reasonMessage ? `${reasonMessage}，且整表回退时目标行不存在` : '删除失败：整表回退时目标行不存在',
                    deletedCount,
                    refreshed: false,
                };
            }
            targetSheet.content.splice(realRowIndex, 1);
        }

        const saved = await saveTableData(fallbackRawData);
        if (!saved) {
            return {
                ok: false,
                code: 'fallback_save_failed',
                message: reasonMessage ? `${reasonMessage}，且整表回退保存失败` : '删除失败：整表回退保存失败',
                deletedCount,
                refreshed: false,
            };
        }

        const refreshed = await refreshProjection();
        if (!verifySnapshotUpdated()) {
            return {
                ok: false,
                code: 'snapshot_not_updated',
                message: reasonMessage
                    ? `${reasonMessage}，已尝试整表回退，但最新表格快照仍未更新`
                    : '删除失败：已尝试整表回退，但最新表格快照仍未更新',
                deletedCount: normalizedRowIndexes.length,
                refreshed,
            };
        }

        dispatchPhoneTableUpdated(safeSheetKey);

        return {
            ok: true,
            code: 'ok',
            message: refreshed ? '删除成功' : '删除成功，但刷新投影失败',
            deletedCount: normalizedRowIndexes.length,
            refreshed,
        };
    };

    for (const rowIndex of normalizedRowIndexes) {
        const apiRowIndex = rowIndex + 1;
        const result = await deleteTableRowViaApi(tableName, apiRowIndex);
        if (!result.ok) {
            return await applyFallbackSave(result.message || `删除第 ${apiRowIndex} 行失败`);
        }
        deletedCount += 1;
    }

    const refreshed = await refreshProjection();
    if (!verifySnapshotUpdated()) {
        return await applyFallbackSave('删除接口返回成功，但最新表格快照未变化');
    }

    dispatchPhoneTableUpdated(safeSheetKey);

    return {
        ok: true,
        code: 'ok',
        message: refreshed ? '删除成功' : '删除成功，但刷新投影失败',
        deletedCount,
        refreshed,
    };
}
