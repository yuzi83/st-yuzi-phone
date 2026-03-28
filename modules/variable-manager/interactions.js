/**
 * 变量管理器 - 交互逻辑
 * 处理编辑、删除、折叠、长按等交互
 */

import { escapeHtml } from '../utils.js';
import { Logger } from '../error-handler.js';
import { setFloorVariable, deleteFloorVariable, addFloorVariable } from './variable-api.js';
import { parseInputValue } from './flat-view.js';
import { buildEditCardHtml, buildAddVariableDialogHtml, buildConfirmDialogHtml } from './templates.js';

const logger = Logger.withScope ? Logger.withScope({ scope: 'variable-manager/interactions' }) : Logger;
const LONG_PRESS_MS = 500;
const SELECTABLE_DELETE_SELECTOR = '.vm-card, .vm-group-header, .vm-sub-group-title';

export function bindVariableManagerInteractions(page, deps = {}) {
    if (!(page instanceof HTMLElement)) return;

    const backBtn = page.querySelector('.vm-nav-back');
    backBtn?.addEventListener('click', () => {
        if (typeof deps.navigateBack === 'function') deps.navigateBack();
    });

    const refreshBtn = page.querySelector('.vm-nav-refresh');
    refreshBtn?.addEventListener('click', () => {
        if (typeof deps.refreshView === 'function') deps.refreshView();
    });

    const addBtn = page.querySelector('.vm-add-btn');
    addBtn?.addEventListener('click', () => {
        showAddVariableDialog(page, deps);
    });

    bindGroupCollapse(page);
    bindCardClickEdit(page, deps);
    bindLongPressDelete(page);
    bindDeleteModeButtons(page, deps);
}

function bindGroupCollapse(page) {
    const content = page.querySelector('.vm-content');
    if (!content) return;

    content.addEventListener('click', (e) => {
        if (page.classList.contains('vm-delete-mode')) return;

        const target = e.target instanceof Element ? e.target : null;
        if (!target) return;

        const header = target.closest('.vm-group-header');
        if (!header) return;

        const group = header.closest('.vm-group');
        if (!group) return;

        const chevron = header.querySelector('.vm-group-chevron');
        const isCollapsed = group.classList.toggle('vm-group-collapsed');
        if (chevron) {
            chevron.textContent = isCollapsed ? '▶' : '▼';
        }
    });
}

function bindCardClickEdit(page, deps) {
    const content = page.querySelector('.vm-content');
    if (!content) return;

    content.addEventListener('click', (e) => {
        const target = e.target instanceof Element ? e.target : null;
        if (!target) return;

        if (page.classList.contains('vm-delete-mode')) {
            handleDeleteModeClick(target, page);
            return;
        }

        if (target.closest('.vm-edit-actions') || target.closest('.vm-card-checkbox')) return;

        const card = target.closest('.vm-card');
        if (!card || card.classList.contains('vm-card-editing')) return;

        enterEditMode(card, page, deps);
    });
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
    if (!editCard) return;

    card.replaceWith(editCard);

    const input = editCard.querySelector('.vm-edit-input');
    if (input instanceof HTMLTextAreaElement) {
        input.focus();
        input.selectionStart = input.value.length;
        input.selectionEnd = input.value.length;
        autoResizeTextarea(input);
        input.addEventListener('input', () => autoResizeTextarea(input));
    }

    editCard.querySelector('.vm-edit-cancel')?.addEventListener('click', (e) => {
        e.stopPropagation();
        editCard.replaceWith(originalCard);
    });

    editCard.querySelector('.vm-edit-save')?.addEventListener('click', (e) => {
        e.stopPropagation();
        handleSaveEdit(editCard, page, deps);
    });

    input?.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            handleSaveEdit(editCard, page, deps);
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            editCard.replaceWith(originalCard);
        }
    });
}

function autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(72, textarea.scrollHeight)}px`;
}

async function handleSaveEdit(editCard, page, deps) {
    const path = editCard.dataset.varPath || '';
    const valueType = editCard.dataset.varType || 'string';
    const input = editCard.querySelector('.vm-edit-input');
    if (!(input instanceof HTMLTextAreaElement) || !path) return;

    const newInputValue = input.value;
    const newValue = parseInputValue(newInputValue, valueType);
    const messageId = typeof deps.getMessageId === 'function' ? deps.getMessageId() : -1;
    if (messageId < 0) {
        showToast(page, '无法获取楼层号', true);
        return;
    }

    showEditConfirmDialog(page, path, String(newValue), () => {
        void doSaveEdit(messageId, path, newValue, page, deps);
    });
}

function showEditConfirmDialog(page, path, newValueStr, onConfirm) {
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

    showDialog(page, '确认修改变量？', bodyHtml, '确认', '', onConfirm);
}

async function doSaveEdit(messageId, path, newValue, page, deps) {
    try {
        const success = await setFloorVariable(messageId, path, newValue);
        if (success) {
            showToast(page, '变量已更新');
            deps.refreshView?.();
        } else {
            showToast(page, '更新失败', true);
        }
    } catch (error) {
        logger.error?.({ action: 'doSaveEdit', message: '保存变量失败', error });
        showToast(page, `保存失败: ${error?.message || '未知错误'}`, true);
    }
}

function bindLongPressDelete(page) {
    const content = page.querySelector('.vm-content');
    if (!content) return;

    let longPressTimer = null;
    let pressTarget = null;
    let startX = 0;
    let startY = 0;

    content.addEventListener('pointerdown', (e) => {
        const target = e.target instanceof Element ? e.target.closest(SELECTABLE_DELETE_SELECTOR) : null;
        if (!(target instanceof HTMLElement)) return;
        if (page.classList.contains('vm-delete-mode')) return;
        if (target.classList.contains('vm-card-editing')) return;

        pressTarget = target;
        startX = e.clientX;
        startY = e.clientY;
        longPressTimer = setTimeout(() => {
            enterDeleteMode(page, target);
            pressTarget = null;
            longPressTimer = null;
        }, LONG_PRESS_MS);
    });

    const clearPress = () => {
        if (longPressTimer) clearTimeout(longPressTimer);
        longPressTimer = null;
        pressTarget = null;
    };

    content.addEventListener('pointerup', clearPress);
    content.addEventListener('pointercancel', clearPress);
    content.addEventListener('pointerleave', clearPress);
    content.addEventListener('pointermove', (e) => {
        if (!pressTarget || !longPressTimer) return;
        if (Math.abs(e.clientX - startX) > 8 || Math.abs(e.clientY - startY) > 8) {
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

function bindDeleteModeButtons(page, deps) {
    page.querySelector('.vm-delete-cancel-btn')?.addEventListener('click', () => {
        exitDeleteMode(page);
    });

    page.querySelector('.vm-delete-confirm-btn')?.addEventListener('click', () => {
        const paths = collectSelectedDeletePaths(page);
        if (paths.length === 0) return;
        showDeleteConfirmDialog(page, paths, deps);
    });
}

function showDeleteConfirmDialog(page, paths, deps) {
    const listHtml = paths.map((path) => `<div class="vm-confirm-delete-item">• ${escapeHtml(path)}</div>`).join('');
    const bodyHtml = `
        <div class="vm-confirm-detail">
            <div class="vm-confirm-delete-list">${listHtml}</div>
            <div class="vm-confirm-warning">⚠️ 此操作不可撤销</div>
        </div>
    `;

    showDialog(page, `确认删除 ${paths.length} 项？`, bodyHtml, '删除', 'vm-dialog-confirm-danger', () => {
        void doDeleteVariables(page, paths, deps);
    });
}

async function doDeleteVariables(page, paths, deps) {
    const messageId = typeof deps.getMessageId === 'function' ? deps.getMessageId() : -1;
    if (messageId < 0) {
        showToast(page, '无法获取楼层号', true);
        return;
    }

    let successCount = 0;
    for (const path of normalizeDeletePaths(paths)) {
        try {
            const ok = await deleteFloorVariable(messageId, path);
            if (ok) successCount++;
        } catch (error) {
            logger.error?.({ action: 'doDeleteVariables', message: `删除变量失败: ${path}`, error });
        }
    }

    exitDeleteMode(page);

    if (successCount > 0) {
        showToast(page, `已删除 ${successCount} 项`);
        deps.refreshView?.();
    } else {
        showToast(page, '删除失败', true);
    }
}

function showAddVariableDialog(page, deps) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = buildAddVariableDialogHtml();
    const overlay = tempDiv.firstElementChild;
    if (!(overlay instanceof HTMLElement)) return;

    const mountRoot = page.querySelector('.vm-page') || page;
    mountRoot.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('vm-dialog-show'));

    const pathInput = overlay.querySelector('.vm-add-path-input');
    const valueInput = overlay.querySelector('.vm-add-value-input');
    if (pathInput instanceof HTMLInputElement) pathInput.focus();

    overlay.querySelector('.vm-dialog-cancel')?.addEventListener('click', () => closeDialog(overlay));
    overlay.querySelector('.vm-dialog-confirm')?.addEventListener('click', async () => {
        const path = pathInput instanceof HTMLInputElement ? pathInput.value.trim() : '';
        const valueStr = valueInput instanceof HTMLInputElement ? valueInput.value.trim() : '';

        if (!path) {
            pathInput?.classList.add('vm-input-error');
            return;
        }

        const messageId = typeof deps.getMessageId === 'function' ? deps.getMessageId() : -1;
        if (messageId < 0) {
            showToast(page, '无法获取楼层号', true);
            closeDialog(overlay);
            return;
        }

        const value = parseInputValue(valueStr, 'string');
        try {
            const ok = await addFloorVariable(messageId, path, value);
            closeDialog(overlay);
            if (ok) {
                showToast(page, '变量已添加');
                deps.refreshView?.();
            } else {
                showToast(page, '添加失败', true);
            }
        } catch (error) {
            closeDialog(overlay);
            showToast(page, `添加失败: ${error?.message || '未知错误'}`, true);
        }
    });

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeDialog(overlay);
    });
}

function showDialog(page, title, bodyHtml, confirmText, confirmClass, onConfirm) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = buildConfirmDialogHtml(title, bodyHtml, confirmText, confirmClass);
    const overlay = tempDiv.firstElementChild;
    if (!(overlay instanceof HTMLElement)) return;

    const mountRoot = page.querySelector('.vm-page') || page;
    mountRoot.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('vm-dialog-show'));

    overlay.querySelector('.vm-dialog-cancel')?.addEventListener('click', () => closeDialog(overlay));
    overlay.querySelector('.vm-dialog-confirm')?.addEventListener('click', () => {
        closeDialog(overlay);
        if (typeof onConfirm === 'function') onConfirm();
    });
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeDialog(overlay);
    });
}

function closeDialog(overlay) {
    overlay.classList.remove('vm-dialog-show');
    setTimeout(() => overlay.remove(), 180);
}

function showToast(page, message, isError = false) {
    const mountRoot = page.querySelector('.vm-page') || page;
    mountRoot.querySelector('.vm-toast')?.remove();

    const toast = document.createElement('div');
    toast.className = `vm-toast ${isError ? 'vm-toast-error' : 'vm-toast-success'}`;
    toast.textContent = message;
    mountRoot.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('vm-toast-show'));
    setTimeout(() => {
        toast.classList.remove('vm-toast-show');
        setTimeout(() => toast.remove(), 260);
    }, 2200);
}
