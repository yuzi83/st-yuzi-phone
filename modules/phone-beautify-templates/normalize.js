import {
    ALLOWED_RENDERER_KEYS,
    ALLOWED_TEMPLATE_TYPES,
    DEFAULT_GENERIC_MIN_SCORE,
    PHONE_TEMPLATE_TYPE_GENERIC,
} from './constants.js';
import {
    DEFAULT_GENERIC_FIELD_BINDINGS,
    DEFAULT_GENERIC_LAYOUT_OPTIONS,
} from './defaults.js';
import {
    clampNumber,
    normalizeBooleanLike,
    normalizeEnumValue,
    normalizeFieldBindingCandidates,
    normalizeString,
    normalizeStyleTokens,
    nowTs,
    sanitizeId,
    stripAnnotationStructure,
    uniqueStringArray,
    unwrapAnnotatedValue,
} from './core.js';

const LEGACY_SPECIAL_TEMPLATE_TYPE = 'special_app_template';

const GENERIC_LAYOUT_ALLOWED_VALUES = Object.freeze({
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

const GENERIC_FIELD_BINDING_ALLOWED_KEYS = Object.freeze([
    'summaryTitle',
    'summarySubtitle',
    'summaryStatus',
    'summaryTime',
    'summaryPreview',
]);

const GENERIC_STYLE_TOKEN_ALIAS_MAP = Object.freeze({
    tableBackgroundColor: ['yuziGenericTemplateBodyBg', 'yuziGenericTemplateListBg', 'yuziGenericTemplateDetailBg', 'yuziGenericTemplateDetailFieldBg'],
    headerBackgroundColor: ['yuziGenericTemplateNavBg'],
    textColor: ['yuziGenericTemplateText', 'yuziGenericTemplateNavText', 'yuziGenericTemplateListItemText', 'yuziGenericTemplateDetailValueText', 'yuziGenericTemplateActionBtnText'],
    borderColor: ['yuziGenericTemplateNavBorderColor', 'yuziGenericTemplateListBorder', 'yuziGenericTemplateDetailBorder', 'yuziGenericTemplateDetailFieldBorder', 'yuziGenericTemplateActionBtnBorder'],
    borderRadius: ['yuziGenericTemplateRadiusLg'],
    boxShadow: ['yuziGenericTemplateShadowMd'],
    backdropFilter: ['yuziGenericTemplateBackdropFilter'],
});

export function normalizeTemplateType(rawType, fallback = PHONE_TEMPLATE_TYPE_GENERIC) {
    const text = normalizeString(rawType, 48);
    return ALLOWED_TEMPLATE_TYPES.has(text) ? text : fallback;
}

function normalizeGenericLayoutOptions(rawLayout) {
    const source = unwrapAnnotatedValue(rawLayout);
    const src = source && typeof source === 'object' && !Array.isArray(source)
        ? source
        : {};

    return {
        pageMode: normalizeEnumValue(src.pageMode, GENERIC_LAYOUT_ALLOWED_VALUES.pageMode, DEFAULT_GENERIC_LAYOUT_OPTIONS.pageMode),
        navMode: normalizeEnumValue(src.navMode, GENERIC_LAYOUT_ALLOWED_VALUES.navMode, DEFAULT_GENERIC_LAYOUT_OPTIONS.navMode),
        listContainerMode: normalizeEnumValue(src.listContainerMode, GENERIC_LAYOUT_ALLOWED_VALUES.listContainerMode, DEFAULT_GENERIC_LAYOUT_OPTIONS.listContainerMode),
        listItemMode: normalizeEnumValue(src.listItemMode, GENERIC_LAYOUT_ALLOWED_VALUES.listItemMode, DEFAULT_GENERIC_LAYOUT_OPTIONS.listItemMode),
        listMetaMode: normalizeEnumValue(src.listMetaMode, GENERIC_LAYOUT_ALLOWED_VALUES.listMetaMode, DEFAULT_GENERIC_LAYOUT_OPTIONS.listMetaMode),
        detailContainerMode: normalizeEnumValue(src.detailContainerMode, GENERIC_LAYOUT_ALLOWED_VALUES.detailContainerMode, DEFAULT_GENERIC_LAYOUT_OPTIONS.detailContainerMode),
        detailFieldLayout: normalizeEnumValue(src.detailFieldLayout, GENERIC_LAYOUT_ALLOWED_VALUES.detailFieldLayout, DEFAULT_GENERIC_LAYOUT_OPTIONS.detailFieldLayout),
        detailGroupMode: normalizeEnumValue(src.detailGroupMode, GENERIC_LAYOUT_ALLOWED_VALUES.detailGroupMode, DEFAULT_GENERIC_LAYOUT_OPTIONS.detailGroupMode),
        actionBarMode: normalizeEnumValue(src.actionBarMode, GENERIC_LAYOUT_ALLOWED_VALUES.actionBarMode, DEFAULT_GENERIC_LAYOUT_OPTIONS.actionBarMode),
        buttonShape: normalizeEnumValue(src.buttonShape, GENERIC_LAYOUT_ALLOWED_VALUES.buttonShape, DEFAULT_GENERIC_LAYOUT_OPTIONS.buttonShape),
        buttonSize: normalizeEnumValue(src.buttonSize, GENERIC_LAYOUT_ALLOWED_VALUES.buttonSize, DEFAULT_GENERIC_LAYOUT_OPTIONS.buttonSize),
        density: normalizeEnumValue(src.density, GENERIC_LAYOUT_ALLOWED_VALUES.density, DEFAULT_GENERIC_LAYOUT_OPTIONS.density),
        shadowLevel: normalizeEnumValue(src.shadowLevel, GENERIC_LAYOUT_ALLOWED_VALUES.shadowLevel, DEFAULT_GENERIC_LAYOUT_OPTIONS.shadowLevel),
        radiusLevel: normalizeEnumValue(src.radiusLevel, GENERIC_LAYOUT_ALLOWED_VALUES.radiusLevel, DEFAULT_GENERIC_LAYOUT_OPTIONS.radiusLevel),
        showListDivider: normalizeBooleanLike(src.showListDivider, DEFAULT_GENERIC_LAYOUT_OPTIONS.showListDivider),
        showDetailDivider: normalizeBooleanLike(src.showDetailDivider, DEFAULT_GENERIC_LAYOUT_OPTIONS.showDetailDivider),
    };
}

function toGenericStyleTokenKey(rawKey) {
    const key = normalizeString(rawKey, 48).replace(/[^a-zA-Z0-9_-]/g, '');
    return /^gt[A-Z]/.test(key) ? `yuziGenericTemplate${key.slice(2)}` : key;
}

export function normalizeGenericStyleTokens(rawStyleTokens) {
    const normalized = normalizeStyleTokens(rawStyleTokens);
    const merged = {};

    Object.entries(normalized).forEach(([rawKey, value]) => {
        if (Object.prototype.hasOwnProperty.call(GENERIC_STYLE_TOKEN_ALIAS_MAP, rawKey)) return;

        const safeKey = toGenericStyleTokenKey(rawKey);
        if (!safeKey || (merged[safeKey] && rawKey !== safeKey)) return;
        merged[safeKey] = value;
    });

    Object.entries(GENERIC_STYLE_TOKEN_ALIAS_MAP).forEach(([legacyKey, mappedKeys]) => {
        const legacyValue = normalized[legacyKey];
        if (!legacyValue || !Array.isArray(mappedKeys)) return;

        mappedKeys.forEach((nextKey) => {
            const safeKey = normalizeString(nextKey, 48).replace(/[^a-zA-Z0-9_-]/g, '');
            if (!safeKey || merged[safeKey]) return;
            merged[safeKey] = legacyValue;
        });
    });

    return merged;
}

function normalizeGenericFieldBindings(rawFieldBindings) {
    const source = unwrapAnnotatedValue(rawFieldBindings);
    const src = source && typeof source === 'object' && !Array.isArray(source)
        ? source
        : {};
    const merged = {};

    GENERIC_FIELD_BINDING_ALLOWED_KEYS.forEach((fieldKey) => {
        const rawValue = Object.prototype.hasOwnProperty.call(src, fieldKey)
            ? src[fieldKey]
            : DEFAULT_GENERIC_FIELD_BINDINGS[fieldKey];
        const normalized = normalizeFieldBindingCandidates(rawValue);
        if (normalized.length > 0) merged[fieldKey] = normalized;
    });

    return merged;
}

function normalizeMatcher(rawMatcher) {
    const source = unwrapAnnotatedValue(rawMatcher);
    const src = source && typeof source === 'object' ? source : {};

    return {
        tableNameExact: uniqueStringArray(src.tableNameExact, 20, 80),
        tableNameIncludes: uniqueStringArray(src.tableNameIncludes, 20, 40),
        requiredHeaders: uniqueStringArray(src.requiredHeaders, 40, 80),
        optionalHeaders: uniqueStringArray(src.optionalHeaders, 60, 80),
        minScore: clampNumber(src.minScore, 0, 100, DEFAULT_GENERIC_MIN_SCORE),
    };
}

function sanitizeCustomCss(rawCss) {
    const source = unwrapAnnotatedValue(rawCss);
    if (typeof source !== 'string') return '';

    const text = String(source).trim().slice(0, 12000);
    if (!text) return '';

    const lower = text.toLowerCase();
    const blockedKeywords = ['</style', '<script', 'javascript:', '@import', 'expression(', 'url('];
    return blockedKeywords.some(keyword => lower.includes(keyword)) ? '' : text;
}

function normalizeRenderAdvanced(rawAdvanced, rawCustomCss) {
    const source = unwrapAnnotatedValue(rawAdvanced);
    const src = source && typeof source === 'object' && !Array.isArray(source)
        ? source
        : {};
    const legacyCustomCss = sanitizeCustomCss(rawCustomCss);
    const customCss = sanitizeCustomCss(src.customCss) || legacyCustomCss;

    return {
        customCssEnabled: normalizeBooleanLike(src.customCssEnabled, !!legacyCustomCss),
        customCss,
    };
}

function normalizeRenderExtraGroup(rawGroup) {
    const source = unwrapAnnotatedValue(rawGroup);
    if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
    return stripAnnotationStructure(source);
}

function normalizeRender(rawRender) {
    const source = unwrapAnnotatedValue(rawRender);
    const src = source && typeof source === 'object' ? source : {};
    const requestedRendererKey = normalizeString(src.rendererKey, 48);
    if (requestedRendererKey && !ALLOWED_RENDERER_KEYS.has(requestedRendererKey)) return null;

    const advanced = normalizeRenderAdvanced(src.advanced, src.customCss);
    return {
        rendererKey: 'generic_table',
        styleTokens: normalizeGenericStyleTokens(src.styleTokens),
        fieldBindings: normalizeGenericFieldBindings(src.fieldBindings),
        styleOptions: {},
        layoutOptions: normalizeGenericLayoutOptions(src.layoutOptions),
        structureOptions: normalizeRenderExtraGroup(src.structureOptions),
        typographyOptions: normalizeRenderExtraGroup(src.typographyOptions),
        motionOptions: normalizeRenderExtraGroup(src.motionOptions),
        stateOptions: normalizeRenderExtraGroup(src.stateOptions),
        fieldDecorators: normalizeRenderExtraGroup(src.fieldDecorators),
        customCss: advanced.customCssEnabled ? sanitizeCustomCss(advanced.customCss) : '',
        advanced,
    };
}

export function normalizeTemplateMeta(rawMeta = {}) {
    const source = unwrapAnnotatedValue(rawMeta);
    const src = source && typeof source === 'object' ? source : {};
    const updatedAt = Number(unwrapAnnotatedValue(src.updatedAt));

    return {
        author: normalizeString(src.author, 60),
        description: normalizeString(src.description, 240),
        tags: uniqueStringArray(src.tags, 12, 24),
        updatedAt: Number.isFinite(updatedAt) ? updatedAt : nowTs(),
    };
}

export function normalizeTemplate(rawTemplate, options = {}) {
    const sourceTemplate = unwrapAnnotatedValue(rawTemplate);
    if (!sourceTemplate || typeof sourceTemplate !== 'object') return null;

    const requestedTemplateType = normalizeString(sourceTemplate.templateType, 48);
    const requestedRendererKey = normalizeString(unwrapAnnotatedValue(sourceTemplate.render)?.rendererKey, 48);
    if (requestedTemplateType === LEGACY_SPECIAL_TEMPLATE_TYPE) return null;
    if (requestedRendererKey && !ALLOWED_RENDERER_KEYS.has(requestedRendererKey)) return null;

    const templateType = normalizeTemplateType(
        requestedTemplateType,
        options.templateTypeFallback || PHONE_TEMPLATE_TYPE_GENERIC,
    );
    if (templateType !== PHONE_TEMPLATE_TYPE_GENERIC) return null;

    const render = normalizeRender(sourceTemplate.render);
    if (!render) return null;

    const sourceFallback = normalizeString(options.sourceFallback || 'user', 24) || 'user';
    const idFallback = options.idFallback || `user.template.${nowTs().toString(36)}`;
    const nameFallback = options.nameFallback || '未命名模板';

    return {
        id: sanitizeId(sourceTemplate.id, idFallback),
        name: normalizeString(sourceTemplate.name, 80) || nameFallback,
        templateType,
        source: normalizeString(sourceTemplate.source, 24) || sourceFallback,
        readOnly: normalizeBooleanLike(sourceTemplate.readOnly, false),
        exportable: normalizeBooleanLike(sourceTemplate.exportable, true),
        enabled: normalizeBooleanLike(sourceTemplate.enabled, true),
        matcher: normalizeMatcher(sourceTemplate.matcher),
        render,
        meta: normalizeTemplateMeta(sourceTemplate.meta),
    };
}
