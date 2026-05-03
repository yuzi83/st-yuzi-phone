// modules/table-viewer/render.js
/**
 * 玉子的手机 - 表格查看器入口
 *
 * 通用表：列表 + 详情。
 * 专属表：消息记录表对齐游戏界面中的手机聊天交互风格。
 */

import { Logger } from '../error-handler.js';
import { navigateBack } from '../phone-core/routing.js';
import { PHONE_ICONS } from '../phone-home/icons.js';
import { detectSpecialTemplateForTable, detectGenericTemplateForTable } from '../phone-beautify-templates/matcher.js';
import { renderTableViewerLoadError, resolveTableViewerContext } from './context.js';
import { createViewerRuntime } from './runtime.js';
import { renderGenericTableViewer } from './generic-viewer.js';
import {
    detectSpecialTableType,
    createSpecialTableViewerRuntime,
} from './special/runtime.js';

const logger = Logger.withScope({ scope: 'table-viewer/render', feature: 'table-viewer' });

export function renderTableViewer(container, sheetKey) {
    if (!(container instanceof HTMLElement)) {
        logger.warn({
            action: 'render.skip',
            message: '表格查看器渲染跳过：container 无效',
            context: { sheetKey: String(sheetKey || '') },
        });
        return;
    }

    const viewerRuntime = createViewerRuntime({
        container,
        sheetKey,
        addRowModalId: 'phone-add-row-modal',
        rerenderViewer: renderTableViewer,
    });
    if (!viewerRuntime) {
        logger.warn({
            action: 'runtime.create.failed',
            message: '表格查看器 runtime 创建失败',
            context: { sheetKey: String(sheetKey || '') },
        });
        return;
    }

    const viewerContext = resolveTableViewerContext(sheetKey);
    if (!viewerContext) {
        logger.warn({
            action: 'context.resolve.failed',
            message: '表格上下文解析失败',
            context: { sheetKey: String(sheetKey || '') },
        });
        viewerRuntime.dispose();
        renderTableViewerLoadError(container, {
            sheetKey,
            title: sheetKey,
            backIconHtml: PHONE_ICONS.back,
            navigateBack,
            runtime: viewerRuntime,
        });
        return;
    }

    viewerRuntime.startViewerSession();

    const {
        rawHeaders,
        headers,
        rows,
        tableName,
    } = viewerContext;

    const specialMatch = detectSpecialTemplateForTable({
        sheetKey,
        tableName,
        headers,
    });

    const specialType = specialMatch?.specialType || detectSpecialTableType(tableName);

    if (specialType) {
        const specialRuntime = createSpecialTableViewerRuntime(container, {
            sheetKey,
            tableName,
            rows,
            headers,
            type: specialType,
            templateMatch: specialMatch || null,
        }, {
            viewerRuntime,
        });
        specialRuntime?.start();
        return;
    }

    const genericMatch = detectGenericTemplateForTable({
        sheetKey,
        tableName,
        headers,
    });

    renderGenericTableViewer(container, {
        sheetKey,
        tableName,
        headers,
        rawHeaders,
        rows,
        genericMatch,
    }, {
        viewerRuntime,
    });

}
