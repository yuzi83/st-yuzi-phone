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
import {
    clearAppearanceResourcePoolIcons as clearAppearanceResourcePoolIconsImpl,
    exportAppearanceResourcePack as exportAppearanceResourcePackImpl,
    importAppearanceResourcePackFromData as importAppearanceResourcePackFromDataImpl,
} from './appearance-settings/resource-pack-service.js';
import {
    applyAppearanceFontLibrary as applyAppearanceFontLibraryImpl,
    deleteAppearanceFont as deleteAppearanceFontImpl,
    getAppearanceFontLibraryViewModel as getAppearanceFontLibraryViewModelImpl,
    importAppearanceFontFile as importAppearanceFontFileImpl,
    selectAppearanceFont as selectAppearanceFontImpl,
} from './appearance-settings/font-library-service.js';
import {
    applyReadableTextScale as applyReadableTextScaleImpl,
    getReadableTextScalePercentValue as getReadableTextScalePercentValueImpl,
    setupReadableTextScaleSettings as setupReadableTextScaleSettingsImpl,
} from './appearance-settings/readable-text-scale-settings.js';
import {
    getHomeAppLabelColorModeValue as getHomeAppLabelColorModeValueImpl,
    setupHomeAppLabelColorSettings as setupHomeAppLabelColorSettingsImpl,
} from './appearance-settings/home-label-color-settings.js';

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

export function importAppearanceResourcePackFromData(input, options = {}) {
    return importAppearanceResourcePackFromDataImpl(input, options);
}

export function exportAppearanceResourcePack(options = {}) {
    return exportAppearanceResourcePackImpl(options);
}

export function clearAppearanceResourcePoolIcons() {
    return clearAppearanceResourcePoolIconsImpl();
}

export function getAppearanceFontLibraryViewModel() {
    return getAppearanceFontLibraryViewModelImpl();
}

export function importAppearanceFontFile(file) {
    return importAppearanceFontFileImpl(file);
}

export function selectAppearanceFont(fontId) {
    return selectAppearanceFontImpl(fontId);
}

export function deleteAppearanceFont(fontId) {
    return deleteAppearanceFontImpl(fontId);
}

export function applyAppearanceFontLibrary(root = null) {
    return applyAppearanceFontLibraryImpl(root);
}

export function getReadableTextScalePercentValue() {
    return getReadableTextScalePercentValueImpl();
}

export function applyReadableTextScale(root = null, percent) {
    return applyReadableTextScaleImpl(root, percent);
}

export function setupReadableTextScaleSettings(container) {
    return setupReadableTextScaleSettingsImpl(container);
}

export function getHomeAppLabelColorModeValue() {
    return getHomeAppLabelColorModeValueImpl();
}

export function setupHomeAppLabelColorSettings(container) {
    return setupHomeAppLabelColorSettingsImpl(container);
}

export function getLayoutValue(key, fallback) {
    return getLayoutValueImpl(key, fallback);
}
