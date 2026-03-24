import { PHONE_ICONS } from '../../phone-home.js';
import {
    PHONE_BEAUTIFY_TEMPLATE_FORMAT,
    PHONE_BEAUTIFY_TEMPLATE_SCHEMA_VERSION,
} from '../../phone-beautify-templates.js';
import { escapeHtml, escapeHtmlAttr } from '../../utils.js';

const SETTINGS_ENTRY_META = {
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
    api_prompt_config: {
        glyph: 'AI',
        title: 'AI 与提示词',
        description: '整合 API、模板、上下文与世界书配置',
        tone: 'is-ai',
        badge: '智能',
    },
};

function buildSettingsChipHtml(text, tone = 'neutral') {
    const safeText = String(text || '').trim();
    if (!safeText) return '';
    const resolvedTone = String(tone || 'neutral').trim();
    return `<span class="phone-settings-chip${resolvedTone ? ` is-${escapeHtmlAttr(resolvedTone)}` : ''}">${escapeHtml(safeText)}</span>`;
}

function buildSettingsBadgeHtml(text, tone = 'soft') {
    const safeText = String(text || '').trim();
    if (!safeText) return '';
    const resolvedTone = String(tone || 'soft').trim();
    return `<span class="phone-settings-badge${resolvedTone ? ` is-${escapeHtmlAttr(resolvedTone)}` : ''}">${escapeHtml(safeText)}</span>`;
}

function buildSettingsHeroHtml({ eyebrow = '', title = '', description = '', chips = [], statsHtml = '', asideHtml = '' }) {
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

function buildSettingsStatGridHtml(items = []) {
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

function buildSettingsSummaryListHtml(items = []) {
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

function buildSettingsSectionHtml({ id = '', title = '', desc = '', actionsHtml = '', bodyHtml = '', extraClass = '' }) {
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

export function buildSettingsHomePageHtml({
    apiAvailability,
    quickPresetOptions,
    apiPresetQuickOptions,
    activePresetName = '',
    currentTablePreset = '',
}) {
    const dbPresetLabel = activePresetName ? `预设 · ${activePresetName}` : '预设 · 当前配置';
    const apiPresetLabel = currentTablePreset ? `填表 · ${currentTablePreset}` : '填表 · 当前配置';

    const heroHtml = buildSettingsHeroHtml({
        eyebrow: 'SillyTavern 扩展',
        title: '设置中心',
        description: '统一管理界面外观、模板、按钮、数据同步与 AI 提示词配置。',
        chips: [
            { text: '5 个一级模块', tone: 'info' },
            { text: apiAvailability.ok ? '数据库接口正常' : '数据库接口异常', tone: apiAvailability.ok ? 'success' : 'danger' },
            { text: activePresetName ? `数据库预设：${activePresetName}` : '数据库预设：当前配置', tone: 'soft' },
        ],
    });

    const bodyHtml = `
        ${buildSettingsSectionHtml({
            title: '功能入口',
            desc: '从首页进入不同的设置工作台，快速调整界面、模板、按钮、同步策略与 AI 配置。',
            extraClass: 'phone-settings-section-home',
            bodyHtml: `
                <div class="phone-settings-home-list">
                    ${buildSettingsHomeItemHtml({
                        entry: 'appearance',
                        title: SETTINGS_ENTRY_META.appearance.title,
                        description: SETTINGS_ENTRY_META.appearance.description,
                        badge: SETTINGS_ENTRY_META.appearance.badge,
                        tags: ['背景与主题', '图标网格', '显示细节'],
                    })}
                    ${buildSettingsHomeItemHtml({
                        entry: 'beautify',
                        title: SETTINGS_ENTRY_META.beautify.title,
                        description: SETTINGS_ENTRY_META.beautify.description,
                        badge: SETTINGS_ENTRY_META.beautify.badge,
                        tags: ['专属模板', '通用模板', '导入导出'],
                    })}
                    ${buildSettingsHomeItemHtml({
                        entry: 'button_style',
                        title: SETTINGS_ENTRY_META.button_style.title,
                        description: SETTINGS_ENTRY_META.button_style.description,
                        badge: SETTINGS_ENTRY_META.button_style.badge,
                        tags: ['尺寸', '形态', '封面'],
                    })}
                    ${buildSettingsHomeItemHtml({
                        entry: 'database',
                        title: SETTINGS_ENTRY_META.database.title,
                        description: SETTINGS_ENTRY_META.database.description,
                        badge: SETTINGS_ENTRY_META.database.badge,
                        tags: [dbPresetLabel, apiAvailability.ok ? '接口可用' : '接口异常', '同步策略'],
                        quickHtml: `
                            <div class="phone-settings-home-quick" title="快速切换数据库预设">
                                <label class="phone-settings-home-quick-label" for="phone-db-preset-quick-select">数据库预设</label>
                                <select id="phone-db-preset-quick-select" class="phone-settings-home-quick-select" ${apiAvailability.ok ? '' : 'disabled'}>
                                    ${quickPresetOptions}
                                </select>
                            </div>
                        `,
                    })}
                    ${buildSettingsHomeItemHtml({
                        entry: 'api_prompt_config',
                        title: SETTINGS_ENTRY_META.api_prompt_config.title,
                        description: SETTINGS_ENTRY_META.api_prompt_config.description,
                        badge: SETTINGS_ENTRY_META.api_prompt_config.badge,
                        tags: [apiPresetLabel, '聊天上下文', '世界书'],
                        quickHtml: `
                            <div class="phone-settings-home-quick" title="快速选择填表 API 预设">
                                <label class="phone-settings-home-quick-label" for="phone-api-preset-quick-select">填表 API</label>
                                <select id="phone-api-preset-quick-select" class="phone-settings-home-quick-select" ${apiAvailability.ok ? '' : 'disabled'}>
                                    ${apiPresetQuickOptions}
                                </select>
                            </div>
                        `,
                    })}
                </div>
            `,
        })}
        <div class="phone-settings-inline-status ${apiAvailability.ok ? 'is-success' : 'is-danger'}">
            <span class="phone-settings-inline-status-dot"></span>
            <span class="phone-settings-inline-status-text">${escapeHtml(apiAvailability.ok ? '数据库接口已连接，可直接切换数据库与 AI 预设。' : (apiAvailability.message || '数据库 API 不可用'))}</span>
        </div>
    `;

    return buildSettingsPageFrame({
        title: '设置',
        heroHtml,
        rightActionHtml: `
            <button type="button" class="phone-settings-btn phone-settings-btn-ghost phone-settings-nav-action" id="phone-top-trigger-update">
                <span>手动更新</span>
            </button>
        `,
        bodyHtml,
    });
}

export function buildAppearancePageHtml({ layoutValues, hideTableCountBadge }) {
    const heroHtml = buildSettingsHeroHtml({
        eyebrow: '界面外观',
        title: '桌面视觉与布局',
        description: '统一管理背景、图标密度、显示细节与自定义图标资源。',
        chips: [
            { text: `${layoutValues.appGridColumns} 列网格`, tone: 'info' },
            { text: `图标 ${layoutValues.appIconSize}px`, tone: 'soft' },
            { text: hideTableCountBadge ? '数量徽标已隐藏' : '数量徽标显示中', tone: 'neutral' },
        ],
    });

    const bodyHtml = `
        ${buildSettingsSectionHtml({
            title: '主题与背景',
            desc: '上传背景图或恢复默认背景，让桌面保持轻盈、干净的视觉氛围。',
            actionsHtml: `
                <div class="phone-settings-action">
                    <button type="button" class="phone-settings-btn" id="phone-upload-bg">
                        ${PHONE_ICONS.upload}
                        <span>上传</span>
                    </button>
                    <button type="button" class="phone-settings-btn phone-settings-btn-danger" id="phone-clear-bg">清除</button>
                </div>
            `,
            bodyHtml: `
                <div class="phone-settings-note">建议选择浅色、低干扰背景，以保证图标与文字的可读性。</div>
                <div id="phone-bg-preview" class="phone-settings-preview"></div>
            `,
        })}

        ${buildSettingsSectionHtml({
            title: '图标布局',
            desc: '通过图标数量、尺寸、圆角与间距建立更清晰的桌面秩序。',
            bodyHtml: `
                <div class="phone-settings-layout-grid">
                    <label class="phone-settings-field-inline">
                        <span>每行图标</span>
                        <input type="number" min="3" max="6" id="phone-app-grid-columns" class="phone-settings-input" value="${escapeHtmlAttr(layoutValues.appGridColumns)}">
                    </label>
                    <label class="phone-settings-field-inline">
                        <span>图标大小</span>
                        <input type="number" min="40" max="88" id="phone-app-icon-size" class="phone-settings-input" value="${escapeHtmlAttr(layoutValues.appIconSize)}">
                    </label>
                    <label class="phone-settings-field-inline">
                        <span>圆角</span>
                        <input type="number" min="6" max="26" id="phone-app-icon-radius" class="phone-settings-input" value="${escapeHtmlAttr(layoutValues.appIconRadius)}">
                    </label>
                    <label class="phone-settings-field-inline">
                        <span>图标间距</span>
                        <input type="number" min="8" max="24" id="phone-app-grid-gap" class="phone-settings-input" value="${escapeHtmlAttr(layoutValues.appGridGap)}">
                    </label>
                    <label class="phone-settings-field-inline">
                        <span>Dock 图标大小</span>
                        <input type="number" min="32" max="72" id="phone-dock-icon-size" class="phone-settings-input" value="${escapeHtmlAttr(layoutValues.dockIconSize)}">
                    </label>
                </div>
            `,
        })}

        ${buildSettingsSectionHtml({
            title: '显示控制',
            desc: '控制表格类 App 的数量徽标是否展示，减少视觉噪音。',
            bodyHtml: `
                <div class="phone-appearance-switch-list">
                    <label class="phone-appearance-switch-item" for="phone-hide-table-count-badge">
                        <span class="phone-appearance-switch-main">隐藏数量徽标</span>
                        <input type="checkbox" id="phone-hide-table-count-badge" class="phone-settings-switch" ${hideTableCountBadge ? 'checked' : ''}>
                    </label>
                </div>
            `,
        })}

        ${buildSettingsSectionHtml({
            title: '隐藏表格类 App',
            desc: '按需屏蔽不常用的表格入口，让首页更聚焦。',
            bodyHtml: `<div id="phone-hidden-table-apps" class="phone-appearance-checklist"></div>`,
        })}

        ${buildSettingsSectionHtml({
            title: '自定义图标',
            desc: '为不同 App 上传更具识别度的图标资源，形成统一视觉记忆。',
            bodyHtml: `<div id="phone-icon-upload-list" class="phone-icon-upload-list"></div>`,
        })}
    `;

    return buildSettingsPageFrame({
        title: '界面外观',
        heroHtml,
        bodyClass: 'phone-app-body phone-settings-scroll phone-settings-open',
        bodyHtml,
    });
}

export function buildDatabaseTableChecklistHtml(tableEntries, selectedSet, apiAvailability) {
    if (tableEntries.length === 0) {
        return '<div class="phone-empty-msg">当前没有可选表格</div>';
    }

    return tableEntries.map((item) => `
        <label class="phone-db-table-item" data-sheet-key="${escapeHtmlAttr(item.key)}">
            <span class="phone-db-table-name">${escapeHtml(item.name)}</span>
            <input type="checkbox" class="phone-settings-switch" ${selectedSet.has(item.key) ? 'checked' : ''} ${apiAvailability.ok ? '' : 'disabled'}>
        </label>
    `).join('');
}

export function buildDatabasePageHtml({
    apiAvailability,
    activePresetName,
    presetOptions,
    updateConfig,
    disabledAttr,
    manualSelectionMeta,
    tableChecklistHtml,
}) {
    const heroHtml = buildSettingsHeroHtml({
        eyebrow: '数据与同步',
        title: '数据库预设与同步策略',
        description: '集中管理接口状态、预设中心、更新参数与手动同步范围。',
        chips: [
            { text: apiAvailability.ok ? '接口正常' : '接口异常', tone: apiAvailability.ok ? 'success' : 'danger' },
            { text: activePresetName ? `当前预设：${activePresetName}` : '当前预设：未绑定', tone: 'soft' },
            { text: manualSelectionMeta.includes('默认全选') ? '同步范围：默认全选' : '同步范围：自定义', tone: 'neutral' },
        ],
    });

    const bodyHtml = `
        ${buildSettingsSectionHtml({
            title: '接口状态',
            desc: '当前页面严格使用 AutoCardUpdaterAPI 的数据库配置接口读写数据。',
            bodyHtml: `<div class="phone-db-api-status ${apiAvailability.ok ? 'is-ok' : 'is-error'}">${escapeHtml(apiAvailability.message || '')}</div>`,
        })}

        ${buildSettingsSectionHtml({
            id: 'phone-db-preset-section',
            title: '预设中心',
            desc: '预设同时保存更新配置参数与手动表选择，适合在不同工作模式间快速切换。',
            bodyHtml: `
                <div class="phone-db-preset-grid">
                    <label class="phone-settings-field-inline phone-settings-field-full">
                        <span>切换预设</span>
                        <select id="phone-db-preset-select" class="phone-settings-input" ${disabledAttr}>
                            ${presetOptions}
                        </select>
                    </label>

                    <label class="phone-settings-field-inline phone-settings-field-full">
                        <span>预设名称</span>
                        <input id="phone-db-preset-name" class="phone-settings-input" value="${escapeHtmlAttr(activePresetName)}" placeholder="输入新预设名" ${disabledAttr}>
                    </label>
                </div>

                <div class="phone-settings-action phone-settings-action-wrap">
                    <button type="button" class="phone-settings-btn" id="phone-db-preset-save-btn" ${disabledAttr}>保存为新预设</button>
                    <button type="button" class="phone-settings-btn" id="phone-db-preset-overwrite-btn" ${disabledAttr}>覆盖同名预设</button>
                    <button type="button" class="phone-settings-btn phone-settings-btn-danger" id="phone-db-preset-delete-btn" ${disabledAttr}>删除当前预设</button>
                </div>

                <div class="phone-settings-inline-meta" id="phone-db-preset-current-meta">当前激活：${activePresetName ? escapeHtml(activePresetName) : '未绑定预设'}</div>
            `,
        })}

        ${buildSettingsSectionHtml({
            id: 'phone-db-update-config-section',
            title: '更新策略',
            desc: '控制上下文读取、自动更新频率、批量大小与保留楼层范围。',
            bodyHtml: `
                <div class="phone-db-field-grid">
                    <label class="phone-settings-field-inline">
                        <span>AI读取上下文层数</span>
                        <input type="number" min="0" step="1" id="phone-db-auto-update-threshold" class="phone-settings-input" value="${escapeHtmlAttr(updateConfig.autoUpdateThreshold)}" ${disabledAttr}>
                    </label>
                    <label class="phone-settings-field-inline">
                        <span>每N层自动更新一次</span>
                        <input type="number" min="1" step="1" id="phone-db-auto-update-frequency" class="phone-settings-input" value="${escapeHtmlAttr(updateConfig.autoUpdateFrequency)}" ${disabledAttr}>
                    </label>
                    <label class="phone-settings-field-inline">
                        <span>每批次更新楼层数</span>
                        <input type="number" min="1" step="1" id="phone-db-update-batch-size" class="phone-settings-input" value="${escapeHtmlAttr(updateConfig.updateBatchSize)}" ${disabledAttr}>
                    </label>
                    <label class="phone-settings-field-inline">
                        <span>保留X层楼不更新</span>
                        <input type="number" min="0" step="1" id="phone-db-auto-update-token-threshold" class="phone-settings-input" value="${escapeHtmlAttr(updateConfig.autoUpdateTokenThreshold)}" ${disabledAttr}>
                    </label>
                </div>

                <div class="phone-settings-action phone-settings-action-wrap">
                    <button type="button" class="phone-settings-btn" id="phone-db-update-config-save-btn" ${disabledAttr}>保存更新配置</button>
                    <button type="button" class="phone-settings-btn" id="phone-db-update-config-reload-btn" ${disabledAttr}>重新读取</button>
                </div>
            `,
        })}

        ${buildSettingsSectionHtml({
            id: 'phone-db-manual-selection-section',
            title: '同步范围',
            desc: '选择哪些表参与手动更新；全部勾选时会自动恢复为默认全选模式。',
            bodyHtml: `
                <div class="phone-settings-note">${escapeHtml(manualSelectionMeta)}</div>
                <div class="phone-db-table-checklist" id="phone-db-table-checklist">
                    ${tableChecklistHtml}
                </div>

                <div class="phone-settings-action phone-settings-action-wrap">
                    <button type="button" class="phone-settings-btn" id="phone-db-manual-check-all-btn">全选</button>
                    <button type="button" class="phone-settings-btn" id="phone-db-manual-invert-btn">反选</button>
                    <button type="button" class="phone-settings-btn" id="phone-db-manual-save-btn">保存选择</button>
                    <button type="button" class="phone-settings-btn phone-settings-btn-danger" id="phone-db-manual-reset-btn">恢复默认全选</button>
                </div>
            `,
        })}
    `;

    return buildSettingsPageFrame({
        title: '数据与同步',
        heroHtml,
        bodyClass: 'phone-app-body phone-settings-scroll phone-settings-open',
        rightActionHtml: `
            <button type="button" class="phone-settings-btn phone-settings-btn-ghost phone-settings-nav-action" id="phone-db-refresh-btn">
                <span>刷新</span>
            </button>
        `,
        bodyHtml,
    });
}

export function buildButtonStylePageHtml({ currentSize, currentShape, currentCover }) {
    const previewHtml = currentCover
        ? `<img src="${escapeHtmlAttr(currentCover)}" class="phone-bg-thumb" alt="按钮封面预览">`
        : '<div class="phone-empty-msg">未设置封面</div>';

    const heroHtml = buildSettingsHeroHtml({
        eyebrow: '控件与按钮',
        title: '悬浮入口样式',
        description: '调整入口尺寸、按钮形态与封面素材，让触达体验更轻盈。',
        chips: [
            { text: `尺寸 ${currentSize}px`, tone: 'info' },
            { text: currentShape === 'circle' ? '圆形模式' : '圆角模式', tone: 'soft' },
            { text: currentCover ? '封面已设置' : '未设置封面', tone: 'neutral' },
        ],
    });

    const bodyHtml = `
        ${buildSettingsSectionHtml({
            title: '尺寸调节',
            desc: '滑动调整按钮尺寸，获得更合适的点击区域与视觉比例。',
            bodyHtml: `
                <div class="phone-settings-toggle-size-row">
                    <input type="range" min="32" max="72" step="1" id="phone-toggle-style-size-range" value="${escapeHtmlAttr(currentSize)}">
                    <input type="number" min="32" max="72" step="1" id="phone-toggle-style-size-input" class="phone-settings-input" value="${escapeHtmlAttr(currentSize)}">
                </div>
                <p class="phone-settings-desc">建议范围 36~56，移动端默认 44。</p>
            `,
        })}

        ${buildSettingsSectionHtml({
            title: '按钮形态',
            desc: '圆形更简洁，圆角模式则更适合保留文字标签。',
            bodyHtml: `
                <div class="phone-toggle-shape-list" id="phone-toggle-shape-list">
                    <label class="phone-toggle-shape-item">
                        <span class="phone-toggle-shape-name">长方形</span>
                        <input type="radio" name="phone-toggle-shape" value="rounded" ${currentShape === 'rounded' ? 'checked' : ''}>
                    </label>
                    <label class="phone-toggle-shape-item">
                        <span class="phone-toggle-shape-name">圆形（仅显示图标）</span>
                        <input type="radio" name="phone-toggle-shape" value="circle" ${currentShape === 'circle' ? 'checked' : ''}>
                    </label>
                </div>
            `,
        })}

        ${buildSettingsSectionHtml({
            title: '封面管理',
            desc: '上传封面后会使用 cover 裁剪，建议主体位于中心区域。',
            actionsHtml: `
                <div class="phone-settings-action">
                    <button type="button" class="phone-settings-btn" id="phone-toggle-cover-upload-btn">
                        ${PHONE_ICONS.upload}
                        <span>上传封面</span>
                    </button>
                    <button type="button" class="phone-settings-btn phone-settings-btn-danger" id="phone-toggle-cover-clear-btn" ${currentCover ? '' : 'disabled'}>清除封面</button>
                </div>
            `,
            bodyHtml: `<div id="phone-toggle-cover-preview" class="phone-settings-preview">${previewHtml}</div>`,
        })}
    `;

    return buildSettingsPageFrame({
        title: '控件与按钮',
        heroHtml,
        bodyClass: 'phone-app-body phone-settings-scroll phone-settings-open',
        bodyHtml,
    });
}

export function buildPromptEditorPageHtml({ title, isNew, promptEditorName, promptEditorContent }) {
    const heroHtml = buildSettingsHeroHtml({
        eyebrow: isNew ? '新建模板' : '编辑模板',
        title: title || '提示词编辑器',
        description: '在这里维护提示词模板内容，适合沉淀可复用的生成策略。',
        chips: [
            { text: isNew ? '创建新模板' : '编辑现有模板', tone: 'info' },
            { text: '提示词工作台', tone: 'soft' },
        ],
    });

    const bodyHtml = `
        ${buildSettingsSectionHtml({
            title: '模板名称',
            desc: isNew ? '请填写一个清晰、便于检索的模板名称。' : '已有模板名称不可修改。',
            bodyHtml: `
                <input type="text" id="phone-prompt-editor-name" class="phone-settings-input phone-settings-input-full"
                    placeholder="请输入模板名称" value="${escapeHtmlAttr(promptEditorName || '')}" ${isNew ? '' : 'disabled'}>
                ${isNew ? '' : '<p class="phone-settings-desc">模板名称不可修改</p>'}
            `,
        })}

        ${buildSettingsSectionHtml({
            title: '提示词内容',
            desc: '支持手动编写或上传文本文件，便于批量整理与维护。',
            bodyHtml: `
                <textarea id="phone-prompt-editor-content" class="phone-settings-textarea"
                    placeholder="请输入提示词内容..." rows="10">${escapeHtml(promptEditorContent || '')}</textarea>
                <div class="phone-settings-action">
                    <button type="button" class="phone-settings-btn" id="phone-prompt-upload-btn">
                        ${PHONE_ICONS.upload}
                        <span>上传文件</span>
                    </button>
                </div>
                <p class="phone-settings-desc">支持 .txt 文件，文件内容将填入上方文本框。</p>
            `,
        })}

        ${buildSettingsSectionHtml({
            title: '保存操作',
            desc: '保存后模板将写入当前扩展配置，可在提示模板列表中继续维护。',
            bodyHtml: `
                <div class="phone-settings-action">
                    <button type="button" class="phone-settings-btn phone-settings-btn-primary" id="phone-prompt-save-btn">
                        <span>保存模板</span>
                    </button>
                </div>
            `,
        })}
    `;

    return buildSettingsPageFrame({
        title,
        heroHtml,
        bodyClass: 'phone-app-body phone-settings-scroll phone-settings-open',
        bodyHtml,
    });
}

export function buildApiPromptConfigPageHtml({
    apiAvailability,
    apiPresetOptions,
    plotPresetOptions,
    phoneChatApiPresetOptions,
    phoneChatUseStoryContext,
    phoneChatStoryContextTurns,
    promptTemplateOptions,
    previewContent,
    selectedTemplate,
    worldbookOptions,
    worldbookLoading,
    worldbookSearchQuery,
    worldbookSourceModeOptions,
    worldbookSelectDisabled,
    worldbookSearchDisabled,
    worldbookActionDisabled,
}) {
    const heroHtml = buildSettingsHeroHtml({
        eyebrow: 'AI 与提示词',
        title: 'API 预设与提示词工作台',
        description: '统一管理填表 API、剧情 API、聊天上下文、提示模板与世界书条目。',
        chips: [
            { text: apiAvailability.ok ? '数据库接口正常' : '数据库接口异常', tone: apiAvailability.ok ? 'success' : 'danger' },
            { text: phoneChatUseStoryContext ? `上下文 ${phoneChatStoryContextTurns} 轮` : '未读取上下文', tone: 'soft' },
            { text: selectedTemplate ? `模板：${selectedTemplate}` : '模板：未选择', tone: 'neutral' },
        ],
    });

    const bodyHtml = `
        ${!apiAvailability.ok
            ? `<div class="phone-settings-inline-status is-danger"><span class="phone-settings-inline-status-dot"></span><span class="phone-settings-inline-status-text">${escapeHtml(apiAvailability.message || '数据库 API 不可用')}</span></div>`
            : ''}

        ${buildSettingsSectionHtml({
            title: 'API 预设',
            desc: '分别配置填表与剧情推进所使用的接口预设，方便在不同任务场景间切换。',
            bodyHtml: `
                <div class="phone-settings-field-row">
                    <label class="phone-settings-label">填表API预设</label>
                    <select id="phone-table-api-preset-select" class="phone-settings-select" ${apiAvailability.ok ? '' : 'disabled'}>
                        ${apiPresetOptions}
                    </select>
                </div>
                <div class="phone-settings-field-row">
                    <label class="phone-settings-label">剧情推进API预设</label>
                    <select id="phone-plot-api-preset-select" class="phone-settings-select" ${apiAvailability.ok ? '' : 'disabled'}>
                        ${plotPresetOptions}
                    </select>
                </div>
            `,
        })}

        ${buildSettingsSectionHtml({
            title: '聊天上下文',
            desc: '决定手机聊天是否读取 AI 上下文，以及读取的轮数与聊天 API 预设。',
            bodyHtml: `
                <div class="phone-settings-field-row phone-settings-field-row-compact">
                    <label class="phone-settings-label" for="phone-chat-use-story-context">读取AI上下文</label>
                    <input type="checkbox" id="phone-chat-use-story-context" class="phone-settings-switch" ${phoneChatUseStoryContext ? 'checked' : ''}>
                </div>
                <div class="phone-settings-field-row">
                    <label class="phone-settings-label" for="phone-chat-story-context-turns">读取轮数</label>
                    <input type="number" id="phone-chat-story-context-turns" class="phone-settings-input" min="0" max="20" step="1"
                        value="${escapeHtmlAttr(String(phoneChatStoryContextTurns))}" ${phoneChatUseStoryContext ? '' : 'disabled'}>
                </div>
                <div class="phone-settings-field-row">
                    <label class="phone-settings-label" for="phone-chat-api-preset-select">聊天API预设</label>
                    <select id="phone-chat-api-preset-select" class="phone-settings-select" ${apiAvailability.ok ? '' : 'disabled'}>
                        ${phoneChatApiPresetOptions}
                    </select>
                </div>
                <p class="phone-settings-desc">这里仅管理模板仓库。消息记录表 App 会在“开始聊天”旁边提供模板下拉框，实际聊天优先使用页面当前选择的模板。</p>
            `,
        })}

        ${buildSettingsSectionHtml({
            title: '提示模板工作台',
            desc: '预览、管理并快速维护提示词模板，保持不同任务场景下的提示一致性。',
            bodyHtml: `
                <div class="phone-settings-field-row">
                    <label class="phone-settings-label">模板预览</label>
                    <select id="phone-prompt-template-select" class="phone-settings-select">
                        ${promptTemplateOptions}
                    </select>
                </div>
                <div class="phone-prompt-preview">
                    <div class="phone-prompt-preview-label">内容预览</div>
                    <div class="phone-prompt-preview-content">${escapeHtml(previewContent)}</div>
                </div>
                <div class="phone-settings-action-row">
                    <button type="button" class="phone-settings-btn" id="phone-prompt-new-btn">
                        <span>新建</span>
                    </button>
                    <button type="button" class="phone-settings-btn" id="phone-prompt-edit-btn" ${!selectedTemplate ? 'disabled' : ''}>
                        <span>编辑</span>
                    </button>
                    <button type="button" class="phone-settings-btn phone-settings-btn-danger" id="phone-prompt-delete-btn" ${!selectedTemplate ? 'disabled' : ''}>
                        <span>删除</span>
                    </button>
                </div>
            `,
        })}

        ${buildSettingsSectionHtml({
            title: '世界书工作台',
            desc: '切换世界书来源、筛选条目并批量维护选中状态，提升配置效率。',
            actionsHtml: `
                <button type="button" class="phone-settings-btn phone-settings-btn-ghost" id="phone-worldbook-refresh" ${worldbookActionDisabled ? 'disabled' : ''}>
                    <span>刷新</span>
                </button>
            `,
            bodyHtml: `
                <div class="phone-settings-field-row">
                    <label class="phone-settings-label">读取模式</label>
                    <select id="phone-worldbook-source-mode" class="phone-settings-select">
                        ${worldbookSourceModeOptions}
                    </select>
                </div>
                <div class="phone-settings-field-row">
                    <label class="phone-settings-label">选择世界书</label>
                    <select id="phone-worldbook-select" class="phone-settings-select" ${worldbookSelectDisabled ? 'disabled' : ''}>
                        ${worldbookOptions}
                    </select>
                </div>
                <div class="phone-settings-field-row">
                    <input type="text" id="phone-worldbook-search" class="phone-settings-input phone-settings-input-full"
                        placeholder="搜索条目名称..." value="${escapeHtmlAttr(worldbookSearchQuery)}" ${worldbookSearchDisabled ? 'disabled' : ''}>
                </div>
                <div class="phone-settings-action-row">
                    <button type="button" class="phone-settings-btn" id="phone-worldbook-select-all" ${worldbookActionDisabled ? 'disabled' : ''}>
                        <span>全选</span>
                    </button>
                    <button type="button" class="phone-settings-btn" id="phone-worldbook-deselect-all" ${worldbookActionDisabled ? 'disabled' : ''}>
                        <span>取消全选</span>
                    </button>
                </div>
                <div id="phone-worldbook-entries" class="phone-worldbook-entries">
                    ${worldbookLoading ? '<div class="phone-worldbook-loading">加载中...</div>' : ''}
                </div>
                <div class="phone-worldbook-status">
                    <span id="phone-worldbook-status-text">请先选择世界书</span>
                </div>
            `,
        })}
    `;

    return buildSettingsPageFrame({
        title: 'AI 与提示词',
        heroHtml,
        bodyClass: 'phone-app-body phone-settings-scroll phone-settings-open',
        bodyHtml,
    });
}

export function buildBeautifyTemplatePageHtml({
    activeSpecialSummary,
    activeGenericSummary,
    specialListHtml,
    genericListHtml,
    allTemplatesCount,
    allSpecialTemplatesCount,
    allGenericTemplatesCount,
}) {
    const statsHtml = buildSettingsStatGridHtml([
        { label: '模板总数', value: String(allTemplatesCount) },
        { label: '专属模板', value: String(allSpecialTemplatesCount) },
        { label: '通用模板', value: String(allGenericTemplatesCount) },
    ]);

    const heroHtml = buildSettingsHeroHtml({
        eyebrow: '模板工坊',
        title: '模板库与启用关系',
        description: '集中维护专属模板与通用模板，并保留导入、导出与启用切换工作流。',
        chips: [
            { text: `格式 ${PHONE_BEAUTIFY_TEMPLATE_FORMAT}`, tone: 'info' },
            { text: `协议 v${PHONE_BEAUTIFY_TEMPLATE_SCHEMA_VERSION}`, tone: 'soft' },
            { text: '支持 annotated 导出', tone: 'neutral' },
        ],
        statsHtml,
    });

    const activeSummaryHtml = buildSettingsSummaryListHtml([
        { label: '专属启用', value: activeSpecialSummary },
        { label: '通用启用', value: activeGenericSummary },
    ]);

    const bodyHtml = `
        ${buildSettingsSectionHtml({
            title: '启用概览',
            desc: '专属模板按消息 / 动态 / 论坛分别启用，通用模板只会激活一个。',
            bodyHtml: `
                ${activeSummaryHtml}
                <div class="phone-settings-note">支持导入、导出、启用与删除用户模板，便于离线维护模板文件。</div>
            `,
        })}

        ${buildSettingsSectionHtml({
            title: '专属模板库',
            desc: '用于“消息记录表 / 动态表 / 论坛表”等专属场景。每个子类型可分别启用一个模板。',
            bodyHtml: `
                <div class="phone-settings-action phone-settings-action-wrap phone-beautify-toolbar">
                    <button type="button" class="phone-settings-btn" id="phone-beautify-import-special-btn">导入模板</button>
                    <button type="button" class="phone-settings-btn" id="phone-beautify-export-special-btn">导出本区</button>
                    <button type="button" class="phone-settings-btn" id="phone-beautify-export-special-default-btn">导出默认</button>
                </div>
                <input type="file" id="phone-beautify-import-special-input" accept="application/json,.json" style="display:none">
                <div class="phone-beautify-list" id="phone-beautify-list-special">${specialListHtml}</div>
            `,
        })}

        ${buildSettingsSectionHtml({
            title: '通用模板库',
            desc: '用于通用表格展示风格，该分区始终只会启用一个模板。',
            bodyHtml: `
                <div class="phone-settings-action phone-settings-action-wrap phone-beautify-toolbar">
                    <button type="button" class="phone-settings-btn" id="phone-beautify-import-generic-btn">导入模板</button>
                    <button type="button" class="phone-settings-btn" id="phone-beautify-export-generic-btn">导出本区</button>
                    <button type="button" class="phone-settings-btn" id="phone-beautify-export-generic-default-btn">导出默认</button>
                </div>
                <input type="file" id="phone-beautify-import-generic-input" accept="application/json,.json" style="display:none">
                <div class="phone-beautify-list" id="phone-beautify-list-generic">${genericListHtml}</div>
            `,
        })}
    `;

    return buildSettingsPageFrame({
        title: '模板工坊',
        heroHtml,
        bodyClass: 'phone-app-body phone-settings-scroll phone-settings-open',
        bodyHtml,
    });
}
