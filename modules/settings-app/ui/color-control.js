import { escapeHtmlAttr } from '../../utils/dom-escape.js';

export const MAX_FULLSCREEN_OVERLAY_PALETTE_SIZE = 16;
export const DEFAULT_FULLSCREEN_OVERLAY_PALETTE = Object.freeze(['#FFFFFF']);

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function asIndex(value) {
    const index = Number.parseInt(String(value ?? ''), 10);
    return Number.isInteger(index) && index >= 0 ? index : -1;
}

export function normalizeHexColor(value) {
    const text = String(value ?? '').trim();
    const shortMatch = text.match(/^#?([\da-f]{3})$/iu);
    if (shortMatch) {
        return `#${shortMatch[1]
            .split('')
            .map(char => `${char}${char}`)
            .join('')
            .toUpperCase()}`;
    }
    const fullMatch = text.match(/^#?([\da-f]{6})$/iu);
    return fullMatch ? `#${fullMatch[1].toUpperCase()}` : null;
}

export function normalizeFullscreenOverlayPalette(value, maxSize = MAX_FULLSCREEN_OVERLAY_PALETTE_SIZE) {
    const safeMaxSize = Math.max(1, Math.min(
        MAX_FULLSCREEN_OVERLAY_PALETTE_SIZE,
        Number.parseInt(String(maxSize ?? ''), 10) || MAX_FULLSCREEN_OVERLAY_PALETTE_SIZE,
    ));
    const colors = asArray(value)
        .map(normalizeHexColor)
        .filter(Boolean)
        .slice(0, safeMaxSize);
    return colors.length > 0 ? colors : [...DEFAULT_FULLSCREEN_OVERLAY_PALETTE];
}

export function isEyeDropperSupported(scope = globalThis) {
    return typeof scope?.EyeDropper === 'function';
}

export async function requestEyeDropperColor(currentColor, scope = globalThis) {
    const fallbackColor = normalizeHexColor(currentColor) || DEFAULT_FULLSCREEN_OVERLAY_PALETTE[0];
    if (!isEyeDropperSupported(scope)) {
        return {
            ok: true,
            changed: false,
            color: fallbackColor,
            reason: 'unsupported',
        };
    }

    try {
        const result = await new scope.EyeDropper().open();
        const nextColor = normalizeHexColor(result?.sRGBHex);
        if (!nextColor) {
            return {
                ok: true,
                changed: false,
                color: fallbackColor,
                reason: 'invalid_result',
            };
        }
        return {
            ok: true,
            changed: nextColor !== fallbackColor,
            color: nextColor,
            reason: '',
        };
    } catch (error) {
        return {
            ok: true,
            changed: false,
            color: fallbackColor,
            reason: error?.name === 'AbortError' ? 'cancelled' : 'failed',
        };
    }
}

export function buildFullscreenOverlayColorRowsHtml(palette, options = {}) {
    const colors = normalizeFullscreenOverlayPalette(palette);
    const eyeDropperSupported = options.eyeDropperSupported === true;
    return colors.map((color, index) => `
        <div class="phone-fullscreen-overlay-color-row" data-fullscreen-overlay-color-row="${index}">
            <span class="phone-fullscreen-overlay-color-index">${index + 1}</span>
            <label class="phone-fullscreen-overlay-color-swatch" title="选择颜色">
                <input type="color"
                    value="${escapeHtmlAttr(color)}"
                    data-fullscreen-overlay-color-input="${index}"
                    aria-label="选择第 ${index + 1} 种弹幕颜色">
                <span style="--yuzi-phone-fullscreen-overlay-swatch:${escapeHtmlAttr(color)}"></span>
            </label>
            <input type="text"
                class="phone-settings-input phone-fullscreen-overlay-color-hex"
                value="${escapeHtmlAttr(color)}"
                maxlength="7"
                spellcheck="false"
                inputmode="text"
                data-fullscreen-overlay-color-hex="${index}"
                aria-label="第 ${index + 1} 种弹幕颜色 HEX">
            <button type="button"
                class="phone-settings-btn phone-fullscreen-overlay-icon-btn"
                data-fullscreen-overlay-eyedropper="${index}"
                title="${eyeDropperSupported ? '吸取界面颜色' : '当前浏览器不支持吸管取色'}"
                aria-label="吸取第 ${index + 1} 种弹幕颜色"
                ${eyeDropperSupported ? '' : 'disabled'}>◉</button>
            <button type="button"
                class="phone-settings-btn phone-settings-btn-danger phone-fullscreen-overlay-icon-btn"
                data-fullscreen-overlay-color-delete="${index}"
                aria-label="删除第 ${index + 1} 种弹幕颜色"
                ${colors.length <= 1 ? 'disabled' : ''}>×</button>
        </div>
    `).join('');
}

function createRuntimeBinder(runtime) {
    return (target, type, listener, options) => {
        if (!target || typeof runtime?.addEventListener !== 'function') return () => {};
        return runtime.addEventListener(target, type, listener, options);
    };
}

function readIndex(target, attributeName) {
    return asIndex(target?.getAttribute?.(attributeName));
}

export function createFullscreenOverlayColorControl(options = {}) {
    const {
        container,
        pageRuntime,
        getPalette = () => DEFAULT_FULLSCREEN_OVERLAY_PALETTE,
        onPaletteChange = () => {},
        showToast = () => {},
        scope = globalThis,
    } = options;
    const cleanupFns = [];
    const bindEvent = createRuntimeBinder(pageRuntime);
    let disposed = false;

    const currentPalette = () => normalizeFullscreenOverlayPalette(getPalette());

    const emitPalette = (nextPalette) => {
        if (disposed) return;
        onPaletteChange(normalizeFullscreenOverlayPalette(nextPalette));
    };

    const updateColor = (index, value, input = null) => {
        const palette = currentPalette();
        const color = normalizeHexColor(value);
        if (index < 0 || index >= palette.length || !color) {
            if (input) input.value = palette[index] || DEFAULT_FULLSCREEN_OVERLAY_PALETTE[0];
            showToast('请输入有效的 HEX 颜色，例如 #FFFFFF。', true);
            return;
        }
        palette[index] = color;
        emitPalette(palette);
    };

    const colorInputs = container?.querySelectorAll?.('[data-fullscreen-overlay-color-input]') || [];
    colorInputs.forEach((input) => {
        cleanupFns.push(bindEvent(input, 'change', () => {
            updateColor(readIndex(input, 'data-fullscreen-overlay-color-input'), input.value, input);
        }));
    });

    const hexInputs = container?.querySelectorAll?.('[data-fullscreen-overlay-color-hex]') || [];
    hexInputs.forEach((input) => {
        cleanupFns.push(bindEvent(input, 'change', () => {
            updateColor(readIndex(input, 'data-fullscreen-overlay-color-hex'), input.value, input);
        }));
    });

    const eyeDropperButtons = container?.querySelectorAll?.('[data-fullscreen-overlay-eyedropper]') || [];
    eyeDropperButtons.forEach((button) => {
        cleanupFns.push(bindEvent(button, 'click', async () => {
            const index = readIndex(button, 'data-fullscreen-overlay-eyedropper');
            const palette = currentPalette();
            if (index < 0 || index >= palette.length) return;
            const result = await requestEyeDropperColor(palette[index], scope);
            if (disposed || result.changed !== true) {
                if (result.reason === 'unsupported') showToast('当前浏览器不支持吸管取色。', true);
                else if (result.reason === 'failed') showToast('吸管取色失败，请重试。', true);
                return;
            }
            palette[index] = result.color;
            emitPalette(palette);
        }));
    });

    const deleteButtons = container?.querySelectorAll?.('[data-fullscreen-overlay-color-delete]') || [];
    deleteButtons.forEach((button) => {
        cleanupFns.push(bindEvent(button, 'click', () => {
            const palette = currentPalette();
            const index = readIndex(button, 'data-fullscreen-overlay-color-delete');
            if (palette.length <= 1 || index < 0 || index >= palette.length) return;
            palette.splice(index, 1);
            emitPalette(palette);
        }));
    });

    const addButton = container?.querySelector?.('#phone-fullscreen-overlay-add-color');
    cleanupFns.push(bindEvent(addButton, 'click', () => {
        const palette = currentPalette();
        if (palette.length >= MAX_FULLSCREEN_OVERLAY_PALETTE_SIZE) {
            showToast(`最多可以添加 ${MAX_FULLSCREEN_OVERLAY_PALETTE_SIZE} 种颜色。`, true);
            return;
        }
        emitPalette([...palette, DEFAULT_FULLSCREEN_OVERLAY_PALETTE[0]]);
    }));

    const resetButton = container?.querySelector?.('#phone-fullscreen-overlay-reset-palette');
    cleanupFns.push(bindEvent(resetButton, 'click', () => {
        emitPalette(DEFAULT_FULLSCREEN_OVERLAY_PALETTE);
    }));

    return Object.freeze({
        dispose() {
            disposed = true;
            cleanupFns.splice(0).forEach((cleanup) => {
                if (typeof cleanup === 'function') cleanup();
            });
        },
    });
}
