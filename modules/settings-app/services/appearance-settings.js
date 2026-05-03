import { setupBgUpload as setupBgUploadImpl } from './appearance-settings/background-service.js';
import { createIconUploadService } from './appearance-settings/icon-upload-service.js';
import {
    renderHiddenTableAppsList as renderHiddenTableAppsListImpl,
    setupAppearanceToggles as setupAppearanceTogglesImpl,
} from './appearance-settings/visibility-settings.js';
import {
    getLayoutValue as getLayoutValueImpl,
    setupIconLayoutSettings as setupIconLayoutSettingsImpl,
} from './appearance-settings/layout-settings.js';

const { renderIconUploadList: renderIconUploadListImpl } = createIconUploadService();

export function setupBgUpload(container, options = {}) {
    return setupBgUploadImpl(container, options);
}

export function renderIconUploadList(listEl, options = {}) {
    return renderIconUploadListImpl(listEl, options);
}

export function setupAppearanceToggles(container) {
    return setupAppearanceTogglesImpl(container);
}

export function renderHiddenTableAppsList(listEl) {
    return renderHiddenTableAppsListImpl(listEl);
}

export function setupIconLayoutSettings(container) {
    return setupIconLayoutSettingsImpl(container);
}

export function getLayoutValue(key, fallback) {
    return getLayoutValueImpl(key, fallback);
}
