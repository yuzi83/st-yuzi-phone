import { escapeHtml, escapeHtmlAttr } from '../../utils.js';
import {
    buildDatabasePageHtml,
    buildDatabaseTableChecklistHtml,
} from '../layout/frame.js';
import { bindDatabasePageInteractions } from '../services/database-page-controller.js';

export function renderDatabasePage(ctx) {
    const {
        container,
        state,
        render,
        getTableData,
        getSheetKeys,
        getDbConfigApiAvailability,
        readDbSnapshot,
        getDbPresets,
        getActiveDbPresetName,
        switchPresetByName,
        showToast,
        rerenderDatabaseKeepScroll,
        clearActivePresetBindingIfNeeded,
        normalizeDbManualSelection,
        normalizeDbUpdateConfig,
        createDbPreset,
        saveDbPresets,
        setActiveDbPresetName,
        writeDbUpdateConfigViaApi,
        writeManualTableSelectionViaApi,
        clearManualTableSelectionViaApi,
    } = ctx;

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
        : new Set(tableEntries.map(it => it.key));

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

    container.innerHTML = buildDatabasePageHtml({
        apiAvailability,
        activePresetName,
        presetOptions,
        updateConfig,
        disabledAttr,
        manualSelectionMeta,
        tableChecklistHtml,
    });

    bindDatabasePageInteractions({
        container,
        state,
        render,
        getActiveDbPresetName,
        switchPresetByName,
        showToast,
        rerenderDatabaseKeepScroll,
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
