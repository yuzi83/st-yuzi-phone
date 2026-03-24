// modules/phone/phone-table-viewer.js
/**
 * 玉子的手机 - 表格查看器
 * 通用表：列表 + 详情
 * 三张专属表（消息记录表 / 动态表 / 论坛表）：对齐游戏界面中的手机交互风格
 * @fix P0-006 修复 CSS 注入风险
 * @fix P0-007 修复事件监听器泄漏
 * @fix P1-008 优化状态管理
 */

import { Logger } from './error-handler.js';
import {
    getTableData,
    navigateBack,
    setCurrentViewingSheet,
    resetDataVersion,
} from './phone-core.js';
import { PHONE_ICONS } from './phone-home.js';
import { detectSpecialTemplateForTable, detectGenericTemplateForTable } from './phone-beautify-templates.js';
import { escapeHtml, EventManager } from './utils.js';
import { bindTemplateDraftPreviewForViewer } from './table-viewer/template-runtime.js';
import { renderGenericTableViewer } from './table-viewer/generic-viewer.js';
import {
    detectSpecialTableType,
    renderSpecialTableViewer,
} from './table-viewer/special/runtime.js';

const VIEWER_INSTANCE_CLEANUP_KEY = '__yuziViewerCleanup';

export function renderTableViewer(container, sheetKey) {
    if (!(container instanceof HTMLElement)) return;

    const previousViewerCleanup = container[VIEWER_INSTANCE_CLEANUP_KEY];
    if (typeof previousViewerCleanup === 'function') {
        try {
            previousViewerCleanup();
        } catch (error) {
            Logger.warn('[玉子手机] 清理旧 viewer 实例失败:', error);
        }
    }

    const viewerEventManager = new EventManager();
    const ADD_ROW_MODAL_ID = 'phone-add-row-modal';
    let cleanupObserver = null;
    let viewerDisposed = false;

    const disposeViewerInstance = () => {
        if (viewerDisposed) return;
        viewerDisposed = true;
        viewerEventManager.dispose();
        if (cleanupObserver) {
            try { cleanupObserver.disconnect(); } catch {}
            cleanupObserver = null;
        }

        const modal = document.getElementById(ADD_ROW_MODAL_ID);
        const modalAny = /** @type {any} */ (modal);
        if (modalAny && typeof modalAny.__yuziCleanup === 'function') {
            try {
                modalAny.__yuziCleanup();
            } catch {}
        }

        if (container[VIEWER_INSTANCE_CLEANUP_KEY] === disposeViewerInstance) {
            delete container[VIEWER_INSTANCE_CLEANUP_KEY];
        }

        setCurrentViewingSheet(null);
    };

    container[VIEWER_INSTANCE_CLEANUP_KEY] = disposeViewerInstance;
    bindTemplateDraftPreviewForViewer(container, sheetKey, renderTableViewer);

    const rawData = getTableData();
    const sheet = rawData?.[sheetKey];

    if (!sheet || !sheet.content || !Array.isArray(sheet.content) || sheet.content.length === 0) {
        container.innerHTML = `
            <div class="phone-app-page">
                <div class="phone-nav-bar">
                    <button class="phone-nav-back">${PHONE_ICONS.back}<span>返回</span></button>
                    <span class="phone-nav-title">${escapeHtml(sheetKey)}</span>
                </div>
                <div class="phone-app-body">
                    <div class="phone-empty-msg">无法加载表格数据</div>
                </div>
            </div>
        `;
        container.querySelector('.phone-nav-back')?.addEventListener('click', navigateBack);
        return;
    }

    const rawHeaders = Array.isArray(sheet.content[0]) ? sheet.content[0] : [];
    const headers = rawHeaders.map((h, i) => String(h || '').trim() || `列${i + 1}`);
    const rows = sheet.content.slice(1);
    const tableName = sheet.name || sheetKey;

    const specialMatch = detectSpecialTemplateForTable({
        sheetKey,
        tableName,
        headers,
    });

    const specialType = specialMatch?.specialType || detectSpecialTableType(tableName);
    if (specialType) {
        setCurrentViewingSheet(sheetKey);
        resetDataVersion();
        renderSpecialTableViewer(container, {
            sheetKey,
            tableName,
            rows,
            headers,
            type: specialType,
            templateMatch: specialMatch || null,
        }, {
            viewerEventManager,
        });
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
        viewerEventManager,
        disposeViewerInstance,
        addRowModalId: ADD_ROW_MODAL_ID,
        onCleanupObserver: (observer) => {
            cleanupObserver = observer;
        },
    });
    return;
}
