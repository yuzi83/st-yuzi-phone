import { resolveRowIdentity } from '../table-update-review/snapshot.js';

function normalizeRowIndex(value) {
    const rowIndex = Number(value);
    return Number.isInteger(rowIndex) && rowIndex >= 0 ? rowIndex : -1;
}

function buildResolvedResult(rowIndex, matchedBy) {
    return {
        rowIndex,
        matchedBy,
        found: rowIndex >= 0,
    };
}

export function resolveReviewIntentTargetRowIndex(intent = {}, context = {}) {
    const changeType = String(intent?.changeType || '').trim();
    if (changeType === 'delete') return buildResolvedResult(-1, 'delete');

    const rows = Array.isArray(context.rows) ? context.rows : [];
    const headers = Array.isArray(context.headers) ? context.headers : [];
    const rawHeaders = Array.isArray(context.rawHeaders) ? context.rawHeaders : [];
    const targetRowId = String(intent?.rowId || '').trim();

    if (targetRowId) {
        const rowIndex = rows.findIndex((row, index) => {
            if (!Array.isArray(row)) return false;
            const identity = resolveRowIdentity(row, headers, rawHeaders, index);
            return String(identity.rowId || '').trim() === targetRowId;
        });
        if (rowIndex >= 0) {
            return {
                ...buildResolvedResult(rowIndex, 'rowId'),
                matchedBy: 'rowId',
            };
        }
        return buildResolvedResult(-1, 'none');
    }

    const fallbackRowIndex = normalizeRowIndex(intent?.rowIndex);
    if (fallbackRowIndex >= 0 && Array.isArray(rows[fallbackRowIndex])) {
        return {
            ...buildResolvedResult(fallbackRowIndex, 'rowIndex'),
            matchedBy: 'rowIndex',
        };
    }

    return buildResolvedResult(-1, 'none');
}
