// modules/phone-beautify-templates/defaults.js
/**
 * 玉子的手机 - 默认美化模板常量聚合层
 *
 * 真实实现已按职责拆分到 [`defaults/`](modules/phone-beautify-templates/defaults) 子目录：
 *   - [`defaults/special-field-bindings.js`](modules/phone-beautify-templates/defaults/special-field-bindings.js)
 *     专属模板字段绑定、styleOptions、styleTokens
 *   - [`defaults/generic-field-bindings.js`](modules/phone-beautify-templates/defaults/generic-field-bindings.js)
 *     通用模板布局选项与摘要字段绑定
 *   - [`defaults/builtin-templates.js`](modules/phone-beautify-templates/defaults/builtin-templates.js)
 *     内置模板定义（最大的一块）
 *
 * 本文件保留为兼容聚合层，避免一次性改动 [`cache.js`](modules/phone-beautify-templates/cache.js)、
 * [`normalize.js`](modules/phone-beautify-templates/normalize.js)、[`repository.js`](modules/phone-beautify-templates/repository.js)、
 * [`shared.js`](modules/phone-beautify-templates/shared.js)、[`store.js`](modules/phone-beautify-templates/store.js) 的导入路径。
 */

export {
    DEFAULT_SPECIAL_FIELD_BINDINGS_BY_RENDERER,
    DEFAULT_SPECIAL_STYLE_OPTIONS_BY_RENDERER,
    SPECIAL_MESSAGE_DEFAULT_STYLE_TOKENS,
} from './defaults/special-field-bindings.js';

export {
    DEFAULT_GENERIC_LAYOUT_OPTIONS,
    DEFAULT_GENERIC_FIELD_BINDINGS,
} from './defaults/generic-field-bindings.js';

export { BUILTIN_TEMPLATES } from './defaults/builtin-templates.js';
