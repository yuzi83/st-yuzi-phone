import { Logger } from '../../error-handler.js';
import { getDB, sleep, withTimeout } from '../db-bridge.js';

const logger = Logger.withScope({ scope: 'phone-core/data-api/panel-actions', feature: 'db-api' });

async function warmDatabaseSettingsRuntimeBeforeManualUpdate(api) {
    if (!api || typeof api.openSettings !== 'function') {
        return false;
    }

    try {
        const result = await withTimeout(
            Promise.resolve(api.openSettings()),
            4000,
            '打开数据库设置面板超时',
        );
        if (result === false) {
            logger.warn({
                action: 'manual-update.settings-warmup-failed',
                message: '数据库设置面板打开返回失败，将继续尝试 manualUpdate',
            });
            return false;
        }
        await sleep(160);
        return true;
    } catch (error) {
        logger.warn({
            action: 'manual-update.settings-warmup-error',
            message: '手动更新前打开数据库设置面板失败，将继续尝试 manualUpdate',
            error,
        });
        return false;
    }
}

export async function triggerManualUpdate() {
    const api = getDB();
    if (api && typeof api.manualUpdate === 'function') {
        try {
            await warmDatabaseSettingsRuntimeBeforeManualUpdate(api);
            return await api.manualUpdate();
        } catch (error) {
            logger.warn({
                action: 'manual-update.api',
                message: 'manualUpdate 调用失败',
                error,
            });
        }
    }

    try {
        const topDoc = (window.parent || window).document;
        const button = topDoc.querySelector('[id$="-manual-update-card"]');
        if (button instanceof HTMLElement) {
            button.click();
            return true;
        }
    } catch (error) {
        logger.warn({
            action: 'manual-update.fallback',
            message: '按钮点击方式也失败',
            error,
        });
    }
    return false;
}

export async function openVisualizerWithStatus(options = {}) {
    const timeoutMs = Number(options.timeoutMs);
    const api = getDB();

    if (!api || typeof api.openVisualizer !== 'function') {
        return {
            ok: false,
            code: 'api_unavailable',
            message: '可视化编辑器接口不可用，请确认数据库插件已加载',
        };
    }

    try {
        await withTimeout(
            Promise.resolve(api.openVisualizer()),
            timeoutMs || 4000,
            '打开可视化编辑器超时',
        );
        return {
            ok: true,
            code: 'ok',
            message: '已打开可视化编辑器',
        };
    } catch (error) {
        const isTimeout = /超时/.test(String(error?.message || ''));
        return {
            ok: false,
            code: isTimeout ? 'timeout' : 'failed',
            message: isTimeout ? '打开可视化编辑器超时' : `打开可视化编辑器失败：${error?.message || '未知错误'}`,
        };
    }
}

export async function openDatabaseSettingsWithStatus(options = {}) {
    const timeoutMs = Number(options.timeoutMs);
    const api = getDB();

    if (!api || typeof api.openSettings !== 'function') {
        return {
            ok: false,
            code: 'api_unavailable',
            message: '数据库设置接口不可用，请确认数据库插件已加载',
        };
    }

    try {
        const result = await withTimeout(
            Promise.resolve(api.openSettings()),
            timeoutMs || 4000,
            '打开数据库设置面板超时',
        );
        if (result === false) {
            return {
                ok: false,
                code: 'failed',
                message: '打开数据库设置面板失败',
            };
        }
        await sleep(120);
        return {
            ok: true,
            code: 'ok',
            message: '已打开数据库设置面板',
        };
    } catch (error) {
        const isTimeout = /超时/.test(String(error?.message || ''));
        return {
            ok: false,
            code: isTimeout ? 'timeout' : 'failed',
            message: isTimeout ? '打开数据库设置面板超时' : `打开数据库设置面板失败：${error?.message || '未知错误'}`,
        };
    }
}
