import { escapeHtml } from '../../utils/dom-escape.js';

function createDialogRuntime(runtime) {
    if (runtime && typeof runtime.addEventListener === 'function') return runtime;
    const cleanups = [];
    return {
        addEventListener(target, type, handler, options) {
            if (!target || typeof target.addEventListener !== 'function' || typeof handler !== 'function') return () => {};
            target.addEventListener(type, handler, options);
            const cleanup = () => target.removeEventListener(type, handler, options);
            cleanups.push(cleanup);
            return cleanup;
        },
        setTimeout(callback, delay) {
            const id = window.setTimeout(callback, delay);
            cleanups.push(() => window.clearTimeout(id));
            return id;
        },
        registerCleanup(cleanup) {
            if (typeof cleanup === 'function') cleanups.push(cleanup);
            return () => {};
        },
    };
}

function normalizeClassTokens(value) {
    if (Array.isArray(value)) {
        return value.flatMap(normalizeClassTokens);
    }
    if (typeof value !== 'string') return [];
    return value
        .split(/\s+/)
        .map(token => token.trim())
        .filter(Boolean);
}

/**
 * 显示确认弹窗
 * @param {HTMLElement} container 容器
 * @param {string} title 标题
 * @param {string} message 消息
 * @param {Function} onConfirm 确认回调
 * @param {string} confirmText 确认按钮文字
 * @param {string} cancelText 取消按钮文字
 * @param {Object} runtime 可选 runtime scope
 * @param {Object} options 可选弹窗配置
 * @param {string|string[]} options.overlayClassName overlay 额外 class
 * @param {Function} options.onCancel 取消回调
 */
export function showConfirmDialog(container, title, message, onConfirm, confirmText = '确认', cancelText = '取消', runtime = null, options = {}) {
    const runtimeApi = createDialogRuntime(runtime);
    const candidateMountRoot = container.matches('.phone-app-page')
        ? container
        : (container.querySelector('.phone-app-page') || container.closest('.phone-app-page') || container);
    const mountRoot = candidateMountRoot instanceof HTMLElement ? candidateMountRoot : container;
    const existing = mountRoot.querySelector('.phone-confirm-dialog-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'phone-confirm-dialog-overlay';
    normalizeClassTokens(options?.overlayClassName).forEach(className => overlay.classList.add(className));
    overlay.innerHTML = `
        <div class="phone-confirm-dialog">
            <div class="phone-confirm-dialog-title">${escapeHtml(title)}</div>
            <div class="phone-confirm-dialog-message">${escapeHtml(message)}</div>
            <div class="phone-confirm-dialog-buttons">
                ${options?.hideCancel ? '' : `<button type="button" class="phone-confirm-dialog-btn phone-confirm-dialog-cancel">${escapeHtml(cancelText)}</button>`}
                <button type="button" class="phone-confirm-dialog-btn phone-confirm-dialog-confirm">${escapeHtml(confirmText)}</button>
            </div>
        </div>
    `;

    const closeDialog = () => {
        overlay.classList.remove('phone-confirm-dialog-show');
        runtimeApi.setTimeout(() => overlay.remove(), 200);
    };

    runtimeApi.addEventListener(overlay.querySelector('.phone-confirm-dialog-cancel'), 'click', () => {
        closeDialog();
        options?.onCancel?.();
    });
    runtimeApi.addEventListener(overlay.querySelector('.phone-confirm-dialog-confirm'), 'click', () => {
        closeDialog();
        onConfirm?.();
    });
    runtimeApi.registerCleanup?.(() => overlay.remove());

    mountRoot.appendChild(overlay);
    runtimeApi.setTimeout(() => overlay.classList.add('phone-confirm-dialog-show'), 10);
}

export function showAlertDialog(container, title, message, confirmText = '知道了', runtime = null, options = {}) {
    showConfirmDialog(container, title, message, null, confirmText, '', runtime, { ...options, hideCancel: true });
}
