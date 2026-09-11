import { createContentPresetDisplayRuntime } from './display-runtime.js';
import { createContentPresetHostAppearance } from './host-appearance.js';
import { contentPresetImageGenerationHost } from './image-generation-host.js';
import { createContentPresetInlineInteractions } from './inline-interactions.js';
import { getPresetRecord } from './repository.js';
import { createTableSnapshot } from './snapshot.js';

function text(value) {
    return String(value ?? '').trim();
}

function stateFor(batch, definition, version) {
    const rawData = batch?.snapshot || {};
    const sheetKeys = Array.isArray(batch?.targetSheetKeys)
        ? batch.targetSheetKeys
        : definition?.targetSheetKeys || [];
    return Object.freeze({
        version,
        modelId: definition?.modelId || '',
        presetId: definition?.presetId || '',
        displayId: definition?.displayId || '',
        kind: definition?.display?.kind || '',
        tables: Object.freeze(sheetKeys
            .map(sheetKey => createTableSnapshot(rawData, sheetKey))
            .filter(Boolean)),
        events: Object.freeze([...(batch?.items || [])]),
        settings: Object.freeze({ ...(batch?.modelSettings || {}) }),
    });
}

function applyOverlaySettings(root, settings = {}) {
    const variables = {
        '--yuzi-content-preset-overlay-area-percent': settings.areaPercent,
        '--yuzi-content-preset-overlay-duration-ms': settings.durationMs,
        '--yuzi-content-preset-overlay-interval-ms': settings.intervalMs,
        '--yuzi-content-preset-overlay-max-concurrent': settings.maxConcurrent,
        '--yuzi-content-preset-overlay-font-size-px': settings.fontSizePx,
        '--yuzi-content-preset-overlay-opacity': settings.opacity,
        '--yuzi-content-preset-overlay-border-radius-px': settings.borderRadiusPx,
        '--yuzi-content-preset-overlay-column-count': settings.columnCount,
        '--yuzi-content-preset-overlay-placement-mode': settings.placementMode,
    };
    for (const [name, value] of Object.entries(variables)) {
        if (value !== undefined && value !== null) root?.style?.setProperty?.(name, String(value));
    }
}

function appendAfter(target, root) {
    if (typeof target?.after === 'function') {
        target.after(root);
        return true;
    }
    if (typeof target?.parentNode?.appendChild === 'function') {
        target.parentNode.appendChild(root);
        return true;
    }
    return false;
}

function createRoot(documentRef, className) {
    const root = documentRef?.createElement?.('div');
    if (!root) throw new Error('展示容器不可用');
    root.className = className;
    return root;
}

/**
 * Renderer for one dynamic content-preset display model. It deliberately
 * delegates HTML/CSS/module lifecycle to display-runtime and only owns the
 * fullscreen/inline placement boundary.
 */
export function createContentPresetOverlayRenderer(options = {}) {
    const modelId = text(options.modelId);
    const documentRef = options.documentRef || globalThis.document;
    const getPreset = options.getPresetRecord || getPresetRecord;
    const createRuntime = options.createContentPresetDisplayRuntime || createContentPresetDisplayRuntime;
    const createInteractions = options.createInlineInteractions || createContentPresetInlineInteractions;
    const imageGenerationHost = options.contentPresetImageGenerationHost || contentPresetImageGenerationHost;
    const appearance = options.hostAppearance || createContentPresetHostAppearance();
    const setTimeoutFn = options.setTimeoutFn || globalThis.setTimeout;
    const clearTimeoutFn = options.clearTimeoutFn || globalThis.clearTimeout;
    let current = null;
    let disposed = false;
    let version = 0;
    let requestVersion = 0;
    let activeKind = null;

    const release = () => {
        ++requestVersion;
        activeKind = null;
        const active = current;
        current = null;
        if (!active) return;
        if (active.timer !== null) clearTimeoutFn?.(active.timer);
        try { active.runtime?.dispose?.(); } catch {}
        try { active.root?.remove?.(); } catch {}
    };

    const play = async (batch, context = {}) => {
        if (disposed || context.signal?.aborted) return { status: 'disposed', emittedCount: 0 };
        const definition = batch?.customDisplay;
        if (!definition || definition.modelId !== modelId) return { status: 'invalid-display', emittedCount: 0 };
        const kind = text(definition.display?.kind);
        if (!['inline', 'popup', 'barrage'].includes(kind)) return { status: 'invalid-display', emittedCount: 0 };
        if (kind === 'inline' && options.getInlineEpoch && batch?.inlineEpoch !== options.getInlineEpoch()) {
            return { status: 'stale', emittedCount: 0 };
        }

        release();
        activeKind = kind;
        const request = requestVersion;
        const isStale = () => disposed || context.signal?.aborted || request !== requestVersion
            || (kind === 'inline' && options.getInlineEpoch && batch.inlineEpoch !== options.getInlineEpoch());
        try {
            const record = await getPreset(definition.presetId);
            if (isStale()) return { status: 'stale', emittedCount: 0 };
            const display = record?.displays?.find(value => value.id === definition.displayId);
            if (!display?.activatable || display.kind !== kind) throw new Error('自定义展示已失效');

            const root = createRoot(
                documentRef,
                `yuzi-phone-content-preset-display yuzi-phone-content-preset-display-${kind}`,
            );
            // Own the pending mount too: a message can invalidate it before mount() resolves.
            const active = { root, runtime: null, timer: null };
            current = active;
            applyOverlaySettings(root, batch?.modelSettings);
            if (kind !== 'inline') root.style?.setProperty?.('pointer-events', 'none', 'important');

            if (kind === 'inline') {
                const target = options.getInlineTarget?.();
                if (!target?.element || !appendAfter(target.element, root)) throw new Error('no-ai-message');
            } else {
                const layer = options.layerRuntime?.mount?.();
                if (!layer?.appendChild) throw new Error('全屏浮层不可用');
                layer.appendChild(root);
            }

            const localInteractions = kind === 'inline' ? createInteractions() : null;
            const imageActions = kind === 'inline'
                ? imageGenerationHost?.createInlineDisplayActions?.({
                    display,
                    presetId: definition.presetId,
                    displayId: definition.displayId,
                    modelId: definition.modelId,
                    isCurrent: () => !isStale() && current === active,
                }) || {}
                : {};
            const inlineInteractions = kind === 'inline'
                ? {
                    ...(localInteractions
                        ? {
                            expand: (...args) => localInteractions.expand(...args),
                            tab: (...args) => localInteractions.tab(...args),
                            appendToComposer: (...args) => localInteractions.appendToComposer(...args),
                        }
                        : {}),
                    ...imageActions,
                }
                : undefined;
            active.runtime = createRuntime({
                record,
                display,
                root,
                initialState: stateFor(batch, definition, ++version),
                signal: context.signal,
                theme: appearance.theme,
                font: appearance.font,
                inlineInteractions,
            });
            await active.runtime.mount();
            if (isStale()) {
                if (current === active) release();
                return { status: 'stale', emittedCount: 0 };
            }
            const durationMs = Math.max(0, Number(batch?.modelSettings?.durationMs) || 0);
            if (kind !== 'inline' && durationMs > 0 && typeof setTimeoutFn === 'function') {
                active.timer = setTimeoutFn(() => {
                    if (current === active) release();
                }, durationMs);
            }
            return { status: 'completed', emittedCount: 1 };
        } catch (error) {
            const stale = isStale();
            if (request === requestVersion) release();
            if (stale) return { status: 'stale', emittedCount: 0 };
            throw error;
        }
    };

    return Object.freeze({
        id: modelId,
        play,
        clear: release,
        invalidateInline() {
            if (activeKind === 'inline') release();
        },
        pause() {},
        resume() {},
        refreshSettings() {},
        dispose() {
            if (disposed) return;
            disposed = true;
            release();
        },
    });
}
