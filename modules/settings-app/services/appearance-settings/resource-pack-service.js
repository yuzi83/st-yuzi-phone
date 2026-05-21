import { getTableData } from '../../../phone-core/data-api.js';
import {
    getPhoneSettings,
    savePhoneSettingsPatch,
    flushPhoneSettingsSave,
} from '../../../settings.js';
import { STORAGE_BUDGETS } from '../../constants.js';
import {
    estimateBase64Bytes,
    estimateIconsStorageBytes,
} from '../media-upload.js';
import { collectAppearanceIconSlots } from './icon-slots.js';

export const APPEARANCE_PACK_FORMAT = 'yuzi-phone-appearance-pack';
export const APPEARANCE_PACK_SCHEMA_VERSION = 1;
export const APPEARANCE_PACK_MIN_COMPAT_SCHEMA_VERSION = 1;

const IMAGE_MIME_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/svg+xml',
]);

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function safeString(value, maxLength = 256) {
    return String(value ?? '').trim().slice(0, maxLength);
}

function parsePackInput(input) {
    if (typeof input === 'string') {
        return JSON.parse(input);
    }
    if (isPlainObject(input)) {
        return input;
    }
    throw new Error('外观包必须是 JSON 对象');
}

function normalizeImageResource(raw, index = 0, kind = 'resource') {
    if (!isPlainObject(raw)) return null;
    const dataUrl = safeString(raw.dataUrl, Number.MAX_SAFE_INTEGER);
    const match = dataUrl.match(/^data:([^;,]+)[;,]/i);
    const mime = safeString(raw.mime || match?.[1], 64).toLowerCase();
    if (!dataUrl || !mime || !IMAGE_MIME_TYPES.has(mime) || !dataUrl.startsWith(`data:${mime}`)) {
        return null;
    }

    const bytes = estimateBase64Bytes(dataUrl);
    const fallbackId = `${kind}_${index + 1}`;
    const id = safeString(raw.id, 96) || fallbackId;
    const hash = safeString(raw.hash, 160) || computeResourceHash(dataUrl);

    return {
        id,
        name: safeString(raw.name, 120) || id,
        ...(safeString(raw.slotKey, 160)
            ? { slotKey: safeString(raw.slotKey, 160) } : {}),
        mime,
        dataUrl,
        hash,
        bytes,
        width: Number.isFinite(Number(raw.width)) ? Math.max(0, Math.round(Number(raw.width))) : 0,
        height: Number.isFinite(Number(raw.height)) ? Math.max(0, Math.round(Number(raw.height))) : 0,
        source: safeString(raw.source || 'pack', 48) || 'pack',
    };
}

function computeResourceHash(dataUrl) {
    const source = String(dataUrl || '');
    let hash = 5381;
    for (let i = 0; i < source.length; i += 1) {
        hash = ((hash << 5) + hash) ^ source.charCodeAt(i);
        hash >>>= 0;
    }
    return `djb2:${hash.toString(16).padStart(8, '0')}:${source.length}`;
}

function dedupeResources(resources) {
    const used = new Set();
    const normalized = [];
    resources.forEach((resource) => {
        const key = resource?.hash || resource?.dataUrl;
        if (!resource || !key || used.has(key)) return;
        used.add(key);
        normalized.push(resource);
    });
    return normalized;
}

function normalizeResourceList(list, kind) {
    if (!Array.isArray(list)) return [];
    return dedupeResources(
        list.map((item, index) => normalizeImageResource(item, index, kind)).filter(Boolean),
    );
}

function validatePack(pack) {
    if (!isPlainObject(pack)) {
        throw new Error('外观包必须是对象');
    }
    if (pack.format !== APPEARANCE_PACK_FORMAT) {
        throw new Error(`外观包 format 必须是 ${APPEARANCE_PACK_FORMAT}`);
    }

    const schemaVersion = Number(pack.schemaVersion || 0);
    if (!Number.isFinite(schemaVersion) || schemaVersion < APPEARANCE_PACK_MIN_COMPAT_SCHEMA_VERSION) {
        throw new Error('外观包 schemaVersion 过旧或无效');
    }
    if (schemaVersion > APPEARANCE_PACK_SCHEMA_VERSION) {
        throw new Error(`外观包 schemaVersion=${schemaVersion} 高于当前支持版本 ${APPEARANCE_PACK_SCHEMA_VERSION}`);
    }

    return {
        ...pack,
        schemaVersion,
        wallpapers: normalizeResourceList(pack.wallpapers, 'wallpaper'),
        icons: normalizeResourceList(pack.icons, 'icon'),
        iconPool: normalizeResourceList(pack.iconPool, 'icon'),
        preferences: isPlainObject(pack.preferences) ? pack.preferences : {},
    };
}

function createEmptyAppearanceResourcePool() {
    return {
        wallpapers: [],
        icons: [],
    };
}

function buildReplacingIconAssignment({ iconSlots, packIcons }) {
    const slots = Array.isArray(iconSlots) ? iconSlots.filter(slot => slot?.key) : [];
    const slotMap = new Map(slots.map(slot => [slot.key, slot]));
    const usedSlotKeys = new Set();
    const nextIcons = {};
    const assigned = [];
    const sequentialCandidates = [];
    const discarded = [];
    const unmatchedSlotKeyIcons = [];

    packIcons.forEach((icon) => {
        const slotKey = safeString(icon?.slotKey, 160);
        if (slotKey && slotMap.has(slotKey) && !usedSlotKeys.has(slotKey)) {
            const slot = slotMap.get(slotKey);
            nextIcons[slotKey] = icon.dataUrl;
            usedSlotKeys.add(slotKey);
            assigned.push({
                slotKey,
                slotName: slot.name,
                resourceId: icon.id,
            });
            return;
        }

        if (slotKey && !slotMap.has(slotKey)) {
            unmatchedSlotKeyIcons.push(icon);
        }
        sequentialCandidates.push(icon);
    });

    let slotIndex = 0;
    sequentialCandidates.forEach((icon) => {
        while (slotIndex < slots.length && usedSlotKeys.has(slots[slotIndex].key)) {
            slotIndex += 1;
        }
        const slot = slots[slotIndex];
        if (!slot) {
            discarded.push(icon);
            return;
        }
        nextIcons[slot.key] = icon.dataUrl;
        usedSlotKeys.add(slot.key);
        assigned.push({
            slotKey: slot.key,
            slotName: slot.name,
            resourceId: icon.id,
        });
        slotIndex += 1;
    });

    if (slots.length === 0 && sequentialCandidates.length === 0 && packIcons.length > 0) {
        discarded.push(...packIcons);
    }

    return { nextIcons, assigned, discarded, unmatchedSlotKeyIcons };
}

function createExportResource({ id, name, dataUrl, source = 'settings', slotKey = '' }) {
    const normalized = normalizeImageResource({
        id,
        name,
        dataUrl,
        source,
        slotKey,
    }, 0, 'export');
    return normalized;
}

function collectActiveIconKeys() {
    const rawData = getTableData();
    if (!rawData) {
        return { keys: new Set(), available: false };
    }

    const slots = collectAppearanceIconSlots(rawData);
    return {
        keys: new Set(slots.map((slot) => slot.key).filter(Boolean)),
        available: true,
    };
}

function splitAppIconsByActiveSlots(appIcons, activeKeys) {
    const activeIcons = {};
    const orphanIcons = {};
    Object.entries(appIcons || {}).forEach(([key, dataUrl]) => {
        if (activeKeys.has(key)) {
            activeIcons[key] = dataUrl;
        } else {
            orphanIcons[key] = dataUrl;
        }
    });
    return { activeIcons, orphanIcons };
}

export function clearAppearanceResourcePoolIcons() {
    const settings = getPhoneSettings();
    const activeKeyResult = collectActiveIconKeys();
    const currentAppIcons = settings.appIcons || {};
    const { activeIcons, orphanIcons } = activeKeyResult.available
        ? splitAppIconsByActiveSlots(currentAppIcons, activeKeyResult.keys)
        : { activeIcons: currentAppIcons, orphanIcons: {} };
    const removedPoolIcons = Array.isArray(settings.appearanceResourcePool?.icons) ? settings.appearanceResourcePool.icons.length : 0;
    const removedOrphanAppIcons = Object.keys(orphanIcons).length;
    const removedCount = removedPoolIcons + removedOrphanAppIcons;

    if (removedCount <= 0) {
        return {
            success: false,
            removedCount: 0,
            removedPoolIcons: 0,
            removedOrphanAppIcons: 0,
            skippedOrphanCleanup: !activeKeyResult.available,
            message: activeKeyResult.available ? '未发现可清理的未使用图标' : '当前数据不可用，已跳过隐藏旧图标扫描',
        };
    }

    const patch = {
        appearanceResourcePool: createEmptyAppearanceResourcePool(),
    };
    if (removedOrphanAppIcons > 0) {
        patch.appIcons = activeIcons;
    }

    const saved = savePhoneSettingsPatch(patch);

    if (!saved) {
        return {
            success: false,
            removedCount: 0,
            removedPoolIcons: 0,
            removedOrphanAppIcons: 0,
            skippedOrphanCleanup: !activeKeyResult.available,
            message: '未使用图标清理失败：设置保存失败',
        };
    }

    flushPhoneSettingsSave();
    return {
        success: true,
        removedCount,
        removedPoolIcons,
        removedOrphanAppIcons,
        skippedOrphanCleanup: !activeKeyResult.available,
        message: `已清理未使用图标 ${removedCount} 个（兼容旧资源 ${removedPoolIcons} 个，隐藏旧图标 ${removedOrphanAppIcons} 个）`,
    };
}

export function exportAppearanceResourcePack(options = {}) {
    const settings = getPhoneSettings();
    const slotNameMap = new Map(collectAppearanceIconSlots().map(slot => [slot.key, slot.name]));
    const wallpapers = [];
    const icons = [];

    if (settings.backgroundImage) {
        const currentWallpaper = createExportResource({
            id: 'current-background',
            name: '当前背景',
            dataUrl: settings.backgroundImage,
            source: 'current',
        });
        if (currentWallpaper) wallpapers.push(currentWallpaper);
    }

    Object.entries(settings.appIcons || {}).forEach(([key, dataUrl]) => {
        const icon = createExportResource({
            id: `current-icon-${key}`,
            name: slotNameMap.get(key) || `当前图标 ${key}`,
            dataUrl,
            source: 'current',
            slotKey: key,
        });
        if (icon) icons.push(icon);
    });

    const packName = safeString(options.packName, 120) || '玉子手机外观资源包';
    return {
        success: true,
        pack: {
            format: APPEARANCE_PACK_FORMAT,
            schemaVersion: APPEARANCE_PACK_SCHEMA_VERSION,
            minCompatSchemaVersion: APPEARANCE_PACK_MIN_COMPAT_SCHEMA_VERSION,
            packMeta: {
                name: packName,
                exportedAt: new Date().toISOString(),
                exporter: 'YuziPhone',
            },
            wallpapers: dedupeResources(wallpapers),
            icons: dedupeResources(icons),
            iconPool: [],
            preferences: {
                wallpaperStrategy: 'replace-current',
                iconAssignStrategy: 'slot-key-overwrite',
                overwriteExistingIcons: true,
                discardExtraIcons: true,
                clearMissingIconSlots: true,
            },
        },
    };
}

export function importAppearanceResourcePackFromData(input) {
    const warnings = [];
    try {
        const pack = validatePack(parsePackInput(input));
        const currentSettings = getPhoneSettings();
        const iconSlots = collectAppearanceIconSlots();
        const packIcons = dedupeResources([...pack.icons, ...pack.iconPool]);
        const wallpaper = pack.wallpapers[0] || null;

        if (wallpaper && wallpaper.bytes > STORAGE_BUDGETS.backgroundImageBytes) {
            return {
                success: false,
                imported: 0,
                assignedIcons: 0,
                poolIcons: 0,
                discardedIcons: 0,
                unmatchedIcons: 0,
                warnings,
                errors: ['背景图超过当前背景容量上限，未导入'],
                message: '导入失败：背景图过大',
            };
        }

        const oversizedIcon = packIcons.find(icon => icon.bytes > STORAGE_BUDGETS.appIconBytes);
        if (oversizedIcon) {
            return {
                success: false,
                imported: 0,
                assignedIcons: 0,
                poolIcons: 0,
                discardedIcons: 0,
                unmatchedIcons: 0,
                warnings,
                errors: [`图标“${oversizedIcon.name}”超过单图容量上限，未导入`],
                message: '导入失败：图标过大',
            };
        }

        const assignment = buildReplacingIconAssignment({
            iconSlots,
            packIcons,
        });
        const nextTotalIconBytes = estimateIconsStorageBytes(assignment.nextIcons);

        if (nextTotalIconBytes > STORAGE_BUDGETS.appIconsTotalBytes) {
            return {
                success: false,
                imported: 0,
                assignedIcons: 0,
                poolIcons: 0,
                discardedIcons: assignment.discarded.length,
                unmatchedIcons: assignment.unmatchedSlotKeyIcons.length,
                warnings,
                errors: ['导入后图标总容量超过上限，未导入'],
                message: '导入失败：图标总容量超限',
            };
        }

        if (iconSlots.length === 0 && packIcons.length > 0) {
            warnings.push('当前没有可分配图标位，图标已丢弃');
        } else if (assignment.discarded.length > 0) {
            warnings.push(`有 ${assignment.discarded.length} 个图标超过当前图标位数量，已丢弃`);
        }
        if (assignment.unmatchedSlotKeyIcons.length > 0) {
            warnings.push(`有 ${assignment.unmatchedSlotKeyIcons.length} 个图标的 slotKey 不存在，已按顺序分配或丢弃`);
        }

        const backup = {
            backgroundImage: currentSettings.backgroundImage || null,
            appIcons: { ...(currentSettings.appIcons || {}) },
            appearanceResourcePool: currentSettings.appearanceResourcePool || createEmptyAppearanceResourcePool(),
        };
        const patch = {
            backgroundImage: wallpaper ? wallpaper.dataUrl : backup.backgroundImage,
            appIcons: assignment.nextIcons,
            appearanceResourcePool: createEmptyAppearanceResourcePool(),
        };

        const saved = savePhoneSettingsPatch(patch);
        if (!saved) {
            savePhoneSettingsPatch(backup);
            flushPhoneSettingsSave();
            return {
                success: false,
                imported: 0,
                assignedIcons: 0,
                poolIcons: 0,
                discardedIcons: assignment.discarded.length,
                unmatchedIcons: assignment.unmatchedSlotKeyIcons.length,
                warnings,
                errors: ['设置保存失败，已回滚'],
                message: '导入失败：设置保存失败',
            };
        }
        flushPhoneSettingsSave();

        return {
            success: true,
            imported: (wallpaper ? 1 : 0) + assignment.assigned.length,
            assignedIcons: assignment.assigned.length,
            poolIcons: 0,
            discardedIcons: assignment.discarded.length,
            unmatchedIcons: assignment.unmatchedSlotKeyIcons.length,
            warnings,
            errors: [],
            message: `导入完成：背景 ${wallpaper ? 1 : 0}，分配图标 ${assignment.assigned.length}，丢弃多余图标 ${assignment.discarded.length}`,
        };
    } catch (error) {
        return {
            success: false,
            imported: 0,
            assignedIcons: 0,
            poolIcons: 0,
            discardedIcons: 0,
            unmatchedIcons: 0,
            warnings,
            errors: [error?.message || '未知错误'],
            message: `导入失败：${error?.message || '未知错误'}`,
        };
    }
}
