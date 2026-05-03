const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    facade: 'modules/settings-app/services/media-upload.js',
    core: 'modules/settings-app/services/media-upload/core.js',
    crop: 'modules/settings-app/services/media-upload/crop.js',
    picker: 'modules/settings-app/services/media-upload/picker.js',
    download: 'modules/settings-app/services/media-upload/download.js',
    appearance: 'modules/settings-app/services/appearance-settings.js',
    appearancePage: 'modules/settings-app/pages/appearance.js',
    backgroundService: 'modules/settings-app/services/appearance-settings/background-service.js',
    iconUploadService: 'modules/settings-app/services/appearance-settings/icon-upload-service.js',
    buttonStyle: 'modules/settings-app/pages/button-style.js',
    beautify: 'modules/settings-app/pages/beautify.js',
};

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function normalizeLineEndings(value) {
    return String(value).replace(/\r\n?/g, '\n');
}

function has(content, snippet) {
    return normalizeLineEndings(content).includes(normalizeLineEndings(snippet));
}

function check(results, fileKey, description, ok) {
    results.push({ file: FILES[fileKey], description, ok });
}

function main() {
    const contents = Object.fromEntries(
        Object.entries(FILES).map(([key, relativePath]) => [key, read(relativePath)])
    );

    const results = [];

    check(results, 'facade', '继续 re-export pickImageFile()', has(contents.facade, 'export { pickImageFile } from'));
    check(results, 'facade', '继续 re-export estimateBase64Bytes()', has(contents.facade, 'estimateBase64Bytes,'));
    check(results, 'facade', '继续 re-export estimateIconsStorageBytes()', has(contents.facade, 'estimateIconsStorageBytes,'));
    check(results, 'facade', '继续 re-export downloadTextFile()', has(contents.facade, 'export { downloadTextFile } from'));

    check(results, 'core', '存在 clampNumber()', has(contents.core, 'export function clampNumber('));
    check(results, 'core', '存在 fileToDataUrl()', has(contents.core, 'export function fileToDataUrl('));
    check(results, 'core', '存在 estimateBase64Bytes()', has(contents.core, 'export function estimateBase64Bytes('));
    check(results, 'core', '存在 estimateIconsStorageBytes()', has(contents.core, 'export function estimateIconsStorageBytes('));

    check(results, 'crop', '存在 compressDataUrl()', has(contents.crop, 'export async function compressDataUrl('));
    check(results, 'crop', '存在 openImageCropDialog()', has(contents.crop, 'export async function openImageCropDialog('));

    check(results, 'picker', '存在 pickImageFile()', has(contents.picker, 'export function pickImageFile('));
    check(results, 'download', '存在 downloadTextFile()', has(contents.download, 'export function downloadTextFile('));

    check(results, 'appearance', 'appearance-settings façade 继续组合 background/icon upload service', has(contents.appearance, 'createIconUploadService()'));
    check(results, 'appearance', 'appearance-settings façade 转发 setupBgUpload options', has(contents.appearance, 'return setupBgUploadImpl(container, options);'));
    check(results, 'appearance', 'appearance-settings façade 转发 renderIconUploadList options', has(contents.appearance, 'return renderIconUploadListImpl(listEl, options);'));
    check(results, 'backgroundService', 'background-service 继续从 media-upload façade 导入上传能力', has(contents.backgroundService, "from '../media-upload.js';"));
    check(results, 'backgroundService', 'background-service 接收上传 runtime options', has(contents.backgroundService, 'export function setupBgUpload(container, options = {})'));
    check(results, 'backgroundService', 'background-service 将 runtime 传给 pickImageFile()', has(contents.backgroundService, 'runtime,\n            maxSizeMB: 12'));
    check(results, 'iconUploadService', 'icon-upload-service 继续从 media-upload façade 导入上传能力', has(contents.iconUploadService, "from '../media-upload.js';"));
    check(results, 'iconUploadService', 'icon-upload-service 接收上传 runtime options', has(contents.iconUploadService, 'const renderIconUploadList = (listEl, options = {}) =>'));
    check(results, 'iconUploadService', 'icon-upload-service 将 runtime 传给 pickImageFile()', has(contents.iconUploadService, 'runtime,\n                        maxSizeMB: 6'));
    check(results, 'buttonStyle', '继续从 media-upload façade 导入按钮封面上传能力', has(contents.buttonStyle, "from '../services/media-upload.js';"));
    check(results, 'buttonStyle', 'button-style 将 page runtime 传给 pickImageFile()', has(contents.buttonStyle, 'runtime,\n            maxSizeMB: 8'));
    check(results, 'buttonStyle', 'button-style 声明页面 disposed helper', has(contents.buttonStyle, 'const isPageDisposed = () => {'));
    check(results, 'buttonStyle', 'button-style 上传成功回调先检查页面生命周期', has(contents.buttonStyle, 'pickImageFile((dataUrl) => {\n            if (!isPageActive()) return;'));
    check(results, 'buttonStyle', 'button-style 上传错误回调先检查页面生命周期', has(contents.buttonStyle, "onError: (msg) => {\n                if (!isPageActive()) return;\n                showToast(container, msg || '按钮封面上传失败', true);\n            },"));
    check(results, 'appearancePage', 'appearance 页面向背景上传服务传入 runtime', has(contents.appearancePage, 'setupBgUpload(container, { runtime })'));
    check(results, 'appearancePage', 'appearance 页面向图标上传服务传入 runtime', has(contents.appearancePage, "renderIconUploadList(container.querySelector('#phone-icon-upload-list'), { runtime })"));
    check(results, 'beautify', '继续从 media-upload façade 导入下载能力', has(contents.beautify, "from '../services/media-upload.js';"));

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[media-upload-contract-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[media-upload-contract-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
