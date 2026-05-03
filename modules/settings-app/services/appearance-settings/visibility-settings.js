import {
    getTableData,
    getSheetKeys,
} from '../../../phone-core/data-api.js';
import {
    getPhoneSettings,
    savePhoneSetting,
} from '../../../settings.js';
import { getAvailableTheaterScenes, getGroupedTheaterSheetKeys } from '../../../phone-theater/data.js';
import { escapeHtml, escapeHtmlAttr } from '../../../utils/dom-escape.js';
import { Logger } from '../../../error-handler.js';
import { showToast } from '../../ui/toast.js';
import { VARIABLE_MANAGER_APP } from '../../../variable-manager/index.js';

const logger = Logger.withScope({ scope: 'settings-app/services/appearance-settings/visibility-settings', feature: 'settings-app' });

function normalizeHiddenTableApps(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const map = {};
    Object.entries(raw).forEach(([key, value]) => {
        if (!key) return;
        if (value) map[key] = true;
    });
    return map;
}

export function setupAppearanceToggles(container) {
    const badgeToggle = container.querySelector('#phone-hide-table-count-badge');
    if (!badgeToggle) {
        return () => {};
    }

    const onChange = () => {
        savePhoneSetting('hideTableCountBadge', !!badgeToggle.checked);
        showToast(container, badgeToggle.checked ? '已隐藏数量徽标' : '已显示数量徽标');
    };

    badgeToggle.addEventListener('change', onChange);
    return () => {
        badgeToggle.removeEventListener('change', onChange);
    };
}

export function renderHiddenTableAppsList(listEl) {
    if (!listEl) return () => {};
    const rawData = getTableData();
    const hiddenMap = normalizeHiddenTableApps(getPhoneSettings().hiddenTableApps);
    const cleanups = [];

    const addCleanup = (cleanup) => {
        if (typeof cleanup === 'function') {
            cleanups.push(cleanup);
        }
    };

    if (!rawData) {
        listEl.innerHTML = '<div class="phone-empty-msg">暂无表格可配置</div>';
        return () => {};
    }

    const sheetKeys = getSheetKeys(rawData);
    const groupedTheaterSheetKeys = getGroupedTheaterSheetKeys(rawData);
    const theaterItems = getAvailableTheaterScenes(rawData).map((scene) => ({
        key: scene.appKey,
        name: scene.name,
    }));
    const tableItems = sheetKeys
        .filter(sheetKey => !groupedTheaterSheetKeys.has(sheetKey))
        .map((sheetKey) => ({
            key: sheetKey,
            name: String(rawData?.[sheetKey]?.name || sheetKey),
        }));
    const allItems = [
        { key: VARIABLE_MANAGER_APP.id, name: VARIABLE_MANAGER_APP.name },
        ...theaterItems,
        ...tableItems,
    ];

    if (allItems.length === 0) {
        listEl.innerHTML = '<div class="phone-empty-msg">暂无表格可配置</div>';
        return () => {};
    }

    listEl.innerHTML = allItems.map((item) => {
        const checked = !!hiddenMap[item.key];
        return `
            <label class="phone-appearance-check-item" data-sheet-key="${escapeHtmlAttr(item.key)}">
                <span class="phone-appearance-check-main">${escapeHtml(item.name)}</span>
                <input type="checkbox" class="phone-settings-switch" ${checked ? 'checked' : ''}>
            </label>
        `;
    }).join('');

    listEl.querySelectorAll('.phone-appearance-check-item').forEach((itemEl) => {
        const checkbox = itemEl.querySelector('input[type="checkbox"]');
        const sheetKey = itemEl.getAttribute('data-sheet-key') || '';
        if (!checkbox || !sheetKey) return;

        const onChange = () => {
            const current = normalizeHiddenTableApps(getPhoneSettings().hiddenTableApps);
            if (checkbox.checked) {
                current[sheetKey] = true;
            } else {
                delete current[sheetKey];
            }
            savePhoneSetting('hiddenTableApps', current);
            showToast(listEl, checkbox.checked ? '已屏蔽图标' : '已恢复图标');
        };

        checkbox.addEventListener('change', onChange);
        addCleanup(() => checkbox.removeEventListener('change', onChange));
    });

    return () => {
        const tasks = [...cleanups];
        cleanups.length = 0;
        tasks.reverse().forEach((cleanup) => {
            try {
                cleanup();
            } catch (error) {
                logger.warn('visibility cleanup 执行失败', error);
            }
        });
    };
}
