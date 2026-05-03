import {
    clampNumber,
    estimateBase64Bytes,
    fileToDataUrl,
} from './core.js';
import {
    compressDataUrl,
    openImageCropDialog,
} from './crop.js';

export function pickImageFile(callback, options = {}) {
    const maxSizeMB = clampNumber(options.maxSizeMB, 1, 64, 8);
    const onError = typeof options.onError === 'function' ? options.onError : null;
    const maxWidth = clampNumber(options.maxWidth, 128, 4096, 1440);
    const maxHeight = clampNumber(options.maxHeight, 128, 4096, 1440);
    const quality = clampNumber(options.quality, 0.5, 0.92, 0.82);
    const runtime = options.runtime || options.pageRuntime || null;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);

    const cleanup = () => {
        try {
            input.remove();
        } catch {}
    };

    const addListener = runtime?.addEventListener
        ? (...args) => runtime.addEventListener(...args)
        : (target, type, handler, listenerOptions) => {
            target.addEventListener(type, handler, listenerOptions);
            return () => target.removeEventListener(type, handler, listenerOptions);
        };
    runtime?.registerCleanup?.(cleanup);

    addListener(input, 'change', async () => {
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
