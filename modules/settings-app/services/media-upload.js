function clampNumber(value, min, max, fallback = min) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('图片读取失败'));
        reader.readAsDataURL(file);
    });
}

function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('图片解析失败'));
        img.src = dataUrl;
    });
}

function normalizeCoverage(value) {
    return clampNumber(value, 0.45, 0.95, 0.78);
}

function normalizeCropRect(rect, constraints = {}) {
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

function buildInitialCropRect(preset, naturalWidth, naturalHeight, coverage = 0.78) {
    const safePreset = String(preset || '').trim();
    const safeCoverage = normalizeCoverage(coverage);

    if (safePreset === 'icon' || safePreset === 'button-cover' || safePreset === 'toggle-cover') {
        const size = clampNumber(safeCoverage, 0.5, 0.92, 0.72);
        return normalizeCropRect({
            x: (1 - size) / 2,
            y: (1 - size) / 2,
            w: size,
            h: size,
        });
    }

    if (safePreset === 'background') {
        const isPortrait = naturalHeight > naturalWidth;
        const w = isPortrait ? 0.88 : 0.92;
        const h = isPortrait ? 0.84 : 0.78;
        return normalizeCropRect({
            x: (1 - w) / 2,
            y: (1 - h) / 2,
            w,
            h,
        });
    }

    const w = clampNumber(safeCoverage, 0.52, 0.9, 0.78);
    const h = clampNumber(safeCoverage, 0.52, 0.9, 0.78);
    return normalizeCropRect({
        x: (1 - w) / 2,
        y: (1 - h) / 2,
        w,
        h,
    });
}

function computeNextCropRect(startRect, dragType, dx, dy, constraints = {}) {
    const minW = clampNumber(constraints.minW, 0.02, 0.95, 0.08);
    const minH = clampNumber(constraints.minH, 0.02, 0.95, 0.08);
    const safeStart = normalizeCropRect(startRect, { minW, minH });

    let left = safeStart.x;
    let top = safeStart.y;
    let right = safeStart.x + safeStart.w;
    let bottom = safeStart.y + safeStart.h;

    if (dragType === 'move') {
        const width = safeStart.w;
        const height = safeStart.h;
        left = clampNumber(left + dx, 0, Math.max(0, 1 - width), left);
        top = clampNumber(top + dy, 0, Math.max(0, 1 - height), top);
        return { x: left, y: top, w: width, h: height };
    }

    if (String(dragType).includes('w')) left += dx;
    if (String(dragType).includes('e')) right += dx;
    if (String(dragType).includes('n')) top += dy;
    if (String(dragType).includes('s')) bottom += dy;

    if (right - left < minW) {
        if (String(dragType).includes('w')) {
            left = right - minW;
        } else {
            right = left + minW;
        }
    }

    if (bottom - top < minH) {
        if (String(dragType).includes('n')) {
            top = bottom - minH;
        } else {
            bottom = top + minH;
        }
    }

    left = Math.max(0, left);
    top = Math.max(0, top);
    right = Math.min(1, right);
    bottom = Math.min(1, bottom);

    if (right - left < minW) {
        if (String(dragType).includes('w')) {
            left = Math.max(0, right - minW);
        } else {
            right = Math.min(1, left + minW);
        }
    }

    if (bottom - top < minH) {
        if (String(dragType).includes('n')) {
            top = Math.max(0, bottom - minH);
        } else {
            bottom = Math.min(1, top + minH);
        }
    }

    return normalizeCropRect({
        x: left,
        y: top,
        w: right - left,
        h: bottom - top,
    }, { minW, minH });
}

function buildCropDataUrl(sourceImage, cropRect) {
    const naturalWidth = Number(sourceImage?.naturalWidth || sourceImage?.width || 0);
    const naturalHeight = Number(sourceImage?.naturalHeight || sourceImage?.height || 0);
    if (naturalWidth <= 0 || naturalHeight <= 0) {
        throw new Error('图片尺寸无效，无法裁剪');
    }

    const safeRect = normalizeCropRect(cropRect, {
        minW: Math.max(0.02, 24 / naturalWidth),
        minH: Math.max(0.02, 24 / naturalHeight),
    });

    const sx = Math.max(0, Math.round(safeRect.x * naturalWidth));
    const sy = Math.max(0, Math.round(safeRect.y * naturalHeight));
    const sw = Math.max(1, Math.round(safeRect.w * naturalWidth));
    const sh = Math.max(1, Math.round(safeRect.h * naturalHeight));

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) {
        throw new Error('无法创建裁剪画布');
    }

    ctx.drawImage(sourceImage, sx, sy, sw, sh, 0, 0, sw, sh);
    return canvas.toDataURL('image/png');
}

async function compressDataUrl(rawDataUrl, { maxWidth = 1440, maxHeight = 1440, quality = 0.82 } = {}) {
    const img = await loadImage(rawDataUrl);
    const srcW = Number(img.naturalWidth || img.width || 0);
    const srcH = Number(img.naturalHeight || img.height || 0);
    if (srcW <= 0 || srcH <= 0) return rawDataUrl;

    const ratio = Math.min(1, maxWidth / srcW, maxHeight / srcH);
    const targetW = Math.max(1, Math.round(srcW * ratio));
    const targetH = Math.max(1, Math.round(srcH * ratio));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return rawDataUrl;

    ctx.drawImage(img, 0, 0, targetW, targetH);

    const webp = canvas.toDataURL('image/webp', clampNumber(quality, 0.5, 0.92, 0.82));
    if (typeof webp === 'string' && webp.startsWith('data:image/webp')) {
        return webp;
    }

    return canvas.toDataURL('image/jpeg', clampNumber(quality, 0.5, 0.9, 0.82));
}

async function openImageCropDialog(rawDataUrl, options = {}) {
    const sourceImage = await loadImage(rawDataUrl);
    const title = String(options.cropTitle || '裁剪图片').trim() || '裁剪图片';
    const description = String(options.cropDescription || '拖动裁剪框与边缘圆点，确认后再保存。').trim();
    const preset = String(options.cropPreset || '').trim();
    const initialCoverage = normalizeCoverage(options.cropInitialCoverage);

    const overlay = document.createElement('div');
    overlay.className = 'phone-image-crop-overlay';
    overlay.innerHTML = `
        <div class="phone-image-crop-dialog" role="dialog" aria-modal="true">
            <div class="phone-image-crop-head">
                <div class="phone-image-crop-title"></div>
                <div class="phone-image-crop-desc"></div>
            </div>
            <div class="phone-image-crop-stage-wrap">
                <div class="phone-image-crop-stage">
                    <img class="phone-image-crop-image" alt="待裁剪图片">
                    <div class="phone-image-crop-box">
                        <div class="phone-image-crop-grid">
                            <span class="phone-image-crop-guideline is-vertical is-one"></span>
                            <span class="phone-image-crop-guideline is-vertical is-two"></span>
                            <span class="phone-image-crop-guideline is-horizontal is-one"></span>
                            <span class="phone-image-crop-guideline is-horizontal is-two"></span>
                        </div>
                        <span class="phone-image-crop-handle" data-handle="nw"></span>
                        <span class="phone-image-crop-handle" data-handle="n"></span>
                        <span class="phone-image-crop-handle" data-handle="ne"></span>
                        <span class="phone-image-crop-handle" data-handle="e"></span>
                        <span class="phone-image-crop-handle" data-handle="se"></span>
                        <span class="phone-image-crop-handle" data-handle="s"></span>
                        <span class="phone-image-crop-handle" data-handle="sw"></span>
                        <span class="phone-image-crop-handle" data-handle="w"></span>
                    </div>
                </div>
            </div>
            <div class="phone-image-crop-meta"></div>
            <div class="phone-image-crop-actions">
                <button type="button" class="phone-settings-btn phone-image-crop-reset">重置</button>
                <div class="phone-image-crop-actions-main">
                    <button type="button" class="phone-settings-btn phone-image-crop-cancel">取消</button>
                    <button type="button" class="phone-settings-btn phone-settings-btn-primary phone-image-crop-confirm">确认裁剪</button>
                </div>
            </div>
        </div>
    `;

    const titleEl = overlay.querySelector('.phone-image-crop-title');
    const descEl = overlay.querySelector('.phone-image-crop-desc');
    const imageEl = overlay.querySelector('.phone-image-crop-image');
    const stageEl = overlay.querySelector('.phone-image-crop-stage');
    const boxEl = overlay.querySelector('.phone-image-crop-box');
    const metaEl = overlay.querySelector('.phone-image-crop-meta');
    const resetBtn = overlay.querySelector('.phone-image-crop-reset');
    const cancelBtn = overlay.querySelector('.phone-image-crop-cancel');
    const confirmBtn = overlay.querySelector('.phone-image-crop-confirm');
    const handleEls = Array.from(overlay.querySelectorAll('.phone-image-crop-handle'));

    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = description;
    if (imageEl instanceof HTMLImageElement) imageEl.src = rawDataUrl;

    const naturalWidth = Number(sourceImage.naturalWidth || sourceImage.width || 0);
    const naturalHeight = Number(sourceImage.naturalHeight || sourceImage.height || 0);
    const constraints = {
        minW: Math.max(0.04, Math.min(0.4, 48 / Math.max(1, naturalWidth))),
        minH: Math.max(0.04, Math.min(0.4, 48 / Math.max(1, naturalHeight))),
    };

    let cropRect = buildInitialCropRect(preset, naturalWidth, naturalHeight, initialCoverage);
    let displayRect = null;
    let dragState = null;

    const syncDisplayRect = () => {
        if (!(stageEl instanceof HTMLElement) || !(imageEl instanceof HTMLImageElement)) return;
        const stageBox = stageEl.getBoundingClientRect();
        const imageBox = imageEl.getBoundingClientRect();
        if (imageBox.width <= 0 || imageBox.height <= 0) return;

        displayRect = {
            left: imageBox.left - stageBox.left,
            top: imageBox.top - stageBox.top,
            width: imageBox.width,
            height: imageBox.height,
        };
        renderCropBox();
    };

    const renderCropBox = () => {
        if (!(boxEl instanceof HTMLElement) || !(metaEl instanceof HTMLElement) || !displayRect) return;

        boxEl.style.left = `${displayRect.left + cropRect.x * displayRect.width}px`;
        boxEl.style.top = `${displayRect.top + cropRect.y * displayRect.height}px`;
        boxEl.style.width = `${cropRect.w * displayRect.width}px`;
        boxEl.style.height = `${cropRect.h * displayRect.height}px`;

        const pixelWidth = Math.max(1, Math.round(cropRect.w * naturalWidth));
        const pixelHeight = Math.max(1, Math.round(cropRect.h * naturalHeight));
        metaEl.textContent = `裁剪区域：${pixelWidth} × ${pixelHeight}px`;
    };

    const stopDragging = () => {
        dragState = null;
        overlay.classList.remove('is-dragging');
    };

    const startDragging = (type, event) => {
        if (!displayRect) return;
        dragState = {
            type,
            startX: event.clientX,
            startY: event.clientY,
            startRect: { ...cropRect },
        };
        overlay.classList.add('is-dragging');
        event.preventDefault();
    };

    const handlePointerMove = (event) => {
        if (!dragState || !displayRect) return;
        const dx = (event.clientX - dragState.startX) / Math.max(1, displayRect.width);
        const dy = (event.clientY - dragState.startY) / Math.max(1, displayRect.height);
        cropRect = computeNextCropRect(dragState.startRect, dragState.type, dx, dy, constraints);
        renderCropBox();
    };

    const closeDialog = (result) => {
        stopDragging();
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', stopDragging);
        window.removeEventListener('keydown', handleKeydown);
        window.removeEventListener('resize', syncDisplayRect);

        overlay.classList.remove('is-visible');
        setTimeout(() => {
            try { overlay.remove(); } catch {}
        }, 180);
        resolvePromise(result);
    };

    const handleKeydown = (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeDialog(null);
        }
    };

    boxEl?.addEventListener('pointerdown', (event) => {
        const target = event.target;
        if (target instanceof HTMLElement && target.closest('.phone-image-crop-handle')) return;
        startDragging('move', event);
    });

    handleEls.forEach((handle) => {
        handle.addEventListener('pointerdown', (event) => {
            const type = String(handle.dataset.handle || '').trim();
            if (!type) return;
            event.stopPropagation();
            startDragging(type, event);
        });
    });

    resetBtn?.addEventListener('click', () => {
        cropRect = buildInitialCropRect(preset, naturalWidth, naturalHeight, initialCoverage);
        renderCropBox();
    });

    cancelBtn?.addEventListener('click', () => closeDialog(null));
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
            closeDialog(null);
        }
    });

    confirmBtn?.addEventListener('click', () => {
        try {
            const croppedDataUrl = buildCropDataUrl(sourceImage, cropRect);
            closeDialog(croppedDataUrl);
        } catch (error) {
            closeDialog(Promise.reject(error));
        }
    });

    let resolvePromise;
    const resultPromise = new Promise((resolve) => {
        resolvePromise = resolve;
    });

    document.body.appendChild(overlay);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('keydown', handleKeydown);
    window.addEventListener('resize', syncDisplayRect);

    requestAnimationFrame(() => {
        overlay.classList.add('is-visible');
        syncDisplayRect();
        setTimeout(syncDisplayRect, 30);
    });

    if (imageEl instanceof HTMLImageElement) {
        if (imageEl.complete) {
            requestAnimationFrame(syncDisplayRect);
        } else {
            imageEl.addEventListener('load', () => {
                requestAnimationFrame(syncDisplayRect);
                setTimeout(syncDisplayRect, 30);
            }, { once: true });
        }
    }

    const result = await resultPromise;
    if (result && typeof result.then === 'function') {
        return result;
    }
    return result;
}

export function pickImageFile(callback, options = {}) {
    const maxSizeMB = clampNumber(options.maxSizeMB, 1, 64, 8);
    const onError = typeof options.onError === 'function' ? options.onError : null;
    const maxWidth = clampNumber(options.maxWidth, 128, 4096, 1440);
    const maxHeight = clampNumber(options.maxHeight, 128, 4096, 1440);
    const quality = clampNumber(options.quality, 0.5, 0.92, 0.82);

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);

    const cleanup = () => {
        try { input.remove(); } catch {}
    };

    input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) {
            cleanup();
            return;
        }

        if (!String(file.type || '').startsWith('image/')) {
            onError?.('请选择图片文件');
            cleanup();
            return;
        }

        const maxBytes = Math.max(1, maxSizeMB) * 1024 * 1024;
        if (Number(file.size) > maxBytes * 1.8) {
            onError?.(`图片过大（>${(maxSizeMB * 1.8).toFixed(1)}MB），请压缩后重试`);
            cleanup();
            return;
        }

        try {
            const rawDataUrl = await fileToDataUrl(file);
            if (!rawDataUrl) {
                onError?.('图片读取失败');
                cleanup();
                return;
            }

            const croppedDataUrl = await openImageCropDialog(rawDataUrl, options);
            if (!croppedDataUrl) {
                cleanup();
                return;
            }

            const compressed = await compressDataUrl(croppedDataUrl, {
                maxWidth,
                maxHeight,
                quality,
            });
            const best = estimateBase64Bytes(compressed) <= estimateBase64Bytes(croppedDataUrl)
                ? compressed
                : croppedDataUrl;

            if (estimateBase64Bytes(best) > maxBytes) {
                onError?.(`图片裁剪压缩后仍超过 ${maxSizeMB}MB，请缩小裁剪范围或换更小图片`);
                cleanup();
                return;
            }

            await Promise.resolve(callback(best));
        } catch (error) {
            onError?.(error?.message || '图片处理失败');
        } finally {
            cleanup();
        }
    });

    input.click();
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
