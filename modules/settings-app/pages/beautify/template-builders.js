import { PHONE_TEMPLATE_TYPE_SPECIAL } from '../../../phone-beautify-templates/shared.js';
import { escapeHtml, escapeHtmlAttr } from '../../../utils/dom-escape.js';
import { getSpecialRendererLabel, summarizeMatcher } from './view-model.js';

function formatUpdatedAt(updatedAt) {
    const numericValue = Number(updatedAt || 0);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return '未知时间';
    }
    return new Date(numericValue).toLocaleString('zh-CN', { hour12: false });
}

function buildTemplateActionHtml({ templateId, type, checked, groupName, isBuiltin }) {
    return `
        <div class="phone-beautify-item-actions">
            <label class="phone-beautify-pick-radio" title="勾选即启用该模板">
                <input type="radio" class="phone-beautify-active-radio" data-template-id="${escapeHtmlAttr(templateId)}" data-template-type="${escapeHtmlAttr(type)}" name="${escapeHtmlAttr(groupName)}" ${checked ? 'checked' : ''}>
                <span>启用</span>
            </label>
            <button type="button" class="phone-settings-btn phone-beautify-export-one" data-template-id="${escapeHtmlAttr(templateId)}">导出</button>
            ${isBuiltin
                ? ''
                : `<button type="button" class="phone-settings-btn phone-settings-btn-danger phone-beautify-delete-one" data-template-id="${escapeHtmlAttr(templateId)}">删除</button>`}
        </div>
    `;
}

function buildTemplateItemHtml(template, config = {}) {
    const {
        type = PHONE_TEMPLATE_TYPE_SPECIAL,
        activeSpecialRendererMap = {},
        activeGenericId = '',
    } = config;

    const templateId = String(template?.id || '').trim();
    const templateName = String(template?.name || '').trim() || templateId || '未命名模板';
    const rendererKey = String(template?.render?.rendererKey || '').trim();
    const isBuiltin = template?.source === 'builtin';
    const sourceText = isBuiltin ? '内置默认' : '用户导入';
    const badgeClass = isBuiltin ? 'is-builtin' : 'is-user';
    const checked = type === PHONE_TEMPLATE_TYPE_SPECIAL
        ? String(activeSpecialRendererMap?.[rendererKey] || '') === templateId
        : String(activeGenericId || '') === templateId;
    const groupName = type === PHONE_TEMPLATE_TYPE_SPECIAL
        ? `phone-beautify-active-special-${rendererKey || 'unknown'}`
        : 'phone-beautify-active-generic';
    const targetLabel = type === PHONE_TEMPLATE_TYPE_SPECIAL
        ? getSpecialRendererLabel(rendererKey)
        : '通用表格';

    return `
        <div class="phone-beautify-item" data-template-id="${escapeHtmlAttr(templateId)}" data-template-type="${escapeHtmlAttr(type)}" data-template-renderer="${escapeHtmlAttr(rendererKey)}">
            <div class="phone-beautify-item-main">
                <div class="phone-beautify-item-title-row">
                    <span class="phone-beautify-item-title">${escapeHtml(templateName)}</span>
                    <span class="phone-beautify-item-badge ${badgeClass}">${sourceText}</span>
                </div>
                <div class="phone-beautify-item-meta">ID: ${escapeHtml(templateId)} · 目标: ${escapeHtml(targetLabel)} · 更新时间: ${escapeHtml(formatUpdatedAt(template?.meta?.updatedAt))}</div>
                <div class="phone-beautify-item-matcher">${summarizeMatcher(template?.matcher)}</div>
            </div>
            ${buildTemplateActionHtml({
                templateId,
                type,
                checked,
                groupName,
                isBuiltin,
            })}
        </div>
    `;
}

export function buildTemplateListHtml(templates = [], config = {}) {
    const {
        emptyText = '暂无模板',
    } = config;

    const safeTemplates = Array.isArray(templates) ? templates : [];
    if (safeTemplates.length === 0) {
        return `<div class="phone-empty-msg">${escapeHtml(emptyText)}</div>`;
    }

    return safeTemplates
        .map((template) => buildTemplateItemHtml(template, config))
        .join('');
}
