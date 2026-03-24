import { createDebouncedTask } from '../../runtime-manager.js';
import { clampNumber, escapeHtmlAttr } from '../../utils.js';
import { STORAGE_BUDGETS } from '../constants.js';
import { buildButtonStylePageHtml } from '../layout/frame.js';
import { pickImageFile, estimateBase64Bytes } from '../services/media-upload.js';
import { showToast } from '../ui/toast.js';

export function renderButtonStylePage(ctx) {
    const {
        container,
        state,
        render,
        getPhoneSettings,
        savePhoneSetting,
        savePhoneSettingsPatch,
        rerenderButtonStyleKeepScroll,
    } = ctx;

    const settings = getPhoneSettings();
    const currentSize = clampNumber(settings.phoneToggleStyleSize, 32, 72, 44);
    const currentShape = String(settings.phoneToggleStyleShape || 'rounded') === 'circle' ? 'circle' : 'rounded';
    const currentCover = typeof settings.phoneToggleCoverImage === 'string' && settings.phoneToggleCoverImage.trim()
        ? settings.phoneToggleCoverImage.trim()
        : '';

    container.innerHTML = buildButtonStylePageHtml({
        currentSize,
        currentShape,
        currentCover,
    });

    container.querySelector('.phone-nav-back')?.addEventListener('click', () => {
        state.mode = 'home';
        render();
    });

    const sizeRange = container.querySelector('#phone-toggle-style-size-range');
    const sizeInput = container.querySelector('#phone-toggle-style-size-input');
    const shapeRadios = Array.from(container.querySelectorAll('input[name="phone-toggle-shape"]'));
    const uploadBtn = container.querySelector('#phone-toggle-cover-upload-btn');
    const clearBtn = container.querySelector('#phone-toggle-cover-clear-btn');
    const preview = container.querySelector('#phone-toggle-cover-preview');

    const emitToggleStyleUpdated = () => {
        window.dispatchEvent(new CustomEvent('yuzi-phone-toggle-style-updated'));
    };

    const saveToggleSizeDebounced = createDebouncedTask((next) => {
        savePhoneSetting('phoneToggleStyleSize', next);
        emitToggleStyleUpdated();
    }, 180);

    const setSizeValue = (raw, withToast = false, immediate = false) => {
        const next = clampNumber(raw, 32, 72, 44);
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
    };

    sizeRange?.addEventListener('input', () => {
        setSizeValue(sizeRange.value, false, false);
    });

    sizeInput?.addEventListener('input', () => {
        setSizeValue(sizeInput.value, false, false);
    });

    sizeInput?.addEventListener('change', () => {
        setSizeValue(sizeInput.value, true, true);
    });

    shapeRadios.forEach((radio) => {
        radio.addEventListener('change', () => {
            const nextShape = radio.checked && radio.value === 'circle' ? 'circle' : 'rounded';
            savePhoneSetting('phoneToggleStyleShape', nextShape);
            emitToggleStyleUpdated();
            showToast(container, nextShape === 'circle' ? '按钮已切换为圆形（文字已隐藏）' : '按钮已切换为长方形');
        });
    });

    uploadBtn?.addEventListener('click', () => {
        pickImageFile((dataUrl) => {
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
            if (preview) {
                preview.innerHTML = `<img src="${escapeHtmlAttr(safeDataUrl)}" class="phone-bg-thumb" alt="按钮封面预览">`;
            }
            if (clearBtn instanceof HTMLButtonElement) {
                clearBtn.disabled = false;
            }
            showToast(container, '按钮封面已更新');
        }, {
            maxSizeMB: 8,
            cropTitle: '裁剪悬浮按钮图片',
            cropDescription: '可自由调整按钮封面区域，建议保留主体在中心位置。',
            cropPreset: 'button-cover',
            onError: (msg) => showToast(container, msg || '按钮封面上传失败', true),
        });
    });

    clearBtn?.addEventListener('click', () => {
        savePhoneSetting('phoneToggleCoverImage', null);
        emitToggleStyleUpdated();
        if (preview) {
            preview.innerHTML = '<div class="phone-empty-msg">未设置封面</div>';
        }
        if (clearBtn instanceof HTMLButtonElement) {
            clearBtn.disabled = true;
        }
        showToast(container, '按钮封面已清除');
    });

}
