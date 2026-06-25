import { bindStableActionDelegate } from './action-delegate.js';

const MESSAGE_DETAIL_CONTROLLER_KEY = '__stYuziMessageDetailController';

function getMessageDetailControllerContext(container) {
    if (!(container instanceof HTMLElement)) return null;
    const context = container[MESSAGE_DETAIL_CONTROLLER_KEY];
    return context && typeof context === 'object' ? context : null;
}

function setMessageDetailControllerContext(container, options = {}) {
    if (!(container instanceof HTMLElement)) return null;

    const currentContext = getMessageDetailControllerContext(container) || {
        overlayFreshTapGuards: Object.create(null),
    };
    Object.assign(currentContext, options);
    currentContext.active = true;
    currentContext.overlayFreshTapGuards = currentContext.overlayFreshTapGuards && typeof currentContext.overlayFreshTapGuards === 'object'
        ? currentContext.overlayFreshTapGuards
        : Object.create(null);
    container[MESSAGE_DETAIL_CONTROLLER_KEY] = currentContext;
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

function getPointerClickSuppressWindow(pointerType) {
    return POINTER_CLICK_SUPPRESS_MS[normalizePointerType(pointerType)] ?? POINTER_CLICK_SUPPRESS_MS.unknown;
}

function getEventTime(event) {
    return Number.isFinite(event?.timeStamp) ? Number(event.timeStamp) : Date.now();
}

function getOverlayFreshTapGuard(context, kind) {
    const guardKey = String(kind || '').trim() || '__default__';
    const guards = context?.overlayFreshTapGuards && typeof context.overlayFreshTapGuards === 'object'
        ? context.overlayFreshTapGuards
        : (context.overlayFreshTapGuards = Object.create(null));
    const existingGuard = guards[guardKey];
    if (existingGuard && typeof existingGuard === 'object') {
        return existingGuard;
    }

    const guard = {
        openedAt: -Infinity,
        pointerType: 'unknown',
    };
    guards[guardKey] = guard;
    return guard;
}

function markOverlayOpened(context, kind, event) {
    if (event?.type !== 'pointerup') return;
    const guard = getOverlayFreshTapGuard(context, kind);
    guard.openedAt = getEventTime(event);
    guard.pointerType = normalizePointerType(event?.pointerType);
}

function shouldIgnoreFreshOverlayMaskClick(context, kind, event) {
    const guard = getOverlayFreshTapGuard(context, kind);
    const elapsed = getEventTime(event) - guard.openedAt;
    const suppressWindow = getPointerClickSuppressWindow(guard.pointerType);
    const shouldIgnore = elapsed >= 0 && elapsed <= suppressWindow;
    if (shouldIgnore) {
        guard.openedAt = -Infinity;
    }
    return shouldIgnore;
}

function consumeEvent(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
}

function getDetailContextForEvent(container) {
    const context = getMessageDetailControllerContext(container);
    if (!(container instanceof HTMLElement) || !context?.state) return null;
    if (context.active === false) return null;
    if (context.state.mode !== 'detail') return null;
    return context;
}

function getComposeInputFromEvent(event, container) {
    const target = event?.target instanceof HTMLTextAreaElement ? event.target : null;
    if (!(target instanceof HTMLTextAreaElement) || !(container instanceof HTMLElement) || !container.contains(target)) {
        return null;
    }
    return target.classList.contains('phone-special-message-compose-input') ? target : null;
}

function getAttachmentInputFromEvent(event, container) {
    const target = event?.target instanceof HTMLTextAreaElement ? event.target : null;
    if (!(target instanceof HTMLTextAreaElement) || !(container instanceof HTMLElement) || !container.contains(target)) return null;
    return target.classList.contains('phone-special-message-attachment-textarea') ? target : null;
}

function getContextConversationId(context) {
    return String(context?.conversationId || 'default_thread').trim() || 'default_thread';
}

function getContextThreadTitle(context) {
    return context?.detailTitle || context?.tableName || '会话';
}

function applySetSelectedRows(context, rowIndexes = []) {
    if (typeof context?.setSelectedMessageRowIndexes === 'function') {
        context.setSelectedMessageRowIndexes(rowIndexes);
    }
}

function clearDeleteState(context) {
    if (typeof context?.clearDeleteManageState === 'function') {
        context.clearDeleteManageState();
        return;
    }
    if (!context?.state) return;
    context.state.deleteManageMode = false;
    context.state.deletingSelection = false;
    context.state.selectedMessageRowIndexes = [];
}

function patchManageUi(context) {
    context?.patchMessageManageUi?.();
}

function patchCompose(context) {
    context?.patchComposeUi?.();
}

function normalizeMedia(context, value) {
    const normalizer = typeof context?.normalizeMediaDesc === 'function'
        ? context.normalizeMediaDesc
        : (nextValue) => String(nextValue || '').trim();
    return normalizer(value);
}

function resizeCompose(context, textarea) {
    context?.autoResizeComposeInput?.(textarea);
}

function normalizeComposeMediaKind(value) {
    const kind = String(value || '').trim();
    return kind === 'image' || kind === 'video' ? kind : '';
}

function getComposeMediaKey(kind) {
    return kind === 'image' ? 'imageDesc' : (kind === 'video' ? 'videoDesc' : '');
}

function resetAttachmentDialog(context) {
    context.state.attachmentDialog = {
        visible: false,
        conversationId: null,
        kind: null,
        draftValue: '',
    };
}

function handleNavBack(context) {
    context.state.mode = 'conversation';
    context.state.conversationId = null;
    context.state.mediaPreview = null;
    context.state.errorText = '';
    context.state.statusText = '';
    clearDeleteState(context);
    context.render?.();
}

function handleToggleDeleteMode(context) {
    context.state.deleteManageMode = !context.state.deleteManageMode;
    context.state.deletingSelection = false;
    context.state.selectedMessageRowIndexes = [];
    context.renderKeepScroll?.();
}

function handleSelectAll(context) {
    const rowEntries = Array.isArray(context.rowEntriesInConv) ? context.rowEntriesInConv : [];
    applySetSelectedRows(context, rowEntries
        .filter((entry) => !entry.row?.__yuziPhoneLocalTempMessage)
        .map((entry) => entry.rowIndex));
    patchManageUi(context);
}

function handleClearSelection(context) {
    applySetSelectedRows(context, []);
    patchManageUi(context);
}

function handleDeleteSelection(context, container) {
    if (context.state.selectedMessageRowIndexes.length === 0 || context.state.deletingSelection) {
        context.showInlineToast?.(container, '请先选择要删除的消息');
        return;
    }

    context.showConfirmDialog?.(
        container,
        '确认删除',
        `确定删除已选中的 ${context.state.selectedMessageRowIndexes.length} 条聊天消息吗？此操作无法撤销。`,
        () => {
            void context.executeDeleteSelectedMessages?.(getContextConversationId(context));
        },
        '删除',
        '取消'
    );
}

function handleToggleRowSelection(context, actionEl) {
    const rowIndex = Number(actionEl.dataset.rowIndex);
    if (Number.isNaN(rowIndex) || context.state.deletingSelection) return;
    const rowEntries = Array.isArray(context.rowEntriesInConv) ? context.rowEntriesInConv : [];
    const targetEntry = rowEntries.find((entry) => entry.rowIndex === rowIndex);
    if (targetEntry?.row?.__yuziPhoneLocalTempMessage) return;
    const selectedSet = new Set(context.state.selectedMessageRowIndexes);
    if (selectedSet.has(rowIndex)) {
        selectedSet.delete(rowIndex);
    } else {
        selectedSet.add(rowIndex);
    }
    applySetSelectedRows(context, Array.from(selectedSet));
    patchManageUi(context);
}

function handleOpenMediaPreview(context, actionEl, event = null) {
    const desc = normalizeMedia(context, actionEl.dataset.description);
    if (!desc) return;
    const title = String(actionEl.dataset.mediaLabel || '媒体内容').trim() || '媒体内容';
    context.state.mediaPreview = {
        title,
        content: desc,
    };
    markOverlayOpened(context, 'mediaPreview', event);
    context.renderKeepScroll?.();
}

function handleCloseMediaPreview(context) {
    context.closeMediaPreview?.();
}

function handleSendMessage(context) {
    void context.handleSendMessage?.({
        conversationId: getContextConversationId(context),
        threadTitle: getContextThreadTitle(context),
    });
}

function handleStopMessage(context) {
    void context.handleStopMessage?.({
        conversationId: getContextConversationId(context),
        threadTitle: getContextThreadTitle(context),
    });
}

function handleRetryArchive(context) {
    void context.handleRetryMessage?.({
        conversationId: getContextConversationId(context),
        threadTitle: getContextThreadTitle(context),
    });
}

function handleOpenAttachmentDialog(context, actionEl, event = null) {
    if (context.state.sending) return;
    const conversationId = String(actionEl?.dataset?.conversationId || '').trim();
    const currentConversationId = getContextConversationId(context);
    if (!conversationId || conversationId !== currentConversationId) return;

    const kind = normalizeComposeMediaKind(actionEl?.dataset?.mediaKind);
    const mediaKey = getComposeMediaKey(kind);
    if (!mediaKey) return;

    const mediaMap = context.state.composeMediaByConversation && typeof context.state.composeMediaByConversation === 'object'
        ? context.state.composeMediaByConversation
        : (context.state.composeMediaByConversation = {});
    const media = mediaMap[conversationId] && typeof mediaMap[conversationId] === 'object'
        ? mediaMap[conversationId]
        : {};
    context.state.attachmentDialog = {
        visible: true,
        conversationId,
        kind,
        draftValue: normalizeMedia(context, media[mediaKey]),
    };
    markOverlayOpened(context, 'attachmentDialog', event);
    context.renderKeepScroll?.();
}

function handleCloseAttachmentDialog(context, actionEl = null) {
    const actionConversationId = actionEl instanceof HTMLElement
        ? String(actionEl.dataset.conversationId || '').trim()
        : '';
    if (actionConversationId && actionConversationId !== getContextConversationId(context)) {
        return;
    }
    resetAttachmentDialog(context);
    context.renderKeepScroll?.();
}

function handleSaveComposeMedia(context, actionEl) {
    if (context.state.sending) return;
    const conversationId = String(actionEl?.dataset?.conversationId || '').trim();
    const currentConversationId = getContextConversationId(context);
    if (!conversationId || conversationId !== currentConversationId) return;

    const kind = normalizeComposeMediaKind(actionEl?.dataset?.mediaKind || context.state.attachmentDialog?.kind);
    const mediaKey = getComposeMediaKey(kind);
    const dialog = context.state.attachmentDialog && typeof context.state.attachmentDialog === 'object'
        ? context.state.attachmentDialog
        : null;
    if (!mediaKey || !dialog?.visible || dialog.conversationId !== conversationId || dialog.kind !== kind) return;

    const normalized = normalizeMedia(context, dialog.draftValue);
    const mediaMap = context.state.composeMediaByConversation && typeof context.state.composeMediaByConversation === 'object'
        ? context.state.composeMediaByConversation
        : (context.state.composeMediaByConversation = {});
    const currentMedia = mediaMap[conversationId] && typeof mediaMap[conversationId] === 'object'
        ? { ...mediaMap[conversationId] }
        : {};
    if (normalized) {
        currentMedia[mediaKey] = normalized;
        mediaMap[conversationId] = currentMedia;
    } else {
        delete currentMedia[mediaKey];
        if (Object.keys(currentMedia).length > 0) {
            mediaMap[conversationId] = currentMedia;
        } else {
            delete mediaMap[conversationId];
        }
    }
    resetAttachmentDialog(context);
    context.renderKeepScroll?.();
}

function handleClearComposeMedia(context, actionEl) {
    if (context.state.sending) return;
    const conversationId = String(actionEl?.dataset?.conversationId || '').trim();
    const currentConversationId = getContextConversationId(context);
    if (!conversationId || conversationId !== currentConversationId) return;
    const mediaKey = getComposeMediaKey(normalizeComposeMediaKind(actionEl?.dataset?.mediaKind));
    if (!mediaKey || !context.state.composeMediaByConversation || typeof context.state.composeMediaByConversation !== 'object') return;
    const currentMedia = context.state.composeMediaByConversation[conversationId];
    if (!currentMedia || typeof currentMedia !== 'object') return;
    delete currentMedia[mediaKey];
    if (Object.keys(currentMedia).length === 0) {
        delete context.state.composeMediaByConversation[conversationId];
    }
    context.renderKeepScroll?.();
}

function dispatchDetailAction(container, context, actionEl, event = null) {
    const action = String(actionEl?.dataset?.action || '').trim();
    if (!action) return false;

    switch (action) {
        case 'detail-back':
            handleNavBack(context);
            return true;
        case 'toggle-delete-mode':
            handleToggleDeleteMode(context);
            return true;
        case 'select-all':
            handleSelectAll(context);
            return true;
        case 'clear-selection':
            handleClearSelection(context);
            return true;
        case 'delete-selection':
            handleDeleteSelection(context, container);
            return true;
        case 'toggle-row-selection':
            handleToggleRowSelection(context, actionEl);
            return true;
        case 'open-media-preview':
            handleOpenMediaPreview(context, actionEl, event);
            return true;
        case 'close-media-preview':
            handleCloseMediaPreview(context);
            return true;
        case 'send-message':
            handleSendMessage(context);
            return true;
        case 'stop-message':
            handleStopMessage(context);
            return true;
        case 'retry-message':
        case 'retry-archive':
            handleRetryArchive(context);
            return true;
        case 'open-attachment-dialog':
            handleOpenAttachmentDialog(context, actionEl, event);
            return true;
        case 'close-attachment-dialog':
            handleCloseAttachmentDialog(context, actionEl);
            return true;
        case 'save-compose-media':
            handleSaveComposeMedia(context, actionEl);
            return true;
        case 'clear-compose-media':
            handleClearComposeMedia(context, actionEl);
            return true;
        default:
            return false;
    }
}

function bindMessageDetailDelegates(container, context) {
    if (!(container instanceof HTMLElement) || !context) return { dispose: () => {} };

    const runtime = context.viewerRuntime && typeof context.viewerRuntime === 'object' ? context.viewerRuntime : null;
    const sharedPointerGuards = context.actionGuardStore && typeof context.actionGuardStore === 'object' ? context.actionGuardStore : null;
    const addListener = runtime?.addEventListener
        ? (...args) => runtime.addEventListener(...args)
        : (target, type, listener, options) => {
            target.addEventListener(type, listener, options);
            return () => target.removeEventListener(type, listener, options);
        };
    const cleanups = [];
    let disposed = false;
    const addCleanup = (cleanup) => {
        if (typeof cleanup !== 'function') return;
        if (disposed) {
            cleanup();
            return;
        }
        cleanups.push(cleanup);
    };
    const dispose = () => {
        if (disposed) return;
        disposed = true;
        context.active = false;
        while (cleanups.length > 0) {
            cleanups.pop()?.();
        }
    };

    addCleanup(bindStableActionDelegate({
        container,
        runtime,
        sharedPointerGuards,
        actions: [
            'detail-back',
            'toggle-delete-mode',
            'select-all',
            'clear-selection',
            'delete-selection',
            'toggle-row-selection',
            'open-media-preview',
            'close-media-preview',
            'send-message',
            'stop-message',
            'retry-message',
            'retry-archive',
            'open-attachment-dialog',
            'close-attachment-dialog',
            'save-compose-media',
            'clear-compose-media',
        ],
        isActive: () => getDetailContextForEvent(container) === context,
        onAction: ({ actionEl, event }) => {
            const currentContext = getDetailContextForEvent(container);
            if (!currentContext) return;
            dispatchDetailAction(container, currentContext, actionEl, event);
        },
    }).dispose);

    addCleanup(addListener(container, 'click', (event) => {
        const currentContext = getDetailContextForEvent(container);
        const target = event.target instanceof HTMLElement ? event.target : null;
        if (!currentContext || !target || !container.contains(target)) return;

        const previewMask = target.closest('.phone-special-media-preview-mask');
        if (previewMask instanceof HTMLElement && previewMask === target && container.contains(previewMask)) {
            consumeEvent(event);
            if (shouldIgnoreFreshOverlayMaskClick(currentContext, 'mediaPreview', event)) return;
            currentContext.closeMediaPreview?.();
            return;
        }

        const attachmentMask = target.closest('.phone-special-attachment-dialog-mask');
        if (attachmentMask instanceof HTMLElement && attachmentMask === target && container.contains(attachmentMask)) {
            consumeEvent(event);
            if (shouldIgnoreFreshOverlayMaskClick(currentContext, 'attachmentDialog', event)) return;
            handleCloseAttachmentDialog(currentContext, attachmentMask);
            return;
        }

    }));

    addCleanup(addListener(container, 'input', (event) => {
        const currentContext = getDetailContextForEvent(container);
        const attachmentInput = getAttachmentInputFromEvent(event, container);
        if (currentContext && attachmentInput instanceof HTMLTextAreaElement) {
            const dialog = currentContext.state.attachmentDialog && typeof currentContext.state.attachmentDialog === 'object'
                ? currentContext.state.attachmentDialog
                : null;
            const inputConversationId = String(attachmentInput.dataset.conversationId || '').trim();
            const inputKind = normalizeComposeMediaKind(attachmentInput.dataset.mediaKind);
            if (dialog?.visible && dialog.conversationId === inputConversationId && dialog.kind === inputKind) {
                dialog.draftValue = String(attachmentInput.value || '');
            }
            return;
        }
        const composeInput = getComposeInputFromEvent(event, container);
        if (!currentContext || !(composeInput instanceof HTMLTextAreaElement)) return;
        const conversationId = getContextConversationId(currentContext);
        currentContext.state.draftByConversation[conversationId] = String(composeInput.value || '');
        if (currentContext.state.errorText) {
            currentContext.state.errorText = '';
            patchCompose(currentContext, { resizeInput: false });
        }
        if (typeof currentContext.scheduleComposeInputResize === 'function') {
            currentContext.scheduleComposeInputResize(composeInput);
        } else {
            resizeCompose(currentContext, composeInput);
        }
    }));

    addCleanup(addListener(container, 'keydown', (event) => {
        const currentContext = getDetailContextForEvent(container);
        const composeInput = getComposeInputFromEvent(event, container);
        if (!currentContext || !(composeInput instanceof HTMLTextAreaElement)) return;
        if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
        consumeEvent(event);
        handleSendMessage(currentContext);
    }));

    return { dispose };
}

export function bindMessageDetailController(options = {}) {
    const {
        container,
        state,
        conversationId,
        detailTitle,
        tableName,
        rowEntriesInConv = [],
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
        scheduleComposeInputResize,
        handleSendMessage,
        handleRetryMessage,
        handleStopMessage,
        closeMediaPreview,
        actionGuardStore,
        viewerRuntime,
    } = options;

    if (!(container instanceof HTMLElement) || !state) return;
    if (typeof render !== 'function' || typeof renderKeepScroll !== 'function') return;

    const context = setMessageDetailControllerContext(container, {
        state,
        conversationId,
        detailTitle,
        tableName,
        rowEntriesInConv: Array.isArray(rowEntriesInConv) ? rowEntriesInConv : [],
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
        scheduleComposeInputResize,
        handleSendMessage,
        handleRetryMessage,
        handleStopMessage,
        closeMediaPreview,
        actionGuardStore,
        viewerRuntime,
    });

    const composeInput = container.querySelector('.phone-special-message-compose-input');
    if (composeInput instanceof HTMLTextAreaElement) {
        resizeCompose(context, composeInput);
    }

    const delegateSession = bindMessageDetailDelegates(container, context);
    return {
        dispose() {
            context.active = false;
            delegateSession?.dispose?.();
            const currentContext = getMessageDetailControllerContext(container);
            if (currentContext === context) delete container[MESSAGE_DETAIL_CONTROLLER_KEY];
        },
    };
}
