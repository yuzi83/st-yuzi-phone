import { Logger } from '../error-handler.js';
import { resetDataVersion, setCurrentViewingSheet } from '../phone-core/callbacks.js';
import { createRuntimeScope } from '../runtime-manager.js';
import { bindTemplateDraftPreviewForViewer } from './template-runtime.js';

const logger = Logger.withScope({ scope: 'table-viewer/runtime', feature: 'table-viewer' });
const VIEWER_INSTANCE_CLEANUP_KEY = '__yuziViewerCleanup';
const VIEWER_RUNTIME_INSTANCE_KEY = '__yuziViewerRuntime';
const DRAFT_PREVIEW_CLEANUP_KEY = '__yuziDraftPreviewCleanup';

export function resolveViewerRuntime(target) {
    let node = target instanceof HTMLElement ? target : null;

    while (node instanceof HTMLElement) {
        const runtime = node[VIEWER_RUNTIME_INSTANCE_KEY];
        if (runtime && typeof runtime === 'object') {
            return runtime;
        }
        node = node.parentElement;
    }

    return null;
}

function cleanupViewerModal(addRowModalId, getModalById = (id) => document.getElementById(id)) {
    const modal = getModalById(addRowModalId);
    const modalAny = /** @type {any} */ (modal);
    if (modalAny && typeof modalAny.__yuziCleanup === 'function') {
        try {
            modalAny.__yuziCleanup();
        } catch (error) {
            logger.warn({
                action: 'modal.cleanup',
                message: '清理新增条目弹窗失败',
                context: { addRowModalId },
                error,
            });
        }
    }
}

function cleanupDraftPreview(container) {
    const host = /** @type {any} */ (container);
    const cleanup = host[DRAFT_PREVIEW_CLEANUP_KEY];
    if (typeof cleanup !== 'function') {
        return;
    }

    try {
        cleanup();
    } catch (error) {
        logger.warn({
            action: 'draft-preview.cleanup',
            message: '清理模板草稿预览失败',
            error,
        });
    }
}

export function createViewerRuntime(options = {}) {
    const {
        container,
        sheetKey,
        addRowModalId = 'phone-add-row-modal',
        rerenderViewer,
        runtimeDeps = {},
    } = options;

    if (!(container instanceof HTMLElement)) {
        return null;
    }

    const host = /** @type {any} */ (container);
    const previousViewerCleanup = host[VIEWER_INSTANCE_CLEANUP_KEY];
    if (typeof previousViewerCleanup === 'function') {
        try {
            previousViewerCleanup();
        } catch (error) {
            logger.warn({
                action: 'instance.cleanup-previous',
                message: '清理旧 viewer 实例失败',
                context: { sheetKey },
                error,
            });
        }
    }

    const resolvedRuntimeDeps = {
        getModalById: (id) => document.getElementById(id),
        setCurrentViewingSheet,
        resetDataVersion,
        bindTemplateDraftPreviewForViewer,
        getObserverRoot: () => document.body,
        ...runtimeDeps,
    };

    const viewerRuntimeScope = createRuntimeScope(`table-viewer:${sheetKey || 'unknown'}`);
    const viewerEventManager = {
        add: (...args) => viewerRuntimeScope.addEventListener(...args),
        remove: () => {},
        registerCleanup: (...args) => viewerRuntimeScope.registerCleanup(...args),
        observeMutation: (...args) => viewerRuntimeScope.observeMutation(...args),
        observeDisconnection: (...args) => viewerRuntimeScope.observeDisconnection(...args),
        dispose: () => viewerRuntimeScope.dispose(),
    };
    let cleanupObserver = null;
    let viewerDisposed = false;
    let suppressExternalTableUpdate = false;
    let runtimeApi = null;

    const dispose = () => {
        if (viewerDisposed) return;
        viewerDisposed = true;

        viewerRuntimeScope.dispose();
        cleanupObserver = null;

        cleanupViewerModal(
            String(addRowModalId || 'phone-add-row-modal'),
            resolvedRuntimeDeps.getModalById,
        );
        cleanupDraftPreview(container);

        if (host[VIEWER_INSTANCE_CLEANUP_KEY] === dispose) {
            delete host[VIEWER_INSTANCE_CLEANUP_KEY];
        }
        if (host[VIEWER_RUNTIME_INSTANCE_KEY] === runtimeApi) {
            delete host[VIEWER_RUNTIME_INSTANCE_KEY];
        }

        if (typeof resolvedRuntimeDeps.setCurrentViewingSheet === 'function') {
            resolvedRuntimeDeps.setCurrentViewingSheet(null);
        }
    };

    const bindContainerRemovalObserver = () => {
        if (viewerDisposed || cleanupObserver) {
            return cleanupObserver;
        }

        const observerRoot = typeof resolvedRuntimeDeps.getObserverRoot === 'function'
            ? resolvedRuntimeDeps.getObserverRoot()
            : null;
        if (!observerRoot) {
            return null;
        }

        cleanupObserver = viewerRuntimeScope.observeDisconnection(container, () => {
            dispose();
        }, {
            observerRoot,
            childList: true,
            subtree: true,
        });

        return cleanupObserver;
    };

    const observeContainerRemoval = () => {
        if (cleanupObserver) {
            return cleanupObserver;
        }

        if (container.isConnected) {
            return bindContainerRemovalObserver();
        }

        const waitForInitialConnection = () => {
            if (viewerDisposed || cleanupObserver) return;
            if (container.isConnected) {
                bindContainerRemovalObserver();
                return;
            }
            viewerRuntimeScope.requestAnimationFrame(waitForInitialConnection);
        };

        viewerRuntimeScope.requestAnimationFrame(waitForInitialConnection);
        return null;
    };

    const bindExternalTableUpdate = (handler) => {
        if (typeof handler !== 'function') {
            return;
        }

        viewerRuntimeScope.addEventListener(window, 'yuzi-phone-table-updated', (event) => {
            if (event?.detail?.sheetKey !== sheetKey) return;
            if (suppressExternalTableUpdate) return;
            handler(event);
        });
    };

    const bindDraftPreview = () => {
        if (typeof rerenderViewer !== 'function') {
            return false;
        }

        if (typeof resolvedRuntimeDeps.bindTemplateDraftPreviewForViewer === 'function') {
            resolvedRuntimeDeps.bindTemplateDraftPreviewForViewer(container, sheetKey, rerenderViewer, runtimeApi);
        }
        return true;
    };

    const startViewerSession = (options = {}) => {
        const {
            setViewingSheet = true,
            resetVersion = true,
            bindDraft = true,
            observeRemoval = true,
        } = options;

        if (setViewingSheet && typeof resolvedRuntimeDeps.setCurrentViewingSheet === 'function') {
            resolvedRuntimeDeps.setCurrentViewingSheet(sheetKey);
        }
        if (resetVersion && typeof resolvedRuntimeDeps.resetDataVersion === 'function') {
            resolvedRuntimeDeps.resetDataVersion();
        }
        if (bindDraft) {
            bindDraftPreview();
        }
        if (observeRemoval) {
            observeContainerRemoval();
        }

        return true;
    };

    host[VIEWER_INSTANCE_CLEANUP_KEY] = dispose;

    runtimeApi = {
        addRowModalId: String(addRowModalId || 'phone-add-row-modal'),
        viewerEventManager,
        dispose,
        observeContainerRemoval,
        bindExternalTableUpdate,
        bindDraftPreview,
        startViewerSession,
        addEventListener(target, type, handler, options) {
            return viewerRuntimeScope.addEventListener(target, type, handler, options);
        },
        registerCleanup(cleanup) {
            return viewerRuntimeScope.registerCleanup(cleanup);
        },
        observeDisconnection(target, callback, options) {
            return viewerRuntimeScope.observeDisconnection(target, callback, options);
        },
        requestAnimationFrame(callback) {
            return viewerRuntimeScope.requestAnimationFrame(callback);
        },
        cancelAnimationFrame(frameId) {
            viewerRuntimeScope.cancelAnimationFrame(frameId);
        },
        setTimeout(callback, delay) {
            return viewerRuntimeScope.setTimeout(callback, delay);
        },
        clearTimeout(timeoutId) {
            viewerRuntimeScope.clearTimeout(timeoutId);
        },
        setSuppressExternalTableUpdate(next) {
            suppressExternalTableUpdate = !!next;
        },
        isSuppressingExternalTableUpdate() {
            return suppressExternalTableUpdate;
        },
        isDisposed() {
            return viewerDisposed || viewerRuntimeScope.isDisposed();
        },
    };
    host[VIEWER_RUNTIME_INSTANCE_KEY] = runtimeApi;

    return runtimeApi;
}
