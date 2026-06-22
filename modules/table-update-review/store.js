const subscribers = new Set();

const EMPTY_REVIEW_STATE = Object.freeze({
    status: 'empty',
    floorId: -1,
    createdAt: 0,
    updatedAt: 0,
    tableCount: 0,
    changeCount: 0,
    message: '暂无本楼更新',
    tables: [],
    error: null,
});

let currentState = { ...EMPTY_REVIEW_STATE };

function cloneTable(table = {}) {
    return {
        ...table,
        updatedRowIndexes: Array.isArray(table.updatedRowIndexes) ? [...table.updatedRowIndexes] : [],
        updatedRowIds: Array.isArray(table.updatedRowIds) ? [...table.updatedRowIds] : [],
        changes: Array.isArray(table.changes) ? table.changes.map(cloneChange) : [],
    };
}

function cloneField(field = {}) {
    return { ...field };
}

function cloneChange(change = {}) {
    return {
        ...change,
        fields: Array.isArray(change.fields) ? change.fields.map(cloneField) : [],
    };
}

function cloneState(state = currentState) {
    return {
        ...state,
        tables: Array.isArray(state.tables) ? state.tables.map(cloneTable) : [],
        error: state.error && typeof state.error === 'object' ? { ...state.error } : state.error,
    };
}

function notifySubscribers() {
    const snapshot = cloneState();
    Array.from(subscribers).forEach((callback) => {
        try { callback(snapshot); } catch {}
    });
}

export function getReviewState() {
    return cloneState();
}

function normalizeText(value) {
    return String(value ?? '').trim();
}

function normalizeChangeKey(change = {}) {
    const sheetKey = normalizeText(change.sheetKey);
    const rowKey = normalizeText(change.rowKey)
        || normalizeText(change.rowId)
        || `row-index:${Number.isInteger(Number(change.rowIndex)) ? Number(change.rowIndex) : -1}`;
    return `${sheetKey}\u001f${rowKey}`;
}

function mergeFields(previousFields = [], nextFields = []) {
    const byField = new Map();
    (Array.isArray(previousFields) ? previousFields : []).forEach((field) => {
        const key = normalizeText(field?.field);
        if (!key) return;
        byField.set(key, cloneField(field));
    });
    (Array.isArray(nextFields) ? nextFields : []).forEach((field) => {
        const key = normalizeText(field?.field);
        if (!key) return;
        const previous = byField.get(key);
        byField.set(key, {
            field: field.field,
            before: previous ? previous.before : field.before,
            after: field.after,
        });
    });
    return Array.from(byField.values()).filter((field) => String(field.before ?? '') !== String(field.after ?? ''));
}

function mergeChange(previousChange, nextChange) {
    if (!previousChange) return cloneChange(nextChange);
    const previousType = String(previousChange.type || 'update');
    const nextType = String(nextChange.type || 'update');
    const mergedType = previousType === 'insert' && nextType !== 'delete'
        ? 'insert'
        : nextType;
    return {
        ...previousChange,
        ...nextChange,
        type: mergedType,
        fields: mergeFields(previousChange.fields, nextChange.fields),
        createdAt: Number.isFinite(Number(previousChange.createdAt)) ? previousChange.createdAt : nextChange.createdAt,
    };
}

function summarizeMergedTables(tables = []) {
    return (Array.isArray(tables) ? tables : []).map((table) => {
        const changes = Array.isArray(table.changes) ? table.changes.map(cloneChange) : [];
        const insertCount = changes.filter((change) => change.type === 'insert').length;
        const updateCount = changes.filter((change) => change.type === 'update').length;
        const deleteCount = changes.filter((change) => change.type === 'delete').length;
        return {
            ...table,
            insertCount,
            updateCount,
            deleteCount,
            changeCount: changes.length,
            updatedRowIndexes: Array.from(new Set(changes.map((change) => Number(change.rowIndex)).filter(Number.isInteger).filter((value) => value >= 0))).sort((a, b) => a - b),
            updatedRowIds: Array.from(new Set(changes.map((change) => normalizeText(change.rowId)).filter(Boolean))),
            changes,
        };
    }).filter((table) => table.changeCount > 0);
}

export function mergeReviewState(nextState = {}) {
    const source = nextState && typeof nextState === 'object' ? nextState : {};
    const incomingTables = Array.isArray(source.tables) ? source.tables : [];
    if (incomingTables.length === 0) return getReviewState();

    const shouldReplaceWindow = currentState.floorId !== source.floorId && Number(source.floorId) >= 0;
    const tableMap = new Map();
    const baseTables = shouldReplaceWindow ? [] : currentState.tables;
    baseTables.forEach((table) => tableMap.set(table.sheetKey, cloneTable(table)));

    incomingTables.forEach((table) => {
        const sheetKey = normalizeText(table.sheetKey);
        if (!sheetKey) return;
        const previousTable = tableMap.get(sheetKey) || { ...table, changes: [] };
        const changeMap = new Map((Array.isArray(previousTable.changes) ? previousTable.changes : [])
            .map((change) => [normalizeChangeKey(change), cloneChange(change)]));
        (Array.isArray(table.changes) ? table.changes : []).forEach((change) => {
            const key = normalizeChangeKey(change);
            changeMap.set(key, mergeChange(changeMap.get(key), change));
        });
        tableMap.set(sheetKey, {
            ...previousTable,
            ...table,
            changes: Array.from(changeMap.values()),
        });
    });

    const tables = summarizeMergedTables(Array.from(tableMap.values()));
    return setReviewState({
        ...source,
        status: tables.length > 0 ? 'ready' : 'empty',
        message: tables.length > 0 ? `本楼累计检测到 ${tables.reduce((sum, table) => sum + table.changeCount, 0)} 处表格更新` : source.message,
        tables,
        tableCount: tables.length,
        changeCount: tables.reduce((sum, table) => sum + table.changeCount, 0),
    });
}

export function setReviewState(nextState = {}) {
    const source = nextState && typeof nextState === 'object' ? nextState : {};
    currentState = {
        ...EMPTY_REVIEW_STATE,
        ...source,
        tables: Array.isArray(source.tables) ? source.tables.map(cloneTable) : [],
        updatedAt: Date.now(),
    };
    notifySubscribers();
    return getReviewState();
}

export function resetReviewState(message = '暂无本楼更新') {
    return setReviewState({ ...EMPTY_REVIEW_STATE, message, updatedAt: Date.now() });
}

export function subscribeReviewState(callback) {
    if (typeof callback !== 'function') return () => {};
    subscribers.add(callback);
    return () => subscribers.delete(callback);
}

export function getReviewTableBySheetKey(sheetKey) {
    const key = String(sheetKey || '').trim();
    if (!key) return null;
    return cloneState().tables.find((table) => table.sheetKey === key) || null;
}

export function getUpdatedRowsForSheet(sheetKey) {
    const table = getReviewTableBySheetKey(sheetKey);
    if (!table) return { rowIndexes: new Set(), rowIds: new Set(), changes: [] };
    return {
        rowIndexes: new Set(table.updatedRowIndexes || []),
        rowIds: new Set((table.updatedRowIds || []).map((value) => String(value))),
        changes: table.changes || [],
    };
}

export function hasReviewUpdatesForRow(sheetKey, rowIndex, rowId = '') {
    const rows = getUpdatedRowsForSheet(sheetKey);
    const normalizedRowId = String(rowId ?? '').trim();
    if (normalizedRowId) {
        return rows.rowIds.has(normalizedRowId);
    }

    const normalizedRowIndex = Number(rowIndex);
    return Number.isInteger(normalizedRowIndex) && normalizedRowIndex >= 0 && rows.rowIndexes.has(normalizedRowIndex);
}
