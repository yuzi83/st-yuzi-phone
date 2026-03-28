import {
    getTableData,
    getSheetKeys,
} from '../../../phone-core/data-api.js';
import {
    getPhoneSettings,
    savePhoneSetting,
} from '../../../settings.js';
import { escapeHtml, escapeHtmlAttr } from '../../../utils.js';
import { showToast } from '../../ui/toast.js';
import { VARIABLE_MANAGER_APP } from '../../../variable-manager/index.js';

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
    if (badgeToggle) {
        badgeToggle.addEventListener('change', () => {
            savePhoneSetting('hideTableCountBadge', !!badgeToggle.checked);
            showToast(container, badgeToggle.checked ? '已隐藏数量徽标' : '已显示数量徽标');
        });
    }
}

export function renderHiddenTableAppsList(listEl) {
    if (!listEl) return;
    const rawData = getTableData();
    const hiddenMap = normalizeHiddenTableApps(getPhoneSettings().hiddenTableApps);

    if (!rawData) {
        listEl.innerHTML = '<div class="phone-empty-msg">暂无表格可配置</div>';
        return;
    }

    const sheetKeys = getSheetKeys(rawData);
    const allItems = [
        { key: VARIABLE_MANAGER_APP.id, name: VARIABLE_MANAGER_APP.name },
        ...sheetKeys.map((sheetKey) => ({
            key: sheetKey,
            name: String(rawData?.[sheetKey]?.name || sheetKey),
        })),
    ];

    if (allItems.length === 0) {
        listEl.innerHTML = '<div class="phone-empty-msg">暂无表格可配置</div>';
        return;
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

        checkbox.addEventListener('change', () => {
            const current = normalizeHiddenTableApps(getPhoneSettings().hiddenTableApps);
            if (checkbox.checked) {
                current[sheetKey] = true;
            } else {
                delete current[sheetKey];
            }
            savePhoneSetting('hiddenTableApps', current);
            showToast(listEl, checkbox.checked ? '已屏蔽图标' : '已恢复图标');
        });
    });
}
