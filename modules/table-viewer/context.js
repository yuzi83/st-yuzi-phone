import { getTableData } from '../phone-core/data-api.js';
import { escapeHtml } from '../utils/dom-escape.js';

export function resolveTableViewerContext(sheetKey) {
    const rawData = getTableData();
    const sheet = rawData?.[sheetKey];
    if (!sheet || !sheet.content || !Array.isArray(sheet.content) || sheet.content.length === 0) {
        return null;
    }

    const rawHeaders = Array.isArray(sheet.content[0]) ? sheet.content[0] : [];
    const headers = rawHeaders.map((header, index) => String(header || '').trim() || `列${index + 1}`);
    const rows = sheet.content.slice(1);
    const tableName = sheet.name || sheetKey;

    return {
        rawData,
        sheet,
        sheetKey,
        rawHeaders,
        headers,
        rows,
        tableName,
    };
}

export function renderTableViewerLoadError(container, options = {}) {
    if (!(container instanceof HTMLElement)) return false;

    const {
        sheetKey = '',
        title = sheetKey,
        message = '无法加载表格数据',
        backIconHtml = '',
        navigateBack,
        runtime = null,
    } = options;

    container.innerHTML = `
        <div class="phone-app-page">
            <div class="phone-nav-bar">
                <button class="phone-nav-back">${backIconHtml}<span>返回</span></button>
                <span class="phone-nav-title">${escapeHtml(String(title || sheetKey || ''))}</span>
            </div>
            <div class="phone-app-body">
                <div class="phone-empty-msg">${escapeHtml(String(message || '无法加载表格数据'))}</div>
            </div>
        </div>
    `;

    const backButton = container.querySelector('.phone-nav-back');
    if (backButton instanceof HTMLElement && typeof navigateBack === 'function') {
        if (runtime && typeof runtime.addEventListener === 'function' && typeof runtime.isDisposed === 'function' && !runtime.isDisposed()) {
            runtime.addEventListener(backButton, 'click', navigateBack);
        } else {
            backButton.addEventListener('click', navigateBack);
        }
    }

    return true;
}
