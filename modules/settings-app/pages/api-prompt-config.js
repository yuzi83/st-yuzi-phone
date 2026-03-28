import {
    getPhoneChatSettings,
    normalizePhoneChatSettings,
    savePhoneChatSettingsPatch,
} from '../../phone-core/chat-support.js';
import { savePhoneSetting } from '../../settings.js';
import { buildApiPromptConfigPageHtml } from '../layout/frame.js';
import { bindApiPromptConfigInteractions } from '../services/api-prompt-config-controller.js';
import { createApiPromptWorldbookRuntime } from '../services/api-prompt-worldbook-runtime.js';
import {
    normalizeWorldbookSelection,
    getCurrentWorldbookSelection,
    saveCurrentWorldbookSelection,
} from '../services/worldbook-selection.js';
import { showToast } from '../ui/toast.js';

export function renderApiPromptConfigPage(ctx) {
    const {
        container,
        state,
        render,
        getDbConfigApiAvailability,
        getApiPresets,
        getTableApiPreset,
        setTableApiPreset,
        getPlotApiPreset,
        setPlotApiPreset,
    } = ctx;

    const saveNormalizedPhoneChatConfig = (patch = {}) => savePhoneChatSettingsPatch(patch);

    const saveNormalizedWorldbookSelection = (selection) => {
        const next = normalizeWorldbookSelection(selection);
        savePhoneSetting('worldbookSelection', next);
        return next;
    };

    const {
        renderWorldbookEntriesList,
        selectAllEntries,
        deselectAllEntries,
        loadWorldbookEntriesIntoState,
        refreshWorldbook,
        initWorldbook,
        bindWorldbookSubscription,
    } = createApiPromptWorldbookRuntime({
        container,
        state,
        showToast,
        saveNormalizedWorldbookSelection,
    });

    const phoneChatConfig = getPhoneChatSettings();
    const worldbookSelection = normalizeWorldbookSelection(getCurrentWorldbookSelection());

    state.worldbookSourceMode = worldbookSelection.sourceMode;

    const apiAvailability = getDbConfigApiAvailability();
    const apiPresets = getApiPresets();
    const tableApiPreset = getTableApiPreset();
    const plotApiPreset = getPlotApiPreset();

    const apiPresetOptions = [
        `<option value="" ${!tableApiPreset ? 'selected' : ''}>当前配置</option>`,
        ...apiPresets.map((preset) => (
            `<option value="${String(preset.name || '').replace(/&/g, '&').replace(/"/g, '"').replace(/</g, '<').replace(/>/g, '>')}" ${preset.name === tableApiPreset ? 'selected' : ''}>${String(preset.name || '').replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>')}</option>`
        )),
    ].join('');

    const plotPresetOptions = [
        `<option value="" ${!plotApiPreset ? 'selected' : ''}>当前配置</option>`,
        ...apiPresets.map((preset) => (
            `<option value="${String(preset.name || '').replace(/&/g, '&').replace(/"/g, '"').replace(/</g, '<').replace(/>/g, '>')}" ${preset.name === plotApiPreset ? 'selected' : ''}>${String(preset.name || '').replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>')}</option>`
        )),
    ].join('');

    const phoneChatApiPresetOptions = [
        `<option value="" ${!phoneChatConfig.apiPresetName ? 'selected' : ''}>当前配置</option>`,
        ...apiPresets.map((preset) => (
            `<option value="${String(preset.name || '').replace(/&/g, '&').replace(/"/g, '"').replace(/</g, '<').replace(/>/g, '>')}" ${preset.name === phoneChatConfig.apiPresetName ? 'selected' : ''}>${String(preset.name || '').replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>')}</option>`
        )),
    ].join('');

    const worldbookOptions = state.worldbookList.length > 0
        ? [
            '<option value="">请选择世界书</option>',
            ...state.worldbookList.map((name) => (
                `<option value="${String(name || '').replace(/&/g, '&').replace(/"/g, '"').replace(/</g, '<').replace(/>/g, '>')}" ${name === state.currentWorldbook ? 'selected' : ''}>${String(name || '').replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>')}</option>`
            )),
        ].join('')
        : '<option value="">暂无世界书</option>';

    const worldbookSourceModeOptions = [
        { value: 'off', label: '关闭' },
        { value: 'manual', label: '手动选择' },
        { value: 'character_bound', label: '角色卡绑定' },
    ].map((item) => (
        `<option value="${item.value}" ${item.value === state.worldbookSourceMode ? 'selected' : ''}>${item.label}</option>`
    )).join('');

    const worldbookSelectDisabled = state.worldbookSourceMode !== 'manual';
    const worldbookSearchDisabled = state.worldbookSourceMode === 'off';
    const worldbookActionDisabled = state.worldbookSourceMode === 'off';

    container.innerHTML = buildApiPromptConfigPageHtml({
        apiAvailability,
        apiPresetOptions,
        plotPresetOptions,
        phoneChatApiPresetOptions,
        phoneChatUseStoryContext: phoneChatConfig.useStoryContext,
        phoneChatStoryContextTurns: phoneChatConfig.storyContextTurns,
        phoneChatMaxHistoryMessages: phoneChatConfig.maxHistoryMessages,
        phoneChatMaxReplyTokens: phoneChatConfig.maxReplyTokens,
        phoneChatRequestTimeoutMs: phoneChatConfig.requestTimeoutMs,
        phoneChatWorldbookMaxEntries: phoneChatConfig.worldbookMaxEntries,
        phoneChatWorldbookMaxChars: phoneChatConfig.worldbookMaxChars,
        worldbookOptions,
        worldbookLoading: state.worldbookLoading,
        worldbookSearchQuery: state.worldbookSearchQuery,
        worldbookSourceModeOptions,
        worldbookSelectDisabled,
        worldbookSearchDisabled,
        worldbookActionDisabled,
    });

    const syncWorldbookControlStates = () => {
        const sourceMode = String(state.worldbookSourceMode || 'manual');
        const selectDisabled = sourceMode !== 'manual';
        const actionDisabled = sourceMode === 'off';
        const worldbookSourceModeSelect = container.querySelector('#phone-worldbook-source-mode');
        const worldbookSelect = container.querySelector('#phone-worldbook-select');
        const worldbookSearchInput = container.querySelector('#phone-worldbook-search');
        const worldbookRefreshBtn = container.querySelector('#phone-worldbook-refresh');
        const worldbookSelectAllBtn = container.querySelector('#phone-worldbook-select-all');
        const worldbookDeselectAllBtn = container.querySelector('#phone-worldbook-deselect-all');

        if (worldbookSourceModeSelect instanceof HTMLSelectElement) {
            worldbookSourceModeSelect.value = sourceMode;
        }
        if (worldbookSelect instanceof HTMLSelectElement) {
            worldbookSelect.disabled = selectDisabled;
            worldbookSelect.value = state.currentWorldbook || '';
        }
        if (worldbookSearchInput instanceof HTMLInputElement) {
            worldbookSearchInput.disabled = actionDisabled;
            worldbookSearchInput.value = String(state.worldbookSearchQuery || '');
        }
        [worldbookRefreshBtn, worldbookSelectAllBtn, worldbookDeselectAllBtn].forEach((btn) => {
            if (btn instanceof HTMLButtonElement) {
                btn.disabled = actionDisabled;
            }
        });
    };

    bindApiPromptConfigInteractions({
        container,
        state,
        render,
        setTableApiPreset,
        tableApiPreset,
        setPlotApiPreset,
        plotApiPreset,
        showToast,
        saveNormalizedPhoneChatConfig,
        normalizePhoneChatSettings,
        normalizeWorldbookSelection,
        getCurrentWorldbookSelection,
        saveNormalizedWorldbookSelection,
        syncWorldbookControlStates,
        renderWorldbookEntriesList,
        saveCurrentWorldbookSelection,
        loadWorldbookEntriesIntoState,
        refreshWorldbook,
        selectAllEntries,
        deselectAllEntries,
    });

    bindWorldbookSubscription({
        worldbookSelect: container.querySelector('#phone-worldbook-select'),
        syncWorldbookControlStates,
    });
    initWorldbook(syncWorldbookControlStates);
}
