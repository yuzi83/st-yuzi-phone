// modules/phone/phone-table-viewer.js
/**
 * 玉子的手机 - 表格查看器
 * 通用表：列表 + 详情
 * 三张专属表（消息记录表 / 动态表 / 论坛表）：对齐游戏界面中的手机交互风格
 * @fix P0-006 修复 CSS 注入风险
 * @fix P0-007 修复事件监听器泄漏
 * @fix P1-008 优化状态管理
 */

import { navigateBack } from './phone-core/routing.js';
import { PHONE_ICONS } from './phone-home.js';
import { detectSpecialTemplateForTable, detectGenericTemplateForTable } from './phone-beautify-templates/matcher.js';
import { renderTableViewerLoadError, resolveTableViewerContext } from './table-viewer/context.js';
import { createViewerRuntime } from './table-viewer/runtime.js';
import { renderGenericTableViewer } from './table-viewer/generic-viewer.js';
import {
    detectSpecialTableType,
    createSpecialTableViewerRuntime,
} from './table-viewer/special/runtime.js';

export function renderTableViewer(container, sheetKey) {
    if (!(container instanceof HTMLElement)) return;

    const viewerRuntime = createViewerRuntime({
        container,
        sheetKey,
        addRowModalId: 'phone-add-row-modal',
        rerenderViewer: renderTableViewer,
    });
    if (!viewerRuntime) return;

    const viewerContext = resolveTableViewerContext(sheetKey);
    if (!viewerContext) {
        viewerRuntime.dispose();
        renderTableViewerLoadError(container, {
            sheetKey,
            title: sheetKey,
            backIconHtml: PHONE_ICONS.back,
            navigateBack,
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

    // ===== 通用表格渲染（主列表：行锁定+删除；子页面：字段锁定+编辑保存） =====
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
    return;
}
