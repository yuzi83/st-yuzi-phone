export const CONTENT_PRESET_FORMAT = 'yuzi-beautify-preset';
export const CONTENT_PRESET_FORMAT_VERSION = 3;
export const CONTENT_PRESET_API_VERSION = 2;
export const LEGACY_CONTENT_PRESET_FORMAT_VERSION = 2;
export const LEGACY_CONTENT_PRESET_API_VERSION = 1;
export const CONTENT_PRESET_DB_NAME = 'yuzi-phone-template-workshop-v2';
export const CONTENT_PRESET_DB_VERSION = 2;
export const CONTENT_PRESET_STORES = Object.freeze({
    presets: 'presets',
    activeByTable: 'activeByTable', // v1 的页面绑定存储，名称保留以无损兼容旧用户数据。
    popupByTable: 'popupByTable',
});
export const CONTENT_PRESET_BINDING_INDEX = 'presetId';
export const CONTENT_PRESET_UPDATE_EVENT = 'yuzi-phone-content-preset-updated';
export const CONTENT_PRESET_DISPLAY_KINDS = Object.freeze(['inline', 'popup', 'barrage']);
export const CONTENT_PRESET_DISPLAY_INTEGRATIONS = Object.freeze(['theme', 'font']);
export const CONTENT_PRESET_DISPLAY_INTERACTIONS = Object.freeze(['expand', 'tabs', 'append-input', 'image-generate']);
export const RESOURCE_SUPPORT = Object.freeze({
    htmlAttributes: Object.freeze(['src', 'href', 'poster', 'srcset']),
    cssUrl: true,
    cssImport: false,
    svgExternal: false,
    moduleImports: false,
    importMetaUrl: false,
    relativeFetch: false,
});
