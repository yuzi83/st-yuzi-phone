import { PHONE_TEMPLATE_TYPE_GENERIC, PHONE_TEMPLATE_TYPE_SPECIAL } from '../../../phone-beautify-templates/shared.js';
import { escapeHtml } from '../../../utils/dom-escape.js';

export function getSpecialRendererLabel(rendererKey) {
    const key = String(rendererKey || '').trim();
    if (key === 'special_message') return '消息记录';
    return '专属';
}

export function getTemplateById(templates = [], templateId) {
    const safeId = String(templateId || '').trim();
    if (!safeId) return null;
    const source = Array.isArray(templates) ? templates : [];
    return source.find((template) => template?.id === safeId) || null;
}

export function summarizeMatcher(matcher) {
    const src = matcher && typeof matcher === 'object' ? matcher : {};
    const chunks = [];

    const exact = Array.isArray(src.tableNameExact) ? src.tableNameExact.filter(Boolean) : [];
    const required = Array.isArray(src.requiredHeaders) ? src.requiredHeaders.filter(Boolean) : [];
    const optional = Array.isArray(src.optionalHeaders) ? src.optionalHeaders.filter(Boolean) : [];

    if (exact.length > 0) {
        chunks.push(`表名: ${escapeHtml(exact.slice(0, 3).join(' / '))}${exact.length > 3 ? '…' : ''}`);
    }
    if (required.length > 0) {
        chunks.push(`必需列: ${escapeHtml(required.slice(0, 4).join(' / '))}${required.length > 4 ? '…' : ''}`);
    }
    if (optional.length > 0) {
        chunks.push(`可选列: ${escapeHtml(optional.slice(0, 3).join(' / '))}${optional.length > 3 ? '…' : ''}`);
    }

    return chunks.join(' · ') || '未配置明显匹配特征';
}

export function buildActiveSpecialSummary(allSpecialTemplates = [], activeSpecialMap = {}) {
    const activeId = String(activeSpecialMap.special_message || '').trim();
    if (!activeId) return '消息记录: 未启用';
    const hit = getTemplateById(allSpecialTemplates, activeId);
    return `消息记录: ${hit?.name || activeId}`;
}

export function buildActiveGenericSummary(allGenericTemplates = [], activeGenericTemplateId = '') {
    const safeActiveId = String(activeGenericTemplateId || '').trim();
    if (!safeActiveId) return '未启用';
    const hit = getTemplateById(allGenericTemplates, safeActiveId);
    return hit?.name || safeActiveId;
}

export function buildBeautifyPageViewModel({
    allSpecialTemplates = [],
    allGenericTemplates = [],
    activeSpecialMap = {},
    activeGenericTemplateId = '',
} = {}) {
    const specialTemplates = Array.isArray(allSpecialTemplates) ? allSpecialTemplates : [];
    const genericTemplates = Array.isArray(allGenericTemplates) ? allGenericTemplates : [];
    const allTemplates = [...specialTemplates, ...genericTemplates];

    return {
        allTemplates,
        allTemplatesCount: allTemplates.length,
        allSpecialTemplatesCount: specialTemplates.length,
        allGenericTemplatesCount: genericTemplates.length,
        activeSpecialSummary: buildActiveSpecialSummary(specialTemplates, activeSpecialMap),
        activeGenericSummary: buildActiveGenericSummary(genericTemplates, activeGenericTemplateId),
        specialTemplates,
        genericTemplates,
        activeSpecialMap,
        activeGenericTemplateId: String(activeGenericTemplateId || '').trim(),
        getTemplateById: (templateId) => getTemplateById(allTemplates, templateId),
        resolveChecked(template, type = PHONE_TEMPLATE_TYPE_SPECIAL) {
            const rendererKey = String(template?.render?.rendererKey || '').trim();
            if (type === PHONE_TEMPLATE_TYPE_SPECIAL) {
                return String(activeSpecialMap?.[rendererKey] || '') === String(template?.id || '').trim();
            }
            if (type === PHONE_TEMPLATE_TYPE_GENERIC) {
                return String(activeGenericTemplateId || '').trim() === String(template?.id || '').trim();
            }
            return false;
        },
    };
}
