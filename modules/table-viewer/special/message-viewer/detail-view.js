import { getCurrentCharacterDisplayName } from '../../../phone-core/chat-support.js';
import { PHONE_ICONS } from '../../../phone-home/icons.js';
import { escapeHtml, escapeHtmlAttr } from '../../../utils/dom-escape.js';
import { bindWheelBridge } from '../../shared-ui.js';
import {
    getConversationRowEntries,
    renderOneMessageRow,
    resolveConversationHeaderLabel,
} from '../message-viewer-helpers.js';
import {
    buildConversations,
    renderInPhoneMediaPreview,
} from '../view-utils.js';

const COMPOSE_MEDIA_KINDS = {
    image: { key: 'imageDesc', label: '图片描述', title: '添加图片描述' },
    video: { key: 'videoDesc', label: '视频描述', title: '添加视频描述' },
};

function renderComposeMediaIcon(kind) {
    if (kind === 'image') {
        return `
            <svg class="phone-special-message-attachment-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <rect x="4.5" y="5" width="15" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/>
                <circle cx="9" cy="10" r="1.6" fill="currentColor"/>
                <path d="M7.2 16.4l3.4-3.5 2.4 2.3 2.1-2.1 2.7 3.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;
    }
    if (kind === 'video') {
        return `
            <svg class="phone-special-message-attachment-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <rect x="4.5" y="6.5" width="11" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/>
                <path d="M15.5 10.2l4-2.3v8.2l-4-2.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;
    }
    return '';
}

function normalizeComposeMediaText(value) {
    const text = String(value || '').trim();
    return text && text.toLowerCase() !== 'none' ? text : '';
}

function getComposeMediaForConversation(state, conversationId) {
    const mediaMap = state?.composeMediaByConversation && typeof state.composeMediaByConversation === 'object'
        ? state.composeMediaByConversation
        : {};
    const media = mediaMap[conversationId] && typeof mediaMap[conversationId] === 'object'
        ? mediaMap[conversationId]
        : {};
    return {
        imageDesc: normalizeComposeMediaText(media.imageDesc),
        videoDesc: normalizeComposeMediaText(media.videoDesc),
    };
}

function renderComposeMediaButton(kind, conversationId, disabled) {
    const config = COMPOSE_MEDIA_KINDS[kind];
    if (!config) return '';
    return `<button type="button" class="phone-special-message-attachment-btn" data-action="open-attachment-dialog" data-media-kind="${escapeHtmlAttr(kind)}" data-conversation-id="${escapeHtmlAttr(conversationId)}" aria-label="${escapeHtmlAttr(config.title)}" title="${escapeHtmlAttr(config.title)}" ${disabled ? 'disabled' : ''}>${renderComposeMediaIcon(kind)}</button>`;
}

function renderComposeMediaChips(media, conversationId, disabled) {
    return Object.entries(COMPOSE_MEDIA_KINDS).map(([kind, config]) => {
        const text = normalizeComposeMediaText(media[config.key]);
        if (!text) return '';
        return `
            <span class="phone-special-message-attachment-chip" data-media-kind="${escapeHtmlAttr(kind)}">
                <button type="button" class="phone-special-message-attachment-chip-main" data-action="open-attachment-dialog" data-media-kind="${escapeHtmlAttr(kind)}" data-conversation-id="${escapeHtmlAttr(conversationId)}" aria-label="编辑${escapeHtmlAttr(config.label)}" title="${escapeHtmlAttr(config.label)}已添加：${escapeHtmlAttr(text)}" ${disabled ? 'disabled' : ''}>${renderComposeMediaIcon(kind)}</button>
                <button type="button" class="phone-special-message-attachment-chip-clear" data-action="clear-compose-media" data-media-kind="${escapeHtmlAttr(kind)}" data-conversation-id="${escapeHtmlAttr(conversationId)}" aria-label="清除${escapeHtmlAttr(config.label)}" title="清除${escapeHtmlAttr(config.label)}" ${disabled ? 'disabled' : ''}>×</button>
            </span>
        `;
    }).join('');
}

function renderAttachmentDialog(state, conversationId) {
    const dialog = state?.attachmentDialog && typeof state.attachmentDialog === 'object' ? state.attachmentDialog : null;
    const kind = String(dialog?.kind || '').trim();
    const config = COMPOSE_MEDIA_KINDS[kind];
    if (!dialog?.visible || !config || String(dialog.conversationId || '') !== conversationId) return '';
    const draftValue = String(dialog.draftValue || '');
    return `
        <div class="phone-special-attachment-dialog-mask phone-special-viewport-overlay" data-conversation-id="${escapeHtmlAttr(conversationId)}">
            <div class="phone-special-attachment-dialog" role="dialog" aria-modal="true" aria-label="${escapeHtmlAttr(config.label)}" data-dialog-root="compose-media">
                <div class="phone-special-attachment-dialog-header">
                    <div class="phone-special-attachment-dialog-title">添加${escapeHtml(config.label)}</div>
                    <button type="button" class="phone-special-attachment-dialog-close" data-action="close-attachment-dialog" data-conversation-id="${escapeHtmlAttr(conversationId)}">×</button>
                </div>
                <div class="phone-special-attachment-dialog-body">
                    <label class="phone-special-attachment-dialog-field">
                        <span>描述内容</span>
                        <textarea class="phone-special-message-attachment-textarea" rows="5" data-conversation-id="${escapeHtmlAttr(conversationId)}" data-media-kind="${escapeHtmlAttr(kind)}" placeholder="写给 AI 的${escapeHtmlAttr(config.label)}，不会上传真实文件。">${escapeHtml(draftValue)}</textarea>
                    </label>
                </div>
                <div class="phone-special-attachment-dialog-footer">
                    <button type="button" class="phone-special-attachment-dialog-cancel" data-action="close-attachment-dialog" data-conversation-id="${escapeHtmlAttr(conversationId)}">取消</button>
                    <button type="button" class="phone-special-attachment-dialog-confirm" data-action="save-compose-media" data-media-kind="${escapeHtmlAttr(kind)}" data-conversation-id="${escapeHtmlAttr(conversationId)}">保存</button>
                </div>
            </div>
        </div>
    `;
}

export function renderMessageDetailView(options = {}) {
    const {
        container,
        tableName,
        state,
        readSpecialField,
        createSpecialTemplateStylePayload,
        templateMatch,
        type,
    } = options;

    if (!(container instanceof HTMLElement) || !state || typeof readSpecialField !== 'function') {
        return null;
    }
    if (typeof createSpecialTemplateStylePayload !== 'function') {
        return null;
    }

    const conversationId = String(state.conversationId || 'default_thread').trim() || 'default_thread';
    const rowEntriesInConv = getConversationRowEntries(state.rowsData, conversationId, readSpecialField);
    const selectableRowEntries = rowEntriesInConv.filter((entry) => !entry.row?.__yuziPhoneLocalTempMessage);
    const selectableRowIndexSet = new Set(selectableRowEntries.map((entry) => entry.rowIndex));
    const stylePayload = /** @type {any} */ (createSpecialTemplateStylePayload(templateMatch, type, 'detail'));
    const emptyDetailText = String(stylePayload.styleOptions.emptyDetailText || '该会话暂无消息');
    const allConversations = buildConversations(state.rowsData, readSpecialField, stylePayload.styleOptions);
    const currentConversation = allConversations.find((conv) => conv.id === conversationId);
    const detailTitle = state.selectedTarget
        || (currentConversation
            ? resolveConversationHeaderLabel(currentConversation, 'auto', tableName)
            : getCurrentCharacterDisplayName(tableName));
    const currentDraft = String(state.draftByConversation?.[conversationId] || '');
    const composeMedia = getComposeMediaForConversation(state, conversationId);
    const composeMediaChips = renderComposeMediaChips(composeMedia, conversationId, state.sending);
    const archiveRetryTarget = state.pendingArchive
        && state.pendingArchive.status === 'failed'
        && state.pendingArchive.conversationId === conversationId
        ? state.pendingArchive
        : null;
    const statusText = String(state.errorText || state.statusText || '').trim();
    const statusClass = state.errorText
        ? 'is-error'
        : (state.sending ? 'is-pending' : (statusText ? 'is-success' : ''));
    const sendPhase = String(state.sendPhase || '').trim();
    const isAiPending = state.sending && sendPhase === 'ai';
    const isArchivePending = state.sending && sendPhase === 'archive';
    const sendButtonAction = isAiPending ? 'stop-message' : 'send-message';
    const sendButtonText = isAiPending ? '取消' : (isArchivePending ? '归档中...' : '发送');
    const sendButtonDisabled = isArchivePending;
    const sendButtonClass = isAiPending ? ' is-stop' : (isArchivePending ? ' is-pending' : '');
    const selectedCount = Array.isArray(state.selectedMessageRowIndexes)
        ? state.selectedMessageRowIndexes.filter((rowIndex) => selectableRowIndexSet.has(rowIndex)).length
        : 0;
    const detailSubtitle = String(currentConversation?.threadSubtitle || '').trim();
    const showDetailSubtitle = stylePayload.structureOptions?.detailHeader?.showSubtitle !== false;
    const showComposeStatus = stylePayload.structureOptions?.composeBar?.showStatusText !== false;
    const showRetryButton = stylePayload.structureOptions?.composeBar?.showRetryButton !== false;

    container.innerHTML = `
        <div class="phone-app-page phone-special-app phone-special-message ${stylePayload.className}" ${stylePayload.dataAttrs} style="${stylePayload.styleAttr}">
            ${stylePayload.scopedCss ? `<style class="phone-special-template-inline-style">${stylePayload.scopedCss}</style>` : ''}
            <div class="phone-nav-bar">
                <button type="button" class="phone-nav-back" data-action="nav-back">${PHONE_ICONS.back}<span>返回</span></button>
                <span class="phone-nav-title">${escapeHtml(detailTitle || tableName)}</span>
                <button type="button" class="phone-special-nav-action-btn ${state.deleteManageMode ? 'is-active' : ''}" data-action="toggle-delete-mode">${state.deleteManageMode ? '完成' : '删除'}</button>
            </div>
            <div class="phone-app-body phone-table-body phone-special-message-body">
                ${showDetailSubtitle && detailSubtitle ? `<div class="phone-special-detail-subtitle">${escapeHtml(detailSubtitle)}</div>` : ''}
                <div class="phone-special-message-thread">
                    ${state.deleteManageMode ? `
                        <div class="phone-special-manage-bar">
                            <button type="button" class="phone-special-manage-btn phone-special-manage-select-all-btn" data-action="select-all" ${state.deletingSelection ? 'disabled' : ''}>全选</button>
                            <button type="button" class="phone-special-manage-btn phone-special-manage-clear-btn" data-action="clear-selection" ${state.deletingSelection ? 'disabled' : ''}>取消全选</button>
                            <button type="button" class="phone-special-manage-btn phone-special-manage-delete-btn" data-action="delete-selection" ${selectedCount === 0 || state.deletingSelection ? 'disabled' : ''}>${state.deletingSelection ? '删除中...' : `删除已选（${selectedCount}）`}</button>
                        </div>
                    ` : ''}
                    <div class="phone-special-message-list">
                        ${rowEntriesInConv.length === 0 ? `<div class="phone-empty-msg">${escapeHtml(emptyDetailText)}</div>` : rowEntriesInConv.map((entry) => renderOneMessageRow({
                            row: entry.row,
                            sourceRowIndex: entry.rowIndex,
                            readSpecialField,
                            styleOptions: stylePayload.styleOptions,
                            deleteManageMode: state.deleteManageMode && !entry.row?.__yuziPhoneLocalTempMessage,
                            selected: !entry.row?.__yuziPhoneLocalTempMessage && state.selectedMessageRowIndexes.includes(entry.rowIndex),
                        })).join('')}
                    </div>
                </div>
                ${state.deleteManageMode ? '' : `
                    <div class="phone-special-message-compose">
                        ${composeMediaChips ? `<div class="phone-special-message-attachment-chips" aria-label="当前消息附件">${composeMediaChips}</div>` : ''}
                        <div class="phone-special-message-compose-editor">
                            <textarea
                                class="phone-special-message-compose-input"
                                rows="1"
                                placeholder="输入消息，按 Enter 发送"
                                ${state.sending ? 'disabled' : ''}
                            >${escapeHtml(currentDraft)}</textarea>
                            <button type="button" class="phone-special-message-send-btn${sendButtonClass}" data-default-action="send-message" data-action="${sendButtonAction}" ${sendButtonDisabled ? 'disabled' : ''}>${escapeHtml(sendButtonText)}</button>
                        </div>
                        <div class="phone-special-message-compose-meta">
                            <div class="phone-special-message-attachment-actions" aria-label="发送前媒体描述">
                                ${renderComposeMediaButton('image', conversationId, state.sending)}
                                ${renderComposeMediaButton('video', conversationId, state.sending)}
                            </div>
                            ${showComposeStatus ? `<div class="phone-special-message-compose-status ${statusClass}">${escapeHtml(statusText || ' ')}</div>` : ''}
                            ${showRetryButton && archiveRetryTarget ? `<button type="button" class="phone-special-message-retry-btn" data-action="retry-message" ${state.sending ? 'disabled' : ''}>重新归档</button>` : ''}
                        </div>
                    </div>
                `}
            </div>
            ${state.mediaPreview ? renderInPhoneMediaPreview(state.mediaPreview.title, state.mediaPreview.content) : ''}
            ${renderAttachmentDialog(state, conversationId)}
        </div>
    `;

    bindWheelBridge(container);

    return {
        conversationId,
        detailTitle,
        rowEntriesInConv,
    };
}
