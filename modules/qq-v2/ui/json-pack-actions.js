import { downloadTextFile } from '../../settings-app/services/media-upload.js';

export function downloadJsonPack(filename, pack) {
    downloadTextFile(
        filename,
        JSON.stringify(pack, null, 2),
        'application/json',
    );
}

export function pickJsonPackFile(callback, options = {}) {
    const onError = typeof options.onError === 'function' ? options.onError : null;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.hidden = true;
    document.body.append(input);

    const cleanup = () => input.remove();
    input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) {
            cleanup();
            return;
        }
        try {
            const source = await file.text();
            if (!source.trim()) throw new Error('导入文件为空');
            await callback(source, Object.freeze({ name: String(file.name || '') }));
        } catch (error) {
            onError?.(error?.message || '读取导入文件失败');
        } finally {
            cleanup();
        }
    }, { once: true });
    input.click();
}
