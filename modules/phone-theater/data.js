import {
    getTheaterSceneDefinition,
    getTheaterSceneDefinitionByTableName,
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
import { resolveForumSidebarIdentity } from './scenes/forum.js';

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

export { resolveForumSidebarIdentity } from './scenes/forum.js';

export function resolveTheaterSceneTables(rawData, sceneDefinition) {
    const index = buildTheaterTableIndex(rawData);
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

export function getAvailableTheaterScenes(rawData) {
    return getTheaterSceneDefinitions()
        .map(scene => resolveTheaterSceneTables(rawData, scene))
        .filter(resolved => resolved.available)
        .map(resolved => ({
            ...resolved.scene,
            rowCount: resolved.rowCount,
            childSheetKeys: [...resolved.childSheetKeys],
        }));
}

export function getGroupedTheaterSheetKeys(rawData) {
    const keys = new Set();
    getTheaterSceneDefinitions().forEach((scene) => {
        const resolved = resolveTheaterSceneTables(rawData, scene);
        if (!resolved.available) return;
        resolved.childSheetKeys.forEach(sheetKey => keys.add(sheetKey));
    });
    return keys;
}

export function resolveTheaterSceneBySheetKey(rawData, sheetKey) {
    const index = buildTheaterTableIndex(rawData);
    const table = index.tableBySheetKey.get(normalizeText(sheetKey));
    if (!table) return null;

    const scene = getTheaterSceneDefinitionByTableName(table.tableName);
    if (!scene) return null;

    const resolved = resolveTheaterSceneTables(rawData, scene);
    if (!resolved.available) return null;

    return {
        ...scene,
        sourceTableName: table.tableName,
        sourceSheetKey: table.sheetKey,
        rowCount: resolved.rowCount,
        childSheetKeys: [...resolved.childSheetKeys],
    };
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
        resolveForumSidebarIdentity,
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
        tables: resolved.tables,
        content,
    };
}
