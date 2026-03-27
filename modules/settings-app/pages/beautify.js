import {
    PHONE_TEMPLATE_TYPE_SPECIAL,
    PHONE_TEMPLATE_TYPE_GENERIC,
    PHONE_BEAUTIFY_TEMPLATE_EXPORT_MODE_ANNOTATED,
} from '../../phone-beautify-templates/shared.js';
import {
    getPhoneBeautifyTemplatesByType,
    deletePhoneBeautifyUserTemplate,
    getActiveBeautifyTemplateIdsForSpecial,
    getActiveBeautifyTemplateIdByType,
    setActiveBeautifyTemplateIdByType,
} from '../../phone-beautify-templates/repository.js';
import {
    importPhoneBeautifyPackFromData,
    exportPhoneBeautifyPack,
} from '../../phone-beautify-templates/import-export.js';
import { escapeHtml, escapeHtmlAttr } from '../../utils.js';
import { downloadTextFile } from '../services/media-upload.js';
import { buildBeautifyTemplatePageHtml as buildBeautifyTemplatePageHtmlFromFrame } from '../layout/frame.js';
import { showConfirmDialog } from '../ui/confirm-dialog.js';
import { showToast } from '../ui/toast.js';
import { createBeautifyPageBehavior } from './beautify-behavior.js';

export function renderBeautifyTemplatePage(ctx) {
    const {
        container,
        state,
        render,
        captureScroll,
        restoreScroll,
    } = ctx;

    const allSpecialTemplates = getPhoneBeautifyTemplatesByType(PHONE_TEMPLATE_TYPE_SPECIAL, {
        includeBuiltin: true,
        includeUser: true,
        enabledOnly: true,
    });
    const allGenericTemplates = getPhoneBeautifyTemplatesByType(PHONE_TEMPLATE_TYPE_GENERIC, {
        includeBuiltin: true,
        includeUser: true,
        enabledOnly: true,
    });

    const allTemplates = [...allSpecialTemplates, ...allGenericTemplates];

    const activeSpecialMap = getActiveBeautifyTemplateIdsForSpecial({ withFallback: true, persist: true });
    const activeGenericTemplateId = getActiveBeautifyTemplateIdByType(PHONE_TEMPLATE_TYPE_GENERIC, {
        withFallback: true,
        persist: true,
    });

    const getSpecialRendererLabel = (rendererKey) => {
        const key = String(rendererKey || '');
        if (key === 'special_message') return '消息记录';
        if (key === 'special_moments') return '动态';
        if (key === 'special_forum') return '论坛';
        return '专属';
    };

    const getTemplateById = (templateId) => {
        const safeId = String(templateId || '').trim();
        if (!safeId) return null;
        return allTemplates.find(t => t.id === safeId) || null;
    };

    const summarizeMatcher = (matcher) => {
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
    };

    const renderTemplateListHtml = (templates, config = {}) => {
        const {
            emptyText = '暂无模板',
            type = PHONE_TEMPLATE_TYPE_SPECIAL,
            activeSpecialRendererMap = {},
            activeGenericId = '',
        } = config;

        if (!templates || templates.length === 0) {
            return `<div class="phone-empty-msg">${escapeHtml(emptyText)}</div>`;
        }

        return templates.map((template) => {
            const isBuiltin = template.source === 'builtin';
            const sourceText = isBuiltin ? '内置默认' : '用户导入';
            const badgeClass = isBuiltin ? 'is-builtin' : 'is-user';
            const updatedAt = Number(template.meta?.updatedAt || 0);
            const dateText = Number.isFinite(updatedAt) && updatedAt > 0
                ? new Date(updatedAt).toLocaleString('zh-CN', { hour12: false })
                : '未知时间';

            const rendererKey = String(template?.render?.rendererKey || '');
            const isSpecial = type === PHONE_TEMPLATE_TYPE_SPECIAL;
            const groupName = isSpecial
                ? `phone-beautify-active-special-${rendererKey || 'unknown'}`
                : 'phone-beautify-active-generic';

            const checked = isSpecial
                ? String(activeSpecialRendererMap[rendererKey] || '') === template.id
                : String(activeGenericId || '') === template.id;

            const targetLabel = isSpecial
                ? getSpecialRendererLabel(rendererKey)
                : '通用表格';

            return `
                <div class="phone-beautify-item" data-template-id="${escapeHtmlAttr(template.id)}" data-template-type="${escapeHtmlAttr(type)}" data-template-renderer="${escapeHtmlAttr(rendererKey)}">
                    <div class="phone-beautify-item-main">
                        <div class="phone-beautify-item-title-row">
                            <span class="phone-beautify-item-title">${escapeHtml(template.name)}</span>
                            <span class="phone-beautify-item-badge ${badgeClass}">${sourceText}</span>
                        </div>
                        <div class="phone-beautify-item-meta">ID: ${escapeHtml(template.id)} · 目标: ${escapeHtml(targetLabel)} · 更新时间: ${escapeHtml(dateText)}</div>
                        <div class="phone-beautify-item-matcher">${summarizeMatcher(template.matcher)}</div>
                    </div>
                    <div class="phone-beautify-item-actions">
                        <label class="phone-beautify-pick-radio" title="勾选即启用该模板">
                            <input type="radio" class="phone-beautify-active-radio" data-template-id="${escapeHtmlAttr(template.id)}" data-template-type="${escapeHtmlAttr(type)}" name="${escapeHtmlAttr(groupName)}" ${checked ? 'checked' : ''}>
                            <span>启用</span>
                        </label>
                        <button type="button" class="phone-settings-btn phone-beautify-export-one" data-template-id="${escapeHtmlAttr(template.id)}">导出</button>
                        ${isBuiltin
                            ? ''
                            : `<button type="button" class="phone-settings-btn phone-settings-btn-danger phone-beautify-delete-one" data-template-id="${escapeHtmlAttr(template.id)}">删除</button>`}
                    </div>
                </div>
            `;
        }).join('');
    };

    const specialListHtml = renderTemplateListHtml(allSpecialTemplates, {
        emptyText: '暂无专属小剧场模板',
        type: PHONE_TEMPLATE_TYPE_SPECIAL,
        activeSpecialRendererMap: activeSpecialMap,
        activeGenericId: activeGenericTemplateId,
    });
    const genericListHtml = renderTemplateListHtml(allGenericTemplates, {
        emptyText: '暂无通用表格模板',
        type: PHONE_TEMPLATE_TYPE_GENERIC,
        activeSpecialRendererMap: activeSpecialMap,
        activeGenericId: activeGenericTemplateId,
    });

    const activeSpecialSummary = ['special_message', 'special_moments', 'special_forum']
        .map((key) => {
            const activeId = String(activeSpecialMap[key] || '');
            if (!activeId) return `${getSpecialRendererLabel(key)}: 未启用`;
            const hit = allSpecialTemplates.find(t => t.id === activeId);
            return `${getSpecialRendererLabel(key)}: ${hit?.name || activeId}`;
        })
        .join('；');
    const activeGenericSummary = (() => {
        if (!activeGenericTemplateId) return '未启用';
        const hit = allGenericTemplates.find(t => t.id === activeGenericTemplateId);
        return hit?.name || activeGenericTemplateId;
    })();

    container.innerHTML = buildBeautifyTemplatePageHtmlFromFrame({
        activeSpecialSummary,
        activeGenericSummary,
        specialListHtml,
        genericListHtml,
        allTemplatesCount: allTemplates.length,
        allSpecialTemplatesCount: allSpecialTemplates.length,
        allGenericTemplatesCount: allGenericTemplates.length,
    });

    container.querySelector('.phone-nav-back')?.addEventListener('click', () => {
        state.mode = 'home';
        render();
    });

    const {
        rerenderBeautifyKeepScroll,
        handleTemplateActivation,
        triggerExport,
        bindImportByType,
        handleSingleTemplateExport,
        handleDeleteTemplate,
    } = createBeautifyPageBehavior({
        container,
        ctx,
        getTemplateById,
        renderPage: renderBeautifyTemplatePage,
    }, {
        setActiveBeautifyTemplateIdByType,
        importPhoneBeautifyPackFromData,
        exportPhoneBeautifyPack,
        deletePhoneBeautifyUserTemplate,
        downloadTextFile,
        showConfirmDialog,
        showToast,
        requestAnimationFrameImpl: requestAnimationFrame,
        createFileReader: () => new FileReader(),
        annotatedExportMode: PHONE_BEAUTIFY_TEMPLATE_EXPORT_MODE_ANNOTATED,
    });

    container.querySelectorAll('.phone-beautify-active-radio').forEach((radio) => {
        const input = radio;
        if (!(input instanceof HTMLInputElement)) return;

        input.addEventListener('change', () => {
            if (!input.checked) return;

            const templateId = String(input.dataset.templateId || '').trim();
            const templateType = String(input.dataset.templateType || '').trim();
            handleTemplateActivation({ templateId, templateType });
        });
    });

    bindImportByType('#phone-beautify-import-special-btn', '#phone-beautify-import-special-input', PHONE_TEMPLATE_TYPE_SPECIAL, '专属模板');
    bindImportByType('#phone-beautify-import-generic-btn', '#phone-beautify-import-generic-input', PHONE_TEMPLATE_TYPE_GENERIC, '通用模板');

    container.querySelector('#phone-beautify-export-special-btn')?.addEventListener('click', () => {
        triggerExport(
            {
                templateType: PHONE_TEMPLATE_TYPE_SPECIAL,
                packName: '专属小剧场模板包',
                exportMode: PHONE_BEAUTIFY_TEMPLATE_EXPORT_MODE_ANNOTATED,
            },
            'yuzi_phone_special_templates.json',
            '专属模板已导出'
        );
    });

    container.querySelector('#phone-beautify-export-special-default-btn')?.addEventListener('click', () => {
        triggerExport(
            {
                templateType: PHONE_TEMPLATE_TYPE_SPECIAL,
                builtinOnly: true,
                packName: '专属默认模板参考包',
                exportMode: PHONE_BEAUTIFY_TEMPLATE_EXPORT_MODE_ANNOTATED,
            },
            'yuzi_phone_special_builtin_templates.json',
            '专属默认模板已导出'
        );
    });

    container.querySelector('#phone-beautify-export-generic-btn')?.addEventListener('click', () => {
        triggerExport(
            {
                templateType: PHONE_TEMPLATE_TYPE_GENERIC,
                packName: '通用表格模板包',
                exportMode: PHONE_BEAUTIFY_TEMPLATE_EXPORT_MODE_ANNOTATED,
            },
            'yuzi_phone_generic_templates.json',
            '通用模板已导出'
        );
    });

    container.querySelector('#phone-beautify-export-generic-default-btn')?.addEventListener('click', () => {
        triggerExport(
            {
                templateType: PHONE_TEMPLATE_TYPE_GENERIC,
                builtinOnly: true,
                packName: '通用默认模板参考包',
                exportMode: PHONE_BEAUTIFY_TEMPLATE_EXPORT_MODE_ANNOTATED,
            },
            'yuzi_phone_generic_builtin_templates.json',
            '通用默认模板已导出'
        );
    });

    container.querySelectorAll('.phone-beautify-export-one').forEach((btn) => {
        btn.addEventListener('click', () => {
            const templateId = String(btn.getAttribute('data-template-id') || '').trim();
            if (!templateId) return;
            handleSingleTemplateExport(templateId);
        });
    });

    container.querySelectorAll('.phone-beautify-delete-one').forEach((btn) => {
        btn.addEventListener('click', () => {
            const templateId = String(btn.getAttribute('data-template-id') || '').trim();
            if (!templateId) return;
            handleDeleteTemplate(templateId);
        });
    });
}
