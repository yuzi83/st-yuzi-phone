import { Logger } from '../error-handler.js';
import { resetDataVersion, setCurrentViewingSheet } from '../phone-core/callbacks.js';
import { EventManager } from '../utils.js';
import { bindTemplateDraftPreviewForViewer } from './template-runtime.js';

const logger = Logger.withScope({ scope: 'table-viewer/runtime', feature: 'table-viewer' });
const VIEWER_INSTANCE_CLEANUP_KEY = '__yuziViewerCleanup';
const DRAFT_PREVIEW_CLEANUP_KEY = '__yuziDraftPreviewCleanup';

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
        createMutationObserver: (callback) => new MutationObserver(callback),
        getObserverRoot: () => document.body,
        ...runtimeDeps,
    };

    const viewerEventManager = new EventManager();
    let cleanupObserver = null;
    let viewerDisposed = false;
    let suppressExternalTableUpdate = false;

    const dispose = () => {
        if (viewerDisposed) return;
        viewerDisposed = true;

        viewerEventManager.dispose();
        if (cleanupObserver) {
            try {
                cleanupObserver.disconnect();
            } catch {}
            cleanupObserver = null;
        }

        cleanupViewerModal(
            String(addRowModalId || 'phone-add-row-modal'),
            resolvedRuntimeDeps.getModalById,
        );
        cleanupDraftPreview(container);

        if (host[VIEWER_INSTANCE_CLEANUP_KEY] === dispose) {
            delete host[VIEWER_INSTANCE_CLEANUP_KEY];
        }

        if (typeof resolvedRuntimeDeps.setCurrentViewingSheet === 'function') {
            resolvedRuntimeDeps.setCurrentViewingSheet(null);
        }
    };

    const observeContainerRemoval = () => {
        if (cleanupObserver) {
            return cleanupObserver;
        }

        cleanupObserver = resolvedRuntimeDeps.createMutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.removedNodes) {
                    if (node === container || node.contains?.(container)) {
                        dispose();
                        return;
                    }
                }
            }
        });

        const observerRoot = typeof resolvedRuntimeDeps.getObserverRoot === 'function'
            ? resolvedRuntimeDeps.getObserverRoot()
            : null;
        if (observerRoot && typeof cleanupObserver?.observe === 'function') {
            cleanupObserver.observe(observerRoot, { childList: true, subtree: true });
        }
        return cleanupObserver;
    };

    const bindExternalTableUpdate = (handler) => {
        if (typeof handler !== 'function') {
            return;
        }

        viewerEventManager.add(window, 'yuzi-phone-table-updated', (event) => {
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
            resolvedRuntimeDeps.bindTemplateDraftPreviewForViewer(container, sheetKey, rerenderViewer);
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

    return {
        addRowModalId: String(addRowModalId || 'phone-add-row-modal'),
        viewerEventManager,
        dispose,
        observeContainerRemoval,
        bindExternalTableUpdate,
        bindDraftPreview,
        startViewerSession,
        setSuppressExternalTableUpdate(next) {
            suppressExternalTableUpdate = !!next;
        },
        isSuppressingExternalTableUpdate() {
            return suppressExternalTableUpdate;
        },
    };
}
