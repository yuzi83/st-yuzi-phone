import {
    callPhoneChatAI,
    deletePhoneSheetRows,
    getCurrentCharacterDisplayName,
    getPhoneChatLastSelectedPromptTemplateName,
    getPhoneChatLastSelectedTarget,
    getPhoneChatPromptTemplateContent,
    getPhoneChatSettings,
    getPhoneChatWorldbookContext,
    getPhoneStoryContext,
    getPromptTemplates,
    getSheetDataByKey,
    insertPhoneMessageRecord,
    navigateBack,
    refreshPhoneMessageProjection,
    setPhoneChatLastSelectedPromptTemplateName,
    setPhoneChatLastSelectedTarget,
    updatePhoneMessageRecord,
} from '../../phone-core.js';
import { PHONE_ICONS } from '../../phone-home.js';
import { escapeHtml, escapeHtmlAttr } from '../../utils.js';
import { showConfirmDialog } from '../../settings-app/ui/confirm-dialog.js';
import { bindWheelBridge, showInlineToast } from '../shared-ui.js';
import { createSpecialFieldReader, buildHeaderIndexMap } from './field-reader.js';
import {
    buildConversations,
    resolveConversationDisplayName,
    normalizeMediaDesc,
    normalizeSenderName,
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

const DEFAULT_PHONE_CHAT_SYSTEM_PROMPT = [
    '你正在通过手机聊天应用与用户对话。',
    '请保持自然、口语化、贴近即时通讯的表达。',
    '除非设定明确要求，否则避免长篇叙述、旁白腔和总结腔。',
    '请基于会话上下文、世界书设定与正文近期剧情继续回复。',
].join('\n');

const MAX_THREAD_CONTEXT_MESSAGES = 12;

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

    const restoredTarget = getPhoneChatLastSelectedTarget();
    const restoredPromptTemplateName = getPhoneChatLastSelectedPromptTemplateName();

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
        selectedTarget: restoredTarget || null,
        selectedPromptTemplateName: restoredPromptTemplateName || '',
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

    const patchConversationPromptUi = () => {
        if (state.mode !== 'conversation') return;

        const activePromptTemplateName = String(state.selectedPromptTemplateName || '').trim();
        const promptSelect = /** @type {HTMLSelectElement | null} */ (container.querySelector('.phone-special-prompt-select'));
        const noteEl = container.querySelector('.phone-special-conversation-template-note');

        if (promptSelect) {
            promptSelect.value = activePromptTemplateName;
        }
        if (noteEl instanceof HTMLElement) {
            noteEl.textContent = `当前提示词：${activePromptTemplateName || '默认提示词'}`;
        }
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
        const promptTemplates = getPromptTemplates();
        const activePromptTemplateName = promptTemplates.some(template => template.name === state.selectedPromptTemplateName)
            ? String(state.selectedPromptTemplateName || '').trim()
            : '';
        const showConversationSubtitle = stylePayload.structureOptions?.conversationList?.showSubtitle !== false;
        const showLastMessage = stylePayload.structureOptions?.conversationList?.showLastMessage !== false;
        const showTemplateNote = stylePayload.structureOptions?.composeBar?.showTemplateNote !== false;
        if (activePromptTemplateName !== state.selectedPromptTemplateName) {
            state.selectedPromptTemplateName = activePromptTemplateName;
        }

        container.innerHTML = `
            <div class="phone-app-page phone-special-app phone-special-message ${stylePayload.className}" ${stylePayload.dataAttrs} style="${stylePayload.styleAttr}">
                ${stylePayload.scopedCss ? `<style class="phone-special-template-inline-style">${stylePayload.scopedCss}</style>` : ''}
                <div class="phone-nav-bar">
                    <button type="button" class="phone-nav-back">${PHONE_ICONS.back}<span>返回</span></button>
                    <span class="phone-nav-title">${escapeHtml(tableName)}</span>
                </div>
                <div class="phone-app-body phone-table-body">
                    <div class="phone-special-conversation-actions">
                        <select class="phone-special-prompt-select" ${promptTemplates.length === 0 ? 'disabled' : ''}>
                            <option value="" ${!activePromptTemplateName ? 'selected' : ''}>默认提示词</option>
                            ${promptTemplates.map(template => `
                                <option value="${escapeHtmlAttr(template.name)}" ${template.name === activePromptTemplateName ? 'selected' : ''}>${escapeHtml(template.name)}</option>
                            `).join('')}
                        </select>
                        <button type="button" class="phone-special-new-chat-btn">开始聊天</button>
                    </div>
                    ${showTemplateNote ? `<div class="phone-special-conversation-template-note">当前提示词：${escapeHtml(activePromptTemplateName || '默认提示词')}</div>` : ''}
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
            if (detectedTarget) {
                state.selectedTarget = detectedTarget;
                setPhoneChatLastSelectedTarget(detectedTarget);
            }
            render();
            scrollMessageDetailToBottom(container);
        };

        container.querySelectorAll('.phone-special-conversation-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = /** @type {HTMLElement} */ (btn);
                openConversation(target.dataset.convId || '');
            });
        });

        const promptSelect = /** @type {HTMLSelectElement | null} */ (container.querySelector('.phone-special-prompt-select'));
        if (promptSelect) {
            promptSelect.addEventListener('change', () => {
                state.selectedPromptTemplateName = String(promptSelect.value || '').trim();
                setPhoneChatLastSelectedPromptTemplateName(state.selectedPromptTemplateName);
                patchConversationPromptUi();
            });
        }

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
            setPhoneChatLastSelectedTarget(safeName);
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
        const activePromptTemplateName = String(state.selectedPromptTemplateName || '').trim();
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
                                ${showComposeTemplateNote || showComposeStatus ? `
                                    <div class="phone-special-message-compose-meta">
                                        ${showComposeTemplateNote ? `<span class="phone-special-message-template-pill">当前提示词：${escapeHtml(activePromptTemplateName || '默认提示词')}</span>` : ''}
                                        ${showComposeStatus ? `<div class="phone-special-message-compose-status ${statusClass}">${escapeHtml(statusText || ' ')}</div>` : ''}
                                    </div>
                                ` : ''}
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

        container.querySelector('.phone-nav-back')?.addEventListener('click', () => {
            state.mode = 'conversation';
            state.conversationId = null;
            state.mediaPreview = null;
            state.errorText = '';
            state.statusText = '';
            clearDeleteManageState();
            render();
        });

        container.querySelector('.phone-special-nav-action-btn')?.addEventListener('click', () => {
            state.deleteManageMode = !state.deleteManageMode;
            state.deletingSelection = false;
            state.selectedMessageRowIndexes = [];
            renderKeepScroll();
        });

        container.querySelector('.phone-special-manage-select-all-btn')?.addEventListener('click', () => {
            setSelectedMessageRowIndexes(rowEntriesInConv.map(entry => entry.rowIndex));
            patchMessageManageUi();
        });

        container.querySelector('.phone-special-manage-clear-btn')?.addEventListener('click', () => {
            setSelectedMessageRowIndexes([]);
            patchMessageManageUi();
        });

        container.querySelector('.phone-special-manage-delete-btn')?.addEventListener('click', () => {
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
                    readSpecialField,
                });
            });
        }

        container.querySelector('.phone-special-message-send-btn')?.addEventListener('click', () => {
            void handleSendMessage({
                conversationId,
                threadTitle: detailTitle || tableName,
                readSpecialField,
            });
        });

        container.querySelector('.phone-special-message-retry-btn')?.addEventListener('click', () => {
            void handleRetryMessage({
                conversationId,
                threadTitle: detailTitle || tableName,
                readSpecialField,
            });
        });

        container.querySelector('.phone-special-media-preview-close')?.addEventListener('click', closeMediaPreview);
        container.querySelector('.phone-special-media-preview-mask')?.addEventListener('click', (e) => {
            if (e.target !== e.currentTarget) return;
            closeMediaPreview();
        });
    };

    const handleSendMessage = async ({ conversationId, threadTitle, readSpecialField }) => {
        if (state.sending) return;

        const activeConversationId = String(conversationId || '').trim() || createDraftConversationId();
        const draftText = String(state.draftByConversation[activeConversationId] || state.draftByConversation[conversationId] || '').trim();
        if (!draftText) {
            state.errorText = '请输入消息内容';
            state.statusText = '';
            patchComposeUi();
            return;
        }

        state.sending = true;
        state.errorText = '';
        state.statusText = '正在发送消息...';
        state.conversationId = activeConversationId;
        patchComposeUi();
        scrollMessageDetailToBottom(container);

        const requestId = createPhoneMessageRequestId();
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

        markLocalTableMutation();
        const userInsert = /** @type {any} */ (await insertPhoneMessageRecord(sheetKey, userRecord));
        if (!userInsert.ok) {
            state.sending = false;
            state.errorText = String(userInsert.message || '用户消息写入失败');
            state.statusText = '';
            patchComposeUi();
            return;
        }

        state.rowsData.push(materializeRowFromPayload(headers, userInsert.payload));
        state.draftByConversation[activeConversationId] = '';
        state.statusText = '正在等待角色回复...';
        renderKeepScroll();
        scrollMessageDetailToBottom(container);

        let assistantPlaceholder = /** @type {any} */ (null);

        try {
            const phoneChatSettings = getPhoneChatSettings();
            const promptTemplate = getPhoneChatPromptTemplateContent(state.selectedPromptTemplateName);
            const storyContext = phoneChatSettings.useStoryContext
                ? await getPhoneStoryContext(phoneChatSettings.storyContextTurns)
                : '';
            const worldbookContext = await getPhoneChatWorldbookContext();
            const threadRowsForGeneration = getConversationRows(state.rowsData, activeConversationId, readSpecialField);
            const partnerName = state.selectedTarget || findConversationPartnerName(threadRowsForGeneration, readSpecialField, getCurrentCharacterDisplayName(threadTitle || '对方'));
            const aiMessages = [
                ...buildPhoneChatSystemMessages({
                    promptTemplate,
                    worldbookText: worldbookContext.text,
                    storyContext,
                    conversationTitle: threadTitle,
                    targetCharacterName: state.selectedTarget || '',
                }),
                ...buildPhoneChatConversationMessages(threadRowsForGeneration, readSpecialField),
            ];

            markLocalTableMutation();
            assistantPlaceholder = /** @type {any} */ (await insertPhoneMessageRecord(sheetKey, {
                threadId: activeConversationId,
                threadTitle,
                sender: partnerName,
                senderRole: 'assistant',
                chatTarget: state.selectedTarget || '',
                content: '…',
                sentAt: new Date().toISOString(),
                messageStatus: '生成中',
                requestId: `${requestId}_reply`,
                replyToMessageId: requestId,
                imageDesc: 'none',
                videoDesc: 'none',
            }));

            if (assistantPlaceholder.ok) {
                state.rowsData.push(materializeRowFromPayload(headers, assistantPlaceholder.payload));
                renderKeepScroll();
                scrollMessageDetailToBottom(container);
            }

            const aiResult = await callPhoneChatAI(aiMessages, {
                apiPresetName: phoneChatSettings.apiPresetName,
                maxTokens: 900,
                timeout: 90000,
            });

            if (!aiResult.ok) {
                if (Number.isInteger(userInsert.rowIndex)) {
                    markLocalTableMutation();
                    await updatePhoneMessageRecord(sheetKey, userInsert.rowIndex, { messageStatus: '待重试' });
                }
                if (assistantPlaceholder?.ok && Number.isInteger(assistantPlaceholder.rowIndex)) {
                    markLocalTableMutation();
                    await updatePhoneMessageRecord(sheetKey, assistantPlaceholder.rowIndex, {
                        content: '（回复失败，可稍后重试）',
                        messageStatus: '失败',
                    });
                }
                syncRowsFromSheet();
                state.sending = false;
                state.errorText = String(aiResult.message || '角色回复失败');
                state.statusText = '用户消息已保存，可稍后重试';
                renderKeepScroll();
                scrollMessageDetailToBottom(container);
                return;
            }

            if (Number.isInteger(userInsert.rowIndex)) {
                markLocalTableMutation();
                await updatePhoneMessageRecord(sheetKey, userInsert.rowIndex, { messageStatus: '已完成' });
            }

            if (assistantPlaceholder?.ok && Number.isInteger(assistantPlaceholder.rowIndex)) {
                markLocalTableMutation();
                await updatePhoneMessageRecord(sheetKey, assistantPlaceholder.rowIndex, {
                    content: aiResult.text,
                    messageStatus: '已完成',
                });
            } else {
                markLocalTableMutation();
                await insertPhoneMessageRecord(sheetKey, {
                    threadId: activeConversationId,
                    threadTitle,
                    sender: partnerName,
                    senderRole: 'assistant',
                    chatTarget: state.selectedTarget || '',
                    content: aiResult.text,
                    sentAt: new Date().toISOString(),
                    messageStatus: '已完成',
                    requestId: `${requestId}_reply`,
                    replyToMessageId: requestId,
                    imageDesc: 'none',
                    videoDesc: 'none',
                });
            }

            markLocalTableMutation(1800);
            const refreshed = await refreshPhoneMessageProjection();
            syncRowsFromSheet();
            state.sending = false;
            state.errorText = '';
            state.statusText = refreshed ? '发送成功' : '发送成功，但投影刷新失败';
            renderKeepScroll();
            scrollMessageDetailToBottom(container);
        } catch (error) {
            if (Number.isInteger(userInsert.rowIndex)) {
                await updatePhoneMessageRecord(sheetKey, userInsert.rowIndex, { messageStatus: '待重试' });
            }
            if (assistantPlaceholder?.ok && Number.isInteger(assistantPlaceholder.rowIndex)) {
                await updatePhoneMessageRecord(sheetKey, assistantPlaceholder.rowIndex, {
                    content: '（发送异常，可稍后重试）',
                    messageStatus: '失败',
                });
            }
            syncRowsFromSheet();
            state.sending = false;
            state.errorText = error?.message || '发送过程中发生异常';
            state.statusText = '用户消息已保存，可稍后继续';
            renderKeepScroll();
            scrollMessageDetailToBottom(container);
        }
    };

    const handleRetryMessage = async ({ conversationId, threadTitle, readSpecialField }) => {
        if (state.sending) return;

        const threadRows = getConversationRows(state.rowsData, conversationId, readSpecialField);
        const retryTarget = getRetryTarget(threadRows, readSpecialField);
        if (!retryTarget?.requestId) {
            state.errorText = '当前没有可重试的消息';
            state.statusText = '';
            patchComposeUi();
            return;
        }

        state.sending = true;
        state.errorText = '';
        state.statusText = '正在重新生成回复...';
        patchComposeUi();
        scrollMessageDetailToBottom(container);

        const userRowIndex = findRowIndexByRequestId(state.rowsData, retryTarget.requestId, readSpecialField, { key: 'requestId', userOnly: true });
        const assistantRowIndex = findRowIndexByRequestId(state.rowsData, retryTarget.requestId, readSpecialField, { key: 'replyToMessageId' });

        try {
            if (Number.isInteger(userRowIndex)) {
                markLocalTableMutation();
                await updatePhoneMessageRecord(sheetKey, userRowIndex, { messageStatus: '等待回复' });
            }

            if (Number.isInteger(assistantRowIndex)) {
                markLocalTableMutation();
                await updatePhoneMessageRecord(sheetKey, assistantRowIndex, {
                    content: '…',
                    messageStatus: '生成中',
                });
            }

            syncRowsFromSheet();
            renderKeepScroll();
            scrollMessageDetailToBottom(container);

            const phoneChatSettings = getPhoneChatSettings();
            const promptTemplate = getPhoneChatPromptTemplateContent(state.selectedPromptTemplateName);
            const storyContext = phoneChatSettings.useStoryContext
                ? await getPhoneStoryContext(phoneChatSettings.storyContextTurns)
                : '';
            const worldbookContext = await getPhoneChatWorldbookContext();
            const freshThreadRows = getConversationRows(state.rowsData, conversationId, readSpecialField);
            const partnerName = state.selectedTarget || findConversationPartnerName(freshThreadRows, readSpecialField, getCurrentCharacterDisplayName(threadTitle || '对方'));
            const aiMessages = [
                ...buildPhoneChatSystemMessages({
                    promptTemplate,
                    worldbookText: worldbookContext.text,
                    storyContext,
                    conversationTitle: threadTitle,
                    targetCharacterName: state.selectedTarget || '',
                }),
                ...buildPhoneChatConversationMessages(freshThreadRows, readSpecialField),
            ];

            const aiResult = await callPhoneChatAI(aiMessages, {
                apiPresetName: phoneChatSettings.apiPresetName,
                maxTokens: 900,
                timeout: 90000,
            });

            if (!aiResult.ok) {
                if (Number.isInteger(userRowIndex)) {
                    markLocalTableMutation();
                    await updatePhoneMessageRecord(sheetKey, userRowIndex, { messageStatus: '待重试' });
                }
                if (Number.isInteger(assistantRowIndex)) {
                    markLocalTableMutation();
                    await updatePhoneMessageRecord(sheetKey, assistantRowIndex, {
                        content: '（回复失败，可稍后重试）',
                        messageStatus: '失败',
                    });
                }
                syncRowsFromSheet();
                state.sending = false;
                state.errorText = String(aiResult.message || '角色回复失败');
                state.statusText = '仍可继续重试';
                renderKeepScroll();
                scrollMessageDetailToBottom(container);
                return;
            }

            if (Number.isInteger(userRowIndex)) {
                markLocalTableMutation();
                await updatePhoneMessageRecord(sheetKey, userRowIndex, { messageStatus: '已完成' });
            }

            if (Number.isInteger(assistantRowIndex)) {
                markLocalTableMutation();
                await updatePhoneMessageRecord(sheetKey, assistantRowIndex, {
                    sender: partnerName,
                    content: aiResult.text,
                    messageStatus: '已完成',
                });
            }

            markLocalTableMutation(1800);
            const refreshed = await refreshPhoneMessageProjection();
            syncRowsFromSheet();
            state.sending = false;
            state.errorText = '';
            state.statusText = refreshed ? '重试成功' : '重试成功，但投影刷新失败';
            renderKeepScroll();
            scrollMessageDetailToBottom(container);
        } catch (error) {
            if (Number.isInteger(userRowIndex)) {
                await updatePhoneMessageRecord(sheetKey, userRowIndex, { messageStatus: '待重试' });
            }
            if (Number.isInteger(assistantRowIndex)) {
                await updatePhoneMessageRecord(sheetKey, assistantRowIndex, {
                    content: '（发送异常，可稍后重试）',
                    messageStatus: '失败',
                });
            }
            syncRowsFromSheet();
            state.sending = false;
            state.errorText = error?.message || '重试过程中发生异常';
            state.statusText = '仍可继续重试';
            renderKeepScroll();
            scrollMessageDetailToBottom(container);
        }
    };

    render();
}

function materializeRowFromPayload(headers, payload = {}) {
    const headerList = Array.isArray(headers) ? headers : [];
    return headerList.map((header) => {
        const key = String(header || '').trim();
        return Object.prototype.hasOwnProperty.call(payload, key) ? payload[key] : '';
    });
}

function getConversationRows(rows, conversationId, readSpecialField) {
    return getConversationRowEntries(rows, conversationId, readSpecialField).map(entry => entry.row);
}

function getConversationRowEntries(rows, conversationId, readSpecialField) {
    return (Array.isArray(rows) ? rows : []).reduce((result, row, rowIndex) => {
        const fallbackConversationId = `default_thread_${rowIndex + 1}`;
        const rowConversationId = String(readSpecialField(row, 'threadId', fallbackConversationId) || fallbackConversationId).trim() || fallbackConversationId;
        if (rowConversationId === conversationId) {
            result.push({ row, rowIndex });
        }
        return result;
    }, []);
}

function buildPhoneChatConversationMessages(threadRows, readSpecialField) {
    return (Array.isArray(threadRows) ? threadRows : [])
        .slice(-MAX_THREAD_CONTEXT_MESSAGES)
        .map((row) => {
            const sender = normalizeSenderName(readSpecialField(row, 'sender', ''));
            const senderRole = String(readSpecialField(row, 'senderRole', '') || '').trim().toLowerCase();
            const messageStatus = String(readSpecialField(row, 'messageStatus', '') || '').trim();
            const content = buildPromptContentFromRow(row, readSpecialField);
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

function buildPhoneChatSystemMessages({ promptTemplate, worldbookText, storyContext, conversationTitle, targetCharacterName }) {
    const messages = [];
    const safePromptTemplate = String(promptTemplate || '').trim();
    messages.push({
        role: 'system',
        content: safePromptTemplate || DEFAULT_PHONE_CHAT_SYSTEM_PROMPT,
    });

    const safeTargetCharacterName = String(targetCharacterName || '').trim();
    if (safeTargetCharacterName) {
        messages.push({
            role: 'system',
            content: `在这个手机聊天中，你要扮演的角色是“${safeTargetCharacterName}”。请完全以这个角色的身份、口吻和性格来回复。`,
        });
    }

    const safeConversationTitle = String(conversationTitle || '').trim();
    if (safeConversationTitle) {
        messages.push({
            role: 'system',
            content: `当前手机会话标题：${safeConversationTitle}`,
        });
    }

    const safeWorldbookText = String(worldbookText || '').trim();
    if (safeWorldbookText) {
        messages.push({
            role: 'system',
            content: `以下是当前手机聊天可参考的世界书设定，请只提取与当前会话有关的内容：\n\n${safeWorldbookText}`,
        });
    }

    const safeStoryContext = String(storyContext || '').trim();
    if (safeStoryContext) {
        messages.push({
            role: 'system',
            content: `以下是正文最近的 AI 剧情上下文，请作为背景参考，不要机械复述：\n\n${safeStoryContext}`,
        });
    }

    return messages;
}

function buildPromptContentFromRow(row, readSpecialField) {
    const parts = [];
    const content = String(readSpecialField(row, 'content', '') || '').trim();
    const imageDesc = normalizeMediaDesc(readSpecialField(row, 'imageDesc', ''));
    const videoDesc = normalizeMediaDesc(readSpecialField(row, 'videoDesc', ''));

    if (content) parts.push(content);
    if (imageDesc) parts.push(`[图片] ${imageDesc}`);
    if (videoDesc) parts.push(`[视频] ${videoDesc}`);

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

function resolveConversationHeaderLabel(conversation, titleMode = 'auto', fallback = '会话') {
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

function findConversationPartnerName(threadRows, readSpecialField, fallback = '对方') {
    const safeFallback = getCurrentCharacterDisplayName(fallback);
    for (let index = threadRows.length - 1; index >= 0; index--) {
        const sender = normalizeSenderName(readSpecialField(threadRows[index], 'sender', ''));
        if (sender && sender !== '我') {
            return sender;
        }
    }
    return safeFallback;
}

function detectChatTargetFromRows(threadRows, readSpecialField) {
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

function createPhoneMessageRequestId() {
    return `phone_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function findRowIndexByRequestId(rows, requestId, readSpecialField, { key = 'requestId', userOnly = false } = {}) {
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

function getRetryTarget(threadRows, readSpecialField) {
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

function scrollMessageDetailToBottom(container, remainingFrames = 2) {
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
function renderOneMessageRow({ row, sourceRowIndex, readSpecialField, styleOptions = /** @type {MessageStyleOptions} */ ({}), deleteManageMode = false, selected = false }) {
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

    const messageMetaHtml = buildMessageMetaHtml({
        showMessageTime,
        time,
        timeFallbackText,
        messageStatus,
    });

    const baseMessageHtml = `
        <div class="phone-special-message-item ${isSelf ? 'self' : 'other'}">
            ${showAvatar
                ? `<div class="phone-special-name-avatar" style="background-color:${escapeHtmlAttr(senderColor)};">${escapeHtml(getAvatarText(senderLabel))}</div>`
                : ''}
            <div class="phone-special-message-bubble-wrap">
                <div class="phone-special-message-bubble" style="${escapeHtmlAttr(bubbleInlineStyle)}">${escapeHtml(content || emptyMessageText)}</div>
                ${messageMetaHtml}
            </div>
        </div>
    `;

    const mediaItems = [];
    if (imageDesc) {
        mediaItems.push({
            label: '图片内容',
            text: imageDesc,
            actionText: mediaActionTextMode === 'detailed' ? '点击查看图片详情' : '点击查看图片',
        });
    }
    if (videoDesc) {
        mediaItems.push({
            label: '视频内容',
            text: videoDesc,
            actionText: mediaActionTextMode === 'detailed' ? '点击查看视频详情' : '点击查看视频',
        });
    }

    const mediaHtml = mediaItems.map(item => `
        <div class="phone-special-message-item ${isSelf ? 'self' : 'other'} media-row">
            ${isSelf || !showAvatar ? '' : '<div class="phone-special-message-media-placeholder"></div>'}
            <div class="phone-special-message-bubble phone-special-media-item" style="${escapeHtmlAttr(bubbleInlineStyle)}" data-media-label="${escapeHtmlAttr(item.label)}" data-description="${escapeHtmlAttr(item.text)}">
                ${escapeHtml(item.actionText)}
            </div>
        </div>
    `).join('');

    const contentHtml = `${baseMessageHtml}${mediaHtml}`;
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
