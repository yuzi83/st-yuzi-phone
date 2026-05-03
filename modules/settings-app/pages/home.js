import { buildSettingsHomePageHtml } from '../layout/frame.js';
import { escapeHtml, escapeHtmlAttr } from '../../utils/dom-escape.js';

export function createHomePage(ctx) {
    return {
        mount() {
            renderHomePage(ctx);
        },
        update() {
            renderHomePage(ctx);
        },
        dispose() {},
    };
}

export function renderHomePage(ctx) {
    const {
        container,
        state,
        render,
        navigateBack,
        showToast,
        registerCleanup,
        pageRuntime,
        databasePresetService,
        apiPromptService,
        aiInstructionPresetService,
        manualUpdateService,
    } = ctx;
    const getDbConfigApiAvailability = databasePresetService.getDbConfigApiAvailability;
    const getDbPresets = databasePresetService.getDbPresets;
    const getActiveDbPresetName = databasePresetService.getActiveDbPresetName;
    const switchPresetByName = databasePresetService.switchPresetByName;
    const getApiPresets = apiPromptService.getApiPresets;
    const getTableApiPreset = apiPromptService.getTableApiPreset;
    const setTableApiPreset = apiPromptService.setTableApiPreset;
    const getCurrentPhoneAiInstructionPresetName = aiInstructionPresetService.getCurrentPhoneAiInstructionPresetName;
    const setupManualUpdateBtn = manualUpdateService.setupManualUpdateBtn;

    const apiAvailability = getDbConfigApiAvailability();
    const presets = getDbPresets();
    const activePresetName = getActiveDbPresetName();
    const apiPresets = getApiPresets();
    const currentTablePreset = getTableApiPreset();
    const currentAiInstructionPresetName = getCurrentPhoneAiInstructionPresetName();

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
        currentAiInstructionPresetName,
    });

    const runtime = pageRuntime && typeof pageRuntime === 'object' ? pageRuntime : null;
    const bindEvent = (target, type, listener, options) => {
        if (!runtime?.addEventListener) {
            return () => {};
        }
        return runtime.addEventListener(target, type, listener, options);
    };

    bindEvent(container.querySelector('.phone-nav-back'), 'click', navigateBack);

    container.querySelectorAll('.phone-settings-home-trigger').forEach((btn) => {
        bindEvent(btn, 'click', () => {
            const entry = String(btn.dataset.entry || '').trim();
            if (!entry) return;
            state.mode = entry;
            render();
        });
    });

    const quickSelect = container.querySelector('#phone-db-preset-quick-select');
    if (quickSelect) {
        const stopBubble = (e) => e.stopPropagation();
        bindEvent(quickSelect, 'click', stopBubble);
        bindEvent(quickSelect, 'mousedown', stopBubble);
        bindEvent(quickSelect, 'touchstart', stopBubble, { passive: true });

        bindEvent(quickSelect, 'change', () => {
            const prevActive = getActiveDbPresetName();
            const targetName = String(quickSelect.value || '');
            const ok = switchPresetByName(targetName, container);
            if (!ok) {
                quickSelect.value = prevActive;
            }
        });
    }

    const apiPresetQuickSelect = container.querySelector('#phone-api-preset-quick-select');
    if (apiPresetQuickSelect) {
        const stopBubbleApi = (e) => e.stopPropagation();
        bindEvent(apiPresetQuickSelect, 'click', stopBubbleApi);
        bindEvent(apiPresetQuickSelect, 'mousedown', stopBubbleApi);
        bindEvent(apiPresetQuickSelect, 'touchstart', stopBubbleApi, { passive: true });

        bindEvent(apiPresetQuickSelect, 'change', () => {
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

    if (runtime?.registerCleanup) {
        setupManualUpdateBtn(container, '#phone-top-trigger-update', null, runtime);
    } else if (typeof registerCleanup === 'function') {
        registerCleanup(setupManualUpdateBtn(container, '#phone-top-trigger-update', null));
    }
}
