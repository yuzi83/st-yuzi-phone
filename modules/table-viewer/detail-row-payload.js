import { getRowEntryTitle, shouldPreferFullRowField } from './row-view-model.js';

export function buildGenericDetailRowPayload(options = {}) {
    const {
        row,
        state,
        headers = [],
        rawHeaders = [],
        fieldBindings = {},
        sheetKey,
        isTableRowLocked,
        isTableCellLocked,
    } = options;

    const title = getRowEntryTitle(row, headers, rawHeaders, fieldBindings);
    const rowIndexForLock = state.rowIndex;
    const rowLocked = isTableRowLocked(sheetKey, rowIndexForLock);

    const firstRawHeader = String(rawHeaders[0] ?? '').trim();
    const firstRawValue = row?.[0];
    const shouldHideLeadingPlaceholder = firstRawHeader === '' && String(firstRawValue ?? '').trim() === '';

    const toLockColIndex = (rawColIndex) => {
        const idx = Number(rawColIndex);
        if (!Number.isInteger(idx) || idx < 0) return -1;
        return shouldHideLeadingPlaceholder ? idx - 1 : idx;
    };

    const kvPairs = headers
        .map((header, rawColIndex) => {
            const rawValue = row?.[rawColIndex];
            const originValue = rawValue === undefined || rawValue === null ? '' : String(rawValue);
            const draftValue = Object.prototype.hasOwnProperty.call(state.draftValues, rawColIndex)
                ? String(state.draftValues[rawColIndex] ?? '')
                : originValue;
            const rawHeader = String(rawHeaders[rawColIndex] ?? '').trim();
            const isPlaceholderCol = shouldHideLeadingPlaceholder && rawColIndex === 0 && rawHeader === '' && originValue.trim() === '';

            if (isPlaceholderCol) return null;

            const lockColIndex = toLockColIndex(rawColIndex);
            const cellLocked = lockColIndex >= 0 && isTableCellLocked(sheetKey, rowIndexForLock, lockColIndex);

            return {
                key: header,
                value: draftValue,
                originValue,
                rawColIndex,
                lockColIndex,
                isLocked: rowLocked || cellLocked,
                cellLocked,
                preferFullRow: shouldPreferFullRowField({
                    key: header,
                    value: draftValue,
                }),
            };
        })
        .filter(Boolean);

    return {
        title,
        rowIndexForLock,
        rowLocked,
        shouldHideLeadingPlaceholder,
        toLockColIndex,
        kvPairs,
    };
}
