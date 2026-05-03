// modules/utils/sanitize.js
/**
 * 玉子的手机 - URL / CSS 安全净化工具
 *
 * - sanitizeUrl：限制 URL 协议（仅允许 http / https / data / blob）
 * - escapeCssUrl：CSS url() 表达式中的特殊字符转义（与 sanitizeUrl 联动）
 * - sanitizeCSS：模板运行时使用，过滤危险的 expression() / javascript: / @import 等入口
 *
 * ⚠️ 这些函数是 XSS 防线的一部分，修改前必须确认对每条危险模式的覆盖仍然有效。
 */

/**
 * URL 安全检查
 * @param {string} url - URL 字符串
 * @returns {string}
 */
export function sanitizeUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) return '';

    try {
        const normalized = new URL(raw, window.location.origin);
        const protocol = normalized.protocol.toLowerCase();
        if (['http:', 'https:', 'data:', 'blob:'].includes(protocol)) {
            return normalized.href;
        }
    } catch {
        if (raw.startsWith('data:') || raw.startsWith('blob:') || raw.startsWith('/')) {
            return raw;
        }
    }

    return '';
}

/**
 * CSS url() 安全转义
 * @param {string} url - URL 字符串
 * @returns {string}
 */
export function escapeCssUrl(url) {
    const safeUrl = sanitizeUrl(url);
    return safeUrl.replace(/["'()\\\n\r]/g, (match) => `\\${match}`);
}

/**
 * CSS 文本净化（供模板运行时使用）
 * - 移除 HTML 标签残留
 * - 拦截明显危险的 `expression()` / `javascript:` / `vbscript:`
 * - 过滤 `@import javascript:` 一类危险入口
 * @param {string} cssText - 原始 CSS 文本
 * @returns {string}
 */
export function sanitizeCSS(cssText) {
    const raw = String(cssText || '').trim();
    if (!raw) return '';

    const withoutTags = raw.replace(/<[^>]*>/g, '');
    const blockedPatterns = [
        /expression\s*\(/gi,
        /javascript\s*:/gi,
        /vbscript\s*:/gi,
        /behavior\s*:/gi,
        /@import\s+(?:url\()?\s*["']?\s*javascript:/gi,
    ];

    let sanitized = withoutTags;
    blockedPatterns.forEach((pattern) => {
        sanitized = sanitized.replace(pattern, '');
    });

    return sanitized.trim();
}
