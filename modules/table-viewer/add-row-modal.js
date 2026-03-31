import { Logger } from '../error-handler.js';
import { PHONE_ICONS } from '../phone-home.js';
import { dispatchPhoneTableUpdated, refreshPhoneTableProjection } from '../phone-core/chat-support.js';
import { sleep } from '../phone-core/db-bridge.js';
import { escapeHtml, EventManager } from '../utils.js';

const logger = Logger.withScope({ scope: 'table-viewer/add-row-modal', feature: 'table-viewer' });

function summarizeSheetSnapshot(rawData, sheetKey) {
    const safeSheetKey = String(sheetKey || '').trim();
    const sheet = rawData && typeof rawData === 'object' && safeSheetKey
        ? rawData[safeSheetKey]
        : null;
    const content = Array.isArray(sheet?.content) ? sheet.content : null;
    return {
        sheetKey: safeSheetKey,
        found: !!sheet,
        tableName: String(sheet?.name || ''),
        contentLength: content ? content.length : null,
        rowCount: content ? Math.max(0, content.length - 1) : null,
    };
}

function buildOptimisticRow(headers = [], rawHeaders = [], data = {}) {
    return headers.map((header, idx) => {
        const rawHeader = String(rawHeaders[idx] ?? '').trim();
        if (idx === 0 && rawHeader === '') {
            return '';
        }

        const key = String(header);
        return Object.prototype.hasOwnProperty.call(data, key)
            ? String(data[key] ?? '')
            : '';
    });
}

function syncRowsFromSheetSnapshot(rows = [], rawData, sheetKey) {
    const safeSheetKey = String(sheetKey || '').trim();
    const sheet = rawData && typeof rawData === 'object' && safeSheetKey
        ? rawData[safeSheetKey]
        : null;

    if (!sheet?.content || !Array.isArray(sheet.content)) {
        return {
            synced: false,
            rowCount: Array.isArray(rows) ? rows.length : 0,
        };
    }

    rows.length = 0;
    rows.push(...sheet.content.slice(1));
    return {
        synced: true,
        rowCount: rows.length,
    };
}

async function reconcileInsertedRow(options = {}) {
    const {
        tableName = '',
        sheetKey = '',
        rowIndex,
        rows = [],
        state,
        getTableData,
        getTableLockState,
        renderKeepScroll,
        expectedMinRowCount = 0,
    } = options;

    const retrySteps = [
        { waitMs: 120, refreshProjection: true },
        { waitMs: 260, refreshProjection: false },
        { waitMs: 480, refreshProjection: true },
    ];
    let latestSummary = summarizeSheetSnapshot(getTableData(), sheetKey);
    let reachedExpected = Number.isInteger(latestSummary.rowCount) && latestSummary.rowCount >= expectedMinRowCount;

    for (let attemptIndex = 0; attemptIndex < retrySteps.length && !reachedExpected; attemptIndex++) {
        const step = retrySteps[attemptIndex];
        await sleep(step.waitMs);

        if (step.refreshProjection) {
            await refreshPhoneTableProjection();
        }

        const latestData = getTableData();
        latestSummary = summarizeSheetSnapshot(latestData, sheetKey);
        const syncResult = syncRowsFromSheetSnapshot(rows, latestData, sheetKey);
        reachedExpected = syncResult.rowCount >= expectedMinRowCount;

        if (syncResult.synced && state) {
            state.lockState = getTableLockState(sheetKey);
            renderKeepScroll();
        }
    }

    dispatchPhoneTableUpdated(sheetKey);

    return {
        reachedExpected,
        latestSummary,
    };
}

export function showGenericAddRowModal(options = {}) {
    const {
        addRowModalId = 'phone-add-row-modal',
        headers = [],
        rawHeaders = [],
        tableName = '',
        sheetKey = '',
        rows = [],
        state,
        container,
        insertTableRow,
        getTableData,
        getTableLockState,
        showInlineToast,
        renderKeepScroll,
    } = options;

    if (!(container instanceof HTMLElement) || !state) return;
    if (typeof insertTableRow !== 'function' || typeof getTableData !== 'function' || typeof getTableLockState !== 'function') return;
    if (typeof showInlineToast !== 'function' || typeof renderKeepScroll !== 'function') return;

    const candidateMountRoot = container.matches('.phone-app-page')
        ? container
        : (container.querySelector('.phone-app-page') || container.closest('.phone-app-page') || document.body);
    const mountRoot = candidateMountRoot instanceof HTMLElement && candidateMountRoot.isConnected
        ? candidateMountRoot
        : document.body;
    const overlayModeClass = mountRoot === document.body ? 'phone-modal-overlay-fixed' : 'phone-modal-overlay-local';

    if (state.lockManageMode || state.deleteManageMode) {
        state.lockManageMode = false;
        state.deleteManageMode = false;
    }

    const existingModal = document.getElementById(addRowModalId);
    if (existingModal) {
        const existingModalAny = /** @type {any} */ (existingModal);
        if (typeof existingModalAny.__yuziCleanup === 'function') {
            existingModalAny.__yuziCleanup();
        } else {
            existingModal.remove();
        }
    }

    const modal = document.createElement('div');
    const modalAny = /** @type {any} */ (modal);
    modal.id = addRowModalId;
    modal.className = `phone-modal-overlay ${overlayModeClass}`;
    const modalEventManager = new EventManager();
    let focusTimerId = null;
    let closeTimerId = null;
    let modalClosed = false;

    const firstRawHeader = String(rawHeaders[0] ?? '').trim();
    const shouldHideLeadingPlaceholder = firstRawHeader === '';

    const editableHeaders = [];
    headers.forEach((header, idx) => {
        const rawHeader = String(rawHeaders[idx] ?? '').trim();
        if (shouldHideLeadingPlaceholder && idx === 0 && rawHeader === '') {
            return;
        }
        editableHeaders.push(header);
    });

    const draftData = {};

    modal.innerHTML = `
        <div class="phone-modal-content">
            <div class="phone-modal-header">
                <span class="phone-modal-title">新增条目</span>
                <button type="button" class="phone-modal-close" id="phone-modal-close-btn">${PHONE_ICONS.close || '×'}</button>
            </div>
            <div class="phone-modal-body">
                ${editableHeaders.map((header, idx) => {
                    const rawIdx = shouldHideLeadingPlaceholder ? idx + 1 : idx;
                    return `
                    <div class="phone-modal-field">
                        <label class="phone-modal-field-label">${escapeHtml(header)}</label>
                        <textarea class="phone-modal-field-input" data-field-idx="${rawIdx}" placeholder="请输入${escapeHtml(header)}" rows="1"></textarea>
                    </div>
                `;}).join('')}
            </div>
            <div class="phone-modal-footer">
                <button type="button" class="phone-modal-btn phone-modal-btn-cancel" id="phone-modal-cancel-btn">取消</button>
                <button type="button" class="phone-modal-btn phone-modal-btn-confirm" id="phone-modal-confirm-btn">确定</button>
            </div>
        </div>
    `;

    mountRoot.appendChild(modal);

    const closeModal = () => {
        if (modalClosed) return;
        modalClosed = true;
        modalEventManager.dispose();
        if (focusTimerId !== null) {
            window.clearTimeout(focusTimerId);
            focusTimerId = null;
        }
        if (closeTimerId !== null) {
            window.clearTimeout(closeTimerId);
            closeTimerId = null;
        }
        if (modalAny.__yuziCleanup === closeModal) {
            delete modalAny.__yuziCleanup;
        }
        modal.classList.remove('show');
        closeTimerId = window.setTimeout(() => {
            modal.remove();
            closeTimerId = null;
        }, 200);
    };
    modalAny.__yuziCleanup = closeModal;

    const firstInput = /** @type {HTMLTextAreaElement | null} */ (modal.querySelector('.phone-modal-field-input'));
    if (firstInput) {
        focusTimerId = window.setTimeout(() => {
            focusTimerId = null;
            if (modal.isConnected) {
                firstInput.focus();
            }
        }, 100);
    }

    modalEventManager.add(modal.querySelector('#phone-modal-close-btn'), 'click', closeModal);
    modalEventManager.add(modal.querySelector('#phone-modal-cancel-btn'), 'click', closeModal);
    modalEventManager.add(modal, 'click', (e) => {
        if (e.target === modal) closeModal();
    });

    const handleEsc = (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    };
    modalEventManager.add(document, 'keydown', handleEsc);

    modal.querySelectorAll('.phone-modal-field-input').forEach((inputNode) => {
        const input = /** @type {HTMLTextAreaElement} */ (inputNode);
        modalEventManager.add(input, 'input', () => {
            const idx = Number(input.getAttribute('data-field-idx'));
            if (!Number.isNaN(idx)) {
                draftData[idx] = input.value;
            }
        });
        modalEventManager.add(input, 'input', () => {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 120) + 'px';
        });
    });

    modalEventManager.add(modal.querySelector('#phone-modal-confirm-btn'), 'click', async () => {
        const confirmBtn = /** @type {HTMLButtonElement | null} */ (modal.querySelector('#phone-modal-confirm-btn'));
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.textContent = '添加中...';
        }

        try {
            const newData = {};
            headers.forEach((header, idx) => {
                const rawHeader = String(rawHeaders[idx] ?? '').trim();
                if (shouldHideLeadingPlaceholder && idx === 0 && rawHeader === '') {
                    return;
                }
                const value = draftData[idx] ?? '';
                newData[String(header)] = value;
            });

            const localRowsBefore = rows.length;
            const result = await insertTableRow(tableName, newData);

            if (result.ok) {
                closeModal();

                const expectedMinRowCount = Number.isInteger(result.rowIndex) && result.rowIndex > 0
                    ? result.rowIndex
                    : localRowsBefore + 1;
                const freshData = getTableData();
                syncRowsFromSheetSnapshot(rows, freshData, sheetKey);

                if (rows.length < expectedMinRowCount) {
                    rows.push(buildOptimisticRow(headers, rawHeaders, newData));
                }

                state.lockState = getTableLockState(sheetKey);
                renderKeepScroll();
                showInlineToast(container, '新增成功');

                Promise.resolve(reconcileInsertedRow({
                    tableName,
                    sheetKey,
                    rowIndex: result.rowIndex,
                    rows,
                    state,
                    getTableData,
                    getTableLockState,
                    renderKeepScroll,
                    expectedMinRowCount,
                })).catch((reconcileError) => {
                    logger.warn({
                        action: 'add-row.reconcile-error',
                        message: '新增后对账同步失败',
                        context: {
                            tableName,
                            sheetKey,
                            rowIndex: result.rowIndex,
                            expectedMinRowCount,
                        },
                        error: reconcileError,
                    });
                });
            } else {
                showInlineToast(container, `新增失败: ${result.message || '未知错误'}`);
                if (confirmBtn) {
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = '确定';
                }
            }
        } catch (err) {
            logger.warn({
                action: 'add-row.exception',
                message: '新增条目流程异常',
                context: {
                    tableName,
                    sheetKey,
                },
                error: err,
            });
            showInlineToast(container, `新增异常: ${err?.message || '未知错误'}`);
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = '确定';
            }
        }
    });

    requestAnimationFrame(() => {
        modal.classList.add('show');
    });
}
