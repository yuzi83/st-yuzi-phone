import {
    buildPresetPayload,
    clonePromptGroup,
    getMediaMarkersFromPreset,
    getPromptGroupFromPreset,
    loadDraftIntoState,
    sanitizeFilenamePart,
} from './draft-helpers.js';

export function createAiInstructionPresetActions(deps = {}) {
    const {
        container,
        state,
        currentPresetName,
        selectedPresetName,
        safeRerender,
        createDefaultPhoneAiInstructionPreset,
        savePhoneAiInstructionPreset,
        showConfirmDialog,
        showToast,
        downloadTextFile,
        getPhoneAiInstructionPreset,
        setCurrentPhoneAiInstructionPresetName,
        deletePhoneAiInstructionPreset,
        importPhoneAiInstructionPresetsFromData,
        exportPhoneAiInstructionPresetPack,
        exportAllPhoneAiInstructionPresetsPack,
        runtime,
    } = deps;

    const pageRuntime = runtime && typeof runtime === 'object' ? runtime : null;
    let importToken = 0;

    const isRuntimeDisposed = () => !!(pageRuntime
        && typeof pageRuntime.isDisposed === 'function'
        && pageRuntime.isDisposed());

    const createImportToken = () => {
        importToken += 1;
        return importToken;
    };

    const isImportActive = (token) => (
        Number.isInteger(token)
        && token === importToken
        && !isRuntimeDisposed()
    );

    const notify = (message, isError = false) => {
        showToast(container, message, isError);
    };

    return {
        switchPreset(nextName) {
            const targetName = String(nextName || '').trim();
            state.aiInstructionSelectedPresetName = targetName;
            const nextPreset = targetName
                ? getPhoneAiInstructionPreset(targetName)
                : createDefaultPhoneAiInstructionPreset();
            loadDraftIntoState(state, nextPreset);
            safeRerender();
        },

        async importPresetFile(file) {
            if (!file) return;
            const currentImportToken = createImportToken();

            try {
                const text = await file.text();
                if (!isImportActive(currentImportToken)) return;

                const result = importPhoneAiInstructionPresetsFromData(text, {
                    overwrite: true,
                    switchTo: false,
                });
                if (!isImportActive(currentImportToken)) return;

                if (result?.success) {
                    const nextName = String(result.presetNames?.[0] || result.currentPresetName || '').trim();
                    const nextPreset = nextName ? getPhoneAiInstructionPreset(nextName) : null;
                    if (!isImportActive(currentImportToken)) return;

                    if (nextPreset) {
                        loadDraftIntoState(state, nextPreset);
                    }
                    notify(result.message || 'AI 指令预设导入成功');
                    safeRerender();
                } else {
                    notify(result?.message || '导入失败', true);
                }
            } catch (error) {
                if (!isImportActive(currentImportToken)) return;
                notify(error?.message || '读取导入文件失败', true);
            }
        },

        applyPreset() {
            const targetName = String(state.aiInstructionSelectedPresetName || selectedPresetName || '').trim();
            if (!targetName) {
                notify('请先选择预设', true);
                return;
            }
            const result = setCurrentPhoneAiInstructionPresetName(targetName);
            if (result?.success) {
                notify(`当前实时回复预设已切换为：${targetName}`);
                safeRerender();
            } else {
                notify(result?.message || '切换预设失败', true);
            }
        },

        savePreset(options = {}) {
            const payload = buildPresetPayload(state, currentPresetName);
            if (!payload.name) {
                notify('请输入预设名称', true);
                return;
            }
            const result = savePhoneAiInstructionPreset(payload, {
                originalName: String(options.originalName || '').trim(),
                overwrite: options.overwrite === true,
                switchTo: false,
            });
            if (result?.success) {
                state.aiInstructionSelectedPresetName = String(result.presetName || payload.name).trim();
                state.aiInstructionDraftOriginalName = state.aiInstructionSelectedPresetName;
                state.aiInstructionDraftName = state.aiInstructionSelectedPresetName;
                notify(result.message || (options.overwrite === false ? '已另存为新预设' : '预设已保存'));
                safeRerender();
            } else {
                notify(result?.message || (options.overwrite === false ? '另存失败' : '保存失败'), true);
            }
        },

        deletePreset() {
            const targetName = String(state.aiInstructionSelectedPresetName || selectedPresetName || '').trim();
            if (!targetName) return;
            showConfirmDialog(
                container,
                '确认删除',
                `确定要删除 AI 指令预设「${targetName}」吗？此操作无法撤销。`,
                () => {
                    const result = deletePhoneAiInstructionPreset(targetName);
                    if (result?.success) {
                        const nextName = String(result.presetName || '').trim();
                        const nextPreset = nextName
                            ? getPhoneAiInstructionPreset(nextName)
                            : createDefaultPhoneAiInstructionPreset();
                        loadDraftIntoState(state, nextPreset);
                        notify(result.message || '预设已删除');
                        safeRerender();
                    } else {
                        notify(result?.message || '删除失败', true);
                    }
                },
                '删除',
                '取消',
            );
        },

        resetPresetDraft() {
            const defaultPreset = createDefaultPhoneAiInstructionPreset({
                name: String(state.aiInstructionDraftName || '').trim() || undefined,
            });
            const mediaMarkers = getMediaMarkersFromPreset(defaultPreset);
            state.aiInstructionDraftPromptGroup = clonePromptGroup(getPromptGroupFromPreset(defaultPreset));
            state.aiInstructionDraftImagePrefix = mediaMarkers.imagePrefix;
            state.aiInstructionDraftVideoPrefix = mediaMarkers.videoPrefix;
            if (!String(state.aiInstructionDraftName || '').trim()) {
                state.aiInstructionDraftName = String(defaultPreset.name || '').trim();
            }
            safeRerender();
            notify('已恢复为默认提示词结构');
        },

        exportPreset() {
            const targetName = String(state.aiInstructionSelectedPresetName || selectedPresetName || '').trim();
            if (!targetName) {
                notify('请先选择要导出的预设', true);
                return;
            }
            const pack = exportPhoneAiInstructionPresetPack(targetName);
            if (!pack) {
                notify('导出失败：未找到预设', true);
                return;
            }
            const filename = `yuzi_phone_ai_preset_${sanitizeFilenamePart(targetName, 'preset')}.json`;
            downloadTextFile(filename, JSON.stringify(pack, null, 2), 'application/json');
            notify(`已导出预设：${targetName}`);
        },

        exportAllPresets() {
            const pack = exportAllPhoneAiInstructionPresetsPack();
            downloadTextFile('yuzi_phone_ai_presets_all.json', JSON.stringify(pack, null, 2), 'application/json');
            notify('已导出全部 AI 指令预设');
        },
    };
}
