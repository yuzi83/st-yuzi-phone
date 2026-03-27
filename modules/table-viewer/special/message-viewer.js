import {
    deletePhoneSheetRows,
    getCurrentCharacterDisplayName,
    getCurrentPhoneAiInstructionPresetName,
    getPhoneAiInstructionPresets,
    getSheetDataByKey,
    setCurrentPhoneAiInstructionPresetName,
} from '../../phone-core/chat-support.js';
import { navigateBack } from '../../phone-core/routing.js';
import { PHONE_ICONS } from '../../phone-home.js';
import { escapeHtml, escapeHtmlAttr } from '../../utils.js';
import { showConfirmDialog } from '../../settings-app/ui/confirm-dialog.js';
import { bindWheelBridge, showInlineToast } from '../shared-ui.js';
import { createSpecialFieldReader, buildHeaderIndexMap } from './field-reader.js';
import {
    getConversationRows,
    getConversationRowEntries,
    resolveConversationHeaderLabel,
    detectChatTargetFromRows,
    getRetryTarget,
    scrollMessageDetailToBottom,
    renderOneMessageRow,
} from './message-viewer-helpers.js';
import { createMessageViewerActions } from './message-viewer-actions.js';
import {
    buildConversations,
    normalizeMediaDesc,
    renderInPhoneMediaPreview,
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

/**
 * @typedef {Object} MessageStylePayload
 * @property {string} className
 * @property {string} styleAttr
 * @property {string} scopedCss
 * @property {string} templateId
 * @property {string} dataAttrs
 * @property {MessageStyleOptions} styleOptions
 */


export function renderMessageTable(container, context, deps = {}) {
    const { createSpecialTemplateStylePayload, viewerEventManager } = deps;
    if (!(container instanceof HTMLElement) || typeof createSpecialTemplateStylePayload !== 'function') return;

    const { sheetKey, tableName, rows, headers, templateMatch, type } = context;
    const headerMap = buildHeaderIndexMap(headers);
    const readSpecialField = createSpecialFieldReader({
        templateMatch,
        type,
        headerMap,
        sheetKey,
        tableName,
    });

    const state = {
        mode: 'conversation',
        conversationId: null,
        mediaPreview: null,
        rowsData: Array.isArray(rows) ? rows.map(row => (Array.isArray(row) ? [...row] : row)) : [],
        draftByConversation: {},
        sending: false,
        statusText: '',
        errorText: '',
        suppressExternalUpdateUntil: 0,
        selectedTarget: null,
        contactPickerVisible: false,
        deleteManageMode: false,
        deletingSelection: false,
        selectedMessageRowIndexes: [],
        skipSheetSyncOnce: false,
    };

    const setSelectedMessageRowIndexes = (rowIndexes = []) => {
        state.selectedMessageRowIndexes = Array.from(new Set((Array.isArray(rowIndexes) ? rowIndexes : [rowIndexes])
            .map(value => Number(value))
            .filter(Number.isInteger)
            .filter(value => value >= 0)))
            .sort((a, b) => a - b);
    };

    const removeMessageRowsFromState = (rowIndexes = []) => {
        const removeSet = new Set((Array.isArray(rowIndexes) ? rowIndexes : [rowIndexes])
            .map(value => Number(value))
            .filter(Number.isInteger));
        if (removeSet.size === 0) return;
        state.rowsData = state.rowsData.filter((_, rowIndex) => !removeSet.has(rowIndex));
    };

    const clearDeleteManageState = () => {
        state.deleteManageMode = false;
        state.deletingSelection = false;
        state.selectedMessageRowIndexes = [];
    };

    const render = () => {
        if (state.mode === 'detail' && state.conversationId) {
            renderMessageDetail();
            return;
        }
        renderConversationList();
    };

    const getBodyElement = () => {
        const body = container.querySelector('.phone-app-body');
        return body instanceof HTMLElement ? body : null;
    };

    const clampBodyScrollTop = (body, rawTop) => {
        const maxTop = Math.max(0, (body.scrollHeight || 0) - (body.clientHeight || 0));
        return Math.min(Math.max(0, Number(rawTop) || 0), maxTop);
    };

    const restoreBodyScrollInFrames = (targetTop, remainingFrames = 2) => {
        const body = getBodyElement();
        if (!body) return;

        body.scrollTop = clampBodyScrollTop(body, targetTop);
        if (remainingFrames <= 0) return;

        requestAnimationFrame(() => {
            restoreBodyScrollInFrames(targetTop, remainingFrames - 1);
        });
    };

    const renderKeepScroll = () => {
        const body = getBodyElement();
        const prevTop = body ? Math.max(0, Number(body.scrollTop) || 0) : 0;
        const prevContainerHeight = Math.max(0, container.offsetHeight || 0);

        if (prevContainerHeight > 0) {
            container.style.minHeight = `${prevContainerHeight}px`;
        }

        try {
            render();
        } finally {
            restoreBodyScrollInFrames(prevTop, 2);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (!container.isConnected) return;
                    container.style.removeProperty('min-height');
                });
            });
        }
    };

    const closeMediaPreview = () => {
        state.mediaPreview = null;
        renderKeepScroll();
    };

    const syncRowsFromSheet = () => {
        if (state.skipSheetSyncOnce) {
            state.skipSheetSyncOnce = false;
            return true;
        }
        const latestSheet = getSheetDataByKey(sheetKey);
        if (!latestSheet?.rows || !Array.isArray(latestSheet.rows)) return false;
        state.rowsData = latestSheet.rows.map(row => (Array.isArray(row) ? [...row] : row));
        return true;
    };

    const getLiveMessageTableName = () => {
        const latestSheet = getSheetDataByKey(sheetKey);
        return String(latestSheet?.tableName || tableName || sheetKey || '').trim();
    };

    const createDraftConversationId = () => `phone_thread_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const markLocalTableMutation = (duration = 1200) => {
        state.suppressExternalUpdateUntil = Math.max(state.suppressExternalUpdateUntil, Date.now() + duration);
    };

    const autoResizeComposeInput = (inputEl) => {
        if (!(inputEl instanceof HTMLTextAreaElement)) return;

        const minHeight = 40;
        const maxHeight = 78;

        inputEl.style.height = 'auto';
        const nextHeight = Math.min(Math.max(inputEl.scrollHeight, minHeight), maxHeight);
        inputEl.style.height = `${nextHeight}px`;
        inputEl.style.overflowY = inputEl.scrollHeight > maxHeight ? 'auto' : 'hidden';
    };

    const patchComposeUi = () => {
        const statusText = String(state.errorText || state.statusText || '').trim();
        const statusClass = state.errorText
            ? 'is-error'
            : (state.sending ? 'is-pending' : (statusText ? 'is-success' : ''));
        const statusEl = container.querySelector('.phone-special-message-compose-status');
        if (statusEl) {
            statusEl.className = `phone-special-message-compose-status ${statusClass}`.trim();
            statusEl.textContent = statusText || ' ';
        }

        const inputEl = /** @type {HTMLTextAreaElement | null} */ (container.querySelector('.phone-special-message-compose-input'));
        if (inputEl) {
            inputEl.disabled = state.sending;
            autoResizeComposeInput(inputEl);
        }

        const sendBtn = /** @type {HTMLButtonElement | null} */ (container.querySelector('.phone-special-message-send-btn'));
        if (sendBtn) {
            sendBtn.disabled = state.sending;
            sendBtn.textContent = state.sending ? '发送中...' : '发送';
        }

        const retryBtn = /** @type {HTMLButtonElement | null} */ (container.querySelector('.phone-special-message-retry-btn'));
        if (retryBtn) {
            retryBtn.disabled = state.sending;
        }
    };

    const getCurrentAiInstructionPresetNameText = () => {
        const safeName = String(getCurrentPhoneAiInstructionPresetName() || '').trim();
        return safeName || '默认实时回复预设';
    };


    const patchMessageManageUi = () => {
        if (state.mode !== 'detail' || !state.deleteManageMode) return;

        const selectedSet = new Set(state.selectedMessageRowIndexes);
        const selectAllBtn = container.querySelector('.phone-special-manage-select-all-btn');
        const clearBtn = container.querySelector('.phone-special-manage-clear-btn');
        const deleteBtn = container.querySelector('.phone-special-manage-delete-btn');

        if (selectAllBtn instanceof HTMLButtonElement) {
            selectAllBtn.disabled = state.deletingSelection;
        }
        if (clearBtn instanceof HTMLButtonElement) {
            clearBtn.disabled = state.deletingSelection;
        }
        if (deleteBtn instanceof HTMLButtonElement) {
            deleteBtn.disabled = selectedSet.size === 0 || state.deletingSelection;
            deleteBtn.textContent = state.deletingSelection ? '删除中...' : `删除已选（${selectedSet.size}）`;
        }

        container.querySelectorAll('.phone-special-message-select-toggle').forEach((btnNode) => {
            const btn = /** @type {HTMLElement} */ (btnNode);
            const rowIndex = Number(btn.getAttribute('data-row-index'));
            if (Number.isNaN(rowIndex)) return;

            const selected = selectedSet.has(rowIndex);
            if (btn instanceof HTMLButtonElement) {
                btn.disabled = state.deletingSelection;
            }
            btn.classList.toggle('is-selected', selected);
            btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
            btn.textContent = selected ? '✓' : '';
            btn.closest('.phone-special-message-manage-row')?.classList.toggle('is-selected', selected);
        });
    };

    const { handleSendMessage, handleRetryMessage } = createMessageViewerActions({
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
    });

    const handleExternalTableUpdate = (event) => {
        if (event?.detail?.sheetKey !== sheetKey) return;
        if (Date.now() < state.suppressExternalUpdateUntil) return;
        if (!syncRowsFromSheet()) return;
        renderKeepScroll();
    };

    if (viewerEventManager && typeof viewerEventManager.add === 'function') {
        viewerEventManager.add(window, 'yuzi-phone-table-updated', handleExternalTableUpdate);
    }

    const renderConversationList = () => {
        syncRowsFromSheet();
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
                    <button type="button" class="phone-nav-back">${PHONE_ICONS.back}<span>返回</span></button>
                    <span class="phone-nav-title">${escapeHtml(tableName)}</span>
                </div>
                <div class="phone-app-body phone-table-body">
                    <div class="phone-special-conversation-actions">
                        <select class="phone-special-prompt-select" ${aiInstructionPresets.length > 0 ? '' : 'disabled'}>
                            ${aiInstructionPresets.length > 0
                                ? aiInstructionPresets.map((preset) => `
                                    <option value="${escapeHtmlAttr(preset.name)}" ${preset.name === selectedAiInstructionPresetName ? 'selected' : ''}>${escapeHtml(preset.name)}</option>
                                `).join('')
                                : '<option value="">暂无预设</option>'}
                        </select>
                        <button type="button" class="phone-special-new-chat-btn">开始聊天</button>
                    </div>
                    ${showTemplateNote ? `<div class="phone-special-conversation-template-note">当前 AI 指令预设：${escapeHtml(selectedAiInstructionPresetName || activeAiInstructionPresetName || '未选择')}</div>` : ''}
                    ${conversations.length === 0
                        ? `<div class="phone-empty-msg">${escapeHtml(emptyConversationText)}</div>`
                        : `<div class="phone-special-conversation-list">
                            ${conversations.map(conv => {
                                const displayName = resolveConversationHeaderLabel(conv, titleMode, tableName);
                                const conversationSubtitle = String(conv.threadSubtitle || '').trim();
                                return `
                                    <button type="button" class="phone-special-conversation-item" data-conv-id="${escapeHtmlAttr(conv.id)}">
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

        bindWheelBridge(container);
        container.querySelector('.phone-nav-back')?.addEventListener('click', navigateBack);

        const openConversation = (convId) => {
            const safeId = String(convId || '').trim() || createDraftConversationId();
            state.mode = 'detail';
            state.conversationId = safeId;
            state.mediaPreview = null;
            state.errorText = '';
            state.statusText = '';
            clearDeleteManageState();
            const convRows = getConversationRows(state.rowsData, safeId, readSpecialField);
            const detectedTarget = detectChatTargetFromRows(convRows, readSpecialField);
            state.selectedTarget = detectedTarget || null;
            render();
            scrollMessageDetailToBottom(container);
        };

        container.querySelectorAll('.phone-special-conversation-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = /** @type {HTMLElement} */ (btn);
                openConversation(target.dataset.convId || '');
            });
        });

        container.querySelector('.phone-special-prompt-select')?.addEventListener('change', (event) => {
            const target = event.currentTarget;
            if (!(target instanceof HTMLSelectElement)) return;
            const nextName = String(target.value || '').trim();
            if (!nextName) return;
            const result = setCurrentPhoneAiInstructionPresetName(nextName);
            if (result?.success) {
                showInlineToast(container, `当前实时回复预设已切换为：${nextName}`);
                renderKeepScroll();
            } else {
                showInlineToast(container, result?.message || '切换预设失败', true);
            }
        });

        container.querySelector('.phone-special-new-chat-btn')?.addEventListener('click', () => {
            state.contactPickerVisible = true;
            renderKeepScroll();
        });

        if (state.contactPickerVisible) {
            renderContactPicker();
        }
    };

    const renderContactPicker = () => {
        const pickerEl = document.createElement('div');
        pickerEl.className = 'phone-special-contact-picker-mask';

        pickerEl.innerHTML = `
            <div class="phone-special-contact-picker-modal">
                <div class="phone-special-contact-picker-title">输入角色名</div>
                <div class="phone-special-contact-picker-manual">
                    <input type="text" class="phone-special-contact-picker-input" placeholder="请输入角色名称" />
                    <button type="button" class="phone-special-contact-picker-confirm-btn">确定</button>
                </div>
                <button type="button" class="phone-special-contact-picker-cancel-btn">取消</button>
            </div>
        `;

        const appPage = container.querySelector('.phone-app-page');
        if (appPage) {
            appPage.appendChild(pickerEl);
        } else {
            container.appendChild(pickerEl);
        }

        const selectContact = (name) => {
            const safeName = String(name || '').trim();
            if (!safeName) {
                showInlineToast(container, '请输入角色名称', true);
                return;
            }
            state.selectedTarget = safeName;
            state.contactPickerVisible = false;
            const newConvId = createDraftConversationId();
            state.mode = 'detail';
            state.conversationId = newConvId;
            state.mediaPreview = null;
            state.errorText = '';
            state.statusText = '';
            clearDeleteManageState();
            render();
            scrollMessageDetailToBottom(container);
        };

        const inputEl = /** @type {HTMLInputElement|null} */ (pickerEl.querySelector('.phone-special-contact-picker-input'));
        pickerEl.querySelector('.phone-special-contact-picker-confirm-btn')?.addEventListener('click', () => {
            selectContact(inputEl?.value || '');
        });

        if (inputEl) {
            inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.isComposing) {
                    e.preventDefault();
                    selectContact(inputEl.value || '');
                }
            });
            requestAnimationFrame(() => inputEl.focus());
        }

        pickerEl.querySelector('.phone-special-contact-picker-cancel-btn')?.addEventListener('click', () => {
            state.contactPickerVisible = false;
            renderKeepScroll();
        });

        pickerEl.addEventListener('click', (e) => {
            if (e.target === pickerEl) {
                state.contactPickerVisible = false;
                renderKeepScroll();
            }
        });
    };

    const executeDeleteSelectedMessages = async (conversationId) => {
        const selectedRows = Array.from(new Set(state.selectedMessageRowIndexes)).filter(Number.isInteger);
        if (selectedRows.length === 0) {
            showInlineToast(container, '请先选择要删除的消息');
            return;
        }

        state.deletingSelection = true;
        patchMessageManageUi();

        let toastMessage = '';
        let toastIsError = false;
        const liveTableName = getLiveMessageTableName();

        try {
            markLocalTableMutation();
            const result = await deletePhoneSheetRows(sheetKey, selectedRows, {
                tableName: liveTableName,
            });
            if (!result.ok) {
                syncRowsFromSheet();
                toastMessage = result.message || '删除失败';
                toastIsError = true;
                return;
            }

            const synced = syncRowsFromSheet();
            clearDeleteManageState();
            state.errorText = '';
            state.statusText = '';

            if (!synced) {
                toastMessage = `${result.message || `已删除 ${result.deletedCount} 条消息`}，但当前视图未同步到最新表格`;
                toastIsError = true;
                return;
            }

            const remainingRows = getConversationRows(state.rowsData, conversationId, readSpecialField);
            if (remainingRows.length === 0) {
                state.mode = 'conversation';
                state.conversationId = null;
            }
            toastMessage = result.message || `已删除 ${result.deletedCount} 条消息`;
            toastIsError = result.refreshed === false;
        } catch (error) {
            toastMessage = error?.message || '删除过程中发生异常';
            toastIsError = true;
        } finally {
            state.deletingSelection = false;
            renderKeepScroll();
            if (toastMessage) {
                showInlineToast(container, toastMessage, toastIsError);
            }
        }
    };

    const renderMessageDetail = () => {
        syncRowsFromSheet();
        const conversationId = String(state.conversationId || 'default_thread').trim() || 'default_thread';
        const rowEntriesInConv = getConversationRowEntries(state.rowsData, conversationId, readSpecialField);
        const rowsInConv = rowEntriesInConv.map(entry => entry.row);
        const stylePayload = /** @type {any} */ (createSpecialTemplateStylePayload(templateMatch, type, 'detail'));
        const emptyDetailText = String(stylePayload.styleOptions.emptyDetailText || '该会话暂无消息');
        const allConversations = buildConversations(state.rowsData, readSpecialField, stylePayload.styleOptions);
        const currentConversation = allConversations.find((conv) => conv.id === conversationId);
        const detailTitle = state.selectedTarget
            || (currentConversation
                ? resolveConversationHeaderLabel(currentConversation, 'auto', tableName)
                : getCurrentCharacterDisplayName(tableName));
        const currentDraft = String(state.draftByConversation[conversationId] || '');
        const retryTarget = getRetryTarget(rowsInConv, readSpecialField);
        const statusText = String(state.errorText || state.statusText || '').trim();
        const statusClass = state.errorText
            ? 'is-error'
            : (state.sending ? 'is-pending' : (statusText ? 'is-success' : ''));
        const selectedCount = state.selectedMessageRowIndexes.length;
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
                    <button type="button" class="phone-nav-back">${PHONE_ICONS.back}<span>返回</span></button>
                    <span class="phone-nav-title">${escapeHtml(detailTitle || tableName)}</span>
                    <button type="button" class="phone-special-nav-action-btn ${state.deleteManageMode ? 'is-active' : ''}">${state.deleteManageMode ? '完成' : '删除'}</button>
                </div>
                <div class="phone-app-body phone-table-body">
                    ${showDetailSubtitle && detailSubtitle ? `<div class="phone-special-detail-subtitle">${escapeHtml(detailSubtitle)}</div>` : ''}
                    <div class="phone-special-message-thread">
                        ${state.deleteManageMode ? `
                            <div class="phone-special-manage-bar">
                                <button type="button" class="phone-special-manage-btn phone-special-manage-select-all-btn" ${state.deletingSelection ? 'disabled' : ''}>全选</button>
                                <button type="button" class="phone-special-manage-btn phone-special-manage-clear-btn" ${state.deletingSelection ? 'disabled' : ''}>取消全选</button>
                                <button type="button" class="phone-special-manage-btn phone-special-manage-delete-btn" ${selectedCount === 0 || state.deletingSelection ? 'disabled' : ''}>${state.deletingSelection ? '删除中...' : `删除已选（${selectedCount}）`}</button>
                            </div>
                        ` : ''}
                        <div class="phone-special-message-list">
                            ${rowEntriesInConv.length === 0 ? `<div class="phone-empty-msg">${escapeHtml(emptyDetailText)}</div>` : rowEntriesInConv.map((entry) => renderOneMessageRow({
                                row: entry.row,
                                sourceRowIndex: entry.rowIndex,
                                readSpecialField,
                                styleOptions: stylePayload.styleOptions,
                                deleteManageMode: state.deleteManageMode,
                                selected: state.selectedMessageRowIndexes.includes(entry.rowIndex),
                            })).join('')}
                        </div>
                        ${state.deleteManageMode ? '' : `
                            <div class="phone-special-message-compose">
                                <div class="phone-special-message-compose-meta">
                                    ${showComposeTemplateNote ? `<span class="phone-special-message-template-pill">当前 AI 指令预设：${escapeHtml(activeAiInstructionPresetName)}</span>` : ''}
                                    ${showComposeStatus ? `<div class="phone-special-message-compose-status ${statusClass}">${escapeHtml(statusText || ' ')}</div>` : ''}
                                </div>
                                <div class="phone-special-message-compose-editor">
                                    <textarea
                                        class="phone-special-message-compose-input"
                                        rows="1"
                                        placeholder="输入消息，按 Enter 发送，Shift+Enter 换行"
                                        ${state.sending ? 'disabled' : ''}
                                    >${escapeHtml(currentDraft)}</textarea>
                                    <div class="phone-special-message-compose-footer">
                                        ${showRetryButton && retryTarget ? `<button type="button" class="phone-special-message-retry-btn" ${state.sending ? 'disabled' : ''}>重试回复</button>` : ''}
                                        <button type="button" class="phone-special-message-send-btn" ${state.sending ? 'disabled' : ''}>${state.sending ? '发送中...' : '发送'}</button>
                                    </div>
                                </div>
                            </div>
                        `}
                    </div>
                </div>
                ${state.mediaPreview ? renderInPhoneMediaPreview(state.mediaPreview.title, state.mediaPreview.content) : ''}
            </div>
        `;

        bindWheelBridge(container);

        const bindStableTapAction = (selector, handler) => {
            const button = container.querySelector(selector);
            if (!(button instanceof HTMLElement) || typeof handler !== 'function') return null;

            let handledByPointer = false;
            button.style.touchAction = 'manipulation';

            button.addEventListener('pointerup', (event) => {
                handledByPointer = true;
                event.preventDefault();
                event.stopPropagation();
                handler();
                requestAnimationFrame(() => {
                    handledByPointer = false;
                });
            });

            button.addEventListener('click', (event) => {
                if (handledByPointer) return;
                event.preventDefault();
                event.stopPropagation();
                handler();
            });

            return button;
        };

        bindStableTapAction('.phone-nav-back', () => {
            state.mode = 'conversation';
            state.conversationId = null;
            state.mediaPreview = null;
            state.errorText = '';
            state.statusText = '';
            clearDeleteManageState();
            render();
        });

        bindStableTapAction('.phone-special-nav-action-btn', () => {
            state.deleteManageMode = !state.deleteManageMode;
            state.deletingSelection = false;
            state.selectedMessageRowIndexes = [];
            renderKeepScroll();
        });

        bindStableTapAction('.phone-special-manage-select-all-btn', () => {
            setSelectedMessageRowIndexes(rowEntriesInConv.map(entry => entry.rowIndex));
            patchMessageManageUi();
        });

        bindStableTapAction('.phone-special-manage-clear-btn', () => {
            setSelectedMessageRowIndexes([]);
            patchMessageManageUi();
        });

        bindStableTapAction('.phone-special-manage-delete-btn', () => {
            if (state.selectedMessageRowIndexes.length === 0 || state.deletingSelection) {
                showInlineToast(container, '请先选择要删除的消息');
                return;
            }

            showConfirmDialog(
                container,
                '确认删除',
                `确定删除已选中的 ${state.selectedMessageRowIndexes.length} 条聊天消息吗？此操作无法撤销。`,
                () => {
                    void executeDeleteSelectedMessages(conversationId);
                },
                '删除',
                '取消'
            );
        });

        container.querySelectorAll('.phone-special-message-select-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = /** @type {HTMLElement} */ (btn);
                const rowIndex = Number(target.dataset.rowIndex);
                if (Number.isNaN(rowIndex) || state.deletingSelection) return;
                const selectedSet = new Set(state.selectedMessageRowIndexes);
                if (selectedSet.has(rowIndex)) {
                    selectedSet.delete(rowIndex);
                } else {
                    selectedSet.add(rowIndex);
                }
                setSelectedMessageRowIndexes(Array.from(selectedSet));
                patchMessageManageUi();
            });
        });

        container.querySelectorAll('.phone-special-media-item').forEach(mediaEl => {
            mediaEl.addEventListener('click', () => {
                const target = /** @type {HTMLElement} */ (mediaEl);
                const desc = normalizeMediaDesc(target.dataset.description);
                if (!desc) return;
                const title = String(target.dataset.mediaLabel || '媒体内容').trim() || '媒体内容';
                state.mediaPreview = {
                    title,
                    content: desc,
                };
                renderKeepScroll();
            });
        });

        const composeInput = /** @type {HTMLTextAreaElement | null} */ (container.querySelector('.phone-special-message-compose-input'));
        if (composeInput) {
            autoResizeComposeInput(composeInput);

            composeInput.addEventListener('input', () => {
                state.draftByConversation[conversationId] = String(composeInput.value || '');
                if (state.errorText) {
                    state.errorText = '';
                }
                autoResizeComposeInput(composeInput);
                patchComposeUi();
            });
            composeInput.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
                event.preventDefault();
                void handleSendMessage({
                    conversationId,
                    threadTitle: detailTitle || tableName,
                });
            });
        }

        container.querySelector('.phone-special-message-send-btn')?.addEventListener('click', () => {
            void handleSendMessage({
                conversationId,
                threadTitle: detailTitle || tableName,
            });
        });

        container.querySelector('.phone-special-message-retry-btn')?.addEventListener('click', () => {
            void handleRetryMessage({
                conversationId,
                threadTitle: detailTitle || tableName,
            });
        });

        container.querySelector('.phone-special-media-preview-close')?.addEventListener('click', closeMediaPreview);
        container.querySelector('.phone-special-media-preview-mask')?.addEventListener('click', (e) => {
            if (e.target !== e.currentTarget) return;
            closeMediaPreview();
        });
    };


    render();
}

