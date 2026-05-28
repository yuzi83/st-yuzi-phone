import { getPhoneSettings, savePhoneSetting } from '../../../settings.js';
import { Logger } from '../../../error-handler.js';
import { showToast } from '../../ui/toast.js';

const logger = Logger.withScope({
    scope: 'settings-app/services/appearance-settings/theme-settings',
    feature: 'settings-app',
});

const PHONE_THEME_MODE_SETTING_KEY = 'phoneThemeMode';
const PHONE_THEME_MODE_DEFAULT = 'light';
const PHONE_THEME_MODE_OPTIONS = new Set(['light', 'dark']);
const PHONE_CONTAINER_ID = 'yuzi-phone-standalone';
const PHONE_THEME_DATA_ATTR = 'data-yuzi-phone-theme';
/** @type {WeakMap<HTMLSelectElement, () => void>} */
const THEME_MODE_BINDING_CLEANUPS = new WeakMap();

export function normalizePhoneThemeMode(value) {
    const normalized = String(value ?? '').trim().toLowerCase();
    return PHONE_THEME_MODE_OPTIONS.has(normalized)
        ? normalized
        : PHONE_THEME_MODE_DEFAULT;
}

export function getPhoneThemeModeValue() {
    const settings = getPhoneSettings();
    return normalizePhoneThemeMode(settings?.[PHONE_THEME_MODE_SETTING_KEY]);
}

export function applyPhoneThemeMode(mode = getPhoneThemeModeValue()) {
    const normalized = normalizePhoneThemeMode(mode);
    const docEl = typeof document !== 'undefined' ? document.documentElement : null;

    if (docEl instanceof HTMLElement) {
        docEl.setAttribute(PHONE_THEME_DATA_ATTR, normalized);
    }

    const root = typeof document !== 'undefined'
        ? document.getElementById(PHONE_CONTAINER_ID)
        : null;

    if (root instanceof HTMLElement) {
        root.setAttribute(PHONE_THEME_DATA_ATTR, normalized);
        return true;
    }

    return false;
}

export function setupPhoneThemeModeSettings(container) {
    const selectEl = container?.querySelector?.('#phone-theme-mode-select');
    if (!(selectEl instanceof HTMLSelectElement)) {
        return () => {};
    }

    const syncControl = (value) => {
        selectEl.value = normalizePhoneThemeMode(value);
    };

    const prevCleanup = THEME_MODE_BINDING_CLEANUPS.get(selectEl);
    if (typeof prevCleanup === 'function') {
        try {
            prevCleanup();
        } catch (error) {
            logger.warn('theme mode 重复绑定清理失败', error);
        } finally {
            THEME_MODE_BINDING_CLEANUPS.delete(selectEl);
        }
    }

    syncControl(getPhoneThemeModeValue());

    const onChange = () => {
        const prevValue = getPhoneThemeModeValue();
        const nextValue = normalizePhoneThemeMode(selectEl.value);
        syncControl(nextValue);

        const ok = savePhoneSetting(PHONE_THEME_MODE_SETTING_KEY, nextValue);
        if (!ok) {
            syncControl(prevValue);
            applyPhoneThemeMode(prevValue);
            showToast(container, '主题模式保存失败，已回滚', true);
            return;
        }

        applyPhoneThemeMode(nextValue);
        showToast(container, nextValue === 'dark' ? '已切换到夜间模式' : '已切换到白天模式');
    };

    selectEl.addEventListener('change', onChange);
    const cleanup = () => {
        try {
            selectEl.removeEventListener('change', onChange);
        } catch (error) {
            logger.warn('theme mode cleanup 执行失败', error);
        } finally {
            THEME_MODE_BINDING_CLEANUPS.delete(selectEl);
        }
    };
    THEME_MODE_BINDING_CLEANUPS.set(selectEl, cleanup);
    return cleanup;
}
