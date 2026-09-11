import { buildTableNavigationCatalog } from '../table-navigation/catalog.js';
import { createTableSnapshot } from './snapshot.js';
import { listMatchingDisplays, listMatchingPageItems, matchesDisplayTarget } from './matcher.js';

export function buildContentPresetCatalog(rawData, presets = [], pageByTable = new Map(), popupByTable = new Map()) {
    const entries = buildTableNavigationCatalog(rawData).map(entry => {
        const snapshot = createTableSnapshot(rawData, entry.sheetKey);
        return { entry, snapshot, table: { tableName: snapshot?.tableName || entry.tableName, headers: snapshot?.rawHeaders || [] } };
    });
    const displaySources = listMatchingDisplays(presets, entries.map(value => value.table));
    return Object.freeze(entries.map(({ entry, snapshot, table }) => {
        const pageActive = pageByTable.get(entry.sheetKey) || null;
        const popupActive = popupByTable.get(entry.sheetKey) || null;
        const pageCandidates = listMatchingPageItems(presets, table);
        const popupCandidates = Object.freeze(displaySources.map(source => {
            const displays = Object.freeze(source.displays.filter(candidate => matchesDisplayTarget(candidate.display, table)));
            return displays.length ? Object.freeze({ ...source, displays }) : null;
        }).filter(Boolean));
        return Object.freeze({
            ...entry,
            headers: Object.freeze([...(snapshot?.rawHeaders || [])]),
            pageCandidates,
            popupCandidates,
            pageActive,
            popupActive,
            // v2 UI / renderer 仍读取旧字段；它只代表页面能力。
            candidates: pageCandidates,
            active: pageActive,
        });
    }));
}
