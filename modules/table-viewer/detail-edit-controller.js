import { Logger } from '../error-handler.js';
import { findFirstEnumValidationError } from './ddl-field-metadata.js';

const logger = Logger.withScope({ scope: 'table-viewer/detail-edit', feature: 'table-viewer' });
const DETAIL_CONTROLLER_CLEANUP_KEY = '__yuziGenericDetailControllerCleanup';

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
        ddlFieldMetadata,
        shouldHideLeadingPlaceholder,
        shouldSkipColumn,
        toLockColIndex,
        render,
        restoreListScroll,
        captureDetailScroll,
        restoreDetailScroll,
        renderKeepScroll,
        getTableLockState,
        isTableRowLocked,
        toggleTableCellLock,
        isTableCellLocked,
        getLiveTableName,
        updateTableRow,
        buildMutationDiagnostics,
        syncRowsFromSheet,
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
        if (inputNode instanceof HTMLTextAreaElement) {
            resizeTextarea(inputNode);
        }
    });

    controllerRuntime.addEventListener(container, 'click', async (event) => {
        const target = event.target instanceof HTMLElement ? event.target : null;
        if (!target) return;

        const detailBackEl = target.closest('[data-action="detail-back"]');
        if (detailBackEl instanceof HTMLElement && container.contains(detailBackEl)) {
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
            handleToggleEditMode();
            return;
        }

        if (target.closest('#phone-cell-lock-mode-btn')) {
            handleToggleCellLockManageMode();
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

    controllerRuntime.addEventListener(container, 'change', (event) => {
        const inputEl = event.target instanceof HTMLSelectElement ? event.target : null;
        if (!(inputEl instanceof HTMLSelectElement)) return;
        if (!inputEl.matches('[data-input-col]')) return;

        const colIndex = Number(inputEl.getAttribute('data-input-col'));
        if (Number.isNaN(colIndex)) return;
        state.updateDraftValue(colIndex, inputEl.value);
    });

    controllerRuntime.registerCleanup?.(() => {
        controllerRuntime.disposeFallback?.();
    });

    function hasPendingExternalTableUpdate() {
        const pendingUpdate = state.pendingExternalTableUpdate;
        return !!pendingUpdate && typeof pendingUpdate === 'object' && !Array.isArray(pendingUpdate);
    }

    function consumePendingExternalTableUpdateAfterLeavingEdit() {
        const synced = typeof syncRowsFromSheet === 'function' && syncRowsFromSheet();
        if (!synced) {
            state.returnToListMode();
            renderKeepScroll();
            showInlineToast(container, '外部表更新同步失败，已返回列表', true);
            return;
        }

        state.syncLockState(getTableLockState(sheetKey));
        state.clearPendingExternalTableUpdate?.();

        const currentRowIndex = Number(state.rowIndex);
        if (!Number.isInteger(currentRowIndex) || currentRowIndex < 0 || !Array.isArray(rows[currentRowIndex])) {
            state.returnToListMode();
            renderKeepScroll();
            showInlineToast(container, '外部表更新后当前行已不存在，已返回列表', true);
            return;
        }

        renderKeepScroll();
        showInlineToast(container, '已同步外部表更新');
    }

    function handleToggleEditMode() {
        if (rowLocked && !state.editMode) {
            showInlineToast(container, '当前条目已锁定，无法编辑');
            return;
        }

        const shouldConsumePendingExternalUpdate = state.editMode && hasPendingExternalTableUpdate();
        state.setEditMode(!state.editMode);
        if (shouldConsumePendingExternalUpdate) {
            consumePendingExternalTableUpdateAfterLeavingEdit();
            return;
        }
        renderKeepScroll();
    }

    function handleToggleCellLockManageMode() {
        const shouldConsumePendingExternalUpdate = !state.cellLockManageMode && state.editMode && hasPendingExternalTableUpdate();
        state.setCellLockManageMode(!state.cellLockManageMode);
        if (shouldConsumePendingExternalUpdate) {
            consumePendingExternalTableUpdateAfterLeavingEdit();
            return;
        }
        renderKeepScroll();
    }

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

        if (typeof captureDetailScroll === 'function') {
            captureDetailScroll();
        }
        state.set('rowIndex', targetRowIndex);
        if (typeof render === 'function') {
            render();
        }
        if (typeof restoreDetailScroll === 'function') {
            restoreDetailScroll();
        }
    }

    async function handleSaveRow() {
        if (!state.editMode || state.saving || rowLocked) return;

        const saveRowIndex = Number(state.rowIndex);
        state.setSaving(true);
        renderKeepScroll();
        let suppressExternalTableUpdate = false;
        let deferredToast = null;

        try {
            if (!Number.isInteger(saveRowIndex) || saveRowIndex < 0) {
                showInlineToast(container, '保存失败：行索引无效');
                return;
            }

            const dataRowIndex = saveRowIndex + 1;
            const updateData = {};
            const changedDraftEntries = [];
            let hasChanges = false;

            Object.entries(state.draftValues).forEach(([colKey, draft]) => {
                const rawColIndex = Number(colKey);
                if (Number.isNaN(rawColIndex)) return;

                if (shouldHideLeadingPlaceholder && rawColIndex === 0) return;
                if (typeof shouldSkipColumn === 'function' && shouldSkipColumn(rawColIndex)) return;

                const lockColIndex = toLockColIndex(rawColIndex);
                if (lockColIndex < 0) return;
                if (isTableCellLocked(sheetKey, rowIndexForLock, lockColIndex)) return;

                const header = rawHeaders[rawColIndex];
                if (header !== undefined && header !== null) {
                    updateData[String(header)] = draft;
                    changedDraftEntries.push([rawColIndex, draft]);
                    hasChanges = true;
                }
            });

            if (!hasChanges) {
                showInlineToast(container, '没有需要保存的修改');
                return;
            }

            if (!Array.isArray(rows) || !Array.isArray(rows[saveRowIndex])) {
                showInlineToast(container, '保存失败：行索引超出范围');
                return;
            }

            if (typeof updateTableRow !== 'function') {
                showInlineToast(container, '保存失败：数据库行级更新接口不可用');
                return;
            }

            const liveTableName = typeof getLiveTableName === 'function' ? String(getLiveTableName() || '').trim() : '';
            if (!liveTableName) {
                showInlineToast(container, '保存失败：缺少表格名称');
                return;
            }

            const enumValidationError = findFirstEnumValidationError({
                ddlFieldMetadata,
                data: updateData,
                valuesByRawIndex: Object.fromEntries(changedDraftEntries.map(([rawColIndex, draft]) => [rawColIndex, draft])),
                fieldIndexes: changedDraftEntries.map(([rawColIndex]) => rawColIndex),
            });
            if (enumValidationError) {
                const validationDiagnostics = typeof buildMutationDiagnostics === 'function'
                    ? buildMutationDiagnostics(updateData, {
                        operation: 'update',
                        validation: 'ddl-enum',
                        rowIndex: saveRowIndex,
                        dataRowIndex,
                        validationError: enumValidationError,
                    })
                    : {
                        sheetKey,
                        tableName: liveTableName,
                        rowIndex: saveRowIndex,
                        dataRowIndex,
                        validation: 'ddl-enum',
                        validationError: enumValidationError,
                    };
                logger.warn({
                    action: 'row.save.validation-failed',
                    message: '通用表详情保存前置校验失败',
                    context: validationDiagnostics,
                });
                showInlineToast(container, enumValidationError.message || '保存失败：字段值不在允许范围内');
                return;
            }

            const saveDiagnostics = () => (typeof buildMutationDiagnostics === 'function'
                ? buildMutationDiagnostics(updateData, {
                    operation: 'update',
                    rowIndex: saveRowIndex,
                    dataRowIndex,
                    changedColumns: changedDraftEntries.map(([rawColIndex]) => ({
                        rawColIndex,
                        header: String(rawHeaders[rawColIndex] ?? ''),
                    })),
                })
                : {
                    sheetKey,
                    tableName: liveTableName,
                    rowIndex: saveRowIndex,
                    dataRowIndex,
                    payloadKeys: Object.keys(updateData),
                });

            if (typeof runtime?.setSuppressExternalTableUpdate === 'function') {
                runtime.setSuppressExternalTableUpdate(true);
                suppressExternalTableUpdate = true;
            }

            const result = await updateTableRow(liveTableName, dataRowIndex, updateData);
            if (!isViewerActive()) return;

            if (result?.ok) {
                const refreshedFromSheet = typeof syncRowsFromSheet === 'function' && syncRowsFromSheet();
                state.clearPendingExternalTableUpdate?.();

                if (!refreshedFromSheet || !Array.isArray(rows[saveRowIndex])) {
                    state.returnToListMode();
                    deferredToast = {
                        message: refreshedFromSheet ? '保存成功，但当前行已不存在，已返回列表' : '保存成功，但刷新数据失败，已返回列表',
                        warning: true,
                    };
                    return;
                }

                state.setEditMode(false);
                deferredToast = {
                    message: result.refreshed === false ? '保存成功，但刷新投影失败' : '保存成功',
                    warning: result.refreshed === false,
                };
            } else {
                logger.warn({
                    action: 'row.save.failed',
                    message: '通用表详情保存失败',
                    context: {
                        ...saveDiagnostics(),
                        resultCode: result?.code || '',
                        resultMessage: result?.message || '',
                        persisted: result?.persisted,
                        refreshed: result?.refreshed,
                        repositoryDiagnostics: result?.diagnostics || null,
                    },
                });
                showInlineToast(container, `保存失败：${result?.message || '数据库行级更新失败'}`);
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
            if (suppressExternalTableUpdate && typeof runtime?.setSuppressExternalTableUpdate === 'function') {
                runtime.setSuppressExternalTableUpdate(false);
            }
            if (isViewerActive()) {
                state.setSaving(false);
                renderKeepScroll();
                if (deferredToast) {
                    showInlineToast(container, deferredToast.message, deferredToast.warning);
                }
            }
        }
    }
}

function resizeTextarea(inputEl) {
    if (!(inputEl instanceof HTMLTextAreaElement)) return;
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.max(inputEl.scrollHeight, 32) + 'px';
}
