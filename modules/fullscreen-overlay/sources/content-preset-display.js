import { CONTENT_PRESET_DISPLAY_SOURCE_ID } from '../../content-presets/display-directory.js';

function text(value) {
    return String(value ?? '').trim();
}

function targetTables(context) {
    const display = context?.customDisplay;
    const rawData = context?.rawData || context?.snapshot || {};
    const sheetKeys = Array.isArray(display?.targetSheetKeys)
        ? display.targetSheetKeys.map(text).filter(Boolean)
        : [];
    if (!display || sheetKeys.length === 0) return [];
    return sheetKeys.map(sheetKey => {
        const sheet = rawData?.[sheetKey];
        const content = Array.isArray(sheet?.content) ? sheet.content : [];
        return Object.freeze({
            sheetKey,
            tableName: text(sheet?.name) || sheetKey,
            headers: Object.freeze([...(Array.isArray(content[0]) ? content[0] : [])]),
            rows: Object.freeze(content.slice(1).filter(Array.isArray).map(row => Object.freeze([...row]))),
        });
    });
}

export function createContentPresetDisplaySourceAdapter() {
    return Object.freeze({
        id: CONTENT_PRESET_DISPLAY_SOURCE_ID,
        modelId: CONTENT_PRESET_DISPLAY_SOURCE_ID,
        modelIds: Object.freeze([]),
        defaultEnabled: true,
        matches(context) {
            return text(context?.sourceId || context?.sourceKind) === CONTENT_PRESET_DISPLAY_SOURCE_ID
                && !!context?.customDisplay;
        },
        getSignature(context) {
            const display = context?.customDisplay;
            if (!display) return '';
            return JSON.stringify([
                text(display.modelId),
                targetTables(context).map(table => [
                    table.sheetKey,
                    table.tableName,
                    table.headers,
                    table.rows,
                ]),
            ]);
        },
        readEvents(context) {
            const display = context?.customDisplay;
            const tables = targetTables(context);
            if (!display || tables.length === 0) return Object.freeze([]);
            return Object.freeze([Object.freeze({
                sourceId: CONTENT_PRESET_DISPLAY_SOURCE_ID,
                customDisplay: display,
                tables,
            })]);
        },
    });
}
