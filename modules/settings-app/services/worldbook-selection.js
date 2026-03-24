import { getCurrentCharacterWorldbooks, getWorldbook, getWorldbookNames, onWorldInfoUpdated } from '../../integration.js';
import { getPhoneSettings, savePhoneSetting } from '../../settings.js';

const WORLDBOOK_SELECTION_DEFAULTS = Object.freeze({
    sourceMode: 'manual',
    selectedWorldbook: '',
    entries: {},
});

const WORLDBOOK_SOURCE_MODES = new Set(['off', 'manual', 'character_bound']);

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSourceMode(value) {
    const safeMode = String(value || '').trim();
    return WORLDBOOK_SOURCE_MODES.has(safeMode)
        ? safeMode
        : WORLDBOOK_SELECTION_DEFAULTS.sourceMode;
}

function normalizeWorldbookNames(names) {
    const list = Array.isArray(names) ? names : [];
    return Array.from(new Set(list.map(item => String(item || '').trim()).filter(Boolean)));
}

function normalizeWorldbookEntries(entries) {
    if (!isPlainObject(entries)) return {};

    const normalized = {};
    Object.entries(entries).forEach(([worldbookName, selectionMap]) => {
        const safeWorldbookName = String(worldbookName || '').trim();
        if (!safeWorldbookName || !isPlainObject(selectionMap)) return;

        const normalizedMap = {};
        Object.entries(selectionMap).forEach(([uid, selected]) => {
            if (selected === true || selected === false) {
                normalizedMap[String(uid)] = selected;
            }
        });

        if (Object.keys(normalizedMap).length > 0) {
            normalized[safeWorldbookName] = normalizedMap;
        }
    });

    return normalized;
}

export function normalizeWorldbookSelection(raw) {
    const src = isPlainObject(raw) ? raw : {};
    return {
        sourceMode: normalizeSourceMode(src.sourceMode),
        selectedWorldbook: String(src.selectedWorldbook || '').trim(),
        entries: normalizeWorldbookEntries(src.entries),
    };
}

function getEntrySelectionMap(selection, worldbookName) {
    const safeWorldbookName = String(worldbookName || '').trim();
    if (!safeWorldbookName) return {};

    const normalized = normalizeWorldbookSelection(selection);
    return isPlainObject(normalized.entries[safeWorldbookName])
        ? normalized.entries[safeWorldbookName]
        : {};
}

export async function loadWorldbookList() {
    try {
        const names = await getWorldbookNames();
        return {
            list: Array.isArray(names) ? names : [],
            error: null,
        };
    } catch (error) {
        return {
            list: [],
            error: error?.message || '加载世界书列表失败',
        };
    }
}

export async function loadWorldbookEntries(worldbookName) {
    if (!worldbookName) {
        return {
            entries: [],
            error: null,
        };
    }

    try {
        const entries = await getWorldbook(worldbookName);
        return {
            entries: Array.isArray(entries) ? entries : [],
            error: null,
        };
    } catch (error) {
        return {
            entries: [],
            error: error?.message || '加载世界书条目失败',
        };
    }
}

export async function loadCharacterBoundWorldbooks() {
    try {
        const bound = await getCurrentCharacterWorldbooks();
        return {
            list: normalizeWorldbookNames([bound?.primary, ...(Array.isArray(bound?.additional) ? bound.additional : [])]),
            error: null,
        };
    } catch (error) {
        return {
            list: [],
            error: error?.message || '加载角色绑定世界书失败',
        };
    }
}

export async function loadCharacterBoundWorldbookEntries() {
    const worldbooksResult = await loadCharacterBoundWorldbooks();
    const worldbooks = Array.isArray(worldbooksResult.list) ? worldbooksResult.list : [];
    if (worldbooks.length === 0) {
        return {
            worldbooks: [],
            entries: [],
            error: worldbooksResult.error || null,
        };
    }

    try {
        const results = await Promise.all(worldbooks.map(async (worldbookName) => {
            const entryResult = await loadWorldbookEntries(worldbookName);
            return {
                worldbookName,
                entries: Array.isArray(entryResult.entries) ? entryResult.entries : [],
            };
        }));

        return {
            worldbooks,
            entries: results.flatMap(item => item.entries.map(entry => ({
                ...entry,
                __worldbookName: item.worldbookName,
            }))),
            error: null,
        };
    } catch (error) {
        return {
            worldbooks,
            entries: [],
            error: error?.message || '加载绑定世界书条目失败',
        };
    }
}

export function resolveEntrySelectionState(selection, worldbookName, uid, sourceMode = null) {
    const safeWorldbookName = String(worldbookName || '').trim();
    const uidKey = String(uid ?? '').trim();
    if (!safeWorldbookName || !uidKey) return false;

    const normalized = normalizeWorldbookSelection(selection);
    const effectiveMode = normalizeSourceMode(sourceMode || normalized.sourceMode);
    const selectionMap = getEntrySelectionMap(normalized, safeWorldbookName);

    if (Object.prototype.hasOwnProperty.call(selectionMap, uidKey)) {
        return selectionMap[uidKey] === true;
    }

    return effectiveMode === 'character_bound';
}

export function applyEntrySelectionState(selection, worldbookName, uid, selected, sourceMode = null) {
    const safeWorldbookName = String(worldbookName || '').trim();
    const uidKey = String(uid ?? '').trim();
    const normalized = normalizeWorldbookSelection(selection);
    if (!safeWorldbookName || !uidKey) return normalized;

    const effectiveMode = normalizeSourceMode(sourceMode || normalized.sourceMode);
    const next = {
        ...normalized,
        sourceMode: effectiveMode,
        entries: { ...normalized.entries },
    };

    const selectionMap = {
        ...getEntrySelectionMap(normalized, safeWorldbookName),
    };

    if (effectiveMode === 'character_bound' && selected === true) {
        delete selectionMap[uidKey];
    } else {
        selectionMap[uidKey] = selected === true;
    }

    if (Object.keys(selectionMap).length > 0) {
        next.entries[safeWorldbookName] = selectionMap;
    } else {
        delete next.entries[safeWorldbookName];
    }

    return next;
}

export function getEntrySelectionState(worldbookName, uid, sourceMode = null) {
    return resolveEntrySelectionState(getPhoneSettings()?.worldbookSelection, worldbookName, uid, sourceMode);
}

export function setEntrySelectionState(worldbookName, uid, selected, options = {}) {
    const safeWorldbookName = String(worldbookName || '').trim();
    if (!safeWorldbookName) {
        return normalizeWorldbookSelection(getPhoneSettings()?.worldbookSelection);
    }

    const currentSelection = normalizeWorldbookSelection(getPhoneSettings()?.worldbookSelection);
    const effectiveMode = normalizeSourceMode(options?.sourceMode || currentSelection.sourceMode);
    const nextSelection = applyEntrySelectionState(currentSelection, safeWorldbookName, uid, selected, effectiveMode);

    if (effectiveMode === 'manual') {
        nextSelection.selectedWorldbook = safeWorldbookName;
    }

    savePhoneSetting('worldbookSelection', nextSelection);
    return nextSelection;
}

export function getCurrentWorldbookSelection() {
    return normalizeWorldbookSelection(getPhoneSettings()?.worldbookSelection);
}

export function saveCurrentWorldbookSelection(worldbookName) {
    const selection = normalizeWorldbookSelection(getPhoneSettings()?.worldbookSelection);
    selection.selectedWorldbook = String(worldbookName || '').trim();
    savePhoneSetting('worldbookSelection', selection);
}

export function filterEntries(entries, query) {
    if (!query || !query.trim()) {
        return entries;
    }
    const lowerQuery = query.toLowerCase().trim();
    return entries.filter(entry =>
        entry.name && entry.name.toLowerCase().includes(lowerQuery)
    );
}

export function subscribeWorldbookUpdates(listener) {
    return onWorldInfoUpdated(listener);
}
