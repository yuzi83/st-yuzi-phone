import { getPhoneSettings, subscribePhoneSettingsUpdates } from '../settings.js';
import { getAppearanceFontLibraryViewModel } from '../settings-app/services/appearance-settings/font-library-service.js';

const NOOP = () => {};

function readSafely(read, fallback) {
    try {
        return typeof read === 'function' ? read() : fallback;
    } catch {
        return fallback;
    }
}

function themeState(getSettings) {
    const settings = readSafely(getSettings, null);
    return Object.freeze({
        mode: String(settings?.phoneThemeMode ?? '').trim().toLowerCase() === 'dark' ? 'dark' : 'light',
    });
}

function fontState(getFontLibraryViewModel) {
    const viewModel = readSafely(getFontLibraryViewModel, null);
    return Object.freeze({
        family: String(viewModel?.activeFont?.cssFamily ?? '').trim(),
    });
}

function createReadonlySource(readState, subscribeSettings) {
    return Object.freeze({
        getState: () => readState(),
        subscribe(listener) {
            if (typeof listener !== 'function') return NOOP;
            try {
                const unsubscribe = subscribeSettings?.(() => listener(readState()));
                return typeof unsubscribe === 'function' ? unsubscribe : NOOP;
            } catch {
                return NOOP;
            }
        },
    });
}

/**
 * 为内容预设展示提供小手机主设置的只读外观源。
 *
 * `subscribeSettings` 是可选宿主事件 seam：宿主拥有可用的设置变更事件时传入
 * `(listener) => unsubscribe` 即可；没有事件时仍可通过 getState() 安全读取当前值。
 */
export function createContentPresetHostAppearance(options = {}) {
    const getSettings = options.getPhoneSettings || getPhoneSettings;
    const getFontLibraryViewModel = options.getAppearanceFontLibraryViewModel || getAppearanceFontLibraryViewModel;
    const subscribeSettings = options.subscribeSettings || subscribePhoneSettingsUpdates;

    return Object.freeze({
        theme: createReadonlySource(() => themeState(getSettings), subscribeSettings),
        font: createReadonlySource(() => fontState(getFontLibraryViewModel), subscribeSettings),
    });
}

function setRootVariable(root, name, value) {
    if (typeof root?.style?.setProperty !== 'function') return;
    root.style.setProperty(name, String(value ?? ''));
}

function removeRootVariable(root, name) {
    try { root?.style?.removeProperty?.(name); } catch {}
}

function readSourceState(source) {
    if (typeof source?.getState === 'function') return source.getState();
    if (typeof source?.getSnapshot === 'function') return source.getSnapshot();
    return source || null;
}

function themeMode(state) {
    if (typeof state === 'string') return state;
    return String(state?.mode ?? state?.theme ?? '');
}

function fontFamily(state) {
    if (typeof state === 'string') return state;
    return String(state?.family ?? state?.fontFamily ?? '');
}

/**
 * 只把作者主动声明的主题/字体选择结果写入专属 CSS 变量。
 * 不写 color、background、grid 等视觉属性，避免覆盖作者的页面或展示设计。
 */
export function createContentPresetAppearanceBridge(root, declaration, appearance = {}) {
    const subscriptions = [];
    const integrations = declaration?.integrations || {};
    const connect = (enabled, source, variable, valueOf) => {
        if (!enabled) return;
        const apply = state => setRootVariable(root, variable, valueOf(state ?? readSourceState(source)));
        apply(readSourceState(source));
        if (typeof source?.subscribe === 'function') {
            const unsubscribe = source.subscribe(apply);
            if (typeof unsubscribe === 'function') subscriptions.push(unsubscribe);
        }
    };

    connect(integrations.theme === true, appearance.theme, '--yuzi-content-preset-theme-mode', themeMode);
    connect(integrations.font === true, appearance.font, '--yuzi-content-preset-font-family', fontFamily);

    return () => {
        for (const unsubscribe of subscriptions.splice(0)) {
            try { unsubscribe(); } catch {}
        }
        if (integrations.theme === true) removeRootVariable(root, '--yuzi-content-preset-theme-mode');
        if (integrations.font === true) removeRootVariable(root, '--yuzi-content-preset-font-family');
    };
}
