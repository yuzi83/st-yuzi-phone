import { downloadJsonPack, pickJsonPackFile } from './json-pack-actions.js';

export const QQ_IMAGE_LIBRARY_PACK_FILENAME = '玉子QQ图片资料.json';

export function downloadImageLibraryPack(pack) {
    downloadJsonPack(QQ_IMAGE_LIBRARY_PACK_FILENAME, pack);
}

export function pickImageLibraryPackFile(callback, options = {}) {
    pickJsonPackFile(callback, options);
}
