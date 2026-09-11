import { escapeHtml, escapeHtmlAttr } from '../../../utils/dom-escape.js';
import {
    buildSettingsHeroHtml,
    buildSettingsPageFrame,
    buildSettingsSectionHtml,
} from '../primitives.js';

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function selected(active, candidate, application) {
    return application === 'popup'
        ? active?.presetId === candidate?.presetId
        : active?.presetId === candidate?.presetId && active?.itemId === candidate?.itemId;
}

function buildApplicationSelect({
    application,
    label,
    emptyLabel,
    sheetKey,
    candidates,
    active,
}) {
    const isPopup = application === 'popup';
    const availableCandidates = asArray(candidates);
    const activeCandidate = availableCandidates.find(candidate => selected(active, candidate, application));
    const currentValue = activeCandidate
        ? (isPopup ? activeCandidate.presetId : `${activeCandidate.presetId}:${activeCandidate.itemId}`)
        : '';
    const options = availableCandidates.map((candidate) => {
        const itemId = isPopup ? '' : candidate.itemId;
        const displayCount = isPopup ? asArray(candidate.displays).length : 0;
        const itemName = isPopup
            ? (displayCount > 1 ? `${displayCount} 款展示样式` : (candidate.item?.name || '自定义展示'))
            : (candidate.item?.name || itemId);
        return `
        <option value="${escapeHtmlAttr(isPopup ? candidate.presetId : `${candidate.presetId}:${itemId}`)}"
            data-preset-id="${escapeHtmlAttr(candidate.presetId)}"
            ${isPopup ? '' : `data-item-id="${escapeHtmlAttr(itemId)}"`}${selected(active, candidate, application) ? ' selected' : ''}>
            ${escapeHtml(candidate.preset?.name || candidate.presetId)} / ${escapeHtml(itemName)}
        </option>
    `;
    }).join('');
    return `<label class="phone-settings-field-inline">
        <span>${escapeHtml(label)}</span>
        <select class="phone-settings-select" data-content-preset-application="${escapeHtmlAttr(application)}"
            data-sheet-key="${escapeHtmlAttr(sheetKey)}" data-content-preset-current-value="${escapeHtmlAttr(currentValue)}"
            aria-label="${escapeHtmlAttr(label)}">
            <option value=""${active ? '' : ' selected'}>${escapeHtml(emptyLabel)}</option>
            ${options}
        </select>
    </label>`;
}

export function buildBeautifyTemplatePageHtml(viewModel = {}) {
    const presets = Array.isArray(viewModel.presets) ? viewModel.presets : [];
    const tables = Array.isArray(viewModel.tables) ? viewModel.tables : [];
    const status = String(viewModel.status || 'loading');
    const heroHtml = buildSettingsHeroHtml({
        eyebrow: '模板工坊',
        title: '模板工坊',
        description: '导入预设，为表格选择展示。',
    });
    const statusHtml = status === 'loading'
        ? '<div class="phone-settings-note">正在读取模板仓库…</div>'
        : status === 'unavailable' || status === 'error'
            ? `<div class="phone-settings-note">模板仓库不可用：${escapeHtml(viewModel.error?.message || '未知错误')}</div>`
            : '';
    const presetCardsHtml = presets.length > 0
        ? presets.map((preset) => {
            const issues = Array.isArray(preset.issues) ? preset.issues : [];
            return `<article class="phone-settings-card">
                <div class="phone-settings-card-title">${escapeHtml(preset.name || preset.id)}</div>
                <div class="phone-settings-card-desc">${Number(preset.items?.length || 0)}个模板项</div>
                ${issues.length > 0 ? `<ul class="phone-settings-list">${issues.map((issue) => `<li><strong>${escapeHtml(issue.code || 'issue')}</strong>：${escapeHtml(issue.message || '')}</li>`).join('')}</ul>` : ''}
                <div class="phone-settings-action"><button type="button" class="phone-settings-btn" data-action="export" data-preset-id="${escapeHtmlAttr(preset.id)}">导出</button><button type="button" class="phone-settings-btn phone-settings-btn-danger" data-action="delete" data-preset-id="${escapeHtmlAttr(preset.id)}">删除</button></div>
            </article>`;
        }).join('')
        : '<div class="phone-settings-note">尚未导入玉子美化预设。</div>';
    const tableCardsHtml = tables.length > 0
        ? tables.map((table) => {
            const pageCandidates = asArray(table.pageCandidates ?? table.candidates);
            const pageActive = table.pageActive ?? table.active;
            const popupCandidates = asArray(table.popupCandidates);
            const popupActive = table.popupActive;
            const applications = `${buildApplicationSelect({
                application: 'page',
                label: '表格美化应用',
                emptyLabel: '默认页面',
                sheetKey: table.sheetKey,
                candidates: pageCandidates,
                active: pageActive,
            })}${buildApplicationSelect({
                application: 'popup',
                label: '弹窗应用',
                emptyLabel: '内置展示',
                sheetKey: table.sheetKey,
                candidates: popupCandidates,
                active: popupActive,
            })}`;
            return `<article class="phone-settings-card"><div class="phone-settings-card-title">${escapeHtml(table.tableName || table.sheetKey)}</div><div class="phone-settings-form">${applications}</div></article>`;
        }).join('')
        : '<div class="phone-settings-note">没有可配置的真实表。</div>';
    const bodyHtml = `${statusHtml}
        ${buildSettingsSectionHtml({ title: '完整预设', bodyHtml: `<div class="phone-settings-action"><button type="button" class="phone-settings-btn phone-settings-btn-primary" data-action="import">导入预设</button></div>${presetCardsHtml}` })}
        ${buildSettingsSectionHtml({ title: '表格应用', desc: '导入后，请分别选择页面和弹窗应用。', bodyHtml: `${tableCardsHtml}<div class="phone-settings-action"><button type="button" class="phone-settings-btn phone-settings-btn-danger" data-action="clear-all-page">全部恢复页面默认</button><button type="button" class="phone-settings-btn phone-settings-btn-danger" data-action="clear-all-popup">全部清空弹窗应用</button></div>` })}`;
    return buildSettingsPageFrame({
        title: '模板工坊',
        heroHtml,
        bodyClass: 'phone-app-body phone-settings-scroll phone-settings-open',
        bodyHtml,
    });
}
