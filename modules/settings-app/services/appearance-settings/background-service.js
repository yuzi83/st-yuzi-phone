import { getPhoneSettings, savePhoneSetting } from '../../../settings.js';
import { cacheRemove, CACHE_STORES } from '../../../cache-manager.js';
import { escapeHtmlAttr } from '../../../utils/dom-escape.js';
import { Logger } from '../../../error-handler.js';
import { STORAGE_BUDGETS } from '../../constants.js';
import { estimateBase64Bytes, pickImageFile } from '../media-upload.js';
import { showToast } from '../../ui/toast.js';

const logger = Logger.withScope({ scope: 'settings-app/services/appearance-settings/background-service', feature: 'settings-app' });

export function setupBgUpload(container, options = {}) {
    const phoneSettings = getPhoneSettings();
    const preview = container.querySelector('#phone-bg-preview');
    const cachedKey = 'background-image';
    const cleanups = [];
    const safeOptions = options && typeof options === 'object' ? options : {};
    const runtime = safeOptions.runtime || safeOptions.pageRuntime || null;
    let disposed = false;

    const addCleanup = (cleanup) => {
        if (typeof cleanup === 'function') {
            cleanups.push(cleanup);
        }
    };

    const addListener = (target, type, listener, options) => {
        if (!target || typeof target.addEventListener !== 'function' || typeof listener !== 'function') {
            return;
        }
        target.addEventListener(type, listener, options);
        addCleanup(() => target.removeEventListener(type, listener, options));
    };

    if (phoneSettings.backgroundImage) {
        preview.innerHTML = `<img src="${escapeHtmlAttr(phoneSettings.backgroundImage)}" class="phone-bg-thumb">`;
    }

    const uploadBtn = container.querySelector('#phone-upload-bg');
    addListener(uploadBtn, 'click', () => {
        pickImageFile(async (dataUrl) => {
            if (disposed) return;
            if (estimateBase64Bytes(dataUrl) > STORAGE_BUDGETS.backgroundImageBytes) {
                showToast(container, '背景图过大，请缩小裁剪范围或选择更小图片', true);
                return;
            }

            const saved = savePhoneSetting('backgroundImage', dataUrl);
            if (saved !== true) {
                showToast(container, '背景保存失败，请稍后重试', true);
                return;
            }

            preview.innerHTML = `<img src="${escapeHtmlAttr(dataUrl)}" class="phone-bg-thumb">`;
            cacheRemove(CACHE_STORES.images, cachedKey).catch(() => {});
            showToast(container, '背景已更新');
        }, {
            runtime,
            maxSizeMB: 12,
            compress: false,
            cropTitle: '裁剪背景图',
            cropDescription: '可自由调整背景可见区域，确认后再保存。',
            cropPreset: 'background',
            onError: (msg) => {
                if (disposed) return;
                showToast(container, msg || '背景图片上传失败', true);
            },
        });
    });

    const clearBtn = container.querySelector('#phone-clear-bg');
    addListener(clearBtn, 'click', () => {
        savePhoneSetting('backgroundImage', null);
        preview.innerHTML = '';
        cacheRemove(CACHE_STORES.images, cachedKey).catch(() => {});
        showToast(container, '背景已清除');
    });

    return () => {
        disposed = true;
        const tasks = [...cleanups];
        cleanups.length = 0;
        tasks.reverse().forEach((cleanup) => {
            try {
                cleanup();
            } catch (error) {
                logger.warn('background cleanup 执行失败', error);
            }
        });
    };
}
