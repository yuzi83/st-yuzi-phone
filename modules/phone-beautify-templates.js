export {
    PHONE_TEMPLATE_TYPE_SPECIAL,
    PHONE_TEMPLATE_TYPE_GENERIC,
    PHONE_BEAUTIFY_TEMPLATE_FORMAT,
    PHONE_BEAUTIFY_TEMPLATE_SCHEMA_VERSION,
    PHONE_BEAUTIFY_TEMPLATE_MIN_COMPAT_SCHEMA_VERSION,
    PHONE_BEAUTIFY_TEMPLATE_EXPORT_MODE_RUNTIME,
    PHONE_BEAUTIFY_TEMPLATE_EXPORT_MODE_ANNOTATED,
} from './phone-beautify-templates/shared.js';

export {
    getBeautifyTemplateSourceMode,
    setBeautifyTemplateSourceMode,
    getActiveBeautifyTemplateIdByType,
    getActiveBeautifyTemplateIdsForSpecial,
    setActiveBeautifyTemplateIdByType,
    getBeautifyTemplateSourceModeRuntime,
    getBuiltinPhoneBeautifyTemplates,
    getPhoneBeautifyTemplateStore,
    getAllPhoneBeautifyTemplates,
    getPhoneBeautifyTemplatesByType,
    validatePhoneBeautifyTemplate,
    savePhoneBeautifyUserTemplate,
    deletePhoneBeautifyUserTemplate,
} from './phone-beautify-templates/repository.js';

export {
    exportPhoneBeautifyPack,
    importPhoneBeautifyPackFromData,
} from './phone-beautify-templates/import-export.js';

export {
    detectSpecialTemplateForTable,
    detectGenericTemplateForTable,
    bindSheetToBeautifyTemplate,
    clearSheetBeautifyBinding,
} from './phone-beautify-templates/matcher.js';
