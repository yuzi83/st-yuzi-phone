import { getTableData } from '../phone-core/data-api.js';
import { isContentPresetFullPageRuntimeEnabled } from './activation-gate.js';
import { buildContentPresetCatalog } from './catalog.js';
import { importContentPreset, serializeContentPreset } from './import-export.js';
import { getContentPresetIndexSnapshot, subscribeContentPresetIndex } from './index-state.js';
import { invalidateContentPresetInstances } from './instance-coordinator.js';
import { enqueueContentPresetMutation } from './mutation-coordinator.js';
import { convergeCurrentContentPresetRoute } from './route-convergence.js';
import { contentPresetScrollRegistry } from './scroll-registry.js';
import {
    clearAllPageActiveBindings,
    clearAllPopupActiveBindings,
    clearPageActiveBinding,
    clearPopupActiveBinding,
    deletePresetRecord,
    getPresetExportRecord,
    getPresetRecord,
    listPresetRecords,
    replacePresetRecord,
    setPageActiveBinding,
    setPopupActiveBindings,
    setPopupActiveBinding,
} from './repository.js';

const DEFAULT_WORKSHOP_DEPS = Object.freeze({
    buildContentPresetCatalog,
    clearAllPageActiveBindings,
    clearAllPopupActiveBindings,
    clearPageActiveBinding,
    clearPopupActiveBinding,
    contentPresetScrollRegistry,
    convergeCurrentContentPresetRoute,
    deletePresetRecord,
    enqueueContentPresetMutation,
    getContentPresetIndexSnapshot,
    getPresetExportRecord,
    getPresetRecord,
    importContentPreset,
    invalidateContentPresetInstances,
    isContentPresetFullPageRuntimeEnabled,
    listPresetRecords,
    replacePresetRecord,
    serializeContentPreset,
    setPageActiveBinding,
    setPopupActiveBindings,
    setPopupActiveBinding,
    subscribeContentPresetIndex,
});

function metadataOf(record) {
    return Object.freeze({ id: record.id, name: record.name, version: record.version, author: record.author, itemCount: record.items?.length || 0, issues: record.issues || [], importedAt: record.importedAt });
}
async function capturePostCommitFailure(task) { try { await task(); } catch {} }
function withCommittedMutation(runtimeDeps, operation, buildPatch, afterCommit) {
    return runtimeDeps.enqueueContentPresetMutation(operation, (result, current) => buildPatch(result, current), (result, current, patch) => capturePostCommitFailure(() => afterCommit?.(result, current, patch)))
        .then(async result => {
            const affectedSheetKeys = result.affectedSheetKeys || [];
            await capturePostCommitFailure(() => runtimeDeps.invalidateContentPresetInstances(affectedSheetKeys));
            await capturePostCommitFailure(() => runtimeDeps.convergeCurrentContentPresetRoute(affectedSheetKeys));
            return result;
        });
}
function replaceMetadata(current, record) { const metadata = new Map(current.metadata); metadata.set(record.id, metadataOf(record)); return metadata; }
function pageBindings(snapshot) { return new Map(snapshot.pageByTable || snapshot.activeByTable || []); }
function popupBindings(snapshot) { return new Map(snapshot.popupByTable || []); }
function clearAffected(map, keys) { const next = new Map(map); keys.forEach(key => next.delete(key)); return next; }

export function createUnavailableContentPresetWorkshopService() {
    const error = new Error('模板工坊将在完整页面运行时启用后可用');
    const snapshot = Object.freeze({ status: 'unavailable', error, metadata: new Map(), pageByTable: new Map(), popupByTable: new Map(), activeByTable: new Map(), revision: 0 });
    const viewModel = Object.freeze({ status: 'unavailable', error, revision: 0, presets: Object.freeze([]), tables: Object.freeze([]) });
    const unavailable = () => Promise.reject(error);
    return Object.freeze({
        getSnapshot: () => snapshot, subscribe: () => () => {}, getViewModel: async () => viewModel,
        prepareImport: unavailable, importPrepared: unavailable, exportPreset: unavailable, deletePreset: unavailable,
        setPageActive: unavailable, clearPageActive: unavailable, clearAllPageActive: unavailable,
        setPopupActive: unavailable, clearPopupActive: unavailable, clearAllPopupActive: unavailable,
        // v2 公开方法仅代表页面应用。
        setActive: unavailable, clearActive: unavailable, clearAllActive: unavailable,
    });
}

function createContentPresetWorkshopServiceWithDeps(options = {}, overrides = {}) {
    const runtimeDeps = { ...DEFAULT_WORKSHOP_DEPS, ...overrides };
    // 测试与旧内调用仍可能注入 v2 repository 名称；这些别名始终只映射到页面侧。
    if (overrides.setActiveBinding && !overrides.setPageActiveBinding) runtimeDeps.setPageActiveBinding = overrides.setActiveBinding;
    if (overrides.clearActiveBinding && !overrides.clearPageActiveBinding) runtimeDeps.clearPageActiveBinding = overrides.clearActiveBinding;
    if (overrides.clearAllActiveBindings && !overrides.clearAllPageActiveBindings) runtimeDeps.clearAllPageActiveBindings = overrides.clearAllActiveBindings;
    if (overrides.setPopupActiveBinding && !overrides.setPopupActiveBindings) {
        runtimeDeps.setPopupActiveBindings = async bindings => Promise.all(
            bindings.map(binding => runtimeDeps.setPopupActiveBinding(binding.sheetKey, binding.presetId)),
        );
    }
    if (!runtimeDeps.isContentPresetFullPageRuntimeEnabled()) return createUnavailableContentPresetWorkshopService();
    const readTableData = options.getTableData || getTableData;
    const getViewModel = async () => {
        const [presets, rawData] = await Promise.all([runtimeDeps.listPresetRecords(), Promise.resolve(readTableData())]);
        const index = runtimeDeps.getContentPresetIndexSnapshot();
        return Object.freeze({
            status: index.status, error: index.error, revision: index.revision, presets: Object.freeze(presets),
            tables: runtimeDeps.buildContentPresetCatalog(rawData || {}, presets, pageBindings(index), popupBindings(index)),
        });
    };
    const setPageActive = (sheetKey, presetId, itemId) => withCommittedMutation(runtimeDeps, async () => {
        const table = (await getViewModel()).tables.find(entry => entry.sheetKey === sheetKey);
        const candidates = table?.pageCandidates || table?.candidates || [];
        if (!table || !candidates.find(entry => entry.presetId === presetId && entry.itemId === itemId)) throw new Error('目标表或页面美化预设项不可绑定');
        return { record: await runtimeDeps.setPageActiveBinding(sheetKey, presetId, itemId), affectedSheetKeys: [sheetKey] };
    }, (result, current) => {
        const pageByTable = pageBindings(current); pageByTable.set(sheetKey, result.record);
        return { affectedSheetKeys: result.affectedSheetKeys, indexPatch: { pageByTable, activeByTable: pageByTable } };
    }, (_result, current) => {
        const previous = pageBindings(current).get(sheetKey);
        if (previous) runtimeDeps.contentPresetScrollRegistry.clearByBinding(previous);
    });
    const clearPageActive = sheetKey => withCommittedMutation(runtimeDeps, async () => {
        await runtimeDeps.clearPageActiveBinding(sheetKey); return { affectedSheetKeys: [sheetKey] };
    }, (result, current) => ({ affectedSheetKeys: result.affectedSheetKeys, indexPatch: (() => { const pageByTable = clearAffected(pageBindings(current), result.affectedSheetKeys); return { pageByTable, activeByTable: pageByTable }; })() }), (_result, current) => {
        const previous = pageBindings(current).get(sheetKey);
        if (previous) runtimeDeps.contentPresetScrollRegistry.clearByBinding(previous);
    });
    const planPopupApplication = async (sheetKey, presetId) => {
        const viewModel = await getViewModel();
        const table = viewModel.tables.find(entry => entry.sheetKey === sheetKey);
        const candidate = table?.popupCandidates.find(entry => entry.presetId === presetId);
        if (!candidate) throw new Error('目标表或弹窗美化来源不可绑定');
        const needed = new Set([sheetKey]);
        const tableByTarget = target => {
            const matched = viewModel.tables.filter(entry => (
                entry.tableName === target.tableName
                && (target.fields || []).every(field => (entry.headers || []).includes(field))
            ));
            if (matched.length !== 1) throw new Error(`组合展示依赖表不可用：${target.tableName}`);
            return matched[0];
        };
        for (const descriptor of candidate.displays || []) {
            const display = descriptor?.display || descriptor?.item || descriptor;
            if (!Array.isArray(display?.targets) || display.targets.length < 2) continue;
            display.targets.forEach(target => needed.add(tableByTarget(target).sheetKey));
        }
        const currentBindings = popupBindings(runtimeDeps.getContentPresetIndexSnapshot());
        const bindings = [...needed].map(requiredSheetKey => {
            const requiredTable = viewModel.tables.find(entry => entry.sheetKey === requiredSheetKey);
            const requiredCandidate = requiredTable?.popupCandidates.find(entry => entry.presetId === presetId);
            if (!requiredCandidate) throw new Error(`组合展示依赖表未匹配同一美化来源：${requiredTable?.tableName || requiredSheetKey}`);
            return Object.freeze({
                sheetKey: requiredSheetKey,
                presetId,
                displays: Object.freeze((requiredCandidate.displays || [])
                    .map(item => item?.display || item?.item || item)
                    .filter(Boolean)),
            });
        });
        const conflicts = bindings
            .map(binding => ({ binding, previous: currentBindings.get(binding.sheetKey) || null }))
            .filter(({ previous }) => previous?.presetId && previous.presetId !== presetId)
            .map(({ binding, previous }) => Object.freeze({
                sheetKey: binding.sheetKey,
                previousPresetId: previous.presetId,
            }));
        return Object.freeze({
            sheetKey,
            presetId,
            bindings: Object.freeze(bindings),
            conflicts: Object.freeze(conflicts),
        });
    };
    const setPopupActive = (sheetKey, presetId, options = {}) => withCommittedMutation(runtimeDeps, async () => {
        const plan = await planPopupApplication(sheetKey, presetId);
        if (plan.conflicts.length > 0 && options?.replace !== true) {
            const error = new Error('组合展示会替换其他表的弹窗美化来源，需要确认');
            error.code = 'CONTENT_PRESET_POPUP_REPLACE_CONFIRMATION_REQUIRED';
            error.conflicts = plan.conflicts;
            error.plan = plan;
            throw error;
        }
        const stored = await runtimeDeps.setPopupActiveBindings(plan.bindings);
        const records = stored.map(record => {
            const definition = plan.bindings.find(binding => binding.sheetKey === record.sheetKey);
            return Object.freeze({ ...record, displays: definition?.displays || Object.freeze([]) });
        });
        return {
            record: records.find(record => record.sheetKey === sheetKey) || records[0],
            records: Object.freeze(records),
            affectedSheetKeys: records.map(record => record.sheetKey),
        };
    }, (result, current) => {
        const popupByTable = popupBindings(current);
        result.records.forEach(record => popupByTable.set(record.sheetKey, record));
        return { affectedSheetKeys: result.affectedSheetKeys, indexPatch: { popupByTable } };
    });
    const clearPopupActive = sheetKey => withCommittedMutation(runtimeDeps, async () => {
        await runtimeDeps.clearPopupActiveBinding(sheetKey); return { affectedSheetKeys: [sheetKey] };
    }, (result, current) => ({ affectedSheetKeys: result.affectedSheetKeys, indexPatch: { popupByTable: clearAffected(popupBindings(current), result.affectedSheetKeys) } }));

    return Object.freeze({
        getSnapshot: runtimeDeps.getContentPresetIndexSnapshot,
        subscribe: runtimeDeps.subscribeContentPresetIndex,
        getViewModel,
        async prepareImport(input) { const record = runtimeDeps.importContentPreset(input); return Object.freeze({ record, replacesExisting: !!await runtimeDeps.getPresetRecord(record.id) }); },
        async importPrepared(prepared, allowReplace = false) {
            const record = prepared?.record;
            if (!record?.id) throw new Error('待导入预设无效');
            return withCommittedMutation(runtimeDeps, async () => {
                const existing = await runtimeDeps.getPresetRecord(record.id);
                if (existing && !allowReplace) { const error = new Error(`预设 ${record.id} 已存在，需要确认覆盖`); error.code = 'CONTENT_PRESET_REPLACE_CONFIRMATION_REQUIRED'; throw error; }
                return { ...await runtimeDeps.replacePresetRecord(record), replaced: !!existing };
            }, (result, current) => ({
                affectedSheetKeys: result.affectedSheetKeys,
                indexPatch: { status: 'ready', error: null, metadata: replaceMetadata(current, record), pageByTable: clearAffected(pageBindings(current), result.affectedSheetKeys), popupByTable: clearAffected(popupBindings(current), result.affectedSheetKeys) },
            }), result => { if (result.replaced) runtimeDeps.contentPresetScrollRegistry.clearByPreset(record.id); });
        },
        async exportPreset(presetId) {
            const record = await runtimeDeps.getPresetExportRecord(presetId);
            if (!record) throw new Error(`预设不存在：${presetId}`);
            return Object.freeze({ filename: `${record.id}.yuzi-beautify.json`, text: runtimeDeps.serializeContentPreset(record), mimeType: 'application/json' });
        },
        deletePreset: presetId => withCommittedMutation(runtimeDeps, () => runtimeDeps.deletePresetRecord(presetId), (result, current) => {
            const metadata = new Map(current.metadata); metadata.delete(result.presetId);
            return { affectedSheetKeys: result.affectedSheetKeys, indexPatch: { metadata, pageByTable: clearAffected(pageBindings(current), result.affectedSheetKeys), popupByTable: clearAffected(popupBindings(current), result.affectedSheetKeys) } };
        }, result => runtimeDeps.contentPresetScrollRegistry.clearByPreset(result.presetId)),
        setPageActive,
        clearPageActive,
        clearAllPageActive: () => withCommittedMutation(runtimeDeps, async () => { await runtimeDeps.clearAllPageActiveBindings(); return { affectedSheetKeys: [...pageBindings(runtimeDeps.getContentPresetIndexSnapshot()).keys()] }; }, result => ({ affectedSheetKeys: result.affectedSheetKeys, indexPatch: { pageByTable: new Map(), activeByTable: new Map() } }), (_result, current) => { for (const binding of pageBindings(current).values()) runtimeDeps.contentPresetScrollRegistry.clearByBinding(binding); }),
        setPopupActive,
        planPopupApplication,
        clearPopupActive,
        clearAllPopupActive: () => withCommittedMutation(runtimeDeps, async () => { await runtimeDeps.clearAllPopupActiveBindings(); return { affectedSheetKeys: [...popupBindings(runtimeDeps.getContentPresetIndexSnapshot()).keys()] }; }, result => ({ affectedSheetKeys: result.affectedSheetKeys, indexPatch: { popupByTable: new Map() } })),
        // 旧调用者的 setActive 语义固定为页面应用。
        setActive: setPageActive,
        clearActive: clearPageActive,
        clearAllActive: () => withCommittedMutation(runtimeDeps, async () => { await runtimeDeps.clearAllPageActiveBindings(); return { affectedSheetKeys: [...pageBindings(runtimeDeps.getContentPresetIndexSnapshot()).keys()] }; }, result => ({ affectedSheetKeys: result.affectedSheetKeys, indexPatch: { pageByTable: new Map(), activeByTable: new Map() } }), (_result, current) => { for (const binding of pageBindings(current).values()) runtimeDeps.contentPresetScrollRegistry.clearByBinding(binding); }),
    });
}
export function createContentPresetWorkshopService(options = {}) { return createContentPresetWorkshopServiceWithDeps(options); }
export function __test__createContentPresetWorkshopService(overrides = {}, options = {}) { return createContentPresetWorkshopServiceWithDeps(options, overrides); }
