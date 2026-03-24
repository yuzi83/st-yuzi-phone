import { clampNumber, escapeHtml, escapeHtmlAttr } from '../../utils.js';
import {
    buildDatabasePageHtml,
    buildDatabaseTableChecklistHtml,
} from '../layout/frame.js';

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

    container.querySelector('.phone-nav-back')?.addEventListener('click', () => {
        state.mode = 'home';
        render();
    });

    container.querySelector('#phone-db-refresh-btn')?.addEventListener('click', () => {
        rerenderDatabaseKeepScroll();
        showToast(container, '数据库配置已刷新');
    });

    const presetSelect = container.querySelector('#phone-db-preset-select');
    const presetNameInput = container.querySelector('#phone-db-preset-name');

    presetSelect?.addEventListener('change', () => {
        const previousActive = getActiveDbPresetName();
        const targetName = String(presetSelect.value || '');
        const ok = switchPresetByName(targetName, container);
        if (!ok) {
            presetSelect.value = previousActive;
            return;
        }
        rerenderDatabaseKeepScroll();
    });

    presetNameInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            container.querySelector('#phone-db-preset-save-btn')?.click();
        }
    });

    container.querySelector('#phone-db-preset-save-btn')?.addEventListener('click', () => {
        const name = String(presetNameInput?.value || '').trim();
        if (!name) {
            showToast(container, '请输入预设名称', true);
            return;
        }

        const presetsNow = getDbPresets();
        if (presetsNow.some(it => it.name === name)) {
            showToast(container, '同名预设已存在，请使用“覆盖同名预设”', true);
            return;
        }

        const current = readDbSnapshot();
        if (!current.ready) {
            showToast(container, current.apiAvailability?.message || '数据库接口不可用，无法保存预设', true);
            return;
        }

        const next = [...presetsNow, createDbPreset(name, current.snapshot)];
        saveDbPresets(next);
        setActiveDbPresetName(name);
        showToast(container, `预设“${name}”已创建并激活`);
        rerenderDatabaseKeepScroll();
    });

    container.querySelector('#phone-db-preset-overwrite-btn')?.addEventListener('click', () => {
        const typedName = String(presetNameInput?.value || '').trim();
        const selectedName = String(presetSelect?.value || '').trim();
        const targetName = typedName || selectedName;

        if (!targetName) {
            showToast(container, '请先输入或选择要覆盖的预设名', true);
            return;
        }

        const presetsNow = getDbPresets();
        const idx = presetsNow.findIndex(it => it.name === targetName);
        if (idx < 0) {
            showToast(container, `未找到预设：${targetName}`, true);
            return;
        }

        const confirmed = window.confirm(`确定覆盖预设“${targetName}”？`);
        if (!confirmed) return;

        const current = readDbSnapshot();
        if (!current.ready) {
            showToast(container, current.apiAvailability?.message || '数据库接口不可用，无法覆盖预设', true);
            return;
        }

        const nextPresets = [...presetsNow];
        nextPresets[idx] = createDbPreset(targetName, current.snapshot);
        saveDbPresets(nextPresets);
        setActiveDbPresetName(targetName);
        showToast(container, `预设“${targetName}”已覆盖`);
        rerenderDatabaseKeepScroll();
    });

    container.querySelector('#phone-db-preset-delete-btn')?.addEventListener('click', () => {
        const selectedName = String(presetSelect?.value || '').trim();
        if (!selectedName) {
            showToast(container, '当前未选择可删除的预设', true);
            return;
        }

        const confirmed = window.confirm(`确定删除预设“${selectedName}”？`);
        if (!confirmed) return;

        const presetsNow = getDbPresets();
        const filtered = presetsNow.filter(it => it.name !== selectedName);
        if (filtered.length === presetsNow.length) {
            showToast(container, `未找到预设：${selectedName}`, true);
            return;
        }

        saveDbPresets(filtered);
        if (getActiveDbPresetName() === selectedName) {
            setActiveDbPresetName('');
        }
        showToast(container, `预设“${selectedName}”已删除`);
        rerenderDatabaseKeepScroll();
    });

    container.querySelector('#phone-db-update-config-save-btn')?.addEventListener('click', () => {
        const payload = {
            autoUpdateThreshold: clampNumber(container.querySelector('#phone-db-auto-update-threshold')?.value, 0, 999999, 3),
            autoUpdateFrequency: clampNumber(container.querySelector('#phone-db-auto-update-frequency')?.value, 1, 999999, 1),
            updateBatchSize: clampNumber(container.querySelector('#phone-db-update-batch-size')?.value, 1, 999999, 2),
            autoUpdateTokenThreshold: clampNumber(container.querySelector('#phone-db-auto-update-token-threshold')?.value, 0, 99999999, 0),
        };

        const result = writeDbUpdateConfigViaApi(payload);
        if (!result.ok) {
            showToast(container, result.message || '更新配置保存失败', true);
            return;
        }

        const cleared = clearActivePresetBindingIfNeeded();
        showToast(container, cleared ? '更新配置已保存，已解除预设绑定' : '更新配置已保存');
        rerenderDatabaseKeepScroll();
    });

    container.querySelector('#phone-db-update-config-reload-btn')?.addEventListener('click', () => {
        rerenderDatabaseKeepScroll();
        showToast(container, '已重新读取数据库更新配置');
    });

    const checklist = container.querySelector('#phone-db-table-checklist');
    const getChecklistBoxes = () => Array.from(checklist?.querySelectorAll('.phone-db-table-item input[type="checkbox"]') || []);

    container.querySelector('#phone-db-manual-check-all-btn')?.addEventListener('click', () => {
        getChecklistBoxes().forEach(cb => { cb.checked = true; });
    });

    container.querySelector('#phone-db-manual-invert-btn')?.addEventListener('click', () => {
        getChecklistBoxes().forEach(cb => { cb.checked = !cb.checked; });
    });

    container.querySelector('#phone-db-manual-save-btn')?.addEventListener('click', () => {
        const rows = Array.from(checklist?.querySelectorAll('.phone-db-table-item') || []);
        const selectedKeys = rows
            .filter((row) => row.querySelector('input[type="checkbox"]')?.checked)
            .map((row) => String(row.getAttribute('data-sheet-key') || '').trim())
            .filter(Boolean);

        if (rows.length === 0) {
            showToast(container, '当前没有可保存的表格项', true);
            return;
        }

        const result = selectedKeys.length === rows.length
            ? clearManualTableSelectionViaApi()
            : writeManualTableSelectionViaApi(selectedKeys);

        if (!result.ok) {
            showToast(container, result.message || '手动更新表选择保存失败', true);
            return;
        }

        const cleared = clearActivePresetBindingIfNeeded();
        showToast(container, cleared ? '手动表选择已保存，已解除预设绑定' : '手动表选择已保存');
        rerenderDatabaseKeepScroll();
    });

    container.querySelector('#phone-db-manual-reset-btn')?.addEventListener('click', () => {
        const result = clearManualTableSelectionViaApi();
        if (!result.ok) {
            showToast(container, result.message || '恢复默认全选失败', true);
            return;
        }

        const cleared = clearActivePresetBindingIfNeeded();
        showToast(container, cleared ? '已恢复默认全选，已解除预设绑定' : '已恢复默认全选');
        rerenderDatabaseKeepScroll();
    });
}
