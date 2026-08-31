const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    index: 'index.js',
    backgroundServices: 'modules/phone-core/background-services.js',
    lifecycle: 'modules/phone-core/lifecycle.js',
    state: 'modules/phone-core/state.js',
    routeRuntime: 'modules/phone-core/route-runtime.js',
    routeRenderer: 'modules/phone-core/route-renderer.js',
    callbacks: 'modules/phone-core/callbacks.js',
    shellAppControls: 'modules/phone-core/shell-app-controls.js',
    tableUpdateReviewService: 'modules/table-update-review/service.js',
    runtimeManager: 'modules/runtime-manager.js',
    eventManager: 'modules/utils/event-manager.js',
    fusionRuntime: 'modules/phone-fusion/runtime.js',
    settingsPanel: 'modules/settings-panel.js',
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
    const destroyStart = contents.index.indexOf('export function destroy()');
    const destroyBody = destroyStart >= 0 ? contents.index.slice(destroyStart) : '';

    const results = [];

    check(results, 'index', 'index 保留 ensureInitialized()', has(contents.index, 'async function ensureInitialized('));
    check(results, 'index', 'index 新增 isDestroying 护栏', has(contents.index, 'let isDestroying = false;'));
    check(results, 'index', 'index 新增 clearInitRetryTimeout()', has(contents.index, 'function clearInitRetryTimeout() {'));
    check(results, 'index', 'index 新增 resetInitializationState()', has(contents.index, 'function resetInitializationState() {'));
    check(results, 'index', 'destroy() 继续调用 unregisterSlashCommands()', has(contents.index, 'unregisterSlashCommands();'));
    check(results, 'index', 'destroy() 继续调用 destroyPhoneRuntime()', has(contents.index, 'destroyPhoneRuntime();'));
    check(results, 'index', 'destroy() 先停止后台派生服务', has(destroyBody, "stopPhoneBackgroundServices('extension-destroy');") && destroyBody.indexOf("stopPhoneBackgroundServices('extension-destroy');") < destroyBody.indexOf('destroyPhoneRuntime();'));
    check(results, 'index', 'destroy() 继续调用 cleanupIntegration()', has(contents.index, 'cleanupIntegration();'));
    check(results, 'index', 'destroy() 在 finally 中重置初始化状态', has(contents.index, 'resetInitializationState();'));
    check(results, 'index', 'index 导入 destroyPhoneSettingsPanel()', has(contents.index, 'destroyPhoneSettingsPanel'));
    check(results, 'index', 'destroy() 清理 settings panel', has(contents.index, 'destroyPhoneSettingsPanel();'));
    check(results, 'index', 'releaseSingletonGuard() 使用 ownerToken 防误删', has(contents.index, 'host?.[INSTANCE_KEY]?.ownerToken === INSTANCE_OWNER_TOKEN'));
    check(results, 'settingsPanel', 'settings-panel 暴露 destroyPhoneSettingsPanel()', has(contents.settingsPanel, 'export function destroyPhoneSettingsPanel()'));

    check(results, 'state', 'phone-core state 新增 isPhoneActive', has(contents.state, 'isPhoneActive: false,'));
    check(results, 'state', 'phone-core state 新增 isDestroying', has(contents.state, 'isDestroying: false,'));
    check(results, 'state', 'phone-core state 新增 shellInteractionTimerId', has(contents.state, 'shellInteractionTimerId: null,'));
    check(results, 'state', 'phone-core state 新增 routeRenderCleanup', has(contents.state, 'routeRenderCleanup: null,'));
    check(results, 'state', 'phone-core state 新增 routeRenderToken', has(contents.state, 'routeRenderToken: 0,'));
    check(results, 'state', '隐藏期刷新状态集中在 phone-core state', has(contents.state, 'pendingRouteRefresh: false,')
        && has(contents.state, "pendingRouteRefreshReason: '',")
        && has(contents.state, 'export function markPhoneRouteRefreshPending(')
        && has(contents.state, 'export function consumePhoneRouteRefreshPending('));

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
    check(results, 'lifecycle', 'UI lifecycle 不再直接拥有派生器启停', !has(contents.lifecycle, 'startSmallCalendarDerivedFieldsInjection') && !has(contents.lifecycle, 'startChronicleTodayRelationInjection'));
    check(results, 'lifecycle', '重新打开时仅在待刷新或页面缺失时请求 route', has(contents.lifecycle, 'function hasCommittedPhoneRoutePage(')
        && has(contents.lifecycle, 'const shouldRefreshRoute = consumePhoneRouteRefreshPending(state)')
        && has(contents.lifecycle, 'activatePhoneRuntimeState(state, { requestRoute: shouldRefreshRoute });'));

    check(results, 'index', '聊天切换在小手机隐藏时标记待刷新', has(contents.index, 'function handlePhoneBackgroundChatChangedAndMarkRoute(')
        && has(contents.index, "markPhoneRouteRefreshPending('chat-changed');")
        && has(contents.index, 'onBackgroundChatChanged: handlePhoneBackgroundChatChangedAndMarkRoute'));
    check(results, 'callbacks', '隐藏期表格更新在 hash 与 UI 事件前提前返回', has(contents.callbacks, "markPhoneRouteRefreshPending('table-update', state);")
        && contents.callbacks.indexOf('if (state.isPhoneActive === false)') < contents.callbacks.indexOf('const newVersion = computeDataVersion(sheetData);'));

    check(results, 'backgroundServices', '后台服务集中拥有两个派生器启停', has(contents.backgroundServices, 'startSmallCalendarDerivedFieldsInjection') && has(contents.backgroundServices, 'stopSmallCalendarDerivedFieldsInjection') && has(contents.backgroundServices, 'startChronicleTodayRelationInjection') && has(contents.backgroundServices, 'stopChronicleTodayRelationInjection'));
    check(results, 'backgroundServices', '后台服务聊天切换屏障固定等待第二次通知、250ms 稳定期和 3.5s fallback', has(contents.backgroundServices, 'TABLE_UPDATE_SIGNAL_TARGET = 2') && has(contents.backgroundServices, 'CHAT_CHANGE_SETTLE_DELAY_MS = 250') && has(contents.backgroundServices, 'CHAT_CHANGE_WAIT_TIMEOUT_MS = 3500'));

    check(results, 'routeRuntime', 'route-runtime 暴露 requestPhoneRouteRender()', has(contents.routeRuntime, 'export function requestPhoneRouteRender('));
    check(results, 'routeRuntime', 'route-runtime 暴露 requestCurrentPhoneRouteRender()', has(contents.routeRuntime, 'export function requestCurrentPhoneRouteRender('));
    check(results, 'routeRuntime', 'route-runtime 暴露 requestHomePhoneRouteRender()', has(contents.routeRuntime, 'export function requestHomePhoneRouteRender('));
    check(results, 'routeRuntime', 'route-runtime 暴露 ensureRouteRuntimeSubscription()', has(contents.routeRuntime, 'export function ensureRouteRuntimeSubscription('));
    check(results, 'routeRuntime', 'route-runtime 暴露 clearRouteRuntimeSubscription()', has(contents.routeRuntime, 'export function clearRouteRuntimeSubscription('));
    check(results, 'routeRuntime', 'route-runtime 继续通过 routeRuntimeDeps.renderPhoneRoute() 执行页面渲染', has(contents.routeRuntime, 'return routeRuntimeDeps.renderPhoneRoute(nextRoute, {'));
    check(results, 'routeRuntime', 'route-runtime 统一 route request context 构造', has(contents.routeRuntime, 'function buildRouteRequestContext('));
    check(results, 'routeRuntime', 'route-runtime 为 renderPhoneRoute() 增加 catch 兜底', has(contents.routeRuntime, '}).catch((error) => {'));

    check(results, 'routeRuntime', '隐藏状态 route 请求延后且不触发回滚', has(contents.routeRuntime, "markPhoneRouteRefreshPending(opts.reason || 'route-request', state);")
        && has(contents.routeRuntime, 'if (result === false && state.isPhoneActive === false)')
        && has(contents.routeRuntime, 'return Promise.resolve(true);'));

    check(results, 'routeRenderer', 'route-renderer 新增 createRouteRenderContext()', has(contents.routeRenderer, 'function createRouteRenderContext('));
    check(results, 'routeRenderer', 'route-renderer 新增 renderResolvedRoutePage()', has(contents.routeRenderer, 'function renderResolvedRoutePage('));
    check(results, 'routeRenderer', 'route-renderer 新增 commitRoutePage()', has(contents.routeRenderer, 'function commitRoutePage('));
    check(results, 'routeRenderer', 'route-renderer 新增 scheduleRouteCommit()', has(contents.routeRenderer, 'function scheduleRouteCommit('));
    check(results, 'routeRenderer', 'route-renderer 对加载失败输出结构化错误日志', has(contents.routeRenderer, "message: '加载 route renderer 失败'"));
    check(results, 'routeRenderer', 'route-renderer 对页面渲染失败输出结构化错误日志', has(contents.routeRenderer, "message: 'route 页面渲染失败'"));

    check(results, 'routeRenderer', '隐藏状态不能继续提交 route 页面', has(contents.routeRenderer, '&& state.isPhoneActive !== false')
        && has(contents.routeRenderer, 'function deferInactivePhoneRouteRender(')
        && has(contents.routeRenderer, "markPhoneRouteRefreshPending('route-render-inactive', state);"));
    check(results, 'shellAppControls', '壳层观察器同帧合并刷新并可取消', has(contents.shellAppControls, 'const scheduleRefresh = () => {')
        && has(contents.shellAppControls, 'refreshFrameId = requestFrame(() => {')
        && has(contents.shellAppControls, 'cancelFrame?.(refreshFrameId);'));
    check(results, 'tableUpdateReviewService', '审核订阅健康巡检降为 30 秒', has(contents.tableUpdateReviewService, 'const SUBSCRIPTION_HEALTH_CHECK_INTERVAL_MS = 30000;'));

    check(results, 'runtimeManager', 'runtime-manager 新增 observeManagedDisconnection()', has(contents.runtimeManager, 'const observeManagedDisconnection = (target, callback, options = {}) => {'));
    check(results, 'runtimeManager', 'runtime-manager 暴露 observeDisconnection', has(contents.runtimeManager, 'observeDisconnection: observeManagedDisconnection,'));
    check(results, 'eventManager', 'EventManager 兼容暴露 observeDisconnection()', has(contents.eventManager, 'observeDisconnection(target, callback, options = {}) {'));
    check(results, 'eventManager', 'EventManager observeDisconnection() 委托 runtime scope', has(contents.eventManager, 'return this.ensureRuntime().observeDisconnection(target, callback, options);'));
    check(results, 'fusionRuntime', 'fusion-runtime 直接导入 createRuntimeScope()', has(contents.fusionRuntime, "import { createRuntimeScope } from '../runtime-manager.js';"));
    check(results, 'fusionRuntime', 'fusion-runtime 通过 runtime.observeDisconnection() 托管容器清理', has(contents.fusionRuntime, 'runtime.observeDisconnection(container, dispose, {'));
    check(results, 'fusionRuntime', 'fusion-runtime 继续通过 cleanupFusionPageResources() 执行断开清理', has(contents.fusionRuntime, 'cleanupFusionPageResources();'));
    check(results, 'fusionRuntime', 'fusion-runtime 移除裸 MutationObserver', !has(contents.fusionRuntime, 'new MutationObserver('));

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
