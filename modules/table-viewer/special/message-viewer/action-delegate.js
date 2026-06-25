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

function getEventTime(event) {
    return Number.isFinite(event?.timeStamp) ? Number(event.timeStamp) : Date.now();
}

function consumeEvent(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
}

function getActionElement(event, container) {
    const target = event?.target instanceof Element ? event.target : null;
    if (!target || !(container instanceof HTMLElement) || !container.contains(target)) return null;
    const actionEl = target.closest('[data-action]');
    return actionEl instanceof HTMLElement && container.contains(actionEl) ? actionEl : null;
}

function isDisabledActionElement(actionEl) {
    if (!(actionEl instanceof HTMLElement)) return true;
    if (typeof HTMLButtonElement !== 'undefined' && actionEl instanceof HTMLButtonElement && actionEl.disabled) return true;
    if (typeof HTMLButtonElement === 'undefined' && 'disabled' in actionEl && actionEl.disabled === true) return true;
    return actionEl.getAttribute('aria-disabled') === 'true';
}

function getTapIdentity(actionEl) {
    return String(actionEl?.dataset?.tapIdentity || actionEl?.dataset?.defaultAction || actionEl?.dataset?.action || '').trim();
}

function createDisposeStack() {
    const cleanups = [];
    let disposed = false;
    return {
        add(cleanup) {
            if (typeof cleanup !== 'function') return;
            if (disposed) {
                cleanup();
                return;
            }
            cleanups.push(cleanup);
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            while (cleanups.length > 0) {
                cleanups.pop()?.();
            }
        },
        isDisposed() {
            return disposed;
        },
    };
}

export function bindStableActionDelegate(options = {}) {
    const { container, runtime, actions = [], isActive, onAction, sharedPointerGuards } = options;
    const allowedActions = new Set(actions.map(action => String(action || '').trim()).filter(Boolean));
    const disposeStack = createDisposeStack();
    const pointerGuards = sharedPointerGuards && typeof sharedPointerGuards === 'object' ? sharedPointerGuards : Object.create(null);

    if (!(container instanceof HTMLElement) || typeof onAction !== 'function') {
        return { dispose: () => {} };
    }

    const addListener = runtime?.addEventListener
        ? (...args) => runtime.addEventListener(...args)
        : (target, type, listener, listenerOptions) => {
            target.addEventListener(type, listener, listenerOptions);
            return () => target.removeEventListener(type, listener, listenerOptions);
        };
    const isSessionActive = () => !disposeStack.isDisposed() && (typeof isActive !== 'function' || isActive());
    const isAllowed = action => allowedActions.size === 0 || allowedActions.has(action);

    disposeStack.add(addListener(container, 'pointerup', (event) => {
        if (!isSessionActive()) return;
        const actionEl = getActionElement(event, container);
        if (!actionEl || isDisabledActionElement(actionEl)) return;
        const action = String(actionEl.dataset.action || '').trim();
        if (!action || !isAllowed(action)) return;
        const identity = getTapIdentity(actionEl) || action;
        const handledAt = getEventTime(event);
        const pointerType = normalizePointerType(event?.pointerType);
        pointerGuards[identity] = {
            lastPointerHandledAt: handledAt,
            lastPointerType: pointerType,
        };
        pointerGuards.__lastPointer__ = {
            lastPointerHandledAt: handledAt,
            lastPointerType: pointerType,
        };
        consumeEvent(event);
        onAction({ action, actionEl, event, source: 'pointerup' });
    }));

    disposeStack.add(addListener(container, 'click', (event) => {
        if (!isSessionActive()) return;
        const actionEl = getActionElement(event, container);
        if (!actionEl || isDisabledActionElement(actionEl)) return;
        const action = String(actionEl.dataset.action || '').trim();
        if (!action || !isAllowed(action)) return;
        const identity = getTapIdentity(actionEl) || action;
        const guard = pointerGuards[identity];
        const latestGuard = pointerGuards.__lastPointer__;
        const eventTime = getEventTime(event);
        const identitySuppressWindow = POINTER_CLICK_SUPPRESS_MS[normalizePointerType(guard?.lastPointerType)] ?? POINTER_CLICK_SUPPRESS_MS.unknown;
        const identityElapsed = eventTime - (guard?.lastPointerHandledAt ?? -Infinity);
        const latestSuppressWindow = POINTER_CLICK_SUPPRESS_MS[normalizePointerType(latestGuard?.lastPointerType)] ?? POINTER_CLICK_SUPPRESS_MS.unknown;
        const latestElapsed = eventTime - (latestGuard?.lastPointerHandledAt ?? -Infinity);
        if ((identityElapsed >= 0 && identityElapsed <= identitySuppressWindow) || (latestElapsed >= 0 && latestElapsed <= latestSuppressWindow)) {
            consumeEvent(event);
            return;
        }
        consumeEvent(event);
        onAction({ action, actionEl, event, source: 'click' });
    }));

    return { dispose: disposeStack.dispose };
}
