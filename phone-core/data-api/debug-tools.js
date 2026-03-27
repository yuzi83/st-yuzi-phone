import { Logger } from '../../error-handler.js';
import { getDB } from '../db-bridge.js';

const logger = Logger.withScope({ scope: 'phone-core/data-api/debug-tools', feature: 'db-api' });

export function debugCheckAPI() {
    if (!window.__YUZI_PHONE_DEBUG) return;

    const api = getDB();
    if (!api) {
        logger.info({
            action: 'api.debug',
            message: 'AutoCardUpdaterAPI 不可用（数据库脚本未加载）',
        });
        return;
    }

    const data = api.exportTableAsJson?.();
    const sheetKeys = data ? Object.keys(data).filter((key) => key.startsWith('sheet_')) : [];
    const sheetSummaries = sheetKeys.map((key) => `${key} (${data[key]?.name})`);

    logger.info({
        action: 'api.debug',
        message: '数据库 API 调试快照',
        context: {
            apiAvailable: true,
            dataAvailable: !!data,
            sheetCount: sheetKeys.length,
            sheetSummaries,
            methods: Object.keys(api),
        },
    });
}
