import { clampNumber } from '../../utils/object.js';
import { Logger } from '../../error-handler.js';

const logger = Logger.withScope({ scope: 'settings-app/services/database-page-controller', feature: 'settings-app' });

const DATABASE_INTERACTION_CLEANUP_KEY = '__stYuziPhoneDatabasePageCleanup';

export function bindDatabasePageInteractions(ctx = {}) {
    const {
        container,
        state,
        render,
        showToast,
        rerenderDatabaseKeepScroll,
        registerCleanup,
        pageRuntime,
        databaseConfigService,
        refreshDatabasePage,
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

    if (!(container instanceof HTMLElement) || !state) return () => {};
    if (typeof render !== 'function' || typeof showToast !== 'function') return () => {};

    const runtime = pageRuntime && typeof pageRuntime === 'object' ? pageRuntime : null;
    const previousCleanup = container[DATABASE_INTERACTION_CLEANUP_KEY];
    if (typeof previousCleanup === 'function') {
        previousCleanup();
    }

    let didCleanup = false;
    const cleanupFns = [];
    const cleanupInteractions = () => {
        if (didCleanup) {
            return;
        }
        didCleanup = true;
        while (cleanupFns.length > 0) {
            const cleanup = cleanupFns.pop();
            try {
                cleanup?.();
            } catch (error) {
                logger.warn('database page cleanup 执行失败', error);
            }
        }
        if (container[DATABASE_INTERACTION_CLEANUP_KEY] === cleanupInteractions) {
            delete container[DATABASE_INTERACTION_CLEANUP_KEY];
        }
    };
    container[DATABASE_INTERACTION_CLEANUP_KEY] = cleanupInteractions;

    const bindEvent = (target, type, listener, options) => {
        if (runtime?.addEventListener) {
            const cleanup = runtime.addEventListener(target, type, listener, options);
            cleanupFns.push(typeof cleanup === 'function' ? cleanup : () => {});
            return cleanup;
        }
        if (!target || typeof target.addEventListener !== 'function' || typeof listener !== 'function') {
            return () => {};
        }
        target.addEventListener(type, listener, options);
        const cleanup = () => target.removeEventListener(type, listener, options);
        cleanupFns.push(cleanup);
        return cleanup;
    };
    const registerControllerCleanup = runtime?.registerCleanup
        ? runtime.registerCleanup.bind(runtime)
        : (typeof registerCleanup === 'function' ? registerCleanup : () => {});
    registerControllerCleanup(cleanupInteractions);

    const refreshPage = (refreshOptions = {}) => {
        if (typeof refreshDatabasePage === 'function') {
            refreshDatabasePage(refreshOptions);
            return;
        }
        if (typeof rerenderDatabaseKeepScroll === 'function') {
            rerenderDatabaseKeepScroll();
        }
    };

    const onBackClick = () => {
        state.mode = 'home';
        render();
    };
    bindEvent(container.querySelector('.phone-nav-back'), 'click', onBackClick);

    const onRefreshClick = () => {
        refreshPage({
            refreshPlan: {
                hero: true,
                apiStatus: true,
                preset: true,
                updateConfig: true,
                manualSelection: true,
            },
        });
        showToast(container, '数据库配置已刷新');
    };
    bindEvent(container.querySelector('#phone-db-refresh-btn'), 'click', onRefreshClick);

    const presetSelect = container.querySelector('#phone-db-preset-select');
    const presetNameInput = container.querySelector('#phone-db-preset-name');

    if (presetSelect instanceof HTMLSelectElement) {
        const onPresetChange = () => {
            const previousActive = getActiveDbPresetName();
            const targetName = String(presetSelect.value || '');
            const ok = switchPresetByName(targetName, container);
            if (!ok) {
                presetSelect.value = previousActive;
                return;
            }
            refreshPage({
                refreshPlan: {
                    hero: true,
                    apiStatus: false,
                    preset: true,
                    updateConfig: true,
                    manualSelection: true,
                },
            });
        };
        bindEvent(presetSelect, 'change', onPresetChange);
    }

    if (presetNameInput instanceof HTMLInputElement) {
        const onPresetNameKeydown = (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                container.querySelector('#phone-db-preset-save-btn')?.click();
            }
        };
        bindEvent(presetNameInput, 'keydown', onPresetNameKeydown);
    }

    const onPresetSaveClick = () => {
        const name = String(presetNameInput?.value || '').trim();
        if (!name) {
            showToast(container, '请输入预设名称', true);
            return;
        }

        const presetsNow = getDbPresets();
        if (presetsNow.some((item) => item.name === name)) {
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
        refreshPage({
            refreshPlan: {
                hero: true,
                apiStatus: false,
                preset: true,
                updateConfig: true,
                manualSelection: true,
            },
        });
    };
    bindEvent(container.querySelector('#phone-db-preset-save-btn'), 'click', onPresetSaveClick);

    const onPresetOverwriteClick = () => {
        const typedName = String(presetNameInput?.value || '').trim();
        const selectedName = String(presetSelect?.value || '').trim();
        const targetName = typedName || selectedName;

        if (!targetName) {
            showToast(container, '请先输入或选择要覆盖的预设名', true);
            return;
        }

        const presetsNow = getDbPresets();
        const index = presetsNow.findIndex((item) => item.name === targetName);
        if (index < 0) {
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
        nextPresets[index] = createDbPreset(targetName, current.snapshot);
        saveDbPresets(nextPresets);
        setActiveDbPresetName(targetName);
        showToast(container, `预设“${targetName}”已覆盖`);
        refreshPage({
            refreshPlan: {
                hero: true,
                apiStatus: false,
                preset: true,
                updateConfig: true,
                manualSelection: true,
            },
        });
    };
    bindEvent(container.querySelector('#phone-db-preset-overwrite-btn'), 'click', onPresetOverwriteClick);

    const onPresetDeleteClick = () => {
        const selectedName = String(presetSelect?.value || '').trim();
        if (!selectedName) {
            showToast(container, '当前未选择可删除的预设', true);
            return;
        }

        const confirmed = window.confirm(`确定删除预设“${selectedName}”？`);
        if (!confirmed) return;

        const presetsNow = getDbPresets();
        const filtered = presetsNow.filter((item) => item.name !== selectedName);
        if (filtered.length === presetsNow.length) {
            showToast(container, `未找到预设：${selectedName}`, true);
            return;
        }

        saveDbPresets(filtered);
        if (getActiveDbPresetName() === selectedName) {
            setActiveDbPresetName('');
        }
        showToast(container, `预设“${selectedName}”已删除`);
        refreshPage({
            refreshPlan: {
                hero: true,
                apiStatus: false,
                preset: true,
                updateConfig: true,
                manualSelection: true,
            },
        });
    };
    bindEvent(container.querySelector('#phone-db-preset-delete-btn'), 'click', onPresetDeleteClick);

    const onUpdateConfigSaveClick = () => {
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
        refreshPage({
            refreshPlan: {
                hero: true,
                apiStatus: false,
                preset: true,
                updateConfig: true,
                manualSelection: false,
            },
        });
    };
    bindEvent(container.querySelector('#phone-db-update-config-save-btn'), 'click', onUpdateConfigSaveClick);

    const onUpdateConfigReloadClick = () => {
        refreshPage({
            refreshPlan: {
                hero: false,
                apiStatus: true,
                preset: false,
                updateConfig: true,
                manualSelection: false,
            },
        });
        showToast(container, '已重新读取数据库更新配置');
    };
    bindEvent(container.querySelector('#phone-db-update-config-reload-btn'), 'click', onUpdateConfigReloadClick);

    const checklist = container.querySelector('#phone-db-table-checklist');
    const getChecklistBoxes = () => Array.from(checklist?.querySelectorAll('.phone-db-table-item input[type="checkbox"]') || []);

    const onManualCheckAllClick = () => {
        getChecklistBoxes().forEach((checkbox) => {
            checkbox.checked = true;
        });
    };
    bindEvent(container.querySelector('#phone-db-manual-check-all-btn'), 'click', onManualCheckAllClick);

    const onManualInvertClick = () => {
        getChecklistBoxes().forEach((checkbox) => {
            checkbox.checked = !checkbox.checked;
        });
    };
    bindEvent(container.querySelector('#phone-db-manual-invert-btn'), 'click', onManualInvertClick);

    const onManualSaveClick = () => {
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

        const readback = typeof readDbSnapshot === 'function' ? readDbSnapshot() : null;
        const readbackManualSelection = readback?.snapshot?.manualSelection;
        if (readback?.ready && readbackManualSelection) {
            const expectedHasManualSelection = selectedKeys.length !== rows.length;
            const expectedSelectedSet = new Set(expectedHasManualSelection ? selectedKeys : []);
            const actualSelectedTables = Array.isArray(readbackManualSelection.selectedTables)
                ? readbackManualSelection.selectedTables.map((key) => String(key || '').trim()).filter(Boolean)
                : [];
            const actualSelectedSet = new Set(actualSelectedTables);
            const selectionMatched = !!readbackManualSelection.hasManualSelection === expectedHasManualSelection
                && actualSelectedSet.size === expectedSelectedSet.size
                && Array.from(expectedSelectedSet).every((key) => actualSelectedSet.has(key));

            if (!selectionMatched) {
                showToast(container, '手动表选择已写入，但数据库接口读回结果不一致，请重新打开数据库页确认', true);
                return;
            }
        }

        const cleared = clearActivePresetBindingIfNeeded();
        showToast(container, cleared ? '手动表选择已保存，已解除预设绑定' : '手动表选择已保存');
        refreshPage({
            refreshPlan: {
                hero: true,
                apiStatus: false,
                preset: true,
                updateConfig: false,
                manualSelection: true,
            },
        });
    };
    bindEvent(container.querySelector('#phone-db-manual-save-btn'), 'click', onManualSaveClick);

    const onManualResetClick = () => {
        const result = clearManualTableSelectionViaApi();
        if (!result.ok) {
            showToast(container, result.message || '恢复默认全选失败', true);
            return;
        }

        const cleared = clearActivePresetBindingIfNeeded();
        showToast(container, cleared ? '已恢复默认全选，已解除预设绑定' : '已恢复默认全选');
        refreshPage({
            refreshPlan: {
                hero: true,
                apiStatus: false,
                preset: true,
                updateConfig: false,
                manualSelection: true,
            },
        });
    };
    bindEvent(container.querySelector('#phone-db-manual-reset-btn'), 'click', onManualResetClick);

    return cleanupInteractions;
}
