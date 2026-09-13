import { createIconUploadService } from './appearance-settings/icon-upload-service.js';
import { getAppearancePack as getAppearancePackImpl, deleteAppearancePack as deleteAppearancePackImpl } from './appearance-settings/appearance-pack-repository.js';
import { applyAppearanceResourcePack as applyAppearanceResourcePackImpl } from './appearance-settings/resource-pack-service.js';
import { flushPhoneSettingsSave, getPhoneSettings, savePhoneSettingsPatch, waitForPhoneSettingsSave } from '../../settings.js';
import { buildPackIconOriginCleanup } from './appearance-settings/icon-selection-state.js';

export { setupBgUpload } from './appearance-settings/background-service.js';

export { buildAppearanceAppCatalog } from './appearance-settings/icon-slots.js';

export {
    setupAppearanceToggles,
    renderHiddenTableAppsList,
} from './appearance-settings/visibility-settings.js';

export {
    setupIconLayoutSettings,
    getLayoutValue,
} from './appearance-settings/layout-settings.js';

export {
    importAppearanceResourcePackFromData,
    validateAppearanceResourcePack,
    applyAppearanceResourcePack,
    exportAppearanceResourcePack,
    clearAppearanceResourcePoolIcons,
} from './appearance-settings/resource-pack-service.js';

export {
    listAppearancePacks,
    getAppearancePack,
    saveAppearancePack,
    deleteAppearancePack,
    getAppearancePackRepositoryStats,
    saveAppearancePack as importAppearancePackToRepository,
} from './appearance-settings/appearance-pack-repository.js';

export {
    getAppearanceFontLibraryViewModel,
    importAppearanceFontFile,
    importAppearanceFontCssUrl,
    selectAppearanceFont,
    deleteAppearanceFont,
    applyAppearanceFontLibrary,
} from './appearance-settings/font-library-service.js';

export {
    getReadableTextScalePercentValue,
    applyReadableTextScale,
    setupReadableTextScaleSettings,
} from './appearance-settings/readable-text-scale-settings.js';

export {
    getHomeAppLabelColorModeValue,
    setupHomeAppLabelColorSettings,
} from './appearance-settings/home-label-color-settings.js';

export {
    getPhoneThemeModeValue,
    applyPhoneThemeMode,
    setupPhoneThemeModeSettings,
} from './appearance-settings/theme-settings.js';

export const { renderIconUploadList } = createIconUploadService({
    getAppearancePack: getAppearancePackImpl,
});

export async function applyAppearancePackFromRepository(id) {
    const entryResult = await getAppearancePackImpl(id);
    if (!entryResult?.success || !entryResult.pack) {
        return entryResult;
    }
    return applyAppearanceResourcePackImpl(entryResult.pack, { activePackId: entryResult.meta?.id || id });
}

export async function deleteAppearancePackFromRepository(id) {
    const settings = getPhoneSettings();
    const activePackId = String(settings?.appearanceActivePackId || '').trim();
    const targetPackId = String(id || '').trim();
    const activeCleared = Boolean(activePackId && activePackId === targetPackId);
    const iconCleanup = buildPackIconOriginCleanup(settings, targetPackId);
    const settingsChanged = activeCleared || iconCleanup.removedKeys.length > 0;
    const settingsBackup = {
        appearanceActivePackId: activePackId,
        appIcons: { ...(settings?.appIcons || {}) },
        appIconOrigins: { ...(settings?.appIconOrigins || {}) },
    };

    if (settingsChanged) {
        const patch = {
            appIcons: iconCleanup.appIcons,
            appIconOrigins: iconCleanup.appIconOrigins,
        };
        if (activeCleared) patch.appearanceActivePackId = '';

        const saved = savePhoneSettingsPatch(patch);
        if (!saved || !flushPhoneSettingsSave() || !await waitForPhoneSettingsSave()) {
            savePhoneSettingsPatch(settingsBackup);
            flushPhoneSettingsSave();
            return {
                success: false,
                message: '删除失败：相关图标设置无法持久化，仓库包未删除；当前外观未被清空',
                deletedId: '',
                activeCleared: false,
            };
        }
    }

    const deleteResult = await deleteAppearancePackImpl(targetPackId);
    if (!deleteResult?.success) {
        if (!settingsChanged) return deleteResult;

        const restored = savePhoneSettingsPatch(settingsBackup) && flushPhoneSettingsSave() && await waitForPhoneSettingsSave();
        return restored
            ? { ...deleteResult, activeCleared: false }
            : { ...deleteResult, message: `${deleteResult.message || '删除失败'}；相关图标设置恢复保存失败`, activeCleared: false };
    }

    return { ...deleteResult, activeCleared };
}
