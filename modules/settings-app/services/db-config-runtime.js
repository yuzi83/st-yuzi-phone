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

    const normalizeWriteResult = (result, fallbackMessage) => {
        if (result && typeof result === 'object') {
            return {
                ok: result.ok === true,
                message: String(result.message || fallbackMessage || '').trim(),
            };
        }

        return {
            ok: false,
            message: String(fallbackMessage || '').trim(),
        };
    };

    const buildRollbackFailureMessage = (rollbackResult) => {
        const failures = [];
        if (rollbackResult?.updateResult?.ok !== true) {
            failures.push(rollbackResult?.updateResult?.message || '更新配置回滚失败');
        }
        if (rollbackResult?.manualResult?.ok !== true) {
            failures.push(rollbackResult?.manualResult?.message || '手动表选择回滚失败');
        }
        return failures.filter(Boolean).join('；');
    };

    const rollbackDbSnapshot = (snapshot) => {
        const normalized = normalizeDbConfigSnapshot(snapshot);
        const updateResult = normalizeWriteResult(
            writeDbUpdateConfigViaApi(normalized.updateConfig),
            '更新配置回滚失败',
        );
        const manualResult = normalized.manualSelection.hasManualSelection
            ? normalizeWriteResult(
                writeManualTableSelectionViaApi(normalized.manualSelection.selectedTables),
                '手动表选择回滚失败',
            )
            : normalizeWriteResult(
                clearManualTableSelectionViaApi(),
                '手动表选择回滚失败',
            );
        const ok = updateResult.ok && manualResult.ok;
        return {
            ok,
            updateResult,
            manualResult,
            message: ok ? '数据库配置已回滚' : buildRollbackFailureMessage({ updateResult, manualResult }),
        };
    };

    const applyDbSnapshot = (targetSnapshot, rollbackSnapshot = null) => {
        const normalized = normalizeDbConfigSnapshot(targetSnapshot);

        const updateWrite = normalizeWriteResult(
            writeDbUpdateConfigViaApi(normalized.updateConfig),
            '更新配置写入失败',
        );
        if (!updateWrite.ok) {
            return {
                ok: false,
                message: updateWrite.message || '更新配置写入失败',
            };
        }

        const manualWrite = normalized.manualSelection.hasManualSelection
            ? normalizeWriteResult(
                writeManualTableSelectionViaApi(normalized.manualSelection.selectedTables),
                '手动更新表选择写入失败',
            )
            : normalizeWriteResult(
                clearManualTableSelectionViaApi(),
                '手动更新表选择写入失败',
            );

        if (!manualWrite.ok) {
            const rollbackResult = rollbackSnapshot ? rollbackDbSnapshot(rollbackSnapshot) : null;
            const baseMessage = manualWrite.message || '手动更新表选择写入失败';
            if (rollbackResult && !rollbackResult.ok) {
                const rollbackMessage = rollbackResult.message || buildRollbackFailureMessage(rollbackResult);
                return {
                    ok: false,
                    message: `${baseMessage}；回滚也失败，当前配置可能部分写入${rollbackMessage ? `：${rollbackMessage}` : ''}`,
                    rollbackResult,
                };
            }
            return {
                ok: false,
                message: baseMessage,
                rollbackResult,
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
