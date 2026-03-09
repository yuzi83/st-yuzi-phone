// modules/settings-panel.js
/**
 * 玉子手机 - 扩展设置面板（最小版）
 */

import { getPhoneSettings, savePhoneSetting } from './settings.js';

const PANEL_ID = 'yuzi-phone-settings';
const CHECKBOX_ID = 'yuzi-phone-enabled';

export function createPhoneSettingsPanel(onToggleEnabled) {
    if (document.getElementById(PANEL_ID)) return true;

    const container = document.getElementById('extensions_settings');
    if (!container) return false;

    const settings = getPhoneSettings();
    const isEnabled = settings.enabled !== false;

    const html = `
        <div id="${PANEL_ID}" class="extension_settings">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>玉子手机</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down"></div>
                </div>
                <div class="inline-drawer-content" style="display:none;">
                    <div style="padding: 10px;">
                        <label class="checkbox_label">
                            <input type="checkbox" id="${CHECKBOX_ID}" ${isEnabled ? 'checked' : ''}>
                            <span>启用玉子手机</span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', html);

    bindDrawerEvents();
    bindEnabledToggle(onToggleEnabled);
    return true;
}

function bindDrawerEvents() {
    const $drawer = $('#yuzi-phone-settings .inline-drawer');
    const $header = $drawer.find('.inline-drawer-header');
    const $content = $drawer.find('.inline-drawer-content');
    const $icon = $drawer.find('.inline-drawer-icon');

    $header.off('click').on('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        const isOpen = $content.is(':visible');

        if (isOpen) {
            $content.slideUp(200);
            $icon.removeClass('fa-circle-chevron-up').addClass('fa-circle-chevron-down');
        } else {
            $content.slideDown(200);
            $icon.removeClass('fa-circle-chevron-down').addClass('fa-circle-chevron-up');
        }
    });
}

function bindEnabledToggle(onToggleEnabled) {
    const checkbox = document.getElementById(CHECKBOX_ID);
    if (!checkbox) return;

    checkbox.addEventListener('change', () => {
        const enabled = checkbox.checked;
        savePhoneSetting('enabled', enabled);

        if (typeof onToggleEnabled === 'function') {
            onToggleEnabled(enabled);
        }
    });
}
