// modules/phone/phone-settings.js
/**
 * 玉子的手机 - 设置 App
 * 一级入口：外观设置 / 美化模板 / 按钮调节 / 数据库配置
 */

import {
    getTableData,
    getSheetKeys,
    triggerManualUpdate,
    navigateBack,
    getPhoneSettings,
    savePhoneSetting,
    savePhoneSettingsPatch,
    bindPhoneScrollGuards,
    getDbConfigApiAvailability,
    readDbUpdateConfigViaApi,
    writeDbUpdateConfigViaApi,
    readManualTableSelectionViaApi,
    writeManualTableSelectionViaApi,
    clearManualTableSelectionViaApi,
    // API预设选择桥接
    getApiPresets,
    getTableApiPreset,
    setTableApiPreset,
    getPlotApiPreset,
    setPlotApiPreset,
    // 提示词模板管理
    getPromptTemplates,
    savePromptTemplate,
    deletePromptTemplate,
    getPromptTemplate,
} from './phone-core.js';
import { PHONE_ICONS } from './phone-home.js';
import { createDebouncedTask } from './runtime-manager.js';
import { clampNumber, escapeHtml, escapeHtmlAttr, formatFileSize } from './utils.js';
import { cacheSet, cacheGet, cacheRemove, CACHE_STORES } from './cache-manager.js';
import { STORAGE_BUDGETS } from './settings-app/constants.js';
import { createScrollPreserver } from './settings-app/ui/scroll-preserver.js';
import { showToast } from './settings-app/ui/toast.js';
import {
    createDbPreset,
    getActiveDbPresetNameFromSettings,
    getDbPresetsFromPhoneSettings,
    isSameDbSnapshot,
    normalizeDbConfigSnapshot,
    normalizeDbManualSelection,
    normalizeDbUpdateConfig,
    saveDbPresetsToPhoneSettings,
    setActiveDbPresetNameToSettings,
} from './settings-app/services/db-presets.js';
import {
    estimateBase64Bytes,
    estimateIconsStorageBytes,
    pickImageFile,
} from './settings-app/services/media-upload.js';
import { renderApiPromptConfigPage as renderApiPromptConfigPagePage } from './settings-app/pages/api-prompt-config.js';
import { renderAppearancePage as renderAppearancePagePage } from './settings-app/pages/appearance.js';
import { renderButtonStylePage as renderButtonStylePagePage } from './settings-app/pages/button-style.js';
import { renderDatabasePage as renderDatabasePagePage } from './settings-app/pages/database.js';
import { renderHomePage as renderHomePagePage } from './settings-app/pages/home.js';
import { renderPromptEditorPage as renderPromptEditorPagePage } from './settings-app/pages/prompt-editor.js';
import { renderBeautifyTemplatePage as renderBeautifyTemplatePagePage } from './settings-app/pages/beautify.js';

export function renderSettings(container) {
    const state = {
        mode: 'home', // home | appearance | database | beautify | button_style | api_prompt_config | prompt_editor
        databaseScrollTop: 0,
        appearanceScrollTop: 0,
        beautifyScrollTop: 0,
        buttonStyleScrollTop: 0,
        apiPromptConfigScrollTop: 0,
        // 提示词编辑器状态
        promptEditorName: '',
        promptEditorContent: '',
        promptEditorIsNew: true,
        promptEditorOriginalName: '',
        // API提示词配置页面状态
        apiPromptConfigSelectedTemplate: '',
        // 世界书条目读取状态
        worldbookLoading: false,
        worldbookError: null,
        worldbookList: [],           // 所有世界书名称列表
        currentWorldbook: '',        // 当前选中的世界书名称
        worldbookSourceMode: 'manual',
        boundWorldbookNames: [],
        worldbookEntries: [],        // 当前世界书的条目列表
        worldbookSearchQuery: '',    // 搜索关键词
        worldbookEventCleanup: null,
    };

    // ===== 统一的滚动位置管理辅助函数 =====
    const { captureScroll, restoreScroll, createRerenderWithScroll } = createScrollPreserver(container, state);

    const readDbSnapshot = () => {
        const apiAvailability = getDbConfigApiAvailability();
        const updateResult = readDbUpdateConfigViaApi();
        const manualResult = readManualTableSelectionViaApi();

        return {
            apiAvailability,
            updateResult,
            manualResult,
            ready: apiAvailability.ok && updateResult.ok && manualResult.ok,
            snapshot: normalizeDbConfigSnapshot({
                updateConfig: updateResult.data,
                manualSelection: manualResult.data,
            }),
        };
    };

    const rollbackDbSnapshot = (snapshot) => {
        const normalized = normalizeDbConfigSnapshot(snapshot);
        writeDbUpdateConfigViaApi(normalized.updateConfig);
        if (normalized.manualSelection.hasManualSelection) {
            writeManualTableSelectionViaApi(normalized.manualSelection.selectedTables);
        } else {
            clearManualTableSelectionViaApi();
        }
    };

    const applyDbSnapshot = (targetSnapshot, rollbackSnapshot = null) => {
        const normalized = normalizeDbConfigSnapshot(targetSnapshot);

        const updateWrite = writeDbUpdateConfigViaApi(normalized.updateConfig);
        if (!updateWrite.ok) {
            return {
                ok: false,
                message: updateWrite.message || '更新配置写入失败',
            };
        }

        const manualWrite = normalized.manualSelection.hasManualSelection
            ? writeManualTableSelectionViaApi(normalized.manualSelection.selectedTables)
            : clearManualTableSelectionViaApi();

        if (!manualWrite.ok) {
            if (rollbackSnapshot) {
                rollbackDbSnapshot(rollbackSnapshot);
            }
            return {
                ok: false,
                message: manualWrite.message || '手动更新表选择写入失败',
            };
        }

        const readback = readDbSnapshot();
        return {
            ok: true,
            message: '数据库配置已写入',
            readback,
            target: normalized,
        };
    };

    const switchPresetByName = (presetName, toastHost) => {
        const targetName = String(presetName || '').trim();

        if (!targetName) {
            setActiveDbPresetName('');
            showToast(toastHost, '已切换为当前配置（未绑定预设）');
            return true;
        }

        const presets = getDbPresets();
        const preset = presets.find(it => it.name === targetName);
        if (!preset) {
            showToast(toastHost, `未找到预设：${targetName}`, true);
            return false;
        }

        const before = readDbSnapshot();
        if (!before.ready) {
            showToast(toastHost, before.apiAvailability?.message || '数据库接口不可用，无法切换预设', true);
            return false;
        }

        const applied = applyDbSnapshot({
            updateConfig: preset.updateConfig,
            manualSelection: preset.manualSelection,
        }, before.snapshot);

        if (!applied.ok) {
            showToast(toastHost, `切换失败：${applied.message}`, true);
            return false;
        }

        if (!applied.readback?.ready) {
            setActiveDbPresetName('');
            showToast(toastHost, '预设已写入，但读回校验失败，已取消激活状态', true);
            return true;
        }

        const matched = isSameDbSnapshot(applied.readback.snapshot, applied.target);
        if (!matched) {
            setActiveDbPresetName('');
            showToast(toastHost, '预设已应用，但系统修正了部分参数，已取消激活状态', true);
            return true;
        }

        setActiveDbPresetName(targetName);
        showToast(toastHost, `已切换预设：${targetName}`);
        return true;
    };

    const clearActivePresetBindingIfNeeded = () => {
        const activeName = getActiveDbPresetName();
        if (!activeName) return false;
        setActiveDbPresetName('');
        return true;
    };

    const render = () => {
        if (state.mode === 'appearance') {
            renderAppearancePage();
        } else if (state.mode === 'database') {
            renderDatabasePage();
        } else if (state.mode === 'beautify') {
            renderBeautifyTemplatePage();
        } else if (state.mode === 'button_style') {
            renderButtonStylePage();
        } else if (state.mode === 'api_prompt_config') {
            renderApiPromptConfigPage();
        } else if (state.mode === 'prompt_editor') {
            renderPromptEditorPage();
        } else {
            renderHomePage();
        }

        // 设置 App 内部子视图会反复 innerHTML 重渲染，需要每次重绑滚动守卫。
        bindPhoneScrollGuards(container);
    };

    const rerenderHomeKeepScroll = createRerenderWithScroll('homeScrollTop', render);
    const rerenderDatabaseKeepScroll = createRerenderWithScroll('databaseScrollTop', render);
    const rerenderAppearanceKeepScroll = createRerenderWithScroll('appearanceScrollTop', render);
    const rerenderBeautifyKeepScrollGlobal = createRerenderWithScroll('beautifyScrollTop', render);
    const rerenderButtonStyleKeepScroll = createRerenderWithScroll('buttonStyleScrollTop', render);
    const rerenderApiPromptConfigKeepScroll = createRerenderWithScroll('apiPromptConfigScrollTop', render);

    const renderHomePage = () => {
        renderHomePagePage({
            container,
            state,
            render,
            rerenderHomeKeepScroll,
            navigateBack,
            getDbConfigApiAvailability,
            getDbPresets,
            getActiveDbPresetName,
            getApiPresets,
            getTableApiPreset,
            setTableApiPreset,
            switchPresetByName,
            showToast,
            setupManualUpdateBtn,
        });
    };

    const renderAppearancePage = () => {
        renderAppearancePagePage({
            container,
            state,
            render,
            getLayoutValue,
            getPhoneSettings,
            setupBgUpload,
            setupIconLayoutSettings,
            setupAppearanceToggles,
            renderHiddenTableAppsList,
            renderIconUploadList,
        });
    };

    const renderDatabasePage = () => {
        renderDatabasePagePage({
            container,
            state,
            render,
            getTableData,
            getSheetKeys,
            getDbConfigApiAvailability,
            readDbSnapshot,
            getDbPresets,
            getActiveDbPresetName,
            switchPresetByName,
            showToast,
            rerenderDatabaseKeepScroll,
            clearActivePresetBindingIfNeeded,
            normalizeDbManualSelection,
            normalizeDbUpdateConfig,
            createDbPreset,
            saveDbPresets,
            setActiveDbPresetName,
            writeDbUpdateConfigViaApi,
            writeManualTableSelectionViaApi,
            clearManualTableSelectionViaApi,
        });
    };

    const renderButtonStylePage = () => {
        renderButtonStylePagePage({
            container,
            state,
            render,
            getPhoneSettings,
            savePhoneSetting,
            savePhoneSettingsPatch,
            rerenderButtonStyleKeepScroll,
        });
    };

    // ===== API提示词配置页面 =====

    const renderApiPromptConfigPage = () => {
        renderApiPromptConfigPagePage({
            container,
            state,
            render,
            rerenderApiPromptConfigKeepScroll,
            getDbConfigApiAvailability,
            getApiPresets,
            getTableApiPreset,
            setTableApiPreset,
            getPlotApiPreset,
            setPlotApiPreset,
            getPromptTemplates,
            deletePromptTemplate,
        });
    };

    // ===== 提示词编辑器页面 =====

    const renderPromptEditorPage = () => {
        renderPromptEditorPagePage({
            container,
            state,
            render,
            getPromptTemplate,
            savePromptTemplate,
        });
    };

    const renderBeautifyTemplatePage = () => {
        renderBeautifyTemplatePagePage({
            container,
            state,
            render,
            captureScroll,
            restoreScroll,
        });
    };

    const getDbPresets = () => getDbPresetsFromPhoneSettings();
    const saveDbPresets = (presets) => saveDbPresetsToPhoneSettings(presets);
    const getActiveDbPresetName = () => getActiveDbPresetNameFromSettings();
    const setActiveDbPresetName = (name) => setActiveDbPresetNameToSettings(name);

    render();
}

// ===== 手动更新 =====

function setupManualUpdateBtn(container, btnSelector = '#phone-trigger-update', statusSelector = '#phone-update-status') {
    const btn = container.querySelector(btnSelector);
    if (!btn) return;

    btn.addEventListener('click', async function () {
        const statusEl = statusSelector ? container.querySelector(statusSelector) : null;
        const self = this instanceof HTMLButtonElement ? this : btn;
        self.disabled = true;
        self.classList.add('phone-btn-loading');
        if (statusEl) {
            statusEl.textContent = '正在触发更新...';
            statusEl.className = 'phone-update-status phone-status-pending';
        }

        try {
            const ok = await triggerManualUpdate();
            if (statusEl) {
                if (ok) {
                    statusEl.textContent = '更新已触发';
                    statusEl.className = 'phone-update-status phone-status-success';
                } else {
                    statusEl.textContent = '未找到更新接口，请确保数据库脚本已加载';
                    statusEl.className = 'phone-update-status phone-status-error';
                }
            }
        } catch (e) {
            if (statusEl) {
                statusEl.textContent = '更新失败: ' + e.message;
                statusEl.className = 'phone-update-status phone-status-error';
            }
        }

        self.disabled = false;
        self.classList.remove('phone-btn-loading');
    });
}

// ===== 背景上传 =====

function setupBgUpload(container) {
    const phoneSettings = getPhoneSettings();
    const preview = container.querySelector('#phone-bg-preview');
    const cachedKey = 'background-image';

    if (phoneSettings.backgroundImage) {
        preview.innerHTML = `<img src="${escapeHtmlAttr(phoneSettings.backgroundImage)}" class="phone-bg-thumb">`;
    } else {
        cacheGet(CACHE_STORES.images, cachedKey).then((cached) => {
            if (typeof cached === 'string' && cached) {
                preview.innerHTML = `<img src="${escapeHtmlAttr(cached)}" class="phone-bg-thumb">`;
            }
        }).catch(() => {});
    }

    container.querySelector('#phone-upload-bg')?.addEventListener('click', () => {
        pickImageFile(async (dataUrl) => {
            if (estimateBase64Bytes(dataUrl) > STORAGE_BUDGETS.backgroundImageBytes) {
                showToast(container, '背景图压缩后仍过大，请选择更小图片', true);
                return;
            }

            savePhoneSetting('backgroundImage', dataUrl);
            preview.innerHTML = `<img src="${escapeHtmlAttr(dataUrl)}" class="phone-bg-thumb">`;
            cacheSet(CACHE_STORES.images, cachedKey, dataUrl, 1000 * 60 * 60 * 24 * 30).catch(() => {});
            showToast(container, '背景已更新');
        }, {
            maxSizeMB: 12,
            maxWidth: 1920,
            maxHeight: 1920,
            quality: 0.8,
            cropTitle: '裁剪背景图',
            cropDescription: '可自由调整背景可见区域，确认后再保存。',
            cropPreset: 'background',
            onError: (msg) => showToast(container, msg || '背景图片上传失败', true),
        });
    });

    container.querySelector('#phone-clear-bg')?.addEventListener('click', () => {
        savePhoneSetting('backgroundImage', null);
        preview.innerHTML = '';
        cacheRemove(CACHE_STORES.images, cachedKey).catch(() => {});
        showToast(container, '背景已清除');
    });
}

// ===== App 图标上传列表 =====

function renderIconUploadList(listEl) {
    if (!listEl) return;
    const rawData = getTableData();
    const phoneSettings = getPhoneSettings();
    const currentIcons = phoneSettings.appIcons || {};
    const currentIconsBytes = estimateIconsStorageBytes(currentIcons);
    const totalLimitText = formatFileSize(STORAGE_BUDGETS.appIconsTotalBytes, 2);
    const totalUsageText = formatFileSize(currentIconsBytes, 2);

    if (!rawData) {
        listEl.innerHTML = `<div class="phone-empty-msg">无数据</div>`;
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
        ...sheetKeys.map(k => ({ key: k, name: rawData[k]?.name || k })),
        ...dockItems,
    ];

    const summaryHtml = `
        <div class="phone-settings-desc" style="margin-bottom:10px;">
            自定义图标总占用：${escapeHtml(totalUsageText)} / ${escapeHtml(totalLimitText)}。如果超过上限，将无法继续上传新的自定义图标。
        </div>
    `;

    listEl.innerHTML = summaryHtml + allItems.map(item => {
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

    listEl.querySelectorAll('.phone-icon-upload-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const row = btn.closest('.phone-icon-upload-row');
            const key = row.dataset.iconKey;
            const cacheKey = `icon:${key}`;
            const iconName = String(row?.querySelector('.phone-icon-name')?.textContent || '图标').trim() || '图标';
            pickImageFile(dataUrl => {
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

    listEl.querySelectorAll('.phone-icon-clear-btn').forEach(btn => {
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
}

function setupAppearanceToggles(container) {
    const badgeToggle = container.querySelector('#phone-hide-table-count-badge');
    if (badgeToggle) {
        badgeToggle.addEventListener('change', () => {
            savePhoneSetting('hideTableCountBadge', !!badgeToggle.checked);
            showToast(container, badgeToggle.checked ? '已隐藏数量徽标' : '已显示数量徽标');
        });
    }
}

function renderHiddenTableAppsList(listEl) {
    if (!listEl) return;
    const rawData = getTableData();
    const hiddenMap = normalizeHiddenTableApps(getPhoneSettings().hiddenTableApps);

    if (!rawData) {
        listEl.innerHTML = '<div class="phone-empty-msg">暂无表格可配置</div>';
        return;
    }

    const sheetKeys = getSheetKeys(rawData);
    if (sheetKeys.length === 0) {
        listEl.innerHTML = '<div class="phone-empty-msg">暂无表格可配置</div>';
        return;
    }

    listEl.innerHTML = sheetKeys.map((sheetKey) => {
        const name = String(rawData?.[sheetKey]?.name || sheetKey);
        const checked = !!hiddenMap[sheetKey];
        return `
            <label class="phone-appearance-check-item" data-sheet-key="${escapeHtmlAttr(sheetKey)}">
                <span class="phone-appearance-check-main">${escapeHtml(name)}</span>
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

function normalizeHiddenTableApps(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const map = {};
    Object.entries(raw).forEach(([key, value]) => {
        if (!key) return;
        if (value) map[key] = true;
    });
    return map;
}

function setupIconLayoutSettings(container) {
    const map = [
        { id: '#phone-app-grid-columns', key: 'appGridColumns', min: 3, max: 6, fallback: 4 },
        { id: '#phone-app-icon-size', key: 'appIconSize', min: 40, max: 88, fallback: 60 },
        { id: '#phone-app-icon-radius', key: 'appIconRadius', min: 6, max: 26, fallback: 14 },
        { id: '#phone-app-grid-gap', key: 'appGridGap', min: 8, max: 24, fallback: 12 },
        { id: '#phone-dock-icon-size', key: 'dockIconSize', min: 32, max: 72, fallback: 48 },
    ];

    map.forEach(item => {
        const input = container.querySelector(item.id);
        if (!input) return;

        const debouncedSave = createDebouncedTask((raw) => {
            const value = clampNumber(raw, item.min, item.max, item.fallback);
            savePhoneSetting(item.key, value);
        }, 220);

        input.addEventListener('input', () => {
            debouncedSave(input.value);
        });

        input.addEventListener('change', () => {
            debouncedSave.flush?.();
            const value = clampNumber(input.value, item.min, item.max, item.fallback);
            input.value = String(value);
            savePhoneSetting(item.key, value);
            showToast(container, '图标布局已更新');
        });
    });
}

function getLayoutValue(key, fallback) {
    const n = Number(getPhoneSettings()?.[key]);
    return Number.isFinite(n) ? String(Math.round(n)) : String(fallback);
}



// ===== 工具函数 =====

