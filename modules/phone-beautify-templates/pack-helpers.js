import {
    PHONE_BEAUTIFY_TEMPLATE_EXPORT_MODE_RUNTIME,
    PHONE_BEAUTIFY_TEMPLATE_FORMAT,
    PHONE_BEAUTIFY_TEMPLATE_MIN_COMPAT_SCHEMA_VERSION,
    PHONE_BEAUTIFY_TEMPLATE_SCHEMA_VERSION,
} from './constants.js';
import {
    deepClone,
    normalizeString,
    stripAnnotationStructure,
    toAnnotatedValue,
} from './core.js';

function parseSemverParts(rawVersion) {
    const text = normalizeString(rawVersion, 32);
    const matched = text.match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!matched) return null;

    return [
        Number(matched[1]),
        Number(matched[2]),
        Number(matched[3]),
    ];
}

export function compareSemver(rawA, rawB) {
    const a = parseSemverParts(rawA);
    const b = parseSemverParts(rawB);
    if (!a || !b) return 0;

    for (let i = 0; i < 3; i++) {
        if (a[i] > b[i]) return 1;
        if (a[i] < b[i]) return -1;
    }

    return 0;
}

function isSchemaVersionCompatible(rawVersion) {
    const current = parseSemverParts(PHONE_BEAUTIFY_TEMPLATE_SCHEMA_VERSION);
    const min = parseSemverParts(PHONE_BEAUTIFY_TEMPLATE_MIN_COMPAT_SCHEMA_VERSION);
    const next = parseSemverParts(rawVersion);

    if (!current || !min || !next) return false;
    if (next[0] !== current[0]) return false;
    if (compareSemver(rawVersion, PHONE_BEAUTIFY_TEMPLATE_MIN_COMPAT_SCHEMA_VERSION) < 0) return false;
    if (compareSemver(rawVersion, PHONE_BEAUTIFY_TEMPLATE_SCHEMA_VERSION) > 0) return false;
    return true;
}

export function parsePackInput(input) {
    let parsed = input;

    if (typeof input === 'string') {
        parsed = JSON.parse(input);
    }

    if (Array.isArray(parsed)) {
        return {
            format: PHONE_BEAUTIFY_TEMPLATE_FORMAT,
            schemaVersion: PHONE_BEAUTIFY_TEMPLATE_SCHEMA_VERSION,
            templates: parsed,
            packMeta: {},
        };
    }

    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.templates)) {
        const safeFormat = normalizeString(parsed.format, 64) || PHONE_BEAUTIFY_TEMPLATE_FORMAT;
        if (safeFormat !== PHONE_BEAUTIFY_TEMPLATE_FORMAT) {
            throw new Error(`模板包 format 不支持：${safeFormat}`);
        }

        const rawSchemaVersion = normalizeString(parsed.schemaVersion, 32)
            || PHONE_BEAUTIFY_TEMPLATE_MIN_COMPAT_SCHEMA_VERSION;

        if (!isSchemaVersionCompatible(rawSchemaVersion)) {
            throw new Error(`模板包 schemaVersion 不兼容：${rawSchemaVersion}（当前支持 ${PHONE_BEAUTIFY_TEMPLATE_MIN_COMPAT_SCHEMA_VERSION} ~ ${PHONE_BEAUTIFY_TEMPLATE_SCHEMA_VERSION}）`);
        }

        return {
            format: safeFormat,
            schemaVersion: rawSchemaVersion,
            templates: parsed.templates,
            packMeta: parsed.packMeta,
        };
    }

    if (parsed && typeof parsed === 'object' && parsed.id && parsed.templateType) {
        return {
            format: PHONE_BEAUTIFY_TEMPLATE_FORMAT,
            schemaVersion: PHONE_BEAUTIFY_TEMPLATE_SCHEMA_VERSION,
            templates: [parsed],
            packMeta: {},
        };
    }

    throw new Error('模板文件结构不合法：缺少 templates 数组');
}

const TEMPLATE_FIELD_COMMENT_MAP = Object.freeze({
    id: '模板唯一标识，建议保持稳定，避免覆盖冲突。',
    name: '模板显示名称，用于设置页与导出识别。',
    templateType: '模板类型：special_app_template 或 generic_table_template。',
    source: '模板来源：builtin（内置）/ user（用户导入）。',
    readOnly: '是否只读；内置模板通常为 true。',
    exportable: '是否允许导出。',
    enabled: '模板启用状态。',
    'matcher.tableNameExact': '表名精确匹配列表。',
    'matcher.tableNameIncludes': '表名包含关键词列表。',
    'matcher.requiredHeaders': '必须命中的表头列表。',
    'matcher.optionalHeaders': '可选加分表头列表。',
    'matcher.minScore': '匹配阈值（0~100）。',
    'render.rendererKey': '渲染器键：special_message/generic_table。',
    'render.customCss': '自定义样式，建议仅在高级模式启用并逐步验证。',
    'render.advanced.customCssEnabled': '高级模式 customCss 开关；false 时 customCss 不生效。',
    'render.advanced.customCss': '高级模式 customCss 原始内容。',
    'meta.author': '模板作者。',
    'meta.description': '模板说明描述。',
    'meta.tags': '模板标签数组。',
    'meta.updatedAt': '模板更新时间时间戳（ms）。',
});

function getTemplateFieldComment(path = '') {
    const exact = TEMPLATE_FIELD_COMMENT_MAP[path];
    if (exact) return exact;

    if (path.startsWith('render.styleTokens.')) {
        return '样式 Token 值（颜色/尺寸/圆角/阴影等），建议与主题整体一致。';
    }

    if (path.startsWith('render.styleOptions.')) {
        return '样式选项字段，通常为枚举/布尔/数值。';
    }

    if (path.startsWith('render.layoutOptions.')) {
        return '布局选项字段，控制列表与详情结构。';
    }

    if (path.startsWith('render.fieldBindings.')) {
        return '字段映射候选列表，可填写列名或 @const/@now 等标记。';
    }

    if (path.startsWith('render.structureOptions.')) {
        return '结构开关配置，用于控制模块显隐与骨架布局。';
    }

    if (path.startsWith('render.typographyOptions.')) {
        return '排版配置（字体、字号、行高、字重等）。';
    }

    if (path.startsWith('render.motionOptions.')) {
        return '动效配置（时长、缓动、过渡行为等）。';
    }

    if (path.startsWith('render.stateOptions.')) {
        return '状态样式配置（hover/active/focus/disabled 等）。';
    }

    if (path.startsWith('render.fieldDecorators.')) {
        return '字段修饰配置（角标、徽章、高亮、边框强调等）。';
    }

    if (path.startsWith('matcher.')) {
        return '模板匹配策略字段。';
    }

    return path ? `配置字段：${path}` : '模板根对象';
}

function shouldWrapAsAnnotatedLeaf(value) {
    if (value === null || value === undefined) return true;
    if (Array.isArray(value)) return true;
    return typeof value !== 'object';
}

function annotateTemplateNode(rawValue, path = '') {
    const value = stripAnnotationStructure(rawValue);

    if (shouldWrapAsAnnotatedLeaf(value)) {
        return toAnnotatedValue(value, getTemplateFieldComment(path));
    }

    const result = {};
    Object.entries(value).forEach(([key, child]) => {
        if (String(key || '').startsWith('_')) return;
        const nextPath = path ? `${path}.${key}` : key;
        result[key] = annotateTemplateNode(child, nextPath);
    });

    return result;
}

export function serializeTemplateForExport(template, exportMode = PHONE_BEAUTIFY_TEMPLATE_EXPORT_MODE_RUNTIME) {
    const runtimeTemplate = stripAnnotationStructure(deepClone(template));
    if (exportMode === PHONE_BEAUTIFY_TEMPLATE_EXPORT_MODE_RUNTIME) {
        return runtimeTemplate;
    }
    return annotateTemplateNode(runtimeTemplate);
}
