import {
    FULLSCREEN_OVERLAY_DEFAULTS,
    TABLE_POPUP_MODEL_ID,
    normalizeFullscreenOverlaySettings,
} from '../settings.js';

export const TABLE_POPUP_RENDERER_ID = TABLE_POPUP_MODEL_ID;
export const DEFAULT_TABLE_POPUP_RUNTIME_SETTINGS =
    FULLSCREEN_OVERLAY_DEFAULTS.models[TABLE_POPUP_MODEL_ID];

const SAFE_MARGIN_PX = 12;
const SAFE_TOP_PERCENT = 8;
const FULLSCREEN_SAFE_BOTTOM_PERCENT = 92;
const POSITION_ATTEMPTS = 8;
const ENTRY_HANDOFF_MS = 180;
const SIZE_SCALES = Object.freeze({
    compact: 0.86,
    normal: 1,
    large: 1.16,
});

export function normalizeTablePopupRuntimeSettings(value = {}) {
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
                [TABLE_POPUP_MODEL_ID]: value,
            },
        });
    return overlaySettings.models[TABLE_POPUP_MODEL_ID];
}

function normalizeItems(batch) {
    return (Array.isArray(batch?.items) ? batch.items : [])
        .map((item) => {
            const source = item && typeof item === 'object' ? item : {};
            return {
                ...source,
                kind: String(source.kind || '').trim(),
                senderName: String(source.senderName || '').trim(),
                avatarAssetId: String(source.avatarAssetId || '').trim(),
                text: String(source.text || '').trim(),
                cells: (Array.isArray(source.cells) ? source.cells : [])
                    .map((cell, index) => ({
                        label: String(cell?.label ?? '').trim() || `字段 ${index + 1}`,
                        value: String(cell?.value ?? ''),
                    })),
            };
        })
        .filter(item => (
            item.kind === 'message-notification'
                ? Boolean(item.text)
                : item.cells.length > 0
        ));
}

function toUnitRandom(random) {
    const value = Number(random());
    return Number.isFinite(value)
        ? Math.max(0, Math.min(1 - Number.EPSILON, value))
        : 0;
}

function hexToRgba(hex, opacity) {
    const value = String(hex || '#FFFFFF').replace('#', '');
    const red = Number.parseInt(value.slice(0, 2), 16);
    const green = Number.parseInt(value.slice(2, 4), 16);
    const blue = Number.parseInt(value.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

function pickTextColor(hex) {
    const value = String(hex || '#FFFFFF').replace('#', '');
    const red = Number.parseInt(value.slice(0, 2), 16);
    const green = Number.parseInt(value.slice(2, 4), 16);
    const blue = Number.parseInt(value.slice(4, 6), 16);
    return ((red * 299) + (green * 587) + (blue * 114)) / 1000 >= 150
        ? '#1F1F1F'
        : '#FFFFFF';
}

function overlaps(left, right) {
    return !(
        left.right <= right.left
        || left.left >= right.right
        || left.bottom <= right.top
        || left.top >= right.bottom
    );
}

export function createTablePopupRenderer(options = {}) {
    const layerRuntime = options.layerRuntime;
    const getSettings = options.getSettings;
    if (!layerRuntime || typeof layerRuntime.mount !== 'function') {
        throw new TypeError('createTablePopupRenderer requires layerRuntime');
    }
    if (typeof getSettings !== 'function') {
        throw new TypeError('createTablePopupRenderer requires getSettings');
    }

    const documentRef = options.documentRef || globalThis.document;
    const setTimeoutFn = options.setTimeoutFn || globalThis.setTimeout;
    const clearTimeoutFn = options.clearTimeoutFn || globalThis.clearTimeout;
    const nowFn = options.nowFn || Date.now;
    const random = options.random || Math.random;
    const acquireMediaRender = typeof options.acquireMediaRender === 'function'
        ? options.acquireMediaRender
        : null;
    const onError = typeof options.onError === 'function' ? options.onError : () => {};
    const activeRecords = new Set();
    const managedTimers = new Set();
    const stateWaiters = new Set();
    let generation = 0;
    let paused = false;
    let disposed = false;

    const getLayer = () => layerRuntime.getElement?.() || layerRuntime.mount();

    const notifyStateChange = () => {
        for (const resolve of [...stateWaiters]) {
            stateWaiters.delete(resolve);
            resolve(true);
        }
    };

    const createManagedTimer = (callback, delayMs, onCancel = null) => {
        const timer = {
            id: null,
            remainingMs: Math.max(0, Number(delayMs) || 0),
            startedAt: 0,
            cancelled: false,
            schedule() {
                if (timer.cancelled || paused || disposed || timer.id !== null) return;
                timer.startedAt = nowFn();
                timer.id = setTimeoutFn(() => {
                    timer.id = null;
                    managedTimers.delete(timer);
                    if (!timer.cancelled) callback();
                }, timer.remainingMs);
            },
            pause() {
                if (timer.id === null) return;
                clearTimeoutFn(timer.id);
                timer.id = null;
                timer.remainingMs = Math.max(0, timer.remainingMs - (nowFn() - timer.startedAt));
            },
            cancel() {
                if (timer.cancelled) return;
                timer.cancelled = true;
                if (timer.id !== null) clearTimeoutFn(timer.id);
                timer.id = null;
                managedTimers.delete(timer);
                onCancel?.();
            },
        };
        managedTimers.add(timer);
        timer.schedule();
        return timer;
    };

    const waitForDelay = (delayMs, signal, playGeneration) => new Promise((resolve) => {
        if (disposed || generation !== playGeneration || signal?.aborted) {
            resolve(false);
            return;
        }
        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            signal?.removeEventListener?.('abort', abort);
            resolve(value);
        };
        const abort = () => {
            timer.cancel();
            finish(false);
        };
        const timer = createManagedTimer(
            () => finish(true),
            delayMs,
            () => finish(false),
        );
        signal?.addEventListener?.('abort', abort, { once: true });
    });

    const waitForStateChange = (signal, playGeneration) => new Promise((resolve) => {
        if (disposed || generation !== playGeneration || signal?.aborted) {
            resolve(false);
            return;
        }
        const finish = (value) => {
            stateWaiters.delete(wake);
            signal?.removeEventListener?.('abort', abort);
            resolve(value);
        };
        const wake = () => finish(true);
        const abort = () => finish(false);
        stateWaiters.add(wake);
        signal?.addEventListener?.('abort', abort, { once: true });
    });

    const readViewport = () => {
        const view = documentRef?.defaultView || globalThis;
        return {
            width: Math.max(1, Number(view?.visualViewport?.width ?? view?.innerWidth) || 390),
            height: Math.max(1, Number(view?.visualViewport?.height ?? view?.innerHeight) || 844),
        };
    };

    const applyCardStyle = (element, settings, viewport) => {
        const sizeScale = SIZE_SCALES[settings.sizePreset] || 1;
        const baseWidth = Math.min(viewport.width * 0.88, 560) * sizeScale;
        element.style.setProperty('--yuzi-phone-fullscreen-overlay-popup-width', `${baseWidth}px`);
        element.style.setProperty(
            '--yuzi-phone-fullscreen-overlay-popup-columns',
            String(settings.columnCount),
        );
        element.style.setProperty(
            '--yuzi-phone-fullscreen-overlay-popup-radius',
            `${settings.borderRadiusPx * sizeScale}px`,
        );
        element.style.setProperty(
            '--yuzi-phone-fullscreen-overlay-popup-background',
            hexToRgba(settings.backgroundColor, settings.opacity),
        );
        element.style.setProperty(
            '--yuzi-phone-fullscreen-overlay-popup-color',
            pickTextColor(settings.backgroundColor),
        );
        element.style.setProperty(
            '--yuzi-phone-fullscreen-overlay-popup-label-size',
            `${11 * sizeScale}px`,
        );
        element.style.setProperty(
            '--yuzi-phone-fullscreen-overlay-popup-value-size',
            `${14 * sizeScale}px`,
        );
        element.style.setProperty(
            '--yuzi-phone-fullscreen-overlay-popup-padding',
            `${14 * sizeScale}px`,
        );
        element.style.setProperty(
            '--yuzi-phone-fullscreen-overlay-popup-gap',
            `${8 * sizeScale}px`,
        );
        element.style.setProperty(
            '--yuzi-phone-fullscreen-overlay-notification-avatar-size',
            `${48 * sizeScale}px`,
        );
        element.style.setProperty(
            '--yuzi-phone-fullscreen-overlay-notification-font-size',
            `${15 * sizeScale}px`,
        );
        element.style.setProperty(
            '--yuzi-phone-fullscreen-overlay-popup-duration',
            `${settings.durationMs}ms`,
        );
        element.style.setProperty(
            '--yuzi-phone-fullscreen-overlay-popup-transform-origin',
            settings.placementMode === 'center' ? 'center center' : 'top left',
        );
    };

    const createCard = (item, settings, viewport) => {
        const element = documentRef.createElement('div');
        element.className = 'yuzi-phone-fullscreen-overlay-table-popup';
        applyCardStyle(element, settings, viewport);
        if (item.kind === 'message-notification') {
            const sizeScale = SIZE_SCALES[settings.sizePreset] || 1;
            element.className += ' yuzi-phone-fullscreen-overlay-message-notification';
            element.style.setProperty(
                '--yuzi-phone-fullscreen-overlay-popup-width',
                `${Math.min(viewport.width * 0.88, 460) * sizeScale}px`,
            );
            const avatar = documentRef.createElement('span');
            avatar.className = 'yuzi-phone-fullscreen-overlay-message-notification-avatar';
            avatar.textContent = Array.from(item.senderName)[0] || 'Q';
            const text = documentRef.createElement('span');
            text.className = 'yuzi-phone-fullscreen-overlay-message-notification-text';
            text.textContent = item.text;
            element.appendChild(avatar);
            element.appendChild(text);
            return { element, avatar };
        }
        item.cells.forEach((cell) => {
            const field = documentRef.createElement('div');
            field.className = 'yuzi-phone-fullscreen-overlay-table-popup-cell';
            const label = documentRef.createElement('span');
            label.className = 'yuzi-phone-fullscreen-overlay-table-popup-label';
            label.textContent = cell.label;
            const value = documentRef.createElement('span');
            value.className = 'yuzi-phone-fullscreen-overlay-table-popup-value';
            value.textContent = cell.value === '' ? '—' : cell.value;
            field.appendChild(label);
            field.appendChild(value);
            element.appendChild(field);
        });
        return { element, avatar: null };
    };

    const findPlacement = (width, height, settings, viewport) => {
        const safeWidth = Math.max(1, viewport.width - (SAFE_MARGIN_PX * 2));
        const safeHeight = Math.max(1, viewport.height - (SAFE_MARGIN_PX * 2));
        const fitScale = Math.min(1, safeWidth / width, safeHeight / height);
        const renderedWidth = width * fitScale;
        const renderedHeight = height * fitScale;
        const maxLeft = Math.max(SAFE_MARGIN_PX, viewport.width - renderedWidth - SAFE_MARGIN_PX);
        const safeTop = Math.max(SAFE_MARGIN_PX, viewport.height * (SAFE_TOP_PERCENT / 100));
        const screenMaxTop = Math.max(safeTop, viewport.height - renderedHeight - SAFE_MARGIN_PX);
        const areaBottomPercent = settings.areaPercent === 100
            ? FULLSCREEN_SAFE_BOTTOM_PERCENT
            : settings.areaPercent;
        const areaBottom = viewport.height * (areaBottomPercent / 100);
        const fitsArea = renderedHeight <= Math.max(1, areaBottom - safeTop);
        const maxTop = fitsArea
            ? Math.max(safeTop, Math.min(screenMaxTop, areaBottom - renderedHeight))
            : Math.max(safeTop, Math.min(screenMaxTop, areaBottom - SAFE_MARGIN_PX));

        if (settings.placementMode === 'center') {
            const left = Math.max(
                SAFE_MARGIN_PX,
                Math.min(maxLeft, (viewport.width - renderedWidth) / 2),
            );
            const top = settings.areaPercent === 25
                ? SAFE_MARGIN_PX
                : Math.max(
                    safeTop,
                    Math.min(
                        screenMaxTop,
                        safeTop + ((areaBottom - safeTop - renderedHeight) / 2),
                    ),
                );
            return {
                left,
                top,
                fitScale,
                rect: {
                    left,
                    top,
                    right: left + renderedWidth,
                    bottom: top + renderedHeight,
                },
            };
        }

        for (let attempt = 0; attempt < POSITION_ATTEMPTS; attempt += 1) {
            const left = SAFE_MARGIN_PX + ((maxLeft - SAFE_MARGIN_PX) * toUnitRandom(random));
            const top = safeTop + ((maxTop - safeTop) * toUnitRandom(random));
            const rect = {
                left,
                top,
                right: left + renderedWidth,
                bottom: top + renderedHeight,
            };
            if ([...activeRecords].every(record => !overlaps(rect, record.rect))) {
                return { left, top, fitScale, rect };
            }
        }
        return null;
    };

    const tryEmit = (item, batch, settings) => {
        if (activeRecords.size >= settings.maxConcurrent) return null;
        const layer = getLayer();
        if (!layer) return null;
        const viewport = readViewport();
        const card = createCard(item, settings, viewport);
        const element = card.element;
        layer.appendChild(element);
        const measured = element.getBoundingClientRect?.() || {};
        const width = Math.max(1, Number(measured.width) || Math.min(viewport.width * 0.88, 560));
        const height = Math.max(1, Number(measured.height) || 120);
        const placement = findPlacement(width, height, settings, viewport);
        if (!placement) {
            element.remove();
            return null;
        }

        element.style.setProperty(
            '--yuzi-phone-fullscreen-overlay-popup-left',
            `${placement.left}px`,
        );
        element.style.setProperty(
            '--yuzi-phone-fullscreen-overlay-popup-top',
            `${placement.top}px`,
        );
        element.style.setProperty(
            '--yuzi-phone-fullscreen-overlay-popup-fit-scale',
            String(placement.fitScale),
        );
        element.style.setProperty(
            '--yuzi-phone-fullscreen-overlay-popup-enter-scale',
            String(placement.fitScale * 0.96),
        );
        element.style.setProperty(
            '--yuzi-phone-fullscreen-overlay-popup-exit-scale',
            String(placement.fitScale * 0.98),
        );
        element.setAttribute?.('data-source-id', String(batch?.sourceId || ''));
        element.setAttribute?.('data-sheet-key', String(batch?.sheetKey || ''));

        const record = {
            element,
            rect: placement.rect,
            timer: null,
            releaseMedia: null,
            finished: false,
            finish() {
                if (record.finished) return;
                record.finished = true;
                record.timer?.cancel();
                if (record.releaseMedia) {
                    try {
                        Promise.resolve(record.releaseMedia()).catch(() => {});
                    } catch {}
                    record.releaseMedia = null;
                }
                element.removeEventListener?.('animationend', record.finish);
                element.remove();
                activeRecords.delete(record);
                notifyStateChange();
            },
        };
        activeRecords.add(record);
        element.addEventListener?.('animationend', record.finish);
        record.timer = createManagedTimer(record.finish, settings.durationMs);
        if (card.avatar && item.avatarAssetId && acquireMediaRender) {
            Promise.resolve(acquireMediaRender(item.avatarAssetId)).then((render) => {
                if (!render?.url) return;
                const release = typeof render.release === 'function' ? render.release : null;
                if (record.finished) {
                    try {
                        Promise.resolve(release?.()).catch(() => {});
                    } catch {}
                    return;
                }
                record.releaseMedia = release;
                const image = documentRef.createElement('img');
                image.alt = '';
                image.src = render.url;
                card.avatar.replaceChildren?.(image);
            }).catch((error) => onError(error, {
                action: 'notification-avatar.load',
                sourceId: batch?.sourceId,
            }));
        }
        return record;
    };

    const waitForEmission = async (item, batch, signal, playGeneration) => {
        while (!disposed && generation === playGeneration && !signal?.aborted) {
            if (paused) {
                if (!await waitForStateChange(signal, playGeneration)) return null;
                continue;
            }
            const settings = normalizeTablePopupRuntimeSettings(getSettings());
            const record = tryEmit(item, batch, settings);
            if (record) return { record, settings };
            if (!await waitForStateChange(signal, playGeneration)) return null;
        }
        return null;
    };

    const play = async (batch, context = {}) => {
        if (disposed) return { status: 'disposed', emittedCount: 0 };
        const items = normalizeItems(batch);
        const signal = context.signal;
        const playGeneration = generation;
        let emittedCount = 0;

        for (let index = 0; index < items.length; index += 1) {
            const emission = await waitForEmission(
                items[index],
                batch,
                signal,
                playGeneration,
            );
            if (!emission) break;
            emittedCount += 1;
            if (index < items.length - 1) {
                const intervalCompleted = await waitForDelay(
                    emission.settings.intervalMs,
                    signal,
                    playGeneration,
                );
                if (!intervalCompleted) break;
            }
        }

        if (emittedCount === items.length && items.length > 0) {
            await waitForDelay(ENTRY_HANDOFF_MS, signal, playGeneration);
        }
        let status = 'completed';
        if (disposed) status = 'disposed';
        else if (generation !== playGeneration) status = 'cleared';
        else if (signal?.aborted) status = 'replaced';
        return { status, emittedCount };
    };

    const clear = () => {
        if (disposed) return;
        generation += 1;
        for (const timer of [...managedTimers]) timer.cancel();
        for (const record of [...activeRecords]) record.finish();
        notifyStateChange();
    };

    const pause = () => {
        if (disposed || paused) return;
        paused = true;
        getLayer()?.setAttribute?.('data-yuzi-phone-overlay-paused', 'true');
        for (const timer of [...managedTimers]) timer.pause();
    };

    const resume = () => {
        if (disposed || !paused) return;
        paused = false;
        getLayer()?.removeAttribute?.('data-yuzi-phone-overlay-paused');
        for (const timer of [...managedTimers]) timer.schedule();
        notifyStateChange();
    };

    const dispose = () => {
        if (disposed) return;
        clear();
        disposed = true;
        notifyStateChange();
    };

    return Object.freeze({
        id: TABLE_POPUP_RENDERER_ID,
        play,
        clear,
        pause,
        resume,
        refreshSettings: notifyStateChange,
        dispose,
        getActiveCount: () => activeRecords.size,
        isPaused: () => paused,
        isDisposed: () => disposed,
    });
}
