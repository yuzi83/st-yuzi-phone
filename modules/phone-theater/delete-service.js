import { getTableData, saveTableData } from '../phone-core/data-api.js';
import { dispatchPhoneTableUpdated, refreshPhoneTableProjection } from '../phone-core/chat-support.js';
import { getTheaterSceneDefinition } from './config.js';
import { buildTheaterTableIndex, getCellByHeader, normalizeText, resolveRowIdentity, splitSemicolonText } from './core/table-index.js';
import { buildDeleteTargets, hasDeleteTarget, parseTheaterDeleteKey } from './core/delete-key.js';

const STALE_DATA_MESSAGE = '删除失败：小剧场数据已变化，请刷新后重试';

function cloneRawData(rawData) {
    if (!rawData || typeof rawData !== 'object') return null;
    try {
        return JSON.parse(JSON.stringify(rawData));
    } catch {
        return null;
    }
}

function normalizeSelectedKeys(selectedKeys) {
    return new Set((Array.isArray(selectedKeys) ? selectedKeys : [selectedKeys])
        .map(key => normalizeText(key))
        .filter(Boolean));
}

function filterTableRows(table, shouldDelete) {
    if (!table?.sheetKey || !Array.isArray(table.rows) || typeof shouldDelete !== 'function') {
        return { removed: 0, changed: false };
    }

    const sheet = table.sheet;
    if (!sheet || !Array.isArray(sheet.content) || sheet.content.length <= 1) {
        return { removed: 0, changed: false };
    }

    const keptRows = [];
    let removed = 0;
    table.rows.forEach((row, rowIndex) => {
        if (shouldDelete(row, rowIndex)) {
            removed += 1;
            return;
        }
        keptRows.push(row);
    });

    if (removed <= 0) {
        return { removed: 0, changed: false };
    }

    sheet.content = [sheet.content[0], ...keptRows];
    table.rows = keptRows;
    table.rowCount = keptRows.length;
    return { removed, changed: true };
}

function normalizeRemovedCount(value) {
    const count = Number(value);
    if (!Number.isFinite(count) || count <= 0) return 0;
    return Math.floor(count);
}

function resolveSceneTables(index, scene) {
    const tables = {};
    Object.entries(scene.tableNames || scene.tables || {}).forEach(([role, tableName]) => {
        tables[role] = index.tableByName.get(normalizeText(tableName)) || null;
    });
    return tables;
}

function getAffectedSheetKeys(index, scene) {
    return (scene.childTableNames || [])
        .map(tableName => index.tableByName.get(normalizeText(tableName))?.sheetKey || '')
        .filter(Boolean);
}

function getSceneTableRoles(scene) {
    return Object.keys(scene?.tableNames || scene?.tables || {})
        .map(role => normalizeText(role))
        .filter(Boolean);
}

function singularizeRole(role) {
    const text = normalizeText(role);
    if (text.endsWith('ies')) return `${text.slice(0, -3)}y`;
    if (text.endsWith('s')) return text.slice(0, -1);
    return text;
}

function getDeleteRoleCandidates(tableRole) {
    const normalizedRole = normalizeText(tableRole);
    const singularRole = singularizeRole(normalizedRole);
    return Array.from(new Set([normalizedRole, singularRole].filter(Boolean)));
}

function buildDeleteRoleMappings(scene, selectedSet) {
    const tableRoles = getSceneTableRoles(scene);
    const mappings = new Map();
    tableRoles.forEach((tableRole) => {
        getDeleteRoleCandidates(tableRole).forEach((deleteRole) => {
            if (buildDeleteTargets(selectedSet, deleteRole).length <= 0) return;
            if (!mappings.has(deleteRole)) mappings.set(deleteRole, []);
            mappings.get(deleteRole).push(tableRole);
        });
    });
    return mappings;
}

function parseSelectedTargets(selectedSet) {
    const targets = [];
    selectedSet.forEach((key) => {
        const parsed = parseTheaterDeleteKey(key);
        if (parsed) targets.push(parsed);
    });
    return targets;
}

function getIdentitySpec(scene, tableRole) {
    return normalizeText(scene?.fieldSchema?.[tableRole]?.identity);
}

function getIdentityAliases(scene, tableRole) {
    const aliases = scene?.fieldSchema?.[tableRole]?.identityAliases;
    if (!Array.isArray(aliases)) return [];
    return aliases.map(normalizeText).filter(Boolean);
}

function resolveCompositeIdentity(table, row, identitySpec) {
    const headers = identitySpec.split('|').map(normalizeText).filter(Boolean);
    if (headers.length <= 1) return null;
    return headers.map(header => normalizeText(getCellByHeader(table, row, header))).join('|');
}

function resolveIdentityByAliases(table, row, aliases) {
    for (const alias of aliases) {
        const value = normalizeText(getCellByHeader(table, row, alias));
        if (value) return value;
    }
    return '';
}

function resolveTargetIdentity(scene, deleteRole, tableRole, table, row, rowIndex) {
    const identitySpec = getIdentitySpec(scene, tableRole);
    const compositeIdentity = identitySpec ? resolveCompositeIdentity(table, row, identitySpec) : null;
    if (compositeIdentity !== null) return compositeIdentity;

    const identityHeader = identitySpec && !identitySpec.includes('|') ? identitySpec : '';
    const identityAliases = getIdentityAliases(scene, tableRole);
    const aliasIdentity = resolveIdentityByAliases(table, row, identityAliases.length > 0 ? identityAliases : [identityHeader]);
    if (aliasIdentity) return aliasIdentity;

    return resolveRowIdentity(table, row, identityHeader, `${deleteRole}_`, rowIndex);
}

function validateSelectedTargets(scene, tables, selectedSet) {
    const tableRoles = getSceneTableRoles(scene);
    if (tableRoles.length <= 0) {
        return { ok: false, message: '删除失败：小剧场缺少表配置' };
    }

    const parsedTargets = parseSelectedTargets(selectedSet);
    if (parsedTargets.length !== selectedSet.size || parsedTargets.length <= 0) {
        return { ok: false, message: STALE_DATA_MESSAGE };
    }

    const mappings = buildDeleteRoleMappings(scene, selectedSet);
    for (const target of parsedTargets) {
        const mappedTableRoles = mappings.get(target.role) || [];
        if (mappedTableRoles.length !== 1) {
            return { ok: false, message: STALE_DATA_MESSAGE };
        }

        const tableRole = mappedTableRoles[0];
        const table = tables[tableRole];
        if (!table || !Array.isArray(table.rows)) {
            return { ok: false, message: STALE_DATA_MESSAGE };
        }

        const row = table.rows[target.rowIndex];
        if (!Array.isArray(row)) {
            return { ok: false, message: STALE_DATA_MESSAGE };
        }

        const currentIdentity = resolveTargetIdentity(scene, target.role, tableRole, table, row, target.rowIndex);
        if (!hasDeleteTarget([target], target.rowIndex, currentIdentity)) {
            return { ok: false, message: STALE_DATA_MESSAGE };
        }
    }

    return { ok: true };
}

function buildDeleteContext(nextRawData, index, scene, tables, selectedSet) {
    return Object.freeze({
        rawData: nextRawData,
        index,
        scene,
        tables,
        selectedSet,
        filterTableRows,
        buildDeleteTargets,
        hasDeleteTarget,
        helpers: Object.freeze({
            getCellByHeader,
            normalizeText,
            parseTheaterDeleteKey,
            resolveRowIdentity,
            splitSemicolonText,
        }),
    });
}

export async function deleteTheaterEntities(rawData, sceneId, selectedKeys = []) {
    void rawData;

    const selectedSet = normalizeSelectedKeys(selectedKeys);
    if (selectedSet.size <= 0) {
        return { ok: false, message: '请先选择要删除的内容', deletedCount: 0 };
    }

    const scene = getTheaterSceneDefinition(sceneId);
    if (!scene) {
        return { ok: false, message: '未知小剧场场景', deletedCount: 0 };
    }
    if (typeof scene.deleteEntities !== 'function') {
        return { ok: false, message: '删除失败：小剧场缺少删除处理器', deletedCount: 0 };
    }

    const latestRawData = getTableData();
    const nextRawData = cloneRawData(latestRawData);
    if (!nextRawData) {
        return { ok: false, message: '删除失败：无法读取最新数据，请刷新后重试', deletedCount: 0 };
    }

    const index = buildTheaterTableIndex(nextRawData);
    const tables = resolveSceneTables(index, scene);
    const primaryTable = index.tableByName.get(normalizeText(scene.primaryTableName));
    if (!primaryTable) {
        return { ok: false, message: STALE_DATA_MESSAGE, deletedCount: 0 };
    }

    const validation = validateSelectedTargets(scene, tables, selectedSet);
    if (!validation.ok) {
        return { ok: false, message: validation.message || STALE_DATA_MESSAGE, deletedCount: 0 };
    }

    const affectedSheetKeys = getAffectedSheetKeys(index, scene);
    const deletion = scene.deleteEntities(buildDeleteContext(nextRawData, index, scene, tables, selectedSet)) || { removed: 0 };
    const removedCount = normalizeRemovedCount(deletion.removed);

    if (removedCount <= 0) {
        return { ok: false, message: '未找到可删除的数据', deletedCount: 0 };
    }

    const saved = await saveTableData(nextRawData);
    if (!saved) {
        return { ok: false, message: '删除失败：保存数据失败', deletedCount: 0 };
    }

    const refreshed = await refreshPhoneTableProjection();
    const notifiedSheetKeys = Array.from(new Set([...(deletion.affectedSheetKeys || []), ...affectedSheetKeys].filter(Boolean)));
    notifiedSheetKeys.forEach(sheetKey => dispatchPhoneTableUpdated(sheetKey));

    return {
        ok: true,
        message: refreshed ? `已删除 ${removedCount} 条相关数据` : `已删除 ${removedCount} 条相关数据，但刷新投影失败`,
        deletedCount: removedCount,
        refreshed,
        affectedSheetKeys: notifiedSheetKeys,
    };
}
