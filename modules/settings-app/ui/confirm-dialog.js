import { escapeHtml } from '../../utils.js';

/**
 * 显示确认弹窗
 * @param {HTMLElement} container 容器
 * @param {string} title 标题
 * @param {string} message 消息
 * @param {Function} onConfirm 确认回调
 * @param {string} confirmText 确认按钮文字
 * @param {string} cancelText 取消按钮文字
 */
export function showConfirmDialog(container, title, message, onConfirm, confirmText = '确认', cancelText = '取消') {
    const existing = container.querySelector('.phone-confirm-dialog-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'phone-confirm-dialog-overlay';
    overlay.innerHTML = `
        <div class="phone-confirm-dialog">
            <div class="phone-confirm-dialog-title">${escapeHtml(title)}</div>
            <div class="phone-confirm-dialog-message">${escapeHtml(message)}</div>
            <div class="phone-confirm-dialog-buttons">
                <button type="button" class="phone-confirm-dialog-btn phone-confirm-dialog-cancel">${escapeHtml(cancelText)}</button>
                <button type="button" class="phone-confirm-dialog-btn phone-confirm-dialog-confirm">${escapeHtml(confirmText)}</button>
            </div>
        </div>
    `;

    const closeDialog = () => {
        overlay.classList.remove('phone-confirm-dialog-show');
        setTimeout(() => overlay.remove(), 200);
    };

    overlay.querySelector('.phone-confirm-dialog-cancel')?.addEventListener('click', closeDialog);
    overlay.querySelector('.phone-confirm-dialog-confirm')?.addEventListener('click', () => {
        closeDialog();
        onConfirm?.();
    });

    (container.closest('.phone-app-page') || container).appendChild(overlay);
    setTimeout(() => overlay.classList.add('phone-confirm-dialog-show'), 10);
}
