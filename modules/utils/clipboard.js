export async function writeToClipboard(value) {
    if (globalThis.navigator?.clipboard?.writeText) return globalThis.navigator.clipboard.writeText(value);
    const document = globalThis.document;
    if (!document?.createElement || !document.body) return false;
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    const focused = document.activeElement;
    document.body.append(textarea);
    try {
        textarea.focus({ preventScroll: true });
        textarea.select();
        return document.execCommand?.('copy') === true;
    } finally {
        textarea.remove();
        focused?.focus?.({ preventScroll: true });
    }
}
