import { getPhoneAiInstructionPresets, setCurrentPhoneAiInstructionPresetName } from '../../../phone-core/chat-support.js';
import { navigateBack } from '../../../phone-core/routing.js';
import { PHONE_ICONS } from '../../../phone-home/icons.js';
import { escapeHtml, escapeHtmlAttr } from '../../../utils/dom-escape.js';
import { bindWheelBridge, showInlineToast } from '../../shared-ui.js';
import {
    detectChatTargetFromRows,
    getConversationRows,
    resolveConversationHeaderLabel,
    scrollMessageDetailToBottom,
} from '../message-viewer-helpers.js';
import {
    buildConversations,
    formatTimeLike,
    generateColor,
    getAvatarText,
} from '../view-utils.js';
import { getCurrentAiInstructionPresetNameText } from './shared.js';

const MESSAGE_CONVERSATION_VIEW_KEY = '__stYuziMessageConversationView';

function getMessageConversationViewContext(container) {
    if (!(container instanceof HTMLElement)) return null;
    const context = container[MESSAGE_CONVERSATION_VIEW_KEY];
    return context && typeof context === 'object' ? context : null;
}

function setMessageConversationViewContext(container, options = {}) {
    if (!(container instanceof HTMLElement)) return null;

    const currentContext = getMessageConversationViewContext(container) || {
        delegatedBound: false,
    };
    Object.assign(currentContext, options);
    container[MESSAGE_CONVERSATION_VIEW_KEY] = currentContext;
    return currentContext;
}

function openConversation(container, convId) {
    const context = getMessageConversationViewContext(container);
    if (!(container instanceof HTMLElement) || !context?.state) return;
    if (typeof context.render !== 'function' || typeof context.readSpecialField !== 'function') return;

    const safeId = String(convId || '').trim() || context.createDraftConversationId();
    context.state.mode = 'detail';
    context.state.conversationId = safeId;
    context.state.mediaPreview = null;
    context.state.errorText = '';
    context.state.statusText = '';
    context.state.deleteManageMode = false;
    context.state.deletingSelection = false;
    context.state.selectedMessageRowIndexes = [];
    const convRows = getConversationRows(context.state.rowsData, safeId, context.readSpecialField);
    const detectedTarget = detectChatTargetFromRows(convRows, context.readSpecialField);
    context.state.selectedTarget = detectedTarget || null;
    context.render();
    scrollMessageDetailToBottom(container);
}

function bindMessageConversationViewController(container) {
    const context = getMessageConversationViewContext(container);
    if (!(container instanceof HTMLElement) || !context) return;
    if (context.delegatedBound) return;

    const runtime = context.viewerRuntime && typeof context.viewerRuntime === 'object' ? context.viewerRuntime : null;
    const addListener = runtime?.addEventListener
        ? (...args) => runtime.addEventListener(...args)
        : (target, type, listener, options) => {
            target.addEventListener(type, listener, options);
            return () => target.removeEventListener(type, listener, options);
        };

    addListener(container, 'click', (event) => {
        const currentContext = getMessageConversationViewContext(container);
        const target = event.target instanceof HTMLElement ? event.target : null;
        if (!currentContext || !target || !container.contains(target)) return;

        const actionEl = target.closest('[data-action]');
        if (!(actionEl instanceof HTMLElement) || !container.contains(actionEl)) {
            return;
        }

        const action = String(actionEl.dataset.action || '').trim();
        if (!action) return;

        switch (action) {
            case 'nav-back':
                navigateBack();
                return;
            case 'open-conversation':
                openConversation(container, actionEl.dataset.convId || '');
                return;
            case 'open-contact-picker':
                currentContext.state.contactPickerVisible = true;
                currentContext.renderKeepScroll();
                return;
            default:
                return;
        }
    });

    addListener(container, 'change', (event) => {
        const currentContext = getMessageConversationViewContext(container);
        const target = event.target instanceof HTMLSelectElement ? event.target : null;
        if (!currentContext?.state || !(target instanceof HTMLSelectElement) || !container.contains(target)) {
            return;
        }
        if (target.dataset.action !== 'select-prompt-preset') {
            return;
        }

        const nextName = String(target.value || '').trim();
        if (!nextName) return;
        const result = setCurrentPhoneAiInstructionPresetName(nextName);
        if (result?.success) {
            showInlineToast(container, `当前实时回复预设已切换为：${nextName}`);
            currentContext.renderKeepScroll();
            return;
        }
        showInlineToast(container, result?.message || '切换预设失败', true);
    });

    context.delegatedBound = true;
    runtime?.registerCleanup?.(() => {
        const currentContext = getMessageConversationViewContext(container);
        if (currentContext) {
            currentContext.delegatedBound = false;
        }
    });
}

export function renderMessageConversationView(options = {}) {
    const {
        container,
        tableName,
        state,
        readSpecialField,
        createSpecialTemplateStylePayload,
        templateMatch,
        type,
        createDraftConversationId,
        render,
        renderKeepScroll,
        renderContactPicker,
        viewerRuntime,
    } = options;

    if (!(container instanceof HTMLElement) || !state || typeof readSpecialField !== 'function') return;
    if (typeof createSpecialTemplateStylePayload !== 'function') return;
    if (typeof render !== 'function' || typeof renderKeepScroll !== 'function') return;

    const stylePayload = /** @type {any} */ (createSpecialTemplateStylePayload(templateMatch, type, 'conversation'));
    const conversations = buildConversations(state.rowsData, readSpecialField, stylePayload.styleOptions);
    const showAvatar = stylePayload.styleOptions.showAvatar !== false;
    const titleMode = String(stylePayload.styleOptions.conversationTitleMode || 'auto');
    const emptyConversationText = String(stylePayload.styleOptions.emptyConversationText || '暂无消息');
    const timeFallbackText = String(stylePayload.styleOptions.timeFallbackText || '刚刚');
    const aiInstructionPresets = getPhoneAiInstructionPresets();
    const activeAiInstructionPresetName = getCurrentAiInstructionPresetNameText();
    const selectedAiInstructionPresetName = aiInstructionPresets.some((preset) => preset?.name === activeAiInstructionPresetName)
        ? activeAiInstructionPresetName
        : String(aiInstructionPresets[0]?.name || '').trim();
    const showConversationSubtitle = stylePayload.structureOptions?.conversationList?.showSubtitle !== false;
    const showLastMessage = stylePayload.structureOptions?.conversationList?.showLastMessage !== false;
    const showTemplateNote = stylePayload.structureOptions?.composeBar?.showTemplateNote !== false;

    container.innerHTML = `
        <div class="phone-app-page phone-special-app phone-special-message ${stylePayload.className}" ${stylePayload.dataAttrs} style="${stylePayload.styleAttr}">
            ${stylePayload.scopedCss ? `<style class="phone-special-template-inline-style">${stylePayload.scopedCss}</style>` : ''}
            <div class="phone-nav-bar">
                <button type="button" class="phone-nav-back" data-action="nav-back">${PHONE_ICONS.back}<span>返回</span></button>
                <span class="phone-nav-title">${escapeHtml(tableName)}</span>
            </div>
            <div class="phone-app-body phone-table-body">
                <div class="phone-special-conversation-actions">
                    <select class="phone-special-prompt-select" data-action="select-prompt-preset" ${aiInstructionPresets.length > 0 ? '' : 'disabled'}>
                        ${aiInstructionPresets.length > 0
        ? aiInstructionPresets.map((preset) => `
                                    <option value="${escapeHtmlAttr(preset.name)}" ${preset.name === selectedAiInstructionPresetName ? 'selected' : ''}>${escapeHtml(preset.name)}</option>
                                `).join('')
        : '<option value="">暂无预设</option>'}
                    </select>
                    <button type="button" class="phone-special-new-chat-btn" data-action="open-contact-picker">开始聊天</button>
                </div>
                ${showTemplateNote ? `<div class="phone-special-conversation-template-note">当前 AI 指令预设：${escapeHtml(selectedAiInstructionPresetName || activeAiInstructionPresetName || '未选择')}</div>` : ''}
                ${conversations.length === 0
        ? `<div class="phone-empty-msg">${escapeHtml(emptyConversationText)}</div>`
        : `<div class="phone-special-conversation-list">
                        ${conversations.map((conv) => {
            const displayName = resolveConversationHeaderLabel(conv, titleMode, tableName);
            const conversationSubtitle = String(conv.threadSubtitle || '').trim();
            return `
                                <button type="button" class="phone-special-conversation-item" data-action="open-conversation" data-conv-id="${escapeHtmlAttr(conv.id)}">
                                    ${showAvatar
                ? `<span class="phone-special-conversation-avatar" style="background-color:${escapeHtmlAttr(generateColor(displayName))};">${escapeHtml(getAvatarText(displayName))}</span>`
                : ''}
                                    <span class="phone-special-conversation-info">
                                        <span class="phone-special-conversation-name">${escapeHtml(displayName)}</span>
                                        ${showConversationSubtitle && conversationSubtitle ? `<span class="phone-special-conversation-subtitle">${escapeHtml(conversationSubtitle)}</span>` : ''}
                                        ${showLastMessage ? `<span class="phone-special-conversation-last">${escapeHtml(conv.lastMessage || '...')}</span>` : ''}
                                    </span>
                                    <span class="phone-special-conversation-meta">${escapeHtml(formatTimeLike(conv.lastTime) || timeFallbackText)}</span>
                                </button>
                            `;
        }).join('')}
                    </div>`}
            </div>
        </div>
    `;

    setMessageConversationViewContext(container, {
        state,
        readSpecialField,
        createDraftConversationId,
        render,
        renderKeepScroll,
        viewerRuntime,
    });
    bindWheelBridge(container);
    bindMessageConversationViewController(container);

    if (state.contactPickerVisible && typeof renderContactPicker === 'function') {
        renderContactPicker();
    }
}
