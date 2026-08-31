// modules/table-viewer/render.js
/**
 * 玉子的手机 - 表格查看器入口
 *
 * 通用表：列表 + 详情。
 */

import { Logger } from '../error-handler.js';
import { navigateBack } from '../phone-core/routing.js';
import { detectGenericTemplateForTable } from '../phone-beautify-templates/matcher.js';
import { buildTableNavigationContext } from '../table-navigation/catalog.js';
import { renderTableViewerLoadError, resolveTableViewerContext } from './context.js';
import { createViewerRuntime } from './runtime.js';
import { renderGenericTableViewer } from './generic-viewer.js';

const logger = Logger.withScope({ scope: 'table-viewer/render', feature: 'table-viewer' });

export function renderTableViewer(container, sheetKey, options = {}) {
    if (!(container instanceof HTMLElement)) {
        logger.warn({
            action: 'render.skip',
            message: '表格查看器渲染跳过：container 无效',
            context: { sheetKey: String(sheetKey || '') },
        });
        return;
    }

    const forceGenericList = options?.forceGenericList === true;
    const navigationSheetKey = String(options?.navigationSheetKey || sheetKey || '').trim();
    const rerenderViewer = (nextContainer, nextSheetKey) => {
        renderTableViewer(nextContainer, nextSheetKey, {
            ...options,
            initialTableData: undefined,
            initialNavigationContext: undefined,
        });
    };

    const viewerRuntime = createViewerRuntime({
        container,
        sheetKey,
        addRowModalId: 'phone-add-row-modal',
        rerenderViewer,
    });
    if (!viewerRuntime) {
        logger.warn({
            action: 'runtime.create.failed',
            message: '表格查看器 runtime 创建失败',
            context: { sheetKey: String(sheetKey || '') },
        });
        return;
    }

    const viewerContext = resolveTableViewerContext(sheetKey, {
        initialTableData: options.initialTableData,
    });
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
            navigateBack,
            runtime: viewerRuntime,
        });
        return;
    }

    viewerRuntime.startViewerSession();

    const {
        rawData,
        sheet,
        rawHeaders,
        headers,
        rows,
        tableName,
    } = viewerContext;
    const navigationContext = options.initialNavigationContext
        || buildTableNavigationContext(rawData);

    const genericMatch = detectGenericTemplateForTable({
        sheetKey,
        tableName,
        headers,
    });

    renderGenericTableViewer(container, {
        sheetKey,
        sheet,
        rawData,
        navigationContext,
        navigationSheetKey,
        tableName,
        headers,
        rawHeaders,
        rows,
        genericMatch,
    }, {
        viewerRuntime,
        forceListMode: forceGenericList,
        reviewNavigationAttemptId: options.reviewNavigationAttemptId,
    });

}
