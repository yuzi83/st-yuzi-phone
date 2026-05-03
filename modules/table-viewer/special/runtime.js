import { Logger } from '../../error-handler.js';
import { escapeHtmlAttr } from '../../utils/dom-escape.js';
import {
    resolveTemplateWithDraftForViewer,
    buildScopedCustomCss,
} from '../template-runtime.js';
import { normalizeSpecialStyleOptionsForViewer } from './field-reader.js';
import { renderMessageTable as renderMessageTablePage } from './message-viewer.js';

const logger = Logger.withScope({ scope: 'table-viewer/special-runtime', feature: 'table-viewer' });
const SPECIAL_SCOPE_CLASS = 'phone-special-template-scope';

const SPECIAL_TABLE_TYPES = {
    '消息记录表': 'message',
};

function getPlainTemplateOptionGroup(rawGroup) {
    return rawGroup && typeof rawGroup === 'object' && !Array.isArray(rawGroup)
        ? rawGroup
        : {};
}

export function detectSpecialTableType(tableName) {
    const name = String(tableName || '').trim();
    return SPECIAL_TABLE_TYPES[name] || null;
}

export function createSpecialTemplateStylePayload(templateMatch, specialType, viewMode = 'list') {
    const template = resolveTemplateWithDraftForViewer(templateMatch?.template);
    const specialTypeSafe = String(specialType || '').trim() || 'message';

    const defaultStyleOptions = normalizeSpecialStyleOptionsForViewer({}, specialTypeSafe);

    if (!template || !template.render) {
        return {
            className: `${SPECIAL_SCOPE_CLASS} phone-special-template-default`,
            styleAttr: '',
            scopedCss: '',
            templateId: '',
            styleOptions: defaultStyleOptions,
            structureOptions: {},
            typographyOptions: {},
            motionOptions: {},
            dataAttrs: `data-special-type="${escapeHtmlAttr(specialTypeSafe)}" data-special-view-mode="${escapeHtmlAttr(String(viewMode || 'list').trim() || 'list')}"`,
        };
    }

    const toVarName = (key) => String(key || '')
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .replace(/^([^a-zA-Z_])/, '_$1');
    const normalizeCssVarValue = (rawValue) => {
        if (rawValue === undefined || rawValue === null) return '';
        const text = String(rawValue).trim();
        if (!text || /[<>]/.test(text)) return '';
        return text;
    };

    const styleTokens = template.render?.styleTokens && typeof template.render.styleTokens === 'object'
        ? template.render.styleTokens
        : {};

    const styleOptions = normalizeSpecialStyleOptionsForViewer(template.render?.styleOptions, specialTypeSafe);
    const structureOptions = getPlainTemplateOptionGroup(template.render?.structureOptions);
    const typographyOptions = getPlainTemplateOptionGroup(template.render?.typographyOptions);
    const motionOptions = getPlainTemplateOptionGroup(template.render?.motionOptions);

    const conversationListOptions = getPlainTemplateOptionGroup(structureOptions.conversationList);
    const detailHeaderOptions = getPlainTemplateOptionGroup(structureOptions.detailHeader);
    const composeBarOptions = getPlainTemplateOptionGroup(structureOptions.composeBar);

    const safeVarEntries = Object.entries(styleTokens)
        .map(([rawKey, rawValue]) => {
            const varName = toVarName(rawKey);
            const value = String(rawValue ?? '').trim();
            if (!varName || !value) return null;
            if (/[<>]/.test(value)) return null;
            return [`--${varName}`, value];
        })
        .filter(Boolean);

    const styleOptionCssEntries = [
        ['--sp-opt-bubble-max-width-pct', `${Number(styleOptions.bubbleMaxWidthPct || 80)}%`],
        ['--sp-opt-avatar-radius',
            styleOptions.avatarShape === 'square'
                ? '0px'
                : (styleOptions.avatarShape === 'rounded' ? '10px' : '999px')],
        ['--sp-typo-nav-title-size', normalizeCssVarValue(typographyOptions.navTitleFontSize)],
        ['--sp-typo-nav-title-weight', normalizeCssVarValue(typographyOptions.navTitleFontWeight)],
        ['--sp-typo-conversation-title-size', normalizeCssVarValue(typographyOptions.conversationTitleFontSize)],
        ['--sp-typo-conversation-title-weight', normalizeCssVarValue(typographyOptions.conversationTitleFontWeight)],
        ['--sp-typo-conversation-preview-size', normalizeCssVarValue(typographyOptions.conversationPreviewFontSize)],
        ['--sp-typo-conversation-meta-size', normalizeCssVarValue(typographyOptions.conversationMetaFontSize)],
        ['--sp-typo-message-size', normalizeCssVarValue(typographyOptions.messageFontSize)],
        ['--sp-typo-message-line-height', normalizeCssVarValue(typographyOptions.messageLineHeight)],
        ['--sp-typo-message-meta-size', normalizeCssVarValue(typographyOptions.messageMetaFontSize)],
        ['--sp-typo-compose-status-size', normalizeCssVarValue(typographyOptions.composeStatusFontSize)],
        ['--sp-motion-fast-duration', normalizeCssVarValue(motionOptions.fastDuration)],
        ['--sp-motion-normal-duration', normalizeCssVarValue(motionOptions.normalDuration)],
        ['--sp-motion-hover-lift-y', normalizeCssVarValue(motionOptions.hoverLiftY)],
    ].filter(([, value]) => !!value);

    const styleAttr = [...safeVarEntries, ...styleOptionCssEntries]
        .map(([name, value]) => `${name}: ${escapeHtmlAttr(String(value || ''))};`)
        .join(' ');

    const templateId = String(template.id || '').trim();
    const safeTemplateIdForClass = templateId
        ? templateId.replace(/[^a-zA-Z0-9_-]/g, '_')
        : 'default';

    const className = `${SPECIAL_SCOPE_CLASS} phone-special-template-${safeTemplateIdForClass}`;

    const dataAttrEntries = [
        ['data-special-template-id', templateId],
        ['data-special-renderer-key', String(template.render?.rendererKey || '').trim()],
        ['data-special-type', specialTypeSafe],
        ['data-special-view-mode', String(viewMode || 'list').trim() || 'list'],
        ['data-style-density', String(styleOptions.density || '')],
        ['data-structure-show-conversation-subtitle', conversationListOptions.showSubtitle === false ? '0' : '1'],
        ['data-structure-show-last-message', conversationListOptions.showLastMessage === false ? '0' : '1'],
        ['data-structure-show-detail-subtitle', detailHeaderOptions.showSubtitle === false ? '0' : '1'],
        ['data-structure-show-compose-status', composeBarOptions.showStatusText === false ? '0' : '1'],
        ['data-structure-show-compose-template-note', composeBarOptions.showTemplateNote === false ? '0' : '1'],
        ['data-structure-show-compose-retry', composeBarOptions.showRetryButton === false ? '0' : '1'],
    ];

    const dataAttrs = dataAttrEntries
        .filter(([name]) => !!name)
        .map(([name, value]) => `${name}="${escapeHtmlAttr(String(value || ''))}"`)
        .join(' ');

    const customCss = String(template.render?.customCss || '').trim();
    const scopedCss = customCss
        ? buildScopedCustomCss(customCss, `.phone-special-template-${safeTemplateIdForClass}`)
        : '';

    return {
        className,
        styleAttr,
        scopedCss,
        templateId,
        dataAttrs,
        styleOptions,
        structureOptions,
        typographyOptions,
        motionOptions,
    };
}

export function createSpecialTableViewerRuntime(container, context, deps = {}) {
    if (!(container instanceof HTMLElement) || !context) {
        return null;
    }

    const { sheetKey, tableName, rows, headers, type, templateMatch } = context;
    const viewerRuntime = deps.viewerRuntime;
    const viewerEventManager = deps.viewerEventManager || viewerRuntime?.viewerEventManager;
    const renderMessageTable = deps.renderMessageTable || renderMessageTablePage;
    const createStylePayload = deps.createSpecialTemplateStylePayload || createSpecialTemplateStylePayload;

    const start = () => {
        if (type !== 'message') {
            logger.warn({
                action: 'start.skip',
                message: '专属表 runtime 跳过：未支持的专属类型',
                context: {
                    sheetKey: String(sheetKey || ''),
                    tableName: String(tableName || ''),
                    type: String(type || ''),
                },
            });
            return false;
        }

        renderMessageTable(container, { sheetKey, tableName, rows, headers, templateMatch, type }, {
            createSpecialTemplateStylePayload: createStylePayload,
            viewerRuntime,
            viewerEventManager,
        });
        return true;
    };

    return {
        viewerRuntime,
        viewerEventManager,
        start,
    };
}

export function renderSpecialTableViewer(container, context, deps = {}) {
    const runtime = createSpecialTableViewerRuntime(container, context, deps);
    if (!runtime) return false;
    return runtime.start();
}
