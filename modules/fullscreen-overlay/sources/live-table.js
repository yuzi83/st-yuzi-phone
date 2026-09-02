import {
    getCellByHeader,
    normalizeText,
    splitSemicolonText,
} from '../../phone-theater/core/table-index.js';
import {
    SCROLLING_BARRAGE_MODEL_ID,
    TABLE_POPUP_MODEL_ID,
} from '../settings.js';
import {
    getGenericTableSignature,
    readGenericTableEvents,
} from './generic-table.js';

const SOURCE_ID = 'live-table';
const TABLE_NAME = '直播表';
const BARRAGE_FIELDS = Object.freeze([
    '剧情弹幕串',
    '推角弹幕串',
    '对线弹幕串',
]);
const ROW_ID_HEADERS = Object.freeze(['row_id', 'ROW_ID', '行号']);

function resolveTableContext(context) {
    const sheet = context?.sheet;
    const content = Array.isArray(sheet?.content) ? sheet.content : [];
    const headers = Array.isArray(context?.headers)
        ? context.headers
        : (Array.isArray(content[0]) ? content[0] : []);
    const rows = Array.isArray(context?.rows)
        ? context.rows
        : content.slice(1);

    return {
        sheetKey: normalizeText(context?.sheetKey),
        tableName: normalizeText(context?.tableName || sheet?.name),
        headers,
        rows,
        rowSelection: context?.rowSelection ?? null,
    };
}

function hasRequiredHeaders(headers) {
    const normalizedHeaders = new Set(headers.map(normalizeText));
    return BARRAGE_FIELDS.every(header => normalizedHeaders.has(header));
}

function splitBarrageField(value) {
    const text = normalizeText(value);
    if (!text) return [];
    return splitSemicolonText(text).filter(item => item.toLowerCase() !== 'none');
}

function matchesLiveTable(context) {
    const table = resolveTableContext(context);
    return table.tableName === TABLE_NAME && hasRequiredHeaders(table.headers);
}

function findRowIdColumnIndex(headers) {
    const normalizedHeaders = headers.map(header => normalizeText(header));
    return ROW_ID_HEADERS
        .map(header => normalizedHeaders.indexOf(header))
        .find(index => index >= 0) ?? -1;
}

function selectRows(table) {
    if (!table.rowSelection || typeof table.rowSelection !== 'object') {
        return table.rows.map((row, rowIndex) => ({ row, rowIndex }));
    }

    const selectedRowIndexes = new Set(
        (Array.isArray(table.rowSelection.rowIndexes)
            ? table.rowSelection.rowIndexes
            : [])
            .map(value => Number(value))
            .filter(value => Number.isInteger(value) && value >= 0),
    );
    const selectedRowIds = new Set(
        (Array.isArray(table.rowSelection.rowIds)
            ? table.rowSelection.rowIds
            : [])
            .map(value => normalizeText(value))
            .filter(Boolean),
    );
    if (selectedRowIndexes.size === 0 && selectedRowIds.size === 0) return [];

    const rowIdColumnIndex = findRowIdColumnIndex(table.headers);
    return table.rows
        .map((row, rowIndex) => ({ row, rowIndex }))
        .filter(({ row, rowIndex }) => {
            const rowId = rowIdColumnIndex >= 0
                ? normalizeText(row?.[rowIdColumnIndex])
                : '';
            return rowId
                ? selectedRowIds.has(rowId)
                : selectedRowIndexes.has(rowIndex);
        });
}

function getLiveTableSignature(context) {
    if (context?.modelId === TABLE_POPUP_MODEL_ID) {
        return getGenericTableSignature(context);
    }
    const table = resolveTableContext(context);
    if (table.tableName !== TABLE_NAME || !hasRequiredHeaders(table.headers)) return '';

    return JSON.stringify(readLiveTableEvents({
        ...context,
        rowSelection: null,
    }).map(event => event.text));
}

function readLiveTableEvents(context) {
    if (context?.modelId === TABLE_POPUP_MODEL_ID) {
        return readGenericTableEvents(context, SOURCE_ID);
    }
    const table = resolveTableContext(context);
    if (table.tableName !== TABLE_NAME || !hasRequiredHeaders(table.headers)) {
        return Object.freeze([]);
    }

    const events = [];
    selectRows(table).forEach(({ row, rowIndex }) => {
        BARRAGE_FIELDS.forEach((header) => {
            splitBarrageField(getCellByHeader(table, row, header)).forEach((text, itemIndex) => {
                events.push(Object.freeze({
                    sourceId: SOURCE_ID,
                    sheetKey: table.sheetKey,
                    text,
                    rowIndex,
                    field: header,
                    itemIndex,
                }));
            });
        });
    });
    return Object.freeze(events);
}

export function createLiveTableSourceAdapter() {
    return Object.freeze({
        id: SOURCE_ID,
        modelId: SCROLLING_BARRAGE_MODEL_ID,
        modelIds: Object.freeze([
            SCROLLING_BARRAGE_MODEL_ID,
            TABLE_POPUP_MODEL_ID,
        ]),
        defaultEnabled: true,
        requiredHeaders: BARRAGE_FIELDS,
        matches: matchesLiveTable,
        getSignature: getLiveTableSignature,
        readEvents: readLiveTableEvents,
    });
}
