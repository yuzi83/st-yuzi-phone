import { buildTableNavigationCatalog } from '../table-navigation/catalog.js';

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
        sheet,
        headers: Array.isArray(content[0]) ? content[0] : [],
        rows: content.slice(1),
    });
}

export function buildOverlaySourceCatalog(rawData, settings = {}, registry = null) {
    const physicalCatalog = buildTableNavigationCatalog(rawData);
    const orderedCatalog = mergeSourceOrder(physicalCatalog, settings?.sourceOrder);
    const sourceEnabledBySheetKey = isRecord(settings?.sourceEnabledBySheetKey)
        ? settings.sourceEnabledBySheetKey
        : {};
    const sourceModelBySheetKey = isRecord(settings?.sourceModelBySheetKey)
        ? settings.sourceModelBySheetKey
        : {};

    return Object.freeze(orderedCatalog.map((entry, sourceOrderIndex) => {
        const context = buildSourceContext(rawData, entry);
        const adapter = registry?.match?.(context) || null;
        const supported = Boolean(adapter);
        const explicitEnabled = sourceEnabledBySheetKey[entry.sheetKey];
        const enabled = supported && (typeof explicitEnabled === 'boolean'
            ? explicitEnabled
            : adapter.defaultEnabled === true);
        const defaultModelId = normalizeModelId(adapter?.modelId);
        const modelIds = supported
            ? normalizeStringList([...(adapter?.modelIds || []), defaultModelId])
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
            supported,
            disabled: !supported,
            enabled,
        });
    }));
}
