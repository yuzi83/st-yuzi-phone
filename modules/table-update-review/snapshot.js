import { Logger } from '../error-handler.js';
import { getDB } from '../phone-core/db-bridge.js';

const logger = Logger.withScope({ scope: 'table-update-review/snapshot', feature: 'table-update-review' });
const ROW_ID_HEADERS = ['row_id', 'ROW_ID', '行号'];
const REVIEW_IDENTITY_HEADERS = ['row_id', 'ROW_ID', '行号', 'id', 'ID'];

function isReviewIdentityHeader(header) {
    const normalized = normalizeText(header).toLowerCase();
    return REVIEW_IDENTITY_HEADERS.some((candidate) => normalizeText(candidate).toLowerCase() === normalized);
}

function normalizeText(value) {
    return String(value ?? '').trim();
}

function normalizeCellValue(value) {
    if (value === undefined || value === null) return '';
    return String(value);
}

function findHeaderIndex(headers = [], candidates = ROW_ID_HEADERS) {
    const normalized = headers.map((header) => normalizeText(header));
    for (const candidate of candidates) {
        const index = normalized.indexOf(candidate);
        if (index >= 0) return index;
    }
    return -1;
}

export function resolveRowIdentity(row = [], headers = [], rawHeaders = [], rowIndex = -1) {
    const headerSource = rawHeaders.length > 0 ? rawHeaders : headers;
    const rowIdColumnIndex = findHeaderIndex(headerSource);
    const rowId = rowIdColumnIndex >= 0 ? normalizeText(row?.[rowIdColumnIndex]) : '';
    const fallbackIndex = Number(rowIndex);
    return {
        rowId,
        rowIndex: Number.isInteger(fallbackIndex) && fallbackIndex >= 0 ? fallbackIndex : -1,
        rowKey: rowId || `row-index:${fallbackIndex}`,
        rowIdHeader: rowIdColumnIndex >= 0 ? normalizeText(headerSource[rowIdColumnIndex]) : '',
    };
}

function resolveRowTitle(row = [], headers = []) {
    const titlePatterns = /(标题|名称|姓名|主题|name|title)/i;
    for (let index = 0; index < headers.length; index++) {
        if (!titlePatterns.test(normalizeText(headers[index]))) continue;
        const text = normalizeText(row[index]);
        if (text) return text;
    }
    for (let index = 0; index < row.length; index++) {
        if (isReviewIdentityHeader(headers[index])) continue;
        const cell = row[index];
        const text = normalizeText(cell);
        if (text) return text.slice(0, 48);
    }
    return '未命名';
}

function normalizeSheet(sheetKey, sheet) {
    const content = Array.isArray(sheet?.content) ? sheet.content : [];
    const headers = Array.isArray(content[0]) ? content[0].map(normalizeText) : [];
    const rows = content.slice(1).filter(Array.isArray).map((row, rowIndex) => {
        const identity = resolveRowIdentity(row, headers, headers, rowIndex);
        const cells = {};
        headers.forEach((header, colIndex) => {
            const key = header || `列${colIndex + 1}`;
            cells[key] = normalizeCellValue(row[colIndex]);
        });
        return {
            rowId: identity.rowId,
            rowIndex,
            rowKey: identity.rowKey,
            rowTitle: resolveRowTitle(row, headers),
            cells,
        };
    });

    return {
        sheetKey,
        tableName: normalizeText(sheet?.name || sheet?.tableName || sheetKey),
        headers,
        rowIdHeader: findHeaderIndex(headers) >= 0 ? headers[findHeaderIndex(headers)] : '',
        rows,
    };
}

export function normalizeTableSnapshot(rawData) {
    if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
        return { capturedAt: Date.now(), sheets: [] };
    }
    const sheets = Object.keys(rawData)
        .filter((key) => key.startsWith('sheet_'))
        .map((sheetKey) => normalizeSheet(sheetKey, rawData[sheetKey]))
        .filter((sheet) => sheet.headers.length > 0);
    return { capturedAt: Date.now(), sheets };
}

export function readCurrentTableSnapshot() {
    const api = getDB();
    if (!api || typeof api.exportTableAsJson !== 'function') {
        const error = new Error('AutoCardUpdaterAPI.exportTableAsJson 不可用');
        logger.warn({ action: 'snapshot.read', message: '读取表格快照失败：API 不可用' });
        throw error;
    }
    try {
        return normalizeTableSnapshot(api.exportTableAsJson());
    } catch (error) {
        logger.warn({ action: 'snapshot.read', message: '读取表格快照失败', error });
        throw error;
    }
}
