import {
    ALLOWED_RENDERER_KEYS,
    ALLOWED_TEMPLATE_TYPES,
    DEFAULT_GENERIC_MIN_SCORE,
    DEFAULT_SPECIAL_MIN_SCORE,
    PHONE_TEMPLATE_TYPE_GENERIC,
    PHONE_TEMPLATE_TYPE_SPECIAL,
} from './constants.js';
import {
    DEFAULT_GENERIC_FIELD_BINDINGS,
    DEFAULT_GENERIC_LAYOUT_OPTIONS,
    DEFAULT_SPECIAL_FIELD_BINDINGS_BY_RENDERER,
    DEFAULT_SPECIAL_STYLE_OPTIONS_BY_RENDERER,
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

const REMOVED_SPECIAL_RENDERER_KEYS = new Set(['special_moments', 'special_forum']);

const SPECIAL_FIELD_BINDING_ALLOWED_KEYS = Object.freeze([
    'threadId',
    'threadTitle',
    'threadSubtitle',
    'sender',
    'senderRole',
    'chatTarget',
    'content',
    'sentAt',
    'messageStatus',
    'requestId',
    'replyToMessageId',
    'imageDesc',
    'videoDesc',
]);

const SPECIAL_STYLE_OPTION_ENUM_ALLOWED_VALUES = Object.freeze({
    density: ['compact', 'normal', 'loose'],
    avatarShape: ['circle', 'rounded', 'square'],
    conversationTitleMode: ['auto', 'sender', 'thread', 'titleField'],
    mediaActionTextMode: ['short', 'detailed'],
});

const SPECIAL_STYLE_OPTION_NUMERIC_RULES = Object.freeze({
    bubbleMaxWidthPct: { min: 48, max: 96 },
});

const SPECIAL_STYLE_OPTION_BOOLEAN_KEYS = new Set([
    'showAvatar',
    'showMessageTime',
]);

const SPECIAL_STYLE_OPTION_TEXT_LIMITS = Object.freeze({
    emptyConversationText: 48,
    emptyDetailText: 48,
    emptyMessageText: 48,
    timeFallbackText: 24,
});

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
    tableBackgroundColor: ['gtBodyBg', 'gtListBg', 'gtDetailBg', 'gtDetailFieldBg'],
    headerBackgroundColor: ['gtNavBg'],
    textColor: ['gtText', 'gtNavText', 'gtListItemText', 'gtDetailValueText', 'gtActionBtnText'],
    borderColor: ['gtNavBorderColor', 'gtListBorder', 'gtDetailBorder', 'gtDetailFieldBorder', 'gtActionBtnBorder'],
    borderRadius: ['gtRadiusLg'],
    boxShadow: ['gtShadowMd'],
    backdropFilter: ['gtBackdropFilter'],
});

const SPECIAL_STYLE_TOKEN_ALIAS_MAP = Object.freeze({
    pageBgColor: ['spPageBg', 'spBodyBg'],
    navBgColor: ['spNavBg'],
    navTextColor: ['spNavTitle', 'spNavBackText'],
    bubbleLeftBg: ['spBubbleLeftBg'],
    bubbleLeftText: ['spBubbleLeftText'],
    bubbleRightBg: ['spBubbleRightBg'],
    bubbleRightText: ['spBubbleRightText'],
    bubbleBorderRadius: ['spRadiusMd'],
    timeTextColor: ['spMetaText', 'spMessageTimeText'],
});

export function normalizeTemplateType(rawType, fallback = PHONE_TEMPLATE_TYPE_GENERIC) {
    const text = normalizeString(rawType, 48);
    return ALLOWED_TEMPLATE_TYPES.has(text) ? text : fallback;
}

function defaultRendererKeyByType(templateType) {
    if (templateType === PHONE_TEMPLATE_TYPE_SPECIAL) {
        return 'special_message';
    }
    return 'generic_table';
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

function normalizeGenericStyleTokens(rawStyleTokens) {
    const normalized = normalizeStyleTokens(rawStyleTokens);
    const merged = { ...normalized };

    Object.entries(GENERIC_STYLE_TOKEN_ALIAS_MAP).forEach(([legacyKey, mappedKeys]) => {
        const legacyValue = merged[legacyKey];
        if (!legacyValue || !Array.isArray(mappedKeys)) return;

        mappedKeys.forEach((nextKey) => {
            const safeKey = normalizeString(nextKey, 48).replace(/[^a-zA-Z0-9_-]/g, '');
            if (!safeKey) return;
            if (!merged[safeKey]) {
                merged[safeKey] = legacyValue;
            }
        });
    });

    return merged;
}

function normalizeSpecialStyleTokens(rawStyleTokens) {
    const normalized = normalizeStyleTokens(rawStyleTokens);
    const merged = { ...normalized };

    Object.entries(SPECIAL_STYLE_TOKEN_ALIAS_MAP).forEach(([legacyKey, mappedKeys]) => {
        const legacyValue = merged[legacyKey];
        if (!legacyValue || !Array.isArray(mappedKeys)) return;

        mappedKeys.forEach((nextKey) => {
            const safeKey = normalizeString(nextKey, 48).replace(/[^a-zA-Z0-9_-]/g, '');
            if (!safeKey) return;
            if (!merged[safeKey]) {
                merged[safeKey] = legacyValue;
            }
        });
    });

    return merged;
}

function normalizeSpecialFieldBindings(rawFieldBindings, rendererKey) {
    const source = unwrapAnnotatedValue(rawFieldBindings);
    const src = source && typeof source === 'object' && !Array.isArray(source)
        ? source
        : {};

    const defaults = DEFAULT_SPECIAL_FIELD_BINDINGS_BY_RENDERER[rendererKey]
        || DEFAULT_SPECIAL_FIELD_BINDINGS_BY_RENDERER.special_message
        || {};

    const merged = {};

    SPECIAL_FIELD_BINDING_ALLOWED_KEYS.forEach((fieldKey) => {
        const rawValue = Object.prototype.hasOwnProperty.call(src, fieldKey)
            ? src[fieldKey]
            : defaults[fieldKey];

        const normalized = normalizeFieldBindingCandidates(rawValue);
        if (normalized.length > 0) {
            merged[fieldKey] = normalized;
        }
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
        if (normalized.length > 0) {
            merged[fieldKey] = normalized;
        }
    });

    return merged;
}

function normalizeSpecialStyleOptions(rawStyleOptions, rendererKey) {
    const defaults = DEFAULT_SPECIAL_STYLE_OPTIONS_BY_RENDERER[rendererKey]
        || DEFAULT_SPECIAL_STYLE_OPTIONS_BY_RENDERER.special_message
        || {};

    const source = unwrapAnnotatedValue(rawStyleOptions);
    const src = source && typeof source === 'object' && !Array.isArray(source)
        ? source
        : {};

    const merged = {};

    Object.keys(defaults).forEach((optionKey) => {
        const fallbackValue = defaults[optionKey];
        const rawValue = Object.prototype.hasOwnProperty.call(src, optionKey)
            ? src[optionKey]
            : fallbackValue;

        if (Object.prototype.hasOwnProperty.call(SPECIAL_STYLE_OPTION_ENUM_ALLOWED_VALUES, optionKey)) {
            const allowed = SPECIAL_STYLE_OPTION_ENUM_ALLOWED_VALUES[optionKey] || [];
            merged[optionKey] = normalizeEnumValue(rawValue, allowed, String(fallbackValue || ''));
            return;
        }

        if (Object.prototype.hasOwnProperty.call(SPECIAL_STYLE_OPTION_NUMERIC_RULES, optionKey)) {
            const rule = SPECIAL_STYLE_OPTION_NUMERIC_RULES[optionKey] || {};
            const min = Number.isFinite(Number(rule.min)) ? Number(rule.min) : 0;
            const max = Number.isFinite(Number(rule.max)) ? Number(rule.max) : 999;
            const fallback = Number.isFinite(Number(fallbackValue)) ? Number(fallbackValue) : min;
            merged[optionKey] = clampNumber(rawValue, min, max, fallback);
            return;
        }

        if (SPECIAL_STYLE_OPTION_BOOLEAN_KEYS.has(optionKey)) {
            merged[optionKey] = normalizeBooleanLike(rawValue, !!fallbackValue);
            return;
        }

        const maxLength = Number.isFinite(Number(SPECIAL_STYLE_OPTION_TEXT_LIMITS[optionKey]))
            ? Number(SPECIAL_STYLE_OPTION_TEXT_LIMITS[optionKey])
            : 80;

        merged[optionKey] = normalizeString(rawValue, maxLength)
            || normalizeString(fallbackValue, maxLength);
    });

    return merged;
}

function normalizeMatcher(rawMatcher, templateType) {
    const source = unwrapAnnotatedValue(rawMatcher);
    const src = source && typeof source === 'object' ? source : {};
    const minScoreFallback = templateType === PHONE_TEMPLATE_TYPE_SPECIAL
        ? DEFAULT_SPECIAL_MIN_SCORE
        : DEFAULT_GENERIC_MIN_SCORE;

    return {
        tableNameExact: uniqueStringArray(src.tableNameExact, 20, 80),
        tableNameIncludes: uniqueStringArray(src.tableNameIncludes, 20, 40),
        requiredHeaders: uniqueStringArray(src.requiredHeaders, 40, 80),
        optionalHeaders: uniqueStringArray(src.optionalHeaders, 60, 80),
        minScore: clampNumber(src.minScore, 0, 100, minScoreFallback),
    };
}

function sanitizeCustomCss(rawCss) {
    const source = unwrapAnnotatedValue(rawCss);
    if (typeof source !== 'string') return '';

    const text = String(source).trim().slice(0, 12000);
    if (!text) return '';

    const lower = text.toLowerCase();
    const blockedKeywords = [
        '</style',
        '<script',
        'javascript:',
        '@import',
        'expression(',
        'url(',
    ];

    if (blockedKeywords.some(keyword => lower.includes(keyword))) {
        return '';
    }

    return text;
}

function normalizeRenderAdvanced(rawAdvanced, rawCustomCss) {
    const source = unwrapAnnotatedValue(rawAdvanced);
    const src = source && typeof source === 'object' && !Array.isArray(source)
        ? source
        : {};

    const legacyCustomCss = sanitizeCustomCss(rawCustomCss);
    const candidateCss = sanitizeCustomCss(src.customCss);
    const customCss = candidateCss || legacyCustomCss;

    const hasLegacyCustomCss = !!legacyCustomCss;
    const customCssEnabled = normalizeBooleanLike(src.customCssEnabled, hasLegacyCustomCss);

    return {
        customCssEnabled,
        customCss,
    };
}

function normalizeRenderExtraGroup(rawGroup) {
    const source = unwrapAnnotatedValue(rawGroup);
    if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
    return stripAnnotationStructure(source);
}

function normalizeRender(rawRender, templateType) {
    const source = unwrapAnnotatedValue(rawRender);
    const src = source && typeof source === 'object' ? source : {};
    const fallbackRenderer = defaultRendererKeyByType(templateType);

    const requestedRendererKey = normalizeString(src.rendererKey, 48);
    const rendererKey = ALLOWED_RENDERER_KEYS.has(requestedRendererKey)
        ? requestedRendererKey
        : fallbackRenderer;

    const isGenericRenderer = rendererKey === 'generic_table';
    const advanced = normalizeRenderAdvanced(src.advanced, src.customCss);
    const customCss = advanced.customCssEnabled
        ? sanitizeCustomCss(advanced.customCss)
        : '';

    return {
        rendererKey,
        styleTokens: isGenericRenderer
            ? normalizeGenericStyleTokens(src.styleTokens)
            : normalizeSpecialStyleTokens(src.styleTokens),
        fieldBindings: isGenericRenderer
            ? normalizeGenericFieldBindings(src.fieldBindings)
            : normalizeSpecialFieldBindings(src.fieldBindings, rendererKey),
        styleOptions: isGenericRenderer
            ? {}
            : normalizeSpecialStyleOptions(src.styleOptions, rendererKey),
        layoutOptions: isGenericRenderer
            ? normalizeGenericLayoutOptions(src.layoutOptions)
            : {},
        structureOptions: normalizeRenderExtraGroup(src.structureOptions),
        typographyOptions: normalizeRenderExtraGroup(src.typographyOptions),
        motionOptions: normalizeRenderExtraGroup(src.motionOptions),
        stateOptions: normalizeRenderExtraGroup(src.stateOptions),
        fieldDecorators: normalizeRenderExtraGroup(src.fieldDecorators),
        customCss,
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

    const sourceFallback = normalizeString(options.sourceFallback || 'user', 24) || 'user';
    const templateType = normalizeTemplateType(sourceTemplate.templateType, options.templateTypeFallback || PHONE_TEMPLATE_TYPE_GENERIC);
    const requestedRendererKey = normalizeString(unwrapAnnotatedValue(sourceTemplate.render)?.rendererKey, 48);

    if (templateType === PHONE_TEMPLATE_TYPE_SPECIAL && REMOVED_SPECIAL_RENDERER_KEYS.has(requestedRendererKey)) {
        return null;
    }

    const idFallback = options.idFallback || `user.template.${nowTs().toString(36)}`;
    const nameFallback = options.nameFallback || '未命名模板';

    const id = sanitizeId(sourceTemplate.id, idFallback);
    const name = normalizeString(sourceTemplate.name, 80) || nameFallback;

    const source = normalizeString(sourceTemplate.source, 24) || sourceFallback;
    const readOnly = normalizeBooleanLike(sourceTemplate.readOnly, false);
    const exportable = normalizeBooleanLike(sourceTemplate.exportable, true);
    const enabled = normalizeBooleanLike(sourceTemplate.enabled, true);

    return {
        id,
        name,
        templateType,
        source,
        readOnly,
        exportable,
        enabled,
        matcher: normalizeMatcher(sourceTemplate.matcher, templateType),
        render: normalizeRender(sourceTemplate.render, templateType),
        meta: normalizeTemplateMeta(sourceTemplate.meta),
    };
}
