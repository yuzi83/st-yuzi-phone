import { buildSettingsHomePageHtml } from '../layout/frame.js';
import { escapeHtml, escapeHtmlAttr } from '../../utils.js';

export function renderHomePage(ctx) {
    const {
        container,
        state,
        render,
        rerenderHomeKeepScroll,
        navigateBack,
        getDbConfigApiAvailability,
        getDbPresets,
        getActiveDbPresetName,
        getApiPresets,
        getTableApiPreset,
        setTableApiPreset,
        switchPresetByName,
        showToast,
        setupManualUpdateBtn,
    } = ctx;

    const apiAvailability = getDbConfigApiAvailability();
    const presets = getDbPresets();
    const activePresetName = getActiveDbPresetName();
    const apiPresets = getApiPresets();
    const currentTablePreset = getTableApiPreset();

    const quickPresetOptions = [
        `<option value="" ${!activePresetName ? 'selected' : ''}>当前配置</option>`,
        ...presets.map((preset) => (
            `<option value="${escapeHtmlAttr(preset.name)}" ${preset.name === activePresetName ? 'selected' : ''}>${escapeHtml(preset.name)}</option>`
        )),
    ].join('');

    const apiPresetQuickOptions = [
        `<option value="" ${!currentTablePreset ? 'selected' : ''}>当前配置</option>`,
        ...apiPresets.map((preset) => (
            `<option value="${escapeHtmlAttr(preset.name)}" ${preset.name === currentTablePreset ? 'selected' : ''}>${escapeHtml(preset.name)}</option>`
        )),
    ].join('');

    container.innerHTML = buildSettingsHomePageHtml({
        apiAvailability,
        quickPresetOptions,
        apiPresetQuickOptions,
        activePresetName,
        currentTablePreset,
    });

    container.querySelector('.phone-nav-back')?.addEventListener('click', navigateBack);

    container.querySelectorAll('.phone-settings-home-trigger').forEach((btn) => {
        btn.addEventListener('click', () => {
            const entry = String(btn.dataset.entry || '').trim();
            if (!entry) return;
            state.mode = entry;
            render();
        });
    });

    const quickSelect = container.querySelector('#phone-db-preset-quick-select');
    if (quickSelect) {
        const stopBubble = (e) => e.stopPropagation();
        quickSelect.addEventListener('click', stopBubble);
        quickSelect.addEventListener('mousedown', stopBubble);
        quickSelect.addEventListener('touchstart', stopBubble, { passive: true });

        quickSelect.addEventListener('change', () => {
            const prevActive = getActiveDbPresetName();
            const targetName = String(quickSelect.value || '');
            const ok = switchPresetByName(targetName, container);
            if (!ok) {
                quickSelect.value = prevActive;
                return;
            }
        });
    }

    const apiPresetQuickSelect = container.querySelector('#phone-api-preset-quick-select');
    if (apiPresetQuickSelect) {
        const stopBubbleApi = (e) => e.stopPropagation();
        apiPresetQuickSelect.addEventListener('click', stopBubbleApi);
        apiPresetQuickSelect.addEventListener('mousedown', stopBubbleApi);
        apiPresetQuickSelect.addEventListener('touchstart', stopBubbleApi, { passive: true });

        apiPresetQuickSelect.addEventListener('change', () => {
            const targetName = String(apiPresetQuickSelect.value || '');
            const success = setTableApiPreset(targetName);
            if (success) {
                showToast(container, targetName ? `已切换到预设：${targetName}` : '已恢复使用当前配置');
            } else {
                showToast(container, '切换预设失败', true);
                apiPresetQuickSelect.value = currentTablePreset;
            }
        });
    }

    setupManualUpdateBtn(container, '#phone-top-trigger-update', null);
}
