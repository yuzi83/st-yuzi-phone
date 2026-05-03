import { sanitizeCSS } from '../utils/sanitize.js';
import { EventManager } from '../utils/event-manager.js';

export const VIEWER_ANNOTATION_META_KEYS = new Set([
    '_comment',
    '_type',
    '_enum',
    '_range',
    '_example',
    '_risk',
    '_default',
]);

export function isAnnotatedValueWrapperForViewer(raw) {
    return !!raw
        && typeof raw === 'object'
        && !Array.isArray(raw)
        && Object.prototype.hasOwnProperty.call(raw, 'value');
}

export function unwrapAnnotatedValueForViewer(raw) {
    return isAnnotatedValueWrapperForViewer(raw) ? raw.value : raw;
}

export function stripAnnotationStructureForViewer(raw) {
    const value = unwrapAnnotatedValueForViewer(raw);

    if (Array.isArray(value)) {
        return value.map(item => stripAnnotationStructureForViewer(item));
    }

    if (!value || typeof value !== 'object') {
        return value;
    }

    const result = {};
    Object.entries(value).forEach(([key, item]) => {
        const safeKey = String(key || '');
        if (safeKey.startsWith('_') && VIEWER_ANNOTATION_META_KEYS.has(safeKey)) return;
        result[key] = stripAnnotationStructureForViewer(item);
    });

    return result;
}

export function isPlainObjectForViewer(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function resolveTemplateWithDraftForViewer(template) {
    const src = stripAnnotationStructureForViewer(template);
    if (!src || typeof src !== 'object') return src;

    const next = JSON.parse(JSON.stringify(src));
    const advanced = stripAnnotationStructureForViewer(next.render?.advanced || {});
    const hasLegacyCss = typeof next.render?.customCss === 'string' && next.render.customCss.trim();
    const enabled = typeof advanced?.customCssEnabled === 'boolean'
        ? advanced.customCssEnabled
        : !!hasLegacyCss;

    const candidateCss = String(unwrapAnnotatedValueForViewer(advanced?.customCss ?? next.render?.customCss) || '').trim();
    next.render = isPlainObjectForViewer(next.render) ? next.render : {};
    next.render.advanced = {
        customCssEnabled: enabled,
        customCss: candidateCss,
    };
    next.render.customCss = enabled ? candidateCss : '';

    return next;
}

export function buildScopedCustomCss(customCssText, scopeSelector) {
    const css = sanitizeCSS(String(customCssText || '').trim());
    const scope = String(scopeSelector || '').trim();
    if (!css || !scope) return '';

    const skipWhitespace = (text, start) => {
        let i = start;
        while (i < text.length && /\s/.test(text[i])) i += 1;
        return i;
    };

    const findMatchingBrace = (text, openBraceIndex) => {
        if (openBraceIndex < 0 || openBraceIndex >= text.length || text[openBraceIndex] !== '{') return -1;

        let depth = 0;
        let inString = '';
        let inComment = false;

        for (let i = openBraceIndex; i < text.length; i += 1) {
            const ch = text[i];
            const next = text[i + 1];

            if (inComment) {
                if (ch === '*' && next === '/') {
                    inComment = false;
                    i += 1;
                }
                continue;
            }

            if (inString) {
                if (ch === '\\') {
                    i += 1;
                    continue;
                }
                if (ch === inString) {
                    inString = '';
                }
                continue;
            }

            if (ch === '/' && next === '*') {
                inComment = true;
                i += 1;
                continue;
            }

            if (ch === '"' || ch === '\'') {
                inString = ch;
                continue;
            }

            if (ch === '{') {
                depth += 1;
                continue;
            }

            if (ch === '}') {
                depth -= 1;
                if (depth === 0) {
                    return i;
                }
            }
        }

        return -1;
    };

    const splitSelectorList = (selectorText) => {
        const selectors = [];
        let current = '';
        let depthParen = 0;
        let depthBracket = 0;
        let inString = '';

        for (let i = 0; i < selectorText.length; i += 1) {
            const ch = selectorText[i];

            if (inString) {
                current += ch;
                if (ch === '\\') {
                    const next = selectorText[i + 1];
                    if (next) {
                        current += next;
                        i += 1;
                    }
                    continue;
                }
                if (ch === inString) {
                    inString = '';
                }
                continue;
            }

            if (ch === '"' || ch === '\'') {
                inString = ch;
                current += ch;
                continue;
            }

            if (ch === '(') depthParen += 1;
            if (ch === ')') depthParen = Math.max(0, depthParen - 1);
            if (ch === '[') depthBracket += 1;
            if (ch === ']') depthBracket = Math.max(0, depthBracket - 1);

            if (ch === ',' && depthParen === 0 && depthBracket === 0) {
                const part = current.trim();
                if (part) selectors.push(part);
                current = '';
                continue;
            }

            current += ch;
        }

        const tail = current.trim();
        if (tail) selectors.push(tail);
        return selectors;
    };

    const scopeSelectorList = (selectorText) => {
        const list = splitSelectorList(selectorText);
        if (list.length <= 0) return '';

        const scopedList = list.map((sel) => {
            if (sel.startsWith(scope)) return sel;
            if (sel.startsWith(':root')) {
                return sel.replace(/^:root\b/, scope);
            }
            return `${scope} ${sel}`;
        });

        return scopedList.join(', ');
    };

    const transformRules = (source) => {
        let result = '';
        let cursor = 0;

        while (cursor < source.length) {
            const ruleStart = skipWhitespace(source, cursor);
            if (ruleStart >= source.length) break;

            const braceIndex = source.indexOf('{', ruleStart);
            if (braceIndex < 0) {
                result += source.slice(ruleStart).trim();
                break;
            }

            const prelude = source.slice(ruleStart, braceIndex).trim();
            const closeIndex = findMatchingBrace(source, braceIndex);
            if (closeIndex < 0) {
                break;
            }

            const blockBody = source.slice(braceIndex + 1, closeIndex);

            if (!prelude) {
                cursor = closeIndex + 1;
                continue;
            }

            if (prelude.startsWith('@')) {
                const atRule = prelude.toLowerCase();
                if (atRule.startsWith('@media') || atRule.startsWith('@supports') || atRule.startsWith('@document') || atRule.startsWith('@layer')) {
                    const nested = transformRules(blockBody);
                    result += `${prelude} { ${nested} }\n`;
                } else {
                    result += `${prelude} { ${blockBody} }\n`;
                }
                cursor = closeIndex + 1;
                continue;
            }

            const scopedPrelude = scopeSelectorList(prelude);
            if (scopedPrelude) {
                result += `${scopedPrelude} { ${blockBody} }\n`;
            }

            cursor = closeIndex + 1;
        }

        return result.trim();
    };

    return transformRules(css);
}

export function bindTemplateDraftPreviewForViewer(container, sheetKey, renderTableViewer, viewerRuntime = null) {
    if (!(container instanceof HTMLElement)) return;

    const host = /** @type {any} */ (container);
    const prevCleanup = host.__yuziDraftPreviewCleanup;
    if (typeof prevCleanup === 'function') {
        try {
            prevCleanup();
        } catch {}
    }

    const runtime = viewerRuntime && typeof viewerRuntime === 'object' ? viewerRuntime : null;
    const previewEventManager = runtime?.addEventListener
        ? null
        : new EventManager(`table-viewer-draft-preview:${sheetKey || 'unknown'}`);
    let disposed = false;

    const cleanupDraftPreview = () => {
        if (disposed) return;
        disposed = true;
        previewEventManager?.dispose?.();
        if (host.__yuziDraftPreviewCleanup === cleanupDraftPreview) {
            delete host.__yuziDraftPreviewCleanup;
        }
    };

    const rerender = () => {
        if (!container.isConnected) return;
        renderTableViewer(container, sheetKey);
    };

    const bindListener = runtime?.addEventListener
        ? (...args) => runtime.addEventListener(...args)
        : (...args) => previewEventManager.add(...args);
    const observeDisconnection = runtime?.observeDisconnection
        ? (...args) => runtime.observeDisconnection(...args)
        : (...args) => previewEventManager.observeDisconnection(...args);

    bindListener(window, 'yuzi-phone-style-draft-updated', rerender);
    bindListener(window, 'yuzi-phone-style-draft-cleared', rerender);

    observeDisconnection(container, () => {
        cleanupDraftPreview();
    }, {
        observerRoot: document.body,
        childList: true,
        subtree: true,
    });

    host.__yuziDraftPreviewCleanup = cleanupDraftPreview;
}

