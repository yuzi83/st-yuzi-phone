export function bindApiPromptConfigInteractions(ctx = {}) {
    const {
        container,
        state,
        render,
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
    } = ctx;

    if (!(container instanceof HTMLElement) || !state) return;

    container.querySelector('.phone-nav-back')?.addEventListener('click', () => {
        state.mode = 'home';
        render();
    });

    const tablePresetSelect = container.querySelector('#phone-table-api-preset-select');
    if (tablePresetSelect) {
        tablePresetSelect.addEventListener('change', () => {
            const value = String(tablePresetSelect.value || '');
            const success = setTableApiPreset(value);
            if (success) {
                showToast(container, value ? `已切换到预设：${value}` : '已恢复使用当前配置');
            } else {
                showToast(container, '切换预设失败', true);
                tablePresetSelect.value = tableApiPreset;
            }
        });
    }

    const plotPresetSelect = container.querySelector('#phone-plot-api-preset-select');
    if (plotPresetSelect) {
        plotPresetSelect.addEventListener('change', () => {
            const value = String(plotPresetSelect.value || '');
            const success = setPlotApiPreset(value);
            if (success) {
                showToast(container, value ? `已切换到预设：${value}` : '已恢复使用当前配置');
            } else {
                showToast(container, '切换预设失败', true);
                plotPresetSelect.value = plotApiPreset;
            }
        });
    }

    const phoneChatUseStoryContextCheckbox = container.querySelector('#phone-chat-use-story-context');
    const phoneChatStoryContextTurnsInput = container.querySelector('#phone-chat-story-context-turns');
    if (phoneChatUseStoryContextCheckbox) {
        phoneChatUseStoryContextCheckbox.addEventListener('change', () => {
            const nextConfig = saveNormalizedPhoneChatConfig({ useStoryContext: !!phoneChatUseStoryContextCheckbox.checked });
            if (phoneChatStoryContextTurnsInput) {
                phoneChatStoryContextTurnsInput.disabled = !nextConfig.useStoryContext;
            }
            showToast(container, nextConfig.useStoryContext ? '已启用AI上下文读取' : '已关闭AI上下文读取');
        });
    }

    const normalizeChatConfig = typeof normalizePhoneChatSettings === 'function'
        ? normalizePhoneChatSettings
        : (value => value || {});

    if (phoneChatStoryContextTurnsInput) {
        phoneChatStoryContextTurnsInput.addEventListener('change', () => {
            const nextConfig = normalizeChatConfig({ storyContextTurns: phoneChatStoryContextTurnsInput.value });
            phoneChatStoryContextTurnsInput.value = String(nextConfig.storyContextTurns);
            saveNormalizedPhoneChatConfig({ storyContextTurns: nextConfig.storyContextTurns });
            showToast(container, `AI上下文轮数已设置为 ${nextConfig.storyContextTurns}`);
        });
    }

    const phoneChatApiPresetSelect = container.querySelector('#phone-chat-api-preset-select');
    if (phoneChatApiPresetSelect) {
        phoneChatApiPresetSelect.addEventListener('change', () => {
            const value = String(phoneChatApiPresetSelect.value || '');
            saveNormalizedPhoneChatConfig({ apiPresetName: value });
            showToast(container, value ? `聊天API预设已切换为：${value}` : '聊天API预设已恢复为当前配置');
        });
    }

    const bindPhoneChatNumberInput = (selector, patchKey, successText, step = 1) => {
        const input = /** @type {HTMLInputElement | null} */ (container.querySelector(selector));
        if (!input) return;
        input.addEventListener('change', () => {
            const nextConfig = normalizeChatConfig({ [patchKey]: input.value });
            const nextValue = String(nextConfig?.[patchKey] ?? '');
            input.value = nextValue;
            saveNormalizedPhoneChatConfig({ [patchKey]: nextConfig?.[patchKey] });
            showToast(container, `${successText}${nextValue}${step >= 1000 ? ' ms' : ''}`);
        });
    };

    bindPhoneChatNumberInput('#phone-chat-max-history-messages', 'maxHistoryMessages', '历史消息条数已设置为 ');
    bindPhoneChatNumberInput('#phone-chat-max-reply-tokens', 'maxReplyTokens', '回复最大 token 已设置为 ');
    bindPhoneChatNumberInput('#phone-chat-request-timeout-ms', 'requestTimeoutMs', '请求超时已设置为 ', 1000);
    bindPhoneChatNumberInput('#phone-chat-worldbook-max-entries', 'worldbookMaxEntries', '世界书最大条目数已设置为 ');
    bindPhoneChatNumberInput('#phone-chat-worldbook-max-chars', 'worldbookMaxChars', '世界书最大字符数已设置为 ');

    const worldbookSourceModeSelect = container.querySelector('#phone-worldbook-source-mode');
    const worldbookSelect = container.querySelector('#phone-worldbook-select');
    const worldbookSearchInput = container.querySelector('#phone-worldbook-search');

    if (worldbookSourceModeSelect) {
        worldbookSourceModeSelect.addEventListener('change', () => {
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
        });
    }

    if (worldbookSelect) {
        worldbookSelect.addEventListener('change', async () => {
            const worldbookName = String(worldbookSelect.value || '');
            state.currentWorldbook = worldbookName;
            state.worldbookSearchQuery = '';

            if (worldbookSearchInput) {
                worldbookSearchInput.value = '';
            }

            if (worldbookName) {
                saveCurrentWorldbookSelection(worldbookName);
                await loadWorldbookEntriesIntoState(worldbookName);
            } else {
                state.worldbookEntries = [];
                state.worldbookError = null;
            }

            renderWorldbookEntriesList();
        });
    }

    container.querySelector('#phone-worldbook-refresh')?.addEventListener('click', refreshWorldbook);

    if (worldbookSearchInput) {
        worldbookSearchInput.addEventListener('input', () => {
            state.worldbookSearchQuery = String(worldbookSearchInput.value || '');
            renderWorldbookEntriesList();
        });
    }

    container.querySelector('#phone-worldbook-select-all')?.addEventListener('click', selectAllEntries);
    container.querySelector('#phone-worldbook-deselect-all')?.addEventListener('click', deselectAllEntries);
}
