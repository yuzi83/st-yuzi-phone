import { defaultSettings, getPhoneSettings, savePhoneSetting } from '../../settings.js';
import { escapeHtml, escapeHtmlAttr } from '../../utils.js';
import { buildApiPromptConfigPageHtml } from '../layout/frame.js';
import { showConfirmDialog } from '../ui/confirm-dialog.js';
import { showToast } from '../ui/toast.js';
import {
    applyEntrySelectionState,
    filterEntries,
    getCurrentWorldbookSelection,
    getEntrySelectionState,
    loadCharacterBoundWorldbookEntries,
    loadWorldbookEntries,
    loadWorldbookList,
    normalizeWorldbookSelection,
    saveCurrentWorldbookSelection,
    setEntrySelectionState,
    subscribeWorldbookUpdates,
} from '../services/worldbook-selection.js';

const PHONE_CHAT_DEFAULTS = defaultSettings?.phoneChat || {
    useStoryContext: true,
    storyContextTurns: 3,
    promptTemplateName: '',
    apiPresetName: '',
};

function clampStoryContextTurns(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return Number(PHONE_CHAT_DEFAULTS.storyContextTurns) || 3;
    return Math.max(0, Math.min(20, Math.round(num)));
}

function normalizePhoneChatConfig(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
        useStoryContext: src.useStoryContext !== false,
        storyContextTurns: clampStoryContextTurns(src.storyContextTurns),
        promptTemplateName: String(src.promptTemplateName || '').trim(),
        apiPresetName: String(src.apiPresetName || '').trim(),
    };
}

export function renderApiPromptConfigPage(ctx) {
    const {
        container,
        state,
        render,
        rerenderApiPromptConfigKeepScroll,
        getDbConfigApiAvailability,
        getApiPresets,
        getTableApiPreset,
        setTableApiPreset,
        getPlotApiPreset,
        setPlotApiPreset,
        getPromptTemplates,
        deletePromptTemplate,
    } = ctx;

    const saveNormalizedPhoneChatConfig = (patch = {}) => {
        const current = normalizePhoneChatConfig(getPhoneSettings()?.phoneChat);
        const next = normalizePhoneChatConfig({ ...current, ...patch });
        savePhoneSetting('phoneChat', next);
        return next;
    };

    const saveNormalizedWorldbookSelection = (selection) => {
        const next = normalizeWorldbookSelection(selection);
        savePhoneSetting('worldbookSelection', next);
        return next;
    };

    const renderWorldbookEntriesList = () => {
        const entriesContainer = container.querySelector('#phone-worldbook-entries');
        if (!entriesContainer) return;

        const sourceMode = String(state.worldbookSourceMode || 'manual');
        const filteredEntries = filterEntries(state.worldbookEntries, state.worldbookSearchQuery);
        const currentWorldbook = String(state.currentWorldbook || '').trim();
        const boundWorldbookNames = Array.isArray(state.boundWorldbookNames) ? state.boundWorldbookNames : [];

        if (sourceMode === 'off') {
            entriesContainer.innerHTML = '<div class="phone-worldbook-empty">已关闭世界书读取</div>';
            updateWorldbookStatus();
            return;
        }

        if (state.worldbookLoading) {
            entriesContainer.innerHTML = '<div class="phone-worldbook-loading">加载中...</div>';
            return;
        }

        if (state.worldbookError) {
            entriesContainer.innerHTML = `<div class="phone-worldbook-error">${escapeHtml(state.worldbookError)}</div>`;
            return;
        }

        if (sourceMode === 'manual' && !currentWorldbook) {
            entriesContainer.innerHTML = '<div class="phone-worldbook-empty">请先选择世界书</div>';
            updateWorldbookStatus();
            return;
        }

        if (sourceMode === 'character_bound' && boundWorldbookNames.length === 0) {
            entriesContainer.innerHTML = '<div class="phone-worldbook-empty">当前角色未绑定世界书</div>';
            updateWorldbookStatus();
            return;
        }

        if (filteredEntries.length === 0) {
            if (state.worldbookSearchQuery) {
                entriesContainer.innerHTML = '<div class="phone-worldbook-empty">未找到匹配的条目</div>';
            } else {
                entriesContainer.innerHTML = '<div class="phone-worldbook-empty">该模式下暂无可用条目</div>';
            }
            updateWorldbookStatus();
            return;
        }

        let selectedCount = 0;
        let enabledCount = 0;

        const entriesHtml = filteredEntries.map(entry => {
            const uid = entry.uid;
            const name = entry.name || `条目 ${uid}`;
            const enabled = entry.enabled !== false;
            const sourceWorldbook = String(entry.__worldbookName || currentWorldbook || '').trim();
            const checked = sourceWorldbook ? getEntrySelectionState(sourceWorldbook, uid, sourceMode) : false;

            if (enabled) {
                enabledCount++;
                if (checked) selectedCount++;
            }

            const disabledClass = enabled ? '' : 'is-disabled';
            const worldbookMeta = sourceMode === 'character_bound' && sourceWorldbook
                ? `<span class="phone-worldbook-entry-meta">${escapeHtml(sourceWorldbook)}</span>`
                : '';

            return `
                <div class="phone-worldbook-entry ${disabledClass}" data-uid="${uid}" data-worldbook="${escapeHtmlAttr(sourceWorldbook)}">
                    <label class="phone-worldbook-entry-label">
                        <input type="checkbox" class="phone-worldbook-entry-checkbox"
                            data-uid="${uid}" data-worldbook="${escapeHtmlAttr(sourceWorldbook)}" ${enabled ? '' : 'disabled'} ${checked ? 'checked' : ''}>
                        <span class="phone-worldbook-entry-name">${escapeHtml(name)}</span>
                        ${worldbookMeta}
                    </label>
                </div>
            `;
        }).join('');

        entriesContainer.innerHTML = entriesHtml;

        entriesContainer.querySelectorAll('.phone-worldbook-entry-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const target = e.target;
                const uid = parseInt(target.dataset.uid, 10);
                const worldbookName = String(target.dataset.worldbook || '').trim();
                const checked = !!target.checked;
                if (!worldbookName || Number.isNaN(uid)) return;
                setEntrySelectionState(worldbookName, uid, checked, { sourceMode });
                updateWorldbookStatus();
            });
        });

        updateWorldbookStatus();
    };

    const updateWorldbookStatus = () => {
        const statusEl = container.querySelector('#phone-worldbook-status-text');
        if (!statusEl) return;

        const sourceMode = String(state.worldbookSourceMode || 'manual');
        const filteredEntries = filterEntries(state.worldbookEntries, state.worldbookSearchQuery);
        const currentWorldbook = String(state.currentWorldbook || '').trim();
        const boundWorldbookNames = Array.isArray(state.boundWorldbookNames) ? state.boundWorldbookNames : [];

        if (sourceMode === 'off') {
            statusEl.textContent = '当前已关闭世界书读取';
            return;
        }

        if (sourceMode === 'manual' && !currentWorldbook) {
            statusEl.textContent = '请先选择世界书';
            return;
        }

        if (sourceMode === 'character_bound' && boundWorldbookNames.length === 0) {
            statusEl.textContent = '当前角色未绑定世界书';
            return;
        }

        let selectedCount = 0;
        let enabledCount = 0;
        let disabledCount = 0;

        filteredEntries.forEach(entry => {
            const worldbookName = String(entry.__worldbookName || currentWorldbook || '').trim();
            if (entry.enabled !== false) {
                enabledCount++;
                if (worldbookName && getEntrySelectionState(worldbookName, entry.uid, sourceMode)) {
                    selectedCount++;
                }
            } else {
                disabledCount++;
            }
        });

        let statusText = `已选择: ${selectedCount}/${enabledCount} 条目`;
        if (sourceMode === 'character_bound' && boundWorldbookNames.length > 0) {
            statusText += ` · 来源: ${boundWorldbookNames.join('、')}`;
        }
        if (disabledCount > 0) {
            statusText += ` (禁用: ${disabledCount})`;
        }
        statusEl.textContent = statusText;
    };

    const setFilteredEntriesSelectionState = (selected) => {
        const sourceMode = String(state.worldbookSourceMode || 'manual');
        if (sourceMode === 'off') return false;

        const filteredEntries = filterEntries(state.worldbookEntries, state.worldbookSearchQuery);
        const currentWorldbook = String(state.currentWorldbook || '').trim();
        let selection = normalizeWorldbookSelection(getCurrentWorldbookSelection());

        filteredEntries.forEach(entry => {
            if (entry.enabled === false) return;
            const worldbookName = String(entry.__worldbookName || currentWorldbook || '').trim();
            if (!worldbookName) return;
            selection = applyEntrySelectionState(selection, worldbookName, entry.uid, selected, sourceMode);
        });

        if (sourceMode === 'manual' && currentWorldbook) {
            selection.selectedWorldbook = currentWorldbook;
        }
        selection.sourceMode = sourceMode;
        saveNormalizedWorldbookSelection(selection);
        renderWorldbookEntriesList();
        return true;
    };

    const selectAllEntries = () => {
        if (!setFilteredEntriesSelectionState(true)) return;
        showToast(container, '已全选可用条目');
    };

    const deselectAllEntries = () => {
        if (!setFilteredEntriesSelectionState(false)) return;
        showToast(container, '已取消全选');
    };

    const loadWorldbookListIntoState = async () => {
        const result = await loadWorldbookList();
        state.worldbookList = Array.isArray(result.list) ? result.list : [];
        state.worldbookError = result.error || null;
    };

    const loadWorldbookEntriesIntoState = async (worldbookName) => {
        if (!worldbookName) {
            state.worldbookEntries = [];
            state.worldbookError = null;
            state.worldbookLoading = false;
            return;
        }

        state.worldbookLoading = true;
        state.worldbookError = null;

        const result = await loadWorldbookEntries(worldbookName);
        state.boundWorldbookNames = [];
        state.worldbookEntries = Array.isArray(result.entries)
            ? result.entries.map(entry => ({ ...entry, __worldbookName: worldbookName }))
            : [];
        state.worldbookError = result.error || null;
        state.worldbookLoading = false;
    };

    const loadCharacterBoundWorldbooksIntoState = async () => {
        state.worldbookLoading = true;
        state.worldbookError = null;

        const result = await loadCharacterBoundWorldbookEntries();
        state.boundWorldbookNames = Array.isArray(result.worldbooks) ? result.worldbooks : [];
        state.worldbookEntries = Array.isArray(result.entries) ? result.entries : [];
        state.worldbookError = result.error || null;
        state.worldbookLoading = false;
    };

    const refreshWorldbook = async () => {
        const refreshBtn = container.querySelector('#phone-worldbook-refresh');
        if (refreshBtn) {
            refreshBtn.disabled = true;
            refreshBtn.textContent = '刷新中...';
        }

        const sourceMode = String(state.worldbookSourceMode || 'manual');
        await loadWorldbookListIntoState();

        if (sourceMode === 'character_bound') {
            await loadCharacterBoundWorldbooksIntoState();
        } else if (sourceMode === 'manual' && state.currentWorldbook) {
            await loadWorldbookEntriesIntoState(state.currentWorldbook);
        } else if (sourceMode === 'off') {
            state.boundWorldbookNames = [];
            state.worldbookEntries = [];
            state.worldbookError = null;
            state.worldbookLoading = false;
        }

        renderWorldbookEntriesList();

        if (refreshBtn) {
            refreshBtn.disabled = sourceMode === 'off';
            refreshBtn.textContent = '刷新';
        }

        showToast(container, state.worldbookError ? '刷新失败' : '已刷新');
    };

    const settings = getPhoneSettings();
    const phoneChatConfig = normalizePhoneChatConfig(settings?.phoneChat);
    const worldbookSelection = normalizeWorldbookSelection(settings?.worldbookSelection);

    state.worldbookSourceMode = worldbookSelection.sourceMode;

    const apiAvailability = getDbConfigApiAvailability();
    const apiPresets = getApiPresets();
    const tableApiPreset = getTableApiPreset();
    const plotApiPreset = getPlotApiPreset();
    const promptTemplates = getPromptTemplates();

    const selectedTemplateName = state.apiPromptConfigSelectedTemplate
        || (promptTemplates.length > 0 ? promptTemplates[0].name : '');
    state.apiPromptConfigSelectedTemplate = selectedTemplateName;
    const selectedTemplate = promptTemplates.find(t => t.name === selectedTemplateName);

    const apiPresetOptions = [
        `<option value="" ${!tableApiPreset ? 'selected' : ''}>当前配置</option>`,
        ...apiPresets.map(preset =>
            `<option value="${escapeHtmlAttr(preset.name)}" ${preset.name === tableApiPreset ? 'selected' : ''}>${escapeHtml(preset.name)}</option>`
        ),
    ].join('');

    const plotPresetOptions = [
        `<option value="" ${!plotApiPreset ? 'selected' : ''}>当前配置</option>`,
        ...apiPresets.map(preset =>
            `<option value="${escapeHtmlAttr(preset.name)}" ${preset.name === plotApiPreset ? 'selected' : ''}>${escapeHtml(preset.name)}</option>`
        ),
    ].join('');

    const phoneChatApiPresetOptions = [
        `<option value="" ${!phoneChatConfig.apiPresetName ? 'selected' : ''}>当前配置</option>`,
        ...apiPresets.map(preset =>
            `<option value="${escapeHtmlAttr(preset.name)}" ${preset.name === phoneChatConfig.apiPresetName ? 'selected' : ''}>${escapeHtml(preset.name)}</option>`
        ),
    ].join('');

    const promptTemplateOptions = promptTemplates.length > 0
        ? promptTemplates.map(t =>
            `<option value="${escapeHtmlAttr(t.name)}" ${t.name === selectedTemplateName ? 'selected' : ''}>${escapeHtml(t.name)}</option>`
        ).join('')
        : '<option value="">暂无模板</option>';

    const getSelectedTemplateFromState = () => {
        const currentName = String(state.apiPromptConfigSelectedTemplate || '').trim();
        if (!currentName) return null;
        return getPromptTemplates().find(t => t.name === currentName) || null;
    };

    const getTemplatePreviewText = (template) => {
        if (!template) return '暂无模板';
        const content = String(template.content || '');
        return content.length > 100 ? content.substring(0, 100) + '...' : content;
    };

    const previewContent = getTemplatePreviewText(selectedTemplate);

    const worldbookOptions = state.worldbookList.length > 0
        ? [
            '<option value="">请选择世界书</option>',
            ...state.worldbookList.map(name =>
                `<option value="${escapeHtmlAttr(name)}" ${name === state.currentWorldbook ? 'selected' : ''}>${escapeHtml(name)}</option>`
            ),
        ].join('')
        : '<option value="">暂无世界书</option>';

    const worldbookSourceModeOptions = [
        { value: 'off', label: '关闭' },
        { value: 'manual', label: '手动选择' },
        { value: 'character_bound', label: '角色卡绑定' },
    ].map(item => (
        `<option value="${escapeHtmlAttr(item.value)}" ${item.value === state.worldbookSourceMode ? 'selected' : ''}>${escapeHtml(item.label)}</option>`
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
        promptTemplateOptions,
        previewContent,
        selectedTemplate,
        worldbookOptions,
        worldbookLoading: state.worldbookLoading,
        worldbookSearchQuery: state.worldbookSearchQuery,
        worldbookSourceModeOptions,
        worldbookSelectDisabled,
        worldbookSearchDisabled,
        worldbookActionDisabled,
    });

    const promptPreviewContentEl = container.querySelector('.phone-prompt-preview-content');
    const promptEditBtn = container.querySelector('#phone-prompt-edit-btn');
    const promptDeleteBtn = container.querySelector('#phone-prompt-delete-btn');
    const worldbookSourceModeSelect = container.querySelector('#phone-worldbook-source-mode');
    const worldbookSelect = container.querySelector('#phone-worldbook-select');
    const worldbookRefreshBtn = container.querySelector('#phone-worldbook-refresh');
    const worldbookSearchInput = container.querySelector('#phone-worldbook-search');
    const worldbookSelectAllBtn = container.querySelector('#phone-worldbook-select-all');
    const worldbookDeselectAllBtn = container.querySelector('#phone-worldbook-deselect-all');

    const syncPromptPreviewUi = () => {
        const activeTemplate = getSelectedTemplateFromState();
        if (promptPreviewContentEl instanceof HTMLElement) {
            promptPreviewContentEl.textContent = getTemplatePreviewText(activeTemplate);
        }
        if (promptEditBtn instanceof HTMLButtonElement) {
            promptEditBtn.disabled = !activeTemplate;
        }
        if (promptDeleteBtn instanceof HTMLButtonElement) {
            promptDeleteBtn.disabled = !activeTemplate;
        }
        return activeTemplate;
    };

    const syncWorldbookControlStates = () => {
        const sourceMode = String(state.worldbookSourceMode || 'manual');
        const selectDisabled = sourceMode !== 'manual';
        const actionDisabled = sourceMode === 'off';

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

    if (phoneChatStoryContextTurnsInput) {
        phoneChatStoryContextTurnsInput.addEventListener('change', () => {
            const nextTurns = clampStoryContextTurns(phoneChatStoryContextTurnsInput.value);
            phoneChatStoryContextTurnsInput.value = String(nextTurns);
            saveNormalizedPhoneChatConfig({ storyContextTurns: nextTurns });
            showToast(container, `AI上下文轮数已设置为 ${nextTurns}`);
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

    const promptSelect = container.querySelector('#phone-prompt-template-select');
    if (promptSelect) {
        promptSelect.addEventListener('change', () => {
            const value = String(promptSelect.value || '');
            state.apiPromptConfigSelectedTemplate = value;
            syncPromptPreviewUi();
        });
    }

    container.querySelector('#phone-prompt-new-btn')?.addEventListener('click', () => {
        state.promptEditorName = '';
        state.promptEditorContent = '';
        state.promptEditorIsNew = true;
        state.promptEditorOriginalName = '';
        state.mode = 'prompt_editor';
        render();
    });

    container.querySelector('#phone-prompt-edit-btn')?.addEventListener('click', () => {
        const activeTemplate = getSelectedTemplateFromState();
        if (!activeTemplate) return;
        state.promptEditorName = activeTemplate.name;
        state.promptEditorContent = activeTemplate.content || '';
        state.promptEditorIsNew = false;
        state.promptEditorOriginalName = activeTemplate.name;
        state.mode = 'prompt_editor';
        render();
    });

    container.querySelector('#phone-prompt-delete-btn')?.addEventListener('click', () => {
        const activeTemplate = getSelectedTemplateFromState();
        if (!activeTemplate) return;
        showConfirmDialog(
            container,
            '确认删除',
            `确定要删除模板「${activeTemplate.name}」吗？此操作无法撤销。`,
            () => {
                const success = deletePromptTemplate(activeTemplate.name);
                if (success) {
                    state.apiPromptConfigSelectedTemplate = '';
                    showToast(container, '模板已删除');
                    rerenderApiPromptConfigKeepScroll();
                } else {
                    showToast(container, '删除失败', true);
                }
            },
            '删除',
            '取消'
        );
    });

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

            const searchInput = container.querySelector('#phone-worldbook-search');
            if (searchInput) {
                searchInput.value = '';
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

    const initWorldbook = async () => {
        await loadWorldbookListIntoState();

        const selection = normalizeWorldbookSelection(getCurrentWorldbookSelection());
        state.worldbookSourceMode = selection.sourceMode;
        state.boundWorldbookNames = [];

        if (state.worldbookSourceMode === 'character_bound') {
            state.currentWorldbook = '';
            await loadCharacterBoundWorldbooksIntoState();
        } else if (state.worldbookSourceMode === 'manual') {
            if (selection.selectedWorldbook && state.worldbookList.includes(selection.selectedWorldbook)) {
                state.currentWorldbook = selection.selectedWorldbook;
                await loadWorldbookEntriesIntoState(selection.selectedWorldbook);
            } else {
                state.currentWorldbook = '';
                state.worldbookEntries = [];
                state.worldbookError = null;
                state.worldbookLoading = false;
            }
        } else {
            state.currentWorldbook = '';
            state.worldbookEntries = [];
            state.worldbookError = null;
            state.worldbookLoading = false;
        }

        syncWorldbookControlStates();
        renderWorldbookEntriesList();
    };

    const handleWorldbookUpdate = async () => {
        await loadWorldbookListIntoState();

        if (state.worldbookSourceMode === 'character_bound') {
            await loadCharacterBoundWorldbooksIntoState();
        } else if (state.worldbookSourceMode === 'manual' && state.currentWorldbook) {
            await loadWorldbookEntriesIntoState(state.currentWorldbook);
        } else if (state.worldbookSourceMode === 'off') {
            state.boundWorldbookNames = [];
            state.worldbookEntries = [];
            state.worldbookError = null;
            state.worldbookLoading = false;
        }

        if (worldbookSelect) {
            const newOptions = state.worldbookList.length > 0
                ? [
                    '<option value="">请选择世界书</option>',
                    ...state.worldbookList.map(name =>
                        `<option value="${escapeHtmlAttr(name)}" ${name === state.currentWorldbook ? 'selected' : ''}>${escapeHtml(name)}</option>`
                    ),
                ].join('')
                : '<option value="">暂无世界书</option>';
            worldbookSelect.innerHTML = newOptions;
        }

        syncWorldbookControlStates();
        renderWorldbookEntriesList();
    };

    if (typeof state.worldbookEventCleanup === 'function') {
        state.worldbookEventCleanup();
        state.worldbookEventCleanup = null;
    }

    subscribeWorldbookUpdates(handleWorldbookUpdate)
        .then((cleanup) => {
            state.worldbookEventCleanup = typeof cleanup === 'function' ? cleanup : null;
        })
        .catch(() => {
            state.worldbookEventCleanup = null;
        });

    initWorldbook();
}
