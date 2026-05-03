import { getRowEntryTitle, shouldPreferFullRowField } from './row-view-model.js';

export function buildGenericDetailPagerInfo(options = {}) {
    const {
        rowIndex = -1,
        rowsCount = 0,
        saving = false,
    } = options;

    const currentIndex = Number(rowIndex);
    const total = Number(rowsCount);
    const disabled = !!saving
        || !Number.isInteger(currentIndex)
        || !Number.isInteger(total)
        || currentIndex < 0
        || total <= 1
        || currentIndex >= total;

    if (disabled) {
        return {
            disabled: true,
            prevIndex: -1,
            nextIndex: -1,
        };
    }

    return {
        disabled: false,
        prevIndex: currentIndex === 0 ? total - 1 : currentIndex - 1,
        nextIndex: currentIndex === total - 1 ? 0 : currentIndex + 1,
    };
}

export function buildGenericDetailRowPayload(options = {}) {
    const {
        row,
        state,
        headers = [],
        rawHeaders = [],
        fieldBindings = {},
        sheetKey,
        rowsCount = 0,
        saving = false,
        isTableRowLocked,
        isTableCellLocked,
    } = options;

    const title = getRowEntryTitle(row, headers, rawHeaders, fieldBindings);
    const rowIndexForLock = Number.isInteger(Number(state.rowIndex)) && Number(state.rowIndex) >= 0
        ? Number(state.rowIndex)
        : -1;
    const rowLocked = rowIndexForLock >= 0 && isTableRowLocked(sheetKey, rowIndexForLock);

    const firstRawHeader = String(rawHeaders[0] ?? '').trim();
    const firstRawValue = row?.[0];
    const shouldHideLeadingPlaceholder = firstRawHeader === '' && String(firstRawValue ?? '').trim() === '';
    const shouldSkipRowIdColumn = /^row[_\s-]*id$/i.test(firstRawHeader);

    const toLockColIndex = (rawColIndex) => {
        const idx = Number(rawColIndex);
        if (!Number.isInteger(idx) || idx < 0) return -1;
        if (shouldHideLeadingPlaceholder || shouldSkipRowIdColumn) return idx - 1;
        return idx;
    };

    const pagerInfo = buildGenericDetailPagerInfo({
        rowIndex: state.rowIndex,
        rowsCount,
        saving,
    });

    const kvPairs = headers
        .map((header, rawColIndex) => {
            const rawValue = row?.[rawColIndex];
            const originValue = rawValue === undefined || rawValue === null ? '' : String(rawValue);
            const draftValue = Object.prototype.hasOwnProperty.call(state.draftValues, rawColIndex)
                ? String(state.draftValues[rawColIndex] ?? '')
                : originValue;
            const rawHeader = String(rawHeaders[rawColIndex] ?? '').trim();
            const isPlaceholderCol = shouldHideLeadingPlaceholder && rawColIndex === 0 && rawHeader === '' && originValue.trim() === '';
            const isRowIdCol = shouldSkipRowIdColumn && rawColIndex === 0;

            if (isPlaceholderCol || isRowIdCol) return null;

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
        pagerInfo,
    };
}
