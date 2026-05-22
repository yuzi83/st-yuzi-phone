import { getPhoneSettings, savePhoneSetting } from '../../../settings.js';
import { Logger } from '../../../error-handler.js';
import { showToast } from '../../ui/toast.js';

const logger = Logger.withScope({
    scope: 'settings-app/services/appearance-settings/home-label-color-settings',
    feature: 'settings-app',
});

const HOME_APP_LABEL_COLOR_SETTING_KEY = 'homeAppLabelColorMode';
const HOME_APP_LABEL_COLOR_DEFAULT = 'white';
const HOME_APP_LABEL_COLOR_OPTIONS = new Set(['white', 'black']);

function normalizeHomeAppLabelColorMode(value) {
    return HOME_APP_LABEL_COLOR_OPTIONS.has(value)
        ? value
        : HOME_APP_LABEL_COLOR_DEFAULT;
}

export function getHomeAppLabelColorModeValue() {
    const settings = getPhoneSettings();
    return normalizeHomeAppLabelColorMode(settings?.[HOME_APP_LABEL_COLOR_SETTING_KEY]);
}

export function setupHomeAppLabelColorSettings(container) {
    const selectEl = container?.querySelector?.('#phone-home-app-label-color-mode');
    if (!(selectEl instanceof HTMLSelectElement)) {
        return () => {};
    }

    const syncControl = (value) => {
        selectEl.value = normalizeHomeAppLabelColorMode(value);
    };

    syncControl(getHomeAppLabelColorModeValue());

    const onChange = () => {
        const nextValue = normalizeHomeAppLabelColorMode(selectEl.value);
        syncControl(nextValue);
        savePhoneSetting(HOME_APP_LABEL_COLOR_SETTING_KEY, nextValue);
        showToast(container, nextValue === 'black' ? '首页 App 名称已切换为黑色' : '首页 App 名称已切换为白色');
    };

    selectEl.addEventListener('change', onChange);
    return () => {
        try {
            selectEl.removeEventListener('change', onChange);
        } catch (error) {
            logger.warn('home label color cleanup 执行失败', error);
        }
    };
}
