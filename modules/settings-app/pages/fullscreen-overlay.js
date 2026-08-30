import { buildFullscreenOverlayPageHtml } from '../layout/page-builders/fullscreen-overlay-builders.js';
import {
    createFullscreenOverlayColorControl,
    normalizeFullscreenOverlayPalette,
} from '../ui/color-control.js';
import { SCROLLING_BARRAGE_MODEL_ID } from '../../fullscreen-overlay/settings.js';

function clone(value) {
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return value;
    }
}

function asId(value) {
    return String(value ?? '').trim();
}

function createInitialState(service) {
    return {
        status: 'loading',
        error: null,
        config: typeof service?.readConfig === 'function' ? service.readConfig() : {},
        tables: [],
        eyeDropperSupported: typeof globalThis?.EyeDropper === 'function',
    };
}

function moveItem(list, item, direction) {
    const next = [...list];
    const index = next.indexOf(item);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= next.length) return next;
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    return next;
}

function updateBarrageModel(config, patch) {
    const next = clone(config);
    const models = next.models && typeof next.models === 'object' ? next.models : {};
    const current = models[SCROLLING_BARRAGE_MODEL_ID]
        && typeof models[SCROLLING_BARRAGE_MODEL_ID] === 'object'
        ? models[SCROLLING_BARRAGE_MODEL_ID]
        : {};
    next.models = {
        ...models,
        [SCROLLING_BARRAGE_MODEL_ID]: {
            ...current,
            ...patch,
        },
    };
    return next;
}

function getBarrageModel(config) {
    return config?.models?.[SCROLLING_BARRAGE_MODEL_ID] || {};
}

function getActionMessage(code, fallback) {
    const messages = {
        no_enabled_sources: '请先勾选至少一个可用表格来源。',
        runtime_unavailable: '全屏浮层运行时尚未就绪，请稍后重试。',
        settings_save_failed: '弹幕设置保存失败，请稍后重试。',
        test_failed: '弹幕测试失败，请稍后重试。',
        clear_failed: '清空浮层失败，请稍后重试。',
    };
    return messages[asId(code)] || fallback;
}

export function createFullscreenOverlayPage(ctx) {
    const service = ctx.fullscreenOverlaySettingsService;
    const state = createInitialState(service);
    let active = false;
    let generation = 0;
    let eventCleanups = [];
    let colorControl = null;

    const notify = (message, isError = false) => {
        ctx.showToast?.(ctx.container, message, isError, ctx.pageRuntime);
    };

    const isCurrent = token => active && token === generation;

    const clearBindings = () => {
        colorControl?.dispose?.();
        colorControl = null;
        eventCleanups.splice(0).forEach((cleanup) => {
            if (typeof cleanup === 'function') cleanup();
        });
    };

    const bind = (target, type, listener, options) => {
        if (!target || !ctx.pageRuntime || typeof ctx.pageRuntime.addEventListener !== 'function') return;
        eventCleanups.push(ctx.pageRuntime.addEventListener(target, type, listener, options));
    };

    const requestRerender = () => {
        if (typeof ctx.rerenderFullscreenOverlayKeepScroll === 'function') {
            ctx.rerenderFullscreenOverlayKeepScroll();
            return;
        }
        paint();
    };

    const syncTablesFromConfig = (tables = state.tables) => {
        const sourceEnabledBySheetKey = state.config?.sourceEnabledBySheetKey || {};
        const sourceOrder = Array.isArray(state.config?.sourceOrder)
            ? state.config.sourceOrder
            : [];
        const orderIndex = new Map(sourceOrder.map((sheetKey, index) => [sheetKey, index]));
        state.tables = [...tables]
            .map(table => ({
                ...table,
                enabled: table.availability === 'available'
                    && sourceEnabledBySheetKey[table.sheetKey] === true,
            }))
            .sort((left, right) => (
                (orderIndex.get(left.sheetKey) ?? Number.MAX_SAFE_INTEGER)
                - (orderIndex.get(right.sheetKey) ?? Number.MAX_SAFE_INTEGER)
            ));
    };

    const persist = async (nextConfig, successMessage = '') => {
        if (!active || typeof service?.saveConfig !== 'function') return false;
        const token = generation;
        const result = await service.saveConfig(nextConfig);
        if (!isCurrent(token)) return false;
        if (result?.ok !== true) {
            notify(getActionMessage(result?.code, '弹幕设置保存失败，请稍后重试。'), true);
            return false;
        }
        state.config = clone(result.config);
        syncTablesFromConfig(Array.isArray(result.tables) ? result.tables : state.tables);
        if (successMessage) notify(successMessage);
        requestRerender();
        return true;
    };

    const bindNumericSetting = (selector, toPatch) => {
        const input = ctx.container?.querySelector?.(selector);
        bind(input, 'change', () => {
            const patch = toPatch(Number(input.value));
            void persist(updateBarrageModel(state.config, patch));
        });
    };

    const bindEvents = () => {
        clearBindings();

        bind(ctx.container?.querySelector?.('.phone-nav-back'), 'click', () => {
            ctx.state.mode = 'home';
            ctx.render();
        });

        if (state.status !== 'ready') return;

        const enabledInput = ctx.container?.querySelector?.('#phone-fullscreen-overlay-enabled');
        bind(enabledInput, 'change', () => {
            void persist({
                ...clone(state.config),
                enabled: enabledInput.checked === true,
            });
        });

        const sourceInputs = ctx.container?.querySelectorAll?.('[data-fullscreen-overlay-source]') || [];
        sourceInputs.forEach((input) => {
            bind(input, 'change', () => {
                const sheetKey = asId(input.getAttribute('data-fullscreen-overlay-source'));
                if (!sheetKey || input.disabled) return;
                void persist({
                    ...clone(state.config),
                    sourceEnabledBySheetKey: {
                        ...(state.config?.sourceEnabledBySheetKey || {}),
                        [sheetKey]: input.checked === true,
                    },
                });
            });
        });

        const moveButtons = ctx.container?.querySelectorAll?.('[data-fullscreen-overlay-move]') || [];
        moveButtons.forEach((button) => {
            bind(button, 'click', () => {
                const direction = asId(button.getAttribute('data-fullscreen-overlay-move'));
                const sheetKey = asId(button.getAttribute('data-sheet-key'));
                const order = Array.isArray(state.config?.sourceOrder)
                    ? state.config.sourceOrder
                    : state.tables.map(table => table.sheetKey);
                void persist({
                    ...clone(state.config),
                    sourceOrder: moveItem(order, sheetKey, direction),
                });
            });
        });

        const eternalInput = ctx.container?.querySelector?.('#phone-fullscreen-overlay-eternal');
        bind(eternalInput, 'change', () => {
            void persist(updateBarrageModel(state.config, {
                eternalEnabled: eternalInput.checked === true,
            }));
        });

        bindNumericSetting('#phone-fullscreen-overlay-density', value => ({
            maxConcurrent: value,
        }));
        bindNumericSetting('#phone-fullscreen-overlay-interval', value => ({
            intervalMs: value * 1000,
        }));
        bindNumericSetting('#phone-fullscreen-overlay-duration', value => ({
            durationMs: value * 1000,
        }));
        bindNumericSetting('#phone-fullscreen-overlay-font-size', value => ({
            fontSizePx: value,
        }));
        bindNumericSetting('#phone-fullscreen-overlay-opacity', value => ({
            opacity: value,
        }));

        colorControl = createFullscreenOverlayColorControl({
            container: ctx.container,
            pageRuntime: ctx.pageRuntime,
            getPalette: () => getBarrageModel(state.config).palette,
            onPaletteChange: (palette) => {
                void persist(updateBarrageModel(state.config, {
                    palette: normalizeFullscreenOverlayPalette(palette),
                }));
            },
            showToast: notify,
            scope: globalThis,
        });

        const testButton = ctx.container?.querySelector?.('#phone-fullscreen-overlay-test');
        bind(testButton, 'click', async () => {
            if (typeof service?.testSelectedSources !== 'function') return;
            const token = generation;
            const result = await service.testSelectedSources(state.config);
            if (!isCurrent(token)) return;
            if (result?.ok === true) notify('已按当前设置发送测试内容。');
            else notify(getActionMessage(result?.code, '弹幕测试失败，请稍后重试。'), true);
        });

        const clearButton = ctx.container?.querySelector?.('#phone-fullscreen-overlay-clear');
        bind(clearButton, 'click', async () => {
            if (typeof service?.clearOverlay !== 'function') return;
            const token = generation;
            const result = await service.clearOverlay();
            if (!isCurrent(token)) return;
            if (result?.ok === true) notify('已清空当前浮层内容。');
            else notify(getActionMessage(result?.code, '清空浮层失败，请稍后重试。'), true);
        });
    };

    function paint() {
        if (!active || !ctx.container) return;
        ctx.container.innerHTML = buildFullscreenOverlayPageHtml(state);
        bindEvents();
    }

    const load = async () => {
        if (typeof service?.loadViewModel !== 'function') {
            state.status = 'error';
            state.error = { code: 'service_unavailable', message: '弹幕设置服务不可用。' };
            requestRerender();
            return;
        }
        const token = generation;
        const viewModel = await service.loadViewModel();
        if (!isCurrent(token)) return;
        state.status = viewModel?.status || 'error';
        state.error = viewModel?.error || null;
        state.config = clone(viewModel?.config || {});
        state.tables = Array.isArray(viewModel?.tables) ? clone(viewModel.tables) : [];
        state.eyeDropperSupported = viewModel?.eyeDropperSupported === true;
        requestRerender();
    };

    return {
        mount() {
            active = true;
            generation += 1;
            paint();
            void load();
        },
        update() {
            paint();
        },
        dispose() {
            active = false;
            generation += 1;
            clearBindings();
        },
    };
}

export function renderFullscreenOverlayPage(ctx) {
    createFullscreenOverlayPage(ctx).mount();
}
