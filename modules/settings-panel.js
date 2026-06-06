// modules/settings-panel.js
/**
 * 玉子手机 - 扩展设置面板（最小版）
 */

import { getPhoneSettings, savePhoneSetting } from './settings.js';

const PANEL_ID = 'yuzi-phone-settings';
const CHECKBOX_ID = 'yuzi-phone-enabled';
const FLOATING_TOGGLE_CHECKBOX_ID = 'yuzi-phone-floating-toggle-enabled';
const RESET_POSITION_BTN_ID = 'yuzi-phone-reset-position';

let panelCleanupFns = [];

function registerPanelCleanup(cleanup) {
    if (typeof cleanup === 'function') {
        panelCleanupFns.push(cleanup);
    }
}

function cleanupPhoneSettingsPanelListeners() {
    const cleanups = panelCleanupFns;
    panelCleanupFns = [];
    cleanups.forEach((cleanup) => {
        try {
            cleanup();
        } catch {}
    });
}

export function destroyPhoneSettingsPanel() {
    cleanupPhoneSettingsPanelListeners();
    const panel = document.getElementById(PANEL_ID);
    panel?.remove();
}

export function createPhoneSettingsPanel(onToggleEnabled) {
    cleanupPhoneSettingsPanelListeners();

    const existingPanel = document.getElementById(PANEL_ID);
    if (existingPanel) {
        bindDrawerEvents();
        bindEnabledToggle(onToggleEnabled);
        bindFloatingToggle();
        bindResetPositionButton();
        return true;
    }

    const container = document.getElementById('extensions_settings');
    if (!container) return false;

    const settings = getPhoneSettings();
    const isEnabled = settings.enabled !== false;
    const isFloatingToggleEnabled = settings.floatingToggleEnabled !== false;

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
                        <label class="checkbox_label" style="margin-top: 8px; display:flex; align-items:center; gap:8px;">
                            <input type="checkbox" id="${FLOATING_TOGGLE_CHECKBOX_ID}" ${isFloatingToggleEnabled ? 'checked' : ''}>
                            <span>悬浮窗开关</span>
                        </label>
                        <div style="margin-top: 10px;">
                            <button type="button" id="${RESET_POSITION_BTN_ID}" class="menu_button" style="display:inline-flex;align-items:center;justify-content:center;width:auto;min-width:0;max-width:100%;white-space:nowrap;word-break:keep-all;writing-mode:horizontal-tb;text-orientation:mixed;">重置悬浮按钮位置</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', html);

    bindDrawerEvents();
    bindEnabledToggle(onToggleEnabled);
    bindFloatingToggle();
    bindResetPositionButton();
    return true;
}

function bindDrawerEvents() {
    const $drawer = $('#yuzi-phone-settings .inline-drawer');
    const $header = $drawer.find('.inline-drawer-header');
    const $content = $drawer.find('.inline-drawer-content');
    const $icon = $drawer.find('.inline-drawer-icon');

    $header.off('click.yuziPhoneSettings').on('click.yuziPhoneSettings', function (e) {
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

    registerPanelCleanup(() => $header.off('click.yuziPhoneSettings'));
}

function bindEnabledToggle(onToggleEnabled) {
    const checkbox = document.getElementById(CHECKBOX_ID);
    if (!checkbox) return;

    const handleChange = () => {
        const enabled = checkbox.checked;
        savePhoneSetting('enabled', enabled);

        if (typeof onToggleEnabled === 'function') {
            onToggleEnabled(enabled);
        }
    };

    checkbox.addEventListener('change', handleChange);
    registerPanelCleanup(() => checkbox.removeEventListener('change', handleChange));
}

function bindFloatingToggle() {
    const checkbox = document.getElementById(FLOATING_TOGGLE_CHECKBOX_ID);
    if (!checkbox) return;

    const handleChange = () => {
        savePhoneSetting('floatingToggleEnabled', checkbox.checked);
        window.dispatchEvent(new CustomEvent('yuzi-phone-toggle-style-updated'));
    };

    checkbox.addEventListener('change', handleChange);
    registerPanelCleanup(() => checkbox.removeEventListener('change', handleChange));
}

function bindResetPositionButton() {
    const button = document.getElementById(RESET_POSITION_BTN_ID);
    if (!button) return;

    const handleClick = () => {
        window.dispatchEvent(new CustomEvent('yuzi-phone-toggle-position-reset'));
    };

    button.addEventListener('click', handleClick);
    registerPanelCleanup(() => button.removeEventListener('click', handleClick));
}
