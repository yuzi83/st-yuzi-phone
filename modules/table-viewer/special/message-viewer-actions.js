import {
    callPhoneChatAI,
    getCurrentPhoneAiInstructionPreset,
    getCurrentCharacterDisplayName,
    getPhoneChatSettings,
    getPhoneChatWorldbookContext,
    getPhoneStoryContext,
    insertPhoneMessageRecord,
    refreshPhoneMessageProjection,
    updatePhoneMessageRecord,
} from '../../phone-core/chat-support.js';
import {
    buildPhoneChatConversationMessages,
    buildPhoneChatSystemMessages,
    createPhoneMessageRequestId,
    findConversationPartnerName,
    findRowIndexByRequestId,
    getConversationRows,
    getRetryTarget,
    materializeRowFromPayload,
    scrollMessageDetailToBottom,
} from './message-viewer-helpers.js';

const defaultMessageViewerActionDeps = {
    callPhoneChatAI,
    getCurrentPhoneAiInstructionPreset,
    getCurrentCharacterDisplayName,
    getPhoneChatSettings,
    getPhoneChatWorldbookContext,
    getPhoneStoryContext,
    insertPhoneMessageRecord,
    refreshPhoneMessageProjection,
    updatePhoneMessageRecord,
    buildPhoneChatConversationMessages,
    buildPhoneChatSystemMessages,
    createPhoneMessageRequestId,
    findConversationPartnerName,
    findRowIndexByRequestId,
    getConversationRows,
    getRetryTarget,
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
        actionDeps,
    } = ctx;

    const resolvedActionDeps = {
        ...defaultMessageViewerActionDeps,
        ...(actionDeps && typeof actionDeps === 'object' ? actionDeps : {}),
    };
    const {
        callPhoneChatAI: callPhoneChatAIImpl,
        getCurrentPhoneAiInstructionPreset: getCurrentPhoneAiInstructionPresetImpl,
        getCurrentCharacterDisplayName: getCurrentCharacterDisplayNameImpl,
        getPhoneChatSettings: getPhoneChatSettingsImpl,
        getPhoneChatWorldbookContext: getPhoneChatWorldbookContextImpl,
        getPhoneStoryContext: getPhoneStoryContextImpl,
        insertPhoneMessageRecord: insertPhoneMessageRecordImpl,
        refreshPhoneMessageProjection: refreshPhoneMessageProjectionImpl,
        updatePhoneMessageRecord: updatePhoneMessageRecordImpl,
        buildPhoneChatConversationMessages: buildPhoneChatConversationMessagesImpl,
        buildPhoneChatSystemMessages: buildPhoneChatSystemMessagesImpl,
        createPhoneMessageRequestId: createPhoneMessageRequestIdImpl,
        findConversationPartnerName: findConversationPartnerNameImpl,
        findRowIndexByRequestId: findRowIndexByRequestIdImpl,
        getConversationRows: getConversationRowsImpl,
        getRetryTarget: getRetryTargetImpl,
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

    const rerenderAndScrollToBottom = () => {
        rerender();
        scrollMessageDetailToBottomImpl(container);
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

    const parseStructuredAiReply = (rawText = '') => {
        const safeText = String(rawText || '').replace(/\r\n?/g, '\n').trim();
        if (!safeText) {
            return {
                matched: false,
                content: '',
                imageDesc: 'none',
                videoDesc: 'none',
            };
        }

        const structuredMatch = safeText.match(/^\s*正文[：:]\s*([\s\S]*?)^\s*图片描述[：:]\s*([\s\S]*?)^\s*视频描述[：:]\s*([\s\S]*?)\s*$/m);
        if (!structuredMatch) {
            return {
                matched: false,
                content: safeText,
                imageDesc: 'none',
                videoDesc: 'none',
            };
        }

        return {
            matched: true,
            content: unwrapStructuredReplyField(structuredMatch[1]),
            imageDesc: normalizeStructuredMediaValue(structuredMatch[2]),
            videoDesc: normalizeStructuredMediaValue(structuredMatch[3]),
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

    const handleSendMessage = async ({ conversationId, threadTitle }) => {
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
            patchCompose();
            return;
        }

        state.sending = true;
        state.errorText = '';
        state.statusText = '正在发送消息...';
        state.conversationId = activeConversationId;
        patchCompose();
        scrollMessageDetailToBottomImpl(container);

        const requestId = createPhoneMessageRequestIdImpl();
        const sentAt = new Date().toISOString();
        const userRecord = {
            threadId: activeConversationId,
            threadTitle,
            sender: '主角',
            senderRole: 'user',
            chatTarget: state.selectedTarget || '',
            content: draftText,
            sentAt,
            messageStatus: '等待回复',
            requestId,
            imageDesc: 'none',
            videoDesc: 'none',
        };

        markMutation();
        const userInsert = /** @type {any} */ (await insertPhoneMessageRecordImpl(sheetKey, userRecord));
        if (!userInsert.ok) {
            state.sending = false;
            state.errorText = String(userInsert.message || '用户消息写入失败');
            state.statusText = '';
            patchCompose();
            return;
        }

        state.rowsData.push(materializeRowFromPayloadImpl(headers, userInsert.payload));
        state.draftByConversation[activeConversationId] = '';
        state.statusText = '正在等待角色回复...';
        rerenderAndScrollToBottom();

        let assistantPlaceholder = /** @type {any} */ (null);

        try {
            const { phoneChatSettings, partnerName, targetCharacterName, aiMessages } = await buildAiRuntime(activeConversationId, threadTitle);

            markMutation();
            assistantPlaceholder = /** @type {any} */ (await insertPhoneMessageRecordImpl(sheetKey, {
                threadId: activeConversationId,
                threadTitle,
                sender: partnerName,
                senderRole: 'assistant',
                chatTarget: targetCharacterName,
                content: '…',
                sentAt: new Date().toISOString(),
                messageStatus: '生成中',
                requestId: `${requestId}_reply`,
                replyToMessageId: requestId,
                imageDesc: 'none',
                videoDesc: 'none',
            }));

            if (assistantPlaceholder.ok) {
                state.rowsData.push(materializeRowFromPayloadImpl(headers, assistantPlaceholder.payload));
                rerenderAndScrollToBottom();
            }

            const aiResult = await callPhoneChatAIImpl(aiMessages, {
                apiPresetName: phoneChatSettings.apiPresetName,
                maxTokens: phoneChatSettings.maxReplyTokens,
                timeout: phoneChatSettings.requestTimeoutMs,
            });

            if (!aiResult.ok) {
                if (Number.isInteger(userInsert.rowIndex)) {
                    markMutation();
                    await updatePhoneMessageRecordImpl(sheetKey, userInsert.rowIndex, { messageStatus: '待重试' });
                }
                if (assistantPlaceholder?.ok && Number.isInteger(assistantPlaceholder.rowIndex)) {
                    markMutation();
                    await updatePhoneMessageRecordImpl(sheetKey, assistantPlaceholder.rowIndex, {
                        content: '（回复失败，可稍后重试）',
                        messageStatus: '失败',
                    });
                }
                syncRows();
                state.sending = false;
                state.errorText = String(aiResult.message || '角色回复失败');
                state.statusText = '用户消息已保存，可稍后重试';
                rerenderAndScrollToBottom();
                return;
            }

            const parsedAssistantReply = parseStructuredAiReply(aiResult.text);

            if (Number.isInteger(userInsert.rowIndex)) {
                markMutation();
                await updatePhoneMessageRecordImpl(sheetKey, userInsert.rowIndex, { messageStatus: '已完成' });
            }

            if (assistantPlaceholder?.ok && Number.isInteger(assistantPlaceholder.rowIndex)) {
                markMutation();
                await updatePhoneMessageRecordImpl(sheetKey, assistantPlaceholder.rowIndex, {
                    content: parsedAssistantReply.content,
                    imageDesc: parsedAssistantReply.imageDesc,
                    videoDesc: parsedAssistantReply.videoDesc,
                    messageStatus: '已完成',
                });
            } else {
                markMutation();
                await insertPhoneMessageRecordImpl(sheetKey, {
                    threadId: activeConversationId,
                    threadTitle,
                    sender: partnerName,
                    senderRole: 'assistant',
                    chatTarget: targetCharacterName,
                    content: parsedAssistantReply.content,
                    sentAt: new Date().toISOString(),
                    messageStatus: '已完成',
                    requestId: `${requestId}_reply`,
                    replyToMessageId: requestId,
                    imageDesc: parsedAssistantReply.imageDesc,
                    videoDesc: parsedAssistantReply.videoDesc,
                });
            }

            markMutation(1800);
            const refreshed = await refreshPhoneMessageProjectionImpl();
            syncRows();
            state.sending = false;
            state.errorText = '';
            state.statusText = refreshed ? '发送成功' : '发送成功，但投影刷新失败';
            rerenderAndScrollToBottom();
        } catch (error) {
            if (Number.isInteger(userInsert.rowIndex)) {
                await updatePhoneMessageRecordImpl(sheetKey, userInsert.rowIndex, { messageStatus: '待重试' });
            }
            if (assistantPlaceholder?.ok && Number.isInteger(assistantPlaceholder.rowIndex)) {
                await updatePhoneMessageRecordImpl(sheetKey, assistantPlaceholder.rowIndex, {
                    content: '（发送异常，可稍后重试）',
                    messageStatus: '失败',
                });
            }
            syncRows();
            state.sending = false;
            state.errorText = error?.message || '发送过程中发生异常';
            state.statusText = '用户消息已保存，可稍后继续';
            rerenderAndScrollToBottom();
        }
    };

    const handleRetryMessage = async ({ conversationId, threadTitle }) => {
        if (state.sending) return;

        const threadRows = getConversationRowsImpl(state.rowsData, conversationId, readSpecialField);
        const retryTarget = getRetryTargetImpl(threadRows, readSpecialField);
        if (!retryTarget?.requestId) {
            state.errorText = '当前没有可重试的消息';
            state.statusText = '';
            patchCompose();
            return;
        }

        state.sending = true;
        state.errorText = '';
        state.statusText = '正在重新生成回复...';
        patchCompose();
        scrollMessageDetailToBottomImpl(container);

        const userRowIndex = findRowIndexByRequestIdImpl(state.rowsData, retryTarget.requestId, readSpecialField, { key: 'requestId', userOnly: true });
        const assistantRowIndex = findRowIndexByRequestIdImpl(state.rowsData, retryTarget.requestId, readSpecialField, { key: 'replyToMessageId' });

        try {
            if (Number.isInteger(userRowIndex)) {
                markMutation();
                await updatePhoneMessageRecordImpl(sheetKey, userRowIndex, { messageStatus: '等待回复' });
            }

            if (Number.isInteger(assistantRowIndex)) {
                markMutation();
                await updatePhoneMessageRecordImpl(sheetKey, assistantRowIndex, {
                    content: '…',
                    messageStatus: '生成中',
                });
            }

            syncRows();
            rerenderAndScrollToBottom();

            const { phoneChatSettings, partnerName, aiMessages } = await buildAiRuntime(conversationId, threadTitle);
            const aiResult = await callPhoneChatAIImpl(aiMessages, {
                apiPresetName: phoneChatSettings.apiPresetName,
                maxTokens: phoneChatSettings.maxReplyTokens,
                timeout: phoneChatSettings.requestTimeoutMs,
            });

            if (!aiResult.ok) {
                if (Number.isInteger(userRowIndex)) {
                    markMutation();
                    await updatePhoneMessageRecordImpl(sheetKey, userRowIndex, { messageStatus: '待重试' });
                }
                if (Number.isInteger(assistantRowIndex)) {
                    markMutation();
                    await updatePhoneMessageRecordImpl(sheetKey, assistantRowIndex, {
                        content: '（回复失败，可稍后重试）',
                        messageStatus: '失败',
                    });
                }
                syncRows();
                state.sending = false;
                state.errorText = String(aiResult.message || '角色回复失败');
                state.statusText = '仍可继续重试';
                rerenderAndScrollToBottom();
                return;
            }

            const parsedAssistantReply = parseStructuredAiReply(aiResult.text);

            if (Number.isInteger(userRowIndex)) {
                markMutation();
                await updatePhoneMessageRecordImpl(sheetKey, userRowIndex, { messageStatus: '已完成' });
            }

            if (Number.isInteger(assistantRowIndex)) {
                markMutation();
                await updatePhoneMessageRecordImpl(sheetKey, assistantRowIndex, {
                    sender: partnerName,
                    content: parsedAssistantReply.content,
                    imageDesc: parsedAssistantReply.imageDesc,
                    videoDesc: parsedAssistantReply.videoDesc,
                    messageStatus: '已完成',
                });
            }

            markMutation(1800);
            const refreshed = await refreshPhoneMessageProjectionImpl();
            syncRows();
            state.sending = false;
            state.errorText = '';
            state.statusText = refreshed ? '重试成功' : '重试成功，但投影刷新失败';
            rerenderAndScrollToBottom();
        } catch (error) {
            if (Number.isInteger(userRowIndex)) {
                await updatePhoneMessageRecordImpl(sheetKey, userRowIndex, { messageStatus: '待重试' });
            }
            if (Number.isInteger(assistantRowIndex)) {
                await updatePhoneMessageRecordImpl(sheetKey, assistantRowIndex, {
                    content: '（发送异常，可稍后重试）',
                    messageStatus: '失败',
                });
            }
            syncRows();
            state.sending = false;
            state.errorText = error?.message || '重试过程中发生异常';
            state.statusText = '仍可继续重试';
            rerenderAndScrollToBottom();
        }
    };

    return {
        handleSendMessage,
        handleRetryMessage,
    };
}
