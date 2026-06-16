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
    if (currentContext.state && typeof currentContext.state === 'object') {
        currentContext.state.stableTapGuards = currentContext.state.stableTapGuards && typeof currentContext.state.stableTapGuards === 'object'
            ? currentContext.state.stableTapGuards
            : Object.create(null);
    }
    container[MESSAGE_CONVERSATION_VIEW_KEY] = currentContext;
    return currentContext;
}

const POINTER_CLICK_SUPPRESS_MS = {
    mouse: 80,
    touch: 450,
    pen: 450,
    unknown: 80,
};

function normalizePointerType(value) {
    const pointerType = String(value || 'unknown').trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(POINTER_CLICK_SUPPRESS_MS, pointerType) ? pointerType : 'unknown';
}

function getEventTime(event) {
    return Number.isFinite(event?.timeStamp) ? Number(event.timeStamp) : Date.now();
}

function getStableTapGuard(context, action) {
    const guardKey = String(action || '').trim() || '__default__';
    const state = context?.state && typeof context.state === 'object' ? context.state : null;
    if (!state) {
        return {
            lastPointerHandledAt: -Infinity,
            lastPointerType: 'unknown',
        };
    }
    const guards = state?.stableTapGuards && typeof state.stableTapGuards === 'object'
        ? state.stableTapGuards
        : (state.stableTapGuards = Object.create(null));
    const existingGuard = guards[guardKey];
    if (existingGuard && typeof existingGuard === 'object') {
        return existingGuard;
    }

    const guard = {
        lastPointerHandledAt: -Infinity,
        lastPointerType: 'unknown',
    };
    guards[guardKey] = guard;
    return guard;
}

function markPointerHandled(context, action, event) {
    const guard = getStableTapGuard(context, action);
    guard.lastPointerType = normalizePointerType(event?.pointerType);
    guard.lastPointerHandledAt = getEventTime(event);
}

function shouldSuppressSyntheticClick(context, action, event) {
    const guard = getStableTapGuard(context, action);
    const suppressWindow = POINTER_CLICK_SUPPRESS_MS[normalizePointerType(guard.lastPointerType)] ?? POINTER_CLICK_SUPPRESS_MS.unknown;
    const elapsed = getEventTime(event) - guard.lastPointerHandledAt;
    return elapsed >= 0 && elapsed <= suppressWindow;
}

function consumeEvent(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
}

function getActionElement(event, container) {
    const target = event?.target instanceof Element ? event.target : null;
    if (!target || !(container instanceof HTMLElement) || !container.contains(target)) return null;
    const actionEl = target.closest('[data-action]');
    return actionEl instanceof HTMLElement && container.contains(actionEl) ? actionEl : null;
}

function isDisabledActionElement(actionEl) {
    if (!(actionEl instanceof HTMLElement)) return true;
    if (typeof HTMLButtonElement !== 'undefined' && actionEl instanceof HTMLButtonElement && actionEl.disabled) return true;
    if (typeof HTMLButtonElement === 'undefined' && 'disabled' in actionEl && actionEl.disabled === true) return true;
    return actionEl.getAttribute('aria-disabled') === 'true';
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

function dispatchConversationAction(container, context, actionEl) {
    const action = String(actionEl?.dataset?.action || '').trim();
    if (!action) return false;

    switch (action) {
        case 'nav-back':
            navigateBack();
            return true;
        case 'open-conversation':
            openConversation(container, actionEl.dataset.convId || '');
            return true;
        case 'open-contact-picker':
            context.state.contactPickerVisible = true;
            context.renderKeepScroll();
            return true;
        default:
            return false;
    }
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

    addListener(container, 'pointerup', (event) => {
        const currentContext = getMessageConversationViewContext(container);
        const actionEl = getActionElement(event, container);
        if (!currentContext || !actionEl) return;
        if (isDisabledActionElement(actionEl)) return;
        const action = String(actionEl.dataset.action || '').trim();
        if (!action) return;
        if (!['nav-back', 'open-conversation', 'open-contact-picker'].includes(action)) return;
        markPointerHandled(currentContext, action, event);
        consumeEvent(event);
        dispatchConversationAction(container, currentContext, actionEl);
    });

    addListener(container, 'click', (event) => {
        const currentContext = getMessageConversationViewContext(container);
        const actionEl = getActionElement(event, container);
        if (!currentContext || !actionEl) return;
        if (isDisabledActionElement(actionEl)) return;

        const action = String(actionEl.dataset.action || '').trim();
        if (!action) return;
        if (!['nav-back', 'open-conversation', 'open-contact-picker'].includes(action)) return;
        if (shouldSuppressSyntheticClick(currentContext, action, event)) {
            consumeEvent(event);
            return;
        }
        consumeEvent(event);
        dispatchConversationAction(container, currentContext, actionEl);
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
            <div class="phone-app-body phone-table-body phone-special-conversation-body">
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
