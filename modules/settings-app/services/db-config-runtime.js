import {
    isSameDbSnapshot,
    normalizeDbConfigSnapshot,
} from './db-presets.js';

export function createDbConfigRuntime(deps = {}) {
    const {
        getDbConfigApiAvailability,
        readDbUpdateConfigViaApi,
        writeDbUpdateConfigViaApi,
        readManualTableSelectionViaApi,
        writeManualTableSelectionViaApi,
        clearManualTableSelectionViaApi,
        getDbPresets,
        getActiveDbPresetName,
        setActiveDbPresetName,
        showToast,
    } = deps;

    const readDbSnapshot = () => {
        const apiAvailability = getDbConfigApiAvailability();
        const updateResult = readDbUpdateConfigViaApi();
        const manualResult = readManualTableSelectionViaApi();

        return {
            apiAvailability,
            updateResult,
            manualResult,
            ready: apiAvailability.ok && updateResult.ok && manualResult.ok,
            snapshot: normalizeDbConfigSnapshot({
                updateConfig: updateResult.data,
                manualSelection: manualResult.data,
            }),
        };
    };

    const rollbackDbSnapshot = (snapshot) => {
        const normalized = normalizeDbConfigSnapshot(snapshot);
        writeDbUpdateConfigViaApi(normalized.updateConfig);
        if (normalized.manualSelection.hasManualSelection) {
            writeManualTableSelectionViaApi(normalized.manualSelection.selectedTables);
        } else {
            clearManualTableSelectionViaApi();
        }
    };

    const applyDbSnapshot = (targetSnapshot, rollbackSnapshot = null) => {
        const normalized = normalizeDbConfigSnapshot(targetSnapshot);

        const updateWrite = writeDbUpdateConfigViaApi(normalized.updateConfig);
        if (!updateWrite.ok) {
            return {
                ok: false,
                message: updateWrite.message || '更新配置写入失败',
            };
        }

        const manualWrite = normalized.manualSelection.hasManualSelection
            ? writeManualTableSelectionViaApi(normalized.manualSelection.selectedTables)
            : clearManualTableSelectionViaApi();

        if (!manualWrite.ok) {
            if (rollbackSnapshot) {
                rollbackDbSnapshot(rollbackSnapshot);
            }
            return {
                ok: false,
                message: manualWrite.message || '手动更新表选择写入失败',
            };
        }

        const readback = readDbSnapshot();
        return {
            ok: true,
            message: '数据库配置已写入',
            readback,
            target: normalized,
        };
    };

    const switchPresetByName = (presetName, toastHost) => {
        const targetName = String(presetName || '').trim();

        if (!targetName) {
            setActiveDbPresetName('');
            showToast(toastHost, '已切换为当前配置（未绑定预设）');
            return true;
        }

        const presets = getDbPresets();
        const preset = presets.find(it => it.name === targetName);
        if (!preset) {
            showToast(toastHost, `未找到预设：${targetName}`, true);
            return false;
        }

        const before = readDbSnapshot();
        if (!before.ready) {
            showToast(toastHost, before.apiAvailability?.message || '数据库接口不可用，无法切换预设', true);
            return false;
        }

        const applied = applyDbSnapshot({
            updateConfig: preset.updateConfig,
            manualSelection: preset.manualSelection,
        }, before.snapshot);

        if (!applied.ok) {
            showToast(toastHost, `切换失败：${applied.message}`, true);
            return false;
        }

        if (!applied.readback?.ready) {
            setActiveDbPresetName('');
            showToast(toastHost, '预设已写入，但读回校验失败，已取消激活状态', true);
            return true;
        }

        const matched = isSameDbSnapshot(applied.readback.snapshot, applied.target);
        if (!matched) {
            setActiveDbPresetName('');
            showToast(toastHost, '预设已应用，但系统修正了部分参数，已取消激活状态', true);
            return true;
        }

        setActiveDbPresetName(targetName);
        showToast(toastHost, `已切换预设：${targetName}`);
        return true;
    };

    const clearActivePresetBindingIfNeeded = () => {
        const activeName = getActiveDbPresetName();
        if (!activeName) return false;
        setActiveDbPresetName('');
        return true;
    };

    return {
        readDbSnapshot,
        rollbackDbSnapshot,
        applyDbSnapshot,
        switchPresetByName,
        clearActivePresetBindingIfNeeded,
    };
}
