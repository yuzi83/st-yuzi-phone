import { Logger } from '../../error-handler.js';
import {
    appendPhoneMessageRecordsBatch,
    buildPhoneMessagePayloadFromHeaders,
    callPhoneChatAI,
    getCurrentCharacterDisplayName,
    getCurrentPhoneAiInstructionPreset,
    getPhoneChatSettings,
    getPhoneChatWorldbookContext,
    getPhoneStoryContext,
} from '../../phone-core/chat-support.js';
import {
    buildPhoneChatConversationMessages,
    buildPhoneChatSystemMessages,
    createPhoneMessageRequestId,
    findConversationPartnerName,
    getConversationRows,
    materializeRowFromPayload,
    scrollMessageDetailToBottom,
} from './message-viewer-helpers.js';

const logger = Logger.withScope({ scope: 'table-viewer/message-actions', feature: 'table-viewer' });
const MAX_STRUCTURED_REPLY_MESSAGES = 4;
const LOCAL_TEMP_ROW_FLAG = '__yuziPhoneLocalTempMessage';
const LOCAL_TEMP_BATCH_KEY = '__yuziPhoneArchiveBatchId';
const LOCAL_TEMP_KIND_KEY = '__yuziPhoneArchiveKind';

const defaultMessageViewerActionDeps = {
    appendPhoneMessageRecordsBatch,
    buildPhoneMessagePayloadFromHeaders,
    callPhoneChatAI,
    getCurrentPhoneAiInstructionPreset,
    getCurrentCharacterDisplayName,
    getPhoneChatSettings,
    getPhoneChatWorldbookContext,
    getPhoneStoryContext,
    buildPhoneChatConversationMessages,
    buildPhoneChatSystemMessages,
    createPhoneMessageRequestId,
    findConversationPartnerName,
    getConversationRows,
    materializeRowFromPayload,
    scrollMessageDetailToBottom,
};

export function createMessageViewerActions(ctx = {}) {
    const {
        state,
        sheetKey,
        headers,
        container,
        readSpecialField,
        patchComposeUi,
        renderKeepScroll,
        syncRowsFromSheet,
        markLocalTableMutation,
        createDraftConversationId,
        viewerRuntime,
        actionDeps,
    } = ctx;

    const resolvedActionDeps = {
        ...defaultMessageViewerActionDeps,
        ...(actionDeps && typeof actionDeps === 'object' ? actionDeps : {}),
    };
    const {
        appendPhoneMessageRecordsBatch: appendPhoneMessageRecordsBatchImpl,
        buildPhoneMessagePayloadFromHeaders: buildPhoneMessagePayloadFromHeadersImpl,
        callPhoneChatAI: callPhoneChatAIImpl,
        getCurrentPhoneAiInstructionPreset: getCurrentPhoneAiInstructionPresetImpl,
        getCurrentCharacterDisplayName: getCurrentCharacterDisplayNameImpl,
        getPhoneChatSettings: getPhoneChatSettingsImpl,
        getPhoneChatWorldbookContext: getPhoneChatWorldbookContextImpl,
        getPhoneStoryContext: getPhoneStoryContextImpl,
        buildPhoneChatConversationMessages: buildPhoneChatConversationMessagesImpl,
        buildPhoneChatSystemMessages: buildPhoneChatSystemMessagesImpl,
        createPhoneMessageRequestId: createPhoneMessageRequestIdImpl,
        findConversationPartnerName: findConversationPartnerNameImpl,
        getConversationRows: getConversationRowsImpl,
        materializeRowFromPayload: materializeRowFromPayloadImpl,
        scrollMessageDetailToBottom: scrollMessageDetailToBottomImpl,
    } = resolvedActionDeps;

    if (!state || !Array.isArray(headers) || !(container instanceof HTMLElement) || typeof readSpecialField !== 'function') {
        return {
            handleSendMessage: async () => {},
            handleRetryMessage: async () => {},
        };
    }

    const patchCompose = typeof patchComposeUi === 'function' ? patchComposeUi : () => {};
    const rerender = typeof renderKeepScroll === 'function' ? renderKeepScroll : () => {};
    const syncRows = typeof syncRowsFromSheet === 'function' ? syncRowsFromSheet : () => false;
    const markMutation = typeof markLocalTableMutation === 'function' ? markLocalTableMutation : () => {};
    const createDraftConversation = typeof createDraftConversationId === 'function'
        ? createDraftConversationId
        : () => `phone_thread_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const runtime = viewerRuntime && typeof viewerRuntime === 'object' ? viewerRuntime : null;

    const isViewerDisposed = () => {
        if (runtime && typeof runtime.isDisposed === 'function') {
            return runtime.isDisposed();
        }
        return false;
    };
    const isViewerActive = () => !isViewerDisposed();
    const runIfViewerActive = (callback, fallback) => {
        if (!isViewerActive() || typeof callback !== 'function') {
            return fallback;
        }
        return callback();
    };
    const patchComposeIfActive = () => runIfViewerActive(patchCompose);
    const scrollMessageDetailToBottomIfActive = () => runIfViewerActive(() => scrollMessageDetailToBottomImpl(container));

    const warnAction = (action, message, context = {}, error) => {
        logger.warn({
            action,
            message,
            context: {
                sheetKey,
                ...context,
            },
            error,
        });
    };

    const rerenderAndScrollToBottom = () => {
        if (!isViewerActive()) return;
        rerender();
        scrollMessageDetailToBottomImpl(container);
    };

    const rerenderPreservingLocalRows = () => {
        if (!isViewerActive()) return;
        if (state && typeof state === 'object') {
            state.skipSheetSyncOnce = true;
        }
        rerenderAndScrollToBottom();
    };

    const unwrapStructuredReplyField = (value = '') => {
        const safeValue = String(value ?? '').trim();
        const angleMatch = safeValue.match(/^<([\s\S]*)>$/);
        return angleMatch ? String(angleMatch[1] || '').trim() : safeValue;
    };

    const normalizeStructuredMediaValue = (value = '') => {
        const safeValue = unwrapStructuredReplyField(value);
        return safeValue && !/^(none|null|undefined)$/i.test(safeValue) ? safeValue : 'none';
    };

    const hasMeaningfulReplyMessage = (message = {}) => {
        const content = String(message.content || '').trim();
        const imageDesc = normalizeStructuredMediaValue(message.imageDesc);
        const videoDesc = normalizeStructuredMediaValue(message.videoDesc);
        return !!content || imageDesc !== 'none' || videoDesc !== 'none';
    };

    const parseStructuredReplyBlock = (blockText = '') => {
        const text = String(blockText || '').replace(/\r\n?/g, '\n').trim();
        if (!text) {
            return {
                matched: false,
                content: '',
                imageDesc: 'none',
                videoDesc: 'none',
            };
        }

        const structuredMatch = text.match(/^\s*正文[：:]\s*([\s\S]*?)^\s*图片描述[：:]\s*([\s\S]*?)^\s*视频描述[：:]\s*([\s\S]*?)\s*$/m);
        if (structuredMatch) {
            return {
                matched: true,
                content: unwrapStructuredReplyField(structuredMatch[1]),
                imageDesc: normalizeStructuredMediaValue(structuredMatch[2]),
                videoDesc: normalizeStructuredMediaValue(structuredMatch[3]),
            };
        }

        const lineByLineContent = [];
        let imageDesc = 'none';
        let videoDesc = 'none';
        let anyFieldMatched = false;

        for (const line of text.split('\n')) {
            const trimmed = line.trim();
            const contentMatch = trimmed.match(/^正文[：:]\s*([\s\S]*)$/);
            if (contentMatch) {
                const val = unwrapStructuredReplyField(contentMatch[1]);
                if (val) lineByLineContent.push(val);
                anyFieldMatched = true;
                continue;
            }
            const imageMatch = trimmed.match(/^图片描述[：:]\s*([\s\S]*)$/);
            if (imageMatch) {
                imageDesc = normalizeStructuredMediaValue(imageMatch[1]);
                anyFieldMatched = true;
                continue;
            }
            const videoMatch = trimmed.match(/^视频描述[：:]\s*([\s\S]*)$/);
            if (videoMatch) {
                videoDesc = normalizeStructuredMediaValue(videoMatch[1]);
                anyFieldMatched = true;
                continue;
            }
            if (anyFieldMatched && lineByLineContent.length > 0) {
                lineByLineContent.push(line);
            }
        }

        if (anyFieldMatched) {
            return {
                matched: true,
                content: lineByLineContent.join('\n').trim(),
                imageDesc,
                videoDesc,
            };
        }

        return {
            matched: false,
            content: text,
            imageDesc: 'none',
            videoDesc: 'none',
        };
    };

    const parseStructuredAiReply = (rawText = '') => {
        const safeText = String(rawText || '').replace(/\r\n?/g, '\n').trim();
        if (!safeText) {
            return {
                matched: false,
                messages: [],
            };
        }

        const markerRegex = /^\s*消息\s*(\d+)\s*[：:]\s*$/gm;
        const markers = [];
        let markerMatch = markerRegex.exec(safeText);
        while (markerMatch) {
            markers.push({
                index: markerMatch.index,
                end: markerRegex.lastIndex,
                order: Number(markerMatch[1]),
            });
            markerMatch = markerRegex.exec(safeText);
        }

        if (markers.length > 0) {
            const messages = markers
                .slice(0, MAX_STRUCTURED_REPLY_MESSAGES)
                .map((marker, index) => {
                    const nextMarker = markers[index + 1];
                    const blockText = safeText.slice(marker.end, nextMarker ? nextMarker.index : safeText.length);
                    return parseStructuredReplyBlock(blockText);
                })
                .filter(hasMeaningfulReplyMessage)
                .map((message) => ({
                    content: String(message.content || '').trim(),
                    imageDesc: normalizeStructuredMediaValue(message.imageDesc),
                    videoDesc: normalizeStructuredMediaValue(message.videoDesc),
                }));

            return {
                matched: true,
                messages,
            };
        }

        const legacyMessage = parseStructuredReplyBlock(safeText);
        const normalizedLegacyMessage = {
            content: String(legacyMessage.content || '').trim(),
            imageDesc: normalizeStructuredMediaValue(legacyMessage.imageDesc),
            videoDesc: normalizeStructuredMediaValue(legacyMessage.videoDesc),
        };

        return {
            matched: legacyMessage.matched,
            messages: hasMeaningfulReplyMessage(normalizedLegacyMessage) ? [normalizedLegacyMessage] : [],
        };
    };

    const buildAiRuntime = async (conversationId, threadTitle) => {
        const phoneChatSettings = getPhoneChatSettingsImpl();
        const instructionPreset = getCurrentPhoneAiInstructionPresetImpl();
        const storyContext = phoneChatSettings.useStoryContext
            ? await getPhoneStoryContextImpl(phoneChatSettings.storyContextTurns)
            : '';
        const worldbookContext = await getPhoneChatWorldbookContextImpl(phoneChatSettings);
        const threadRows = getConversationRowsImpl(state.rowsData, conversationId, readSpecialField);
        const partnerName = state.selectedTarget
            || findConversationPartnerNameImpl(
                threadRows,
                readSpecialField,
                getCurrentCharacterDisplayNameImpl(threadTitle || '对方')
            );
        const targetCharacterName = String(state.selectedTarget || partnerName || '').trim();
        const aiMessages = [
            ...buildPhoneChatSystemMessagesImpl({
                instructionPreset,
                worldbookText: worldbookContext.text,
                storyContext,
                conversationTitle: threadTitle,
                targetCharacterName,
            }),
            ...buildPhoneChatConversationMessagesImpl(threadRows, readSpecialField, {
                instructionPreset,
                maxHistoryMessages: phoneChatSettings.maxHistoryMessages,
            }),
        ];

        return {
            phoneChatSettings,
            partnerName,
            targetCharacterName,
            aiMessages,
        };
    };

    const markLocalTempRow = (row, batchId, kind) => {
        if (!Array.isArray(row)) return row;
        Object.defineProperties(row, {
            [LOCAL_TEMP_ROW_FLAG]: { value: true, configurable: true },
            [LOCAL_TEMP_BATCH_KEY]: { value: batchId, configurable: true },
            [LOCAL_TEMP_KIND_KEY]: { value: kind, configurable: true },
        });
        return row;
    };

    const createLocalTempRow = (payload, batchId, kind) => {
        const rowPayload = typeof buildPhoneMessagePayloadFromHeadersImpl === 'function'
            ? buildPhoneMessagePayloadFromHeadersImpl(headers, payload)
            : payload;
        const row = materializeRowFromPayloadImpl(headers, rowPayload);
        return markLocalTempRow(row, batchId, kind);
    };

    const removeLocalTempRows = (batchId) => {
        const safeBatchId = String(batchId || '').trim();
        if (!safeBatchId || !Array.isArray(state.rowsData)) return false;
        const beforeLength = state.rowsData.length;
        state.rowsData = state.rowsData.filter((row) => !(row && row[LOCAL_TEMP_BATCH_KEY] === safeBatchId));
        return state.rowsData.length !== beforeLength;
    };

    const appendLocalTempRows = (records = [], batchId = '') => {
        if (!Array.isArray(records) || records.length === 0) return [];
        const rows = records.map((record, index) => createLocalTempRow(record, batchId, index === 0 ? 'user' : 'assistant'));
        state.rowsData.push(...rows);
        return rows;
    };

    const clearPendingArchive = (batchId = '') => {
        const safeBatchId = String(batchId || state.pendingArchive?.batchId || '').trim();
        if (safeBatchId) {
            removeLocalTempRows(safeBatchId);
        }
        state.pendingArchive = null;
    };

    const finalizeArchiveSuccess = (archiveResult, batchId, successText) => {
        if (!isViewerActive()) return;
        state.pendingArchive = null;
        state.sending = false;
        state.errorText = '';
        state.statusText = archiveResult?.refreshed === false
            ? `${successText}，但投影刷新失败`
            : successText;

        const synced = syncRows();
        if (!synced) {
            removeLocalTempRows(batchId);
            if (Array.isArray(archiveResult?.rows) && archiveResult.rows.length > 0) {
                state.rowsData.push(...archiveResult.rows.map((row) => (Array.isArray(row) ? [...row] : row)));
            }
        }
        rerenderAndScrollToBottom();
    };

    const failBeforeArchive = (batchId, conversationId, draftText, message) => {
        if (!isViewerActive()) return;
        removeLocalTempRows(batchId);
        state.pendingArchive = null;
        state.sending = false;
        state.draftByConversation[conversationId] = draftText;
        state.errorText = String(message || '角色回复失败');
        state.statusText = '';
        rerenderPreservingLocalRows();
    };

    const failArchive = (archiveState, message) => {
        if (!isViewerActive()) return;
        state.pendingArchive = {
            ...archiveState,
            status: 'failed',
            message: String(message || '归档失败'),
        };
        state.sending = false;
        state.errorText = String(message || '归档失败');
        state.statusText = '归档失败，可重新归档';
        rerenderPreservingLocalRows();
    };

    const archiveRecords = async (archiveState) => {
        markMutation(1800);
        return await appendPhoneMessageRecordsBatchImpl(sheetKey, archiveState.records);
    };

    const handleSendMessage = async ({ conversationId, threadTitle }) => {
        if (!isViewerActive()) return;
        if (state.sending) return;

        const activeConversationId = String(conversationId || '').trim() || createDraftConversation();
        const draftText = String(
            state.draftByConversation[activeConversationId]
            || state.draftByConversation[conversationId]
            || ''
        ).trim();
        if (!draftText) {
            state.errorText = '请输入消息内容';
            state.statusText = '';
            patchComposeIfActive();
            return;
        }

        clearPendingArchive();

        const requestId = createPhoneMessageRequestIdImpl();
        const batchId = `${requestId}_batch`;
        const sentAt = new Date().toISOString();
        const userRecord = {
            threadId: activeConversationId,
            threadTitle,
            sender: '主角',
            senderRole: 'user',
            chatTarget: state.selectedTarget || '',
            content: draftText,
            sentAt,
            requestId,
            imageDesc: 'none',
            videoDesc: 'none',
        };

        state.sending = true;
        state.errorText = '';
        state.statusText = '正在等待角色回复...';
        state.conversationId = activeConversationId;
        state.draftByConversation[activeConversationId] = '';
        state.pendingArchive = null;
        appendLocalTempRows([userRecord], batchId);
        rerenderPreservingLocalRows();

        let archiveState = null;

        try {
            const { phoneChatSettings, partnerName, targetCharacterName, aiMessages } = await buildAiRuntime(activeConversationId, threadTitle);
            const aiResult = await callPhoneChatAIImpl(aiMessages, {
                apiPresetName: phoneChatSettings.apiPresetName,
                maxTokens: phoneChatSettings.maxReplyTokens,
                timeout: phoneChatSettings.requestTimeoutMs,
            });

            if (!aiResult.ok) {
                failBeforeArchive(batchId, activeConversationId, draftText, aiResult.message || '角色回复失败');
                return;
            }

            const parsedAssistantReply = parseStructuredAiReply(aiResult.text);
            if (!Array.isArray(parsedAssistantReply.messages) || parsedAssistantReply.messages.length === 0) {
                failBeforeArchive(batchId, activeConversationId, draftText, '角色回复为空');
                return;
            }

            const assistantRecords = parsedAssistantReply.messages.slice(0, MAX_STRUCTURED_REPLY_MESSAGES).map((message, index) => ({
                threadId: activeConversationId,
                threadTitle,
                sender: partnerName,
                senderRole: 'assistant',
                chatTarget: targetCharacterName,
                content: message.content,
                sentAt: new Date(Date.now() + index + 1).toISOString(),
                requestId: `${requestId}_reply_${index + 1}`,
                replyToMessageId: requestId,
                imageDesc: message.imageDesc,
                videoDesc: message.videoDesc,
            }));

            archiveState = {
                status: 'pending',
                batchId,
                conversationId: activeConversationId,
                threadTitle,
                draftText,
                records: [userRecord, ...assistantRecords],
            };

            if (!isViewerActive()) {
                const inactiveArchiveResult = await archiveRecords(archiveState);
                if (!inactiveArchiveResult?.ok) {
                    warnAction('send.archive.inactive_failed', '页面已离开时归档失败', {
                        activeConversationId,
                        requestId,
                        batchId,
                        failureMessage: inactiveArchiveResult?.message || '归档失败',
                    });
                }
                return;
            }

            appendLocalTempRows(assistantRecords, batchId);
            state.statusText = '正在归档聊天记录...';
            rerenderPreservingLocalRows();
            state.pendingArchive = archiveState;

            const archiveResult = await archiveRecords(archiveState);
            if (!archiveResult?.ok) {
                failArchive(archiveState, archiveResult?.message || '归档失败');
                return;
            }

            finalizeArchiveSuccess(archiveResult, batchId, '发送成功');
        } catch (error) {
            warnAction('send.exception', '发送流程异常', {
                activeConversationId,
                requestId,
                archiveStarted: !!archiveState,
            }, error);
            if (archiveState) {
                failArchive(archiveState, error?.message || '归档过程中发生异常');
                return;
            }
            failBeforeArchive(batchId, activeConversationId, draftText, error?.message || '发送过程中发生异常');
        }
    };

    const handleRetryMessage = async ({ conversationId }) => {
        if (!isViewerActive()) return;
        if (state.sending) return;

        const pendingArchive = state.pendingArchive && typeof state.pendingArchive === 'object'
            ? state.pendingArchive
            : null;
        const activeConversationId = String(conversationId || '').trim();
        if (!pendingArchive || pendingArchive.status !== 'failed') {
            state.errorText = '当前没有可重新归档的消息';
            state.statusText = '';
            patchComposeIfActive();
            return;
        }
        if (activeConversationId && pendingArchive.conversationId !== activeConversationId) {
            state.errorText = '当前会话没有可重新归档的消息';
            state.statusText = '';
            patchComposeIfActive();
            return;
        }

        state.sending = true;
        state.errorText = '';
        state.statusText = '正在重新归档...';
        patchComposeIfActive();
        scrollMessageDetailToBottomIfActive();

        try {
            const retryState = {
                ...pendingArchive,
                status: 'pending',
            };
            state.pendingArchive = retryState;
            const archiveResult = await archiveRecords(retryState);
            if (!archiveResult?.ok) {
                failArchive(retryState, archiveResult?.message || '重新归档失败');
                return;
            }
            finalizeArchiveSuccess(archiveResult, retryState.batchId, '重新归档成功');
        } catch (error) {
            warnAction('archive.retry.exception', '重新归档流程异常', {
                conversationId: pendingArchive.conversationId,
                batchId: pendingArchive.batchId,
            }, error);
            failArchive(pendingArchive, error?.message || '重新归档过程中发生异常');
        }
    };

    return {
        handleSendMessage,
        handleRetryMessage,
    };
}
