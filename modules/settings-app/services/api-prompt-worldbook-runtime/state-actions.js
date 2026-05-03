import { escapeHtml, escapeHtmlAttr } from '../../../utils/dom-escape.js';
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
        pageRuntime,
        showToast,
        saveNormalizedWorldbookSelection,
        renderWorldbookEntriesList,
    } = ctx;

    const runtime = pageRuntime && typeof pageRuntime === 'object' ? pageRuntime : null;
    let disposed = false;
    let operationToken = 0;
    let refreshUiToken = 0;

    const isRuntimeDisposed = () => disposed || !!(runtime
        && typeof runtime.isDisposed === 'function'
        && runtime.isDisposed());

    const invalidateWorldbookRequests = (options = {}) => {
        operationToken += 1;
        if (options?.invalidateRefreshUi === true) {
            refreshUiToken += 1;
        }
        return operationToken;
    };

    const createOperationToken = () => {
        operationToken += 1;
        return operationToken;
    };

    const resolveOperationToken = (token) => (
        Number.isInteger(token) && token > 0 ? token : createOperationToken()
    );

    const isOperationActive = (token) => (
        Number.isInteger(token)
        && token === operationToken
        && !isRuntimeDisposed()
    );

    const createRefreshUiToken = () => {
        refreshUiToken += 1;
        return refreshUiToken;
    };

    const isRefreshUiActive = (token) => (
        Number.isInteger(token)
        && token === refreshUiToken
        && !isRuntimeDisposed()
    );

    if (runtime && typeof runtime.registerCleanup === 'function') {
        runtime.registerCleanup(() => {
            disposed = true;
            invalidateWorldbookRequests({ invalidateRefreshUi: true });
        });
    }

    const setFilteredEntriesSelectionState = (selected) => {
        if (isRuntimeDisposed()) return false;

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

    const loadWorldbookListIntoState = async (token = null) => {
        const currentToken = resolveOperationToken(token);
        const result = await loadWorldbookList();
        if (!isOperationActive(currentToken)) return false;

        state.worldbookList = Array.isArray(result.list) ? result.list : [];
        state.worldbookError = result.error || null;
        return true;
    };

    const loadWorldbookEntriesIntoState = async (worldbookName, token = null) => {
        const currentToken = resolveOperationToken(token);
        if (!isOperationActive(currentToken)) return false;

        if (!worldbookName) {
            state.worldbookEntries = [];
            state.worldbookError = null;
            state.worldbookLoading = false;
            return true;
        }

        state.worldbookLoading = true;
        state.worldbookError = null;

        const result = await loadWorldbookEntries(worldbookName);
        if (!isOperationActive(currentToken)) return false;

        state.boundWorldbookNames = [];
        state.worldbookEntries = Array.isArray(result.entries)
            ? result.entries.map((entry) => ({ ...entry, __worldbookName: worldbookName }))
            : [];
        state.worldbookError = result.error || null;
        state.worldbookLoading = false;
        return true;
    };

    const loadCharacterBoundWorldbooksIntoState = async (token = null) => {
        const currentToken = resolveOperationToken(token);
        if (!isOperationActive(currentToken)) return false;

        state.worldbookLoading = true;
        state.worldbookError = null;

        const result = await loadCharacterBoundWorldbookEntries();
        if (!isOperationActive(currentToken)) return false;

        state.boundWorldbookNames = Array.isArray(result.worldbooks) ? result.worldbooks : [];
        state.worldbookEntries = Array.isArray(result.entries) ? result.entries : [];
        state.worldbookError = result.error || null;
        state.worldbookLoading = false;
        return true;
    };

    const refreshWorldbook = async () => {
        const currentToken = createOperationToken();
        const currentRefreshUiToken = createRefreshUiToken();
        const refreshBtn = container.querySelector('#phone-worldbook-refresh');
        if (isOperationActive(currentToken) && refreshBtn instanceof HTMLButtonElement) {
            refreshBtn.disabled = true;
            refreshBtn.textContent = '刷新中...';
        }

        try {
            const sourceMode = String(state.worldbookSourceMode || 'manual');
            if (!await loadWorldbookListIntoState(currentToken)) return false;

            if (sourceMode === 'character_bound') {
                if (!await loadCharacterBoundWorldbooksIntoState(currentToken)) return false;
            } else if (sourceMode === 'manual' && state.currentWorldbook) {
                if (!await loadWorldbookEntriesIntoState(state.currentWorldbook, currentToken)) return false;
            } else if (sourceMode === 'off') {
                if (!isOperationActive(currentToken)) return false;
                state.boundWorldbookNames = [];
                state.worldbookEntries = [];
                state.worldbookError = null;
                state.worldbookLoading = false;
            }

            if (!isOperationActive(currentToken)) return false;
            renderWorldbookEntriesList();
            showToast(container, state.worldbookError ? '刷新失败' : '已刷新');
            return true;
        } finally {
            if (isRefreshUiActive(currentRefreshUiToken) && refreshBtn instanceof HTMLButtonElement) {
                const currentSourceMode = String(state.worldbookSourceMode || 'manual');
                refreshBtn.disabled = currentSourceMode === 'off';
                refreshBtn.textContent = '刷新';
            }
        }
    };

    const initWorldbook = async (syncWorldbookControlStates) => {
        const currentToken = createOperationToken();
        if (!await loadWorldbookListIntoState(currentToken)) return false;

        if (!isOperationActive(currentToken)) return false;
        const selection = normalizeWorldbookSelection(getCurrentWorldbookSelection());
        state.worldbookSourceMode = selection.sourceMode;
        state.boundWorldbookNames = [];

        if (state.worldbookSourceMode === 'character_bound') {
            state.currentWorldbook = '';
            if (!await loadCharacterBoundWorldbooksIntoState(currentToken)) return false;
        } else if (state.worldbookSourceMode === 'manual') {
            if (selection.selectedWorldbook && state.worldbookList.includes(selection.selectedWorldbook)) {
                state.currentWorldbook = selection.selectedWorldbook;
                if (!await loadWorldbookEntriesIntoState(selection.selectedWorldbook, currentToken)) return false;
            } else {
                if (!isOperationActive(currentToken)) return false;
                state.currentWorldbook = '';
                state.worldbookEntries = [];
                state.worldbookError = null;
                state.worldbookLoading = false;
            }
        } else {
            if (!isOperationActive(currentToken)) return false;
            state.currentWorldbook = '';
            state.worldbookEntries = [];
            state.worldbookError = null;
            state.worldbookLoading = false;
        }

        if (!isOperationActive(currentToken)) return false;
        syncWorldbookControlStates();
        renderWorldbookEntriesList();
        return true;
    };

    const handleWorldbookUpdate = async ({ worldbookSelect, syncWorldbookControlStates } = {}) => {
        const currentToken = createOperationToken();
        if (!await loadWorldbookListIntoState(currentToken)) return false;

        if (!isOperationActive(currentToken)) return false;
        if (state.worldbookSourceMode === 'character_bound') {
            if (!await loadCharacterBoundWorldbooksIntoState(currentToken)) return false;
        } else if (state.worldbookSourceMode === 'manual' && state.currentWorldbook) {
            if (!await loadWorldbookEntriesIntoState(state.currentWorldbook, currentToken)) return false;
        } else if (state.worldbookSourceMode === 'off') {
            state.boundWorldbookNames = [];
            state.worldbookEntries = [];
            state.worldbookError = null;
            state.worldbookLoading = false;
        }

        if (!isOperationActive(currentToken)) return false;
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
        return true;
    };

    return {
        selectAllEntries,
        deselectAllEntries,
        loadWorldbookEntriesIntoState,
        refreshWorldbook,
        initWorldbook,
        handleWorldbookUpdate,
        invalidateWorldbookRequests,
    };
}
