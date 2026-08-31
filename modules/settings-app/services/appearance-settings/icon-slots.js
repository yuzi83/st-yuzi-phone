import { getTableData } from '../../../phone-core/data-api.js';
import { buildTableNavigationContext } from '../../../table-navigation/catalog.js';
import { VARIABLE_MANAGER_APP } from '../../../variable-manager/index.js';
import { QQ_APP } from '../../../qq-v2/app-definition.js';
import { TABLE_UPDATE_REVIEW_APP_ID, TABLE_UPDATE_REVIEW_APP_NAME } from '../../../table-update-review/constants.js';

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

export function collectAppearanceIconSlots(rawData = getTableData(), options = {}) {
    if (!rawData || typeof rawData !== 'object') {
        return [];
    }

    const navigationContext = options.navigationContext || buildTableNavigationContext(rawData);
    const theaterItems = navigationContext.theaterScenes.map((scene) => ({
        key: scene.appKey,
        name: scene.name,
        type: 'theater',
    }));
    const tableItems = navigationContext.catalog
        .filter(item => item.presentation === 'generic')
        .map((item) => ({
            key: item.sheetKey,
            name: item.tableName,
            type: 'table',
        }));

    return dedupeIconSlots([
        { key: TABLE_UPDATE_REVIEW_APP_ID, name: TABLE_UPDATE_REVIEW_APP_NAME, type: 'system' },
        { key: VARIABLE_MANAGER_APP.id, name: VARIABLE_MANAGER_APP.name, type: 'system' },
        { key: QQ_APP.id, name: QQ_APP.name, type: 'system' },
        ...theaterItems,
        ...tableItems,
        ...DOCK_ICON_SLOTS,
    ]);
}

export function buildAppearanceAppCatalog(rawData = getTableData()) {
    const navigationContext = buildTableNavigationContext(rawData);
    return Object.freeze({
        rawData,
        navigationContext,
        iconSlots: collectAppearanceIconSlots(rawData, { navigationContext }),
    });
}
