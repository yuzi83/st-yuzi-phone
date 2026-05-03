import { getPhoneSettings, savePhoneSetting } from '../../settings.js';
import { clampNumber } from '../../utils/object.js';
import { DB_ACTIVE_PRESET_SETTING_KEY, DB_PRESETS_SETTING_KEY } from '../constants.js';

export function getDbPresetsFromPhoneSettings() {
    const raw = getPhoneSettings()?.[DB_PRESETS_SETTING_KEY];
    return normalizeDbPresetList(raw);
}

export function saveDbPresetsToPhoneSettings(presets) {
    const normalized = normalizeDbPresetList(presets);
    savePhoneSetting(DB_PRESETS_SETTING_KEY, normalized);
}

export function getActiveDbPresetNameFromSettings() {
    return String(getPhoneSettings()?.[DB_ACTIVE_PRESET_SETTING_KEY] || '').trim();
}

export function setActiveDbPresetNameToSettings(name) {
    const normalized = String(name || '').trim();
    savePhoneSetting(DB_ACTIVE_PRESET_SETTING_KEY, normalized);
}

export function createDbPreset(name, snapshot) {
    const normalizedName = String(name || '').trim();
    const normalizedSnapshot = normalizeDbConfigSnapshot(snapshot);
    return {
        name: normalizedName,
        updateConfig: normalizedSnapshot.updateConfig,
        manualSelection: normalizedSnapshot.manualSelection,
        updatedAt: Date.now(),
    };
}

export function normalizeDbPresetList(raw) {
    if (!Array.isArray(raw)) return [];

    const dedup = [];
    const seenNames = new Set();

    raw.forEach((item) => {
        const normalized = normalizeDbPreset(item);
        if (!normalized) return;
        if (seenNames.has(normalized.name)) return;
        seenNames.add(normalized.name);
        dedup.push(normalized);
    });

    return dedup;
}

export function normalizeDbPreset(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const name = String(raw.name || '').trim();
    if (!name) return null;

    const updatedAtNum = Number(raw.updatedAt);

    return {
        name,
        updateConfig: normalizeDbUpdateConfig(raw.updateConfig),
        manualSelection: normalizeDbManualSelection(raw.manualSelection),
        updatedAt: Number.isFinite(updatedAtNum) ? updatedAtNum : Date.now(),
    };
}

export function normalizeDbConfigSnapshot(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
        updateConfig: normalizeDbUpdateConfig(src.updateConfig),
        manualSelection: normalizeDbManualSelection(src.manualSelection),
    };
}

export function normalizeDbUpdateConfig(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
        autoUpdateThreshold: clampNumber(src.autoUpdateThreshold, 0, 999999, 3),
        autoUpdateFrequency: clampNumber(src.autoUpdateFrequency, 1, 999999, 1),
        updateBatchSize: clampNumber(src.updateBatchSize, 1, 999999, 2),
        autoUpdateTokenThreshold: clampNumber(src.autoUpdateTokenThreshold, 0, 99999999, 0),
    };
}

export function normalizeDbManualSelection(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const selectedTables = Array.isArray(src.selectedTables)
        ? Array.from(new Set(src.selectedTables
            .map(v => String(v || '').trim())
            .filter(Boolean)))
        : [];

    const hasManualSelection = typeof src.hasManualSelection === 'boolean'
        ? src.hasManualSelection
        : selectedTables.length > 0;

    return {
        hasManualSelection,
        selectedTables,
    };
}

export function isSameDbSnapshot(a, b) {
    const left = normalizeDbConfigSnapshot(a);
    const right = normalizeDbConfigSnapshot(b);

    const updateSame = left.updateConfig.autoUpdateThreshold === right.updateConfig.autoUpdateThreshold
        && left.updateConfig.autoUpdateFrequency === right.updateConfig.autoUpdateFrequency
        && left.updateConfig.updateBatchSize === right.updateConfig.updateBatchSize
        && left.updateConfig.autoUpdateTokenThreshold === right.updateConfig.autoUpdateTokenThreshold;

    if (!updateSame) return false;

    if (left.manualSelection.hasManualSelection !== right.manualSelection.hasManualSelection) {
        return false;
    }

    return areStringSetEqual(left.manualSelection.selectedTables, right.manualSelection.selectedTables);
}

export function areStringSetEqual(a = [], b = []) {
    if (a.length !== b.length) return false;
    const rightSet = new Set(b.map(v => String(v)));
    return a.every(v => rightSet.has(String(v)));
}
