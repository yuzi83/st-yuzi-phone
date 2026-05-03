function createToastRuntime(runtime) {
    if (runtime && typeof runtime.setTimeout === 'function') return runtime;
    const cleanups = [];
    return {
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

export function showToast(container, msg, isError = false, runtime = null) {
    const runtimeApi = createToastRuntime(runtime);
    const existing = container.querySelector('.phone-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `phone-toast ${isError ? 'phone-toast-error' : 'phone-toast-success'}`;
    toast.textContent = msg;
    (container.closest('.phone-app-page') || container).appendChild(toast);
    runtimeApi.registerCleanup?.(() => toast.remove());

    runtimeApi.setTimeout(() => toast.classList.add('phone-toast-show'), 10);
    runtimeApi.setTimeout(() => {
        toast.classList.remove('phone-toast-show');
        runtimeApi.setTimeout(() => toast.remove(), 300);
    }, 2000);
}
