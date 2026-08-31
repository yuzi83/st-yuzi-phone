import { getSheetKeys } from '../phone-core/data-api.js';
import { buildTheaterSceneCatalog } from '../phone-theater/data.js';

export const TABLE_ROUTE_PREFIX = 'table:';

function normalizeText(value) {
    return String(value ?? '').trim();
}

function buildTableRoute(sheetKey) {
    const safeSheetKey = normalizeText(sheetKey);
    return safeSheetKey ? `${TABLE_ROUTE_PREFIX}${safeSheetKey}` : '';
}

function buildCatalogEntry(rawData, sheetKey, orderIndex, theaterSceneBySheetKey) {
    const sheet = rawData?.[sheetKey];
    if (!sheet || typeof sheet !== 'object') return null;

    const tableName = normalizeText(sheet.name) || sheetKey;
    const theaterScene = theaterSceneBySheetKey.get(sheetKey) || null;
    if (theaterScene) {
        return Object.freeze({
            sheetKey,
            tableName,
            orderIndex,
            presentation: 'theater',
            sceneId: theaterScene.id,
            route: buildTableRoute(sheetKey),
        });
    }

    return Object.freeze({
        sheetKey,
        tableName,
        orderIndex,
        presentation: 'generic',
        route: buildTableRoute(sheetKey),
    });
}

export function buildTableNavigationContext(rawData) {
    const theaterCatalog = buildTheaterSceneCatalog(rawData);
    const catalog = Object.freeze(getSheetKeys(rawData)
        .map((sheetKey, orderIndex) => buildCatalogEntry(
            rawData,
            sheetKey,
            orderIndex,
            theaterCatalog.sceneBySheetKey,
        ))
        .filter(Boolean));
    return Object.freeze({
        catalog,
        targetBySheetKey: new Map(catalog.map(entry => [entry.sheetKey, entry])),
        theaterScenes: theaterCatalog.availableScenes,
        groupedTheaterSheetKeys: theaterCatalog.groupedTheaterSheetKeys,
    });
}

export function buildTableNavigationCatalog(rawData) {
    return buildTableNavigationContext(rawData).catalog;
}

export function resolveTableNavigationTargetFromCatalog(catalog, sheetKey) {
    const safeSheetKey = normalizeText(sheetKey);
    if (!safeSheetKey) return null;
    return (Array.isArray(catalog) ? catalog : [])
        .find(entry => entry.sheetKey === safeSheetKey) || null;
}

export function resolveTableNavigationTarget(rawData, sheetKey, options = {}) {
    const navigationContext = options.navigationContext || buildTableNavigationContext(rawData);
    return navigationContext.targetBySheetKey?.get(normalizeText(sheetKey))
        || resolveTableNavigationTargetFromCatalog(navigationContext.catalog, sheetKey);
}

export function resolveAdjacentTableTargetFromCatalog(catalog, currentSheetKey, direction) {
    const safeDirection = normalizeText(direction);
    const safeCatalog = Array.isArray(catalog) ? catalog : [];
    const result = {
        direction: safeDirection,
        currentSheetKey: normalizeText(currentSheetKey),
        tableCount: safeCatalog.length,
        target: null,
        reason: '',
    };

    if (safeDirection !== 'previous' && safeDirection !== 'next') {
        return Object.freeze({ ...result, reason: 'invalid_direction' });
    }
    if (safeCatalog.length === 0) {
        return Object.freeze({ ...result, reason: 'empty_catalog' });
    }
    if (safeCatalog.length === 1) {
        return Object.freeze({ ...result, reason: 'single_table' });
    }

    const currentIndex = safeCatalog.findIndex(entry => entry.sheetKey === result.currentSheetKey);
    if (currentIndex < 0) {
        return Object.freeze({ ...result, reason: 'anchor_not_found' });
    }

    const offset = safeDirection === 'previous' ? -1 : 1;
    const targetIndex = (currentIndex + offset + safeCatalog.length) % safeCatalog.length;
    return Object.freeze({ ...result, target: safeCatalog[targetIndex] });
}

export function resolveAdjacentTableTarget(rawData, currentSheetKey, direction, options = {}) {
    const navigationContext = options.navigationContext || buildTableNavigationContext(rawData);
    return resolveAdjacentTableTargetFromCatalog(navigationContext.catalog, currentSheetKey, direction);
}
