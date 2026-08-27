import { getPhoneSettings } from '../settings.js';
import {
    getTableData,
    executeSqlMutationViaApi,
} from '../phone-core/data-api.js';
import {
    subscribeTableFillStart,
    subscribeTableUpdate,
} from '../phone-core/callbacks.js';
import { applyLiteralRulesToTableContent, validateReplacementRules } from './rules.js';
import { normalizeTableContentReplacementSettings } from './config.js';
import { buildTableReplacementMutation } from './sql.js';

const DEFAULT_DEBOUNCE_MS = 600;

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function cloneTableContent(content) {
    return Array.isArray(content)
        ? content.map(row => Array.isArray(row) ? [...row] : row)
        : [];
}

function cloneRawData(rawData) {
    if (!isPlainObject(rawData)) return null;
    return Object.fromEntries(
        Object.entries(rawData).map(([sheetKey, sheet]) => [
            sheetKey,
            isPlainObject(sheet)
                ? { ...sheet, content: cloneTableContent(sheet.content) }
                : sheet,
        ]),
    );
}

function normalizeSheetKey(value) {
    return String(value ?? '').trim();
}

function normalizeTableName(value) {
    return String(value ?? '').trim();
}

function isSheetEntry(sheetKey, sheet) {
    return normalizeSheetKey(sheetKey).startsWith('sheet_')
        && isPlainObject(sheet)
        && Array.isArray(sheet.content)
        && Array.isArray(sheet.content[0]);
}

function getSheetKeys(rawData) {
    if (!isPlainObject(rawData)) return [];
    return Object.keys(rawData).filter(sheetKey => isSheetEntry(sheetKey, rawData[sheetKey]));
}

function getTableSignature(sheet) {
    if (!isPlainObject(sheet)) return '';
    try {
        return JSON.stringify({
            name: sheet.name ?? '',
            content: cloneTableContent(sheet.content),
        });
    } catch {
        return '';
    }
}

function getChangedSheetKeys(previousRawData, nextRawData) {
    const previous = isPlainObject(previousRawData) ? previousRawData : {};
    const next = isPlainObject(nextRawData) ? nextRawData : {};
    const keys = new Set([...getSheetKeys(previous), ...getSheetKeys(next)]);
    return Array.from(keys).filter((sheetKey) => (
        getTableSignature(previous[sheetKey]) !== getTableSignature(next[sheetKey])
    ));
}

function getTextColumnIndexes(content) {
    if (!Array.isArray(content) || !Array.isArray(content[0])) return [];
    const rows = content.slice(1).filter(Array.isArray);
    if (rows.length === 0) return [];

    return content[0].map((header, columnIndex) => {
        const headerName = normalizeTableName(header).toLocaleLowerCase();
        if (!headerName || headerName === 'row_id' || headerName === 'id' || headerName === '行号') return -1;
        return rows.some(row => typeof row[columnIndex] === 'string') ? columnIndex : -1;
    }).filter(columnIndex => columnIndex >= 0);
}

function resolveTableEntry(rawData, sheetKey = '', tableNameSnapshot = '') {
    if (!isPlainObject(rawData)) return null;
    const directKey = normalizeSheetKey(sheetKey);
    if (directKey && isSheetEntry(directKey, rawData[directKey])) {
        return { sheetKey: directKey, sheet: rawData[directKey] };
    }

    const expectedName = normalizeTableName(tableNameSnapshot);
    if (!expectedName) return null;
    const match = Object.entries(rawData).find(([candidateKey, candidateSheet]) => (
        isSheetEntry(candidateKey, candidateSheet)
        && normalizeTableName(candidateSheet.name) === expectedName
    ));
    return match ? { sheetKey: match[0], sheet: match[1] } : null;
}

function getExplicitSheetKeys(event) {
    if (!isPlainObject(event)) return [];
    const candidates = [event.sheetKey, event.tableKey, event.key];
    return candidates
        .map(normalizeSheetKey)
        .filter(Boolean);
}

function mergeSingleSheetEvent(rawData, event) {
    const explicitSheetKeys = getExplicitSheetKeys(event);
    if (explicitSheetKeys.length === 0 || !Array.isArray(event?.content)) {
        return isPlainObject(event) && getSheetKeys(event).length > 0 ? event : rawData;
    }

    const nextRawData = cloneRawData(rawData) || {};
    nextRawData[explicitSheetKeys[0]] = {
        ...(isPlainObject(nextRawData[explicitSheetKeys[0]]) ? nextRawData[explicitSheetKeys[0]] : {}),
        ...event,
    };
    return nextRawData;
}

function getValidRules(rules) {
    const normalizedRules = Array.isArray(rules) ? rules : [];
    const errors = validateReplacementRules(normalizedRules);
    const invalidIndexes = new Set(errors.map(error => error.index));
    return normalizedRules.filter((_, index) => !invalidIndexes.has(index));
}

function getTableMapping(config, entry) {
    const tableName = normalizeTableName(entry?.sheet?.name);
    const sheetKey = normalizeSheetKey(entry?.sheetKey);
    return config.tableRules.find((mapping) => (
        normalizeSheetKey(mapping?.sheetKey) === sheetKey
        || (
            normalizeTableName(mapping?.tableNameSnapshot) !== ''
            && normalizeTableName(mapping?.tableNameSnapshot) === tableName
        )
    )) || null;
}

function getRulesForTable(config, entry) {
    const globalRules = config.global.enabled ? getValidRules(config.global.rules) : [];
    const mapping = getTableMapping(config, entry);
    const localRules = mapping?.enabled ? getValidRules(mapping.rules) : [];
    return {
        mapping,
        rules: [...globalRules, ...localRules],
    };
}

function safeReadTableData(getter) {
    try {
        const rawData = getter?.();
        return isPlainObject(rawData) ? rawData : null;
    } catch {
        return null;
    }
}

function safeSubscribe(subscribe, callback) {
    try {
        const disposer = subscribe?.(callback);
        return typeof disposer === 'function' ? disposer : null;
    } catch {
        return null;
    }
}

function normalizeDebounceMs(value) {
    const delay = Number(value);
    return Number.isFinite(delay) && delay >= 0 ? Math.round(delay) : DEFAULT_DEBOUNCE_MS;
}

const defaultDeps = Object.freeze({
    getSettings: () => getPhoneSettings(),
    getTableData: () => getTableData(),
    executeSqlMutation: (...args) => executeSqlMutationViaApi(...args),
    subscribeTableUpdate: callback => subscribeTableUpdate(callback),
    subscribeTableFillStart: callback => subscribeTableFillStart(callback),
    setTimeout: (...args) => globalThis.setTimeout(...args),
    clearTimeout: (...args) => globalThis.clearTimeout(...args),
});

export function createTableContentReplacementService(options = {}) {
    let deps = { ...defaultDeps, ...options };
    const debounceMs = normalizeDebounceMs(options.debounceMs);
    const runtime = {
        started: false,
        generation: 0,
        fillActive: false,
        debounceTimer: null,
        unsubscribeUpdate: null,
        unsubscribeFillStart: null,
        lastRawData: null,
        pendingSheetKeys: new Set(),
        selfWrittenSignatures: new Map(),
    };
    let executionTail = Promise.resolve();

    function clearDebounceTimer() {
        if (runtime.debounceTimer === null) return;
        try {
            deps.clearTimeout(runtime.debounceTimer);
        } catch {
            // 清理失败不能改变服务生命周期。
        }
        runtime.debounceTimer = null;
    }

    function replaceLastRawDataSheet(sheetKey, sheet) {
        const nextRawData = cloneRawData(runtime.lastRawData) || {};
        nextRawData[sheetKey] = {
            ...(isPlainObject(sheet) ? sheet : {}),
            content: cloneTableContent(sheet?.content),
        };
        runtime.lastRawData = nextRawData;
    }

    function enqueueExecution(task) {
        const next = executionTail.then(task, task);
        executionTail = next.catch(() => undefined);
        return next;
    }

    function readConfig() {
        try {
            return normalizeTableContentReplacementSettings(deps.getSettings?.()?.tableContentReplacement);
        } catch {
            return normalizeTableContentReplacementSettings(null);
        }
    }

    async function runForSheetKeys(sheetKeys = []) {
        const rawData = safeReadTableData(deps.getTableData);
        if (!rawData) return { ok: false, changedCellCount: 0, tableCount: 0, code: 'table_data_unavailable' };

        const config = readConfig();
        const uniqueSheetKeys = Array.from(new Set(
            (Array.isArray(sheetKeys) ? sheetKeys : []).map(normalizeSheetKey).filter(Boolean),
        ));
        let changedCellCount = 0;
        let tableCount = 0;

        for (const requestedSheetKey of uniqueSheetKeys) {
            const mapping = config.tableRules.find(item => normalizeSheetKey(item?.sheetKey) === requestedSheetKey)
                || config.tableRules.find(item => normalizeTableName(item?.tableNameSnapshot) === normalizeTableName(rawData[requestedSheetKey]?.name));
            const entry = resolveTableEntry(
                rawData,
                requestedSheetKey,
                mapping?.tableNameSnapshot,
            );
            if (!entry) continue;

            const { rules } = getRulesForTable(config, entry);
            if (rules.length === 0) continue;

            const content = entry.sheet.content;
            const expected = applyLiteralRulesToTableContent(content, rules);
            if (expected.changedCellCount <= 0) continue;

            const mutation = buildTableReplacementMutation({
                tableName: entry.sheetKey,
                headers: content[0],
                textColumnIndexes: getTextColumnIndexes(content),
                ddl: entry.sheet.sourceData?.ddl,
                rules,
            });
            if (!mutation) continue;

            let result;
            try {
                result = await deps.executeSqlMutation(
                    mutation.sql,
                    mutation.params,
                    {
                        targetSheetKeys: [entry.sheetKey],
                        silent: true,
                    },
                );
            } catch {
                return { ok: false, changedCellCount, tableCount, code: 'mutation_failed' };
            }
            if (!result?.ok) {
                return { ok: false, changedCellCount, tableCount, code: result?.code || 'mutation_failed' };
            }

            changedCellCount += expected.changedCellCount;
            tableCount += 1;
            const writtenSignature = getTableSignature({
                ...entry.sheet,
                content: expected.content,
            });
            runtime.selfWrittenSignatures.set(entry.sheetKey, writtenSignature);
            replaceLastRawDataSheet(entry.sheetKey, {
                ...entry.sheet,
                content: expected.content,
            });
        }

        return { ok: true, changedCellCount, tableCount };
    }

    function schedulePendingRun() {
        if (!runtime.started || runtime.fillActive || runtime.pendingSheetKeys.size === 0) return false;
        clearDebounceTimer();
        try {
            runtime.debounceTimer = deps.setTimeout(() => {
                runtime.debounceTimer = null;
                flushPendingRun();
            }, debounceMs);
            return true;
        } catch {
            runtime.debounceTimer = null;
            return false;
        }
    }

    function flushPendingRun() {
        if (!runtime.started || runtime.fillActive || runtime.pendingSheetKeys.size === 0) return;
        const generation = runtime.generation;
        const sheetKeys = Array.from(runtime.pendingSheetKeys);
        runtime.pendingSheetKeys.clear();

        void enqueueExecution(() => runForSheetKeys(sheetKeys))
            .then((result) => {
                if (!runtime.started || runtime.generation !== generation) return;
                if (!result?.ok) {
                    runtime.pendingSheetKeys.clear();
                    return;
                }
                schedulePendingRun();
            })
            .catch(() => {
                if (runtime.started && runtime.generation === generation) {
                    runtime.pendingSheetKeys.clear();
                }
            });
    }

    function handleFillStart() {
        if (!runtime.started) return;
        runtime.fillActive = true;
        clearDebounceTimer();
    }

    function handleTableUpdate(event) {
        if (!runtime.started) return;
        const currentRawData = safeReadTableData(deps.getTableData);
        const nextRawData = mergeSingleSheetEvent(currentRawData, event);
        const explicitSheetKeys = getExplicitSheetKeys(event);
        const changedSheetKeys = getChangedSheetKeys(runtime.lastRawData, nextRawData);
        const candidateSheetKeys = new Set([...changedSheetKeys, ...explicitSheetKeys]);

        candidateSheetKeys.forEach((sheetKey) => {
            const signature = getTableSignature(nextRawData?.[sheetKey]);
            if (signature && runtime.selfWrittenSignatures.get(sheetKey) === signature) {
                runtime.selfWrittenSignatures.delete(sheetKey);
                return;
            }
            runtime.pendingSheetKeys.add(sheetKey);
        });

        runtime.lastRawData = cloneRawData(nextRawData);
        runtime.fillActive = false;
        schedulePendingRun();
    }

    function start() {
        if (runtime.started) return true;
        runtime.started = true;
        runtime.generation += 1;
        runtime.lastRawData = cloneRawData(safeReadTableData(deps.getTableData));
        runtime.unsubscribeFillStart = safeSubscribe(deps.subscribeTableFillStart, handleFillStart);
        runtime.unsubscribeUpdate = safeSubscribe(deps.subscribeTableUpdate, handleTableUpdate);
        return true;
    }

    function stop() {
        runtime.generation += 1;
        runtime.started = false;
        runtime.fillActive = false;
        clearDebounceTimer();
        runtime.pendingSheetKeys.clear();
        runtime.selfWrittenSignatures.clear();
        runtime.lastRawData = null;

        const unsubscribeUpdate = runtime.unsubscribeUpdate;
        const unsubscribeFillStart = runtime.unsubscribeFillStart;
        runtime.unsubscribeUpdate = null;
        runtime.unsubscribeFillStart = null;
        try { unsubscribeUpdate?.(); } catch { /* 静默清理 */ }
        try { unsubscribeFillStart?.(); } catch { /* 静默清理 */ }
    }

    function handleChatChanged() {
        if (!runtime.started) return false;
        runtime.generation += 1;
        clearDebounceTimer();
        runtime.pendingSheetKeys.clear();
        runtime.selfWrittenSignatures.clear();
        runtime.lastRawData = null;
        runtime.fillActive = false;
        return true;
    }

    async function applyArea(area = {}) {
        const rawData = safeReadTableData(deps.getTableData);
        if (!rawData) return { ok: false, changedCellCount: 0, tableCount: 0, code: 'table_data_unavailable' };

        const config = readConfig();
        let sheetKeys;
        if (area.kind === 'global') {
            sheetKeys = getSheetKeys(rawData);
        } else {
            const mappingId = String(area.mappingId ?? '').trim();
            const mapping = config.tableRules.find(item => String(item?.mappingId ?? '').trim() === mappingId);
            const entry = resolveTableEntry(rawData, mapping?.sheetKey, mapping?.tableNameSnapshot);
            sheetKeys = entry ? [entry.sheetKey] : [];
        }

        if (sheetKeys.length === 0) return { ok: true, changedCellCount: 0, tableCount: 0 };
        return enqueueExecution(() => runForSheetKeys(sheetKeys));
    }

    function getState() {
        return {
            started: runtime.started,
            generation: runtime.generation,
            fillActive: runtime.fillActive,
            pendingSheetKeys: Array.from(runtime.pendingSheetKeys),
            hasDebounceTimer: runtime.debounceTimer !== null,
        };
    }

    function setDeps(overrides = {}) {
        stop();
        deps = { ...defaultDeps, ...overrides };
    }

    return Object.freeze({
        start,
        stop,
        handleChatChanged,
        applyArea,
        getState,
        setDeps,
    });
}

export const __test__tableContentReplacement = Object.freeze({
    getChangedSheetKeys,
    getTextColumnIndexes,
    resolveTableEntry,
});
