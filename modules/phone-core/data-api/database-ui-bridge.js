import { Logger } from '../../error-handler.js';

const logger = Logger.withScope({ scope: 'phone-core/data-api/database-ui-bridge', feature: 'db-ui' });

const ACU_DATABASE_NEW_UI_MENU_SELECTOR = '#acu-v2-menu-item';
const ACU_DATABASE_NEW_UI_API_METHODS = [
    'openApp',
    'openMain',
    'openNewUI',
    'openNewUi',
    'openUi',
    'openUI',
    'openShell',
    'showApp',
];

function getAccessibleDocument(targetWindow) {
    try {
        const doc = targetWindow?.document || null;
        return doc?.body ? doc : null;
    } catch {
        return null;
    }
}

function addRuntimeWindow(targetWindow, state) {
    if (!targetWindow || state.visited.has(targetWindow)) return;
    if (!getAccessibleDocument(targetWindow)) return;
    state.visited.add(targetWindow);
    state.windows.push(targetWindow);
    state.queue.push(targetWindow);
}

export function collectAccessibleRuntimeWindows() {
    const state = { windows: [], queue: [], visited: new Set() };
    addRuntimeWindow(window, state);

    try {
        let cursor = window;
        while (cursor.parent && cursor.parent !== cursor) {
            const parentWindow = cursor.parent;
            if (!getAccessibleDocument(parentWindow)) break;
            addRuntimeWindow(parentWindow, state);
            cursor = parentWindow;
        }
    } catch {
        // keep collected windows
    }

    try {
        addRuntimeWindow(window.top, state);
    } catch {
        // ignore inaccessible top
    }

    for (let index = 0; index < state.queue.length; index += 1) {
        const targetWindow = state.queue[index];
        try {
            for (let frameIndex = 0; frameIndex < targetWindow.frames.length; frameIndex += 1) {
                addRuntimeWindow(targetWindow.frames[frameIndex], state);
            }
        } catch {
            // ignore inaccessible frames
        }

        const targetDocument = getAccessibleDocument(targetWindow);
        targetDocument?.querySelectorAll('iframe').forEach((frame) => {
            try {
                addRuntimeWindow(frame.contentWindow, state);
            } catch {
                // ignore inaccessible iframe
            }
        });
    }

    return state.windows;
}

async function runMaybeAsyncDatabaseUiOpener(opener, context) {
    try {
        const result = opener();
        const resolved = result && typeof result.then === 'function' ? await result : result;
        return resolved !== false;
    } catch (error) {
        logger.warn({ action: 'open-ui.failed', message: `${context}调用失败`, error });
        return false;
    }
}

async function openDatabaseNewUiViaApi() {
    let apiMethodFound = false;
    for (const targetWindow of collectAccessibleRuntimeWindows()) {
        const api = targetWindow.AutoCardUpdaterV2API;
        if (!api || typeof api !== 'object') continue;
        for (const methodName of ACU_DATABASE_NEW_UI_API_METHODS) {
            const method = api[methodName];
            if (typeof method !== 'function') continue;
            apiMethodFound = true;
            if (await runMaybeAsyncDatabaseUiOpener(() => method.call(api), '数据库新 UI 入口')) {
                return { ok: true, source: 'v2-api' };
            }
        }
    }
    return apiMethodFound
        ? { ok: false, source: 'v2-api', code: 'v2_failed' }
        : { ok: false, code: 'v2_unavailable' };
}

function openDatabaseNewUiViaMenuEntry() {
    let menuEntryFailed = false;
    for (const targetWindow of collectAccessibleRuntimeWindows()) {
        try {
            const targetDocument = getAccessibleDocument(targetWindow);
            const menuItem = targetDocument?.querySelector(ACU_DATABASE_NEW_UI_MENU_SELECTOR);
            const HTMLElementCtor = targetWindow.HTMLElement;
            if (typeof HTMLElementCtor !== 'function' || !(menuItem instanceof HTMLElementCtor) || typeof menuItem.click !== 'function') continue;
            menuItem.click();
            return { ok: true, source: 'v2-menu' };
        } catch (error) {
            menuEntryFailed = true;
            logger.warn({
                action: 'open-ui.v2-menu-failed',
                message: '数据库新 UI 菜单入口点击失败',
                selector: ACU_DATABASE_NEW_UI_MENU_SELECTOR,
                error,
            });
        }
    }
    return menuEntryFailed
        ? { ok: false, source: 'v2-menu', code: 'v2_menu_failed' }
        : { ok: false, code: 'v2_menu_unavailable' };
}

async function openLegacyDatabaseSettings() {
    for (const targetWindow of collectAccessibleRuntimeWindows()) {
        const api = targetWindow.AutoCardUpdaterAPI;
        if (!api || typeof api.openSettings !== 'function') continue;
        if (await runMaybeAsyncDatabaseUiOpener(() => api.openSettings.call(api), '旧数据库设置入口')) {
            return { ok: true, source: 'legacy-settings' };
        }
    }
    return { ok: false };
}

async function openDatabaseVisualizerNewUiViaApi() {
    let apiFound = false;
    for (const targetWindow of collectAccessibleRuntimeWindows()) {
        const api = targetWindow.AutoCardUpdaterV2API;
        if (!api || typeof api.openVisualizer !== 'function') continue;
        apiFound = true;
        if (await runMaybeAsyncDatabaseUiOpener(() => api.openVisualizer.call(api), '新可视化编辑器入口')) {
            return { ok: true, source: 'v2-api' };
        }
    }
    return apiFound
        ? { ok: false, source: 'v2-api', code: 'v2_failed' }
        : { ok: false, code: 'v2_unavailable' };
}

async function openLegacyDatabaseVisualizer() {
    for (const targetWindow of collectAccessibleRuntimeWindows()) {
        const api = targetWindow.AutoCardUpdaterAPI;
        if (api && typeof api.openVisualizer === 'function') {
            if (await runMaybeAsyncDatabaseUiOpener(() => api.openVisualizer.call(api), '旧可视化编辑器入口')) {
                return { ok: true, source: 'legacy-visualizer' };
            }
        }

        const openNewVisualizer = targetWindow.openNewVisualizer_ACU;
        if (typeof openNewVisualizer === 'function') {
            if (await runMaybeAsyncDatabaseUiOpener(() => openNewVisualizer.call(targetWindow), '旧可视化全局入口')) {
                return { ok: true, source: 'legacy-global-visualizer' };
            }
        }
    }
    return { ok: false };
}

export async function openDatabaseUi() {
    const apiResult = await openDatabaseNewUiViaApi();
    if (apiResult.ok) {
        return {
            ok: true,
            code: 'ok',
            source: apiResult.source,
            message: '已触发数据库界面打开',
        };
    }

    if (apiResult.code === 'v2_failed') {
        return {
            ok: false,
            code: 'v2_failed',
            source: apiResult.source,
            message: '数据库新 UI 接口调用失败，请检查数据库本体控制台日志',
        };
    }

    const menuResult = openDatabaseNewUiViaMenuEntry();
    if (menuResult.ok) {
        return {
            ok: true,
            code: 'ok',
            source: menuResult.source,
            message: '已触发数据库界面打开',
        };
    }

    if (menuResult.code === 'v2_menu_failed') {
        return {
            ok: false,
            code: 'v2_menu_failed',
            source: menuResult.source,
            message: '数据库新 UI 菜单入口点击失败，请检查数据库本体控制台日志',
        };
    }

    const legacyResult = await openLegacyDatabaseSettings();
    if (legacyResult.ok) {
        return {
            ok: true,
            code: 'ok',
            source: legacyResult.source,
            message: '已打开数据库设置面板',
        };
    }

    return {
        ok: false,
        code: 'api_unavailable',
        source: 'none',
        message: '数据库界面接口不可用，请确认数据库插件已加载',
    };
}

export async function openDatabaseVisualizerUi() {
    const v2Result = await openDatabaseVisualizerNewUiViaApi();
    if (v2Result.ok) {
        return {
            ok: true,
            code: 'ok',
            source: v2Result.source,
            message: '已打开可视化编辑器',
        };
    }

    if (v2Result.code === 'v2_failed') {
        return {
            ok: false,
            code: 'v2_failed',
            source: v2Result.source,
            message: '新可视化编辑器接口调用失败',
        };
    }

    const legacyResult = await openLegacyDatabaseVisualizer();
    if (legacyResult.ok) {
        return {
            ok: true,
            code: 'ok',
            source: legacyResult.source,
            message: '已打开可视化编辑器',
        };
    }

    return {
        ok: false,
        code: 'api_unavailable',
        source: 'none',
        message: '可视化编辑器接口不可用，请确认数据库插件已加载',
    };
}
