import { Logger } from '../../error-handler.js';
import { getDB } from '../db-bridge.js';

export function debugCheckAPI() {
    if (!window.__YUZI_PHONE_DEBUG) return;

    const api = getDB();
    if (!api) {
        Logger.info('[玉子的手机] AutoCardUpdaterAPI 不可用（数据库脚本未加载）');
        return;
    }

    Logger.info('[玉子的手机] AutoCardUpdaterAPI 可用');
    const data = api.exportTableAsJson?.();
    if (data) {
        const sheetKeys = Object.keys(data).filter((key) => key.startsWith('sheet_'));
        Logger.info(`[玉子的手机] 当前有 ${sheetKeys.length} 个表格:`, sheetKeys.map((key) => `${key} (${data[key]?.name})`));
    } else {
        Logger.info('[玉子的手机] 数据为空（可能还没有聊天或模板未加载）');
    }
    Logger.info('[玉子的手机] API 方法:', Object.keys(api));
}
