const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    viewer: 'modules/table-viewer/special/message-viewer.js',
    helpers: 'modules/table-viewer/special/message-viewer-helpers.js',
    actions: 'modules/table-viewer/special/message-viewer-actions.js',
    conversationView: 'modules/table-viewer/special/message-viewer/conversation-view.js',
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
    check(results, 'actions', 'actions 内部承接 handleStopMessage()', has(contents.actions, 'const handleStopMessage = async ('));
    check(results, 'actions', 'actions 使用 activeSendRequest 隔离晚到 AI 结果', has(contents.actions, 'state.activeSendRequest = requestState') && has(contents.actions, 'shouldIgnoreSendResult(requestState)'));
    check(results, 'actions', 'actions 取消等待只做本地 abort 与回填，不再调用宿主全局 stopPhoneChatAI', has(contents.actions, 'abortRequest(requestState') && has(contents.actions, 'cancelBeforeArchive(requestState') && !has(contents.actions, 'stopPhoneChatAI'));

    check(results, 'viewer', 'message-viewer 继续通过 renderMessageConversationView() 装配会话页', has(contents.viewer, 'renderMessageConversationView({'));
    check(results, 'viewer', 'message-viewer 使用 sendPhase 区分 AI 等待与归档阶段', has(contents.viewer, "sendPhase: 'idle'") && has(contents.viewer, "phase === 'ai'") && has(contents.viewer, "phase === 'archive'"));
    check(results, 'viewer', 'message-viewer 输入框 resize 使用 RAF 调度', has(contents.viewer, 'function scheduleComposeInputResize') || has(contents.viewer, 'const scheduleComposeInputResize = (inputEl) => {'));
    check(results, 'conversationView', 'conversation-view 通过 viewer runtime 注册单一 pointerup 委托', has(contents.conversationView, "addListener(container, 'pointerup', (event) => {"));
    check(results, 'conversationView', 'conversation-view 通过 viewer runtime 注册单一 click 委托', has(contents.conversationView, "addListener(container, 'click', (event) => {"));
    check(results, 'conversationView', 'conversation-view 复用 state.stableTapGuards 保存触摸保护', has(contents.conversationView, 'state.stableTapGuards') && has(contents.conversationView, 'function getStableTapGuard('));
    check(results, 'conversationView', 'conversation-view 标记 pointerup 并抑制合成 click', has(contents.conversationView, 'function markPointerHandled(') && has(contents.conversationView, 'function shouldSuppressSyntheticClick(') && has(contents.conversationView, 'markPointerHandled(currentContext, action, event)') && has(contents.conversationView, 'shouldSuppressSyntheticClick(currentContext, action, event)'));
    check(results, 'conversationView', 'conversation-view 使用统一分发处理返回/进会话/联系人选择', has(contents.conversationView, 'function dispatchConversationAction(') && has(contents.conversationView, "case 'nav-back':") && has(contents.conversationView, "case 'open-conversation':") && has(contents.conversationView, "case 'open-contact-picker':"));
    check(results, 'conversationView', 'conversation-view 不拦截 prompt preset select 的 change 行为', has(contents.conversationView, "if (!['nav-back', 'open-conversation', 'open-contact-picker'].includes(action)) return;") && has(contents.conversationView, "target.dataset.action !== 'select-prompt-preset'"));
    check(results, 'detailView', 'detail-view 为返回按钮提供稳定 data-action', has(contents.detailView, 'data-action="nav-back"'));
    check(results, 'detailView', 'detail-view 为删除模式切换按钮提供稳定 data-action', has(contents.detailView, 'data-action="toggle-delete-mode"'));
    check(results, 'detailView', 'detail-view 为管理条按钮提供稳定 data-action', has(contents.detailView, 'data-action="select-all"'));
    check(results, 'detailView', 'detail-view 为发送按钮提供稳定默认 action', has(contents.detailView, 'data-default-action="send-message"') && has(contents.detailView, "const sendButtonAction = isAiPending ? 'stop-message' : 'send-message'"));
    check(results, 'detailView', 'detail-view 为取消等待按钮提供稳定 data-action', has(contents.detailView, "const sendButtonAction = isAiPending ? 'stop-message' : 'send-message'"));
    check(results, 'detailView', 'detail-view 为重试按钮提供稳定 data-action', has(contents.detailView, 'data-action="retry-message"'));
    check(results, 'detailView', 'detail-view 为附件入口提供稳定 data-action', has(contents.detailView, 'data-action="open-attachment-dialog"') && has(contents.detailView, 'data-media-kind="${escapeHtmlAttr(kind)}"'));
    check(results, 'detailView', 'detail-view 附件 textarea 使用独立类名且不复用 compose input', has(contents.detailView, 'phone-special-message-attachment-textarea') && !has(contents.detailView, 'phone-special-message-attachment-textarea phone-special-message-compose-input'));
    check(results, 'detailView', 'detail-view 附件弹窗遮罩不挂 data-action 以避免内部点击误关闭', has(contents.detailView, 'phone-special-attachment-dialog-mask phone-special-viewport-overlay" data-conversation-id=') && !has(contents.detailView, 'phone-special-attachment-dialog-mask phone-special-viewport-overlay" data-action='));
    check(results, 'detailView', 'detail-view 附件入口使用内联 SVG 图标渲染', has(contents.detailView, 'function renderComposeMediaIcon(kind)') && has(contents.detailView, 'class="phone-special-message-attachment-icon"') && has(contents.detailView, '${renderComposeMediaIcon(kind)}'));
    check(results, 'detailView', 'detail-view 附件入口保留可访问标题与事件属性', has(contents.detailView, 'aria-label="${escapeHtmlAttr(config.title)}" title="${escapeHtmlAttr(config.title)}"') && has(contents.detailView, 'data-action="open-attachment-dialog"') && has(contents.detailView, 'data-conversation-id="${escapeHtmlAttr(conversationId)}"'));
    check(results, 'detailView', 'detail-view 附件 chip 主按钮保留编辑入口且描述只进入 title', has(contents.detailView, 'class="phone-special-message-attachment-chip-main" data-action="open-attachment-dialog"') && has(contents.detailView, 'aria-label="编辑${escapeHtmlAttr(config.label)}" title="${escapeHtmlAttr(config.label)}已添加：${escapeHtmlAttr(text)}"') && has(contents.detailView, '${renderComposeMediaIcon(kind)}</button>'));
    check(results, 'detailView', 'detail-view 附件 chip 清除按钮保留 clear-compose-media 合同', has(contents.detailView, 'class="phone-special-message-attachment-chip-clear" data-action="clear-compose-media"') && has(contents.detailView, 'aria-label="清除${escapeHtmlAttr(config.label)}" title="清除${escapeHtmlAttr(config.label)}"'));
    check(results, 'detailView', 'detail-view 附件 chip 不再直接显示描述正文', !has(contents.detailView, '${escapeHtml(config.shortLabel)}：${escapeHtml(text)}') && !has(contents.detailView, 'shortLabel'));
    check(results, 'detailView', 'detail-view 消息详情输入区不再渲染聊天预设名展示', !has(contents.detailView, 'phone-special-message-template-pill') && !has(contents.detailView, 'getCurrentAiInstructionPresetNameText') && !has(contents.detailView, 'showComposeTemplateNote'));
    check(results, 'detailView', 'detail-view 已添加附件 chips 位于 editor 上方且入口位于 meta 行', has(contents.detailView, '<div class="phone-special-message-attachment-chips" aria-label="当前消息附件">') && has(contents.detailView, '<div class="phone-special-message-compose-meta">') && has(contents.detailView, '<div class="phone-special-message-attachment-actions" aria-label="发送前媒体描述">'));
    check(results, 'detailView', 'detail-view 附件弹窗 textarea 内容使用 escapeHtml 转义', has(contents.detailView, '>${escapeHtml(draftValue)}</textarea>'));

    check(results, 'helpers', 'helpers 为消息选择 toggle 提供稳定 data-action', has(contents.helpers, 'data-action="toggle-row-selection"'));
    check(results, 'helpers', 'helpers 为媒体按钮提供稳定 data-action', has(contents.helpers, 'data-action="open-media-preview"'));

    check(results, 'detailController', 'detail-controller 使用容器私有 context 保存最新详情页状态', has(contents.detailController, 'const MESSAGE_DETAIL_CONTROLLER_KEY') && has(contents.detailController, 'function setMessageDetailControllerContext('));
    check(results, 'detailController', 'detail-controller 复用 state.stableTapGuards 供列表页吃掉返回残余 click', has(contents.detailController, 'const stateStableTapGuards') && has(contents.detailController, 'currentContext.state.stableTapGuards = currentContext.stableTapGuards'));
    check(results, 'detailController', 'detail-controller 记录刚打开 overlay 的遮罩保护窗', has(contents.detailController, 'overlayFreshTapGuards') && has(contents.detailController, 'function markOverlayOpened(') && has(contents.detailController, 'function shouldIgnoreFreshOverlayMaskClick('));
    check(results, 'detailController', 'detail-controller 使用 delegatedBound 防止重复委托绑定', has(contents.detailController, 'delegatedBound: false') && has(contents.detailController, 'if (!(container instanceof HTMLElement) || !context || context.delegatedBound) return;'));
    check(results, 'detailController', 'detail-controller 通过 viewer runtime 注册单一 pointerup 委托', has(contents.detailController, "addListener(container, 'pointerup', (event) => {"));
    check(results, 'detailController', 'detail-controller 通过 viewer runtime 注册单一 click 委托', has(contents.detailController, "addListener(container, 'click', (event) => {"));
    check(results, 'detailController', 'detail-controller 通过 viewer runtime 注册单一 input 委托', has(contents.detailController, "addListener(container, 'input', (event) => {"));
    check(results, 'detailController', 'detail-controller 通过 viewer runtime 注册单一 keydown 委托', has(contents.detailController, "addListener(container, 'keydown', (event) => {"));
    check(results, 'detailController', 'detail-controller 委托事件发生时读取最新 context', has(contents.detailController, 'const currentContext = getDetailContextForEvent(container);'));
    check(results, 'detailController', 'detail-controller 分发 stop-message 到 handleStopMessage()', has(contents.detailController, "case 'stop-message':") && has(contents.detailController, 'handleStopMessage(context);'));
    check(results, 'detailController', 'detail-controller input 事件不再每键完整 patch compose', has(contents.detailController, 'scheduleComposeInputResize(composeInput)') && has(contents.detailController, 'patchCompose(currentContext, { resizeInput: false })'));
    check(results, 'detailController', 'detail-controller 分发附件 open/close/save/clear 动作', has(contents.detailController, "case 'open-attachment-dialog':") && has(contents.detailController, "case 'close-attachment-dialog':") && has(contents.detailController, "case 'save-compose-media':") && has(contents.detailController, "case 'clear-compose-media':"));
    check(results, 'detailController', 'detail-controller 附件 textarea input 只更新 attachmentDialog.draftValue', has(contents.detailController, 'getAttachmentInputFromEvent(event, container)') && has(contents.detailController, 'dialog.draftValue = String(attachmentInput.value || \'\');') && has(contents.detailController, 'return;\n        }\n        const composeInput = getComposeInputFromEvent(event, container);'));
    check(results, 'detailController', 'detail-controller 附件保存前校验 conversationId 与 kind', has(contents.detailController, 'conversationId !== currentConversationId') && has(contents.detailController, 'dialog.conversationId !== conversationId || dialog.kind !== kind'));
    check(results, 'detailController', 'detail-controller close 附件弹窗校验 conversationId', has(contents.detailController, 'function handleCloseAttachmentDialog(context, actionEl = null)') && has(contents.detailController, 'actionConversationId !== getContextConversationId(context)'));
    check(results, 'detailController', 'detail-controller 委托层跳过 disabled action', has(contents.detailController, 'function isDisabledActionElement(actionEl)') && has(contents.detailController, 'if (isDisabledActionElement(actionEl)) return;'));
    check(results, 'detailController', 'detail-controller 附件 mask 仅点击遮罩本体关闭', has(contents.detailController, "attachmentMask === target") && has(contents.detailController, 'handleCloseAttachmentDialog(currentContext, attachmentMask);'));
    check(results, 'detailController', 'detail-controller 媒体/附件 mask 刚打开保护命中时不关闭', has(contents.detailController, "shouldIgnoreFreshOverlayMaskClick(currentContext, 'mediaPreview', event)") && has(contents.detailController, "shouldIgnoreFreshOverlayMaskClick(currentContext, 'attachmentDialog', event)"));
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
