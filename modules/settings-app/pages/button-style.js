import { createDebouncedTask } from '../../runtime-manager.js';
import { escapeHtmlAttr } from '../../utils/dom-escape.js';
import { clampNumber } from '../../utils/object.js';
import { STORAGE_BUDGETS } from '../constants.js';
import { buildButtonStylePageHtml } from '../layout/frame.js';
import { pickImageFile, estimateBase64Bytes } from '../services/media-upload.js';
import { PHONE_ICONS } from '../../phone-home/icons.js';

function buildToggleCoverPreviewHtml(shape, coverDataUrl, sizePx = 40) {
    const safeShape = String(shape || 'circle') === 'rounded' ? 'rounded' : 'circle';
    const safeCover = String(coverDataUrl || '').trim();
    const safeSize = clampNumber(sizePx, 32, 72, 40);
    const coverStyle = safeCover
        ? `background-image:url('${escapeHtmlAttr(safeCover)}');`
        : '';
    const stateClass = safeCover ? 'has-cover' : 'no-cover';
    const shapeClass = safeShape === 'circle' ? 'is-circle' : 'is-rounded';
    const textHtml = safeShape === 'circle' || safeCover
        ? ''
        : '<span class="phone-toggle-preview-text">玉子</span>';

    return `
        <div class="phone-toggle-preview-shell">
            <div class="phone-toggle-preview-button ${shapeClass} ${stateClass}"
                style="${coverStyle}--phone-toggle-preview-size:${escapeHtmlAttr(safeSize)}px;"
                role="img"
                aria-label="${safeCover ? '按钮封面预览' : '毛玻璃按钮预览'}">
                <span class="phone-toggle-preview-icon">${PHONE_ICONS.phone || ''}</span>
                ${textHtml}
            </div>
        </div>
    `;
}

export function createButtonStylePage(ctx) {
    return {
        mount() {
            renderButtonStylePage(ctx);
        },
        update() {
            renderButtonStylePage(ctx);
        },
        dispose() {},
    };
}

export function renderButtonStylePage(ctx) {
    const {
        container,
        state,
        render,
        registerCleanup,
        pageRuntime,
        buttonStylePageService,
    } = ctx;
    const getPhoneSettings = buttonStylePageService.getPhoneSettings;
    const savePhoneSetting = buttonStylePageService.savePhoneSetting;
    const showToast = buttonStylePageService.showToast;

    const settings = getPhoneSettings();
    const currentSize = clampNumber(settings.phoneToggleStyleSize, 32, 72, 40);
    const currentShape = String(settings.phoneToggleStyleShape || 'circle') === 'rounded' ? 'rounded' : 'circle';
    const currentCover = typeof settings.phoneToggleCoverImage === 'string' && settings.phoneToggleCoverImage.trim()
        ? settings.phoneToggleCoverImage.trim()
        : '';
    const floatingToggleEnabled = settings.floatingToggleEnabled !== false;

    container.innerHTML = buildButtonStylePageHtml({
        currentSize,
        currentShape,
        currentCover,
        floatingToggleEnabled,
    });

    const runtime = pageRuntime && typeof pageRuntime === 'object' ? pageRuntime : null;
    const addCleanup = (cleanup) => {
        if (typeof cleanup !== 'function') {
            return () => {};
        }
        if (runtime?.registerCleanup) {
            return runtime.registerCleanup(cleanup);
        }
        if (typeof registerCleanup === 'function') {
            registerCleanup(cleanup);
            return () => {};
        }
        return () => {};
    };
    const addListener = (target, type, handler, options) => {
        if (runtime?.addEventListener) {
            return runtime.addEventListener(target, type, handler, options);
        }
        if (!target || typeof target.addEventListener !== 'function' || typeof handler !== 'function') {
            return () => {};
        }
        target.addEventListener(type, handler, options);
        return addCleanup(() => target.removeEventListener(type, handler, options));
    };
    const isPageDisposed = () => {
        if (runtime && typeof runtime.isDisposed === 'function') {
            return runtime.isDisposed();
        }
        return false;
    };
    const isPageActive = () => !isPageDisposed();

    const getCurrentShape = () => {
        const checked = shapeRadios.find((radio) => radio instanceof HTMLInputElement && radio.checked);
        return checked?.value === 'circle' ? 'circle' : 'rounded';
    };
    const getCurrentSize = () => {
        const raw = sizeInput instanceof HTMLInputElement ? Number(sizeInput.value) : Number(sizeRange?.value);
        return clampNumber(raw, 32, 72, currentSize);
    };
    const renderCoverPreview = (shape, coverDataUrl, sizePx = getCurrentSize()) => {
        if (preview) preview.innerHTML = buildToggleCoverPreviewHtml(shape, coverDataUrl, sizePx);
    };

    const backBtn = container.querySelector('.phone-nav-back');
    addListener(backBtn, 'click', () => {
        state.mode = 'home';
        render();
    });

    const sizeRange = container.querySelector('#phone-toggle-style-size-range');
    const sizeInput = container.querySelector('#phone-toggle-style-size-input');
    const shapeRadios = Array.from(container.querySelectorAll('input[name="phone-toggle-shape"]'));
    const uploadBtn = container.querySelector('#phone-toggle-cover-upload-btn');
    const clearBtn = container.querySelector('#phone-toggle-cover-clear-btn');
    const preview = container.querySelector('#phone-toggle-cover-preview');
    const floatingToggleCheckbox = container.querySelector('#phone-floating-toggle-enabled');
    const resetPositionBtn = container.querySelector('#phone-toggle-position-reset-btn');

    const emitToggleStyleUpdated = () => {
        window.dispatchEvent(new CustomEvent('yuzi-phone-toggle-style-updated'));
    };
    const emitTogglePositionReset = () => {
        window.dispatchEvent(new CustomEvent('yuzi-phone-toggle-position-reset'));
    };

    const saveToggleSizeDebounced = createDebouncedTask((next) => {
        savePhoneSetting('phoneToggleStyleSize', next);
        emitToggleStyleUpdated();
    }, 180);
    addCleanup(() => saveToggleSizeDebounced.flush?.());

    const setSizeValue = (raw, withToast = false, immediate = false) => {
        const next = clampNumber(raw, 32, 72, 40);
        if (sizeRange) sizeRange.value = String(next);
        if (sizeInput) sizeInput.value = String(next);

        if (immediate) {
            saveToggleSizeDebounced.cancel?.();
            savePhoneSetting('phoneToggleStyleSize', next);
            emitToggleStyleUpdated();
        } else {
            saveToggleSizeDebounced(next);
        }

        if (withToast) showToast(container, `按钮大小已调整为 ${next}px`);

        const latestCover = typeof getPhoneSettings().phoneToggleCoverImage === 'string'
            ? getPhoneSettings().phoneToggleCoverImage.trim()
            : '';
        renderCoverPreview(getCurrentShape(), latestCover, next);
    };

    addListener(sizeRange, 'input', () => {
        setSizeValue(sizeRange.value, false, false);
    });

    addListener(sizeInput, 'input', () => {
        setSizeValue(sizeInput.value, false, false);
    });

    addListener(sizeInput, 'change', () => {
        setSizeValue(sizeInput.value, true, true);
    });

    shapeRadios.forEach((radio) => {
        addListener(radio, 'change', () => {
            const nextShape = radio.checked && radio.value === 'circle' ? 'circle' : 'rounded';
            const latestCover = typeof getPhoneSettings().phoneToggleCoverImage === 'string'
                ? getPhoneSettings().phoneToggleCoverImage.trim()
                : '';
            renderCoverPreview(nextShape, latestCover, getCurrentSize());
            savePhoneSetting('phoneToggleStyleShape', nextShape);
            emitToggleStyleUpdated();
            showToast(container, nextShape === 'circle' ? '按钮已切换为圆形（文字已隐藏）' : '按钮已切换为长方形');
        });
    });

    addListener(floatingToggleCheckbox, 'change', () => {
        if (!(floatingToggleCheckbox instanceof HTMLInputElement)) return;
        savePhoneSetting('floatingToggleEnabled', floatingToggleCheckbox.checked);
        emitToggleStyleUpdated();
        showToast(container, floatingToggleCheckbox.checked ? '悬浮入口已显示' : '悬浮入口已隐藏');
    });

    addListener(resetPositionBtn, 'click', () => {
        emitTogglePositionReset();
        showToast(container, '悬浮按钮位置已重置');
    });

    addListener(uploadBtn, 'click', () => {
        pickImageFile((dataUrl) => {
            if (!isPageActive()) return;

            const safeDataUrl = String(dataUrl || '').trim();
            if (!safeDataUrl) {
                showToast(container, '封面读取失败：空数据', true);
                return;
            }

            if (estimateBase64Bytes(safeDataUrl) > STORAGE_BUDGETS.toggleCoverBytes) {
                showToast(container, `按钮封面过大（>${Math.round(STORAGE_BUDGETS.toggleCoverBytes / 1024 / 1024)}MB）`, true);
                return;
            }

            savePhoneSetting('phoneToggleCoverImage', safeDataUrl);
            emitToggleStyleUpdated();
            renderCoverPreview(getCurrentShape(), safeDataUrl, getCurrentSize());
            if (clearBtn instanceof HTMLButtonElement) {
                clearBtn.disabled = false;
            }
            showToast(container, '按钮封面已更新');
        }, {
            runtime,
            compress: false,
            maxSizeMB: 8,
            cropTitle: '裁剪悬浮按钮图片',
            cropDescription: '可自由调整按钮封面区域，建议保留主体在中心位置。',
            cropPreset: getCurrentShape() === 'circle' ? 'toggle-cover-circle' : 'toggle-cover-rounded',
            onError: (msg) => {
                if (!isPageActive()) return;
                showToast(container, msg || '按钮封面上传失败', true);
            },
        });
    });

    addListener(clearBtn, 'click', () => {
        savePhoneSetting('phoneToggleCoverImage', null);
        emitToggleStyleUpdated();
        renderCoverPreview(getCurrentShape(), null);
        if (clearBtn instanceof HTMLButtonElement) {
            clearBtn.disabled = true;
        }
        showToast(container, '按钮封面已清除');
    });

}
