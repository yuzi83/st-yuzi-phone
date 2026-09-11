import { buildTableNavigationCatalog } from '../table-navigation/catalog.js';
import { createTableSnapshot } from './snapshot.js';
import {
    hasDisplayCapability,
    hasPageCapability,
    matchesPresetItem,
    normalizeMatchText,
} from './matcher.js';

function text(value) {
    return String(value ?? '').trim();
}

function bindings(value) {
    return value instanceof Map ? value : new Map(Object.entries(value || {}));
}

function freezeList(values) {
    return Object.freeze([...values]);
}

function readonlyMap(entries) {
    const result = new Map(entries);
    const rejectMutation = () => { throw new TypeError('内容预设生图使用方目录是只读的'); };
    for (const name of ['set', 'delete', 'clear']) {
        Object.defineProperty(result, name, {
            configurable: false,
            enumerable: false,
            value: rejectMutation,
            writable: false,
        });
    }
    return Object.freeze(result);
}

function physicalTables(rawData) {
    return buildTableNavigationCatalog(rawData).map(entry => {
        const snapshot = createTableSnapshot(rawData, entry.sheetKey);
        return Object.freeze({
            sheetKey: entry.sheetKey,
            table: Object.freeze({
                tableName: snapshot?.tableName || entry.tableName,
                headers: snapshot?.rawHeaders || [],
            }),
        });
    });
}

function fieldList(value) {
    return Array.isArray(value)
        ? value.map(text).filter(Boolean)
        : [];
}

function validCanvasForTarget(source, target) {
    const canvas = source && typeof source === 'object' ? source : {};
    const stableIdentityFields = fieldList(canvas.stableIdentityFields);
    const promptFields = fieldList(canvas.promptFields);
    const targetFields = new Set(fieldList(target?.fields).map(normalizeMatchText));
    return !!text(canvas.tableName)
        && !!text(canvas.canvas)
        && stableIdentityFields.length > 0
        && promptFields.length > 0
        && normalizeMatchText(canvas.tableName) === normalizeMatchText(target?.tableName)
        && [...stableIdentityFields, ...promptFields].every(field => targetFields.has(normalizeMatchText(field)));
}

function frozenCanvas(source) {
    return Object.freeze({
        tableName: text(source.tableName),
        stableIdentityFields: freezeList(fieldList(source.stableIdentityFields)),
        canvas: text(source.canvas),
        promptFields: freezeList(fieldList(source.promptFields)),
    });
}

function canvasesOf(value) {
    return Array.isArray(value?.imageGeneration?.canvases)
        ? value.imageGeneration.canvases
        : [];
}

function resolveDisplayTargets(display, tables) {
    if (!hasDisplayCapability(display)) return null;
    const resolved = [];
    const seenSheetKeys = new Set();
    for (const target of display.targets) {
        const matches = tables.filter(entry => matchesPresetItem({ target }, entry.table));
        if (matches.length !== 1 || seenSheetKeys.has(matches[0].sheetKey)) return null;
        seenSheetKeys.add(matches[0].sheetKey);
        resolved.push(Object.freeze({ target, sheetKey: matches[0].sheetKey }));
    }
    return freezeList(resolved);
}

function sourceKey(source, canvas) {
    return [
        source.presetId,
        source.itemId ? 'item' : 'display',
        source.itemId || source.displayId,
        canvas.tableName,
        canvas.canvas,
        ...canvas.stableIdentityFields,
        ...canvas.promptFields,
    ].map(normalizeMatchText).join('\u001F');
}

function addRegistration(bySheetKey, seenBySheetKey, sheetKey, source, canvas) {
    const identity = sourceKey(source, canvas);
    const seen = seenBySheetKey.get(sheetKey) || new Set();
    if (seen.has(identity)) return;
    seen.add(identity);
    seenBySheetKey.set(sheetKey, seen);
    const values = bySheetKey.get(sheetKey) || [];
    values.push(Object.freeze({ ...source, canvas }));
    bySheetKey.set(sheetKey, values);
}

function presetIndex(records) {
    const byId = new Map();
    for (const record of Array.isArray(records) ? records : []) {
        const id = text(record?.id);
        if (id && !byId.has(id)) byId.set(id, record);
    }
    return byId;
}

/**
 * 从真实物理表和当前两类应用绑定，推导可实际使用共享生图能力的作者画布。
 * 该函数不读取存储、不修改绑定，也不解释提示词；它只是提供运行时可用目录。
 */
export function buildActiveContentPresetImageGenerationDirectory(rawData, records = [], pageByTable = new Map(), popupByTable = new Map()) {
    const tables = physicalTables(rawData);
    const tableBySheetKey = new Map(tables.map(entry => [entry.sheetKey, entry]));
    const recordsById = presetIndex(records);
    const pages = bindings(pageByTable);
    const popups = bindings(popupByTable);
    const bySheetKey = new Map();
    const seenBySheetKey = new Map();

    for (const [sheetKey, binding] of pages) {
        const table = tableBySheetKey.get(sheetKey);
        const presetId = text(binding?.presetId);
        const itemId = text(binding?.itemId);
        const item = recordsById.get(presetId)?.items?.find(value => text(value?.id) === itemId);
        if (!table || !hasPageCapability(item) || !matchesPresetItem(item, table.table)) continue;
        for (const sourceCanvas of canvasesOf(item)) {
            if (!validCanvasForTarget(sourceCanvas, item.target)) continue;
            addRegistration(bySheetKey, seenBySheetKey, sheetKey, { presetId, itemId }, frozenCanvas(sourceCanvas));
        }
    }

    for (const [presetId, record] of recordsById) {
        for (const display of Array.isArray(record?.displays) ? record.displays : []) {
            if (display?.kind !== 'inline') continue;
            const targets = resolveDisplayTargets(display, tables);
            if (!targets || !targets.every(({ sheetKey }) => text(popups.get(sheetKey)?.presetId) === presetId)) continue;
            for (const sourceCanvas of canvasesOf(display)) {
                const target = targets.find(({ target: candidate }) => (
                    normalizeMatchText(candidate.tableName) === normalizeMatchText(sourceCanvas?.tableName)
                ));
                if (!target || !validCanvasForTarget(sourceCanvas, target.target)) continue;
                addRegistration(bySheetKey, seenBySheetKey, target.sheetKey, {
                    presetId,
                    displayId: text(display.id),
                }, frozenCanvas(sourceCanvas));
            }
        }
    }

    return Object.freeze({
        bySheetKey: readonlyMap([...bySheetKey.entries()].map(([sheetKey, values]) => [sheetKey, freezeList(values)])),
    });
}
