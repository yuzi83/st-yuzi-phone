import { Logger } from '../error-handler.js';
import { getDB } from '../phone-core/db-bridge.js';

const logger = Logger.withScope({ scope: 'table-update-review/snapshot', feature: 'table-update-review' });
const ROW_ID_HEADERS = ['row_id', 'ROW_ID', '行号'];
const REVIEW_IDENTITY_HEADERS = ['row_id', 'ROW_ID', '行号', 'id', 'ID'];

function isPlainObject(value) {
    return Object.prototype.toString.call(value) === '[object Object]';
}

function cloneRawValue(value) {
    if (Array.isArray(value)) return Array.from(value, cloneRawValue);
    if (!isPlainObject(value)) return value;
    return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, cloneRawValue(entry)]),
    );
}

function cloneRawSheet(sheet) {
    return cloneRawValue(sheet);
}

export function cloneRawTableSnapshot(rawData) {
    return cloneRawValue(rawData);
}

export function selectChangedRawTableSnapshot(rawData, tables = []) {
    if (!isPlainObject(rawData) || !Array.isArray(tables)) return {};
    const changedSheetKeys = new Set(
        tables
            .map(table => String(table?.sheetKey ?? '').trim())
            .filter(Boolean),
    );
    return Object.fromEntries(
        Object.entries(rawData)
            .filter(([sheetKey]) => changedSheetKeys.has(sheetKey))
            .map(([sheetKey, sheet]) => [sheetKey, cloneRawSheet(sheet)]),
    );
}

export function hasRequiredChangedRawTableSnapshot(changedSnapshot, tables = []) {
    if (!isPlainObject(changedSnapshot) || !Array.isArray(tables)) return false;
    return tables.every((table) => {
        const changes = Array.isArray(table?.changes) ? table.changes : [];
        const requiresCurrentSheet = changes.some((change) => (
            change?.type === 'insert' || change?.type === 'update'
        ));
        if (!requiresCurrentSheet) return true;

        const sheetKey = String(table?.sheetKey ?? '').trim();
        if (!sheetKey || !Object.hasOwn(changedSnapshot, sheetKey)) return false;
        const sheet = changedSnapshot[sheetKey];
        return isPlainObject(sheet)
            && Array.isArray(sheet.content)
            && Array.isArray(sheet.content[0]);
    });
}

export function isCompleteRawTableSnapshot(value) {
    if (!isPlainObject(value)) return false;
    const physicalSheets = Object.entries(value)
        .filter(([sheetKey]) => String(sheetKey).startsWith('sheet_'));
    return physicalSheets.length > 0
        && physicalSheets.every(([, sheet]) => (
            isPlainObject(sheet)
            && Array.isArray(sheet.content)
            && Array.isArray(sheet.content[0])
        ));
}

export function getSingleTableUpdatePayload(value) {
    if (!isPlainObject(value) || !Array.isArray(value.content)) return null;
    const sheetKey = [value.sheetKey, value.tableKey, value.key]
        .map(candidate => String(candidate ?? '').trim())
        .find(Boolean);
    if (!sheetKey) return null;
    const {
        sheetKey: _sheetKey,
        tableKey: _tableKey,
        key: _key,
        ...sheet
    } = value;
    return {
        sheetKey,
        sheet: cloneRawSheet(sheet),
    };
}

export function mergeTableUpdatePayload(payload, currentRawSnapshot, lastCompleteRawSnapshot) {
    if (isCompleteRawTableSnapshot(payload)) {
        return cloneRawTableSnapshot(payload);
    }

    const singleSheetPayload = getSingleTableUpdatePayload(payload);
    if (!singleSheetPayload) {
        const fallbackSnapshot = isCompleteRawTableSnapshot(currentRawSnapshot)
            ? currentRawSnapshot
            : (isCompleteRawTableSnapshot(lastCompleteRawSnapshot)
                ? lastCompleteRawSnapshot
                : {});
        return cloneRawTableSnapshot(fallbackSnapshot);
    }

    const baseSnapshot = isCompleteRawTableSnapshot(currentRawSnapshot)
        ? currentRawSnapshot
        : (isCompleteRawTableSnapshot(lastCompleteRawSnapshot)
            ? lastCompleteRawSnapshot
            : {});
    const merged = cloneRawTableSnapshot(baseSnapshot) || {};
    merged[singleSheetPayload.sheetKey] = {
        ...(isPlainObject(merged[singleSheetPayload.sheetKey])
            ? merged[singleSheetPayload.sheetKey]
            : {}),
        ...singleSheetPayload.sheet,
    };
    return merged;
}

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
    return normalizeTableSnapshot(readCurrentRawTableSnapshot());
}

export function readCurrentRawTableSnapshot() {
    const api = getDB();
    if (!api || typeof api.exportTableAsJson !== 'function') {
        const error = new Error('AutoCardUpdaterAPI.exportTableAsJson 不可用');
        logger.warn({ action: 'snapshot.read', message: '读取表格快照失败：API 不可用' });
        throw error;
    }
    try {
        return api.exportTableAsJson();
    } catch (error) {
        logger.warn({ action: 'snapshot.read', message: '读取表格快照失败', error });
        throw error;
    }
}
