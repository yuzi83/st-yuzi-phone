// modules/utils/dom-escape.js
/**
 * 玉子的手机 - DOM/HTML 转义工具
 *
 * 提供项目内统一的 HTML 文本与属性转义、安全字符串处理工具。
 * 这些函数被模板渲染层（list/detail/special-viewer/settings-app/page-builders 等）
 * 大量复用，逻辑必须保持一致——任何修改都要同时考虑：
 *   1. 是否破坏既有渲染输出（影响所有调用方）
 *   2. 是否引入 XSS 风险（escape 路径不能放过 `<script>` 这种内容）
 */

/**
 * 转义 HTML 特殊字符
 * @param {string} str - 要转义的字符串
 * @returns {string} 转义后的字符串
 */
export function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str || '');
    return div.innerHTML;
}

/**
 * 转义 HTML 属性值
 * @param {string} value - 要转义的值
 * @returns {string} 转义后的字符串
 */
export function escapeHtmlAttr(value) {
    return escapeHtml(String(value || ''));
}

/**
 * 安全转换为字符串
 * @param {any} value - 要转换的值
 * @returns {string} 字符串
 */
export function safeText(value) {
    return String(value ?? '');
}

/**
 * 安全去除首尾空格
 * @param {any} value - 要处理的值
 * @returns {string} 处理后的字符串
 */
export function safeTrim(value) {
    return String(value ?? '').trim();
}

/**
 * HTML 安全净化（兼容别名，内部使用 escapeHtml）
 * @param {string} input - 原始字符串
 * @returns {string}
 */
export function sanitizeHTML(input) {
    return escapeHtml(input);
}
