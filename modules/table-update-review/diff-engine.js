function normalizeSheetList(snapshot = {}) {
    return Array.isArray(snapshot?.sheets) ? snapshot.sheets : [];
}

function normalizeText(value) {
    return String(value ?? '');
}

function mapRowsByKey(rows = []) {
    const map = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row, fallbackIndex) => {
        const rowIndex = Number.isInteger(Number(row?.rowIndex)) ? Number(row.rowIndex) : fallbackIndex;
        const rowId = normalizeText(row?.rowId).trim();
        const rowKey = normalizeText(row?.rowKey || rowId || `row-index:${rowIndex}`);
        map.set(rowKey, { ...row, rowIndex, rowId, rowKey });
    });
    return map;
}

function diffCells(beforeCells = {}, afterCells = {}) {
    const keys = new Set([
        ...Object.keys(beforeCells && typeof beforeCells === 'object' ? beforeCells : {}),
        ...Object.keys(afterCells && typeof afterCells === 'object' ? afterCells : {}),
    ]);

    return Array.from(keys)
        .map((field) => ({
            field,
            before: normalizeText(beforeCells?.[field]),
            after: normalizeText(afterCells?.[field]),
        }))
        .filter((entry) => entry.before !== entry.after);
}

function createInsertChange(sheet, row, capturedAt) {
    return {
        type: 'insert',
        sheetKey: sheet.sheetKey,
        tableName: sheet.tableName,
        rowIndex: row.rowIndex,
        rowId: normalizeText(row.rowId).trim(),
        rowKey: row.rowKey,
        rowTitle: normalizeText(row.rowTitle || '未命名'),
        fields: Object.entries(row.cells && typeof row.cells === 'object' ? row.cells : {})
            .map(([field, value]) => ({ field, before: '', after: normalizeText(value) }))
            .filter((entry) => entry.after !== ''),
        createdAt: capturedAt,
    };
}

function createUpdateChange(sheet, beforeRow, afterRow, fields, capturedAt) {
    return {
        type: 'update',
        sheetKey: sheet.sheetKey,
        tableName: sheet.tableName,
        rowIndex: afterRow.rowIndex,
        rowId: normalizeText(afterRow.rowId || beforeRow.rowId).trim(),
        rowKey: afterRow.rowKey,
        rowTitle: normalizeText(afterRow.rowTitle || beforeRow.rowTitle || '未命名'),
        fields,
        createdAt: capturedAt,
    };
}

function createDeleteChange(sheet, row, capturedAt) {
    return {
        type: 'delete',
        sheetKey: sheet.sheetKey,
        tableName: sheet.tableName,
        rowIndex: row.rowIndex,
        rowId: normalizeText(row.rowId).trim(),
        rowKey: row.rowKey,
        rowTitle: normalizeText(row.rowTitle || '未命名'),
        fields: Object.entries(row.cells && typeof row.cells === 'object' ? row.cells : {})
            .map(([field, value]) => ({ field, before: normalizeText(value), after: '' }))
            .filter((entry) => entry.before !== ''),
        createdAt: capturedAt,
    };
}

function summarizeTableChanges(sheet, changes = []) {
    const insertCount = changes.filter((change) => change.type === 'insert').length;
    const updateCount = changes.filter((change) => change.type === 'update').length;
    const deleteCount = changes.filter((change) => change.type === 'delete').length;
    return {
        sheetKey: sheet.sheetKey,
        tableName: sheet.tableName,
        insertCount,
        updateCount,
        deleteCount,
        changeCount: changes.length,
        updatedRowIndexes: Array.from(new Set(changes.map((change) => change.rowIndex).filter(Number.isInteger))).sort((a, b) => a - b),
        updatedRowIds: Array.from(new Set(changes.map((change) => normalizeText(change.rowId).trim()).filter(Boolean))),
        changes,
    };
}

export function diffSnapshots(before, after, options = {}) {
    const capturedAt = Number.isFinite(Number(after?.capturedAt)) ? Number(after.capturedAt) : Date.now();
    const beforeSheets = new Map(normalizeSheetList(before).map((sheet) => [sheet.sheetKey, sheet]));
    const tables = [];
    const matchedAfterSheetKeys = new Set();

    normalizeSheetList(after).forEach((afterSheet) => {
        matchedAfterSheetKeys.add(afterSheet.sheetKey);
        const beforeSheet = beforeSheets.get(afterSheet.sheetKey) || null;
        const beforeRows = mapRowsByKey(beforeSheet?.rows || []);
        const matchedBeforeRowKeys = new Set();
        const changes = [];

        (Array.isArray(afterSheet.rows) ? afterSheet.rows : []).forEach((afterRow, fallbackIndex) => {
            const rowIndex = Number.isInteger(Number(afterRow?.rowIndex)) ? Number(afterRow.rowIndex) : fallbackIndex;
            const rowId = normalizeText(afterRow?.rowId).trim();
            const rowKey = normalizeText(afterRow?.rowKey || rowId || `row-index:${rowIndex}`);
            const normalizedAfterRow = { ...afterRow, rowIndex, rowId, rowKey };
            const beforeRow = beforeRows.get(rowKey);
            if (!beforeRow) {
                changes.push(createInsertChange(afterSheet, normalizedAfterRow, capturedAt));
                return;
            }
            matchedBeforeRowKeys.add(rowKey);
            const fields = diffCells(beforeRow.cells, normalizedAfterRow.cells);
            if (fields.length > 0) {
                changes.push(createUpdateChange(afterSheet, beforeRow, normalizedAfterRow, fields, capturedAt));
            }
        });

        beforeRows.forEach((beforeRow, rowKey) => {
            if (matchedBeforeRowKeys.has(rowKey)) return;
            changes.push(createDeleteChange(afterSheet, beforeRow, capturedAt));
        });

        if (changes.length > 0) {
            tables.push(summarizeTableChanges(afterSheet, changes));
        }
    });

    beforeSheets.forEach((beforeSheet, sheetKey) => {
        if (matchedAfterSheetKeys.has(sheetKey)) return;
        const changes = (Array.isArray(beforeSheet.rows) ? beforeSheet.rows : [])
            .map((row, fallbackIndex) => createDeleteChange(beforeSheet, {
                ...row,
                rowIndex: Number.isInteger(Number(row?.rowIndex)) ? Number(row.rowIndex) : fallbackIndex,
                rowId: normalizeText(row?.rowId).trim(),
                rowKey: normalizeText(row?.rowKey || row?.rowId || `row-index:${fallbackIndex}`),
            }, capturedAt));
        if (changes.length > 0) tables.push(summarizeTableChanges(beforeSheet, changes));
    });

    const changeCount = tables.reduce((sum, table) => sum + table.changeCount, 0);
    return {
        status: changeCount > 0 ? 'ready' : 'empty',
        floorId: Number.isInteger(Number(options.floorId)) ? Number(options.floorId) : -1,
        floorLabel: normalizeText(options.floorLabel || ''),
        createdAt: capturedAt,
        tableCount: tables.length,
        changeCount,
        message: changeCount > 0 ? `本楼检测到 ${changeCount} 处表格更新` : '暂无本楼更新',
        tables,
        error: null,
    };
}
