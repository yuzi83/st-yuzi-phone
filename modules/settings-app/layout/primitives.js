import { PHONE_ICONS } from '../../phone-home/icons.js';
import { escapeHtml, escapeHtmlAttr } from '../../utils/dom-escape.js';

export const SETTINGS_ENTRY_META = {
    appearance: {
        glyph: '界',
        title: '界面外观',
        description: '背景、图标布局与显示细节',
        tone: 'is-appearance',
        badge: '桌面',
    },
    beautify: {
        glyph: '模',
        title: '模板工坊',
        description: '管理小剧场与通用表格模板',
        tone: 'is-beautify',
        badge: '模板',
    },
    button_style: {
        glyph: '控',
        title: '控件与按钮',
        description: '调整悬浮入口的尺寸、形态与封面',
        tone: 'is-button',
        badge: '交互',
    },
    database: {
        glyph: '数',
        title: '数据与同步',
        description: '管理预设、更新策略与同步范围',
        tone: 'is-database',
        badge: '同步',
    },
    ai_instruction_presets: {
        glyph: '指',
        title: 'AI 指令预设',
        description: '管理实时回复预设仓库、分段结构与导入导出',
        tone: 'is-ai',
        badge: '预设',
    },
    api_prompt_config: {
        glyph: '文',
        title: 'AI 上下文与世界书',
        description: '管理聊天 API、正文上下文与世界书注入策略',
        tone: 'is-ai',
        badge: '上下文',
    },
};

export function buildSettingsChipHtml(text, tone = 'neutral') {
    const safeText = String(text || '').trim();
    if (!safeText) return '';
    const resolvedTone = String(tone || 'neutral').trim();
    return `<span class="phone-settings-chip${resolvedTone ? ` is-${escapeHtmlAttr(resolvedTone)}` : ''}">${escapeHtml(safeText)}</span>`;
}

export function buildSettingsBadgeHtml(text, tone = 'soft') {
    const safeText = String(text || '').trim();
    if (!safeText) return '';
    const resolvedTone = String(tone || 'soft').trim();
    return `<span class="phone-settings-badge${resolvedTone ? ` is-${escapeHtmlAttr(resolvedTone)}` : ''}">${escapeHtml(safeText)}</span>`;
}

export function buildSettingsHeroHtml({ eyebrow = '', title = '', description = '', chips = [], statsHtml = '', asideHtml = '' }) {
    const chipsHtml = Array.isArray(chips)
        ? chips.map((item) => {
            if (!item) return '';
            if (typeof item === 'string') return buildSettingsChipHtml(item, 'neutral');
            return buildSettingsChipHtml(item.text, item.tone || 'neutral');
        }).join('')
        : '';

    return `
        <section class="phone-settings-hero">
            <div class="phone-settings-hero-main">
                ${eyebrow ? `<span class="phone-settings-hero-eyebrow">${escapeHtml(eyebrow)}</span>` : ''}
                <h2 class="phone-settings-hero-title">${escapeHtml(title)}</h2>
                ${description ? `<p class="phone-settings-hero-description">${escapeHtml(description)}</p>` : ''}
                ${chipsHtml ? `<div class="phone-settings-hero-chips">${chipsHtml}</div>` : ''}
                ${statsHtml || asideHtml ? `<div class="phone-settings-hero-extend">${statsHtml || ''}${asideHtml || ''}</div>` : ''}
            </div>
        </section>
    `;
}

export function buildSettingsStatGridHtml(items = []) {
    const validItems = Array.isArray(items)
        ? items.filter((item) => item && (item.label || item.value || item.note))
        : [];

    if (validItems.length === 0) return '';

    return `
        <div class="phone-settings-stat-grid">
            ${validItems.map((item) => `
                <div class="phone-settings-stat-card">
                    <span class="phone-settings-stat-label">${escapeHtml(item.label || '')}</span>
                    <strong class="phone-settings-stat-value">${escapeHtml(item.value || '')}</strong>
                    ${item.note ? `<span class="phone-settings-stat-note">${escapeHtml(item.note)}</span>` : ''}
                </div>
            `).join('')}
        </div>
    `;
}

export function buildSettingsSummaryListHtml(items = []) {
    const validItems = Array.isArray(items)
        ? items.filter((item) => item && (item.label || item.value))
        : [];

    if (validItems.length === 0) return '';

    return `
        <div class="phone-settings-summary-list">
            ${validItems.map((item) => `
                <div class="phone-settings-summary-item">
                    <span class="phone-settings-summary-label">${escapeHtml(item.label || '')}</span>
                    <span class="phone-settings-summary-value">${escapeHtml(item.value || '')}</span>
                </div>
            `).join('')}
        </div>
    `;
}

export function buildSettingsSectionHtml({ id = '', title = '', desc = '', actionsHtml = '', bodyHtml = '', extraClass = '' }) {
    const resolvedId = String(id || '').trim();
    const resolvedExtraClass = String(extraClass || '').trim();

    return `
        <section class="phone-settings-section${resolvedExtraClass ? ` ${escapeHtmlAttr(resolvedExtraClass)}` : ''}" ${resolvedId ? `id="${escapeHtmlAttr(resolvedId)}"` : ''}>
            <div class="phone-settings-section-head">
                <div class="phone-settings-section-heading">
                    <span class="phone-settings-section-title">${escapeHtml(title)}</span>
                    ${desc ? `<p class="phone-settings-section-subtitle">${escapeHtml(desc)}</p>` : ''}
                </div>
                ${actionsHtml ? `<div class="phone-settings-section-side">${actionsHtml}</div>` : ''}
            </div>
            <div class="phone-settings-section-body">
                ${bodyHtml || ''}
            </div>
        </section>
    `;
}

export function buildSettingsPageFrame({
    title,
    bodyClass = 'phone-app-body phone-settings-scroll',
    bodyHtml = '',
    rightActionHtml = '',
    heroHtml = '',
}) {
    const resolvedBodyClass = String(bodyClass || 'phone-app-body phone-settings-scroll').trim() || 'phone-app-body phone-settings-scroll';
    return `
        <div class="phone-app-page phone-settings-page">
            <div class="phone-nav-bar">
                <button type="button" class="phone-nav-back">${PHONE_ICONS.back}<span>返回</span></button>
                <span class="phone-nav-title">${escapeHtml(title || '')}</span>
                <div class="phone-settings-nav-side${rightActionHtml ? '' : ' phone-settings-nav-side-empty'}">${rightActionHtml || ''}</div>
            </div>
            <div class="${resolvedBodyClass}">
                <div class="phone-settings-page-stack">
                    ${heroHtml || ''}
                    ${bodyHtml || ''}
                </div>
            </div>
        </div>
    `;
}

export function buildSettingsHomeItemHtml({ entry, title, description = '', quickHtml = '', badge = '', tags = [], toneClass = '' }) {
    const entryMeta = SETTINGS_ENTRY_META[entry] || {};
    const resolvedToneClass = String(toneClass || entryMeta.tone || '').trim();
    const resolvedGlyph = String(entryMeta.glyph || title || '设').trim();
    const tagsHtml = Array.isArray(tags)
        ? tags.map((tag) => {
            if (!tag) return '';
            if (typeof tag === 'string') return buildSettingsChipHtml(tag, 'soft');
            return buildSettingsChipHtml(tag.text, tag.tone || 'soft');
        }).join('')
        : '';

    return `
        <article class="phone-settings-home-item${resolvedToneClass ? ` ${escapeHtmlAttr(resolvedToneClass)}` : ''}">
            <button type="button" class="phone-settings-home-trigger" data-entry="${escapeHtmlAttr(entry || '')}">
                <span class="phone-settings-home-icon"><span class="phone-settings-home-glyph">${escapeHtml(resolvedGlyph)}</span></span>
                <span class="phone-settings-home-main">
                    <span class="phone-settings-home-heading">
                        <span class="phone-settings-home-title">${escapeHtml(title || '')}</span>
                        ${badge ? buildSettingsBadgeHtml(badge, 'soft') : ''}
                    </span>
                    ${description ? `<span class="phone-settings-home-desc">${escapeHtml(description)}</span>` : ''}
                    ${tagsHtml ? `<span class="phone-settings-home-meta">${tagsHtml}</span>` : ''}
                </span>
                <span class="phone-settings-home-side">
                    <span class="phone-settings-home-arrow">›</span>
                </span>
            </button>
            ${quickHtml ? `<div class="phone-settings-home-extra">${quickHtml}</div>` : ''}
        </article>
    `;
}
