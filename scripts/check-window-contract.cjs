const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    facade: 'modules/window.js',
    runtime: 'modules/window/runtime.js',
    drag: 'modules/window/drag.js',
    resize: 'modules/window/resize.js',
    lifecycle: 'modules/phone-core/lifecycle.js',
};

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function has(content, snippet) {
    return content.includes(snippet);
}

function check(results, fileKey, description, ok) {
    results.push({ file: FILES[fileKey], description, ok });
}

function main() {
    const contents = Object.fromEntries(
        Object.entries(FILES).map(([key, relativePath]) => [key, read(relativePath)])
    );

    const results = [];

    check(results, 'facade', '继续 re-export destroyPhoneWindowInteractions()', has(contents.facade, "export { destroyPhoneWindowInteractions } from './window/runtime.js';"));
    check(results, 'facade', '继续 re-export initPhoneShellDrag()', has(contents.facade, "export { initPhoneShellDrag } from './window/drag.js';"));
    check(results, 'facade', '继续 re-export initPhoneShellResize()', has(contents.facade, "export { initPhoneShellResize } from './window/resize.js';"));

    check(results, 'runtime', '存在 getWindowInteractionRuntime()', has(contents.runtime, 'export function getWindowInteractionRuntime('));
    check(results, 'runtime', '存在 destroyPhoneWindowInteractions()', has(contents.runtime, 'export function destroyPhoneWindowInteractions('));
    check(results, 'runtime', '存在 DRAG_BOUND_ATTR', has(contents.runtime, "export const DRAG_BOUND_ATTR = 'yuziPhoneDragBound';"));
    check(results, 'runtime', '存在 RESIZE_BOUND_ATTR', has(contents.runtime, "export const RESIZE_BOUND_ATTR = 'resizeBound';"));

    check(results, 'drag', '存在 initPhoneShellDrag()', has(contents.drag, 'export function initPhoneShellDrag('));
    check(results, 'drag', '继续使用 getWindowInteractionRuntime()', has(contents.drag, 'getWindowInteractionRuntime()'));
    check(results, 'drag', '继续写入 phoneContainerX 设置', has(contents.drag, "savePhoneSetting('phoneContainerX'"));
    check(results, 'drag', '继续写入 phoneContainerY 设置', has(contents.drag, "savePhoneSetting('phoneContainerY'"));

    check(results, 'resize', '存在 initPhoneShellResize()', has(contents.resize, 'export function initPhoneShellResize('));
    check(results, 'resize', '继续使用 getWindowInteractionRuntime()', has(contents.resize, 'getWindowInteractionRuntime()'));
    check(results, 'resize', '继续写入 phoneContainerWidth 设置', has(contents.resize, "savePhoneSetting('phoneContainerWidth'"));
    check(results, 'resize', '继续写入 phoneContainerHeight 设置', has(contents.resize, "savePhoneSetting('phoneContainerHeight'"));

    check(results, 'lifecycle', '继续从 façade 导入窗口交互 API', has(contents.lifecycle, "from '../window.js';"));
    check(results, 'lifecycle', '继续初始化拖拽', has(contents.lifecycle, 'initPhoneShellDrag();'));
    check(results, 'lifecycle', '继续初始化缩放', has(contents.lifecycle, 'initPhoneShellResize();'));
    check(results, 'lifecycle', '继续销毁窗口交互', has(contents.lifecycle, 'destroyPhoneWindowInteractions();'));

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[window-contract-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[window-contract-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
