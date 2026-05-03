function createHomeToastRuntime(runtime) {
    if (runtime && typeof runtime.setTimeout === 'function') {
        return runtime;
    }

    const cleanups = [];
    return {
        isDisposed() {
            return false;
        },
        registerCleanup(cleanup) {
            if (typeof cleanup === 'function') cleanups.push(cleanup);
            return () => {};
        },
        setTimeout(callback, delay) {
            const id = window.setTimeout(callback, delay);
            cleanups.push(() => window.clearTimeout(id));
            return id;
        },
    };
}

function isRuntimeDisposed(runtime) {
    return Boolean(runtime && typeof runtime.isDisposed === 'function' && runtime.isDisposed());
}

export function showHomeToast(container, msg, isError = false, runtime = null) {
    if (!(container instanceof HTMLElement)) return;

    const runtimeApi = createHomeToastRuntime(runtime);
    const existing = container.querySelector('.phone-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `phone-toast ${isError ? 'phone-toast-error' : 'phone-toast-success'}`;
    toast.textContent = String(msg || '');
    (container.querySelector('.phone-home') || container).appendChild(toast);
    runtimeApi.registerCleanup?.(() => toast.remove());

    runtimeApi.setTimeout(() => {
        if (!isRuntimeDisposed(runtimeApi) && toast.isConnected) {
            toast.classList.add('phone-toast-show');
        }
    }, 10);
    runtimeApi.setTimeout(() => {
        if (isRuntimeDisposed(runtimeApi) || !toast.isConnected) return;
        toast.classList.remove('phone-toast-show');
        runtimeApi.setTimeout(() => toast.remove(), 300);
    }, 1900);
}

export async function handleDockAction(app, container, deps = {}) {
    const {
        navigateTo,
        openVisualizerWithStatus,
        openDatabaseSettingsWithStatus,
        runtime = null,
    } = deps;

    if (!app || app.action !== 'invoke') {
        if (typeof navigateTo === 'function') {
            navigateTo(app?.route || 'home');
        }
        return;
    }

    if (isRuntimeDisposed(runtime)) return;
    showHomeToast(container, app.pendingMessage || '处理中...', false, runtime);

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

    if (isRuntimeDisposed(runtime)) return;
    showHomeToast(container, result.message, !result.ok, runtime);
}
