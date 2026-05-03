/**
 * 变量管理器 - 交互逻辑
 * 处理编辑、删除、折叠、长按等交互
 */

import { escapeHtml } from '../utils/dom-escape.js';
import { Logger } from '../error-handler.js';
import { setFloorVariable, deleteFloorVariable, addFloorVariable } from './variable-api.js';
import { parseInputValue } from './flat-view.js';
import { buildEditCardHtml, buildAddVariableDialogHtml, buildConfirmDialogHtml } from './templates.js';

const logger = Logger.withScope ? Logger.withScope({ scope: 'variable-manager/interactions' }) : Logger;
const LONG_PRESS_MS = 500;
const SELECTABLE_DELETE_SELECTOR = '.vm-card, .vm-group-header, .vm-sub-group-title';

function createRuntimeAdapter(runtime) {
    const cleanups = new Set();
    const safeRuntime = runtime && typeof runtime === 'object' ? runtime : null;

    const registerCleanup = (cleanup) => {
        if (typeof cleanup !== 'function') return () => {};
        if (safeRuntime?.registerCleanup) {
            return safeRuntime.registerCleanup(cleanup);
        }
        cleanups.add(cleanup);
        return () => cleanups.delete(cleanup);
    };

    return {
        addEventListener(target, type, handler, options) {
            if (!target || typeof target.addEventListener !== 'function' || typeof handler !== 'function') {
                return () => {};
            }
            if (safeRuntime?.addEventListener) {
                return safeRuntime.addEventListener(target, type, handler, options);
            }
            target.addEventListener(type, handler, options);
            return registerCleanup(() => target.removeEventListener(type, handler, options));
        },
        setTimeout(callback, delay) {
            if (safeRuntime?.setTimeout) {
                return safeRuntime.setTimeout(callback, delay);
            }
            const id = window.setTimeout(callback, delay);
            registerCleanup(() => window.clearTimeout(id));
            return id;
        },
        clearTimeout(id) {
            if (id === undefined || id === null) return;
            if (safeRuntime?.clearTimeout) {
                safeRuntime.clearTimeout(id);
                return;
            }
            window.clearTimeout(id);
        },
        requestAnimationFrame(callback) {
            if (safeRuntime?.requestAnimationFrame) {
                return safeRuntime.requestAnimationFrame(callback);
            }
            const id = window.requestAnimationFrame(callback);
            registerCleanup(() => window.cancelAnimationFrame(id));
            return id;
        },
        isDisposed() {
            return typeof safeRuntime?.isDisposed === 'function' ? safeRuntime.isDisposed() : false;
        },
        registerCleanup,
        disposeFallback() {
            Array.from(cleanups).forEach((cleanup) => {
                try { cleanup(); } catch {}
            });
            cleanups.clear();
        },
    };
}

function isVariableManagerPageAlive(page, deps = {}, expectedMessageId = null, runtime = createRuntimeAdapter(deps.runtime)) {
    if (!(page instanceof HTMLElement) || !page.isConnected) return false;
    if (runtime && typeof runtime.isDisposed === 'function' && runtime.isDisposed()) return false;

    const lifecycle = deps.lifecycle;
    if (lifecycle && typeof lifecycle.isActive === 'function') {
        return lifecycle.isActive(expectedMessageId);
    }

    if (expectedMessageId !== null && typeof deps.getMessageId === 'function') {
        return deps.getMessageId() === expectedMessageId;
    }

    return true;
}

function showToastIfAlive(page, deps, expectedMessageId, message, isError = false, runtime = createRuntimeAdapter(deps.runtime)) {
    if (!isVariableManagerPageAlive(page, deps, expectedMessageId, runtime)) return false;
    showToast(page, message, isError, runtime);
    return true;
}

function refreshViewIfAlive(page, deps, expectedMessageId, runtime = createRuntimeAdapter(deps.runtime)) {
    if (!isVariableManagerPageAlive(page, deps, expectedMessageId, runtime)) return false;
    deps.refreshView?.();
    return true;
}

function closeDialogIfAlive(overlay, page, deps, expectedMessageId, runtime = createRuntimeAdapter(deps.runtime)) {
    if (!isVariableManagerPageAlive(page, deps, expectedMessageId, runtime)) return false;
    closeDialog(overlay, runtime);
    return true;
}

export function bindVariableManagerInteractions(page, deps = {}) {
    if (!(page instanceof HTMLElement)) return () => {};

    const runtime = createRuntimeAdapter(deps.runtime);
    const state = {
        longPressTimer: null,
        pressTarget: null,
        startX: 0,
        startY: 0,
        activeDialogs: new Set(),
        disposed: false,
    };

    const clearPress = () => {
        if (state.longPressTimer !== null) {
            runtime.clearTimeout(state.longPressTimer);
        }
        state.longPressTimer = null;
        state.pressTarget = null;
    };

    runtime.addEventListener(page, 'click', (event) => {
        if (state.disposed) return;
        handlePageClick(event, page, deps, runtime);
    });

    runtime.addEventListener(page, 'keydown', (event) => {
        if (state.disposed) return;
        handlePageKeydown(event, page, deps, runtime);
    });

    runtime.addEventListener(page, 'input', (event) => {
        if (state.disposed) return;
        const input = event.target instanceof HTMLTextAreaElement ? event.target : null;
        if (!input?.classList.contains('vm-edit-input')) return;
        autoResizeTextarea(input);
    });

    bindLongPressDelete(page, deps, runtime, state, clearPress);

    const cleanup = () => {
        if (state.disposed) return;
        state.disposed = true;
        clearPress();
        Array.from(state.activeDialogs).forEach((overlay) => {
            if (overlay instanceof HTMLElement) {
                overlay.remove();
            }
        });
        state.activeDialogs.clear();
        runtime.disposeFallback();
    };

    runtime.registerCleanup(cleanup);
    return cleanup;
}

function handlePageClick(event, page, deps, runtime) {
    if (!isVariableManagerPageAlive(page, deps, null, runtime)) return;

    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const dialogOverlay = target.closest('.vm-dialog-overlay');
    if (dialogOverlay instanceof HTMLElement) {
        handleDialogClick(event, dialogOverlay, page, deps, runtime);
        return;
    }

    const actionEl = target.closest('[data-vm-action]');
    if (actionEl instanceof HTMLElement && page.contains(actionEl)) {
        const action = String(actionEl.dataset.vmAction || '').trim();
        if (handlePageAction(action, actionEl, page, deps, runtime)) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
    }

    const content = page.querySelector('.vm-content');
    if (!(content instanceof HTMLElement) || !content.contains(target)) return;

    if (page.classList.contains('vm-delete-mode')) {
        handleDeleteModeClick(target, page);
        return;
    }

    if (target.closest('.vm-edit-actions') || target.closest('.vm-card-checkbox')) return;

    const header = target.closest('.vm-group-header');
    if (header instanceof HTMLElement) {
        toggleGroupCollapse(header);
        return;
    }

    const card = target.closest('.vm-card');
    if (!(card instanceof HTMLElement) || card.classList.contains('vm-card-editing')) return;
    enterEditMode(card, page, deps);
}

function handlePageAction(action, actionEl, page, deps, runtime) {
    if (!isVariableManagerPageAlive(page, deps, null, runtime)) return false;

    switch (action) {
        case 'nav-back':
            if (typeof deps.navigateBack === 'function') deps.navigateBack();
            return true;
        case 'refresh':
            if (typeof deps.refreshView === 'function') deps.refreshView();
            return true;
        case 'add-variable':
            showAddVariableDialog(page, deps, runtime);
            return true;
        case 'exit-delete-mode':
            exitDeleteMode(page);
            return true;
        case 'confirm-delete': {
            const paths = collectSelectedDeletePaths(page);
            if (paths.length > 0) {
                showDeleteConfirmDialog(page, paths, deps, runtime);
            }
            return true;
        }
        case 'cancel-edit': {
            const editCard = actionEl.closest('.vm-card-editing');
            restoreOriginalCard(editCard);
            return true;
        }
        case 'save-edit': {
            const editCard = actionEl.closest('.vm-card-editing');
            if (editCard instanceof HTMLElement) {
                void handleSaveEdit(editCard, page, deps, runtime);
            }
            return true;
        }
        default:
            return false;
    }
}

function handlePageKeydown(event, page, deps, runtime = createRuntimeAdapter(deps.runtime)) {
    if (!isVariableManagerPageAlive(page, deps, null, runtime)) return;

    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) return;

    if (target.classList.contains('vm-edit-input')) {
        const editCard = target.closest('.vm-card-editing');
        if (!(editCard instanceof HTMLElement)) return;
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            void handleSaveEdit(editCard, page, deps, runtime);
            return;
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            restoreOriginalCard(editCard);
        }
    }
}

function handleDialogClick(event, overlay, page, deps, runtime) {
    if (!isVariableManagerPageAlive(page, deps, null, runtime)) return;

    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) return;

    if (event.target === overlay) {
        closeDialog(overlay, runtime);
        return;
    }

    const actionEl = target.closest('[data-vm-dialog-action]');
    if (!(actionEl instanceof HTMLElement) || !overlay.contains(actionEl)) return;

    const action = String(actionEl.dataset.vmDialogAction || '').trim();
    if (action === 'cancel') {
        closeDialog(overlay, runtime);
        return;
    }
    if (action !== 'confirm') return;

    const dialogType = String(overlay.dataset.vmDialogType || '').trim();
    if (dialogType === 'add-variable') {
        void confirmAddVariableDialog(overlay, page, deps, runtime);
        return;
    }
    if (dialogType === 'confirm') {
        const messageId = typeof deps.getMessageId === 'function' ? deps.getMessageId() : null;
        if (!closeDialogIfAlive(overlay, page, deps, messageId, runtime)) return;
        const onConfirm = overlay.__yuziVmConfirm;
        if (typeof onConfirm === 'function' && isVariableManagerPageAlive(page, deps, messageId, runtime)) onConfirm();
    }
}

function toggleGroupCollapse(header) {
    const group = header.closest('.vm-group');
    if (!group) return;

    const chevron = header.querySelector('.vm-group-chevron');
    const isCollapsed = group.classList.toggle('vm-group-collapsed');
    if (chevron) {
        chevron.textContent = isCollapsed ? '▶' : '▼';
    }
}

function enterEditMode(card, page, deps) {
    const existingEditingCard = page.querySelector('.vm-card-editing');
    if (existingEditingCard && existingEditingCard !== card) {
        if (typeof deps.refreshView === 'function') {
            deps.refreshView();
        }
        return;
    }

    const path = card.dataset.varPath || '';
    const valueType = card.dataset.varType || 'string';
    const keyEl = card.querySelector('.vm-card-key');
    const valueEl = card.querySelector('.vm-card-value');
    if (!keyEl || !valueEl || !path) return;

    const key = keyEl.textContent || '';
    const displayValue = valueEl.textContent || '';
    const originalCard = card.cloneNode(true);

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = buildEditCardHtml(path, key, displayValue, valueType);
    const editCard = tempDiv.firstElementChild;
    if (!(editCard instanceof HTMLElement)) return;

    editCard.__yuziOriginalCard = originalCard;
    card.replaceWith(editCard);

    const input = editCard.querySelector('.vm-edit-input');
    if (input instanceof HTMLTextAreaElement) {
        input.focus();
        input.selectionStart = input.value.length;
        input.selectionEnd = input.value.length;
        autoResizeTextarea(input);
    }
}

function restoreOriginalCard(editCard) {
    if (!(editCard instanceof HTMLElement)) return;
    const originalCard = editCard.__yuziOriginalCard;
    if (originalCard instanceof HTMLElement) {
        editCard.replaceWith(originalCard);
    }
}

function autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(72, textarea.scrollHeight)}px`;
}

async function handleSaveEdit(editCard, page, deps, runtime = createRuntimeAdapter(deps.runtime)) {
    const path = editCard.dataset.varPath || '';
    const valueType = editCard.dataset.varType || 'string';
    const input = editCard.querySelector('.vm-edit-input');
    if (!(input instanceof HTMLTextAreaElement) || !path) return;

    const newInputValue = input.value;
    const newValue = parseInputValue(newInputValue, valueType);
    const messageId = typeof deps.getMessageId === 'function' ? deps.getMessageId() : -1;
    if (messageId < 0) {
        showToast(page, '无法获取楼层号', true, runtime);
        return;
    }

    showEditConfirmDialog(page, path, String(newValue), () => {
        void doSaveEdit(messageId, path, newValue, page, deps, runtime);
    }, runtime);
}

function showEditConfirmDialog(page, path, newValueStr, onConfirm, runtime) {
    const bodyHtml = `
        <div class="vm-confirm-detail">
            <div class="vm-confirm-row vm-confirm-row-block">
                <span class="vm-confirm-label">路径</span>
                <span class="vm-confirm-value">${escapeHtml(path)}</span>
            </div>
            <div class="vm-confirm-row vm-confirm-row-block">
                <span class="vm-confirm-label">新值</span>
                <span class="vm-confirm-value">${escapeHtml(newValueStr)}</span>
            </div>
        </div>
    `;

    showDialog(page, '确认修改变量？', bodyHtml, '确认', '', onConfirm, runtime);
}

async function doSaveEdit(messageId, path, newValue, page, deps, runtime) {
    if (!isVariableManagerPageAlive(page, deps, messageId, runtime)) return;

    try {
        const success = await setFloorVariable(messageId, path, newValue);
        if (!isVariableManagerPageAlive(page, deps, messageId, runtime)) return;

        if (success) {
            showToastIfAlive(page, deps, messageId, '变量已更新', false, runtime);
            refreshViewIfAlive(page, deps, messageId, runtime);
        } else {
            showToastIfAlive(page, deps, messageId, '更新失败', true, runtime);
        }
    } catch (error) {
        logger.error?.({ action: 'doSaveEdit', message: '保存变量失败', error });
        showToastIfAlive(page, deps, messageId, `保存失败: ${error?.message || '未知错误'}`, true, runtime);
    }
}

function bindLongPressDelete(page, deps, runtime, state, clearPress) {
    runtime.addEventListener(page, 'pointerdown', (event) => {
        const content = page.querySelector('.vm-content');
        if (!(content instanceof HTMLElement)) return;
        const target = event.target instanceof Element ? event.target.closest(SELECTABLE_DELETE_SELECTOR) : null;
        if (!(target instanceof HTMLElement) || !content.contains(target)) return;
        if (page.classList.contains('vm-delete-mode')) return;
        if (target.classList.contains('vm-card-editing')) return;

        state.pressTarget = target;
        state.startX = event.clientX;
        state.startY = event.clientY;
        state.longPressTimer = runtime.setTimeout(() => {
            if (!isVariableManagerPageAlive(page, deps, null, runtime)) return;
            enterDeleteMode(page, target);
            state.pressTarget = null;
            state.longPressTimer = null;
        }, LONG_PRESS_MS);
    });

    runtime.addEventListener(page, 'pointerup', clearPress);
    runtime.addEventListener(page, 'pointercancel', clearPress);
    runtime.addEventListener(page, 'pointerleave', clearPress);
    runtime.addEventListener(page, 'pointermove', (event) => {
        if (!state.pressTarget || state.longPressTimer === null) return;
        if (Math.abs(event.clientX - state.startX) > 8 || Math.abs(event.clientY - state.startY) > 8) {
            clearPress();
        }
    });
}

function enterDeleteMode(page, initialTarget) {
    page.classList.add('vm-delete-mode');

    page.querySelector('.vm-delete-bar')?.classList.remove('vm-delete-bar-hidden');
    page.querySelector('.vm-footer')?.classList.add('vm-footer-hidden');

    decorateDeleteTargets(page);

    if (initialTarget instanceof HTMLElement) {
        setDeleteSelected(initialTarget, true);
    }

    updateDeleteCount(page);

    if (navigator.vibrate) {
        try { navigator.vibrate(50); } catch { /* ignore */ }
    }
}

function decorateDeleteTargets(page) {
    page.querySelectorAll('.vm-card').forEach((card) => {
        card.classList.add('vm-card-delete-mode', 'vm-delete-selectable');
        ensureCheckbox(card, 'prepend');
    });

    page.querySelectorAll('.vm-group-header').forEach((header) => {
        header.classList.add('vm-delete-selectable', 'vm-group-header-delete-mode');
        ensureCheckbox(header, 'prepend');
    });

    page.querySelectorAll('.vm-sub-group-title').forEach((title) => {
        title.classList.add('vm-delete-selectable', 'vm-sub-title-delete-mode');
        ensureCheckbox(title, 'prepend');
    });
}

function ensureCheckbox(element, position = 'prepend') {
    if (element.querySelector(':scope > .vm-card-checkbox')) return;
    const checkbox = document.createElement('div');
    checkbox.className = 'vm-card-checkbox';
    checkbox.innerHTML = '<div class="vm-checkbox"></div>';
    if (position === 'prepend') {
        element.insertBefore(checkbox, element.firstChild);
    } else {
        element.appendChild(checkbox);
    }
}

function exitDeleteMode(page) {
    page.classList.remove('vm-delete-mode');
    page.querySelector('.vm-delete-bar')?.classList.add('vm-delete-bar-hidden');
    page.querySelector('.vm-footer')?.classList.remove('vm-footer-hidden');

    page.querySelectorAll('.vm-delete-selectable').forEach((el) => {
        el.classList.remove('vm-delete-selectable', 'vm-delete-selected', 'vm-card-delete-mode', 'vm-card-selected', 'vm-group-header-delete-mode', 'vm-sub-title-delete-mode');
        el.querySelector(':scope > .vm-card-checkbox')?.remove();
    });

    updateDeleteCount(page);
}

function handleDeleteModeClick(target, page) {
    const selectable = target.closest(SELECTABLE_DELETE_SELECTOR);
    if (!(selectable instanceof HTMLElement)) return;
    if (!page.contains(selectable)) return;

    setDeleteSelected(selectable, !selectable.classList.contains('vm-delete-selected'));
    updateDeleteCount(page);
}

function setDeleteSelected(element, selected) {
    element.classList.toggle('vm-delete-selected', selected);
    if (element.classList.contains('vm-card')) {
        element.classList.toggle('vm-card-selected', selected);
    }
    const checkbox = element.querySelector(':scope > .vm-card-checkbox .vm-checkbox');
    checkbox?.classList.toggle('vm-checkbox-checked', selected);
}

function getDeletePath(element) {
    if (!(element instanceof HTMLElement)) return '';
    if (element.classList.contains('vm-card')) {
        return String(element.dataset.varPath || '').trim();
    }
    if (element.classList.contains('vm-group-header')) {
        return String(element.closest('.vm-group')?.dataset.groupPath || '').trim();
    }
    if (element.classList.contains('vm-sub-group-title')) {
        return String(element.closest('.vm-sub-group')?.dataset.subPath || '').trim();
    }
    return '';
}

function collectSelectedDeletePaths(page) {
    const selected = Array.from(page.querySelectorAll('.vm-delete-selected'));
    return normalizeDeletePaths(selected.map((el) => getDeletePath(el)).filter(Boolean));
}

function normalizeDeletePaths(paths) {
    const uniquePaths = Array.from(new Set(paths.map((item) => String(item || '').trim()).filter(Boolean)));
    uniquePaths.sort((a, b) => a.split('.').length - b.split('.').length || a.length - b.length);

    return uniquePaths.filter((path, index) => {
        return !uniquePaths.slice(0, index).some((parent) => path === parent || path.startsWith(`${parent}.`));
    });
}

function updateDeleteCount(page) {
    const paths = collectSelectedDeletePaths(page);
    const countEl = page.querySelector('.vm-delete-count');
    if (countEl) countEl.textContent = String(paths.length);

    const confirmBtn = page.querySelector('.vm-delete-confirm-btn');
    if (confirmBtn instanceof HTMLButtonElement) {
        confirmBtn.disabled = paths.length === 0;
    }
}

function showDeleteConfirmDialog(page, paths, deps, runtime) {
    const listHtml = paths.map((path) => `<div class="vm-confirm-delete-item">• ${escapeHtml(path)}</div>`).join('');
    const bodyHtml = `
        <div class="vm-confirm-detail">
            <div class="vm-confirm-delete-list">${listHtml}</div>
            <div class="vm-confirm-warning">⚠️ 此操作不可撤销</div>
        </div>
    `;

    showDialog(page, `确认删除 ${paths.length} 项？`, bodyHtml, '删除', 'vm-dialog-confirm-danger', () => {
        void doDeleteVariables(page, paths, deps, runtime);
    }, runtime);
}

async function doDeleteVariables(page, paths, deps, runtime) {
    const messageId = typeof deps.getMessageId === 'function' ? deps.getMessageId() : -1;
    if (messageId < 0) {
        showToastIfAlive(page, deps, null, '无法获取楼层号', true, runtime);
        return;
    }
    if (!isVariableManagerPageAlive(page, deps, messageId, runtime)) return;

    let successCount = 0;
    for (const path of normalizeDeletePaths(paths)) {
        try {
            const ok = await deleteFloorVariable(messageId, path);
            if (ok) successCount++;
        } catch (error) {
            logger.error?.({ action: 'doDeleteVariables', message: `删除变量失败: ${path}`, error });
        }
    }

    if (!isVariableManagerPageAlive(page, deps, messageId, runtime)) return;
    exitDeleteMode(page);

    if (successCount > 0) {
        showToastIfAlive(page, deps, messageId, `已删除 ${successCount} 项`, false, runtime);
        refreshViewIfAlive(page, deps, messageId, runtime);
    } else {
        showToastIfAlive(page, deps, messageId, '删除失败', true, runtime);
    }
}

function showAddVariableDialog(page, deps, runtime) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = buildAddVariableDialogHtml();
    const overlay = tempDiv.firstElementChild;
    if (!(overlay instanceof HTMLElement)) return;

    overlay.dataset.vmDialogType = 'add-variable';
    mountDialog(page, overlay, runtime);

    const pathInput = overlay.querySelector('.vm-add-path-input');
    if (pathInput instanceof HTMLInputElement) pathInput.focus();
}

async function confirmAddVariableDialog(overlay, page, deps, runtime) {
    if (!isVariableManagerPageAlive(page, deps, null, runtime)) return;

    const pathInput = overlay.querySelector('.vm-add-path-input');
    const valueInput = overlay.querySelector('.vm-add-value-input');
    const path = pathInput instanceof HTMLInputElement ? pathInput.value.trim() : '';
    const valueStr = valueInput instanceof HTMLInputElement ? valueInput.value.trim() : '';

    if (!path) {
        pathInput?.classList.add('vm-input-error');
        return;
    }

    const messageId = typeof deps.getMessageId === 'function' ? deps.getMessageId() : -1;
    if (messageId < 0) {
        showToastIfAlive(page, deps, null, '无法获取楼层号', true, runtime);
        closeDialogIfAlive(overlay, page, deps, null, runtime);
        return;
    }
    if (!isVariableManagerPageAlive(page, deps, messageId, runtime)) return;

    const value = parseInputValue(valueStr, 'string');
    try {
        const ok = await addFloorVariable(messageId, path, value);
        if (!isVariableManagerPageAlive(page, deps, messageId, runtime)) return;

        closeDialogIfAlive(overlay, page, deps, messageId, runtime);
        if (ok) {
            showToastIfAlive(page, deps, messageId, '变量已添加', false, runtime);
            refreshViewIfAlive(page, deps, messageId, runtime);
        } else {
            showToastIfAlive(page, deps, messageId, '添加失败', true, runtime);
        }
    } catch (error) {
        if (!isVariableManagerPageAlive(page, deps, messageId, runtime)) return;

        closeDialogIfAlive(overlay, page, deps, messageId, runtime);
        showToastIfAlive(page, deps, messageId, `添加失败: ${error?.message || '未知错误'}`, true, runtime);
    }
}

function showDialog(page, title, bodyHtml, confirmText, confirmClass, onConfirm, runtime) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = buildConfirmDialogHtml(title, bodyHtml, confirmText, confirmClass);
    const overlay = tempDiv.firstElementChild;
    if (!(overlay instanceof HTMLElement)) return;

    overlay.dataset.vmDialogType = 'confirm';
    overlay.__yuziVmConfirm = onConfirm;
    mountDialog(page, overlay, runtime);
}

function mountDialog(page, overlay, runtime) {
    const mountRoot = page.querySelector('.vm-page') || page;
    mountRoot.appendChild(overlay);
    runtime?.registerCleanup?.(() => overlay.remove());
    runtime?.requestAnimationFrame?.(() => overlay.classList.add('vm-dialog-show'));
}

function closeDialog(overlay, runtime) {
    overlay.classList.remove('vm-dialog-show');
    runtime?.setTimeout?.(() => overlay.remove(), 180);
}

function showToast(page, message, isError = false, runtime = null) {
    const mountRoot = page.querySelector('.vm-page') || page;
    mountRoot.querySelector('.vm-toast')?.remove();

    const toast = document.createElement('div');
    toast.className = `vm-toast ${isError ? 'vm-toast-error' : 'vm-toast-success'}`;
    toast.textContent = message;
    mountRoot.appendChild(toast);

    runtime?.registerCleanup?.(() => toast.remove());
    runtime?.requestAnimationFrame?.(() => toast.classList.add('vm-toast-show'));
    runtime?.setTimeout?.(() => {
        toast.classList.remove('vm-toast-show');
        runtime?.setTimeout?.(() => toast.remove(), 180);
    }, 1800);
}
