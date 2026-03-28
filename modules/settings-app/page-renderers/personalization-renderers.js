import { renderAppearancePage as renderAppearancePagePage } from '../pages/appearance.js';
import { renderButtonStylePage as renderButtonStylePagePage } from '../pages/button-style.js';
import { renderHomePage as renderHomePagePage } from '../pages/home.js';

/**
 * @param {import('../../../types').SettingsPageRendererGroupedDeps} deps
 */
export function createPersonalizationPageRenderers(deps = {}) {
    const common = /** @type {import('../../../types').SettingsPageRendererCommonDeps} */ (deps.common || {});
    const navigation = /** @type {import('../../../types').SettingsPageRendererNavigationDeps} */ (deps.navigation || {});
    const scroll = /** @type {import('../../../types').SettingsPageRendererScrollDeps} */ (deps.scroll || {});
    const feedback = /** @type {import('../../../types').SettingsPageRendererFeedbackDeps} */ (deps.feedback || {});
    const home = /** @type {import('../../../types').SettingsHomePageRendererDeps} */ (deps.home || {});
    const appearance = /** @type {import('../../../types').SettingsAppearancePageRendererDeps} */ (deps.appearance || {});
    const buttonStyle = /** @type {import('../../../types').SettingsButtonStylePageRendererDeps} */ (deps.buttonStyle || {});

    return {
        renderHomePage() {
            renderHomePagePage({
                ...common,
                rerenderHomeKeepScroll: scroll.rerenderHomeKeepScroll,
                navigateBack: navigation.navigateBack,
                getDbConfigApiAvailability: home.getDbConfigApiAvailability,
                getDbPresets: home.getDbPresets,
                getActiveDbPresetName: home.getActiveDbPresetName,
                getApiPresets: home.getApiPresets,
                getTableApiPreset: home.getTableApiPreset,
                setTableApiPreset: home.setTableApiPreset,
                getCurrentPhoneAiInstructionPresetName: home.getCurrentPhoneAiInstructionPresetName,
                switchPresetByName: home.switchPresetByName,
                showToast: feedback.showToast,
                setupManualUpdateBtn: home.setupManualUpdateBtn,
            });
        },

        renderAppearancePage() {
            renderAppearancePagePage({
                ...common,
                ...appearance,
            });
        },

        renderButtonStylePage() {
            renderButtonStylePagePage({
                ...common,
                ...buttonStyle,
                rerenderButtonStyleKeepScroll: scroll.rerenderButtonStyleKeepScroll,
            });
        },
    };
}
