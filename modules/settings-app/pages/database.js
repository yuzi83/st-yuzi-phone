import { escapeHtml, escapeHtmlAttr } from '../../utils/dom-escape.js';
import {
    buildDatabasePageHtml,
    buildDatabaseTableChecklistHtml,
} from '../layout/frame.js';
import { bindDatabasePageInteractions } from '../services/database-page-controller.js';
import {
    createPageShellSnapshot,
    ensurePageShell,
    normalizePageShellRefreshPlan,
    patchPageShell,
} from '../ui/page-shell.js';

const DATABASE_PAGE_ROOT_SELECTOR = '.phone-settings-page';
const DATABASE_SHELL_REGION_SELECTORS = Object.freeze({
    hero: '[data-shell-region="database-hero"]',
    apiStatus: '[data-shell-region="database-api-status"]',
    preset: '[data-shell-region="database-preset-section"]',
    updateConfig: '[data-shell-region="database-update-config-section"]',
    manualSelection: '[data-shell-region="database-manual-selection-section"]',
});

function buildDatabasePagePayload(databaseConfigService) {
    const getTableData = databaseConfigService.getTableData;
    const getSheetKeys = databaseConfigService.getSheetKeys;
    const getDbConfigApiAvailability = databaseConfigService.getDbConfigApiAvailability;
    const readDbSnapshot = databaseConfigService.readDbSnapshot;
    const getDbPresets = databaseConfigService.getDbPresets;
    const getActiveDbPresetName = databaseConfigService.getActiveDbPresetName;
    const normalizeDbManualSelection = databaseConfigService.normalizeDbManualSelection;
    const normalizeDbUpdateConfig = databaseConfigService.normalizeDbUpdateConfig;

    const apiAvailability = getDbConfigApiAvailability();
    const dbState = readDbSnapshot();
    const snapshot = dbState.snapshot;

    const rawData = getTableData();
    const sheetKeys = getSheetKeys(rawData);
    const tableEntries = sheetKeys.map((sheetKey) => ({
        key: sheetKey,
        name: String(rawData?.[sheetKey]?.name || sheetKey),
    }));

    const manualSelection = normalizeDbManualSelection(snapshot.manualSelection);
    const selectedSet = manualSelection.hasManualSelection
        ? new Set(manualSelection.selectedTables)
        : new Set(tableEntries.map((item) => item.key));

    const presets = getDbPresets();
    const activePresetName = getActiveDbPresetName();
    const presetOptions = [
        `<option value="" ${!activePresetName ? 'selected' : ''}>当前配置（未绑定预设）</option>`,
        ...presets.map((preset) => (
            `<option value="${escapeHtmlAttr(preset.name)}" ${preset.name === activePresetName ? 'selected' : ''}>${escapeHtml(preset.name)}</option>`
        )),
    ].join('');

    const tableChecklistHtml = buildDatabaseTableChecklistHtml(tableEntries, selectedSet, apiAvailability);
    const manualSelectionMeta = tableEntries.length === 0
        ? '当前没有可选表格'
        : (!manualSelection.hasManualSelection
            ? `当前模式：默认全选（${tableEntries.length} 项）`
            : `当前手动选择 ${manualSelection.selectedTables.length} / ${tableEntries.length} 项`);

    const updateConfig = normalizeDbUpdateConfig(snapshot.updateConfig);
    const disabledAttr = apiAvailability.ok ? '' : 'disabled';

    return {
        apiAvailability,
        activePresetName,
        presetOptions,
        updateConfig,
        disabledAttr,
        manualSelectionMeta,
        tableChecklistHtml,
    };
}

function createDatabaseShellSnapshot(framePayload) {
    return createPageShellSnapshot({
        buildHtml: buildDatabasePageHtml,
        payload: framePayload,
        rootSelector: DATABASE_PAGE_ROOT_SELECTOR,
    });
}

function normalizeDatabaseRefreshPlan(refreshPlan) {
    return normalizePageShellRefreshPlan(refreshPlan, {
        hero: true,
        apiStatus: true,
        preset: true,
        updateConfig: true,
        manualSelection: true,
    });
}

export function createDatabasePage(ctx) {
    return {
        mount() {
            renderDatabasePage(ctx);
        },
        update() {
            renderDatabasePage(ctx);
        },
        dispose() {},
    };
}

export function renderDatabasePage(ctx, options = {}) {
    const {
        container,
        state,
        render,
        showToast,
        rerenderDatabaseKeepScroll,
        registerCleanup,
        pageRuntime,
        databaseConfigService,
    } = ctx;
    const getActiveDbPresetName = databaseConfigService.getActiveDbPresetName;
    const switchPresetByName = databaseConfigService.switchPresetByName;
    const getDbPresets = databaseConfigService.getDbPresets;
    const readDbSnapshot = databaseConfigService.readDbSnapshot;
    const createDbPreset = databaseConfigService.createDbPreset;
    const saveDbPresets = databaseConfigService.saveDbPresets;
    const setActiveDbPresetName = databaseConfigService.setActiveDbPresetName;
    const writeDbUpdateConfigViaApi = databaseConfigService.writeDbUpdateConfigViaApi;
    const writeManualTableSelectionViaApi = databaseConfigService.writeManualTableSelectionViaApi;
    const clearManualTableSelectionViaApi = databaseConfigService.clearManualTableSelectionViaApi;
    const clearActivePresetBindingIfNeeded = databaseConfigService.clearActivePresetBindingIfNeeded;

    const framePayload = buildDatabasePagePayload(databaseConfigService);
    const shellSnapshot = createDatabaseShellSnapshot(framePayload);
    const shellState = ensurePageShell(container, shellSnapshot, {
        rootSelector: DATABASE_PAGE_ROOT_SELECTOR,
        regionSelectors: DATABASE_SHELL_REGION_SELECTORS,
    });
    if (!shellState.didBootstrap && shellState.pageRoot instanceof HTMLElement) {
        patchPageShell(shellState.pageRoot, shellSnapshot, {
            regionSelectors: DATABASE_SHELL_REGION_SELECTORS,
            refreshPlan: normalizeDatabaseRefreshPlan(options?.refreshPlan),
        });
    }

    bindDatabasePageInteractions({
        container,
        state,
        render,
        showToast,
        rerenderDatabaseKeepScroll,
        registerCleanup,
        pageRuntime,
        databaseConfigService,
        refreshDatabasePage(refreshOptions = {}) {
            renderDatabasePage(ctx, refreshOptions);
        },
        getActiveDbPresetName,
        switchPresetByName,
        getDbPresets,
        readDbSnapshot,
        createDbPreset,
        saveDbPresets,
        setActiveDbPresetName,
        writeDbUpdateConfigViaApi,
        writeManualTableSelectionViaApi,
        clearManualTableSelectionViaApi,
        clearActivePresetBindingIfNeeded,
    });
}
