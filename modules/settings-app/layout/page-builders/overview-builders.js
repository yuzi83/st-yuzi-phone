import { escapeHtml } from '../../../utils.js';
import {
    SETTINGS_ENTRY_META,
    buildSettingsHeroHtml,
    buildSettingsHomeItemHtml,
    buildSettingsPageFrame,
    buildSettingsSectionHtml,
} from '../primitives.js';

export function buildSettingsHomePageHtml({
    apiAvailability,
    quickPresetOptions,
    apiPresetQuickOptions,
    activePresetName = '',
    currentTablePreset = '',
    currentAiInstructionPresetName = '',
}) {
    const dbPresetLabel = activePresetName ? `预设 · ${activePresetName}` : '预设 · 当前配置';
    const apiPresetLabel = currentTablePreset ? `填表 · ${currentTablePreset}` : '填表 · 当前配置';
    const aiInstructionLabel = currentAiInstructionPresetName ? `指令 · ${currentAiInstructionPresetName}` : '指令 · 默认实时回复预设';

    const heroHtml = buildSettingsHeroHtml({
        eyebrow: 'SillyTavern 扩展',
        title: '设置中心',
        description: '统一管理界面外观、模板、按钮、数据同步、AI 指令预设与上下文配置。',
        chips: [
            { text: '6 个一级模块', tone: 'info' },
            { text: apiAvailability.ok ? '数据库接口正常' : '数据库接口异常', tone: apiAvailability.ok ? 'success' : 'danger' },
            { text: currentAiInstructionPresetName ? `当前实时回复预设：${currentAiInstructionPresetName}` : '当前实时回复预设：默认', tone: 'soft' },
        ],
    });

    const bodyHtml = `
        ${buildSettingsSectionHtml({
            title: '功能入口',
            desc: '从首页进入不同的设置工作台，快速调整界面、模板、按钮、同步策略、AI 指令预设与上下文配置。',
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
                        entry: 'ai_instruction_presets',
                        title: SETTINGS_ENTRY_META.ai_instruction_presets.title,
                        description: SETTINGS_ENTRY_META.ai_instruction_presets.description,
                        badge: SETTINGS_ENTRY_META.ai_instruction_presets.badge,
                        tags: [aiInstructionLabel, '分段结构', '导入导出'],
                        quickHtml: `
                            <div class="phone-settings-home-quick" title="当前消息记录表实时回复所使用的 AI 指令预设">
                                <span class="phone-settings-home-quick-label">当前预设</span>
                                <span class="phone-settings-inline-meta">${escapeHtml(currentAiInstructionPresetName || '默认实时回复预设')}</span>
                            </div>
                        `,
                    })}
                    ${buildSettingsHomeItemHtml({
                        entry: 'api_prompt_config',
                        title: SETTINGS_ENTRY_META.api_prompt_config.title,
                        description: SETTINGS_ENTRY_META.api_prompt_config.description,
                        badge: SETTINGS_ENTRY_META.api_prompt_config.badge,
                        tags: [apiPresetLabel, '正文上下文', '世界书'],
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
