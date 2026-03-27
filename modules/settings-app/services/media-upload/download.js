export function downloadTextFile(filename, text, mimeType = 'text/plain') {
    const blob = new Blob([String(text ?? '')], { type: mimeType });
    const url = URL.createObjectURL(blob);

    try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = String(filename || 'download.txt');
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    } finally {
        setTimeout(() => URL.revokeObjectURL(url), 500);
    }
}
