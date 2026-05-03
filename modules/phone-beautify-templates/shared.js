// modules/phone-beautify-templates/shared.js
/**
 * 玉子的手机 - 美化模板兼容导出层
 * - 保留历史 shared 导入入口，避免 settings 页面与外部门面断裂
 * - 真实实现已拆分到 constants / defaults / core / normalize / store / matcher-helpers / pack-helpers / template-id
 * - 新代码应优先直接依赖所属模块，而不是继续绕 shared 总线
 */

export {
    MAX_IMPORTED_TEMPLATES,
    BEAUTIFY_SOURCE_MODE_SETTING_KEY_SPECIAL,
    BEAUTIFY_SOURCE_MODE_SETTING_KEY_GENERIC,
    BEAUTIFY_SOURCE_MODE_BUILTIN,
    BEAUTIFY_SOURCE_MODE_USER,
    BEAUTIFY_ACTIVE_TEMPLATE_IDS_SETTING_KEY_SPECIAL,
    BEAUTIFY_ACTIVE_TEMPLATE_ID_SETTING_KEY_GENERIC,
    SPECIAL_RENDERER_KEYS,
    DEFAULT_SPECIAL_MIN_SCORE,
    DEFAULT_GENERIC_MIN_SCORE,
    PHONE_TEMPLATE_TYPE_SPECIAL,
    PHONE_TEMPLATE_TYPE_GENERIC,
    PHONE_BEAUTIFY_TEMPLATE_FORMAT,
    PHONE_BEAUTIFY_TEMPLATE_SCHEMA_VERSION,
    PHONE_BEAUTIFY_TEMPLATE_MIN_COMPAT_SCHEMA_VERSION,
    PHONE_BEAUTIFY_TEMPLATE_EXPORT_MODE_RUNTIME,
    PHONE_BEAUTIFY_TEMPLATE_EXPORT_MODE_ANNOTATED,
    RENDERER_KEY_TO_SPECIAL_TYPE,
} from './constants.js';

export {
    DEFAULT_SPECIAL_FIELD_BINDINGS_BY_RENDERER,
    DEFAULT_SPECIAL_STYLE_OPTIONS_BY_RENDERER,
    DEFAULT_GENERIC_LAYOUT_OPTIONS,
    DEFAULT_GENERIC_FIELD_BINDINGS,
    SPECIAL_MESSAGE_DEFAULT_STYLE_TOKENS,
    BUILTIN_TEMPLATES,
} from './defaults.js';

export {
    clampNumber,
    deepClone,
    normalizeString,
    nowTs,
    sanitizeId,
} from './core.js';

export {
    normalizeTemplateType,
    normalizeTemplateMeta,
    normalizeTemplate,
} from './normalize.js';

export {
    saveTemplateStore,
    readTemplateStore,
} from './store.js';

export {
    inferSpecialRendererKeyByTableName,
    scoreTemplateMatcher,
    normalizeHeadersSet,
} from './matcher-helpers.js';

export {
    compareSemver,
    parsePackInput,
    serializeTemplateForExport,
} from './pack-helpers.js';

export { ensureUniqueTemplateId } from './template-id.js';
