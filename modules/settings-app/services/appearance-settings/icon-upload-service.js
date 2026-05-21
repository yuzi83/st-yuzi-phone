import { getTableData } from '../../../phone-core/data-api.js';
import {
    getPhoneSettings,
    savePhoneSetting,
} from '../../../settings.js';
import { PHONE_ICONS } from '../../../phone-home/icons.js';
import { cacheRemove, cacheSet, CACHE_STORES } from '../../../cache-manager.js';
import { escapeHtml, escapeHtmlAttr } from '../../../utils/dom-escape.js';
import { formatFileSize } from '../../../utils/device.js';
import { Logger } from '../../../error-handler.js';
import { STORAGE_BUDGETS } from '../../constants.js';
import {
    estimateBase64Bytes,
    estimateIconsStorageBytes,
    pickImageFile,
} from '../media-upload.js';
import { showToast } from '../../ui/toast.js';
import { collectAppearanceIconSlots } from './icon-slots.js';

const logger = Logger.withScope({ scope: 'settings-app/services/appearance-settings/icon-upload-service', feature: 'settings-app' });

export function createIconUploadService() {
    const renderIconUploadList = (listEl, options = {}) => {
        if (!listEl) return () => {};

        const safeOptions = options && typeof options === 'object' ? options : {};
        const runtime = safeOptions.runtime || safeOptions.pageRuntime || null;
        let disposed = false;
        let currentCleanups = [];

        const resetBoundListeners = () => {
            const tasks = [...currentCleanups];
            currentCleanups = [];
            tasks.reverse().forEach((cleanup) => {
                try {
                    cleanup();
                } catch (error) {
                    logger.warn('icon upload cleanup 执行失败', error);
                }
            });
        };

        const addCleanup = (cleanup) => {
            if (typeof cleanup === 'function') {
                currentCleanups.push(cleanup);
            }
        };

        const addListener = (target, type, listener, options) => {
            if (!target || typeof target.addEventListener !== 'function' || typeof listener !== 'function') {
                return;
            }
            target.addEventListener(type, listener, options);
            addCleanup(() => target.removeEventListener(type, listener, options));
        };

        const render = () => {
            if (disposed) return;
            resetBoundListeners();

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

            const allItems = collectAppearanceIconSlots(rawData);
            const slotMap = new Map(allItems.map(item => [item.key, item]));

            const summaryHtml = `
                <div class="phone-settings-desc" style="margin-bottom:10px;">
                    自定义图标总占用：${escapeHtml(totalUsageText)} / ${escapeHtml(totalLimitText)}。如果超过上限，将无法继续上传新的自定义图标。
                    下方“当前设置图标清理”会列出 appIcons 中的全部条目，包括隐藏旧图标。
                </div>
            `;
            const allCurrentIconEntries = Object.entries(currentIcons);
            const cleanupHtml = `
                <div class="phone-icon-cleanup-panel">
                    <div class="phone-settings-desc" style="margin:12px 0 8px;">
                        当前设置图标清理：共 ${escapeHtml(String(allCurrentIconEntries.length))} 个自定义图标。删除这里只会移除 appIcons 中对应 key，不会影响表格数据或背景。
                    </div>
                    ${allCurrentIconEntries.length > 0 ? allCurrentIconEntries.map(([key, dataUrl]) => {
                        const slot = slotMap.get(key);
                        const label = slot ? slot.name : '隐藏旧图标 / 无当前图标位';
                        const statusClass = slot ? 'phone-icon-status-active' : 'phone-icon-status-orphan';
                        return `
                            <div class="phone-icon-cleanup-row" data-icon-key="${escapeHtmlAttr(key)}">
                                <span class="phone-icon-name">${escapeHtml(label)}</span>
                                <span class="phone-icon-key">${escapeHtml(key)}</span>
                                <span class="phone-icon-status ${statusClass}">${slot ? '当前图标位' : '隐藏旧图标'}</span>
                                <div class="phone-icon-actions">
                                    <img src="${escapeHtmlAttr(dataUrl)}" class="phone-icon-thumb">
                                    <button type="button" class="phone-settings-btn phone-settings-btn-danger phone-icon-delete-current-btn">删除</button>
                                </div>
                            </div>
                        `;
                    }).join('') : '<div class="phone-empty-msg">当前没有自定义图标</div>'}
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
            }).join('') + cleanupHtml;

            listEl.querySelectorAll('.phone-icon-upload-btn').forEach((btn) => {
                addListener(btn, 'click', () => {
                    if (disposed) return;
                    const row = btn.closest('.phone-icon-upload-row');
                    const key = row?.dataset?.iconKey;
                    if (!key) return;
                    const cacheKey = `icon:${key}`;
                    const iconName = String(row?.querySelector('.phone-icon-name')?.textContent || '图标').trim() || '图标';
                    pickImageFile((dataUrl) => {
                        if (disposed) return;
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
                        render();
                        showToast(listEl, '图标已更新');
                    }, {
                        runtime,
                        maxSizeMB: 6,
                        maxWidth: 768,
                        maxHeight: 768,
                        quality: 0.68,
                        cropTitle: `裁剪 ${iconName}`,
                        cropDescription: '建议仅保留图标主体，范围越小越容易通过容量限制。',
                        cropPreset: 'icon',
                        onError: (msg) => {
                            if (disposed) return;
                            showToast(listEl, msg || '图标上传失败', true);
                        },
                    });
                });
            });

            listEl.querySelectorAll('.phone-icon-clear-btn').forEach((btn) => {
                addListener(btn, 'click', () => {
                    if (disposed) return;
                    const row = btn.closest('.phone-icon-upload-row');
                    const key = row?.dataset?.iconKey;
                    if (!key) return;
                    const icons = { ...(getPhoneSettings().appIcons || {}) };
                    delete icons[key];
                    savePhoneSetting('appIcons', icons);
                    cacheRemove(CACHE_STORES.images, `icon:${key}`).catch(() => {});
                    render();
                    showToast(listEl, '图标已清除');
                });
            });

            listEl.querySelectorAll('.phone-icon-delete-current-btn').forEach((btn) => {
                addListener(btn, 'click', () => {
                    if (disposed) return;
                    const row = btn.closest('.phone-icon-cleanup-row');
                    const key = row?.dataset?.iconKey;
                    if (!key) return;
                    const icons = { ...(getPhoneSettings().appIcons || {}) };
                    delete icons[key];
                    savePhoneSetting('appIcons', icons);
                    cacheRemove(CACHE_STORES.images, `icon:${key}`).catch(() => {});
                    render();
                    showToast(listEl, '当前设置图标已删除');
                });
            });
        };

        render();

        return () => {
            disposed = true;
            resetBoundListeners();
        };
    };

    return {
        renderIconUploadList,
    };
}
