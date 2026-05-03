import { triggerManualUpdate } from '../../phone-core/data-api.js';

function bindManualUpdateClick(runtime, target, listener) {
    if (!target || typeof target.addEventListener !== 'function' || typeof listener !== 'function') {
        return () => {};
    }
    if (runtime && typeof runtime.addEventListener === 'function') {
        const cleanup = runtime.addEventListener(target, 'click', listener);
        return typeof cleanup === 'function' ? cleanup : () => {};
    }
    target.addEventListener('click', listener);
    return () => target.removeEventListener('click', listener);
}

/**
 * @param {HTMLElement} container
 * @param {string} [btnSelector='#phone-trigger-update']
 * @param {string | null} [statusSelector='#phone-update-status']
 * @param {object | null} [runtime=null]
 */
export function setupManualUpdateBtn(container, btnSelector = '#phone-trigger-update', statusSelector = '#phone-update-status', runtime = null) {
    const btn = /** @type {HTMLButtonElement | null} */ (container.querySelector(btnSelector));
    if (!(btn instanceof HTMLButtonElement)) return () => {};

    let disposed = false;

    const resolveStatusEl = () => (statusSelector ? container.querySelector(statusSelector) : null);
    const isDisposed = () => disposed || Boolean(runtime && typeof runtime.isDisposed === 'function' && runtime.isDisposed());
    const setPendingUi = () => {
        if (isDisposed()) return;
        const statusEl = resolveStatusEl();
        btn.disabled = true;
        btn.classList.add('phone-btn-loading');
        if (statusEl) {
            statusEl.textContent = '正在触发更新...';
            statusEl.className = 'phone-update-status phone-status-pending';
        }
    };

    const setResultUi = (ok) => {
        if (isDisposed()) return;
        const statusEl = resolveStatusEl();
        if (statusEl) {
            if (ok) {
                statusEl.textContent = '更新已触发';
                statusEl.className = 'phone-update-status phone-status-success';
            } else {
                statusEl.textContent = '未找到更新接口，请确保数据库脚本已加载';
                statusEl.className = 'phone-update-status phone-status-error';
            }
        }
    };

    const setErrorUi = (error) => {
        if (isDisposed()) return;
        const statusEl = resolveStatusEl();
        if (statusEl) {
            const message = error instanceof Error ? error.message : String(error || '未知错误');
            statusEl.textContent = '更新失败: ' + message;
            statusEl.className = 'phone-update-status phone-status-error';
        }
    };

    const clearPendingUi = () => {
        if (isDisposed()) return;
        btn.disabled = false;
        btn.classList.remove('phone-btn-loading');
    };

    const onClick = async () => {
        setPendingUi();

        try {
            const ok = await triggerManualUpdate();
            setResultUi(ok);
        } catch (error) {
            setErrorUi(error);
        } finally {
            clearPendingUi();
        }
    };

    const cleanupClick = bindManualUpdateClick(runtime, btn, onClick);

    const cleanup = () => {
        disposed = true;
        cleanupClick();
    };

    if (runtime && typeof runtime.registerCleanup === 'function') {
        runtime.registerCleanup(cleanup);
    }

    return cleanup;
}
