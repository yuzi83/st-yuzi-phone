import { CONTENT_PRESET_API_VERSION, CONTENT_PRESET_FORMAT, CONTENT_PRESET_FORMAT_VERSION } from './constants.js';
import { parseContentPresetBundle } from './format.js';
import { normalizeContentPresetBundle } from './normalize.js';

export function importContentPreset(input) { return normalizeContentPresetBundle(parseContentPresetBundle(input)); }
function sortedObject(value) { return Object.fromEntries(Object.keys(value || {}).sort().map(key => [key, value[key]])); }
function exportFile(file) { return { mimeType: file.mimeType, encoding: file.encoding, content: file.content }; }
function exportItem(item) {
    return {
        id: item.id,
        name: item.name,
        target: item.target,
        entry: item.entry,
        assets: item.assets,
        ...(item.integrations ? { integrations: item.integrations } : {}),
        ...(item.imageGeneration ? { imageGeneration: item.imageGeneration } : {}),
    };
}
function exportDisplay(display) {
    return {
        id: display.id,
        name: display.name,
        kind: display.kind,
        targets: display.targets,
        entry: display.entry,
        assets: display.assets,
        ...(display.integrations ? { integrations: display.integrations } : {}),
        ...(display.imageGeneration ? { imageGeneration: display.imageGeneration } : {}),
        ...(display.interactions ? { interactions: display.interactions } : {}),
    };
}
export function exportContentPreset(record) {
    const isV3 = record.formatVersion === CONTENT_PRESET_FORMAT_VERSION && record.apiVersion === CONTENT_PRESET_API_VERSION;
    const manifest = { ...record.manifest, id: record.id, name: record.name, version: record.version, author: record.author, items: record.items.map(exportItem), ...(isV3 ? { displays: (record.displays || []).map(exportDisplay) } : {}) };
    return { format: CONTENT_PRESET_FORMAT, formatVersion: record.formatVersion, apiVersion: record.apiVersion, manifest, files: Object.fromEntries(Object.entries(sortedObject(record.files)).map(([path, file]) => [path, exportFile(file)])) };
}
export function serializeContentPreset(record) { return `${JSON.stringify(exportContentPreset(record), null, 2)}\n`; }
export function readbackContentPreset(record) { const serialized = serializeContentPreset(record); const restored = importContentPreset(serialized); if (restored.id !== record.id || restored.items.length !== record.items.length || (restored.displays?.length || 0) !== (record.displays?.length || 0)) throw new Error('玉子美化预设回读不一致'); return Object.freeze({ serialized, record: restored }); }
