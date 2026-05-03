import { escapeHtmlAttr } from '../utils/dom-escape.js';
import { resolveTemplateWithDraftForViewer, buildScopedCustomCss } from './template-runtime.js';
import { normalizeGenericFieldBindingsForViewer } from './row-view-model.js';

const DEFAULT_LAYOUT_OPTIONS = Object.freeze({
    pageMode: 'framed',
    navMode: 'solid',
    listContainerMode: 'table',
    listItemMode: 'row',
    listMetaMode: 'inline',
    detailContainerMode: 'plain',
    detailFieldLayout: 'grid-2',
    detailGroupMode: 'section',
    actionBarMode: 'sticky',
    buttonShape: 'rounded',
    buttonSize: 'md',
    density: 'normal',
    shadowLevel: 'soft',
    radiusLevel: 'lg',
    showListDivider: true,
    showDetailDivider: false,
});

const ALLOWED_LAYOUT_OPTIONS = Object.freeze({
    pageMode: ['framed', 'plain'],
    navMode: ['glass', 'solid', 'transparent'],
    listContainerMode: ['card', 'plain', 'table'],
    listItemMode: ['row', 'card', 'compact'],
    listMetaMode: ['inline', 'stacked', 'hidden'],
    detailContainerMode: ['card', 'plain', 'table'],
    detailFieldLayout: ['stack', 'inline', 'grid-2', 'grid-3'],
    detailGroupMode: ['section', 'flat'],
    actionBarMode: ['inline', 'sticky', 'hidden'],
    buttonShape: ['pill', 'rounded', 'square'],
    buttonSize: ['xs', 'sm', 'md', 'lg'],
    density: ['compact', 'normal', 'loose'],
    shadowLevel: ['none', 'soft', 'mid', 'strong'],
    radiusLevel: ['none', 'sm', 'md', 'lg', 'xl'],
});

function toVarName(key) {
    return String(key || '')
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .replace(/^([^a-zA-Z_])/, '_$1');
}

function normalizeEnum(value, allowed, fallback) {
    const text = String(value ?? '').trim();
    if (!text) return fallback;
    return allowed.includes(text) ? text : fallback;
}

function normalizeBool(value, fallback) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const text = String(value ?? '').trim().toLowerCase();
    if (!text) return fallback;
    if (['1', 'true', 'yes', 'on', 'y'].includes(text)) return true;
    if (['0', 'false', 'no', 'off', 'n'].includes(text)) return false;
    return fallback;
}

function normalizeLayoutOptions(rawLayoutOptions) {
    const src = rawLayoutOptions && typeof rawLayoutOptions === 'object' && !Array.isArray(rawLayoutOptions)
        ? rawLayoutOptions
        : {};

    return {
        pageMode: normalizeEnum(src.pageMode, ALLOWED_LAYOUT_OPTIONS.pageMode, DEFAULT_LAYOUT_OPTIONS.pageMode),
        navMode: normalizeEnum(src.navMode, ALLOWED_LAYOUT_OPTIONS.navMode, DEFAULT_LAYOUT_OPTIONS.navMode),
        listContainerMode: normalizeEnum(src.listContainerMode, ALLOWED_LAYOUT_OPTIONS.listContainerMode, DEFAULT_LAYOUT_OPTIONS.listContainerMode),
        listItemMode: normalizeEnum(src.listItemMode, ALLOWED_LAYOUT_OPTIONS.listItemMode, DEFAULT_LAYOUT_OPTIONS.listItemMode),
        listMetaMode: normalizeEnum(src.listMetaMode, ALLOWED_LAYOUT_OPTIONS.listMetaMode, DEFAULT_LAYOUT_OPTIONS.listMetaMode),
        detailContainerMode: normalizeEnum(src.detailContainerMode, ALLOWED_LAYOUT_OPTIONS.detailContainerMode, DEFAULT_LAYOUT_OPTIONS.detailContainerMode),
        detailFieldLayout: normalizeEnum(src.detailFieldLayout, ALLOWED_LAYOUT_OPTIONS.detailFieldLayout, DEFAULT_LAYOUT_OPTIONS.detailFieldLayout),
        detailGroupMode: normalizeEnum(src.detailGroupMode, ALLOWED_LAYOUT_OPTIONS.detailGroupMode, DEFAULT_LAYOUT_OPTIONS.detailGroupMode),
        actionBarMode: normalizeEnum(src.actionBarMode, ALLOWED_LAYOUT_OPTIONS.actionBarMode, DEFAULT_LAYOUT_OPTIONS.actionBarMode),
        buttonShape: normalizeEnum(src.buttonShape, ALLOWED_LAYOUT_OPTIONS.buttonShape, DEFAULT_LAYOUT_OPTIONS.buttonShape),
        buttonSize: normalizeEnum(src.buttonSize, ALLOWED_LAYOUT_OPTIONS.buttonSize, DEFAULT_LAYOUT_OPTIONS.buttonSize),
        density: normalizeEnum(src.density, ALLOWED_LAYOUT_OPTIONS.density, DEFAULT_LAYOUT_OPTIONS.density),
        shadowLevel: normalizeEnum(src.shadowLevel, ALLOWED_LAYOUT_OPTIONS.shadowLevel, DEFAULT_LAYOUT_OPTIONS.shadowLevel),
        radiusLevel: normalizeEnum(src.radiusLevel, ALLOWED_LAYOUT_OPTIONS.radiusLevel, DEFAULT_LAYOUT_OPTIONS.radiusLevel),
        showListDivider: normalizeBool(src.showListDivider, DEFAULT_LAYOUT_OPTIONS.showListDivider),
        showDetailDivider: normalizeBool(src.showDetailDivider, DEFAULT_LAYOUT_OPTIONS.showDetailDivider),
    };
}

function normalizeCssVarValue(rawValue) {
    if (rawValue === undefined || rawValue === null) return '';
    const text = String(rawValue).trim();
    if (!text || /[<>]/.test(text)) return '';
    return text;
}

export function createGenericTemplateStylePayload(genericMatch, viewMode = 'list') {
    const template = resolveTemplateWithDraftForViewer(genericMatch?.template);

    if (!template || template?.render?.rendererKey !== 'generic_table') {
        return {
            className: '',
            styleAttr: '',
            scopedCss: '',
            templateId: '',
            dataAttrs: '',
            layoutOptions: { ...DEFAULT_LAYOUT_OPTIONS },
            fieldBindings: normalizeGenericFieldBindingsForViewer({}),
            structureOptions: {},
            typographyOptions: {},
            motionOptions: {},
        };
    }

    const styleTokens = template.render?.styleTokens && typeof template.render.styleTokens === 'object'
        ? template.render.styleTokens
        : {};
    const fieldBindings = normalizeGenericFieldBindingsForViewer(template.render?.fieldBindings);
    const structureOptions = template.render?.structureOptions && typeof template.render.structureOptions === 'object'
        ? template.render.structureOptions
        : {};
    const typographyOptions = template.render?.typographyOptions && typeof template.render.typographyOptions === 'object'
        ? template.render.typographyOptions
        : {};
    const motionOptions = template.render?.motionOptions && typeof template.render.motionOptions === 'object'
        ? template.render.motionOptions
        : {};

    const safeVarEntries = Object.entries(styleTokens)
        .map(([rawKey, rawValue]) => {
            const varName = toVarName(rawKey);
            const value = String(rawValue ?? '').trim();
            if (!varName || !value) return null;
            if (/[<>]/.test(value)) return null;
            return [`--${varName}`, value];
        })
        .filter(Boolean);

    const extraCssVarEntries = [
        ['--gt-typo-nav-title-size', normalizeCssVarValue(typographyOptions.navTitleFontSize)],
        ['--gt-typo-list-title-size', normalizeCssVarValue(typographyOptions.listTitleFontSize)],
        ['--gt-typo-list-preview-size', normalizeCssVarValue(typographyOptions.listPreviewFontSize)],
        ['--gt-typo-detail-key-size', normalizeCssVarValue(typographyOptions.detailKeyFontSize)],
        ['--gt-typo-detail-value-size', normalizeCssVarValue(typographyOptions.detailValueFontSize)],
        ['--gt-typo-button-size', normalizeCssVarValue(typographyOptions.buttonFontSize)],
        ['--gt-typo-chip-size', normalizeCssVarValue(typographyOptions.chipFontSize)],
        ['--gt-motion-fast', normalizeCssVarValue(motionOptions.fastDuration)],
        ['--gt-motion-normal', normalizeCssVarValue(motionOptions.normalDuration)],
    ].filter(([, value]) => !!value);

    const styleAttr = [...safeVarEntries, ...extraCssVarEntries]
        .map(([name, value]) => `${name}: ${escapeHtmlAttr(value)};`)
        .join(' ');

    const templateId = String(template.id || '').trim() || 'generic';
    const safeTemplateIdForClass = templateId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const className = `phone-generic-template-scope phone-generic-template-${safeTemplateIdForClass}`;
    const layoutOptions = normalizeLayoutOptions(template.render?.layoutOptions);

    const toolbarOptions = structureOptions.toolbar && typeof structureOptions.toolbar === 'object'
        ? structureOptions.toolbar
        : {};
    const listItemOptions = structureOptions.listItem && typeof structureOptions.listItem === 'object'
        ? structureOptions.listItem
        : {};
    const bottomBarOptions = structureOptions.bottomBar && typeof structureOptions.bottomBar === 'object'
        ? structureOptions.bottomBar
        : {};

    const dataAttrEntries = [
        ['data-generic-view-mode', String(viewMode || 'list').trim() || 'list'],
        ['data-layout-page-mode', layoutOptions.pageMode],
        ['data-layout-nav-mode', layoutOptions.navMode],
        ['data-layout-list-container-mode', layoutOptions.listContainerMode],
        ['data-layout-list-item-mode', layoutOptions.listItemMode],
        ['data-layout-list-meta-mode', layoutOptions.listMetaMode],
        ['data-layout-detail-container-mode', layoutOptions.detailContainerMode],
        ['data-layout-detail-field-layout', layoutOptions.detailFieldLayout],
        ['data-layout-detail-group-mode', layoutOptions.detailGroupMode],
        ['data-layout-action-bar-mode', layoutOptions.actionBarMode],
        ['data-layout-button-shape', layoutOptions.buttonShape],
        ['data-layout-button-size', layoutOptions.buttonSize],
        ['data-layout-density', layoutOptions.density],
        ['data-layout-shadow-level', layoutOptions.shadowLevel],
        ['data-layout-radius-level', layoutOptions.radiusLevel],
        ['data-layout-show-list-divider', layoutOptions.showListDivider ? '1' : '0'],
        ['data-layout-show-detail-divider', layoutOptions.showDetailDivider ? '1' : '0'],
        ['data-structure-show-search', toolbarOptions.showSearch === false ? '0' : '1'],
        ['data-structure-show-result-count', toolbarOptions.showResultCount === false ? '0' : '1'],
        ['data-structure-show-toolbar-hint', toolbarOptions.showHint === false ? '0' : '1'],
        ['data-structure-show-list-index', listItemOptions.showIndex === false ? '0' : '1'],
        ['data-structure-show-list-status', listItemOptions.showStatus === false ? '0' : '1'],
        ['data-structure-show-list-time', listItemOptions.showTime === false ? '0' : '1'],
        ['data-structure-show-list-arrow', listItemOptions.showArrow === false ? '0' : '1'],
        ['data-structure-show-add', bottomBarOptions.showAdd === false ? '0' : '1'],
        ['data-structure-show-lock', bottomBarOptions.showLock === false ? '0' : '1'],
        ['data-structure-show-delete', bottomBarOptions.showDelete === false ? '0' : '1'],
    ];

    const dataAttrs = dataAttrEntries
        .map(([name, value]) => `${name}="${escapeHtmlAttr(String(value || ''))}"`)
        .join(' ');

    const customCss = String(template.render?.customCss || '').trim();
    const scopedCss = customCss
        ? buildScopedCustomCss(customCss, `.phone-generic-template-${safeTemplateIdForClass}`)
        : '';

    return {
        className,
        styleAttr,
        scopedCss,
        templateId,
        dataAttrs,
        layoutOptions,
        fieldBindings,
        structureOptions,
        typographyOptions,
        motionOptions,
    };
}
