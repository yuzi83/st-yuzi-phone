import { isContentPresetFullPageRuntimeEnabled } from '../../../content-presets/activation-gate.js';
import {
    SETTINGS_ENTRY_META,
    buildSettingsHomeItemHtml,
    buildSettingsPageFrame,
} from '../primitives.js';

export function buildSettingsHomePageHtml({
    contentPresetFullPageRuntimeEnabled = isContentPresetFullPageRuntimeEnabled(),
} = {}) {
    const entries = [
        'appearance',
        ...(contentPresetFullPageRuntimeEnabled ? ['beautify'] : []),
        'button_style',
        'worldbook_reading',
        'image_generation',
        'api_presets',
        'ai_instruction_presets',
        'table_content_replacement',
        'fullscreen_overlay',
    ];
    const remainingEntries = entries.slice(2);
    const groups = contentPresetFullPageRuntimeEnabled
        ? [entries.slice(0, 2), remainingEntries.slice(0, 5), remainingEntries.slice(5)]
        : [entries.slice(0, 1), entries.slice(1, 6), entries.slice(6)];
    const bodyHtml = `
        <div class="phone-settings-profile-action-groups">
            ${groups.filter(group => group.length > 0).map(group => `
                <div class="phone-settings-profile-action-group">
                    ${group.map(entry => buildSettingsHomeItemHtml({
                        entry,
                        title: SETTINGS_ENTRY_META[entry].title,
                        variant: 'profile-action',
                    })).join('')}
                </div>
            `).join('')}
        </div>
    `;
    return buildSettingsPageFrame({
        title: '设置',
        bodyClass: 'phone-app-body phone-settings-scroll phone-settings-home-scroll',
        bodyHtml,
    });
}
