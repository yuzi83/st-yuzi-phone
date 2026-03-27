import {
    buildSettingsHeroHtml,
    buildSettingsPageFrame,
    buildSettingsSectionHtml,
} from '../primitives.js';
import { escapeHtml, escapeHtmlAttr } from '../../../utils.js';

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
