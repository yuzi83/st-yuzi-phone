const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    index: 'index.js',
    lifecycle: 'modules/phone-core/lifecycle.js',
    state: 'modules/phone-core/state.js',
    routeRuntime: 'modules/phone-core/route-runtime.js',
    routeRenderer: 'modules/phone-core/route-renderer.js',
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

    check(results, 'index', 'index 保留 ensureInitialized()', has(contents.index, 'async function ensureInitialized('));
    check(results, 'index', 'index 新增 isDestroying 护栏', has(contents.index, 'let isDestroying = false;'));
    check(results, 'index', 'index 新增 clearInitRetryTimeout()', has(contents.index, 'function clearInitRetryTimeout() {'));
    check(results, 'index', 'index 新增 resetInitializationState()', has(contents.index, 'function resetInitializationState() {'));
    check(results, 'index', 'destroy() 继续调用 unregisterSlashCommands()', has(contents.index, 'unregisterSlashCommands();'));
    check(results, 'index', 'destroy() 继续调用 destroyPhoneRuntime()', has(contents.index, 'destroyPhoneRuntime();'));
    check(results, 'index', 'destroy() 继续调用 cleanupIntegration()', has(contents.index, 'cleanupIntegration();'));
    check(results, 'index', 'destroy() 在 finally 中重置初始化状态', has(contents.index, 'resetInitializationState();'));

    check(results, 'state', 'phone-core state 新增 isPhoneActive', has(contents.state, 'isPhoneActive: false,'));
    check(results, 'state', 'phone-core state 新增 isDestroying', has(contents.state, 'isDestroying: false,'));
    check(results, 'state', 'phone-core state 新增 shellInteractionTimerId', has(contents.state, 'shellInteractionTimerId: null,'));
    check(results, 'state', 'phone-core state 新增 routeRenderCleanup', has(contents.state, 'routeRenderCleanup: null,'));
    check(results, 'state', 'phone-core state 新增 routeRenderToken', has(contents.state, 'routeRenderToken: 0,'));

    check(results, 'lifecycle', 'lifecycle 新增 clearStatusClockTimer()', has(contents.lifecycle, 'function clearStatusClockTimer('));
    check(results, 'lifecycle', 'lifecycle 新增 startStatusClock()', has(contents.lifecycle, 'function startStatusClock('));
    check(results, 'lifecycle', 'lifecycle 新增 initializePhoneRuntimeBindings()', has(contents.lifecycle, 'function initializePhoneRuntimeBindings('));
    check(results, 'lifecycle', 'lifecycle 新增 deactivatePhoneRuntimeState()', has(contents.lifecycle, 'function deactivatePhoneRuntimeState('));
    check(results, 'lifecycle', 'lifecycle 新增 cleanupPhoneRuntimeBindings()', has(contents.lifecycle, 'function cleanupPhoneRuntimeBindings('));
    check(results, 'lifecycle', 'lifecycle route 订阅委托给 ensureRouteRuntimeSubscription()', has(contents.lifecycle, 'return ensureRouteRuntimeSubscription(state);'));
    check(results, 'lifecycle', 'initPhoneUI() 通过 initializePhoneRuntimeBindings() 收口 runtime 初始化', has(contents.lifecycle, 'initializePhoneRuntimeBindings(state);'));
    check(results, 'lifecycle', 'lifecycle 新增 requestPhoneRuntimeActivationRoute()', has(contents.lifecycle, 'function requestPhoneRuntimeActivationRoute('));
    check(results, 'lifecycle', 'initPhoneUI() 通过 routeMode=home 激活首屏', has(contents.lifecycle, "activatePhoneRuntimeState(state, { routeMode: 'home' });"));
    check(results, 'lifecycle', 'onPhoneDeactivated() 通过 deactivatePhoneRuntimeState() 收口停用逻辑', has(contents.lifecycle, 'deactivatePhoneRuntimeState(state);'));
    check(results, 'lifecycle', 'destroyPhoneRuntime() 通过 cleanupPhoneRuntimeBindings() 收口清理逻辑', has(contents.lifecycle, 'cleanupPhoneRuntimeBindings(state);'));

    check(results, 'routeRuntime', 'route-runtime 暴露 requestPhoneRouteRender()', has(contents.routeRuntime, 'export function requestPhoneRouteRender('));
    check(results, 'routeRuntime', 'route-runtime 暴露 requestCurrentPhoneRouteRender()', has(contents.routeRuntime, 'export function requestCurrentPhoneRouteRender('));
    check(results, 'routeRuntime', 'route-runtime 暴露 requestHomePhoneRouteRender()', has(contents.routeRuntime, 'export function requestHomePhoneRouteRender('));
    check(results, 'routeRuntime', 'route-runtime 暴露 ensureRouteRuntimeSubscription()', has(contents.routeRuntime, 'export function ensureRouteRuntimeSubscription('));
    check(results, 'routeRuntime', 'route-runtime 暴露 clearRouteRuntimeSubscription()', has(contents.routeRuntime, 'export function clearRouteRuntimeSubscription('));
    check(results, 'routeRuntime', 'route-runtime 继续通过 routeRuntimeDeps.renderPhoneRoute() 执行页面渲染', has(contents.routeRuntime, 'return routeRuntimeDeps.renderPhoneRoute(nextRoute, {'));
    check(results, 'routeRuntime', 'route-runtime 统一 route request context 构造', has(contents.routeRuntime, 'function buildRouteRequestContext('));
    check(results, 'routeRuntime', 'route-runtime 为 renderPhoneRoute() 增加 catch 兜底', has(contents.routeRuntime, '}).catch((error) => {'));

    check(results, 'routeRenderer', 'route-renderer 新增 createRouteRenderContext()', has(contents.routeRenderer, 'function createRouteRenderContext('));
    check(results, 'routeRenderer', 'route-renderer 新增 renderResolvedRoutePage()', has(contents.routeRenderer, 'function renderResolvedRoutePage('));
    check(results, 'routeRenderer', 'route-renderer 新增 commitRoutePage()', has(contents.routeRenderer, 'function commitRoutePage('));
    check(results, 'routeRenderer', 'route-renderer 新增 scheduleRouteCommit()', has(contents.routeRenderer, 'function scheduleRouteCommit('));
    check(results, 'routeRenderer', 'route-renderer 对加载失败输出结构化错误日志', has(contents.routeRenderer, "message: '加载 route renderer 失败'"));
    check(results, 'routeRenderer', 'route-renderer 对页面渲染失败输出结构化错误日志', has(contents.routeRenderer, "message: 'route 页面渲染失败'"));

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[runtime-cleanup-contract-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[runtime-cleanup-contract-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
