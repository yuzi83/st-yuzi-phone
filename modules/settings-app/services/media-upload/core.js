export function clampNumber(value, min, max, fallback = min) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

export function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('图片读取失败'));
        reader.readAsDataURL(file);
    });
}

export function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('图片解析失败'));
        img.src = dataUrl;
    });
}

export function normalizeCoverage(value) {
    return clampNumber(value, 0.45, 0.95, 0.78);
}

export function normalizeCropRect(rect, constraints = {}) {
    const minW = clampNumber(constraints.minW, 0.02, 0.95, 0.08);
    const minH = clampNumber(constraints.minH, 0.02, 0.95, 0.08);
    const safeRect = rect && typeof rect === 'object' ? rect : {};

    let x = Number.isFinite(Number(safeRect.x)) ? Number(safeRect.x) : 0;
    let y = Number.isFinite(Number(safeRect.y)) ? Number(safeRect.y) : 0;
    let w = Number.isFinite(Number(safeRect.w)) ? Number(safeRect.w) : 1;
    let h = Number.isFinite(Number(safeRect.h)) ? Number(safeRect.h) : 1;

    w = clampNumber(w, minW, 1, Math.max(minW, Math.min(1, w || minW)));
    h = clampNumber(h, minH, 1, Math.max(minH, Math.min(1, h || minH)));
    x = clampNumber(x, 0, Math.max(0, 1 - w), 0);
    y = clampNumber(y, 0, Math.max(0, 1 - h), 0);

    return { x, y, w, h };
}

export function estimateBase64Bytes(dataUrl) {
    const text = String(dataUrl || '');
    const idx = text.indexOf(',');
    const b64 = idx >= 0 ? text.slice(idx + 1) : text;
    if (!b64) return 0;
    return Math.floor(b64.length * 0.75);
}

export function estimateIconsStorageBytes(icons) {
    if (!icons || typeof icons !== 'object') return 0;

    let total = 0;
    Object.values(icons).forEach((value) => {
        total += estimateBase64Bytes(String(value || ''));
    });

    return total;
}
