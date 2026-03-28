export function showToast(container, msg, isError = false) {
    const existing = container.querySelector('.phone-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `phone-toast ${isError ? 'phone-toast-error' : 'phone-toast-success'}`;
    toast.textContent = msg;
    (container.closest('.phone-app-page') || container).appendChild(toast);

    setTimeout(() => toast.classList.add('phone-toast-show'), 10);
    setTimeout(() => {
        toast.classList.remove('phone-toast-show');
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}
