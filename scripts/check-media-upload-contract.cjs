const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    facade: 'modules/settings-app/services/media-upload.js',
    core: 'modules/settings-app/services/media-upload/core.js',
    crop: 'modules/settings-app/services/media-upload/crop.js',
    picker: 'modules/settings-app/services/media-upload/picker.js',
    rawPicker: 'modules/settings-app/services/media-upload/raw-picker.js',
    imageCropCss: 'styles/phone-base/08-image-crop.css',
    download: 'modules/settings-app/services/media-upload/download.js',
    appearance: 'modules/settings-app/services/appearance-settings.js',
    appearancePage: 'modules/settings-app/pages/appearance.js',
    backgroundService: 'modules/settings-app/services/appearance-settings/background-service.js',
    iconUploadService: 'modules/settings-app/services/appearance-settings/icon-upload-service.js',
    buttonStyle: 'modules/settings-app/pages/button-style.js',
    constants: 'modules/settings-app/constants.js',
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
    check(results, 'facade', 're-export pickImageFiles()', has(contents.facade, 'export { pickImageFiles } from'));
    check(results, 'facade', '继续 re-export estimateBase64Bytes()', has(contents.facade, 'estimateBase64Bytes,'));
    check(results, 'facade', '继续 re-export estimateIconsStorageBytes()', has(contents.facade, 'estimateIconsStorageBytes,'));
    check(results, 'facade', '继续 re-export downloadTextFile()', has(contents.facade, 'export { downloadTextFile } from'));

    check(results, 'core', '存在 clampNumber()', has(contents.core, 'export function clampNumber('));
    check(results, 'core', '存在 fileToDataUrl()', has(contents.core, 'export function fileToDataUrl('));
    check(results, 'core', '存在 estimateBase64Bytes()', has(contents.core, 'export function estimateBase64Bytes('));
    check(results, 'core', '存在 estimateIconsStorageBytes()', has(contents.core, 'export function estimateIconsStorageBytes('));

    check(results, 'crop', '存在 compressDataUrl()', has(contents.crop, 'export async function compressDataUrl('));
    check(results, 'crop', '存在 openImageCropDialog()', has(contents.crop, 'export async function openImageCropDialog('));
    check(results, 'crop', '裁剪弹窗通过壳内临时层服务挂载', has(contents.crop, "from '../../../phone-core/shell-temporary-layer-host.js';") && has(contents.crop, 'export function mountPhoneImageCropOverlay('));
    check(results, 'crop', '裁剪弹窗支持默认开启的全图按钮 options', has(contents.crop, 'options.showCropFullImageButton !== false'));
    check(results, 'crop', '裁剪弹窗支持全图按钮文案 options 与默认全图文案', has(contents.crop, 'options.cropFullImageButtonText') && has(contents.crop, "'全图'"));
    check(results, 'crop', '裁剪弹窗渲染全图按钮节点', has(contents.crop, 'phone-image-crop-full'));
    check(results, 'crop', '全图按钮使用整张图片归一化裁剪矩形', has(contents.crop, 'normalizeCropRect({ x: 0, y: 0, w: 1, h: 1 }, constraints)'));
    check(results, 'crop', 'crop runtime adapter 暴露 isDisposed()', has(contents.crop, 'isDisposed()') && has(contents.crop, 'return !!safeRuntime?.isDisposed?.();'));
    check(results, 'crop', '裁剪弹窗挂载前检查 runtime disposed 且不再覆盖浏览器 body', has(contents.crop, 'if (runtime.isDisposed()) return null;') && has(contents.crop, 'unmountOverlay = mountPhoneImageCropOverlay(overlay,') && !has(contents.crop, 'document.body.appendChild(overlay);'));
    check(results, 'crop', '裁剪弹窗在关闭或页面销毁后忽略异步图片布局回调', has(contents.crop, 'const isDialogActive = () => !isClosed && !runtime.isDisposed();')
        && has(contents.crop, 'const syncDisplayRect = () => {\n        if (!isDialogActive()) return;')
        && has(contents.crop, 'runtime.requestAnimationFrame(() => {\n        if (!isDialogActive()) return;'));

    check(results, 'picker', '存在 pickImageFile()', has(contents.picker, 'export function pickImageFile('));
    check(results, 'picker', 'pickImageFile 默认保持压缩路径', has(contents.picker, 'const compress = options.compress !== false;'));
    check(results, 'picker', 'pickImageFile 支持关闭二次压缩', has(contents.picker, 'const best = compress') && has(contents.picker, ': croppedDataUrl;'));
    check(results, 'picker', 'pickImageFile 支持跳过裁剪并保留原图', has(contents.picker, 'const skipCrop = options.skipCrop === true;')
        && has(contents.picker, 'const croppedDataUrl = skipCrop')
        && has(contents.picker, '? rawDataUrl'));
    check(results, 'picker', 'pickImageFile 回调提供文件名与类型元数据', has(contents.picker, 'callback(best, Object.freeze({')
        && has(contents.picker, "name: String(file.name || '')")
        && has(contents.picker, "type: String(file.type || '')"));
    check(results, 'picker', 'pickImageFile 声明 runtime disposed helper', has(contents.picker, 'const isDisposed = () => !!runtime?.isDisposed?.();'));
    check(results, 'picker', 'pickImageFile 在异步节点后检查 disposed', has(contents.picker, 'const rawDataUrl = await fileToDataUrl(file);\n            if (isDisposed()) return;')
        && has(contents.picker, ': await openImageCropDialog(rawDataUrl, options);\n            if (isDisposed()) return;')
        && has(contents.picker, 'if (isDisposed()) return null;'));

    check(results, 'rawPicker', '存在 pickImageFiles()', has(contents.rawPicker, 'export function pickImageFiles('));
    check(results, 'rawPicker', '原图选择器默认允许多选且支持显式单选', has(contents.rawPicker, 'input.multiple = options.multiple !== false;'));
    check(results, 'rawPicker', '原图选择器按 FileList 顺序返回原始 File', has(contents.rawPicker, 'const files = [...(input.files || [])];')
        && has(contents.rawPicker, 'file,')
        && has(contents.rawPicker, 'files.map(imageFileRecord)'));
    check(results, 'rawPicker', '原图选择器在回调前整批校验图片类型和单文件大小', has(contents.rawPicker, 'files.find((file) => !String(file.type || \'\').startsWith(\'image/\'))')
        && has(contents.rawPicker, 'files.find((file) => Number(file.size) > maxBytes)')
        && contents.rawPicker.indexOf('const invalidFile =') < contents.rawPicker.indexOf('callback(Object.freeze(')
        && contents.rawPicker.indexOf('const oversizedFile =') < contents.rawPicker.indexOf('callback(Object.freeze('));
    check(results, 'rawPicker', '原图选择器不经过 Data URL、裁剪或压缩', !has(contents.rawPicker, 'fileToDataUrl')
        && !has(contents.rawPicker, 'openImageCropDialog')
        && !has(contents.rawPicker, 'compressDataUrl'));
    check(results, 'rawPicker', '文件选择取消或页面销毁时清理临时 input', has(contents.rawPicker, "window.addEventListener('focus', cleanupAfterPickerCloses")
        && has(contents.rawPicker, 'runtime?.registerCleanup?.(cleanup);'));
    check(results, 'imageCropCss', '裁剪 overlay 限制在小手机壳内', has(contents.imageCropCss, 'position: absolute;') && has(contents.imageCropCss, 'min-height: 100%;') && !has(contents.imageCropCss, 'min-height: 100dvh;'));
    check(results, 'imageCropCss', '裁剪按钮区支持 secondary 分组', has(contents.imageCropCss, '.phone-image-crop-actions-secondary'));
    check(results, 'imageCropCss', '裁剪按钮区保持 sticky 操作区', has(contents.imageCropCss, 'position: sticky;') && has(contents.imageCropCss, 'bottom: 0;'));
    check(results, 'imageCropCss', '移动端裁剪 overlay 顶部对齐并通过语义 token 增大触摸手柄', has(contents.imageCropCss, 'align-items: flex-start;') && has(contents.imageCropCss, 'width: var(--yuzi-phone-crop-handle-compact-size);') && has(contents.imageCropCss, 'height: var(--yuzi-phone-crop-handle-compact-size);'));
    check(results, 'imageCropCss', '裁剪弹窗复用 QQ 删除好友确认框的遮罩、表面、圆角和阴影语义变量', has(contents.imageCropCss, 'var(--yuzi-qq-overlay)')
        && has(contents.imageCropCss, 'var(--yuzi-qq-dialog-surface)')
        && has(contents.imageCropCss, 'var(--yuzi-qq-radius-dialog)')
        && has(contents.imageCropCss, 'var(--yuzi-qq-shadow-dialog)'));
    check(results, 'download', '存在 downloadTextFile()', has(contents.download, 'export function downloadTextFile('));

    check(results, 'appearance', 'appearance-settings façade 继续组合 background/icon upload service', has(contents.appearance, 'createIconUploadService({')
        && has(contents.appearance, 'getAppearancePack: getAppearancePackImpl,'));
    check(results, 'appearance', 'appearance-settings façade 转发 setupBgUpload options', has(contents.appearance, 'return setupBgUploadImpl(container, options);'));
    check(results, 'appearance', 'appearance-settings façade 转发 renderIconUploadList options', has(contents.appearance, 'return renderIconUploadListImpl(listEl, options);'));
    check(results, 'backgroundService', 'background-service 继续从 media-upload façade 导入上传能力', has(contents.backgroundService, "from '../media-upload.js';"));
    check(results, 'backgroundService', 'background-service 接收上传 runtime options', has(contents.backgroundService, 'export function setupBgUpload(container, options = {})'));
    check(results, 'backgroundService', 'background-service 将 runtime 传给 pickImageFile()', has(contents.backgroundService, 'runtime,\n            maxSizeMB: 12'));
    check(results, 'backgroundService', 'background-service 背景上传显式关闭二次压缩', has(contents.backgroundService, 'compress: false,'));
    check(results, 'backgroundService', 'background-service 背景上传不再传入有损质量参数', !has(contents.backgroundService, 'quality: 0.8'));
    check(results, 'backgroundService', 'background-service 背景保存失败不更新预览缓存', has(contents.backgroundService, "const saved = savePhoneSetting('backgroundImage', dataUrl);") && has(contents.backgroundService, 'if (saved !== true)'));
    check(results, 'constants', '背景图片预算提升到 12MB', has(contents.constants, 'backgroundImageBytes: 12 * 1024 * 1024'));
    check(results, 'iconUploadService', 'icon-upload-service 继续从 media-upload façade 导入上传能力', has(contents.iconUploadService, "from '../media-upload.js';"));
    check(results, 'iconUploadService', 'icon-upload-service 接收上传 runtime options', has(contents.iconUploadService, 'const renderIconUploadList = (listEl, options = {}) =>'));
    check(results, 'iconUploadService', 'icon-upload-service 将 runtime 传给 pickImageFile()', has(contents.iconUploadService, 'pickImageFile((dataUrl) => {')
        && has(contents.iconUploadService, 'runtime,\n                maxSizeMB: 6'));
    check(results, 'buttonStyle', '继续从 media-upload façade 导入按钮封面上传能力', has(contents.buttonStyle, "from '../services/media-upload.js';"));
    check(results, 'buttonStyle', 'button-style 将 page runtime 传给 pickImageFile()', has(contents.buttonStyle, 'runtime,\n            compress: false,\n            maxSizeMB: 8'));
    check(results, 'buttonStyle', 'button-style 声明页面 disposed helper', has(contents.buttonStyle, 'const isPageDisposed = () => {'));
    check(results, 'buttonStyle', 'button-style 按钮封面上传显式关闭二次压缩', has(contents.buttonStyle, 'compress: false,'));
    check(results, 'buttonStyle', 'button-style 上传成功回调先检查页面生命周期', has(contents.buttonStyle, 'pickImageFile((dataUrl) => {\n            if (!isPageActive()) return;'));
    check(results, 'buttonStyle', 'button-style 上传错误回调先检查页面生命周期', has(contents.buttonStyle, "onError: (msg) => {\n                if (!isPageActive()) return;\n                showToast(container, msg || '按钮封面上传失败', true);\n            },"));
    check(results, 'appearancePage', 'appearance 页面向背景上传服务传入 runtime', has(contents.appearancePage, 'setupBgUpload(container, { runtime })'));
    check(results, 'appearancePage', 'appearance 页面向图标上传服务传入 runtime', has(contents.appearancePage, '{ runtime, items: iconSlots },'));

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
