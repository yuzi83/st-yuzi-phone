import {
    getTableData,
    getSheetKeys,
} from '../../../phone-core/data-api.js';
import { VARIABLE_MANAGER_APP } from '../../../variable-manager/index.js';
import { TABLE_UPDATE_REVIEW_APP_ID, TABLE_UPDATE_REVIEW_APP_NAME } from '../../../table-update-review/constants.js';
import { getAvailableTheaterScenes, getGroupedTheaterSheetKeys } from '../../../phone-theater/data.js';

const DOCK_ICON_SLOTS = Object.freeze([
    Object.freeze({ key: 'dock_settings', name: '设置', type: 'dock' }),
    Object.freeze({ key: 'dock_visualizer', name: '可视化', type: 'dock' }),
    Object.freeze({ key: 'dock_db_settings', name: '数据库', type: 'dock' }),
    Object.freeze({ key: 'dock_fusion', name: '缝合', type: 'dock' }),
]);

function normalizeSlotKey(value) {
    return String(value || '').trim();
}

function normalizeSlotName(value, fallback) {
    const name = String(value || '').trim();
    return name || fallback;
}

function dedupeIconSlots(slots) {
    const used = new Set();
    const normalized = [];

    slots.forEach((slot) => {
        const key = normalizeSlotKey(slot?.key);
        if (!key || used.has(key)) return;
        used.add(key);
        normalized.push({
            key,
            name: normalizeSlotName(slot?.name, key),
            type: normalizeSlotName(slot?.type, 'app'),
        });
    });

    return normalized;
}

export function collectAppearanceIconSlots(rawData = getTableData()) {
    if (!rawData || typeof rawData !== 'object') {
        return [];
    }

    const sheetKeys = getSheetKeys(rawData);
    const groupedTheaterSheetKeys = getGroupedTheaterSheetKeys(rawData);
    const theaterItems = getAvailableTheaterScenes(rawData).map((scene) => ({
        key: scene.appKey,
        name: scene.name,
        type: 'theater',
    }));
    const tableItems = sheetKeys
        .filter(sheetKey => !groupedTheaterSheetKeys.has(sheetKey))
        .map((key) => ({
            key,
            name: rawData[key]?.name || key,
            type: 'table',
        }));

    return dedupeIconSlots([
        { key: TABLE_UPDATE_REVIEW_APP_ID, name: TABLE_UPDATE_REVIEW_APP_NAME, type: 'system' },
        { key: VARIABLE_MANAGER_APP.id, name: VARIABLE_MANAGER_APP.name, type: 'system' },
        ...theaterItems,
        ...tableItems,
        ...DOCK_ICON_SLOTS,
    ]);
}
