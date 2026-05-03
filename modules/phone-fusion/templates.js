import { PHONE_ICONS } from '../phone-home/icons.js';
import { escapeHtml, escapeHtmlAttr } from '../utils/dom-escape.js';

export function buildFusionPageHtml() {
    return `
        <div class="phone-app-page phone-fusion-page">
            <div class="phone-nav-bar">
                <button type="button" class="phone-nav-back">${PHONE_ICONS.back}<span>返回</span></button>
                <span class="phone-nav-title">模板缝合</span>
            </div>
            <div class="phone-app-body phone-fusion-body">
                <div class="phone-fusion-desc">
                    从两个模板中选择需要的表格区块，自动合并为新模板
                </div>
                <div class="phone-fusion-import-row">
                    <div class="phone-fusion-import-card" id="phone-import-a">
                        ${PHONE_ICONS.upload}
                        <span>导入模板 A</span>
                        <span class="phone-fusion-file-name" id="phone-fname-a"></span>
                    </div>
                    <div class="phone-fusion-import-card" id="phone-import-b">
                        ${PHONE_ICONS.upload}
                        <span>导入模板 B</span>
                        <span class="phone-fusion-file-name" id="phone-fname-b"></span>
                    </div>
                </div>
                <div id="phone-fusion-compare" class="phone-fusion-compare"></div>
                <div id="phone-fusion-actions" class="phone-fusion-actions" style="display:none;">
                    <button type="button" class="phone-fusion-merge-btn" id="phone-fusion-merge">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
                        <span>合并选中的表格</span>
                    </button>
                </div>
                <div id="phone-fusion-result" class="phone-fusion-result"></div>
            </div>
        </div>
    `;
}

export function buildFusionCompareRowHtml({ key, name, cols, source, sourceClass, conflict }) {
    if (conflict) {
        return `
            <div class="phone-fusion-table-row phone-fusion-conflict" data-key="${escapeHtmlAttr(key)}">
                <span class="phone-fusion-col-check">
                    <input type="checkbox" class="phone-fusion-check" checked>
                </span>
                <span class="phone-fusion-col-name">${escapeHtml(name)}</span>
                <span class="phone-fusion-col-source ${sourceClass}">
                    <select class="phone-fusion-source-select" data-key="${escapeHtmlAttr(key)}">
                        <option value="A">模板 A</option>
                        <option value="B">模板 B</option>
                    </select>
                </span>
                <span class="phone-fusion-col-cols">${cols}</span>
            </div>
        `;
    }

    return `
        <div class="phone-fusion-table-row" data-key="${escapeHtmlAttr(key)}">
            <span class="phone-fusion-col-check">
                <input type="checkbox" class="phone-fusion-check" checked>
            </span>
            <span class="phone-fusion-col-name">${escapeHtml(name)}</span>
            <span class="phone-fusion-col-source ${sourceClass}">${source}</span>
            <span class="phone-fusion-col-cols">${cols}</span>
        </div>
    `;
}

export function buildFusionCompareHtml(rowsHtml) {
    return `
        <div class="phone-fusion-table">
            <div class="phone-fusion-table-header">
                <span class="phone-fusion-col-check"></span>
                <span class="phone-fusion-col-name">表格名称</span>
                <span class="phone-fusion-col-source">来源</span>
                <span class="phone-fusion-col-cols">列数</span>
            </div>
            ${rowsHtml}
        </div>
    `;
}

export function buildFusionEmptyResultHtml() {
    return `<div class="phone-empty-msg">未选中任何表格</div>`;
}

export function buildFusionSuccessResultHtml(activeUrl, sheetCount) {
    return `
        <div class="phone-fusion-success">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="32" height="32" stroke-linecap="round"><path d="M5 12l5 5L19 7"/></svg>
            <div class="phone-fusion-success-text">
                <strong>合并完成</strong>
                <span>${sheetCount} 个表格已合并</span>
            </div>
            <a class="phone-fusion-download-btn" href="${activeUrl}" download="merged_template.json">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round"><path d="M12 4v12M12 16l-4-4M12 16l4-4"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>
                <span>下载合并模板</span>
            </a>
        </div>
    `;
}
