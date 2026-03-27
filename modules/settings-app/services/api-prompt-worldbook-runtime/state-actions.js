import { escapeHtml, escapeHtmlAttr } from '../../../utils.js';
import {
    applyEntrySelectionState,
    filterEntries,
    getCurrentWorldbookSelection,
    loadCharacterBoundWorldbookEntries,
    loadWorldbookEntries,
    loadWorldbookList,
    normalizeWorldbookSelection,
} from '../worldbook-selection.js';

export function createWorldbookStateActions(ctx = {}) {
    const {
        container,
        state,
        showToast,
        saveNormalizedWorldbookSelection,
        renderWorldbookEntriesList,
    } = ctx;

    const setFilteredEntriesSelectionState = (selected) => {
        const sourceMode = String(state.worldbookSourceMode || 'manual');
        if (sourceMode === 'off') return false;

        const filteredEntries = filterEntries(state.worldbookEntries, state.worldbookSearchQuery);
        const currentWorldbook = String(state.currentWorldbook || '').trim();
        let selection = normalizeWorldbookSelection(getCurrentWorldbookSelection());

        filteredEntries.forEach((entry) => {
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
            ? result.entries.map((entry) => ({ ...entry, __worldbookName: worldbookName }))
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
        if (refreshBtn instanceof HTMLButtonElement) {
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

        if (refreshBtn instanceof HTMLButtonElement) {
            refreshBtn.disabled = sourceMode === 'off';
            refreshBtn.textContent = '刷新';
        }

        showToast(container, state.worldbookError ? '刷新失败' : '已刷新');
    };

    const initWorldbook = async (syncWorldbookControlStates) => {
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

    const handleWorldbookUpdate = async ({ worldbookSelect, syncWorldbookControlStates } = {}) => {
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

        if (worldbookSelect instanceof HTMLSelectElement) {
            const newOptions = state.worldbookList.length > 0
                ? [
                    '<option value="">请选择世界书</option>',
                    ...state.worldbookList.map((name) =>
                        `<option value="${escapeHtmlAttr(name)}" ${name === state.currentWorldbook ? 'selected' : ''}>${escapeHtml(name)}</option>`
                    ),
                ].join('')
                : '<option value="">暂无世界书</option>';
            worldbookSelect.innerHTML = newOptions;
        }

        syncWorldbookControlStates();
        renderWorldbookEntriesList();
    };

    return {
        selectAllEntries,
        deselectAllEntries,
        loadWorldbookEntriesIntoState,
        refreshWorldbook,
        initWorldbook,
        handleWorldbookUpdate,
    };
}
