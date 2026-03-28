import { triggerManualUpdate } from '../../phone-core/data-api.js';

/**
 * @param {HTMLElement} container
 * @param {string} [btnSelector='#phone-trigger-update']
 * @param {string | null} [statusSelector='#phone-update-status']
 */
export function setupManualUpdateBtn(container, btnSelector = '#phone-trigger-update', statusSelector = '#phone-update-status') {
    const btn = /** @type {HTMLButtonElement | null} */ (container.querySelector(btnSelector));
    if (!(btn instanceof HTMLButtonElement)) return;

    btn.addEventListener('click', async () => {
        const statusEl = statusSelector ? container.querySelector(statusSelector) : null;
        btn.disabled = true;
        btn.classList.add('phone-btn-loading');
        if (statusEl) {
            statusEl.textContent = '正在触发更新...';
            statusEl.className = 'phone-update-status phone-status-pending';
        }

        try {
            const ok = await triggerManualUpdate();
            if (statusEl) {
                if (ok) {
                    statusEl.textContent = '更新已触发';
                    statusEl.className = 'phone-update-status phone-status-success';
                } else {
                    statusEl.textContent = '未找到更新接口，请确保数据库脚本已加载';
                    statusEl.className = 'phone-update-status phone-status-error';
                }
            }
        } catch (error) {
            if (statusEl) {
                const message = error instanceof Error ? error.message : String(error || '未知错误');
                statusEl.textContent = '更新失败: ' + message;
                statusEl.className = 'phone-update-status phone-status-error';
            }
        }

        btn.disabled = false;
        btn.classList.remove('phone-btn-loading');
    });
}
