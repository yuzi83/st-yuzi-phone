import { Logger } from '../error-handler.js';
import {
    DOM_IDS,
    createPhoneRoot,
    createPhoneContainer,
    createPhoneToggleButton,
    disposePhoneToggleInteractions,
} from './toggle-button.js';
import { schedulePreloadRouteModules } from '../phone-core/preload.js';

const logger = Logger.withScope({ scope: 'bootstrap/app-bootstrap', feature: 'lifecycle' });

export function mountPhoneBootstrapUi(options = {}) {
    const { onToggle } = options;

    createPhoneRoot();
    createPhoneContainer();
    createPhoneToggleButton({ onToggle });

    // toggle 按钮挂载完成后，在浏览器空闲时段预热路由模块；
    // 让首次进入 settings/fusion/variable-manager 不再阻塞下载。
    schedulePreloadRouteModules();

    return getMountedPhoneBootstrapUi();
}

export function unmountPhoneBootstrapUi() {
    const container = document.getElementById(DOM_IDS.container);
    const toggle = document.getElementById(DOM_IDS.toggle);

    container?.classList.remove('visible');
    toggle?.classList.remove('active');

    disposePhoneToggleInteractions();
    container?.remove();
    toggle?.remove();

    const root = document.getElementById(DOM_IDS.root);
    if (root && root.childElementCount === 0) {
        root.remove();
    }

    return true;
}

export function getMountedPhoneBootstrapUi() {
    return {
        root: document.getElementById(DOM_IDS.root),
        container: document.getElementById(DOM_IDS.container),
        toggle: document.getElementById(DOM_IDS.toggle),
    };
}

export function togglePhoneBootstrapVisibility(show, options = {}) {
    const { onPhoneActivated, onPhoneDeactivated } = options;
    const { container, toggle } = getMountedPhoneBootstrapUi();
    if (!container || !toggle) {
        logger.debug({
            action: 'visibility.skip',
            message: 'bootstrap visibility 切换被跳过：UI 尚未挂载',
        });
        return false;
    }

    const nextShow = show ?? !container.classList.contains('visible');
    container.classList.toggle('visible', nextShow);
    toggle.classList.toggle('active', nextShow);

    if (nextShow) {
        onPhoneActivated?.();
    } else {
        onPhoneDeactivated?.();
    }

    return nextShow;
}

export function setPhoneBootstrapEnabledState(enabled, options = {}) {
    const { onToggle } = options;
    if (enabled) {
        mountPhoneBootstrapUi({ onToggle });
        return true;
    }

    unmountPhoneBootstrapUi();
    return false;
}

export async function initializePhoneBootstrapUi(options = {}) {
    const {
        migrateLegacyPhoneSettings,
        getPhoneSettings,
        createPhoneSettingsPanel,
        setPhoneEnabledWithUI,
        registerEventListeners,
        onToggle,
    } = options;

    if (typeof migrateLegacyPhoneSettings === 'function') {
        migrateLegacyPhoneSettings();
    }

    const settings = typeof getPhoneSettings === 'function'
        ? getPhoneSettings()
        : {};

    const hasPanel = typeof createPhoneSettingsPanel === 'function'
        ? !!createPhoneSettingsPanel((enabled) => {
            setPhoneEnabledWithUI?.(enabled);
        })
        : false;

    if (settings?.enabled !== false || !hasPanel) {
        mountPhoneBootstrapUi({ onToggle });
    }

    if (typeof registerEventListeners === 'function') {
        await registerEventListeners();
    }

    logger.debug({
        action: 'initialize.ui',
        message: 'bootstrap UI 已装配',
        context: {
            enabled: settings?.enabled !== false,
            hasPanel,
        },
    });

    return {
        settings,
        hasPanel,
    };
}
