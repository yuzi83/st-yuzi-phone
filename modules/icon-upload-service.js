import {
    getTableData,
    getSheetKeys,
} from '../../../phone-core/data-api.js';
import {
    getPhoneSettings,
    savePhoneSetting,
} from '../../../settings.js';
import { PHONE_ICONS } from '../../../phone-home.js';
import { cacheRemove, cacheSet, CACHE_STORES } from '../../../cache-manager.js';
import { escapeHtml, escapeHtmlAttr, formatFileSize } from '../../../utils.js';
import { STORAGE_BUDGETS } from '../../constants.js';
import {
    estimateBase64Bytes,
    estimateIconsStorageBytes,
    pickImageFile,
} from '../media-upload.js';
import { showToast } from '../../ui/toast.js';
import { VARIABLE_MANAGER_APP } from '../../../variable-manager/index.js';

export function createIconUploadService() {
    const renderIconUploadList = (listEl) => {
        if (!listEl) return;
        const rawData = getTableData();
        const phoneSettings = getPhoneSettings();
        const currentIcons = phoneSettings.appIcons || {};
        const currentIconsBytes = estimateIconsStorageBytes(currentIcons);
        const totalLimitText = formatFileSize(STORAGE_BUDGETS.appIconsTotalBytes, 2);
        const totalUsageText = formatFileSize(currentIconsBytes, 2);

        if (!rawData) {
            listEl.innerHTML = '<div class="phone-empty-msg">无数据</div>';
            return;
        }

        const sheetKeys = getSheetKeys(rawData);
        const dockItems = [
            { key: 'dock_settings', name: '设置' },
            { key: 'dock_visualizer', name: '可视化' },
            { key: 'dock_db_settings', name: '数据库' },
            { key: 'dock_fusion', name: '缝合' },
        ];

        const allItems = [
            { key: VARIABLE_MANAGER_APP.id, name: VARIABLE_MANAGER_APP.name },
            ...sheetKeys.map((key) => ({ key, name: rawData[key]?.name || key })),
            ...dockItems,
        ];

        const summaryHtml = `
            <div class="phone-settings-desc" style="margin-bottom:10px;">
                自定义图标总占用：${escapeHtml(totalUsageText)} / ${escapeHtml(totalLimitText)}。如果超过上限，将无法继续上传新的自定义图标。
            </div>
        `;

        listEl.innerHTML = summaryHtml + allItems.map((item) => {
            const hasCustom = phoneSettings.appIcons?.[item.key];
            return `
                <div class="phone-icon-upload-row" data-icon-key="${escapeHtmlAttr(item.key)}">
                    <span class="phone-icon-name">${escapeHtml(item.name)}</span>
                    <div class="phone-icon-actions">
                        ${hasCustom ? `<img src="${escapeHtmlAttr(hasCustom)}" class="phone-icon-thumb">` : '<span class="phone-icon-default">默认</span>'}
                        <button type="button" class="phone-settings-btn phone-icon-upload-btn">${PHONE_ICONS.upload}</button>
                        ${hasCustom ? `<button type="button" class="phone-settings-btn phone-settings-btn-danger phone-icon-clear-btn">清除</button>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        listEl.querySelectorAll('.phone-icon-upload-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const row = btn.closest('.phone-icon-upload-row');
                const key = row.dataset.iconKey;
                const cacheKey = `icon:${key}`;
                const iconName = String(row?.querySelector('.phone-icon-name')?.textContent || '图标').trim() || '图标';
                pickImageFile((dataUrl) => {
                    const iconBytes = estimateBase64Bytes(dataUrl);
                    if (iconBytes > STORAGE_BUDGETS.appIconBytes) {
                        showToast(listEl, `单个图标过大（${formatFileSize(iconBytes, 2)} / ${formatFileSize(STORAGE_BUDGETS.appIconBytes, 2)}），请换更小图片`, true);
                        return;
                    }

                    const icons = getPhoneSettings().appIcons || {};
                    const nextIcons = {
                        ...icons,
                        [key]: dataUrl,
                    };
                    const nextTotalBytes = estimateIconsStorageBytes(nextIcons);

                    if (nextTotalBytes > STORAGE_BUDGETS.appIconsTotalBytes) {
                        showToast(listEl, `自定义图标总容量超出上限（${formatFileSize(nextTotalBytes, 2)} / ${formatFileSize(STORAGE_BUDGETS.appIconsTotalBytes, 2)}），当前图片未保存。请清理部分图标或换更小图片后重试`, true);
                        return;
                    }

                    savePhoneSetting('appIcons', nextIcons);
                    cacheSet(CACHE_STORES.images, cacheKey, dataUrl, 1000 * 60 * 60 * 24 * 30).catch(() => {});
                    renderIconUploadList(listEl);
                    showToast(listEl, '图标已更新');
                }, {
                    maxSizeMB: 6,
                    maxWidth: 768,
                    maxHeight: 768,
                    quality: 0.68,
                    cropTitle: `裁剪 ${iconName}`,
                    cropDescription: '建议仅保留图标主体，范围越小越容易通过容量限制。',
                    cropPreset: 'icon',
                    onError: (msg) => showToast(listEl, msg || '图标上传失败', true),
                });
            });
        });

        listEl.querySelectorAll('.phone-icon-clear-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const row = btn.closest('.phone-icon-upload-row');
                const key = row.dataset.iconKey;
                const icons = getPhoneSettings().appIcons || {};
                delete icons[key];
                savePhoneSetting('appIcons', icons);
                cacheRemove(CACHE_STORES.images, `icon:${key}`).catch(() => {});
                renderIconUploadList(listEl);
                showToast(listEl, '图标已清除');
            });
        });
    };

    return {
        renderIconUploadList,
    };
}
