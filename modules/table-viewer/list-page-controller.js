import { Logger } from '../error-handler.js';

const logger = Logger.withScope({ scope: 'table-viewer/list-controller', feature: 'table-viewer' });
const GENERIC_LIST_CONTROLLER_KEY = '__stYuziGenericListController';
const GENERIC_LIST_SEARCH_BOUND_ATTR = 'genericListSearchBound';
const GENERIC_LIST_DELEGATED_BOUND_ATTR = 'genericListDelegatedBound';

function getGenericListControllerContext(container) {
    if (!(container instanceof HTMLElement)) return null;
    const context = container[GENERIC_LIST_CONTROLLER_KEY];
    return context && typeof context === 'object' ? context : null;
}

function setGenericListControllerContext(container, options = {}) {
    if (!(container instanceof HTMLElement)) return null;

    const currentContext = getGenericListControllerContext(container) || {
        delegatedBound: false,
    };
    Object.assign(currentContext, options);
    container[GENERIC_LIST_CONTROLLER_KEY] = currentContext;
    return currentContext;
}

function restoreSearchSelection(container, selectionStart = 0, selectionEnd = selectionStart) {
    if (!(container instanceof HTMLElement)) return;

    const nextInput = /** @type {HTMLInputElement | null} */ (container.querySelector('#phone-generic-list-search'));
    if (!(nextInput instanceof HTMLInputElement)) return;
    if (nextInput.disabled) return;

    if (document.activeElement !== nextInput) {
        nextInput.focus();
    }
    nextInput.setSelectionRange(selectionStart, selectionEnd);
}

function refreshVisibleList(container) {
    const context = getGenericListControllerContext(container);
    if (!context) return;

    if (typeof context.refreshListRegions === 'function') {
        context.refreshListRegions();
        return;
    }
    if (typeof context.renderKeepScroll === 'function') {
        context.renderKeepScroll();
        return;
    }
    if (typeof context.render === 'function') {
        context.render();
    }
}

function refreshListAfterDataMutation(container) {
    const context = getGenericListControllerContext(container);
    if (!context) return;

    if (typeof context.refreshListAfterDataMutation === 'function') {
        context.refreshListAfterDataMutation();
        return;
    }

    refreshVisibleList(container);
}

function isRuntimeDisposed(runtime) {
    return !!(runtime && typeof runtime.isDisposed === 'function' && runtime.isDisposed());
}

function isGenericListContextActive(context) {
    return !!context && !isRuntimeDisposed(context.runtime);
}

function bindSearchInput(container) {
    const context = getGenericListControllerContext(container);
    if (!(container instanceof HTMLElement) || !context?.state) return;

    const searchInput = /** @type {HTMLInputElement | null} */ (container.querySelector('#phone-generic-list-search'));
    if (!(searchInput instanceof HTMLInputElement)) return;
    if (searchInput.dataset[GENERIC_LIST_SEARCH_BOUND_ATTR] === '1') return;

    searchInput.dataset[GENERIC_LIST_SEARCH_BOUND_ATTR] = '1';
    let isSearchComposing = false;

    const applySearchQuery = (nextValue, selectionStart = nextValue.length, selectionEnd = nextValue.length) => {
        const nextContext = getGenericListControllerContext(container);
        if (!nextContext?.state) return;

        const searchWasActive = document.activeElement === searchInput;
        nextContext.state.set('listSearchQuery', nextValue);

        if (!searchWasActive) return;

        const nextInput = /** @type {HTMLInputElement | null} */ (container.querySelector('#phone-generic-list-search'));
        if (!(nextInput instanceof HTMLInputElement)) return;
        if (nextInput.disabled) return;

        const nextSelectionStart = nextInput.selectionStart ?? nextValue.length;
        const nextSelectionEnd = nextInput.selectionEnd ?? nextValue.length;
        const selectionAlreadySynced = document.activeElement === nextInput
            && nextSelectionStart === selectionStart
            && nextSelectionEnd === selectionEnd;

        if (!selectionAlreadySynced) {
            restoreSearchSelection(container, selectionStart, selectionEnd);
        }
    };

    const addListener = typeof context.runtime?.addEventListener === 'function'
        ? (...args) => context.runtime.addEventListener(...args)
        : (target, type, handler, options) => {
            target.addEventListener(type, handler, options);
            return () => target.removeEventListener(type, handler, options);
        };

    const cleanupFns = [];
    cleanupFns.push(addListener(searchInput, 'compositionstart', () => {
        isSearchComposing = true;
    }));

    cleanupFns.push(addListener(searchInput, 'compositionend', () => {
        isSearchComposing = false;
        const nextValue = searchInput.value;
        applySearchQuery(nextValue, nextValue.length, nextValue.length);
    }));

    cleanupFns.push(addListener(searchInput, 'input', (ev) => {
        const nextValue = searchInput.value;
        const selectionStart = searchInput.selectionStart ?? nextValue.length;
        const selectionEnd = searchInput.selectionEnd ?? nextValue.length;
        const nativeEvent = /** @type {{ isComposing?: boolean } | undefined} */ (ev);
        if (nativeEvent?.isComposing || isSearchComposing) {
            return;
        }
        applySearchQuery(nextValue, selectionStart, selectionEnd);
    }));

    const cleanupSearch = () => {
        cleanupFns.splice(0).forEach((cleanup) => {
            try { cleanup?.(); } catch {}
        });
        delete searchInput.dataset[GENERIC_LIST_SEARCH_BOUND_ATTR];
    };
    context.runtime?.registerCleanup?.(cleanupSearch);
}

function openRowDetail(container, rowIndex) {
    const context = getGenericListControllerContext(container);
    if (!context?.state) return;
    if (!Number.isInteger(rowIndex) || rowIndex < 0) {
        logger.warn({
            action: 'row.open.skip',
            message: '打开详情跳过：行索引无效',
            context: { rowIndex },
        });
        return;
    }
    if (context.state.lockManageMode || context.state.deleteManageMode) return;
    context.captureListScroll();
    context.state.enterDetailMode(rowIndex);
    context.render();
}

function handleToggleRowLock(container, el) {
    const context = getGenericListControllerContext(container);
    if (!context?.state) return;

    const idx = Number(el.getAttribute('data-row-lock'));
    if (Number.isNaN(idx)) {
        logger.warn({
            action: 'row-lock.skip',
            message: '行锁切换跳过：行索引无效',
            context: { rawIndex: el.getAttribute('data-row-lock') },
        });
        return;
    }

    const nextLocked = context.toggleTableRowLock(context.sheetKey, idx);
    context.state.syncLockState(context.getTableLockState(context.sheetKey));
    context.showInlineToast(container, nextLocked ? '条目已锁定' : '条目已解锁');
}

function normalizeDeleteOutcome(result) {
    if (result && typeof result === 'object') {
        return {
            ok: !!result.ok,
            deleted: !!result.deleted,
            message: String(result.message || ''),
            refreshed: result.refreshed ?? null,
            viewSynced: result.viewSynced ?? null,
        };
    }

    return {
        ok: !!result,
        deleted: !!result,
        message: result ? '删除成功' : '',
        refreshed: null,
        viewSynced: null,
    };
}

async function handleDeleteRow(container, el) {
    const context = getGenericListControllerContext(container);
    if (!context?.state) return;
    if (context.state.deletingRowIndex >= 0) {
        logger.warn({
            action: 'row.delete.skip',
            message: '删除跳过：已有删除进行中',
            context: {
                sheetKey: String(context.sheetKey || ''),
                deletingRowIndex: context.state.deletingRowIndex,
            },
        });
        return;
    }

    const idx = Number(el.getAttribute('data-row-delete'));
    if (Number.isNaN(idx)) {
        logger.warn({
            action: 'row.delete.skip',
            message: '删除跳过：行索引无效',
            context: {
                sheetKey: String(context.sheetKey || ''),
                rawIndex: el.getAttribute('data-row-delete'),
            },
        });
        return;
    }

    if (context.isTableRowLocked(context.sheetKey, idx)) {
        context.showInlineToast(container, '删除失败：条目已锁定', true);
        return;
    }

    context.state.set('deletingRowIndex', idx);
    if (typeof context.setSuppressExternalTableUpdate === 'function') {
        context.setSuppressExternalTableUpdate(true);
    }

    let deleteOutcome = normalizeDeleteOutcome(false);

    try {
        deleteOutcome = normalizeDeleteOutcome(await context.deleteRowFromList(idx));
        if (deleteOutcome.deleted && isGenericListContextActive(context)) {
            const toastMessage = deleteOutcome.message || '删除成功';
            const toastIsError = deleteOutcome.refreshed === false || deleteOutcome.viewSynced === false;
            context.showInlineToast(container, toastMessage, toastIsError);
        }
    } catch (err) {
        logger.warn({
            action: 'row.delete.exception',
            message: '列表行删除异常',
            context: {
                sheetKey: String(context.sheetKey || ''),
                rowIndex: idx,
                active: isGenericListContextActive(context),
            },
            error: err,
        });
        if (isGenericListContextActive(context)) {
            context.showInlineToast(container, `删除异常: ${err?.message || '未知错误'}`, true);
        }
    } finally {
        const nextContext = getGenericListControllerContext(container);
        if (!nextContext?.state) return;

        if (typeof nextContext.setSuppressExternalTableUpdate === 'function') {
            nextContext.setSuppressExternalTableUpdate(false);
        }
        if (!isGenericListContextActive(nextContext)) return;

        nextContext.state.batchUpdate({
            deletingRowIndex: -1,
            lockState: nextContext.getTableLockState(nextContext.sheetKey),
        });
        if (deleteOutcome.deleted) {
            refreshListAfterDataMutation(container);
        }
    }
}

async function handleActionClick(container, actionEl) {
    const context = getGenericListControllerContext(container);
    if (!(container instanceof HTMLElement) || !context?.state) return;
    if (!(actionEl instanceof HTMLElement) || !container.contains(actionEl)) {
        return;
    }

    const action = String(actionEl.dataset.action || '').trim();
    if (!action) return;

    switch (action) {
        case 'nav-back':
            context.navigateBack();
            return;
        case 'add-row':
            context.showAddRowModal();
            return;
        case 'toggle-lock-mode':
            context.state.setLockManageMode(!context.state.lockManageMode);
            return;
        case 'toggle-delete-mode':
            context.state.setDeleteManageMode(!context.state.deleteManageMode);
            return;
        case 'toggle-sort':
            context.state.set('listSortDescending', !context.state.listSortDescending);
            return;
        case 'clear-search':
            context.state.set('listSearchQuery', '');
            restoreSearchSelection(container, 0, 0);
            return;
        case 'toggle-row-lock':
            handleToggleRowLock(container, actionEl);
            return;
        case 'delete-row':
            await handleDeleteRow(container, actionEl);
            return;
        case 'open-row':
            openRowDetail(container, Number(actionEl.dataset.rowIndex));
            return;
        default:
            return;
    }
}

export function bindGenericListPageController(options = {}) {
    const {
        container,
        state,
        sheetKey,
        navigateBack,
        captureListScroll,
        render,
        renderKeepScroll,
        refreshListRegions,
        refreshListAfterDataMutation,
        showAddRowModal,
        deleteRowFromList,
        toggleTableRowLock,
        getTableLockState,
        isTableRowLocked,
        showInlineToast,
        setSuppressExternalTableUpdate,
        runtime,
    } = options;

    if (!(container instanceof HTMLElement) || !state) return;

    const context = setGenericListControllerContext(container, {
        state,
        sheetKey,
        navigateBack,
        captureListScroll,
        render,
        renderKeepScroll,
        refreshListRegions,
        refreshListAfterDataMutation,
        showAddRowModal,
        deleteRowFromList,
        toggleTableRowLock,
        getTableLockState,
        isTableRowLocked,
        showInlineToast,
        setSuppressExternalTableUpdate,
        runtime,
    });
    if (!context) return;

    bindSearchInput(container);

    if (context.delegatedBound) {
        return;
    }

    const addContainerListener = typeof runtime?.addEventListener === 'function'
        ? (...args) => runtime.addEventListener(...args)
        : (target, type, handler, options) => {
            target.addEventListener(type, handler, options);
            return () => target.removeEventListener(type, handler, options);
        };

    const delegatedCleanupFns = [];
    delegatedCleanupFns.push(addContainerListener(container, 'click', async (event) => {
        const target = event.target instanceof HTMLElement ? event.target : null;
        if (!target) return;

        const actionEl = target.closest('[data-action]');
        if (!(actionEl instanceof HTMLElement) || !container.contains(actionEl)) {
            return;
        }

        const action = String(actionEl.dataset.action || '').trim();
        if (action === 'toggle-row-lock' || action === 'delete-row') {
            event.preventDefault();
            event.stopPropagation();
        }

        await handleActionClick(container, actionEl);
    }));

    delegatedCleanupFns.push(addContainerListener(container, 'keydown', async (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
            return;
        }

        const target = event.target instanceof HTMLElement ? event.target : null;
        if (!target) return;

        const actionEl = target.closest('[data-action="toggle-row-lock"], [data-action="delete-row"]');
        if (!(actionEl instanceof HTMLElement) || !container.contains(actionEl)) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        await handleActionClick(container, actionEl);
    }));

    context.delegatedBound = true;
    container.dataset[GENERIC_LIST_DELEGATED_BOUND_ATTR] = '1';
    runtime?.registerCleanup?.(() => {
        delegatedCleanupFns.splice(0).forEach((cleanup) => {
            try { cleanup?.(); } catch {}
        });
        const currentContext = getGenericListControllerContext(container);
        if (currentContext) {
            currentContext.delegatedBound = false;
        }
        delete container.dataset[GENERIC_LIST_DELEGATED_BOUND_ATTR];
    });
}
