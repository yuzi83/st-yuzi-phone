const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    viewer: 'modules/table-viewer/special/message-viewer.js',
    helpers: 'modules/table-viewer/special/message-viewer-helpers.js',
    actions: 'modules/table-viewer/special/message-viewer-actions.js',
    detailView: 'modules/table-viewer/special/message-viewer/detail-view.js',
    detailController: 'modules/table-viewer/special/message-viewer/detail-controller.js',
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

    check(results, 'viewer', 'message-viewer 继续保留 renderMessageTable()', has(contents.viewer, 'export function renderMessageTable('));
    check(results, 'viewer', 'message-viewer 继续导入 message-viewer-helpers', has(contents.viewer, "from './message-viewer-helpers.js';"));
    check(results, 'viewer', 'message-viewer 新增导入 message-viewer-actions', has(contents.viewer, "from './message-viewer-actions.js';"));
    check(results, 'viewer', 'message-viewer 通过动作工厂装配发送/重试链路', has(contents.viewer, 'createMessageViewerActions({'));
    check(results, 'viewer', 'message-viewer 不再内联 renderOneMessageRow()', !has(contents.viewer, 'function renderOneMessageRow('));
    check(results, 'viewer', 'message-viewer 不再内联 buildPhoneChatSystemMessages()', !has(contents.viewer, 'function buildPhoneChatSystemMessages('));
    check(results, 'viewer', 'message-viewer 不再内联 handleSendMessage()', !has(contents.viewer, 'const handleSendMessage = async ('));
    check(results, 'viewer', 'message-viewer 不再内联 handleRetryMessage()', !has(contents.viewer, 'const handleRetryMessage = async ('));

    check(results, 'helpers', 'helpers 暴露 materializeRowFromPayload()', has(contents.helpers, 'export function materializeRowFromPayload('));
    check(results, 'helpers', 'helpers 暴露 buildPhoneChatConversationMessages()', has(contents.helpers, 'export function buildPhoneChatConversationMessages('));
    check(results, 'helpers', 'helpers 暴露 buildPhoneChatSystemMessages()', has(contents.helpers, 'export function buildPhoneChatSystemMessages('));
    check(results, 'helpers', 'helpers 暴露 getRetryTarget()', has(contents.helpers, 'export function getRetryTarget('));
    check(results, 'helpers', 'helpers 暴露 renderOneMessageRow()', has(contents.helpers, 'export function renderOneMessageRow('));

    check(results, 'actions', 'actions 暴露 createMessageViewerActions()', has(contents.actions, 'export function createMessageViewerActions('));
    check(results, 'actions', 'actions 内部承接 handleSendMessage()', has(contents.actions, 'const handleSendMessage = async ('));
    check(results, 'actions', 'actions 内部承接 handleRetryMessage()', has(contents.actions, 'const handleRetryMessage = async ('));

    check(results, 'viewer', 'message-viewer 继续通过 renderMessageConversationView() 装配会话页', has(contents.viewer, 'renderMessageConversationView({'));
    check(results, 'detailView', 'detail-view 为返回按钮提供稳定 data-action', has(contents.detailView, 'data-action="nav-back"'));
    check(results, 'detailView', 'detail-view 为删除模式切换按钮提供稳定 data-action', has(contents.detailView, 'data-action="toggle-delete-mode"'));
    check(results, 'detailView', 'detail-view 为管理条按钮提供稳定 data-action', has(contents.detailView, 'data-action="select-all"'));
    check(results, 'detailView', 'detail-view 为发送按钮提供稳定 data-action', has(contents.detailView, 'data-action="send-message"'));
    check(results, 'detailView', 'detail-view 为重试按钮提供稳定 data-action', has(contents.detailView, 'data-action="retry-message"'));

    check(results, 'helpers', 'helpers 为消息选择 toggle 提供稳定 data-action', has(contents.helpers, 'data-action="toggle-row-selection"'));
    check(results, 'helpers', 'helpers 为媒体按钮提供稳定 data-action', has(contents.helpers, 'data-action="open-media-preview"'));

    check(results, 'detailController', 'detail-controller 使用容器私有 context 保存最新详情页状态', has(contents.detailController, 'const MESSAGE_DETAIL_CONTROLLER_KEY') && has(contents.detailController, 'function setMessageDetailControllerContext('));
    check(results, 'detailController', 'detail-controller 使用 delegatedBound 防止重复委托绑定', has(contents.detailController, 'delegatedBound: false') && has(contents.detailController, 'if (!(container instanceof HTMLElement) || !context || context.delegatedBound) return;'));
    check(results, 'detailController', 'detail-controller 通过 viewer runtime 注册单一 pointerup 委托', has(contents.detailController, "addListener(container, 'pointerup', (event) => {"));
    check(results, 'detailController', 'detail-controller 通过 viewer runtime 注册单一 click 委托', has(contents.detailController, "addListener(container, 'click', (event) => {"));
    check(results, 'detailController', 'detail-controller 通过 viewer runtime 注册单一 input 委托', has(contents.detailController, "addListener(container, 'input', (event) => {"));
    check(results, 'detailController', 'detail-controller 通过 viewer runtime 注册单一 keydown 委托', has(contents.detailController, "addListener(container, 'keydown', (event) => {"));
    check(results, 'detailController', 'detail-controller 委托事件发生时读取最新 context', has(contents.detailController, 'const currentContext = getDetailContextForEvent(container);'));
    check(results, 'detailController', 'detail-controller 保留 stable tap 防合成 click 语义但不再逐节点绑定', has(contents.detailController, 'function shouldSuppressSyntheticClick(') && !has(contents.detailController, 'function bindStableTapAction('));
    check(results, 'detailController', 'detail-controller 已移除消息选择批量绑定旧写法', !has(contents.detailController, "container.querySelectorAll('.phone-special-message-select-toggle').forEach((btn) => {"));
    check(results, 'detailController', 'detail-controller 已移除媒体按钮批量绑定旧写法', !has(contents.detailController, "container.querySelectorAll('.phone-special-media-item').forEach((mediaEl) => {"));
    check(results, 'detailController', 'detail-controller 已移除发送按钮裸 click 绑定', !has(contents.detailController, "container.querySelector('.phone-special-message-send-btn')?.addEventListener('click'"));
    check(results, 'detailController', 'detail-controller 已移除重试按钮裸 click 绑定', !has(contents.detailController, "container.querySelector('.phone-special-message-retry-btn')?.addEventListener('click'"));
    check(results, 'detailController', 'detail-controller 已移除 compose input 逐渲染节点级绑定', !has(contents.detailController, "addListener(composeInput, 'input'") && !has(contents.detailController, "addListener(composeInput, 'keydown'"));

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[message-viewer-contract-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[message-viewer-contract-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
