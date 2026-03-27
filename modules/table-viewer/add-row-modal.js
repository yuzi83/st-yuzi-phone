import { PHONE_ICONS } from '../phone-home.js';
import { escapeHtml, EventManager } from '../utils.js';

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

            const result = await insertTableRow(tableName, newData);

            if (result.ok) {
                showInlineToast(container, '新增成功');
                closeModal();
                const freshData = getTableData();
                if (freshData && freshData[sheetKey]) {
                    const freshSheet = freshData[sheetKey];
                    if (freshSheet?.content && Array.isArray(freshSheet.content)) {
                        rows.length = 0;
                        rows.push(...freshSheet.content.slice(1));
                    }
                }
                state.lockState = getTableLockState(sheetKey);
                renderKeepScroll();
            } else {
                showInlineToast(container, `新增失败: ${result.message || '未知错误'}`);
                if (confirmBtn) {
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = '确定';
                }
            }
        } catch (err) {
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
