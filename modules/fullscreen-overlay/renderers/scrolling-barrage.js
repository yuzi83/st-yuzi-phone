import {
    FULLSCREEN_OVERLAY_DEFAULTS,
    SCROLLING_BARRAGE_MODEL_ID,
    normalizeFullscreenOverlaySettings,
    pickOverlayPaletteColor,
} from '../settings.js';

export const SCROLLING_BARRAGE_RENDERER_ID = SCROLLING_BARRAGE_MODEL_ID;

export const DEFAULT_SCROLLING_BARRAGE_RUNTIME_SETTINGS =
    FULLSCREEN_OVERLAY_DEFAULTS.models[SCROLLING_BARRAGE_MODEL_ID];

const MAX_TRACK_COUNT = 6;
// 轨道只约束入口占用；完整动画记录另设固定上限，避免慢速配置无限堆积 DOM。
const MAX_ACTIVE_BARRAGE_COUNT = MAX_TRACK_COUNT * 3;
const SAFE_TOP_PERCENT = 8;
const FULLSCREEN_SAFE_BOTTOM_PERCENT = 92;
const FALLBACK_VIEWPORT_WIDTH_PX = 390;
const TEXT_ENTRY_BUFFER_EM = 2;

export function normalizeScrollingBarrageRuntimeSettings(value = {}) {
    const hasModelEnvelope = Boolean(
        value
        && typeof value === 'object'
        && !Array.isArray(value)
        && value.models,
    );
    const overlaySettings = hasModelEnvelope
        ? normalizeFullscreenOverlaySettings(value)
        : normalizeFullscreenOverlaySettings({
            models: {
                [SCROLLING_BARRAGE_MODEL_ID]: value,
            },
        });
    return overlaySettings.models[SCROLLING_BARRAGE_MODEL_ID];
}

function normalizeItems(batch) {
    const rawItems = Array.isArray(batch?.items) ? batch.items : [];
    return rawItems
        .map((item) => {
            if (item && typeof item === 'object') {
                return {
                    ...item,
                    text: String(item.text ?? '').trim(),
                };
            }
            return { text: String(item ?? '').trim() };
        })
        .filter((item) => item.text);
}

function estimateTextWidthPx(text, fontSizePx) {
    const fontSize = Math.max(1, Number(fontSizePx) || 1);
    const glyphWidth = Array.from(String(text || '')).reduce((total, character) => {
        if (/\s/u.test(character)) return total + (fontSize * 0.35);
        if (/[\u0000-\u00ff]/u.test(character)) return total + (fontSize * 0.62);
        return total + fontSize;
    }, 0);
    return Math.max(fontSize, glyphWidth + (fontSize * TEXT_ENTRY_BUFFER_EM));
}

function readElementWidthOnce(element) {
    if (typeof element?.getBoundingClientRect === 'function') {
        try {
            const width = Number(element.getBoundingClientRect()?.width);
            return Number.isFinite(width) && width > 0 ? width : null;
        } catch {
            return null;
        }
    }
    if (element && 'offsetWidth' in element) {
        const width = Number(element.offsetWidth);
        return Number.isFinite(width) && width > 0 ? width : null;
    }
    if (element && 'scrollWidth' in element) {
        const width = Number(element.scrollWidth);
        return Number.isFinite(width) && width > 0 ? width : null;
    }
    return null;
}

function calculateTrackReleaseDelayMs(elementWidth, settings, documentRef) {
    const viewportWidth = Math.max(
        1,
        Number(
            documentRef?.defaultView?.visualViewport?.width
            ?? documentRef?.defaultView?.innerWidth
            ?? globalThis.innerWidth,
        )
            || FALLBACK_VIEWPORT_WIDTH_PX,
    );
    const travelDistance = viewportWidth + (elementWidth * 1.1);
    return Math.min(
        settings.durationMs,
        Math.max(0, settings.durationMs * (elementWidth / travelDistance)),
    );
}

/**
 * 创建滚动弹幕 renderer。
 *
 * `getSettings()` 必须返回运行时单位：
 * `{ maxConcurrent, intervalMs, durationMs, fontSizePx, opacity, palette }`，
 * 其中 `maxConcurrent` 表示视觉轨道数，不是完整动画生命周期的 DOM 上限。
 *
 * @param {{
 *   layerRuntime: { mount: Function, getElement?: Function },
 *   getSettings: () => object,
 *   documentRef?: Document,
 *   setTimeoutFn?: typeof setTimeout,
 *   clearTimeoutFn?: typeof clearTimeout,
 *   nowFn?: () => number,
 *   random?: () => number,
 *   animationTimeoutPaddingMs?: number,
 *   onError?: (error: unknown, context: object) => void,
 * }} options
 */
export function createScrollingBarrageRenderer(options = {}) {
    const layerRuntime = options.layerRuntime;
    const getSettings = options.getSettings;
    if (!layerRuntime || typeof layerRuntime.mount !== 'function') {
        throw new TypeError('createScrollingBarrageRenderer requires layerRuntime');
    }
    if (typeof getSettings !== 'function') {
        throw new TypeError('createScrollingBarrageRenderer requires getSettings');
    }

    const documentRef = options.documentRef || globalThis.document;
    const setTimeoutFn = options.setTimeoutFn || globalThis.setTimeout;
    const clearTimeoutFn = options.clearTimeoutFn || globalThis.clearTimeout;
    const nowFn = options.nowFn || Date.now;
    const random = options.random || Math.random;
    const onError = typeof options.onError === 'function' ? options.onError : () => {};
    const animationTimeoutPaddingMs = Math.max(
        0,
        Number(options.animationTimeoutPaddingMs ?? 1000) || 0,
    );

    const activeRecords = new Set();
    const trackOwners = new Map();
    const stateWaiters = new Set();
    const managedTimers = new Set();
    let generation = 0;
    let paused = false;
    let disposed = false;
    let trackCursor = 0;
    let lastColor = null;
    let loopController = null;
    let loopBatch = null;

    const getLayer = () => layerRuntime.getElement?.() || layerRuntime.mount();

    const notifyStateChange = () => {
        for (const wake of [...stateWaiters]) {
            stateWaiters.delete(wake);
            wake();
        }
    };

    const createManagedTimeout = (callback, delay, onCancel = () => {}) => {
        const timer = {
            id: null,
            remainingMs: Math.max(0, Number(delay) || 0),
            startedAt: null,
            settled: false,
            schedule: null,
            pause: null,
            cancel: null,
        };

        const settleCancel = () => {
            if (timer.settled) return;
            timer.settled = true;
            managedTimers.delete(timer);
            onCancel();
        };

        timer.schedule = () => {
            if (timer.settled || disposed || paused) return;
            timer.startedAt = nowFn();
            timer.id = setTimeoutFn(() => {
                timer.id = null;
                if (timer.settled) return;
                timer.settled = true;
                managedTimers.delete(timer);
                callback();
            }, timer.remainingMs);
        };

        timer.pause = () => {
            if (timer.settled || timer.id === null) return;
            clearTimeoutFn(timer.id);
            timer.id = null;
            const elapsed = Math.max(0, nowFn() - timer.startedAt);
            timer.remainingMs = Math.max(0, timer.remainingMs - elapsed);
        };

        timer.cancel = () => {
            if (timer.settled) return;
            if (timer.id !== null) {
                clearTimeoutFn(timer.id);
                timer.id = null;
            }
            settleCancel();
        };

        managedTimers.add(timer);
        timer.schedule();
        return timer;
    };

    const cancelAllTimers = () => {
        for (const timer of [...managedTimers]) {
            timer.cancel();
        }
    };

    const waitForStateChange = (signal) => {
        if (disposed || signal?.aborted) return Promise.resolve(false);
        return new Promise((resolve) => {
            let settled = false;
            const finish = (result) => {
                if (settled) return;
                settled = true;
                stateWaiters.delete(wake);
                signal?.removeEventListener?.('abort', handleAbort);
                resolve(result);
            };
            const wake = () => finish(true);
            const handleAbort = () => finish(false);
            stateWaiters.add(wake);
            signal?.addEventListener?.('abort', handleAbort, { once: true });
        });
    };

    const waitForDelay = (delay, signal) => {
        if (disposed || signal?.aborted) return Promise.resolve(false);
        return new Promise((resolve) => {
            let settled = false;
            let timer = null;
            const finish = (result) => {
                if (settled) return;
                settled = true;
                signal?.removeEventListener?.('abort', handleAbort);
                resolve(result);
            };
            const handleAbort = () => {
                timer?.cancel();
                finish(false);
            };
            signal?.addEventListener?.('abort', handleAbort, { once: true });
            timer = createManagedTimeout(
                () => finish(!disposed && !signal?.aborted),
                delay,
                () => finish(false),
            );
        });
    };

    const readRawSettings = () => {
        try {
            return getSettings();
        } catch (error) {
            onError(error, { phase: 'read-settings' });
            return {};
        }
    };

    const readSettings = () => {
        try {
            return normalizeScrollingBarrageRuntimeSettings(readRawSettings());
        } catch (error) {
            onError(error, { phase: 'normalize-settings' });
            return normalizeScrollingBarrageRuntimeSettings();
        }
    };

    const isLoopEligible = (batch) => {
        const rawSettings = readRawSettings();
        if (readSettings().eternalEnabled !== true) return false;
        const sourceEnabledBySheetKey = rawSettings?.sourceEnabledBySheetKey;
        if (!batch?.sheetKey
            || !sourceEnabledBySheetKey
            || typeof sourceEnabledBySheetKey !== 'object'
            || Array.isArray(sourceEnabledBySheetKey)) {
            return true;
        }
        return sourceEnabledBySheetKey[batch.sheetKey] === true;
    };

    const getEnabledTrackSlots = (settings) => {
        const count = Math.min(
            MAX_TRACK_COUNT,
            Math.max(1, Number(settings.maxConcurrent) || 1),
        );
        if (count === 1) return [0];
        return Array.from(
            { length: count },
            (_, index) => Math.round((index * (MAX_TRACK_COUNT - 1)) / (count - 1)),
        );
    };

    const hasAvailableTrack = (trackSlots) => (
        trackSlots.some(trackSlot => !trackOwners.has(trackSlot))
    );

    const waitForEmissionOpportunity = async (signal, playGeneration) => {
        while (!disposed && generation === playGeneration && !signal?.aborted) {
            const settings = readSettings();
            const trackSlots = getEnabledTrackSlots(settings);
            if (
                !paused
                && activeRecords.size < MAX_ACTIVE_BARRAGE_COUNT
                && hasAvailableTrack(trackSlots)
            ) {
                return settings;
            }
            const shouldContinue = await waitForStateChange(signal);
            if (!shouldContinue) return null;
        }
        return null;
    };

    const waitForTrackHandoff = async (record, signal, playGeneration) => {
        while (
            record
            && !record.trackReleased
            && !disposed
            && generation === playGeneration
            && !signal?.aborted
        ) {
            const shouldContinue = await waitForStateChange(signal);
            if (!shouldContinue) return false;
        }
        return Boolean(record?.trackReleased);
    };

    const chooseColor = (palette) => {
        const color = pickOverlayPaletteColor(palette, lastColor, random);
        lastColor = color;
        return color;
    };

    const acquireTrack = (trackSlots) => {
        trackCursor %= trackSlots.length;
        for (let offset = 0; offset < trackSlots.length; offset += 1) {
            const slotIndex = (trackCursor + offset) % trackSlots.length;
            const trackSlot = trackSlots[slotIndex];
            if (trackOwners.has(trackSlot)) continue;
            trackCursor = (slotIndex + 1) % trackSlots.length;
            return trackSlot;
        }
        return null;
    };

    const trackTopPercent = (trackSlot, settings) => {
        const progress = trackSlot / (MAX_TRACK_COUNT - 1);
        const bottomPercent = settings.areaPercent === 100
            ? FULLSCREEN_SAFE_BOTTOM_PERCENT
            : settings.areaPercent;
        return SAFE_TOP_PERCENT + ((bottomPercent - SAFE_TOP_PERCENT) * progress);
    };

    const emit = (item, batch, settings) => {
        const layer = getLayer();
        if (!layer || typeof documentRef?.createElement !== 'function') return null;
        const trackSlots = getEnabledTrackSlots(settings);
        const track = acquireTrack(trackSlots);
        if (track === null) return null;

        const element = documentRef.createElement('div');
        element.className = 'yuzi-phone-fullscreen-overlay-barrage';
        element.textContent = item.text;
        element.dataset.yuziPhoneOverlaySource = String(batch.sourceId || '');
        element.style.setProperty(
            '--yuzi-phone-fullscreen-overlay-duration',
            `${settings.durationMs}ms`,
        );
        element.style.setProperty(
            '--yuzi-phone-fullscreen-overlay-font-size',
            `${settings.fontSizePx}px`,
        );
        element.style.setProperty(
            '--yuzi-phone-fullscreen-overlay-opacity',
            String(settings.opacity),
        );
        element.style.setProperty(
            '--yuzi-phone-fullscreen-overlay-color',
            chooseColor(settings.palette),
        );
        element.style.setProperty(
            '--yuzi-phone-fullscreen-overlay-track-top',
            `${trackTopPercent(track, settings)}%`,
        );

        const record = {
            element,
            track,
            entryTimer: null,
            fallbackTimer: null,
            finished: false,
            trackReleased: false,
            releaseTrack: null,
            finish: null,
        };
        record.releaseTrack = () => {
            if (record.trackReleased) return;
            record.trackReleased = true;
            if (trackOwners.get(track) === record) {
                trackOwners.delete(track);
            }
            notifyStateChange();
        };
        const handleAnimationEnd = (event) => {
            if (event?.target && event.target !== element) return;
            record.finish();
        };
        record.finish = () => {
            if (record.finished) return;
            record.finished = true;
            element.removeEventListener?.('animationend', handleAnimationEnd);
            record.entryTimer?.cancel();
            record.fallbackTimer?.cancel();
            element.remove?.();
            activeRecords.delete(record);
            record.releaseTrack();
            notifyStateChange();
        };

        element.addEventListener?.('animationend', handleAnimationEnd);
        layer.appendChild(element);
        // 只在 append 后读取一次实际宽度；无测量能力时才退回纯文本估算。
        const elementWidth = readElementWidthOnce(element)
            ?? estimateTextWidthPx(item.text, settings.fontSizePx);
        activeRecords.add(record);
        trackOwners.set(track, record);
        record.entryTimer = createManagedTimeout(
            record.releaseTrack,
            calculateTrackReleaseDelayMs(elementWidth, settings, documentRef),
        );
        record.fallbackTimer = createManagedTimeout(
            record.finish,
            settings.durationMs + animationTimeoutPaddingMs,
        );
        return record;
    };

    const playBatch = async (batch, signal) => {
        if (disposed) {
            return { status: 'disposed', emittedCount: 0, completed: false };
        }
        const items = normalizeItems(batch);
        const playGeneration = generation;
        const batchRecords = [];
        let emittedCount = 0;

        for (let index = 0; index < items.length; index += 1) {
            const settings = await waitForEmissionOpportunity(signal, playGeneration);
            if (!settings) break;
            const record = emit(items[index], batch, settings);
            if (!record) break;
            batchRecords.push(record);
            emittedCount += 1;

            if (index < items.length - 1) {
                const intervalCompleted = await waitForDelay(settings.intervalMs, signal);
                if (!intervalCompleted) break;
            }
        }

        await waitForTrackHandoff(
            batchRecords[batchRecords.length - 1],
            signal,
            playGeneration,
        );

        let status = 'completed';
        if (disposed) {
            status = 'disposed';
        } else if (generation !== playGeneration) {
            status = 'cleared';
        } else if (signal?.aborted) {
            status = 'replaced';
        }
        return {
            status,
            emittedCount,
            completed: status === 'completed' && emittedCount === items.length,
        };
    };

    const stopLoop = () => {
        const controller = loopController;
        loopController = null;
        loopBatch = null;
        if (!controller) return false;
        controller.abort('loop-stopped');
        return true;
    };

    const startLoop = (batch) => {
        if (!isLoopEligible(batch)) return false;
        const controller = new AbortController();
        loopController = controller;
        loopBatch = batch;
        void (async () => {
            while (
                !disposed
                && loopController === controller
                && !controller.signal.aborted
                && isLoopEligible(batch)
            ) {
                const result = await playBatch(batch, controller.signal);
                if (!result.completed) return;
            }
        })().catch((error) => {
            onError(error, { phase: 'eternal-loop' });
        }).finally(() => {
            if (loopController === controller) {
                loopController = null;
                loopBatch = null;
            }
        });
        return true;
    };

    const play = async (batch, context = {}) => {
        stopLoop();
        const result = await playBatch(batch, context.signal);
        if (result.completed && isLoopEligible(batch)) {
            startLoop(batch);
        }
        return {
            status: result.status,
            emittedCount: result.emittedCount,
        };
    };

    const clearActive = () => {
        for (const record of [...activeRecords]) {
            record.finish();
        }
    };

    const clear = () => {
        if (disposed) return;
        stopLoop();
        generation += 1;
        cancelAllTimers();
        clearActive();
        notifyStateChange();
    };

    const pause = () => {
        if (disposed || paused) return;
        paused = true;
        getLayer()?.setAttribute?.('data-yuzi-phone-overlay-paused', 'true');
        for (const timer of [...managedTimers]) {
            timer.pause();
        }
    };

    const resume = () => {
        if (disposed || !paused) return;
        paused = false;
        getLayer()?.removeAttribute?.('data-yuzi-phone-overlay-paused');
        for (const timer of [...managedTimers]) {
            timer.schedule();
        }
        notifyStateChange();
    };

    const refreshSettings = () => {
        if (disposed) return;
        if (loopBatch && !isLoopEligible(loopBatch)) {
            stopLoop();
        }
        notifyStateChange();
    };

    const dispose = () => {
        if (disposed) return;
        stopLoop();
        disposed = true;
        generation += 1;
        cancelAllTimers();
        clearActive();
        notifyStateChange();
        lastColor = null;
    };

    return {
        id: SCROLLING_BARRAGE_RENDERER_ID,
        play,
        stopLoop,
        clear,
        pause,
        resume,
        refreshSettings,
        dispose,
        getActiveCount: () => activeRecords.size,
        isPaused: () => paused,
        isDisposed: () => disposed,
    };
}
