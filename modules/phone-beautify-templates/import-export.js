import {
    MAX_IMPORTED_TEMPLATES,
    PHONE_BEAUTIFY_TEMPLATE_EXPORT_MODE_ANNOTATED,
    PHONE_BEAUTIFY_TEMPLATE_EXPORT_MODE_RUNTIME,
    PHONE_BEAUTIFY_TEMPLATE_FORMAT,
    PHONE_BEAUTIFY_TEMPLATE_MIN_COMPAT_SCHEMA_VERSION,
    PHONE_BEAUTIFY_TEMPLATE_SCHEMA_VERSION,
} from './constants.js';
import {
    deepClone,
    normalizeString,
    nowTs,
    sanitizeId,
} from './core.js';
import { normalizeTemplateType } from './normalize.js';
import {
    compareSemver,
    parsePackInput,
    serializeTemplateForExport,
} from './pack-helpers.js';
import { saveTemplateStore } from './store.js';
import { ensureUniqueTemplateId } from './template-id.js';
import {
    getCachedPhoneBeautifyTemplateStore,
    invalidatePhoneBeautifyTemplateCache,
} from './cache.js';
import {
    getAllPhoneBeautifyTemplates,
    getBuiltinPhoneBeautifyTemplates,
    validatePhoneBeautifyTemplate,
} from './repository.js';

export function exportPhoneBeautifyPack(options = {}) {
    const templateTypeRaw = normalizeString(options.templateType, 48);
    const templateType = templateTypeRaw ? normalizeTemplateType(templateTypeRaw, '') : '';

    const builtinOnly = !!options.builtinOnly;
    const userOnly = !!options.userOnly;
    const templateIdSet = Array.isArray(options.templateIds)
        ? new Set(options.templateIds.map(id => sanitizeId(id, '')).filter(Boolean))
        : null;

    const exportModeRaw = normalizeString(options.exportMode, 24).toLowerCase();
    const exportMode = exportModeRaw === PHONE_BEAUTIFY_TEMPLATE_EXPORT_MODE_RUNTIME
        ? PHONE_BEAUTIFY_TEMPLATE_EXPORT_MODE_RUNTIME
        : PHONE_BEAUTIFY_TEMPLATE_EXPORT_MODE_ANNOTATED;

    const templates = getAllPhoneBeautifyTemplates({ includeDisabled: true })
        .filter((template) => {
            if (templateType && template.templateType !== templateType) return false;
            if (builtinOnly && template.source !== 'builtin') return false;
            if (userOnly && template.source === 'builtin') return false;
            if (templateIdSet && !templateIdSet.has(template.id)) return false;
            if (template.exportable === false) return false;
            return true;
        })
        .map((template) => serializeTemplateForExport(template, exportMode));

    return {
        success: true,
        count: templates.length,
        pack: {
            format: PHONE_BEAUTIFY_TEMPLATE_FORMAT,
            schemaVersion: PHONE_BEAUTIFY_TEMPLATE_SCHEMA_VERSION,
            packMeta: {
                name: normalizeString(options.packName, 80) || '手机美化模板包',
                exportedAt: new Date().toISOString(),
                exporter: 'YuziPhone',
                exportMode,
                schemaCompatMin: PHONE_BEAUTIFY_TEMPLATE_MIN_COMPAT_SCHEMA_VERSION,
                schemaCompatMax: PHONE_BEAUTIFY_TEMPLATE_SCHEMA_VERSION,
            },
            templates,
        },
    };
}

export function importPhoneBeautifyPackFromData(input, options = {}) {
    const overwrite = !!options.overwrite;
    const typeFilterRaw = normalizeString(options.templateTypeFilter, 48);
    const typeFilter = typeFilterRaw ? normalizeTemplateType(typeFilterRaw, '') : '';

    try {
        const parsedPack = parsePackInput(input);
        const rawTemplates = Array.isArray(parsedPack.templates) ? parsedPack.templates : [];

        const warnings = [];
        const errors = [];

        if (parsedPack.schemaVersion
            && compareSemver(parsedPack.schemaVersion, PHONE_BEAUTIFY_TEMPLATE_SCHEMA_VERSION) < 0) {
            warnings.push(`模板包 schemaVersion=${parsedPack.schemaVersion}，已按当前 ${PHONE_BEAUTIFY_TEMPLATE_SCHEMA_VERSION} 兼容归一化`);
        }

        if (rawTemplates.length === 0) {
            return {
                success: false,
                imported: 0,
                replaced: 0,
                skipped: 0,
                errors: ['模板包中没有可导入模板'],
                warnings,
                message: '模板包为空',
            };
        }

        if (rawTemplates.length > MAX_IMPORTED_TEMPLATES) {
            return {
                success: false,
                imported: 0,
                replaced: 0,
                skipped: rawTemplates.length,
                errors: [`单次最多导入 ${MAX_IMPORTED_TEMPLATES} 个模板`],
                warnings,
                message: '导入数量超限',
            };
        }

        const store = getCachedPhoneBeautifyTemplateStore();
        const builtinIds = new Set(getBuiltinPhoneBeautifyTemplates().map(t => t.id));
        const nextUserTemplates = deepClone(store.templates || []);
        const existingUserMap = new Map(nextUserTemplates.map(t => [t.id, t]));
        const usedIds = new Set([
            ...builtinIds,
            ...nextUserTemplates.map(t => t.id),
        ]);

        let imported = 0;
        let replaced = 0;
        let skipped = 0;

        rawTemplates.forEach((rawTemplate, idx) => {
            const validated = validatePhoneBeautifyTemplate(rawTemplate);
            if (!validated.ok || !validated.template) {
                skipped++;
                errors.push(`模板 #${idx + 1} 校验失败：${validated.errors.join('；')}`);
                return;
            }

            const template = deepClone(validated.template);

            if (typeFilter && template.templateType !== typeFilter) {
                skipped++;
                return;
            }

            if (validated.warnings.length > 0) {
                warnings.push(...validated.warnings.map(msg => `模板 #${idx + 1}：${msg}`));
            }

            template.source = 'user';
            template.readOnly = false;
            template.exportable = true;
            template.enabled = template.enabled !== false;
            template.meta.updatedAt = nowTs();

            if (builtinIds.has(template.id)) {
                const originalId = template.id;
                template.id = `user.imported.${originalId}`;
                warnings.push(`模板“${template.name}”引用了内置 ID，已重命名为 ${template.id}`);
            }

            if (existingUserMap.has(template.id)) {
                if (overwrite) {
                    const oldIdx = nextUserTemplates.findIndex(t => t.id === template.id);
                    if (oldIdx >= 0) {
                        nextUserTemplates[oldIdx] = template;
                        existingUserMap.set(template.id, template);
                        replaced++;
                        imported++;
                        return;
                    }
                }

                const nextId = ensureUniqueTemplateId(template.id, usedIds);
                warnings.push(`模板“${template.name}”ID 冲突，已自动改为 ${nextId}`);
                template.id = nextId;
            } else {
                usedIds.add(template.id);
            }

            nextUserTemplates.push(template);
            existingUserMap.set(template.id, template);
            imported++;
        });

        if (imported <= 0) {
            return {
                success: false,
                imported,
                replaced,
                skipped,
                errors,
                warnings,
                message: errors.length > 0 ? '没有模板通过校验' : '没有匹配当前分区的模板',
            };
        }

        saveTemplateStore({
            ...store,
            templates: nextUserTemplates,
        });
        invalidatePhoneBeautifyTemplateCache();

        return {
            success: true,
            imported,
            replaced,
            skipped,
            errors,
            warnings,
            message: replaced > 0
                ? `导入完成：新增 ${imported - replaced}，覆盖 ${replaced}`
                : `导入完成：成功 ${imported} 项`,
        };
    } catch (e) {
        return {
            success: false,
            imported: 0,
            replaced: 0,
            skipped: 0,
            errors: [e?.message || '未知错误'],
            warnings: [],
            message: `导入失败：${e?.message || '未知错误'}`,
        };
    }
}
