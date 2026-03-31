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
    const headerIndexMap = new Map(
        (Array.isArray(headers) ? headers : []).map((header, index) => [String(header || '').trim(), index])
    );

    const patchLocalRowAt = (rowIndex, payload = {}) => {
        const dataRowIndex = Number(rowIndex) - 1;
        if (!Number.isInteger(dataRowIndex) || dataRowIndex < 0) return false;

        const currentRow = Array.isArray(state.rowsData[dataRowIndex])
            ? [...state.rowsData[dataRowIndex]]
            : materializeRowFromPayloadImpl(headers, {});
        let changed = false;

        Object.entries(payload).forEach(([key, value]) => {
            const colIndex = headerIndexMap.get(String(key || '').trim());
            if (!Number.isInteger(colIndex) || colIndex < 0) return;
            const nextValue = value === undefined || value === null ? '' : String(value);
            if (currentRow[colIndex] === nextValue) return;
            currentRow[colIndex] = nextValue;
            changed = true;
        });

        if (!changed) return false;
        state.rowsData[dataRowIndex] = currentRow;
        return true;
    };

    const patchLocalRowByRequestKey = (requestId, payload = {}, options = {}) => {
        const resolvedRowIndex = findRowIndexByRequestIdImpl(state.rowsData, requestId, readSpecialField, options);
        if (!Number.isInteger(resolvedRowIndex)) return false;
        return patchLocalRowAt(resolvedRowIndex, payload);
    };

    const patchLocalRowByResolvedTarget = (rowIndex, requestId, payload = {}, options = {}) => {
        if (patchLocalRowAt(rowIndex, payload)) {
            return true;
        }
        if (!requestId) {
            return false;
        }
        return patchLocalRowByRequestKey(requestId, payload, options);
    };

    const rerenderAndScrollToBottom = () => {
        rerender();
        scrollMessageDetailToBottomImpl(container);
    };

    const rerenderPreservingLocalRows = () => {
        if (state && typeof state === 'object') {
            state.skipSheetSyncOnce = true;
        }
        rerenderAndScrollToBottom();
    };

    const syncRowsAndRerender = () => {
        const synced = syncRows();
        if (synced) {
            rerenderAndScrollToBottom();
            return true;
        }
        rerenderPreservingLocalRows();
        return false;
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

        for (const line of safeText.split('\n')) {
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

        if (anyFieldMatched && lineByLineContent.length > 0) {
            return {
                matched: true,
                content: lineByLineContent.join('\n').trim(),
                imageDesc,
                videoDesc,
            };
        }

        return {
            matched: false,
            content: safeText,
            imageDesc: 'none',
            videoDesc: 'none',
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
        rerenderPreservingLocalRows();

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
                rerenderPreservingLocalRows();
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
                patchLocalRowByResolvedTarget(userInsert.rowIndex, requestId, { messageStatus: '待重试' }, { key: 'requestId', userOnly: true });
                patchLocalRowByResolvedTarget(assistantPlaceholder?.rowIndex, requestId, {
                    content: '（回复失败，可稍后重试）',
                    messageStatus: '失败',
                }, { key: 'replyToMessageId' });
                state.sending = false;
                state.errorText = String(aiResult.message || '角色回复失败');
                state.statusText = '用户消息已保存，可稍后重试';
                syncRowsAndRerender();
                return;
            }

            const parsedAssistantReply = parseStructuredAiReply(aiResult.text);
            const assistantReplyPayload = {
                sender: partnerName,
                content: parsedAssistantReply.content,
                imageDesc: parsedAssistantReply.imageDesc,
                videoDesc: parsedAssistantReply.videoDesc,
                messageStatus: '已完成',
            };

            if (Number.isInteger(userInsert.rowIndex)) {
                markMutation();
                await updatePhoneMessageRecordImpl(sheetKey, userInsert.rowIndex, { messageStatus: '已完成' });
            }
            patchLocalRowByResolvedTarget(userInsert.rowIndex, requestId, { messageStatus: '已完成' }, { key: 'requestId', userOnly: true });

            if (assistantPlaceholder?.ok && Number.isInteger(assistantPlaceholder.rowIndex)) {
                markMutation();
                await updatePhoneMessageRecordImpl(sheetKey, assistantPlaceholder.rowIndex, assistantReplyPayload);
                patchLocalRowByResolvedTarget(assistantPlaceholder.rowIndex, requestId, assistantReplyPayload, { key: 'replyToMessageId' });
            } else {
                markMutation();
                const assistantInsertResult = await insertPhoneMessageRecordImpl(sheetKey, {
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
                if (assistantInsertResult?.ok) {
                    state.rowsData.push(materializeRowFromPayloadImpl(headers, assistantInsertResult.payload));
                }
            }

            rerenderPreservingLocalRows();
            markMutation(1800);
            const refreshed = await refreshPhoneMessageProjectionImpl();
            state.sending = false;
            state.errorText = '';
            state.statusText = refreshed ? '发送成功' : '发送成功，但投影刷新失败';
            syncRowsAndRerender();
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
            patchLocalRowByResolvedTarget(userInsert.rowIndex, requestId, { messageStatus: '待重试' }, { key: 'requestId', userOnly: true });
            patchLocalRowByResolvedTarget(assistantPlaceholder?.rowIndex, requestId, {
                content: '（发送异常，可稍后重试）',
                messageStatus: '失败',
            }, { key: 'replyToMessageId' });
            state.sending = false;
            state.errorText = error?.message || '发送过程中发生异常';
            state.statusText = '用户消息已保存，可稍后继续';
            syncRowsAndRerender();
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

            patchLocalRowAt(userRowIndex, { messageStatus: '等待回复' });
            patchLocalRowAt(assistantRowIndex, {
                content: '…',
                messageStatus: '生成中',
            });
            rerenderPreservingLocalRows();

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
                patchLocalRowAt(userRowIndex, { messageStatus: '待重试' });
                patchLocalRowAt(assistantRowIndex, {
                    content: '（回复失败，可稍后重试）',
                    messageStatus: '失败',
                });
                state.sending = false;
                state.errorText = String(aiResult.message || '角色回复失败');
                state.statusText = '仍可继续重试';
                syncRowsAndRerender();
                return;
            }

            const parsedAssistantReply = parseStructuredAiReply(aiResult.text);
            const assistantReplyPayload = {
                sender: partnerName,
                content: parsedAssistantReply.content,
                imageDesc: parsedAssistantReply.imageDesc,
                videoDesc: parsedAssistantReply.videoDesc,
                messageStatus: '已完成',
            };

            if (Number.isInteger(userRowIndex)) {
                markMutation();
                await updatePhoneMessageRecordImpl(sheetKey, userRowIndex, { messageStatus: '已完成' });
            }
            patchLocalRowAt(userRowIndex, { messageStatus: '已完成' });

            if (Number.isInteger(assistantRowIndex)) {
                markMutation();
                await updatePhoneMessageRecordImpl(sheetKey, assistantRowIndex, assistantReplyPayload);
            }
            patchLocalRowAt(assistantRowIndex, assistantReplyPayload);

            rerenderPreservingLocalRows();
            markMutation(1800);
            const refreshed = await refreshPhoneMessageProjectionImpl();
            state.sending = false;
            state.errorText = '';
            state.statusText = refreshed ? '重试成功' : '重试成功，但投影刷新失败';
            syncRowsAndRerender();
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
            patchLocalRowAt(userRowIndex, { messageStatus: '待重试' });
            patchLocalRowAt(assistantRowIndex, {
                content: '（发送异常，可稍后重试）',
                messageStatus: '失败',
            });
            state.sending = false;
            state.errorText = error?.message || '重试过程中发生异常';
            state.statusText = '仍可继续重试';
            syncRowsAndRerender();
        }
    };

    return {
        handleSendMessage,
        handleRetryMessage,
    };
}
