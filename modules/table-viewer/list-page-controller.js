export function bindGenericListPageController(options = {}) {
    const {
        container,
        state,
        sheetKey,
        navigateBack,
        captureListScroll,
        render,
        renderKeepScroll,
        showAddRowModal,
        deleteRowFromList,
        toggleTableRowLock,
        getTableLockState,
        isTableRowLocked,
        showInlineToast,
        setSuppressExternalTableUpdate,
    } = options;

    if (!(container instanceof HTMLElement) || !state) return;

    const restoreSearchFocus = (value = '', selectionStart = value.length, selectionEnd = value.length) => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const nextInput = /** @type {HTMLInputElement | null} */ (container.querySelector('#phone-generic-list-search'));
                if (!nextInput) return;
                nextInput.focus();
                nextInput.setSelectionRange(selectionStart, selectionEnd);
            });
        });
    };

    const applySearchQuery = (nextValue, selectionStart = nextValue.length, selectionEnd = nextValue.length) => {
        state.listSearchQuery = nextValue;
        renderKeepScroll();
        restoreSearchFocus(nextValue, selectionStart, selectionEnd);
    };

    container.querySelector('.phone-nav-back')?.addEventListener('click', navigateBack);

    container.querySelector('#phone-list-add-btn')?.addEventListener('click', () => {
        showAddRowModal();
    });

    container.querySelector('#phone-list-lock-btn')?.addEventListener('click', () => {
        state.lockManageMode = !state.lockManageMode;
        if (state.lockManageMode) {
            state.deleteManageMode = false;
        }
        renderKeepScroll();
    });

    container.querySelector('#phone-list-delete-btn')?.addEventListener('click', () => {
        state.deleteManageMode = !state.deleteManageMode;
        if (state.deleteManageMode) {
            state.lockManageMode = false;
        }
        renderKeepScroll();
    });

    container.querySelector('[data-clear-search]')?.addEventListener('click', () => {
        applySearchQuery('', 0, 0);
    });

    container.querySelector('[data-empty-action="add"]')?.addEventListener('click', () => {
        showAddRowModal();
    });

    container.querySelector('[data-empty-action="clear-search"]')?.addEventListener('click', () => {
        applySearchQuery('', 0, 0);
    });

    const searchInput = /** @type {HTMLInputElement | null} */ (container.querySelector('#phone-generic-list-search'));
    let isSearchComposing = false;

    searchInput?.addEventListener('compositionstart', () => {
        isSearchComposing = true;
    });

    searchInput?.addEventListener('compositionend', () => {
        isSearchComposing = false;
        const nextValue = searchInput.value;
        applySearchQuery(nextValue, nextValue.length, nextValue.length);
    });

    searchInput?.addEventListener('input', (ev) => {
        const nextValue = searchInput.value;
        const selectionStart = searchInput.selectionStart ?? nextValue.length;
        const selectionEnd = searchInput.selectionEnd ?? nextValue.length;
        const nativeEvent = /** @type {{ isComposing?: boolean } | undefined} */ (ev);
        if (nativeEvent?.isComposing || isSearchComposing) {
            return;
        }
        applySearchQuery(nextValue, selectionStart, selectionEnd);
    });

    const updateDeleteManageRowUi = () => {
        container.querySelectorAll('[data-row-delete]').forEach((chipNode) => {
            const chip = /** @type {HTMLElement} */ (chipNode);
            const idx = Number(chip.getAttribute('data-row-delete'));
            if (Number.isNaN(idx)) return;

            const rowLocked = isTableRowLocked(sheetKey, idx);
            const deletingCurrent = state.deletingRowIndex === idx;
            const deleteDisabled = rowLocked || state.deletingRowIndex >= 0;

            chip.classList.toggle('locked', rowLocked);
            chip.classList.toggle('pending', deletingCurrent);
            chip.classList.toggle('disabled', deleteDisabled);
            chip.setAttribute('aria-disabled', deleteDisabled ? 'true' : 'false');
            chip.textContent = rowLocked ? '已锁定' : (deletingCurrent ? '删除中...' : '删除');
        });
    };

    const bindToggleRowLock = (el) => {
        el.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const idx = Number(el.getAttribute('data-row-lock'));
            if (Number.isNaN(idx)) return;

            const nextLocked = toggleTableRowLock(sheetKey, idx);
            state.lockState = getTableLockState(sheetKey);
            showInlineToast(container, nextLocked ? '条目已锁定' : '条目已解锁');
            renderKeepScroll();
        });

        el.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                el.click();
            }
        });
    };

    const bindDeleteRow = (el) => {
        el.addEventListener('click', async (ev) => {
            ev.preventDefault();
            ev.stopPropagation();

            if (state.deletingRowIndex >= 0) return;

            const idx = Number(el.getAttribute('data-row-delete'));
            if (Number.isNaN(idx)) return;

            if (isTableRowLocked(sheetKey, idx)) {
                showInlineToast(container, '删除失败：条目已锁定');
                return;
            }

            state.deletingRowIndex = idx;
            if (typeof setSuppressExternalTableUpdate === 'function') {
                setSuppressExternalTableUpdate(true);
            }
            updateDeleteManageRowUi();

            try {
                const ok = await deleteRowFromList(idx);
                if (ok) {
                    showInlineToast(container, '删除成功');
                }
            } catch (err) {
                showInlineToast(container, `删除异常: ${err?.message || '未知错误'}`);
            } finally {
                if (typeof setSuppressExternalTableUpdate === 'function') {
                    setSuppressExternalTableUpdate(false);
                }
                state.deletingRowIndex = -1;
                state.lockState = getTableLockState(sheetKey);
                renderKeepScroll();
            }
        });

        el.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                el.click();
            }
        });
    };

    container.querySelectorAll('[data-row-lock]').forEach((node) => {
        bindToggleRowLock(/** @type {HTMLElement} */ (node));
    });
    container.querySelectorAll('[data-row-delete]').forEach((node) => {
        bindDeleteRow(/** @type {HTMLElement} */ (node));
    });

    container.querySelectorAll('.phone-nav-list-item').forEach((btnNode) => {
        const btn = /** @type {HTMLElement} */ (btnNode);
        btn.addEventListener('click', () => {
            const idx = Number(btn.dataset.rowIndex);
            if (Number.isNaN(idx)) return;

            if (state.lockManageMode || state.deleteManageMode) return;

            captureListScroll();
            state.mode = 'detail';
            state.rowIndex = idx;
            state.editMode = false;
            state.draftValues = {};
            render();
        });
    });
}
