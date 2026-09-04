const DEFAULT_SOURCE_GAP_MS = 100;

function isFunction(value) {
    return typeof value === 'function';
}

function normalizeBatches(sourceBatches) {
    if (!Array.isArray(sourceBatches)) return [];
    return sourceBatches
        .filter((batch) => batch && typeof batch === 'object')
        .map((batch) => ({
            ...batch,
            sourceId: String(batch.sourceId || ''),
            rendererId: String(batch.rendererId || ''),
            items: Array.isArray(batch.items) ? [...batch.items] : [],
        }))
        .filter((batch) => batch.sourceId && batch.rendererId && batch.items.length > 0);
}

function safeInvoke(callback, onError, context) {
    if (!isFunction(callback)) return;
    try {
        callback();
    } catch (error) {
        onError(error, context);
    }
}

/**
 * 按来源顺序调度批次。renderer.play resolve 表示当前来源已完成交接，
 * 已发出的视觉元素可在 renderer 内继续动画与清理，不阻塞下一来源。
 * renderer 的最小协议为：
 * `play(batch, { signal, waitUntilResumed }) => Promise`。
 *
 * @param {{
 *   resolveRenderer: (rendererId: string, batch: object) => object | null,
 *   documentRef?: Document,
 *   sourceGapMs?: number,
 *   setTimeoutFn?: typeof setTimeout,
 *   clearTimeoutFn?: typeof clearTimeout,
 *   onError?: (error: unknown, context: object) => void,
 *   onBatchFailure?: (error: unknown, batch: object, context: object) => void,
 * }} options
 */
export function createFullscreenOverlayScheduler(options = {}) {
    const resolveRenderer = options.resolveRenderer;
    if (!isFunction(resolveRenderer)) {
        throw new TypeError('createFullscreenOverlayScheduler requires resolveRenderer');
    }

    const documentRef = options.documentRef || globalThis.document;
    const setTimeoutFn = options.setTimeoutFn || globalThis.setTimeout;
    const clearTimeoutFn = options.clearTimeoutFn || globalThis.clearTimeout;
    const sourceGapMs = Math.max(0, Number(options.sourceGapMs ?? DEFAULT_SOURCE_GAP_MS) || 0);
    const onError = isFunction(options.onError) ? options.onError : () => {};
    const onBatchFailure = isFunction(options.onBatchFailure)
        ? options.onBatchFailure
        : null;

    const pauseReasons = new Set();
    const resumeWaiters = new Set();
    const knownRenderers = new Set();
    let pendingBatches = [];
    let currentController = null;
    let currentRenderer = null;
    let currentSourceId = null;
    let gapTimer = null;
    let pumpPromise = null;
    let disposed = false;

    if (documentRef?.hidden) {
        pauseReasons.add('document');
    }

    const isPaused = () => pauseReasons.size > 0;

    const notifyBatchFailure = (error, batch, context) => {
        if (!onBatchFailure) return;
        try {
            const result = onBatchFailure(error, batch, context);
            Promise.resolve(result).catch((callbackError) => {
                onError(callbackError, {
                    phase: 'batch-failure-callback',
                    rendererId: batch?.rendererId,
                    sourceId: batch?.sourceId,
                });
            });
        } catch (callbackError) {
            onError(callbackError, {
                phase: 'batch-failure-callback',
                rendererId: batch?.rendererId,
                sourceId: batch?.sourceId,
            });
        }
    };

    const notifyRenderers = (methodName) => {
        for (const renderer of knownRenderers) {
            safeInvoke(
                isFunction(renderer?.[methodName]) ? () => renderer[methodName]() : null,
                onError,
                { phase: methodName },
            );
        }
    };

    const settleResumeWaiters = (result) => {
        for (const resolve of [...resumeWaiters]) {
            resumeWaiters.delete(resolve);
            resolve(result);
        }
    };

    const releaseResumeWaiters = () => {
        if (isPaused() || disposed) return;
        settleResumeWaiters(true);
    };

    const waitUntilResumed = () => {
        if (disposed) return Promise.resolve(false);
        if (!isPaused()) return Promise.resolve(true);
        return new Promise((resolve) => {
            resumeWaiters.add(resolve);
        });
    };

    const setPauseReason = (reason, shouldPause) => {
        if (disposed) return;
        const wasPaused = isPaused();
        if (shouldPause) {
            pauseReasons.add(reason);
        } else {
            pauseReasons.delete(reason);
        }
        const nowPaused = isPaused();
        if (!wasPaused && nowPaused) {
            notifyRenderers('pause');
        } else if (wasPaused && !nowPaused) {
            notifyRenderers('resume');
            releaseResumeWaiters();
        }
    };

    const cancelGap = () => {
        if (!gapTimer) return;
        clearTimeoutFn(gapTimer.id);
        const resolve = gapTimer.resolve;
        gapTimer = null;
        resolve(false);
    };

    const waitForGap = () => {
        if (disposed || sourceGapMs <= 0) return Promise.resolve(!disposed);
        return new Promise((resolve) => {
            const id = setTimeoutFn(() => {
                if (gapTimer?.id === id) {
                    gapTimer = null;
                }
                resolve(!disposed);
            }, sourceGapMs);
            gapTimer = { id, resolve };
        });
    };

    const runPump = async () => {
        while (!disposed) {
            const canContinue = await waitUntilResumed();
            if (!canContinue || disposed) return;

            const batch = pendingBatches.shift();
            if (!batch) return;

            let renderer = null;
            try {
                renderer = resolveRenderer(batch.rendererId, batch);
            } catch (error) {
                const context = {
                    phase: 'resolve-renderer',
                    rendererId: batch.rendererId,
                    sourceId: batch.sourceId,
                };
                onError(error, context);
                notifyBatchFailure(error, batch, context);
                continue;
            }

            if (!renderer || !isFunction(renderer.play)) {
                const error = new Error(`未找到可用的浮层 renderer: ${batch.rendererId}`);
                const context = {
                    phase: 'missing-renderer',
                    rendererId: batch.rendererId,
                    sourceId: batch.sourceId,
                };
                onError(error, context);
                notifyBatchFailure(error, batch, context);
                continue;
            }

            knownRenderers.add(renderer);
            currentRenderer = renderer;
            currentSourceId = batch.sourceId;
            const controller = new AbortController();
            currentController = controller;

            try {
                await renderer.play(batch, {
                    signal: controller.signal,
                    waitUntilResumed,
                });
            } catch (error) {
                if (!controller.signal.aborted) {
                    const context = {
                        phase: 'play',
                        rendererId: batch.rendererId,
                        sourceId: batch.sourceId,
                    };
                    onError(error, context);
                    notifyBatchFailure(error, batch, context);
                }
            } finally {
                if (currentController === controller) {
                    currentController = null;
                }
                currentRenderer = null;
                currentSourceId = null;
            }

            if (disposed || pendingBatches.length === 0) return;
            const gapCompleted = await waitForGap();
            if (!gapCompleted || disposed) return;
        }
    };

    const ensurePump = () => {
        if (disposed || pumpPromise || pendingBatches.length === 0) return;
        pumpPromise = runPump().finally(() => {
            pumpPromise = null;
            if (!disposed && pendingBatches.length > 0) {
                ensurePump();
            }
        });
    };

    const replace = (sourceBatches) => {
        if (disposed) return false;
        pendingBatches = normalizeBatches(sourceBatches);
        currentController?.abort('replace');
        ensurePump();
        return true;
    };

    const append = (sourceBatches) => {
        if (disposed) return false;
        pendingBatches.push(...normalizeBatches(sourceBatches));
        ensurePump();
        return true;
    };

    const clear = () => {
        if (disposed) return;
        pendingBatches = [];
        currentController?.abort('clear');
        cancelGap();
        notifyRenderers('clear');
        settleResumeWaiters(true);
    };

    const pause = () => setPauseReason('manual', true);
    const resume = () => setPauseReason('manual', false);

    const handleVisibilityChange = () => {
        setPauseReason('document', Boolean(documentRef?.hidden));
    };
    documentRef?.addEventListener?.('visibilitychange', handleVisibilityChange);

    const whenIdle = async () => {
        while (pumpPromise) {
            const activePump = pumpPromise;
            await activePump;
        }
    };

    const dispose = () => {
        if (disposed) return;
        disposed = true;
        pendingBatches = [];
        currentController?.abort('dispose');
        cancelGap();
        pauseReasons.clear();
        settleResumeWaiters(false);
        documentRef?.removeEventListener?.('visibilitychange', handleVisibilityChange);
        notifyRenderers('clear');
        notifyRenderers('dispose');
        knownRenderers.clear();
        currentController = null;
        currentRenderer = null;
        currentSourceId = null;
    };

    return {
        replace,
        append,
        clear,
        pause,
        resume,
        whenIdle,
        dispose,
        isPaused,
        isDisposed: () => disposed,
        getState: () => ({
            disposed,
            paused: isPaused(),
            pendingSourceCount: pendingBatches.length,
            currentSourceId,
            currentRenderer,
        }),
    };
}
