import { TABLE_POPUP_MODEL_ID } from '../settings.js';
import { normalizeText } from '../../phone-theater/core/table-index.js';

const SOURCE_ID = 'generic-table';
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

function findRowIdColumnIndex(headers) {
    const normalizedHeaders = headers.map(header => normalizeText(header));
    return ROW_ID_HEADERS
        .map(header => normalizedHeaders.indexOf(header))
        .find(index => index >= 0) ?? -1;
}

function selectRows(table) {
    if (!table.rowSelection || typeof table.rowSelection !== 'object') {
        return table.rows.length > 0 ? [{ row: table.rows[0], rowIndex: 0 }] : [];
    }

    const selectedRowIndexes = new Set(
        (Array.isArray(table.rowSelection.rowIndexes) ? table.rowSelection.rowIndexes : [])
            .map(Number)
            .filter(value => Number.isInteger(value) && value >= 0),
    );
    const selectedRowIds = new Set(
        (Array.isArray(table.rowSelection.rowIds) ? table.rowSelection.rowIds : [])
            .map(normalizeText)
            .filter(Boolean),
    );
    if (selectedRowIndexes.size === 0 && selectedRowIds.size === 0) return [];

    const rowIdColumnIndex = findRowIdColumnIndex(table.headers);
    return table.rows
        .map((row, rowIndex) => ({ row, rowIndex }))
        .filter(({ row, rowIndex }) => {
            const rowId = rowIdColumnIndex >= 0 ? normalizeText(row?.[rowIdColumnIndex]) : '';
            return selectedRowIds.size > 0 && rowId
                ? selectedRowIds.has(rowId)
                : selectedRowIndexes.has(rowIndex);
        });
}

export function getGenericTableSignature(context) {
    const table = resolveTableContext(context);
    return JSON.stringify([table.headers, table.rows]);
}

export function readGenericTableEvents(context, sourceId = SOURCE_ID) {
    const table = resolveTableContext(context);
    const events = selectRows(table).map(({ row, rowIndex }) => Object.freeze({
        sourceId,
        sheetKey: table.sheetKey,
        rowIndex,
        cells: Object.freeze(table.headers.map((header, columnIndex) => Object.freeze({
            label: normalizeText(header) || `字段 ${columnIndex + 1}`,
            value: String(row?.[columnIndex] ?? ''),
        }))),
    }));
    return Object.freeze(events);
}

export function createGenericTableSourceAdapter() {
    return Object.freeze({
        id: SOURCE_ID,
        modelId: TABLE_POPUP_MODEL_ID,
        modelIds: Object.freeze([TABLE_POPUP_MODEL_ID]),
        defaultEnabled: false,
        matches(context) {
            return Boolean(resolveTableContext(context).sheetKey);
        },
        getSignature: getGenericTableSignature,
        readEvents: readGenericTableEvents,
    });
}
