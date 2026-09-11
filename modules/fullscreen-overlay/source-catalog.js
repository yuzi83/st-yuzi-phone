import { buildTableNavigationCatalog } from '../table-navigation/catalog.js';
import {
    QQ_FULLSCREEN_OVERLAY_SOURCE_ID,
    QQ_FULLSCREEN_OVERLAY_SOURCE_KEY,
} from './sources/qq.js';
import { buildActiveContentPresetDisplayDirectory } from '../content-presets/display-directory.js';
import { getContentPresetIndexSnapshot } from '../content-presets/index-state.js';

function normalizeText(value) {
    return String(value ?? '').trim();
}

function normalizeStringList(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value
        .map(normalizeText)
        .filter((item) => {
            if (!item || seen.has(item)) return false;
            seen.add(item);
            return true;
        });
}

function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeModelId(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function mergeSourceOrder(catalog, requestedOrder) {
    const entryBySheetKey = new Map(catalog.map(entry => [entry.sheetKey, entry]));
    const ordered = [];

    normalizeStringList(requestedOrder).forEach((sheetKey) => {
        const entry = entryBySheetKey.get(sheetKey);
        if (!entry) return;
        ordered.push(entry);
        entryBySheetKey.delete(sheetKey);
    });

    catalog.forEach((entry) => {
        if (!entryBySheetKey.has(entry.sheetKey)) return;
        ordered.push(entry);
        entryBySheetKey.delete(entry.sheetKey);
    });

    return ordered;
}

function buildSourceContext(rawData, entry) {
    const sheet = rawData?.[entry.sheetKey];
    const content = Array.isArray(sheet?.content) ? sheet.content : [];
    return Object.freeze({
        ...entry,
        rawData,
        sheet,
        headers: Array.isArray(content[0]) ? content[0] : [],
        rows: content.slice(1),
    });
}

function resolveDisplayDirectory(rawData, options) {
    if (options?.contentPresetDisplayDirectory) return options.contentPresetDisplayDirectory;
    const popupByTable = options?.popupByTable ?? getContentPresetIndexSnapshot().popupByTable;
    return buildActiveContentPresetDisplayDirectory(rawData, popupByTable);
}

export function buildOverlaySourceCatalog(rawData, settings = {}, registry = null, options = {}) {
    const physicalCatalog = buildTableNavigationCatalog(rawData);
    const displayDirectory = resolveDisplayDirectory(rawData, options);
    const virtualCatalog = registry?.get?.(QQ_FULLSCREEN_OVERLAY_SOURCE_ID)
        ? [{
            sheetKey: QQ_FULLSCREEN_OVERLAY_SOURCE_KEY,
            tableName: 'QQ',
            sourceKind: QQ_FULLSCREEN_OVERLAY_SOURCE_ID,
            orderIndex: physicalCatalog.length,
        }]
        : [];
    const contentPresetVirtualCatalog = Array.isArray(displayDirectory?.virtualSources)
        ? displayDirectory.virtualSources
        : [];
    const orderedCatalog = mergeSourceOrder(
        [...physicalCatalog, ...virtualCatalog, ...contentPresetVirtualCatalog],
        settings?.sourceOrder,
    );
    const sourceEnabledBySheetKey = isRecord(settings?.sourceEnabledBySheetKey)
        ? settings.sourceEnabledBySheetKey
        : {};
    const sourceModelBySheetKey = isRecord(settings?.sourceModelBySheetKey)
        ? settings.sourceModelBySheetKey
        : {};

    return Object.freeze(orderedCatalog.map((entry, sourceOrderIndex) => {
        const context = buildSourceContext(rawData, entry);
        const explicitSourceId = normalizeText(entry?.sourceId || entry?.sourceKind);
        const adapter = (explicitSourceId ? registry?.get?.(explicitSourceId) : null)
            || registry?.match?.(context)
            || null;
        const supported = Boolean(adapter);
        const explicitEnabled = sourceEnabledBySheetKey[entry.sheetKey];
        const enabled = supported && (typeof explicitEnabled === 'boolean'
            ? explicitEnabled
            : adapter.defaultEnabled === true);
        const displayModels = Array.isArray(displayDirectory?.singleBySheetKey?.get?.(entry.sheetKey))
            ? displayDirectory.singleBySheetKey.get(entry.sheetKey)
            : [];
        const modelLabels = Object.freeze(Object.fromEntries([
            ...displayModels,
            ...(entry?.customDisplay ? [entry.customDisplay] : []),
        ].map(display => [
            display?.modelId,
            normalizeText(display?.display?.name || display?.displayId),
        ]).filter(([modelId, label]) => modelId && label)));
        const defaultModelId = normalizeModelId(entry?.modelId || adapter?.modelId);
        const modelIds = supported
            ? normalizeStringList([
                ...(entry?.modelIds || []),
                ...(adapter?.modelIds || []),
                ...displayModels.map(display => display?.modelId),
                defaultModelId,
            ])
            : [];
        const requestedModelId = normalizeModelId(sourceModelBySheetKey[entry.sheetKey]);
        const modelId = modelIds.includes(requestedModelId)
            ? requestedModelId
            : defaultModelId;

        return Object.freeze({
            ...entry,
            sourceOrderIndex,
            sourceId: normalizeText(adapter?.id),
            modelId,
            modelIds: Object.freeze(modelIds),
            customDisplay: displayDirectory?.byModelId?.get?.(modelId)
                || entry?.customDisplay
                || null,
            modelLabels,
            supported,
            disabled: !supported,
            enabled,
        });
    }));
}
