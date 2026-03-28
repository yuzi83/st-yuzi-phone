import { getPhoneSettings, savePhoneSetting } from '../../../settings.js';
import { cacheGet, cacheRemove, cacheSet, CACHE_STORES } from '../../../cache-manager.js';
import { escapeHtmlAttr } from '../../../utils.js';
import { STORAGE_BUDGETS } from '../../constants.js';
import { estimateBase64Bytes, pickImageFile } from '../media-upload.js';
import { showToast } from '../../ui/toast.js';

export function setupBgUpload(container) {
    const phoneSettings = getPhoneSettings();
    const preview = container.querySelector('#phone-bg-preview');
    const cachedKey = 'background-image';

    if (phoneSettings.backgroundImage) {
        preview.innerHTML = `<img src="${escapeHtmlAttr(phoneSettings.backgroundImage)}" class="phone-bg-thumb">`;
    } else {
        cacheGet(CACHE_STORES.images, cachedKey).then((cached) => {
            if (typeof cached === 'string' && cached) {
                preview.innerHTML = `<img src="${escapeHtmlAttr(cached)}" class="phone-bg-thumb">`;
            }
        }).catch(() => {});
    }

    container.querySelector('#phone-upload-bg')?.addEventListener('click', () => {
        pickImageFile(async (dataUrl) => {
            if (estimateBase64Bytes(dataUrl) > STORAGE_BUDGETS.backgroundImageBytes) {
                showToast(container, '背景图压缩后仍过大，请选择更小图片', true);
                return;
            }

            savePhoneSetting('backgroundImage', dataUrl);
            preview.innerHTML = `<img src="${escapeHtmlAttr(dataUrl)}" class="phone-bg-thumb">`;
            cacheSet(CACHE_STORES.images, cachedKey, dataUrl, 1000 * 60 * 60 * 24 * 30).catch(() => {});
            showToast(container, '背景已更新');
        }, {
            maxSizeMB: 12,
            maxWidth: 1920,
            maxHeight: 1920,
            quality: 0.8,
            cropTitle: '裁剪背景图',
            cropDescription: '可自由调整背景可见区域，确认后再保存。',
            cropPreset: 'background',
            onError: (msg) => showToast(container, msg || '背景图片上传失败', true),
        });
    });

    container.querySelector('#phone-clear-bg')?.addEventListener('click', () => {
        savePhoneSetting('backgroundImage', null);
        preview.innerHTML = '';
        cacheRemove(CACHE_STORES.images, cachedKey).catch(() => {});
        showToast(container, '背景已清除');
    });
}
