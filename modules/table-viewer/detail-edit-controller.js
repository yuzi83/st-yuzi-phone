import { Logger } from '../error-handler.js';

const logger = Logger.withScope({ scope: 'table-viewer/detail-edit', feature: 'table-viewer' });
const DETAIL_CONTROLLER_CLEANUP_KEY = '__yuziGenericDetailControllerCleanup';

function cloneTableDataForSave(rawData) {
    if (!rawData || typeof rawData !== 'object') return null;

    try {
        return JSON.parse(JSON.stringify(rawData));
    } catch (error) {
        logger.warn({
            action: 'row.save.clone',
            message: '详情行保存快照深拷贝失败',
            error,
        });
        return null;
    }
}

function createDetailControllerRuntime(runtime) {
    const cleanups = [];
    const safeRuntime = runtime && typeof runtime === 'object' ? runtime : null;

    const registerLocalCleanup = (cleanup) => {
        if (typeof cleanup !== 'function') return () => {};
        cleanups.push(cleanup);
        return () => {
            const index = cleanups.indexOf(cleanup);
            if (index >= 0) cleanups.splice(index, 1);
        };
    };

    return {
        addEventListener(target, type, handler, options) {
            if (!target || typeof target.addEventListener !== 'function' || typeof handler !== 'function') {
                return () => {};
            }
            if (safeRuntime?.addEventListener) {
                const cleanup = safeRuntime.addEventListener(target, type, handler, options);
                registerLocalCleanup(cleanup);
                return cleanup;
            }
            target.addEventListener(type, handler, options);
            const cleanup = () => target.removeEventListener(type, handler, options);
            registerLocalCleanup(cleanup);
            return cleanup;
        },
        registerCleanup(cleanup) {
            return registerLocalCleanup(cleanup);
        },
        disposeFallback() {
            cleanups.splice(0).forEach((cleanup) => {
                try { cleanup(); } catch {}
            });
        },
    };
}

export function bindGenericDetailEditController(options = {}) {
    const {
        container,
        state,
        rowLocked,
        rowIndexForLock,
        sheetKey,
        rawHeaders,
        rows,
        shouldHideLeadingPlaceholder,
        toLockColIndex,
        render,
        restoreListScroll,
        renderKeepScroll,
        getTableLockState,
        isTableRowLocked,
        toggleTableCellLock,
        isTableCellLocked,
        getTableData,
        saveTableData,
        showInlineToast,
        runtime,
    } = options;

    if (!(container instanceof HTMLElement) || !state) return;

    const containerAny = /** @type {any} */ (container);
    if (typeof containerAny[DETAIL_CONTROLLER_CLEANUP_KEY] === 'function') {
        containerAny[DETAIL_CONTROLLER_CLEANUP_KEY]();
    }

    const controllerRuntime = createDetailControllerRuntime(runtime);
    const isViewerActive = () => !(runtime && typeof runtime.isDisposed === 'function' && runtime.isDisposed());
    let disposed = false;
    const cleanupController = () => {
        if (disposed) return;
        disposed = true;
        controllerRuntime.disposeFallback?.();
        if (containerAny[DETAIL_CONTROLLER_CLEANUP_KEY] === cleanupController) {
            delete containerAny[DETAIL_CONTROLLER_CLEANUP_KEY];
        }
    };
    containerAny[DETAIL_CONTROLLER_CLEANUP_KEY] = cleanupController;

    container.querySelectorAll('[data-input-col]').forEach((inputNode) => {
        const inputEl = /** @type {HTMLTextAreaElement} */ (inputNode);
        resizeTextarea(inputEl);
    });

    controllerRuntime.addEventListener(container, 'click', async (event) => {
        const target = event.target instanceof HTMLElement ? event.target : null;
        if (!target) return;

        if (target.closest('.phone-nav-back')) {
            state.returnToListMode();
            if (typeof render === 'function') {
                render();
            }
            if (typeof restoreListScroll === 'function') {
                restoreListScroll();
            }
            return;
        }

        if (target.closest('#phone-toggle-edit-mode')) {
            if (rowLocked && !state.editMode) {
                showInlineToast(container, '当前条目已锁定，无法编辑');
                return;
            }
            state.setEditMode(!state.editMode);
            renderKeepScroll();
            return;
        }

        if (target.closest('#phone-cell-lock-mode-btn')) {
            state.setCellLockManageMode(!state.cellLockManageMode);
            renderKeepScroll();
            return;
        }

        const cellLockEl = target.closest('[data-cell-lock]');
        if (cellLockEl instanceof HTMLElement && container.contains(cellLockEl)) {
            event.preventDefault();
            event.stopPropagation();
            handleToggleCellLock(cellLockEl);
            return;
        }

        if (target.closest('#phone-save-row')) {
            await handleSaveRow();
            return;
        }

        const pagerEl = target.closest('[data-pager]');
        if (pagerEl instanceof HTMLElement && container.contains(pagerEl)) {
            event.preventDefault();
            event.stopPropagation();
            handleNavigateSibling(pagerEl);
        }
    });

    controllerRuntime.addEventListener(container, 'input', (event) => {
        const inputEl = event.target instanceof HTMLTextAreaElement ? event.target : null;
        if (!(inputEl instanceof HTMLTextAreaElement)) return;
        if (!inputEl.matches('[data-input-col]')) return;

        const colIndex = Number(inputEl.getAttribute('data-input-col'));
        if (Number.isNaN(colIndex)) return;
        state.updateDraftValue(colIndex, inputEl.value);
        resizeTextarea(inputEl);
    });

    controllerRuntime.registerCleanup?.(() => {
        controllerRuntime.disposeFallback?.();
    });

    function handleToggleCellLock(el) {
        const lockColIndex = Number(el.getAttribute('data-cell-lock'));
        const rawColIndex = Number(el.getAttribute('data-cell-raw'));
        if (Number.isNaN(lockColIndex) || lockColIndex < 0) return;

        if (isTableRowLocked(sheetKey, rowIndexForLock)) {
            showInlineToast(container, '当前条目已锁定，无法切换字段锁');
            return;
        }

        const nextLocked = toggleTableCellLock(sheetKey, rowIndexForLock, lockColIndex);

        state.syncLockState(getTableLockState(sheetKey));
        if (nextLocked && state.editMode && Number.isInteger(rawColIndex)) {
            state.removeDraftValue(rawColIndex);
        }
        showInlineToast(container, nextLocked ? '字段已锁定' : '字段已解锁');
        renderKeepScroll();
    }

    function handleNavigateSibling(el) {
        if (state.saving || !Array.isArray(rows) || rows.length <= 1) return;

        const targetRowIndex = Number(el.getAttribute('data-target-row-index'));
        if (!Number.isInteger(targetRowIndex) || targetRowIndex < 0 || targetRowIndex >= rows.length) {
            return;
        }

        if (state.cellLockManageMode) {
            state.setCellLockManageMode(false);
        }
        if (state.editMode) {
            state.setEditMode(false);
        }

        state.set('rowIndex', targetRowIndex);
        if (typeof render === 'function') {
            render();
        }
    }

    async function handleSaveRow() {
        if (!state.editMode || state.saving || rowLocked) return;

        const saveRowIndex = Number(state.rowIndex);
        state.setSaving(true);
        renderKeepScroll();

        try {
            if (!Number.isInteger(saveRowIndex) || saveRowIndex < 0) {
                showInlineToast(container, '保存失败：行索引无效');
                return;
            }

            const dataRowIndex = saveRowIndex + 1;
            const updateData = {};
            let hasChanges = false;

            Object.entries(state.draftValues).forEach(([colKey, draft]) => {
                const rawColIndex = Number(colKey);
                if (Number.isNaN(rawColIndex)) return;

                if (shouldHideLeadingPlaceholder && rawColIndex === 0) return;

                const lockColIndex = toLockColIndex(rawColIndex);
                if (lockColIndex < 0) return;
                if (isTableCellLocked(sheetKey, rowIndexForLock, lockColIndex)) return;

                const header = rawHeaders[rawColIndex];
                if (header !== undefined && header !== null) {
                    updateData[String(header)] = draft;
                    hasChanges = true;
                }
            });

            if (!hasChanges) {
                showInlineToast(container, '没有需要保存的修改');
                return;
            }

            const freshData = getTableData();

            if (!freshData || !freshData[sheetKey]) {
                showInlineToast(container, '保存失败：无法获取表格数据');
                return;
            }

            const nextData = cloneTableDataForSave(freshData);
            if (!nextData) {
                showInlineToast(container, '保存失败：无法创建保存快照');
                return;
            }

            const sheetData = nextData[sheetKey];
            const content = sheetData?.content;
            if (!content || !Array.isArray(content)) {
                showInlineToast(container, '保存失败：表格内容格式错误');
                return;
            }

            if (dataRowIndex >= content.length) {
                showInlineToast(container, '保存失败：行索引超出范围');
                return;
            }

            Object.entries(updateData).forEach(([colName, value]) => {
                const colIndex = rawHeaders.findIndex(h => h === colName);
                if (colIndex >= 0) {
                    content[dataRowIndex][colIndex] = value;
                }
            });

            const success = await saveTableData(nextData);
            if (!isViewerActive()) return;

            if (success) {
                Object.entries(state.draftValues).forEach(([colKey, draft]) => {
                    const rawColIndex = Number(colKey);
                    if (!Number.isNaN(rawColIndex) && rows[saveRowIndex]) {
                        rows[saveRowIndex][rawColIndex] = draft;
                    }
                });
                state.setEditMode(false);
                showInlineToast(container, '保存成功');
            } else {
                showInlineToast(container, '保存失败：数据库写入失败');
            }
        } catch (err) {
            logger.error({
                action: 'row.save',
                message: '详情行保存异常',
                context: { sheetKey, rowIndex: saveRowIndex },
                error: err,
            });
            if (isViewerActive()) {
                showInlineToast(container, `保存异常: ${err?.message || '未知错误'}`);
            }
        } finally {
            if (isViewerActive()) {
                state.setSaving(false);
                renderKeepScroll();
            }
        }
    }
}

function resizeTextarea(inputEl) {
    if (!(inputEl instanceof HTMLTextAreaElement)) return;
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.max(inputEl.scrollHeight, 32) + 'px';
}
