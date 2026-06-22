import { Logger } from '../../error-handler.js';
import { getDB, sleep, withTimeout } from '../db-bridge.js';
import { openDatabaseUi, openDatabaseVisualizerUi } from './database-ui-bridge.js';

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
    try {
        return await withTimeout(
            openDatabaseVisualizerUi(),
            timeoutMs || 4000,
            '打开可视化编辑器超时',
        );
    } catch (error) {
        const isTimeout = /超时/.test(String(error?.message || ''));
        return {
            ok: false,
            code: isTimeout ? 'timeout' : 'failed',
            source: 'bridge',
            message: isTimeout ? '打开可视化编辑器超时' : `打开可视化编辑器失败：${error?.message || '未知错误'}`,
        };
    }
}

export async function openDatabaseUiWithStatus(options = {}) {
    const timeoutMs = Number(options.timeoutMs);
    try {
        return await withTimeout(
            openDatabaseUi(),
            timeoutMs || 4000,
            '打开数据库界面超时',
        );
    } catch (error) {
        const isTimeout = /超时/.test(String(error?.message || ''));
        return {
            ok: false,
            code: isTimeout ? 'timeout' : 'failed',
            source: 'bridge',
            message: isTimeout ? '打开数据库界面超时' : `打开数据库界面失败：${error?.message || '未知错误'}`,
        };
    }
}

// 兼容旧调用方的历史函数名；实际语义已迁移为“打开数据库 UI”，旧设置面板只作为 bridge fallback。
// 新代码应优先注入 openDatabaseUiWithStatus，不要继续传播 Settings 命名。
export async function openDatabaseSettingsWithStatus(options = {}) {
    return openDatabaseUiWithStatus(options);
}
