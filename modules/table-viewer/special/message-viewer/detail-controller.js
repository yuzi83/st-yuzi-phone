const MESSAGE_DETAIL_CONTROLLER_KEY = '__stYuziMessageDetailController';

function getMessageDetailControllerContext(container) {
    if (!(container instanceof HTMLElement)) return null;
    const context = container[MESSAGE_DETAIL_CONTROLLER_KEY];
    return context && typeof context === 'object' ? context : null;
}

function setMessageDetailControllerContext(container, options = {}) {
    if (!(container instanceof HTMLElement)) return null;

    const currentContext = getMessageDetailControllerContext(container) || {
        delegatedBound: false,
        stableTapGuards: Object.create(null),
    };
    Object.assign(currentContext, options);
    currentContext.stableTapGuards = currentContext.stableTapGuards && typeof currentContext.stableTapGuards === 'object'
        ? currentContext.stableTapGuards
        : Object.create(null);
    container[MESSAGE_DETAIL_CONTROLLER_KEY] = currentContext;
    return currentContext;
}

function getStableTapGuard(context, action) {
    const guardKey = String(action || '').trim() || '__default__';
    const guards = context?.stableTapGuards && typeof context.stableTapGuards === 'object'
        ? context.stableTapGuards
        : (context.stableTapGuards = Object.create(null));
    const existingGuard = guards[guardKey];
    if (existingGuard && typeof existingGuard === 'object') {
        return existingGuard;
    }

    const guard = {
        lastPointerHandledAt: -Infinity,
        lastPointerType: 'unknown',
    };
    guards[guardKey] = guard;
    return guard;
}

const POINTER_CLICK_SUPPRESS_MS = {
    mouse: 80,
    touch: 450,
    pen: 450,
    unknown: 80,
};

function getEventTime(event) {
    return Number.isFinite(event?.timeStamp) ? Number(event.timeStamp) : Date.now();
}

function shouldSuppressSyntheticClick(context, action, event) {
    const guard = getStableTapGuard(context, action);
    const suppressWindow = POINTER_CLICK_SUPPRESS_MS[guard.lastPointerType] ?? POINTER_CLICK_SUPPRESS_MS.unknown;
    const elapsed = getEventTime(event) - guard.lastPointerHandledAt;
    return elapsed >= 0 && elapsed <= suppressWindow;
}

function markPointerHandled(context, action, event) {
    const guard = getStableTapGuard(context, action);
    guard.lastPointerType = String(event?.pointerType || 'unknown').trim().toLowerCase() || 'unknown';
    guard.lastPointerHandledAt = getEventTime(event);
}

function consumeEvent(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
}

function getActionElement(event, container) {
    const target = event?.target instanceof HTMLElement ? event.target : null;
    if (!target || !(container instanceof HTMLElement) || !container.contains(target)) return null;
    const actionEl = target.closest('[data-action]');
    return actionEl instanceof HTMLElement && container.contains(actionEl) ? actionEl : null;
}

function getDetailContextForEvent(container) {
    const context = getMessageDetailControllerContext(container);
    if (!(container instanceof HTMLElement) || !context?.state) return null;
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

function handleOpenMediaPreview(context, actionEl) {
    const desc = normalizeMedia(context, actionEl.dataset.description);
    if (!desc) return;
    const title = String(actionEl.dataset.mediaLabel || '媒体内容').trim() || '媒体内容';
    context.state.mediaPreview = {
        title,
        content: desc,
    };
    context.renderKeepScroll?.();
}

function handleSendMessage(context) {
    void context.handleSendMessage?.({
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

function dispatchDetailAction(container, context, actionEl) {
    const action = String(actionEl?.dataset?.action || '').trim();
    if (!action) return false;

    switch (action) {
        case 'nav-back':
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
            handleOpenMediaPreview(context, actionEl);
            return true;
        case 'send-message':
            handleSendMessage(context);
            return true;
        case 'retry-message':
        case 'retry-archive':
            handleRetryArchive(context);
            return true;
        default:
            return false;
    }
}

function bindMessageDetailDelegates(container, context) {
    if (!(container instanceof HTMLElement) || !context || context.delegatedBound) return;

    const runtime = context.viewerRuntime && typeof context.viewerRuntime === 'object' ? context.viewerRuntime : null;
    const addListener = runtime?.addEventListener
        ? (...args) => runtime.addEventListener(...args)
        : (target, type, listener, options) => {
            target.addEventListener(type, listener, options);
            return () => target.removeEventListener(type, listener, options);
        };

    addListener(container, 'pointerup', (event) => {
        const currentContext = getDetailContextForEvent(container);
        const actionEl = getActionElement(event, container);
        if (!currentContext || !actionEl) return;
        const action = String(actionEl.dataset.action || '').trim();
        if (!action) return;
        markPointerHandled(currentContext, action, event);
        consumeEvent(event);
        dispatchDetailAction(container, currentContext, actionEl);
    });

    addListener(container, 'click', (event) => {
        const currentContext = getDetailContextForEvent(container);
        const target = event.target instanceof HTMLElement ? event.target : null;
        if (!currentContext || !target || !container.contains(target)) return;

        const previewMask = target.closest('.phone-special-media-preview-mask');
        if (previewMask instanceof HTMLElement && previewMask === target && container.contains(previewMask)) {
            consumeEvent(event);
            currentContext.closeMediaPreview?.();
            return;
        }

        const actionEl = getActionElement(event, container);
        if (!actionEl) return;
        const action = String(actionEl.dataset.action || '').trim();
        if (!action) return;
        if (shouldSuppressSyntheticClick(currentContext, action, event)) {
            consumeEvent(event);
            return;
        }
        consumeEvent(event);
        dispatchDetailAction(container, currentContext, actionEl);
    });

    addListener(container, 'input', (event) => {
        const currentContext = getDetailContextForEvent(container);
        const composeInput = getComposeInputFromEvent(event, container);
        if (!currentContext || !(composeInput instanceof HTMLTextAreaElement)) return;
        const conversationId = getContextConversationId(currentContext);
        currentContext.state.draftByConversation[conversationId] = String(composeInput.value || '');
        if (currentContext.state.errorText) {
            currentContext.state.errorText = '';
        }
        resizeCompose(currentContext, composeInput);
        patchCompose(currentContext);
    });

    addListener(container, 'keydown', (event) => {
        const currentContext = getDetailContextForEvent(container);
        const composeInput = getComposeInputFromEvent(event, container);
        if (!currentContext || !(composeInput instanceof HTMLTextAreaElement)) return;
        if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
        consumeEvent(event);
        handleSendMessage(currentContext);
    });

    context.delegatedBound = true;
    runtime?.registerCleanup?.(() => {
        const currentContext = getMessageDetailControllerContext(container);
        if (currentContext) {
            currentContext.delegatedBound = false;
        }
    });
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
        handleSendMessage,
        handleRetryMessage,
        closeMediaPreview,
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
        handleSendMessage,
        handleRetryMessage,
        closeMediaPreview,
        viewerRuntime,
    });

    const composeInput = container.querySelector('.phone-special-message-compose-input');
    if (composeInput instanceof HTMLTextAreaElement) {
        resizeCompose(context, composeInput);
    }

    bindMessageDetailDelegates(container, context);
}
