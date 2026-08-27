import { normalizeReplacementRule } from './rules.js';

export const TABLE_CONTENT_REPLACEMENT_DEFAULTS = Object.freeze({
    global: Object.freeze({
        enabled: false,
        rules: Object.freeze([]),
    }),
    tableRules: Object.freeze([]),
});

function cloneDefaults() {
    return {
        global: {
            enabled: false,
            rules: [],
        },
        tableRules: [],
    };
}

function normalizeId(value, fallback) {
    const id = String(value ?? '').trim();
    return id || fallback;
}

function normalizeRuleList(value) {
    if (!Array.isArray(value)) return [];
    return value.map((rule, index) => ({
        ...normalizeReplacementRule(rule),
        id: normalizeId(rule?.id, `rule_${index + 1}`),
    }));
}

function normalizeTableRuleArea(area, index) {
    const source = area && typeof area === 'object' && !Array.isArray(area) ? area : {};
    const mappingId = normalizeId(source.mappingId || source.id, `mapping_${index + 1}`);
    return {
        mappingId,
        sheetKey: String(source.sheetKey ?? '').trim(),
        tableNameSnapshot: String(source.tableNameSnapshot ?? source.tableName ?? '').trim(),
        enabled: Boolean(source.enabled),
        rules: normalizeRuleList(source.rules),
    };
}

function normalizeTableRuleList(value) {
    if (!Array.isArray(value)) return [];
    const seenMappingIds = new Set();
    const seenSheetKeys = new Set();
    const normalized = [];
    value.forEach((area, index) => {
        const next = normalizeTableRuleArea(area, index);
        const mappingId = next.mappingId;
        const sheetKey = next.sheetKey;
        if (seenMappingIds.has(mappingId) || (sheetKey && seenSheetKeys.has(sheetKey))) return;
        seenMappingIds.add(mappingId);
        if (sheetKey) seenSheetKeys.add(sheetKey);
        normalized.push(next);
    });
    return normalized;
}

export function normalizeTableContentReplacementSettings(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return cloneDefaults();
    }

    const global = value.global && typeof value.global === 'object' && !Array.isArray(value.global)
        ? value.global
        : {};

    return {
        global: {
            enabled: Boolean(global.enabled),
            rules: normalizeRuleList(global.rules),
        },
        tableRules: normalizeTableRuleList(value.tableRules),
    };
}

export function cloneTableContentReplacementSettings(value) {
    return normalizeTableContentReplacementSettings(value);
}
