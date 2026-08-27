import {
    getPhoneSettings as getStoredPhoneSettings,
    savePhoneSetting as persistPhoneSetting,
} from '../../settings.js';
import { getSheetKeys, getTableDataAsync } from '../../phone-core/data-api.js';
import { normalizeTableContentReplacementSettings } from '../../table-content-replacement/config.js';
import { validateReplacementRules } from '../../table-content-replacement/rules.js';

const RULE_ERROR_MESSAGES = Object.freeze({
    source_empty: '原词不能为空；如果需要匹配空白，请至少输入一个空格或换行。',
    source_target_equal: '原词与替换词不能完全相同。',
    target_contains_source: '替换词不能包含原词，避免同一轮替换不断膨胀。',
    duplicate_source: '同一区域内不能重复使用相同原词。',
});

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asText(value) {
    return String(value ?? '');
}

function normalizeId(value) {
    return asText(value).trim();
}

function clone(value) {
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return value;
    }
}

function buildTableViewModel(rawData, sheetKey, orderIndex) {
    const sheet = isPlainObject(rawData?.[sheetKey]) ? rawData[sheetKey] : {};
    const content = Array.isArray(sheet.content) ? sheet.content : [];
    const hasHeaderRow = Array.isArray(content[0]);
    const headers = hasHeaderRow ? content[0].map(value => asText(value)) : [];
    return {
        sheetKey,
        tableName: asText(sheet.name).trim() || sheetKey,
        orderIndex,
        status: hasHeaderRow ? 'available' : 'missing_header_row',
        headers,
        rowCount: hasHeaderRow ? Math.max(0, content.length - 1) : 0,
    };
}

function buildTables(rawData) {
    let sheetKeys = [];
    try {
        sheetKeys = getSheetKeys(rawData);
    } catch {
        sheetKeys = [];
    }
    return sheetKeys.map((sheetKey, orderIndex) => buildTableViewModel(rawData, sheetKey, orderIndex));
}

function buildResolvedTableRules(config, tables) {
    const tableBySheetKey = new Map(tables.map(table => [normalizeId(table.sheetKey), table]));
    return config.tableRules.map((area) => {
        const table = tableBySheetKey.get(normalizeId(area.sheetKey)) || null;
        return {
            ...area,
            tableName: table?.tableName || area.tableNameSnapshot || area.sheetKey,
            status: table?.status || 'missing',
            headers: Array.isArray(table?.headers) ? [...table.headers] : [],
            rowCount: Number.isFinite(Number(table?.rowCount)) ? Number(table.rowCount) : 0,
        };
    });
}

function readConfig(getPhoneSettings, override) {
    if (isPlainObject(override)) return normalizeTableContentReplacementSettings(override);
    const settings = typeof getPhoneSettings === 'function' ? getPhoneSettings() : null;
    return normalizeTableContentReplacementSettings(settings?.tableContentReplacement);
}

function toRuleErrors(errors = []) {
    return (Array.isArray(errors) ? errors : []).map(error => ({
        ...error,
        message: RULE_ERROR_MESSAGES[error?.code] || '规则内容无效。',
    }));
}

function mergeSelectedArea(currentConfig, draftConfig, kind, mappingId) {
    const nextConfig = normalizeTableContentReplacementSettings(currentConfig);
    const normalizedDraft = normalizeTableContentReplacementSettings(draftConfig);
    if (kind === 'global') {
        nextConfig.global = clone(normalizedDraft.global);
        return nextConfig;
    }

    const safeMappingId = normalizeId(mappingId);
    const draftArea = normalizedDraft.tableRules.find(area => normalizeId(area.mappingId) === safeMappingId);
    if (!draftArea) return null;
    const index = nextConfig.tableRules.findIndex(area => normalizeId(area.mappingId) === safeMappingId);
    if (index < 0) {
        nextConfig.tableRules.push(clone(draftArea));
        return nextConfig;
    }
    nextConfig.tableRules[index] = clone(draftArea);
    return nextConfig;
}

function buildFailure(code, errors = []) {
    return {
        ok: false,
        code,
        errors: toRuleErrors(errors),
        changedCellCount: 0,
        tableCount: 0,
    };
}

export function createTableContentReplacementSettingsService(options = {}) {
    const getPhoneSettings = typeof options.getPhoneSettings === 'function'
        ? options.getPhoneSettings
        : getStoredPhoneSettings;
    const savePhoneSetting = typeof options.savePhoneSetting === 'function'
        ? options.savePhoneSetting
        : persistPhoneSetting;
    const tableReader = typeof options.tableReader === 'function'
        ? options.tableReader
        : getTableDataAsync;
    const replacementService = options.replacementService && typeof options.replacementService === 'object'
        ? options.replacementService
        : {};

    async function loadViewModel(input = {}) {
        const config = readConfig(getPhoneSettings, input?.config);
        let rawData;
        try {
            rawData = await tableReader();
        } catch (error) {
            return {
                status: 'error',
                error,
                config: clone(config),
                tables: [],
                tableRules: buildResolvedTableRules(config, []),
                errors: {},
            };
        }

        if (!isPlainObject(rawData)) {
            return {
                status: 'error',
                error: { code: 'table_data_unavailable', message: '当前无法读取表格目录。' },
                config: clone(config),
                tables: [],
                tableRules: buildResolvedTableRules(config, []),
                errors: {},
            };
        }

        const tables = buildTables(rawData);
        const resolvedTableRules = buildResolvedTableRules(config, tables);
        const viewConfig = normalizeTableContentReplacementSettings(config);
        viewConfig.tableRules = viewConfig.tableRules.map((area) => {
            const resolved = resolvedTableRules.find(
                item => normalizeId(item.mappingId) === normalizeId(area.mappingId),
            );
            if (resolved?.status !== 'available' || !normalizeId(resolved.tableName)) return area;
            return {
                ...area,
                tableNameSnapshot: resolved.tableName,
            };
        });
        return {
            status: 'ready',
            error: null,
            config: clone(viewConfig),
            tables,
            tableRules: buildResolvedTableRules(viewConfig, tables),
            errors: {},
        };
    }

    async function saveArea({ kind = 'global', mappingId = '', config } = {}) {
        const normalizedKind = kind === 'table' ? 'table' : 'global';
        const currentConfig = readConfig(getPhoneSettings);
        const draftConfig = normalizeTableContentReplacementSettings(config);
        const selectedArea = normalizedKind === 'global'
            ? draftConfig.global
            : draftConfig.tableRules.find(area => normalizeId(area.mappingId) === normalizeId(mappingId));
        const selectedRules = selectedArea?.rules;

        if (normalizedKind === 'table' && !selectedRules) {
            return buildFailure('mapping_missing');
        }

        const validationErrors = validateReplacementRules(selectedRules || []);
        if (validationErrors.length > 0) {
            return buildFailure('validation_failed', validationErrors);
        }

        const nextConfig = mergeSelectedArea(currentConfig, draftConfig, normalizedKind, mappingId);
        if (!nextConfig) return buildFailure('mapping_missing');

        let persisted;
        try {
            persisted = await savePhoneSetting('tableContentReplacement', nextConfig);
        } catch {
            return buildFailure('settings_save_failed');
        }
        if (persisted === false) return buildFailure('settings_save_failed');

        let applied = { ok: true, changedCellCount: 0, tableCount: 0 };
        const shouldApply = selectedArea?.enabled === true && Array.isArray(selectedRules) && selectedRules.length > 0;
        if (shouldApply && typeof replacementService.applyArea === 'function') {
            try {
                applied = await replacementService.applyArea(
                    normalizedKind === 'global'
                        ? { kind: 'global' }
                        : { kind: 'table', mappingId: normalizeId(mappingId) },
                );
            } catch {
                applied = { ok: false, code: 'apply_failed', changedCellCount: 0, tableCount: 0 };
            }
        }

        return {
            ...applied,
            ok: applied?.ok !== false,
            config: clone(nextConfig),
            errors: applied?.ok === false ? [{ code: applied.code || 'apply_failed', message: '应用替换失败。' }] : [],
        };
    }

    async function deleteArea({ mappingId = '' } = {}) {
        const safeMappingId = normalizeId(mappingId);
        if (!safeMappingId) return buildFailure('mapping_missing');
        const currentConfig = readConfig(getPhoneSettings);
        const nextConfig = normalizeTableContentReplacementSettings(currentConfig);
        if (!nextConfig.tableRules.some(area => normalizeId(area.mappingId) === safeMappingId)) {
            return { ok: true, config: clone(nextConfig), changedCellCount: 0, tableCount: 0 };
        }
        nextConfig.tableRules = nextConfig.tableRules.filter(
            area => normalizeId(area.mappingId) !== safeMappingId,
        );
        try {
            const persisted = await savePhoneSetting('tableContentReplacement', nextConfig);
            if (persisted === false) return buildFailure('settings_save_failed');
            return { ok: true, config: clone(nextConfig), changedCellCount: 0, tableCount: 0 };
        } catch {
            return buildFailure('settings_save_failed');
        }
    }

    return Object.freeze({
        loadViewModel,
        saveArea,
        deleteArea,
        readConfig: () => readConfig(getPhoneSettings),
    });
}
