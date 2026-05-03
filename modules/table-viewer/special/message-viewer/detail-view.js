import { getCurrentCharacterDisplayName } from '../../../phone-core/chat-support.js';
import { PHONE_ICONS } from '../../../phone-home/icons.js';
import { escapeHtml } from '../../../utils/dom-escape.js';
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
import { getCurrentAiInstructionPresetNameText } from './shared.js';

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
    const archiveRetryTarget = state.pendingArchive
        && state.pendingArchive.status === 'failed'
        && state.pendingArchive.conversationId === conversationId
        ? state.pendingArchive
        : null;
    const statusText = String(state.errorText || state.statusText || '').trim();
    const statusClass = state.errorText
        ? 'is-error'
        : (state.sending ? 'is-pending' : (statusText ? 'is-success' : ''));
    const selectedCount = Array.isArray(state.selectedMessageRowIndexes)
        ? state.selectedMessageRowIndexes.filter((rowIndex) => selectableRowIndexSet.has(rowIndex)).length
        : 0;
    const activeAiInstructionPresetName = getCurrentAiInstructionPresetNameText();
    const detailSubtitle = String(currentConversation?.threadSubtitle || '').trim();
    const showDetailSubtitle = stylePayload.structureOptions?.detailHeader?.showSubtitle !== false;
    const showComposeStatus = stylePayload.structureOptions?.composeBar?.showStatusText !== false;
    const showComposeTemplateNote = stylePayload.structureOptions?.composeBar?.showTemplateNote !== false;
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
                        <div class="phone-special-message-compose-editor">
                            <textarea
                                class="phone-special-message-compose-input"
                                rows="1"
                                placeholder="输入消息，按 Enter 发送"
                                ${state.sending ? 'disabled' : ''}
                            >${escapeHtml(currentDraft)}</textarea>
                            <button type="button" class="phone-special-message-send-btn" data-action="send-message" ${state.sending ? 'disabled' : ''}>${state.sending ? '...' : '发送'}</button>
                        </div>
                        <div class="phone-special-message-compose-meta">
                            ${showComposeTemplateNote ? `<span class="phone-special-message-template-pill">${escapeHtml(activeAiInstructionPresetName)}</span>` : ''}
                            ${showComposeStatus ? `<div class="phone-special-message-compose-status ${statusClass}">${escapeHtml(statusText || ' ')}</div>` : ''}
                            ${showRetryButton && archiveRetryTarget ? `<button type="button" class="phone-special-message-retry-btn" data-action="retry-archive" ${state.sending ? 'disabled' : ''}>重新归档</button>` : ''}
                        </div>
                    </div>
                `}
            </div>
            ${state.mediaPreview ? renderInPhoneMediaPreview(state.mediaPreview.title, state.mediaPreview.content) : ''}
        </div>
    `;

    bindWheelBridge(container);

    return {
        conversationId,
        detailTitle,
        rowEntriesInConv,
    };
}
