export function showHomeToast(container, msg, isError = false) {
    const existing = container.querySelector('.phone-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `phone-toast ${isError ? 'phone-toast-error' : 'phone-toast-success'}`;
    toast.textContent = String(msg || '');
    (container.querySelector('.phone-home') || container).appendChild(toast);

    setTimeout(() => toast.classList.add('phone-toast-show'), 10);
    setTimeout(() => {
        toast.classList.remove('phone-toast-show');
        setTimeout(() => toast.remove(), 300);
    }, 1900);
}

export async function handleDockAction(app, container, deps = {}) {
    const {
        navigateTo,
        openVisualizerWithStatus,
        openDatabaseSettingsWithStatus,
    } = deps;

    if (!app || app.action !== 'invoke') {
        if (typeof navigateTo === 'function') {
            navigateTo(app?.route || 'home');
        }
        return;
    }

    showHomeToast(container, app.pendingMessage || '处理中...');

    let result = { ok: false, message: '操作失败' };
    try {
        if (app.id === 'visualizer' && typeof openVisualizerWithStatus === 'function') {
            result = await openVisualizerWithStatus({ timeoutMs: 4000 });
        } else if (app.id === 'db_settings' && typeof openDatabaseSettingsWithStatus === 'function') {
            result = await openDatabaseSettingsWithStatus({ timeoutMs: 4000 });
        } else {
            result = { ok: false, message: '未支持的快捷操作' };
        }
    } catch (e) {
        result = {
            ok: false,
            message: `操作异常：${e?.message || '未知错误'}`,
        };
    }

    showHomeToast(container, result.message, !result.ok);
}
