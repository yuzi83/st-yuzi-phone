const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    viewerRuntime: 'modules/table-viewer/runtime.js',
    viewerSharedUi: 'modules/table-viewer/shared-ui.js',
    addRowModal: 'modules/table-viewer/add-row-modal.js',
    homeRuntime: 'modules/phone-home/runtime.js',
    homeScreen: 'modules/phone-home/render.js',
    homeInteractions: 'modules/phone-home/interactions.js',
};

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function has(content, snippet) {
    return content.includes(snippet);
}

function lacks(content, snippet) {
    return !has(content, snippet);
}

function pushCheck(results, fileKey, description, ok) {
    results.push({
        file: FILES[fileKey],
        description,
        ok,
    });
}

function main() {
    const contents = Object.fromEntries(
        Object.entries(FILES).map(([key, relativePath]) => [key, read(relativePath)])
    );

    const results = [];

    pushCheck(results, 'viewerRuntime', 'viewer runtime 暴露 [`resolveViewerRuntime()`](modules/table-viewer/runtime.js:11)', has(contents.viewerRuntime, 'export function resolveViewerRuntime(target) {'));
    pushCheck(results, 'viewerRuntime', 'viewer runtime 挂载稳定宿主键 `VIEWER_RUNTIME_INSTANCE_KEY`', has(contents.viewerRuntime, "const VIEWER_RUNTIME_INSTANCE_KEY = '__yuziViewerRuntime';"));
    pushCheck(results, 'viewerRuntime', 'viewer runtime 创建统一 runtime scope', has(contents.viewerRuntime, "const viewerRuntimeScope = createRuntimeScope(`table-viewer:${sheetKey || 'unknown'}`);"));
    pushCheck(results, 'viewerRuntime', 'viewer runtime dispose 时释放统一 runtime scope', has(contents.viewerRuntime, 'viewerRuntimeScope.dispose();'));
    pushCheck(results, 'viewerRuntime', 'viewer runtime 暴露托管 [`setTimeout()`](modules/table-viewer/runtime.js:231)', has(contents.viewerRuntime, 'setTimeout(callback, delay) {'));
    pushCheck(results, 'viewerRuntime', 'viewer runtime 暴露托管 [`clearTimeout()`](modules/table-viewer/runtime.js:234)', has(contents.viewerRuntime, 'clearTimeout(timeoutId) {'));
    pushCheck(results, 'viewerRuntime', 'viewer runtime 绑定到 viewer host，供 DOM 祖先链解析', has(contents.viewerRuntime, 'host[VIEWER_RUNTIME_INSTANCE_KEY] = runtimeApi;'));

    pushCheck(results, 'viewerSharedUi', 'toast UI 直接消费 [`resolveViewerRuntime()`](modules/table-viewer/runtime.js:11)', has(contents.viewerSharedUi, "import { resolveViewerRuntime } from './runtime.js';"));
    pushCheck(results, 'viewerSharedUi', 'toast UI 提供 [`resolveToastTimerApi()`](modules/table-viewer/shared-ui.js:4)', has(contents.viewerSharedUi, 'function resolveToastTimerApi(container) {'));
    pushCheck(results, 'viewerSharedUi', 'toast UI 使用托管 timer API 调度显示/隐藏', has(contents.viewerSharedUi, 'const timerApi = resolveToastTimerApi(') && has(contents.viewerSharedUi, "timerApi.setTimeout(() => el.classList.add('show'), 10);") && has(contents.viewerSharedUi, 'timerApi.setTimeout(() => {'));
    pushCheck(results, 'viewerSharedUi', 'toast UI 不再以独立语句形式直接调用裸 [`setTimeout()`](modules/table-viewer/shared-ui.js:28)', lacks(contents.viewerSharedUi, "\n    setTimeout(() => el.classList.add('show'), 10);\n") && lacks(contents.viewerSharedUi, "\n    setTimeout(() => {\n        el.classList.remove('show');\n"));

    pushCheck(results, 'addRowModal', '新增条目弹窗直接消费 [`resolveViewerRuntime()`](modules/table-viewer/runtime.js:11)', has(contents.addRowModal, "import { resolveViewerRuntime } from './runtime.js';"));
    pushCheck(results, 'addRowModal', '新增条目弹窗优先使用注入 viewerRuntime，缺失时 fallback 到 resolveViewerRuntime()', has(contents.addRowModal, "const viewerRuntime = providedViewerRuntime && typeof providedViewerRuntime === 'object'") && has(contents.addRowModal, ': resolveViewerRuntime(container);'));
    pushCheck(results, 'addRowModal', '新增条目弹窗导出托管 timeout API', has(contents.addRowModal, 'const setManagedTimeout = viewerRuntime') && has(contents.addRowModal, 'const clearManagedTimeout = viewerRuntime'));
    pushCheck(results, 'addRowModal', '新增条目弹窗关闭定时器使用托管 [`setManagedTimeout()`](modules/table-viewer/add-row-modal.js:228)', has(contents.addRowModal, 'closeTimerId = setManagedTimeout(() => {'));
    pushCheck(results, 'addRowModal', '新增条目弹窗聚焦定时器使用托管 [`setManagedTimeout()`](modules/table-viewer/add-row-modal.js:237)', has(contents.addRowModal, 'focusTimerId = setManagedTimeout(() => {'));
    pushCheck(results, 'addRowModal', '新增条目弹窗 cleanup 使用托管 [`clearManagedTimeout()`](modules/table-viewer/add-row-modal.js:217)', has(contents.addRowModal, 'clearManagedTimeout(focusTimerId);') && has(contents.addRowModal, 'clearManagedTimeout(closeTimerId);'));

    pushCheck(results, 'homeRuntime', '首页建立稳定 home interaction runtime 键', has(contents.homeRuntime, "export const HOME_INTERACTION_RUNTIME_KEY = '__yuziHomeInteractionRuntime';"));
    pushCheck(results, 'homeRuntime', '首页复用未 dispose 的 interaction runtime，而非每次 render 重建', has(contents.homeRuntime, "if (previousRuntime && typeof previousRuntime.isDisposed === 'function' && !previousRuntime.isDisposed()) {") && has(contents.homeRuntime, 'return previousRuntime;'));
    pushCheck(results, 'homeRuntime', '首页 interaction runtime 使用 [`createRuntimeScope()`](modules/runtime-manager.js:48)', has(contents.homeRuntime, "const runtime = createRuntimeScope('phone-home');"));
    pushCheck(results, 'homeRuntime', '首页 interaction runtime 通过 [`observeDisconnection()`](modules/runtime-manager.js:203) 跟随容器销毁', has(contents.homeRuntime, 'const observerHandle = runtime.observeDisconnection(container, () => {'));
    pushCheck(results, 'homeScreen', '首页渲染将 interaction runtime 注入 grid 交互', has(contents.homeScreen, 'const interactionRuntime = ensureHomeInteractionRuntime(container);') && has(contents.homeScreen, 'bindHomeGridInteractions(grid, { navigateTo, runtime: interactionRuntime });'));
    pushCheck(results, 'homeScreen', '首页渲染将 interaction runtime 注入 dock 交互', has(contents.homeScreen, 'runtime: interactionRuntime,'));

    pushCheck(results, 'homeInteractions', '首页 grid 交互接收 runtime 依赖', has(contents.homeInteractions, 'const { navigateTo, runtime } = deps;'));
    pushCheck(results, 'homeInteractions', '首页 dock 交互接收 runtime 依赖', has(contents.homeInteractions, 'runtime,'));
    pushCheck(results, 'homeInteractions', '首页 grid 交互通过 scheduleRuntimeTimeout 调度延迟导航', has(contents.homeInteractions, 'function scheduleRuntimeTimeout(runtime, callback, delay)') && has(contents.homeInteractions, 'scheduleRuntimeTimeout(runtime, () => {'));
    pushCheck(results, 'homeInteractions', '首页 dock 交互通过 scheduleRuntimeTimeout 调度 tap 动画与 action', has(contents.homeInteractions, "scheduleRuntimeTimeout(runtime, () => iconEl.classList.remove('phone-app-tap'), 180);") && has(contents.homeInteractions, 'scheduleRuntimeTimeout(runtime, () => {'));
    pushCheck(results, 'homeInteractions', '首页交互不再直接使用旧的裸导航定时器调用', lacks(contents.homeInteractions, '        setTimeout(() => {'));

    const failed = results.filter((item) => !item.ok);

    if (failed.length > 0) {
        console.error('[interaction-runtime-check] 检查失败：');
        failed.forEach((item) => {
            console.error(`- ${item.file}: ${item.description}`);
        });
        process.exitCode = 1;
        return;
    }

    console.log('[interaction-runtime-check] 检查通过');
    results.forEach((item) => {
        console.log(`- OK | ${item.file} | ${item.description}`);
    });
}

main();
