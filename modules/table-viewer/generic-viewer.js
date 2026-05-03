import { Logger } from '../error-handler.js';
import { createGenericTableViewerRuntime } from './generic-runtime.js';

const logger = Logger.withScope({ scope: 'table-viewer/generic-viewer', feature: 'table-viewer' });

export function renderGenericTableViewer(container, context, hooks = {}) {
    if (!(container instanceof HTMLElement)) {
        logger.warn({
            action: 'render.skip',
            message: '通用表渲染跳过：container 无效',
            context: {
                sheetKey: String(context?.sheetKey || ''),
                tableName: String(context?.tableName || ''),
            },
        });
        return;
    }

    const viewerRuntime = hooks.viewerRuntime;
    const runtime = createGenericTableViewerRuntime(container, context, {
        ...hooks,
        viewerRuntime,
    });
    if (!runtime) {
        logger.warn({
            action: 'runtime.create.failed',
            message: '通用表 runtime 创建失败',
            context: {
                sheetKey: String(context?.sheetKey || ''),
                tableName: String(context?.tableName || ''),
            },
        });
        return;
    }

    runtime.start();
}
