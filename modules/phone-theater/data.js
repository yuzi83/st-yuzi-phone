import { getSheetKeys } from '../phone-core/data-api.js';
import {
    getTheaterSceneDefinition,
    getTheaterSceneDefinitions,
} from './config.js';
import {
    buildTheaterTableIndex,
    getCellByHeader,
    mapTheaterRows,
    normalizeText,
    resolveRowIdentity,
    splitSemicolonText,
} from './core/table-index.js';
import {
    buildTheaterDeleteKey,
    parseTheaterDeleteKey,
} from './core/delete-key.js';

export {
    buildTheaterTableIndex,
    getCellByHeader,
    mapTheaterRows,
    normalizeText,
    resolveRowIdentity,
    splitSemicolonText,
} from './core/table-index.js';

export {
    buildTheaterDeleteKey,
    parseTheaterDeleteKey,
} from './core/delete-key.js';

export function resolveTheaterSceneTables(rawData, sceneDefinition, options = {}) {
    const index = options.index || buildTheaterTableIndex(rawData);
    const scene = sceneDefinition || null;
    if (!scene) {
        return {
            available: false,
            missingPrimary: true,
            index,
            scene: null,
            tables: {},
            primaryTable: null,
            childSheetKeys: [],
            rowCount: 0,
        };
    }

    const tables = {};
    Object.entries(scene.tableNames || scene.tables || {}).forEach(([role, tableName]) => {
        tables[role] = index.tableByName.get(normalizeText(tableName)) || null;
    });

    const primaryTableName = normalizeText(scene.primaryTableName || tables[scene.primaryTableRole]?.tableName);
    const primaryTable = primaryTableName ? index.tableByName.get(primaryTableName) || null : null;
    const childSheetKeys = (scene.childTableNames || [])
        .map(tableName => index.tableByName.get(normalizeText(tableName))?.sheetKey || '')
        .filter(Boolean);
    const rowCount = Object.values(tables).reduce((sum, table) => sum + (table?.rowCount || 0), 0);

    return {
        available: !!primaryTable,
        missingPrimary: !primaryTable,
        index,
        scene,
        tables,
        primaryTable,
        childSheetKeys,
        rowCount,
    };
}

function buildAvailableSceneProjection(resolved) {
    return Object.freeze({
        ...resolved.scene,
        primarySheetKey: resolved.primaryTable?.sheetKey || '',
        rowCount: resolved.rowCount,
        childSheetKeys: Object.freeze([...resolved.childSheetKeys]),
    });
}

function buildSceneSheetProjection(scene, resolved, table) {
    return Object.freeze({
        ...scene,
        sourceTableName: table.tableName,
        sourceSheetKey: table.sheetKey,
        rowCount: resolved.rowCount,
        childSheetKeys: Object.freeze([...resolved.childSheetKeys]),
    });
}

export function buildTheaterSceneCatalog(rawData) {
    const index = buildTheaterTableIndex(rawData, { includeRows: false });
    const availableScenes = [];
    const groupedTheaterSheetKeys = new Set();
    const sceneBySheetKey = new Map();

    getTheaterSceneDefinitions().forEach((scene) => {
        const resolved = resolveTheaterSceneTables(rawData, scene, { index });
        if (!resolved.available) return;

        availableScenes.push(buildAvailableSceneProjection(resolved));
        resolved.childSheetKeys.forEach(sheetKey => groupedTheaterSheetKeys.add(sheetKey));
        Object.values(resolved.tables).forEach((table) => {
            if (!table?.sheetKey) return;
            sceneBySheetKey.set(table.sheetKey, buildSceneSheetProjection(scene, resolved, table));
        });
    });

    return Object.freeze({
        index,
        availableScenes: Object.freeze(availableScenes),
        groupedTheaterSheetKeys,
        sceneBySheetKey,
    });
}

export function resolveTheaterNavigationSheetKey(rawData, viewModel, requestedSheetKey) {
    const tables = viewModel?.tables && typeof viewModel.tables === 'object'
        ? viewModel.tables
        : {};
    const sceneSheetKeys = new Set(Object.values(tables)
        .map(table => normalizeText(table?.sheetKey))
        .filter(Boolean));
    const requested = normalizeText(requestedSheetKey);
    if (requested && sceneSheetKeys.has(requested)) return requested;

    const primaryRole = normalizeText(viewModel?.scene?.primaryTableRole);
    const primarySheetKey = normalizeText(tables[primaryRole]?.sheetKey);
    if (primarySheetKey && sceneSheetKeys.has(primarySheetKey)) return primarySheetKey;

    return getSheetKeys(rawData)
        .find(sheetKey => sceneSheetKeys.has(normalizeText(sheetKey))) || '';
}

export function getAvailableTheaterScenes(rawData) {
    return buildTheaterSceneCatalog(rawData).availableScenes;
}

export function getGroupedTheaterSheetKeys(rawData) {
    return buildTheaterSceneCatalog(rawData).groupedTheaterSheetKeys;
}

export function resolveTheaterSceneBySheetKey(rawData, sheetKey) {
    return buildTheaterSceneCatalog(rawData)
        .sceneBySheetKey
        .get(normalizeText(sheetKey)) || null;
}

function buildEditableTableEntries(scene, tables = {}) {
    const editableTables = Array.isArray(scene?.editableTables) ? scene.editableTables : [];
    return editableTables.map((entry) => {
        const role = normalizeText(entry?.role);
        const table = role ? tables[role] || null : null;
        const tableName = normalizeText(table?.tableName || scene?.tables?.[role]);
        const sheetKey = normalizeText(table?.sheetKey);
        return Object.freeze({
            role,
            label: normalizeText(entry?.label) || tableName || role,
            description: normalizeText(entry?.description),
            tableName,
            sheetKey,
            available: !!sheetKey,
        });
    });
}

export function buildTheaterSceneViewModel(rawData, sceneId) {
    const scene = getTheaterSceneDefinition(sceneId);
    const resolved = resolveTheaterSceneTables(rawData, scene);
    if (!scene || !resolved.available) {
        return {
            available: false,
            scene,
            title: scene?.title || '小剧场',
            subtitle: scene?.subtitle || '',
            emptyText: scene?.emptyText || '暂无内容',
            rowCount: 0,
            childSheetKeys: [],
            editableTables: buildEditableTableEntries(scene, resolved.tables || {}),
            tables: resolved.tables || {},
            content: {},
        };
    }

    const helpers = Object.freeze({
        buildTheaterDeleteKey,
        getCellByHeader,
        mapTheaterRows,
        normalizeText,
        parseTheaterDeleteKey,
        resolveRowIdentity,
        splitSemicolonText,
    });

    const content = scene.buildViewModel(resolved, helpers) || {};

    return {
        available: true,
        scene,
        title: scene.title,
        subtitle: scene.subtitle,
        emptyText: scene.emptyText,
        rowCount: resolved.rowCount,
        childSheetKeys: [...resolved.childSheetKeys],
        editableTables: buildEditableTableEntries(scene, resolved.tables),
        tables: resolved.tables,
        content,
    };
}
