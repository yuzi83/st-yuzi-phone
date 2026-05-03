import { Logger } from '../../error-handler.js';

const logger = Logger.withScope({ scope: 'settings-app/services/api-prompt-config-controller', feature: 'settings-app' });

const API_PROMPT_INTERACTION_CLEANUP_KEY = '__stYuziPhoneApiPromptConfigCleanup';

export function bindApiPromptConfigInteractions(ctx = {}) {
    const {
        container,
        state,
        render,
        pageRuntime,
        setTableApiPreset,
        tableApiPreset = '',
        setPlotApiPreset,
        plotApiPreset = '',
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
        refreshApiPromptConfigPage,
    } = ctx;

    if (!(container instanceof HTMLElement) || !state) return () => {};
    if (typeof render !== 'function' || typeof showToast !== 'function') return () => {};

    const runtime = pageRuntime && typeof pageRuntime === 'object' ? pageRuntime : null;
    const previousCleanup = container[API_PROMPT_INTERACTION_CLEANUP_KEY];
    if (typeof previousCleanup === 'function') {
        previousCleanup();
    }

    let didCleanup = false;
    const cleanups = [];
    const cleanupInteractions = () => {
        if (didCleanup) {
            return;
        }
        didCleanup = true;
        const tasks = [...cleanups];
        cleanups.length = 0;
        tasks.reverse().forEach((cleanup) => {
            try {
                cleanup?.();
            } catch (error) {
                logger.warn('cleanup 执行失败', error);
            }
        });
        if (container[API_PROMPT_INTERACTION_CLEANUP_KEY] === cleanupInteractions) {
            delete container[API_PROMPT_INTERACTION_CLEANUP_KEY];
        }
    };
    container[API_PROMPT_INTERACTION_CLEANUP_KEY] = cleanupInteractions;

    const refreshPage = (refreshOptions = {}) => {
        if (typeof refreshApiPromptConfigPage === 'function') {
            refreshApiPromptConfigPage(refreshOptions);
        }
    };

    const invalidateWorldbookAsyncState = (options = {}) => {
        if (typeof invalidateWorldbookRequests === 'function') {
            invalidateWorldbookRequests(options);
        }
    };

    const addListener = (target, type, listener, options) => {
        if (runtime?.addEventListener) {
            const remove = runtime.addEventListener(target, type, listener, options);
            if (typeof remove === 'function') {
                cleanups.push(remove);
            }
            return;
        }
        if (!target || typeof target.addEventListener !== 'function') return;
        target.addEventListener(type, listener, options);
        cleanups.push(() => target.removeEventListener(type, listener, options));
    };

    const onBackClick = () => {
        state.mode = 'home';
        render();
    };
    addListener(container.querySelector('.phone-nav-back'), 'click', onBackClick);

    const tablePresetSelect = container.querySelector('#phone-table-api-preset-select');
    if (tablePresetSelect instanceof HTMLSelectElement) {
        const onTablePresetChange = () => {
            const value = String(tablePresetSelect.value || '');
            const success = setTableApiPreset(value);
            if (success) {
                showToast(container, value ? `已切换到预设：${value}` : '已恢复使用当前配置');
                refreshPage({
                    refreshPlan: {
                        hero: false,
                        apiStatus: false,
                        apiPresets: true,
                        storyContext: false,
                        runtimeParams: false,
                        worldbookWorkbench: false,
                    },
                });
            } else {
                showToast(container, '切换预设失败', true);
                tablePresetSelect.value = tableApiPreset;
            }
        };
        addListener(tablePresetSelect, 'change', onTablePresetChange);
    }

    const plotPresetSelect = container.querySelector('#phone-plot-api-preset-select');
    if (plotPresetSelect instanceof HTMLSelectElement) {
        const onPlotPresetChange = () => {
            const value = String(plotPresetSelect.value || '');
            const success = setPlotApiPreset(value);
            if (success) {
                showToast(container, value ? `已切换到预设：${value}` : '已恢复使用当前配置');
                refreshPage({
                    refreshPlan: {
                        hero: false,
                        apiStatus: false,
                        apiPresets: true,
                        storyContext: false,
                        runtimeParams: false,
                        worldbookWorkbench: false,
                    },
                });
            } else {
                showToast(container, '切换预设失败', true);
                plotPresetSelect.value = plotApiPreset;
            }
        };
        addListener(plotPresetSelect, 'change', onPlotPresetChange);
    }

    const phoneChatUseStoryContextCheckbox = container.querySelector('#phone-chat-use-story-context');
    const phoneChatStoryContextTurnsInput = container.querySelector('#phone-chat-story-context-turns');
    if (phoneChatUseStoryContextCheckbox instanceof HTMLInputElement) {
        const onUseStoryContextChange = () => {
            const nextConfig = saveNormalizedPhoneChatConfig({ useStoryContext: !!phoneChatUseStoryContextCheckbox.checked });
            if (phoneChatStoryContextTurnsInput instanceof HTMLInputElement) {
                phoneChatStoryContextTurnsInput.disabled = !nextConfig.useStoryContext;
            }
            showToast(container, nextConfig.useStoryContext ? '已启用AI上下文读取' : '已关闭AI上下文读取');
            refreshPage({
                refreshPlan: {
                    hero: true,
                    apiStatus: false,
                    apiPresets: false,
                    storyContext: true,
                    runtimeParams: false,
                    worldbookWorkbench: false,
                },
            });
        };
        addListener(phoneChatUseStoryContextCheckbox, 'change', onUseStoryContextChange);
    }

    const normalizeChatConfig = typeof normalizePhoneChatSettings === 'function'
        ? normalizePhoneChatSettings
        : (value => value || {});

    if (phoneChatStoryContextTurnsInput instanceof HTMLInputElement) {
        const onStoryContextTurnsChange = () => {
            const nextConfig = normalizeChatConfig({ storyContextTurns: phoneChatStoryContextTurnsInput.value });
            phoneChatStoryContextTurnsInput.value = String(nextConfig.storyContextTurns);
            saveNormalizedPhoneChatConfig({ storyContextTurns: nextConfig.storyContextTurns });
            showToast(container, `AI上下文轮数已设置为 ${nextConfig.storyContextTurns}`);
            refreshPage({
                refreshPlan: {
                    hero: true,
                    apiStatus: false,
                    apiPresets: false,
                    storyContext: true,
                    runtimeParams: false,
                    worldbookWorkbench: false,
                },
            });
        };
        addListener(phoneChatStoryContextTurnsInput, 'change', onStoryContextTurnsChange);
    }

    const phoneChatApiPresetSelect = container.querySelector('#phone-chat-api-preset-select');
    if (phoneChatApiPresetSelect instanceof HTMLSelectElement) {
        const onPhoneChatApiPresetChange = () => {
            const value = String(phoneChatApiPresetSelect.value || '');
            saveNormalizedPhoneChatConfig({ apiPresetName: value });
            showToast(container, value ? `聊天API预设已切换为：${value}` : '聊天API预设已恢复为当前配置');
            refreshPage({
                refreshPlan: {
                    hero: false,
                    apiStatus: false,
                    apiPresets: true,
                    storyContext: false,
                    runtimeParams: false,
                    worldbookWorkbench: false,
                },
            });
        };
        addListener(phoneChatApiPresetSelect, 'change', onPhoneChatApiPresetChange);
    }

    const bindPhoneChatNumberInput = (selector, patchKey, successText, step = 1) => {
        const input = container.querySelector(selector);
        if (!(input instanceof HTMLInputElement)) return;

        const onChange = () => {
            const nextConfig = normalizeChatConfig({ [patchKey]: input.value });
            const nextValue = String(nextConfig?.[patchKey] ?? '');
            input.value = nextValue;
            saveNormalizedPhoneChatConfig({ [patchKey]: nextConfig?.[patchKey] });
            showToast(container, `${successText}${nextValue}${step >= 1000 ? ' ms' : ''}`);
            refreshPage({
                refreshPlan: {
                    hero: true,
                    apiStatus: false,
                    apiPresets: false,
                    storyContext: false,
                    runtimeParams: true,
                    worldbookWorkbench: false,
                },
            });
        };

        addListener(input, 'change', onChange);
    };

    bindPhoneChatNumberInput('#phone-chat-max-history-messages', 'maxHistoryMessages', '历史消息条数已设置为 ');
    bindPhoneChatNumberInput('#phone-chat-max-reply-tokens', 'maxReplyTokens', '回复最大 token 已设置为 ');
    bindPhoneChatNumberInput('#phone-chat-request-timeout-ms', 'requestTimeoutMs', '请求超时已设置为 ', 1000);
    bindPhoneChatNumberInput('#phone-chat-worldbook-max-entries', 'worldbookMaxEntries', '世界书最大条目数已设置为 ');
    bindPhoneChatNumberInput('#phone-chat-worldbook-max-chars', 'worldbookMaxChars', '世界书最大字符数已设置为 ');

    const worldbookSourceModeSelect = container.querySelector('#phone-worldbook-source-mode');
    const worldbookSelect = container.querySelector('#phone-worldbook-select');
    const worldbookSearchInput = container.querySelector('#phone-worldbook-search');

    if (worldbookSourceModeSelect instanceof HTMLSelectElement) {
        const onWorldbookSourceModeChange = () => {
            invalidateWorldbookAsyncState();
            const value = String(worldbookSourceModeSelect.value || 'manual');
            const currentSelection = normalizeWorldbookSelection(getCurrentWorldbookSelection());
            saveNormalizedWorldbookSelection({
                ...currentSelection,
                sourceMode: value,
            });
            state.worldbookSourceMode = value;
            if (value !== 'manual') {
                state.currentWorldbook = '';
            }
            state.boundWorldbookNames = [];
            state.worldbookEntries = [];
            state.worldbookError = null;
            state.worldbookLoading = false;
            state.worldbookSearchQuery = '';
            syncWorldbookControlStates();
            renderWorldbookEntriesList();
        };
        addListener(worldbookSourceModeSelect, 'change', onWorldbookSourceModeChange);
    }

    if (worldbookSelect instanceof HTMLSelectElement) {
        const onWorldbookSelectChange = async () => {
            invalidateWorldbookAsyncState();
            const worldbookName = String(worldbookSelect.value || '');
            state.currentWorldbook = worldbookName;
            state.worldbookSearchQuery = '';

            if (worldbookSearchInput instanceof HTMLInputElement) {
                worldbookSearchInput.value = '';
            }

            if (worldbookName) {
                saveCurrentWorldbookSelection(worldbookName);
                const didLoad = await loadWorldbookEntriesIntoState(worldbookName);
                if (!didLoad) return;
            } else {
                state.worldbookEntries = [];
                state.worldbookError = null;
                state.worldbookLoading = false;
            }

            renderWorldbookEntriesList();
        };
        addListener(worldbookSelect, 'change', onWorldbookSelectChange);
    }

    const refreshBtn = container.querySelector('#phone-worldbook-refresh');
    if (refreshBtn instanceof HTMLButtonElement) {
        addListener(refreshBtn, 'click', refreshWorldbook);
    }

    if (worldbookSearchInput instanceof HTMLInputElement) {
        const onWorldbookSearchInput = () => {
            state.worldbookSearchQuery = String(worldbookSearchInput.value || '');
            renderWorldbookEntriesList();
        };
        addListener(worldbookSearchInput, 'input', onWorldbookSearchInput);
    }

    const selectAllBtn = container.querySelector('#phone-worldbook-select-all');
    if (selectAllBtn instanceof HTMLButtonElement) {
        addListener(selectAllBtn, 'click', selectAllEntries);
    }

    const deselectAllBtn = container.querySelector('#phone-worldbook-deselect-all');
    if (deselectAllBtn instanceof HTMLButtonElement) {
        addListener(deselectAllBtn, 'click', deselectAllEntries);
    }

    return cleanupInteractions;
}
