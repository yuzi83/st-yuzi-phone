import { buildTableNavigationCatalog } from '../table-navigation/catalog.js';
import { createTableSnapshot } from './snapshot.js';
import {
    hasDisplayCapability,
    matchesDisplay,
    matchesPresetItem,
} from './matcher.js';

export const CONTENT_PRESET_DISPLAY_SOURCE_ID = 'content-preset-display';

function text(value) {
    return String(value ?? '').trim();
}

function displayKey(presetId, displayId) {
    const preset = text(presetId);
    const display = text(displayId);
    if (!preset || !display) return '';
    return `${CONTENT_PRESET_DISPLAY_SOURCE_ID}:${encodeURIComponent(preset)}:${encodeURIComponent(display)}`;
}

export function contentPresetDisplayModelId(presetId, displayId) {
    return displayKey(presetId, displayId);
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

function resolveTargetSheetKeys(display, tables) {
    if (!hasDisplayCapability(display) || !matchesDisplay(display, tables.map(entry => entry.table))) return null;
    const sheetKeys = [];
    for (const target of display.targets) {
        const matches = tables.filter(entry => matchesPresetItem({ target }, entry.table));
        if (matches.length !== 1) return null;
        sheetKeys.push(matches[0].sheetKey);
    }
    return sheetKeys;
}

function activeBindingFor(bindings, sheetKey, presetId) {
    const binding = bindings.get(sheetKey);
    return text(binding?.presetId) === text(presetId) ? binding : null;
}

function definition(presetId, display, targetSheetKeys) {
    const modelId = displayKey(presetId, display.id);
    return Object.freeze({
        modelId,
        presetId: text(presetId),
        displayId: text(display.id),
        display,
        targetSheetKeys: Object.freeze([...targetSheetKeys]),
    });
}

/**
 * Derives runtime-visible custom display sources from already-applied popup
 * sources. This is deliberately separate from persisted bindings: the binding
 * only records a preset source; this directory decides which declared styles
 * are currently valid against real tables and all combination dependencies.
 */
export function buildActiveContentPresetDisplayDirectory(rawData, popupByTable = new Map()) {
    const tables = physicalTables(rawData);
    const bindings = popupByTable instanceof Map
        ? popupByTable
        : new Map(Object.entries(popupByTable || {}));
    const singleBySheetKey = new Map();
    const virtualSources = [];
    const byModelId = new Map();

    for (const [originSheetKey, binding] of bindings) {
        const presetId = text(binding?.presetId);
        if (!presetId) continue;
        for (const display of Array.isArray(binding?.displays) ? binding.displays : []) {
            const targetSheetKeys = resolveTargetSheetKeys(display, tables);
            if (!targetSheetKeys || !targetSheetKeys.includes(originSheetKey)) continue;
            if (!targetSheetKeys.every(sheetKey => activeBindingFor(bindings, sheetKey, presetId))) continue;
            const modelId = displayKey(presetId, display.id);
            if (!modelId || byModelId.has(modelId)) continue;

            const entry = definition(presetId, display, targetSheetKeys);
            byModelId.set(modelId, entry);
            if (targetSheetKeys.length === 1) {
                const sheetKey = targetSheetKeys[0];
                const values = singleBySheetKey.get(sheetKey) || [];
                values.push(entry);
                singleBySheetKey.set(sheetKey, values);
                continue;
            }

            virtualSources.push(Object.freeze({
                sheetKey: modelId,
                tableName: text(display.name) || text(display.id),
                sourceId: CONTENT_PRESET_DISPLAY_SOURCE_ID,
                sourceKind: CONTENT_PRESET_DISPLAY_SOURCE_ID,
                modelId,
                modelIds: Object.freeze([modelId]),
                customDisplay: entry,
                targetSheetKeys: entry.targetSheetKeys,
            }));
        }
    }

    for (const [sheetKey, values] of singleBySheetKey) {
        singleBySheetKey.set(sheetKey, Object.freeze([...values]));
    }
    return Object.freeze({
        singleBySheetKey,
        virtualSources: Object.freeze(virtualSources),
        byModelId,
    });
}
