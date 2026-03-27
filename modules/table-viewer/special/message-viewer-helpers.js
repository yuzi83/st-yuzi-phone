import {
    getCurrentCharacterDisplayName,
    materializePhoneAiInstructionPresetMessages,
    resolvePhoneAiInstructionMediaMarkers,
} from '../../phone-core/chat-support.js';
import { escapeHtml, escapeHtmlAttr } from '../../utils.js';
import {
    resolveConversationDisplayName,
    normalizeMediaDesc,
    normalizeSenderName,
    getAvatarText,
    formatTimeLike,
    generateColor,
} from './view-utils.js';

/**
 * @typedef {Object} MessageStyleOptions
 * @property {boolean} [showAvatar]
 * @property {boolean} [showMessageTime]
 * @property {string} [mediaActionTextMode]
 * @property {string} [emptyMessageText]
 * @property {string} [timeFallbackText]
 * @property {number} [bubbleMaxWidthPct]
 * @property {string} [emptyConversationText]
 * @property {string} [emptyDetailText]
 * @property {string} [conversationTitleMode]
 */

export function materializeRowFromPayload(headers, payload = {}) {
    const headerList = Array.isArray(headers) ? headers : [];
    return headerList.map((header) => {
        const key = String(header || '').trim();
        return Object.prototype.hasOwnProperty.call(payload, key) ? payload[key] : '';
    });
}

export function getConversationRows(rows, conversationId, readSpecialField) {
    return getConversationRowEntries(rows, conversationId, readSpecialField).map(entry => entry.row);
}

export function getConversationRowEntries(rows, conversationId, readSpecialField) {
    return (Array.isArray(rows) ? rows : []).reduce((result, row, rowIndex) => {
        const fallbackConversationId = `default_thread_${rowIndex + 1}`;
        const rowConversationId = String(readSpecialField(row, 'threadId', fallbackConversationId) || fallbackConversationId).trim() || fallbackConversationId;
        if (rowConversationId === conversationId) {
            result.push({ row, rowIndex });
        }
        return result;
    }, []);
}

export function buildPhoneChatConversationMessages(threadRows, readSpecialField, options = {}) {
    const mediaMarkers = resolvePhoneAiInstructionMediaMarkers(options?.instructionPreset || null);
    const maxHistoryMessagesRaw = Number(options?.maxHistoryMessages);
    const maxHistoryMessages = Number.isFinite(maxHistoryMessagesRaw)
        ? Math.max(0, Math.min(50, Math.round(maxHistoryMessagesRaw)))
        : 12;
    return (maxHistoryMessages > 0 ? (Array.isArray(threadRows) ? threadRows : []).slice(-maxHistoryMessages) : [])
        .map((row) => {
            const sender = normalizeSenderName(readSpecialField(row, 'sender', ''));
            const senderRole = String(readSpecialField(row, 'senderRole', '') || '').trim().toLowerCase();
            const messageStatus = String(readSpecialField(row, 'messageStatus', '') || '').trim();
            const content = buildPromptContentFromRow(row, readSpecialField, mediaMarkers);
            if (!content) return null;

            const isSelf = sender === '我' || ['user', 'self', '主角'].includes(senderRole);
            if (!isSelf && shouldSkipAssistantMessageForPrompt(content, messageStatus)) {
                return null;
            }

            return {
                role: isSelf ? 'user' : 'assistant',
                content,
            };
        })
        .filter(Boolean);
}

export function buildPhoneChatSystemMessages({ instructionPreset, worldbookText, storyContext, conversationTitle, targetCharacterName }) {
    return materializePhoneAiInstructionPresetMessages(instructionPreset, {
        targetCharacterName,
        conversationTitle,
        worldbookText,
        storyContext,
    });
}

function buildPromptContentFromRow(row, readSpecialField, mediaMarkers = {}) {
    const parts = [];
    const content = String(readSpecialField(row, 'content', '') || '').trim();
    const imageDesc = normalizeMediaDesc(readSpecialField(row, 'imageDesc', ''));
    const videoDesc = normalizeMediaDesc(readSpecialField(row, 'videoDesc', ''));
    const imagePrefix = String(mediaMarkers?.imagePrefix ?? '[图片]').trim();
    const videoPrefix = String(mediaMarkers?.videoPrefix ?? '[视频]').trim();

    if (content) parts.push(content);
    if (imageDesc) parts.push(imagePrefix ? `${imagePrefix} ${imageDesc}`.trim() : imageDesc);
    if (videoDesc) parts.push(videoPrefix ? `${videoPrefix} ${videoDesc}`.trim() : videoDesc);

    return parts.join('\n').trim();
}

function shouldSkipAssistantMessageForPrompt(content, messageStatus = '') {
    const safeContent = String(content || '').trim();
    const safeStatus = String(messageStatus || '').trim();
    if (!safeContent) return true;
    if (/^[.…]+$/.test(safeContent)) return true;
    if (/^（回复失败|^（发送异常/.test(safeContent)) return true;
    if (/生成中/.test(safeStatus)) return true;
    return false;
}

export function resolveConversationHeaderLabel(conversation, titleMode = 'auto', fallback = '会话') {
    const conv = conversation || {};
    const resolved = String(resolveConversationDisplayName(conv, titleMode) || '').trim();
    if (resolved && resolved !== '我') {
        return resolved;
    }

    const threadTitle = String(conv.threadTitle || '').trim();
    if (threadTitle) {
        return threadTitle;
    }

    const titleSender = String(conv.titleSender || '').trim();
    if (titleSender && titleSender !== '我') {
        return titleSender;
    }

    return String(fallback || '会话').trim() || '会话';
}

export function findConversationPartnerName(threadRows, readSpecialField, fallback = '对方') {
    const safeFallback = getCurrentCharacterDisplayName(fallback);
    for (let index = threadRows.length - 1; index >= 0; index--) {
        const sender = normalizeSenderName(readSpecialField(threadRows[index], 'sender', ''));
        if (sender && sender !== '我') {
            return sender;
        }
    }
    return safeFallback;
}

export function detectChatTargetFromRows(threadRows, readSpecialField) {
    for (let i = threadRows.length - 1; i >= 0; i--) {
        const target = String(readSpecialField(threadRows[i], 'chatTarget', '') || '').trim();
        if (target) return target;
    }
    for (let i = threadRows.length - 1; i >= 0; i--) {
        const sender = normalizeSenderName(readSpecialField(threadRows[i], 'sender', ''));
        if (sender && sender !== '我') return sender;
    }
    return null;
}

export function createPhoneMessageRequestId() {
    return `phone_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function findRowIndexByRequestId(rows, requestId, readSpecialField, { key = 'requestId', userOnly = false } = {}) {
    const safeRequestId = String(requestId || '').trim();
    if (!safeRequestId) return null;

    for (let index = rows.length - 1; index >= 0; index--) {
        const row = rows[index];
        const rowRequestId = String(readSpecialField(row, key, '') || '').trim();
        if (rowRequestId !== safeRequestId) continue;
        if (userOnly) {
            const sender = normalizeSenderName(readSpecialField(row, 'sender', ''));
            const senderRole = String(readSpecialField(row, 'senderRole', '') || '').trim().toLowerCase();
            const isSelf = sender === '我' || ['user', 'self', '主角'].includes(senderRole);
            if (!isSelf) continue;
        }
        return index + 1;
    }

    return null;
}

export function getRetryTarget(threadRows, readSpecialField) {
    for (let index = threadRows.length - 1; index >= 0; index--) {
        const row = threadRows[index];
        const sender = normalizeSenderName(readSpecialField(row, 'sender', ''));
        const senderRole = String(readSpecialField(row, 'senderRole', '') || '').trim().toLowerCase();
        const messageStatus = String(readSpecialField(row, 'messageStatus', '') || '').trim();
        const requestId = String(readSpecialField(row, 'requestId', '') || '').trim();
        const isSelf = sender === '我' || ['user', 'self', '主角'].includes(senderRole);
        if (!isSelf) continue;
        if (!requestId) continue;
        if (!/待重试|失败/.test(messageStatus)) continue;
        return {
            requestId,
            messageStatus,
        };
    }
    return null;
}

export function scrollMessageDetailToBottom(container, remainingFrames = 2) {
    if (!(container instanceof HTMLElement)) return;
    const body = container.querySelector('.phone-app-body');
    if (!(body instanceof HTMLElement)) return;

    body.scrollTop = body.scrollHeight;
    if (remainingFrames <= 0) return;

    requestAnimationFrame(() => {
        scrollMessageDetailToBottom(container, remainingFrames - 1);
    });
}

function getMessageStatusClass(statusText = '') {
    const text = String(statusText || '').trim();
    if (!text) return '';
    if (/失败|异常|错误|重试/.test(text)) return 'is-error';
    if (/等待|生成中|发送中/.test(text)) return 'is-pending';
    return 'is-success';
}

function buildMessageMetaHtml({ showMessageTime, time, timeFallbackText, messageStatus }) {
    const safeStatus = String(messageStatus || '').trim();
    const statusClass = getMessageStatusClass(safeStatus);
    const timeHtml = showMessageTime
        ? `<div class="phone-special-message-time">${escapeHtml(formatTimeLike(time) || timeFallbackText)}</div>`
        : '';
    const statusHtml = safeStatus
        ? `<span class="phone-special-message-status ${escapeHtmlAttr(statusClass)}">${escapeHtml(safeStatus)}</span>`
        : '';

    if (!timeHtml && !statusHtml) return '';
    return `<div class="phone-special-message-meta">${timeHtml}${statusHtml}</div>`;
}

/**
 * @param {{
 *   row:any,
 *   sourceRowIndex:number,
 *   readSpecialField:Function,
 *   styleOptions:MessageStyleOptions,
 *   deleteManageMode?:boolean,
 *   selected?:boolean,
 * }} params
 */
export function renderOneMessageRow({ row, sourceRowIndex, readSpecialField, styleOptions = /** @type {MessageStyleOptions} */ ({}), deleteManageMode = false, selected = false }) {
    const sender = normalizeSenderName(readSpecialField(row, 'sender', '')) || '';
    const content = readSpecialField(row, 'content', '') || '';
    const time = readSpecialField(row, 'sentAt', '');
    const messageStatus = String(readSpecialField(row, 'messageStatus', '') || '').trim();
    const imageDesc = normalizeMediaDesc(readSpecialField(row, 'imageDesc', ''));
    const videoDesc = normalizeMediaDesc(readSpecialField(row, 'videoDesc', ''));

    const isSelf = sender === '我';
    const senderLabel = isSelf ? '我' : (sender || '对方');
    const senderColor = isSelf ? '#4A90E2' : generateColor(senderLabel);

    const showAvatar = styleOptions.showAvatar !== false;
    const showMessageTime = styleOptions.showMessageTime !== false;
    const mediaActionTextMode = String(styleOptions.mediaActionTextMode || 'short');

    const emptyMessageText = String(styleOptions.emptyMessageText || '（空消息）');
    const timeFallbackText = String(styleOptions.timeFallbackText || '刚刚');
    const bubbleMaxWidthPct = Math.max(48, Math.min(96, Number(styleOptions.bubbleMaxWidthPct || 80)));
    const bubbleInlineStyle = `max-width:${bubbleMaxWidthPct}%;`;

    const renderMediaButtonIcon = (kind) => {
        if (kind === 'video') {
            return `
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M8 6.5C8 5.67 8.94 5.19 9.61 5.68L16.9 10.98C17.46 11.39 17.46 12.21 16.9 12.62L9.61 17.92C8.94 18.41 8 17.93 8 17.1V6.5Z" fill="currentColor"></path>
                    <path d="M4.75 3.75h14.5a1 1 0 0 1 1 1v14.5a1 1 0 0 1-1 1H4.75a1 1 0 0 1-1-1V4.75a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" stroke-width="1.5"></path>
                </svg>
            `;
        }
        return `
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M4.75 5.25A1.5 1.5 0 0 1 6.25 3.75h11.5a1.5 1.5 0 0 1 1.5 1.5v13.5a1.5 1.5 0 0 1-1.5 1.5H6.25a1.5 1.5 0 0 1-1.5-1.5V5.25Z" fill="none" stroke="currentColor" stroke-width="1.5"></path>
                <circle cx="8.25" cy="8.25" r="1.5" fill="currentColor"></circle>
                <path d="m6.5 17 3.4-3.65a1 1 0 0 1 1.47.03l1.76 1.98 1.83-2.03a1 1 0 0 1 1.49.02L18 17" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
        `;
    };

    const messageMetaHtml = buildMessageMetaHtml({
        showMessageTime,
        time,
        timeFallbackText,
        messageStatus,
    });

    const mediaItems = [];
    if (imageDesc) {
        mediaItems.push({
            kind: 'image',
            label: '图片内容',
            text: imageDesc,
            actionText: mediaActionTextMode === 'detailed' ? '查看图片详情' : '查看图片',
        });
    }
    if (videoDesc) {
        mediaItems.push({
            kind: 'video',
            label: '视频内容',
            text: videoDesc,
            actionText: mediaActionTextMode === 'detailed' ? '查看视频详情' : '查看视频',
        });
    }

    const mediaHtml = mediaItems.length > 0
        ? `
            <div class="phone-special-message-media-actions">
                ${mediaItems.map(item => `
                    <button
                        type="button"
                        class="phone-special-media-item phone-special-message-media-btn"
                        data-media-label="${escapeHtmlAttr(item.label)}"
                        data-description="${escapeHtmlAttr(item.text)}"
                        title="${escapeHtmlAttr(item.actionText)}"
                        aria-label="${escapeHtmlAttr(item.actionText)}"
                    >
                        <span class="phone-special-message-media-icon">${renderMediaButtonIcon(item.kind)}</span>
                    </button>
                `).join('')}
            </div>
        `
        : '';

    const contentHtml = `
        <div class="phone-special-message-item ${isSelf ? 'self' : 'other'}">
            ${showAvatar
                ? `<div class="phone-special-name-avatar" style="background-color:${escapeHtmlAttr(senderColor)};">${escapeHtml(getAvatarText(senderLabel))}</div>`
                : ''}
            <div class="phone-special-message-bubble-wrap">
                <div class="phone-special-message-stack" style="${escapeHtmlAttr(bubbleInlineStyle)}">
                    <div class="phone-special-message-bubble">${escapeHtml(content || emptyMessageText)}</div>
                    ${mediaHtml}
                </div>
                ${messageMetaHtml}
            </div>
        </div>
    `;
    if (!deleteManageMode) {
        return contentHtml;
    }

    return `
        <div class="phone-special-message-manage-row ${selected ? 'is-selected' : ''}">
            <button type="button" class="phone-special-message-select-toggle ${selected ? 'is-selected' : ''}" data-row-index="${escapeHtmlAttr(String(sourceRowIndex))}" aria-pressed="${selected ? 'true' : 'false'}">${selected ? '✓' : ''}</button>
            <div class="phone-special-message-manage-main">${contentHtml}</div>
        </div>
    `;
}
