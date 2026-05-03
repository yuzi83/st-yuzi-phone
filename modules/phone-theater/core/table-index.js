import { getSheetKeys } from '../../phone-core/data-api.js';

export function normalizeText(value) {
    return String(value ?? '').trim();
}

function cloneRow(row) {
    return Array.isArray(row) ? [...row] : [];
}

function normalizeHeader(header, index) {
    return normalizeText(header) || `列${index + 1}`;
}

export function buildTheaterTableIndex(rawData) {
    const tableByName = new Map();
    const tableBySheetKey = new Map();
    const sheetKeys = getSheetKeys(rawData);

    sheetKeys.forEach((sheetKey) => {
        const sheet = rawData?.[sheetKey];
        const tableName = normalizeText(sheet?.name || sheetKey);
        const content = Array.isArray(sheet?.content) ? sheet.content : [];
        if (!tableName || content.length <= 0) return;

        const headers = Array.isArray(content[0])
            ? content[0].map(normalizeHeader)
            : [];
        const rows = content.slice(1).map(cloneRow);
        const table = {
            sheetKey,
            tableName,
            sheet,
            headers,
            rows,
            rowCount: rows.length,
            orderNo: Number.isFinite(sheet?.orderNo) ? Number(sheet.orderNo) : Number.POSITIVE_INFINITY,
        };

        if (!tableByName.has(tableName)) {
            tableByName.set(tableName, table);
        }
        tableBySheetKey.set(sheetKey, table);
    });

    return {
        sheetKeys,
        tableByName,
        tableBySheetKey,
    };
}

export function getCellByHeader(table, row, headerName, fallback = '') {
    if (!table || !Array.isArray(row)) return fallback;
    const headers = Array.isArray(table.headers) ? table.headers : [];
    const index = headers.findIndex(header => normalizeText(header) === normalizeText(headerName));
    if (index < 0) return fallback;
    const value = row[index];
    return value === undefined || value === null ? fallback : value;
}

export function splitSemicolonText(value) {
    const text = normalizeText(value);
    if (!text) return [];
    return text
        .replace(/；/g, ';')
        .split(';')
        .map(part => normalizeText(part))
        .filter(Boolean);
}

export function resolveRowIdentity(table, row, headerName, fallbackPrefix, rowIndex) {
    const fallback = `${fallbackPrefix}${rowIndex + 1}`;
    return normalizeText(getCellByHeader(table, row, headerName, fallback)) || fallback;
}

export function mapTheaterRows(table, mapper) {
    if (!table || !Array.isArray(table.rows)) return [];
    return table.rows.map((row, rowIndex) => mapper(row, rowIndex)).filter(Boolean);
}
