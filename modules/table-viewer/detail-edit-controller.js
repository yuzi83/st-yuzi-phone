import { Logger } from '../error-handler.js';

const logger = Logger.withScope({ scope: 'table-viewer/detail-edit', feature: 'table-viewer' });

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
    } = options;

    if (!(container instanceof HTMLElement) || !state) return;

    container.querySelector('.phone-nav-back')?.addEventListener('click', () => {
        state.mode = 'list';
        state.rowIndex = -1;
        state.editMode = false;
        state.draftValues = {};
        state.cellLockManageMode = false;
        if (typeof render === 'function') {
            render();
        }
        if (typeof restoreListScroll === 'function') {
            restoreListScroll();
        }
    });

    container.querySelector('#phone-toggle-edit-mode')?.addEventListener('click', () => {
        if (rowLocked && !state.editMode) {
            showInlineToast(container, '当前条目已锁定，无法编辑');
            return;
        }
        state.editMode = !state.editMode;
        if (!state.editMode) {
            state.draftValues = {};
        }
        if (state.editMode) {
            state.cellLockManageMode = false;
        }
        renderKeepScroll();
    });

    container.querySelector('#phone-cell-lock-mode-btn')?.addEventListener('click', () => {
        state.cellLockManageMode = !state.cellLockManageMode;
        if (state.cellLockManageMode) {
            state.editMode = false;
            state.draftValues = {};
        }
        renderKeepScroll();
    });

    const bindToggleCellLock = (el) => {
        el.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();

            const lockColIndex = Number(el.getAttribute('data-cell-lock'));
            const rawColIndex = Number(el.getAttribute('data-cell-raw'));
            if (Number.isNaN(lockColIndex) || lockColIndex < 0) return;

            if (isTableRowLocked(sheetKey, rowIndexForLock)) {
                showInlineToast(container, '当前条目已锁定，无法切换字段锁');
                return;
            }

            const nextLocked = toggleTableCellLock(sheetKey, rowIndexForLock, lockColIndex);

            state.lockState = getTableLockState(sheetKey);
            if (nextLocked && state.editMode && Number.isInteger(rawColIndex)) {
                delete state.draftValues[rawColIndex];
            }
            showInlineToast(container, nextLocked ? '字段已锁定' : '字段已解锁');
            renderKeepScroll();
        });
    };

    container.querySelectorAll('[data-cell-lock]').forEach((node) => {
        bindToggleCellLock(/** @type {HTMLElement} */ (node));
    });

    container.querySelectorAll('[data-input-col]').forEach((inputNode) => {
        const inputEl = /** @type {HTMLTextAreaElement} */ (inputNode);
        const initTextareaHeight = () => {
            inputEl.style.height = 'auto';
            inputEl.style.height = Math.max(inputEl.scrollHeight, 32) + 'px';
        };
        initTextareaHeight();

        inputEl.addEventListener('input', () => {
            const colIndex = Number(inputEl.getAttribute('data-input-col'));
            if (Number.isNaN(colIndex)) return;
            state.draftValues[colIndex] = inputEl.value;
            inputEl.style.height = 'auto';
            inputEl.style.height = Math.max(inputEl.scrollHeight, 32) + 'px';
        });
    });

    container.querySelector('#phone-save-row')?.addEventListener('click', async () => {
        if (!state.editMode || state.saving || rowLocked) return;

        state.saving = true;
        renderKeepScroll();

        try {
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
                state.saving = false;
                renderKeepScroll();
                return;
            }

            const freshData = getTableData();

            if (!freshData || !freshData[sheetKey]) {
                showInlineToast(container, '保存失败：无法获取表格数据');
                state.saving = false;
                renderKeepScroll();
                return;
            }

            const sheetData = freshData[sheetKey];
            const content = sheetData.content;
            if (!content || !Array.isArray(content)) {
                showInlineToast(container, '保存失败：表格内容格式错误');
                state.saving = false;
                renderKeepScroll();
                return;
            }

            const dataRowIndex = state.rowIndex + 1;
            if (dataRowIndex >= content.length) {
                showInlineToast(container, '保存失败：行索引超出范围');
                state.saving = false;
                renderKeepScroll();
                return;
            }

            Object.entries(updateData).forEach(([colName, value]) => {
                const colIndex = rawHeaders.findIndex(h => h === colName);
                if (colIndex >= 0) {
                    content[dataRowIndex][colIndex] = value;
                }
            });

            const success = await saveTableData(freshData);

            if (success) {
                Object.entries(state.draftValues).forEach(([colKey, draft]) => {
                    const rawColIndex = Number(colKey);
                    if (!Number.isNaN(rawColIndex) && rows[state.rowIndex]) {
                        rows[state.rowIndex][rawColIndex] = draft;
                    }
                });
                state.draftValues = {};
                state.editMode = false;
                showInlineToast(container, '保存成功');
            } else {
                showInlineToast(container, '保存失败：数据库写入失败');
            }
        } catch (err) {
            logger.error({
                action: 'row.save',
                message: '详情行保存异常',
                context: { sheetKey, rowIndex: state.rowIndex },
                error: err,
            });
            showInlineToast(container, `保存异常: ${err?.message || '未知错误'}`);
        } finally {
            state.saving = false;
            renderKeepScroll();
        }
    });
}
