import {
    getPhoneSettings as getStoredPhoneSettings,
    savePhoneSetting as persistPhoneSetting,
} from '../../settings.js';
import { getTableDataAsync } from '../../phone-core/data-api.js';
import { buildTableNavigationCatalog } from '../../table-navigation/catalog.js';
import {
    FULLSCREEN_OVERLAY_DEFAULTS,
    FULLSCREEN_OVERLAY_SETTING_KEY,
    SCROLLING_BARRAGE_MODEL_ID,
    normalizeFullscreenOverlaySettings,
} from '../../fullscreen-overlay/settings.js';
import { buildOverlaySourceCatalog } from '../../fullscreen-overlay/source-catalog.js';
import { createOverlaySourceRegistry } from '../../fullscreen-overlay/source-registry.js';
import { createLiveTableSourceAdapter } from '../../fullscreen-overlay/sources/live-table.js';

export {
    FULLSCREEN_OVERLAY_DEFAULTS,
    FULLSCREEN_OVERLAY_SETTING_KEY,
    SCROLLING_BARRAGE_MODEL_ID,
    normalizeFullscreenOverlaySettings,
};

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function asId(value) {
    return String(value ?? '').trim();
}

function clone(value) {
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return value;
    }
}

function uniqueIds(value) {
    const seen = new Set();
    return asArray(value)
        .map(asId)
        .filter((id) => {
            if (!id || seen.has(id)) return false;
            seen.add(id);
            return true;
        });
}

function mergeOrder(requestedOrder, physicalOrder) {
    const allowed = new Set(uniqueIds(physicalOrder));
    const merged = uniqueIds(requestedOrder).filter(sheetKey => allowed.has(sheetKey));
    allowed.forEach((sheetKey) => {
        if (!merged.includes(sheetKey)) merged.push(sheetKey);
    });
    return merged;
}

function getSourceCatalogBuilder(sourceCatalog) {
    if (typeof sourceCatalog === 'function') return sourceCatalog;
    if (!sourceCatalog || typeof sourceCatalog !== 'object') return null;
    return [
        sourceCatalog.buildOverlaySourceCatalog,
        sourceCatalog.buildSourceCatalog,
        sourceCatalog.buildCatalog,
        sourceCatalog.listSources,
    ].find(candidate => typeof candidate === 'function') || null;
}

function mergeCatalogWithNavigation(navigationCatalog, sourceEntries) {
    const sourceBySheetKey = new Map(
        asArray(sourceEntries)
            .map(entry => [asId(entry?.sheetKey), entry])
            .filter(([sheetKey]) => !!sheetKey),
    );
    return navigationCatalog.map((navigationEntry) => ({
        ...navigationEntry,
        ...(sourceBySheetKey.get(navigationEntry.sheetKey) || {}),
        sheetKey: navigationEntry.sheetKey,
        tableName: navigationEntry.tableName,
        orderIndex: navigationEntry.orderIndex,
    }));
}

async function resolveSourceCatalog({
    sourceCatalog,
    rawData,
    config,
    navigationCatalog,
    registry,
}) {
    const builder = getSourceCatalogBuilder(sourceCatalog);
    if (!builder) {
        return mergeCatalogWithNavigation(
            navigationCatalog,
            buildOverlaySourceCatalog(rawData, config, registry),
        );
    }
    try {
        const result = await builder.call(sourceCatalog, rawData, navigationCatalog, {
            settings: config,
            registry,
        });
        if (Array.isArray(result)) return mergeCatalogWithNavigation(navigationCatalog, result);
        if (Array.isArray(result?.sources)) {
            return mergeCatalogWithNavigation(navigationCatalog, result.sources);
        }
        if (Array.isArray(result?.tables)) {
            return mergeCatalogWithNavigation(navigationCatalog, result.tables);
        }
    } catch {
        // 自定义 source catalog 失败时退回项目共享实现，页面仍可安全读取目录。
    }
    return mergeCatalogWithNavigation(
        navigationCatalog,
        buildOverlaySourceCatalog(rawData, config, registry),
    );
}

function resolveAvailability(entry) {
    const status = asId(entry?.status).toLowerCase();
    if (entry?.supported === true || status === 'available' || status === 'ready') {
        return 'available';
    }
    if (
        status === 'format_mismatch'
        || status === 'invalid_format'
        || status === 'missing_fields'
        || asId(entry?.tableName) === '直播表'
    ) {
        return 'format_mismatch';
    }
    return 'unsupported';
}

function buildStatusLabel(entry, availability) {
    const customLabel = asId(entry?.statusLabel || entry?.label);
    if (customLabel) return customLabel;
    if (availability === 'available') return '横向滚动弹幕';
    if (availability === 'format_mismatch') return '格式不匹配';
    return '暂未适配';
}

function buildTableViewModels(sourceCatalog, normalizedConfig) {
    const sourceEnabledBySheetKey = normalizedConfig.sourceEnabledBySheetKey || {};
    return asArray(sourceCatalog).map((entry) => {
        const availability = resolveAvailability(entry);
        const sheetKey = asId(entry?.sheetKey);
        const defaultEnabled = availability === 'available' && entry?.enabled === true;
        const explicitEnabled = sourceEnabledBySheetKey[sheetKey];
        return {
            ...entry,
            sheetKey,
            tableName: asId(entry?.tableName) || sheetKey || '未命名表格',
            availability,
            enabled: availability === 'available' && (
                typeof explicitEnabled === 'boolean' ? explicitEnabled : defaultEnabled
            ),
            statusLabel: buildStatusLabel(entry, availability),
        };
    });
}

function readStoredConfig(getPhoneSettings) {
    const settings = typeof getPhoneSettings === 'function' ? getPhoneSettings() : null;
    return normalizeFullscreenOverlaySettings(settings?.[FULLSCREEN_OVERLAY_SETTING_KEY]);
}

function reconcileConfigWithCatalog(config, tables, physicalOrder) {
    const normalized = normalizeFullscreenOverlaySettings(config);
    const tableBySheetKey = new Map(tables.map(table => [table.sheetKey, table]));
    const sourceEnabledBySheetKey = {};
    const sourceModelBySheetKey = {};

    tables.forEach((table) => {
        const explicitlyEnabled = normalized.sourceEnabledBySheetKey[table.sheetKey];
        sourceEnabledBySheetKey[table.sheetKey] = table.availability === 'available'
            && (typeof explicitlyEnabled === 'boolean' ? explicitlyEnabled : table.enabled === true);
        if (table.availability === 'available') {
            sourceModelBySheetKey[table.sheetKey] = asId(
                normalized.sourceModelBySheetKey[table.sheetKey]
                || table.modelId
                || SCROLLING_BARRAGE_MODEL_ID,
            ) || SCROLLING_BARRAGE_MODEL_ID;
        }
    });

    Object.keys(normalized.sourceEnabledBySheetKey).forEach((sheetKey) => {
        if (tableBySheetKey.has(sheetKey)) return;
        delete sourceEnabledBySheetKey[sheetKey];
    });

    return normalizeFullscreenOverlaySettings({
        ...normalized,
        sourceEnabledBySheetKey,
        sourceOrder: mergeOrder(normalized.sourceOrder, physicalOrder),
        sourceModelBySheetKey,
    });
}

function buildErrorViewModel(config, error) {
    return {
        status: 'error',
        error: {
            code: asId(error?.code) || 'table_data_unavailable',
            message: asId(error?.message) || '当前无法读取表格目录。',
        },
        config: clone(config),
        tables: [],
        eyeDropperSupported: typeof globalThis?.EyeDropper === 'function',
    };
}

function findAction(actions, names) {
    return names.map(name => actions?.[name]).find(candidate => typeof candidate === 'function') || null;
}

export function createFullscreenOverlaySettingsService(options = {}) {
    const getPhoneSettings = typeof options.getPhoneSettings === 'function'
        ? options.getPhoneSettings
        : getStoredPhoneSettings;
    const savePhoneSetting = typeof options.savePhoneSetting === 'function'
        ? options.savePhoneSetting
        : persistPhoneSetting;
    const tableReader = typeof options.tableReader === 'function'
        ? options.tableReader
        : getTableDataAsync;
    const registry = options.sourceRegistry || createOverlaySourceRegistry([
        createLiveTableSourceAdapter(),
    ]);
    const sourceCatalog = options.sourceCatalog || null;
    const overlayActions = isPlainObject(options.overlayActions)
        ? options.overlayActions
        : (isPlainObject(options.runtimeActions) ? options.runtimeActions : {});
    let lastTables = [];
    let lastPhysicalOrder = [];
    let runtimeModulePromise = null;

    const loadRuntimeModule = async () => {
        if (!runtimeModulePromise) {
            runtimeModulePromise = import('../../fullscreen-overlay/index.js').catch(() => null);
        }
        return runtimeModulePromise;
    };

    const resolveRuntimeAction = async (injectedNames, moduleNames) => {
        const injected = findAction(overlayActions, injectedNames);
        if (injected) return { action: injected, owner: overlayActions };
        const runtimeModule = await loadRuntimeModule();
        const publicSeam = runtimeModule?.fullscreenOverlayActions;
        const seamAction = findAction(publicSeam, injectedNames);
        if (seamAction) return { action: seamAction, owner: publicSeam };
        const fallback = findAction(runtimeModule, moduleNames);
        return fallback ? { action: fallback, owner: runtimeModule } : null;
    };

    async function loadViewModel() {
        const storedConfig = readStoredConfig(getPhoneSettings);
        let rawData;
        try {
            rawData = await tableReader();
        } catch (error) {
            return buildErrorViewModel(storedConfig, error);
        }
        if (!isPlainObject(rawData)) return buildErrorViewModel(storedConfig, null);

        const navigationCatalog = buildTableNavigationCatalog(rawData);
        const physicalOrder = navigationCatalog.map(table => table.sheetKey);
        const catalog = await resolveSourceCatalog({
            sourceCatalog,
            rawData,
            config: storedConfig,
            navigationCatalog,
            registry,
        });
        const tables = buildTableViewModels(catalog, storedConfig);
        const config = reconcileConfigWithCatalog(storedConfig, tables, physicalOrder);
        const reconciledTables = buildTableViewModels(tables, config)
            .sort((left, right) => (
                config.sourceOrder.indexOf(left.sheetKey)
                - config.sourceOrder.indexOf(right.sheetKey)
            ));

        lastTables = reconciledTables;
        lastPhysicalOrder = physicalOrder;
        return {
            status: 'ready',
            error: null,
            config: clone(config),
            tables: clone(reconciledTables),
            eyeDropperSupported: typeof globalThis?.EyeDropper === 'function',
        };
    }

    function normalizeAgainstCurrentCatalog(config) {
        return reconcileConfigWithCatalog(config, lastTables, lastPhysicalOrder);
    }

    async function saveConfig(config) {
        const normalized = normalizeAgainstCurrentCatalog(config);
        try {
            const persisted = await savePhoneSetting(FULLSCREEN_OVERLAY_SETTING_KEY, normalized);
            if (persisted === false) {
                return { ok: false, code: 'settings_save_failed', config: clone(normalized) };
            }
            const refresh = await resolveRuntimeAction(
                ['refreshSettings', 'refreshFullscreenOverlaySettings'],
                ['refreshFullscreenOverlaySettings'],
            );
            try {
                await refresh?.action?.call(refresh.owner, normalized);
            } catch {
                // 设置已经可靠保存；运行时刷新失败不得回滚用户配置。
            }
            lastTables = buildTableViewModels(lastTables, normalized)
                .sort((left, right) => (
                    normalized.sourceOrder.indexOf(left.sheetKey)
                    - normalized.sourceOrder.indexOf(right.sheetKey)
                ));
            return { ok: true, code: '', config: clone(normalized), tables: clone(lastTables) };
        } catch {
            return { ok: false, code: 'settings_save_failed', config: clone(normalized) };
        }
    }

    async function testSelectedSources(config) {
        const normalized = normalizeAgainstCurrentCatalog(config);
        const sourceSheetKeys = normalized.sourceOrder.filter(
            sheetKey => normalized.sourceEnabledBySheetKey[sheetKey] === true,
        );
        if (sourceSheetKeys.length === 0) {
            return { ok: false, code: 'no_enabled_sources', config: clone(normalized) };
        }
        const runtimeAction = await resolveRuntimeAction(
            ['testSources', 'testSelectedSources', 'test'],
            ['testFullscreenOverlaySelectedSources'],
        );
        if (!runtimeAction) {
            return { ok: false, code: 'runtime_unavailable', config: clone(normalized) };
        }
        try {
            const result = await runtimeAction.action.call(runtimeAction.owner, {
                sourceSheetKeys,
                config: clone(normalized),
                settings: clone(normalized),
            });
            return {
                ok: result?.ok !== false,
                code: asId(result?.code),
                config: clone(normalized),
            };
        } catch {
            return { ok: false, code: 'test_failed', config: clone(normalized) };
        }
    }

    async function clearOverlay() {
        const runtimeAction = await resolveRuntimeAction(
            ['clear', 'clearOverlay'],
            ['clearFullscreenOverlay'],
        );
        if (!runtimeAction) return { ok: false, code: 'runtime_unavailable' };
        try {
            const result = await runtimeAction.action.call(runtimeAction.owner);
            return { ok: result?.ok !== false, code: asId(result?.code) };
        } catch {
            return { ok: false, code: 'clear_failed' };
        }
    }

    return Object.freeze({
        loadViewModel,
        saveConfig,
        testSelectedSources,
        clearOverlay,
        readConfig: () => normalizeAgainstCurrentCatalog(readStoredConfig(getPhoneSettings)),
    });
}
