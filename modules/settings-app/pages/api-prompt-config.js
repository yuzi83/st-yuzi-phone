import {
    getPhoneChatSettings,
    normalizePhoneChatSettings,
    savePhoneChatSettingsPatch,
} from '../../phone-core/chat-support.js';
import { savePhoneSetting } from '../../settings.js';
import { escapeHtml, escapeHtmlAttr } from '../../utils/dom-escape.js';
import { buildApiPromptConfigPageHtml } from '../layout/frame.js';
import { bindApiPromptConfigInteractions } from '../services/api-prompt-config-controller.js';
import { createApiPromptWorldbookRuntime } from '../services/api-prompt-worldbook-runtime.js';
import {
    normalizeWorldbookSelection,
    getCurrentWorldbookSelection,
    saveCurrentWorldbookSelection,
} from '../services/worldbook-selection.js';
import { showToast } from '../ui/toast.js';
import {
    createPageShellSnapshot,
    ensurePageShell,
    normalizePageShellRefreshPlan,
    patchPageShell,
} from '../ui/page-shell.js';

const API_PROMPT_PAGE_ROOT_SELECTOR = '.phone-settings-page';
const API_PROMPT_SHELL_REGION_SELECTORS = Object.freeze({
    hero: '[data-shell-region="api-prompt-hero"]',
    apiStatus: '[data-shell-region="api-prompt-api-status"]',
    apiPresets: '[data-shell-region="api-prompt-api-presets"]',
    storyContext: '[data-shell-region="api-prompt-story-context"]',
    runtimeParams: '[data-shell-region="api-prompt-runtime-params"]',
    worldbookWorkbench: '[data-shell-region="api-prompt-worldbook-workbench"]',
});

function buildOptionHtml({ value = '', label = '', selected = false }) {
    return `<option value="${escapeHtmlAttr(value)}" ${selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
}

function buildPresetOptions(presets, activePresetName) {
    const active = String(activePresetName || '');
    return [
        buildOptionHtml({ value: '', label: '当前配置', selected: !active }),
        ...presets.map((preset) => {
            const name = String(preset?.name || '');
            return buildOptionHtml({
                value: name,
                label: name,
                selected: name === active,
            });
        }),
    ].join('');
}

function buildWorldbookOptions(worldbookList, currentWorldbook) {
    const list = Array.isArray(worldbookList) ? worldbookList : [];
    if (list.length === 0) {
        return buildOptionHtml({ value: '', label: '暂无世界书' });
    }

    const current = String(currentWorldbook || '');
    return [
        buildOptionHtml({ value: '', label: '请选择世界书', selected: !current }),
        ...list.map((name) => {
            const safeName = String(name || '');
            return buildOptionHtml({
                value: safeName,
                label: safeName,
                selected: safeName === current,
            });
        }),
    ].join('');
}

function buildWorldbookSourceModeOptions(sourceMode) {
    const current = String(sourceMode || 'manual');
    return [
        { value: 'off', label: '关闭' },
        { value: 'manual', label: '手动选择' },
        { value: 'character_bound', label: '角色卡绑定' },
    ].map((item) => buildOptionHtml({
        value: item.value,
        label: item.label,
        selected: item.value === current,
    })).join('');
}

function buildApiPromptConfigPayload({ apiPromptService, state }) {
    const phoneChatConfig = getPhoneChatSettings();
    const worldbookSelection = normalizeWorldbookSelection(getCurrentWorldbookSelection());
    state.worldbookSourceMode = worldbookSelection.sourceMode;

    const apiAvailability = apiPromptService.getDbConfigApiAvailability();
    const apiPresets = apiPromptService.getApiPresets();
    const tableApiPreset = apiPromptService.getTableApiPreset();
    const plotApiPreset = apiPromptService.getPlotApiPreset();
    const sourceMode = String(state.worldbookSourceMode || 'manual');

    return {
        apiAvailability,
        apiPresetOptions: buildPresetOptions(apiPresets, tableApiPreset),
        plotPresetOptions: buildPresetOptions(apiPresets, plotApiPreset),
        phoneChatApiPresetOptions: buildPresetOptions(apiPresets, phoneChatConfig.apiPresetName),
        phoneChatUseStoryContext: phoneChatConfig.useStoryContext,
        phoneChatStoryContextTurns: phoneChatConfig.storyContextTurns,
        phoneChatMaxHistoryMessages: phoneChatConfig.maxHistoryMessages,
        phoneChatMaxReplyTokens: phoneChatConfig.maxReplyTokens,
        phoneChatRequestTimeoutMs: phoneChatConfig.requestTimeoutMs,
        phoneChatWorldbookMaxEntries: phoneChatConfig.worldbookMaxEntries,
        phoneChatWorldbookMaxChars: phoneChatConfig.worldbookMaxChars,
        worldbookOptions: buildWorldbookOptions(state.worldbookList, state.currentWorldbook),
        worldbookLoading: state.worldbookLoading,
        worldbookSearchQuery: state.worldbookSearchQuery,
        worldbookSourceModeOptions: buildWorldbookSourceModeOptions(sourceMode),
        worldbookSelectDisabled: sourceMode !== 'manual',
        worldbookSearchDisabled: sourceMode === 'off',
        worldbookActionDisabled: sourceMode === 'off',
    };
}

function createApiPromptShellSnapshot(framePayload) {
    return createPageShellSnapshot({
        buildHtml: buildApiPromptConfigPageHtml,
        payload: framePayload,
        rootSelector: API_PROMPT_PAGE_ROOT_SELECTOR,
    });
}

function normalizeApiPromptRefreshPlan(refreshPlan) {
    return normalizePageShellRefreshPlan(refreshPlan, {
        hero: true,
        apiStatus: true,
        apiPresets: true,
        storyContext: true,
        runtimeParams: true,
        worldbookWorkbench: false,
    });
}

export function createApiPromptConfigPage(ctx) {
    return {
        mount() {
            renderApiPromptConfigPage(ctx);
        },
        update() {
            renderApiPromptConfigPage(ctx);
        },
        dispose() {},
    };
}

export function renderApiPromptConfigPage(ctx, options = {}) {
    const {
        container,
        state,
        render,
        registerCleanup,
        pageRuntime,
        apiPromptService,
    } = ctx;
    const setTableApiPreset = apiPromptService.setTableApiPreset;
    const setPlotApiPreset = apiPromptService.setPlotApiPreset;
    const tableApiPreset = apiPromptService.getTableApiPreset();
    const plotApiPreset = apiPromptService.getPlotApiPreset();

    const framePayload = buildApiPromptConfigPayload({ apiPromptService, state });
    const shellSnapshot = createApiPromptShellSnapshot(framePayload);
    const shellState = ensurePageShell(container, shellSnapshot, {
        rootSelector: API_PROMPT_PAGE_ROOT_SELECTOR,
        regionSelectors: API_PROMPT_SHELL_REGION_SELECTORS,
    });
    if (!shellState.didBootstrap && shellState.pageRoot instanceof HTMLElement) {
        patchPageShell(shellState.pageRoot, shellSnapshot, {
            regionSelectors: API_PROMPT_SHELL_REGION_SELECTORS,
            refreshPlan: normalizeApiPromptRefreshPlan(options?.refreshPlan),
        });
    }

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
        cleanupWorldbookSubscription,
        invalidateWorldbookRequests,
    } = createApiPromptWorldbookRuntime({
        container,
        state,
        pageRuntime,
        showToast,
        saveNormalizedWorldbookSelection,
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

    const cleanupInteractions = bindApiPromptConfigInteractions({
        container,
        state,
        render,
        pageRuntime,
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
        invalidateWorldbookRequests,
        refreshApiPromptConfigPage(refreshOptions = {}) {
            renderApiPromptConfigPage(ctx, refreshOptions);
        },
    });

    bindWorldbookSubscription({
        worldbookSelect: container.querySelector('#phone-worldbook-select'),
        syncWorldbookControlStates,
    });

    const cleanupPage = () => {
        try {
            if (typeof cleanupInteractions === 'function') {
                cleanupInteractions();
            }
        } finally {
            cleanupWorldbookSubscription();
        }
    };

    if (pageRuntime?.registerCleanup) {
        pageRuntime.registerCleanup(cleanupPage);
    } else if (typeof registerCleanup === 'function') {
        registerCleanup(cleanupPage);
    }

    initWorldbook(syncWorldbookControlStates);
}
