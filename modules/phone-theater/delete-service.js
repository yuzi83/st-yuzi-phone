import { deleteTableRowsBatch, getTableData } from '../phone-core/data-api.js';
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

function createDeletionPlanTracker() {
    const planBySheetKey = new Map();

    const addRowIndex = (table, rowIndex) => {
        if (!table?.sheetKey || !Number.isInteger(rowIndex) || rowIndex < 0) return;
        const sheetKey = normalizeText(table.sheetKey);
        if (!sheetKey) return;
        if (!planBySheetKey.has(sheetKey)) {
            planBySheetKey.set(sheetKey, {
                sheetKey,
                tableName: normalizeText(table.tableName || table.name) || sheetKey,
                rowIndexes: new Set(),
                role: normalizeText(table.role),
            });
        }
        planBySheetKey.get(sheetKey).rowIndexes.add(rowIndex);
    };

    return {
        addRowIndex,
        toPlans() {
            return [...planBySheetKey.values()]
                .map((item) => ({
                    sheetKey: item.sheetKey,
                    tableName: item.tableName,
                    role: item.role,
                    rowIndexes: [...item.rowIndexes].sort((a, b) => b - a),
                }))
                .filter((item) => item.rowIndexes.length > 0);
        },
    };
}

function filterTableRows(table, shouldDelete, tracker = null) {
    if (!table?.sheetKey || !Array.isArray(table.rows) || typeof shouldDelete !== 'function') {
        return { removed: 0, changed: false };
    }

    let removed = 0;
    table.rows.forEach((row, rowIndex) => {
        if (shouldDelete(row, rowIndex)) {
            removed += 1;
            tracker?.addRowIndex?.(table, rowIndex);
        }
    });

    return { removed, changed: removed > 0 };
}

function normalizeRemovedCount(value) {
    const count = Number(value);
    if (!Number.isFinite(count) || count <= 0) return 0;
    return Math.floor(count);
}

function resolveSceneTables(index, scene) {
    const tables = {};
    Object.entries(scene.tableNames || scene.tables || {}).forEach(([role, tableName]) => {
        const table = index.tableByName.get(normalizeText(tableName)) || null;
        if (table) table.role = role;
        tables[role] = table;
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

function buildDeleteContext(rawData, index, scene, tables, selectedSet, tracker) {
    return Object.freeze({
        rawData,
        index,
        scene,
        tables,
        selectedSet,
        filterTableRows: (table, shouldDelete) => filterTableRows(table, shouldDelete, tracker),
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

function sortDeletionPlans(scene, plans = []) {
    const primaryRole = normalizeText(scene?.primaryTableRole);
    return [...plans].sort((a, b) => {
        const aPrimary = normalizeText(a.role) === primaryRole;
        const bPrimary = normalizeText(b.role) === primaryRole;
        if (aPrimary !== bPrimary) return aPrimary ? 1 : -1;
        return String(a.tableName || a.sheetKey).localeCompare(String(b.tableName || b.sheetKey));
    });
}

function normalizeTheaterRowIndexes(rowIndexes = []) {
    return Array.from(new Set((Array.isArray(rowIndexes) ? rowIndexes : [rowIndexes])
        .map(value => Number(value))
        .filter(Number.isInteger)
        .filter(value => value >= 0)))
        .sort((a, b) => a - b);
}

function collectTheaterNotDeletedPlans(results = []) {
    return (Array.isArray(results) ? results : [])
        .map((result) => {
            const notDeletedRowIndexes = normalizeTheaterRowIndexes(
                result?.notDeletedRowIndexes || result?.failedRowIndexes || []
            );
            if (notDeletedRowIndexes.length <= 0) return null;
            return {
                sheetKey: normalizeText(result?.sheetKey),
                tableName: normalizeText(result?.tableName),
                role: normalizeText(result?.role),
                attempted: true,
                reason: String(result?.code || 'delete_failed').trim() || 'delete_failed',
                notDeletedRowIndexes,
            };
        })
        .filter(Boolean);
}

function collectUnattemptedTheaterNotDeletedPlans(plans = []) {
    return (Array.isArray(plans) ? plans : [])
        .map((plan) => {
            const notDeletedRowIndexes = normalizeTheaterRowIndexes(plan?.rowIndexes || []);
            if (notDeletedRowIndexes.length <= 0) return null;
            return {
                sheetKey: normalizeText(plan?.sheetKey),
                tableName: normalizeText(plan?.tableName),
                role: normalizeText(plan?.role),
                attempted: false,
                reason: 'unattempted_after_previous_failure',
                notDeletedRowIndexes,
            };
        })
        .filter(Boolean);
}

function buildTheaterNotDeletedRowsBySheetKey(notDeletedPlans = []) {
    return Object.fromEntries((Array.isArray(notDeletedPlans) ? notDeletedPlans : [])
        .map((plan) => [
            plan.sheetKey,
            {
                tableName: plan.tableName,
                role: plan.role,
                attempted: plan.attempted !== false,
                reason: String(plan.reason || '').trim(),
                notDeletedRowIndexes: normalizeTheaterRowIndexes(plan.notDeletedRowIndexes),
            },
        ])
        .filter(([sheetKey, detail]) => sheetKey && detail.notDeletedRowIndexes.length > 0));
}

async function executeTheaterDeletionPlans(scene, plans = []) {
    const orderedPlans = sortDeletionPlans(scene, plans);
    const results = [];
    let deletedCount = 0;

    for (let planIndex = 0; planIndex < orderedPlans.length; planIndex += 1) {
        const plan = orderedPlans[planIndex];
        const result = await deleteTableRowsBatch(plan.tableName, plan.rowIndexes, {
            refreshProjection: false,
        });
        results.push({
            ...result,
            sheetKey: plan.sheetKey,
            tableName: plan.tableName,
            role: plan.role,
        });
        deletedCount += Number(result.deletedCount || 0);
        if (!result.ok) {
            const notDeletedPlans = [
                ...collectTheaterNotDeletedPlans(results),
                ...collectUnattemptedTheaterNotDeletedPlans(orderedPlans.slice(planIndex + 1)),
            ];
            return {
                ok: false,
                code: result.code || 'partial_failed',
                message: result.message || '小剧场删除失败：数据库未确认删除目标行',
                deletedCount,
                results,
                notDeletedPlans,
                notDeletedRowsBySheetKey: buildTheaterNotDeletedRowsBySheetKey(notDeletedPlans),
            };
        }
    }

    return {
        ok: true,
        code: 'ok',
        message: '小剧场行级删除成功',
        deletedCount,
        results,
    };
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
    const readOnlyRawData = cloneRawData(latestRawData);
    if (!readOnlyRawData) {
        return { ok: false, message: '删除失败：无法读取最新数据，请刷新后重试', deletedCount: 0 };
    }

    const index = buildTheaterTableIndex(readOnlyRawData);
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
    const tracker = createDeletionPlanTracker();
    const deletion = scene.deleteEntities(buildDeleteContext(readOnlyRawData, index, scene, tables, selectedSet, tracker)) || { removed: 0 };
    const removedCount = normalizeRemovedCount(deletion.removed);
    const deletionPlans = tracker.toPlans();

    if (removedCount <= 0 || deletionPlans.length <= 0) {
        return { ok: false, message: '未找到可删除的数据', deletedCount: 0 };
    }

    const execution = await executeTheaterDeletionPlans(scene, deletionPlans);
    const refreshed = await refreshPhoneTableProjection();
    const notifiedSheetKeys = Array.from(new Set([
        ...(deletion.affectedSheetKeys || []),
        ...affectedSheetKeys,
        ...deletionPlans.map(plan => plan.sheetKey),
    ].filter(Boolean)));
    notifiedSheetKeys.forEach(sheetKey => dispatchPhoneTableUpdated(sheetKey));

    if (!execution.ok) {
        return {
            ok: false,
            message: `${execution.message || '删除失败'}；已删除 ${execution.deletedCount} / ${removedCount} 条相关数据，请刷新后核对`,
            deletedCount: execution.deletedCount,
            expectedDeletedCount: removedCount,
            refreshed,
            affectedSheetKeys: notifiedSheetKeys,
            results: execution.results,
            notDeletedPlans: execution.notDeletedPlans || [],
            notDeletedRowsBySheetKey: execution.notDeletedRowsBySheetKey || {},
        };
    }

    return {
        ok: true,
        message: refreshed ? `已删除 ${execution.deletedCount} 条相关数据` : `已删除 ${execution.deletedCount} 条相关数据，但刷新投影失败`,
        deletedCount: execution.deletedCount,
        expectedDeletedCount: removedCount,
        refreshed,
        affectedSheetKeys: notifiedSheetKeys,
        results: execution.results,
    };
}
