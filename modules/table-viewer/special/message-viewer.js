import {
    deletePhoneSheetRows,
    getSheetDataByKey,
} from '../../phone-core/chat-support.js';
import { showConfirmDialog } from '../../settings-app/ui/confirm-dialog.js';
import { showInlineToast } from '../shared-ui.js';
import { createSpecialFieldReader, buildHeaderIndexMap } from './field-reader.js';
import {
    getConversationRows,
    scrollMessageDetailToBottom,
} from './message-viewer-helpers.js';
import { createMessageViewerActions } from './message-viewer-actions.js';
import { renderMessageConversationView } from './message-viewer/conversation-view.js';
import { bindMessageDetailController } from './message-viewer/detail-controller.js';
import { renderMessageDetailView } from './message-viewer/detail-view.js';
import {
    normalizeMediaDesc,
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
    const { createSpecialTemplateStylePayload, viewerRuntime, viewerEventManager } = deps;
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
        pendingArchive: null,
        skipSheetSyncOnce: false,
        stableTapGuards: Object.create(null),
    };

    const runtime = viewerRuntime && typeof viewerRuntime === 'object' ? viewerRuntime : null;
    const addRuntimeListener = runtime?.addEventListener
        ? (...args) => runtime.addEventListener(...args)
        : viewerEventManager?.add
            ? (...args) => viewerEventManager.add(...args)
            : (target, type, handler, options) => {
                target.addEventListener(type, handler, options);
                return () => target.removeEventListener(type, handler, options);
            };
    const requestRuntimeFrame = runtime?.requestAnimationFrame
        ? (callback) => runtime.requestAnimationFrame(callback)
        : (callback) => requestAnimationFrame(callback);

    const setSelectedMessageRowIndexes = (rowIndexes = []) => {
        state.selectedMessageRowIndexes = Array.from(new Set((Array.isArray(rowIndexes) ? rowIndexes : [rowIndexes])
            .map(value => Number(value))
            .filter(Number.isInteger)
            .filter(value => value >= 0)))
            .sort((a, b) => a - b);
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

        requestRuntimeFrame(() => {
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
            requestRuntimeFrame(() => {
                requestRuntimeFrame(() => {
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

    const clearDeleteSelectionAfterExternalSync = () => {
        if (!state.deleteManageMode || state.deletingSelection) return false;
        if (!Array.isArray(state.selectedMessageRowIndexes) || state.selectedMessageRowIndexes.length === 0) return false;

        setSelectedMessageRowIndexes([]);
        return true;
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
        viewerRuntime: runtime,
    });

    const handleExternalTableUpdate = (event) => {
        if (event?.detail?.sheetKey !== sheetKey) return;
        if (Date.now() < state.suppressExternalUpdateUntil) return;
        if (!syncRowsFromSheet()) return;

        const selectionReset = clearDeleteSelectionAfterExternalSync();
        renderKeepScroll();
        if (selectionReset) {
            showInlineToast(container, '表格已刷新，已清空删除选择，请重新选择');
        }
    };

    addRuntimeListener(window, 'yuzi-phone-table-updated', handleExternalTableUpdate);

    const renderConversationList = () => {
        state.pendingArchive = null;
        syncRowsFromSheet();
        renderMessageConversationView({
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
            viewerRuntime: runtime,
        });
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
            state.pendingArchive = null;
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
        addRuntimeListener(pickerEl.querySelector('.phone-special-contact-picker-confirm-btn'), 'click', () => {
            selectContact(inputEl?.value || '');
        });

        if (inputEl) {
            addRuntimeListener(inputEl, 'keydown', (e) => {
                if (e.key === 'Enter' && !e.isComposing) {
                    e.preventDefault();
                    selectContact(inputEl.value || '');
                }
            });
            requestRuntimeFrame(() => inputEl.focus());
        }

        addRuntimeListener(pickerEl.querySelector('.phone-special-contact-picker-cancel-btn'), 'click', () => {
            state.contactPickerVisible = false;
            renderKeepScroll();
        });

        addRuntimeListener(pickerEl, 'click', (e) => {
            if (e.target === pickerEl) {
                state.contactPickerVisible = false;
                renderKeepScroll();
            }
        });
        runtime?.registerCleanup?.(() => pickerEl.remove());
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
        const detailView = renderMessageDetailView({
            container,
            tableName,
            state,
            readSpecialField,
            createSpecialTemplateStylePayload,
            templateMatch,
            type,
        });
        if (!detailView) return;

        const {
            conversationId,
            detailTitle,
            rowEntriesInConv,
        } = detailView;

        bindMessageDetailController({
            container,
            state,
            conversationId,
            detailTitle,
            tableName,
            rowEntriesInConv,
            setSelectedMessageRowIndexes,
            clearDeleteManageState,
            patchMessageManageUi,
            patchComposeUi,
            render,
            renderKeepScroll,
            showInlineToast,
            showConfirmDialog,
            executeDeleteSelectedMessages,
            normalizeMediaDesc,
            autoResizeComposeInput,
            handleSendMessage,
            handleRetryMessage,
            closeMediaPreview,
            viewerRuntime: runtime,
        });
    };


    render();
}

