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
} from './phone-core.js';
import { PHONE_ICONS } from './phone-home.js';
import {
    PHONE_TEMPLATE_TYPE_SPECIAL,
    PHONE_TEMPLATE_TYPE_GENERIC,
    PHONE_BEAUTIFY_TEMPLATE_FORMAT,
    PHONE_BEAUTIFY_TEMPLATE_SCHEMA_VERSION,
    PHONE_BEAUTIFY_TEMPLATE_EXPORT_MODE_ANNOTATED,
    PHONE_BEAUTIFY_TEMPLATE_EXPORT_MODE_RUNTIME,
    getPhoneBeautifyTemplatesByType,
    importPhoneBeautifyPackFromData,
    exportPhoneBeautifyPack,
    deletePhoneBeautifyUserTemplate,
    getActiveBeautifyTemplateIdsForSpecial,
    getActiveBeautifyTemplateIdByType,
    setActiveBeautifyTemplateIdByType,
    validatePhoneBeautifyTemplate,
    savePhoneBeautifyUserTemplate,
} from './phone-beautify-templates.js';
import { createDebouncedTask } from './runtime-manager.js';
import { clampNumber, escapeHtml, escapeHtmlAttr } from './utils.js';
import { cacheSet, cacheGet, cacheRemove, CACHE_STORES } from './cache-manager.js';

const DB_PRESETS_SETTING_KEY = 'dbConfigPresets';
const DB_ACTIVE_PRESET_SETTING_KEY = 'activeDbConfigPreset';
const TEMPLATE_DRAFT_STORE_KEY = '__YUZI_PHONE_TEMPLATE_DRAFT_PATCHES';
const TEMPLATE_DRAFT_EVENT_UPDATED = 'yuzi-phone-style-draft-updated';
const TEMPLATE_DRAFT_EVENT_CLEARED = 'yuzi-phone-style-draft-cleared';

const STORAGE_BUDGETS = Object.freeze({
    backgroundImageBytes: 2 * 1024 * 1024,
    toggleCoverBytes: 1 * 1024 * 1024,
    appIconBytes: 512 * 1024,
    appIconsTotalBytes: 4 * 1024 * 1024,
});

export function renderSettings(container) {
    const state = {
        mode: 'home', // home | appearance | database | beautify | button_style
        databaseScrollTop: 0,
        beautifyEditorTemplateId: '',
        beautifyEditorLoadedTemplateId: '',
        beautifyEditorText: '',
        beautifyEditorError: '',
        beautifyEditorNotice: '',
    };

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

    const captureDatabaseScroll = () => {
        const body = container.querySelector('.phone-app-body.phone-settings-scroll');
        if (!body) return;
        state.databaseScrollTop = Math.max(0, Number(body.scrollTop) || 0);
    };

    const restoreDatabaseScroll = () => {
        const body = container.querySelector('.phone-app-body.phone-settings-scroll');
        if (!body) return;

        const maxTop = Math.max(0, (body.scrollHeight || 0) - (body.clientHeight || 0));
        const nextTop = Math.min(Math.max(0, Number(state.databaseScrollTop) || 0), maxTop);
        body.scrollTop = nextTop;
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
        } else {
            renderHomePage();
        }

        // 设置 App 内部子视图会反复 innerHTML 重渲染，需要每次重绑滚动守卫。
        bindPhoneScrollGuards(container);
    };

    const rerenderDatabaseKeepScroll = () => {
        captureDatabaseScroll();
        render();
        requestAnimationFrame(() => {
            restoreDatabaseScroll();
        });
    };

    const renderHomePage = () => {
        const apiAvailability = getDbConfigApiAvailability();
        const presets = getDbPresets();
        const activePresetName = getActiveDbPresetName();

        const quickPresetOptions = [
            `<option value="" ${!activePresetName ? 'selected' : ''}>当前配置</option>`,
            ...presets.map((preset) => (
                `<option value="${escapeHtmlAttr(preset.name)}" ${preset.name === activePresetName ? 'selected' : ''}>${escapeHtml(preset.name)}</option>`
            )),
        ].join('');

        container.innerHTML = `
            <div class="phone-app-page">
                <div class="phone-nav-bar">
                    <button type="button" class="phone-nav-back">${PHONE_ICONS.back}<span>返回</span></button>
                    <span class="phone-nav-title">设置</span>
                    <button type="button" class="phone-settings-btn" id="phone-top-trigger-update" style="padding:4px 8px; min-height:auto; font-size:12px;">
                        <span>手动更新</span>
                    </button>
                </div>
                <div class="phone-app-body phone-settings-scroll">
                    <div class="phone-settings-home-list">
                        <div class="phone-settings-home-item">
                            <button type="button" class="phone-settings-home-trigger" data-entry="appearance">
                                <span class="phone-settings-home-title">外观设置</span>
                                <span class="phone-settings-home-side">
                                    <span class="phone-settings-home-arrow">›</span>
                                </span>
                            </button>
                        </div>

                        <div class="phone-settings-home-item">
                            <button type="button" class="phone-settings-home-trigger" data-entry="beautify">
                                <span class="phone-settings-home-title">美化模板</span>
                                <span class="phone-settings-home-side">
                                    <span class="phone-settings-home-arrow">›</span>
                                </span>
                            </button>
                        </div>

                        <div class="phone-settings-home-item">
                            <button type="button" class="phone-settings-home-trigger" data-entry="button_style">
                                <span class="phone-settings-home-title">按钮调节</span>
                                <span class="phone-settings-home-side">
                                    <span class="phone-settings-home-arrow">›</span>
                                </span>
                            </button>
                        </div>

                        <div class="phone-settings-home-item">
                            <button type="button" class="phone-settings-home-trigger" data-entry="database">
                                <span class="phone-settings-home-title">数据库配置</span>
                                <span class="phone-settings-home-side">
                                    <span class="phone-settings-home-arrow">›</span>
                                </span>
                            </button>
                            <div class="phone-settings-home-quick" title="快速切换数据库预设">
                                <label class="phone-settings-home-quick-label" for="phone-db-preset-quick-select">预设</label>
                                <select id="phone-db-preset-quick-select" class="phone-settings-home-quick-select" ${apiAvailability.ok ? '' : 'disabled'}>
                                    ${quickPresetOptions}
                                </select>
                            </div>
                        </div>

                        ${apiAvailability.ok
                            ? ''
                            : `<div class="phone-db-api-status is-error">${escapeHtml(apiAvailability.message || '数据库 API 不可用')}</div>`
                        }
                    </div>
                </div>
            </div>
        `;

        container.querySelector('.phone-nav-back')?.addEventListener('click', navigateBack);

        container.querySelectorAll('.phone-settings-home-trigger').forEach((btn) => {
            btn.addEventListener('click', () => {
                const entry = String(btn.dataset.entry || '').trim();
                if (!entry) return;
                state.mode = entry;
                render();
            });
        });

        const quickSelect = container.querySelector('#phone-db-preset-quick-select');
        if (quickSelect) {
            const stopBubble = (e) => e.stopPropagation();
            quickSelect.addEventListener('click', stopBubble);
            quickSelect.addEventListener('mousedown', stopBubble);
            quickSelect.addEventListener('touchstart', stopBubble, { passive: true });

            quickSelect.addEventListener('change', () => {
                const prevActive = getActiveDbPresetName();
                const targetName = String(quickSelect.value || '');
                const ok = switchPresetByName(targetName, container);
                if (!ok) {
                    quickSelect.value = prevActive;
                    return;
                }
                render();
            });
        }

        setupManualUpdateBtn(container, '#phone-top-trigger-update', null);
    };

    const renderAppearancePage = () => {
        container.innerHTML = `
            <div class="phone-app-page">
                <div class="phone-nav-bar">
                    <button type="button" class="phone-nav-back">${PHONE_ICONS.back}<span>返回</span></button>
                    <span class="phone-nav-title">外观设置</span>
                </div>
                <div class="phone-app-body phone-settings-scroll phone-settings-open">
                    <section class="phone-settings-section">
                        <div class="phone-settings-section-head">
                            <span class="phone-settings-section-title">手机背景</span>
                        </div>
                        <div class="phone-settings-inline-row">
                            <span class="phone-settings-label">背景图片</span>
                            <div class="phone-settings-action">
                                <button type="button" class="phone-settings-btn" id="phone-upload-bg">
                                    ${PHONE_ICONS.upload}
                                    <span>上传</span>
                                </button>
                                <button type="button" class="phone-settings-btn phone-settings-btn-danger" id="phone-clear-bg">清除</button>
                            </div>
                        </div>
                        <div id="phone-bg-preview" class="phone-settings-preview"></div>
                    </section>

                    <section class="phone-settings-section">
                        <div class="phone-settings-section-head">
                            <span class="phone-settings-section-title">图标布局</span>
                        </div>
                        <div class="phone-settings-layout-grid">
                            <label class="phone-settings-field-inline">
                                <span>每行图标</span>
                                <input type="number" min="3" max="6" id="phone-app-grid-columns" class="phone-settings-input" value="${escapeHtmlAttr(getLayoutValue('appGridColumns', 4))}">
                            </label>
                            <label class="phone-settings-field-inline">
                                <span>图标大小</span>
                                <input type="number" min="40" max="88" id="phone-app-icon-size" class="phone-settings-input" value="${escapeHtmlAttr(getLayoutValue('appIconSize', 60))}">
                            </label>
                            <label class="phone-settings-field-inline">
                                <span>圆角</span>
                                <input type="number" min="6" max="26" id="phone-app-icon-radius" class="phone-settings-input" value="${escapeHtmlAttr(getLayoutValue('appIconRadius', 14))}">
                            </label>
                            <label class="phone-settings-field-inline">
                                <span>图标间距</span>
                                <input type="number" min="8" max="24" id="phone-app-grid-gap" class="phone-settings-input" value="${escapeHtmlAttr(getLayoutValue('appGridGap', 12))}">
                            </label>
                            <label class="phone-settings-field-inline">
                                <span>Dock 图标大小</span>
                                <input type="number" min="32" max="72" id="phone-dock-icon-size" class="phone-settings-input" value="${escapeHtmlAttr(getLayoutValue('dockIconSize', 48))}">
                            </label>
                        </div>
                    </section>

                    <section class="phone-settings-section">
                        <div class="phone-settings-section-head">
                            <span class="phone-settings-section-title">表格图标显示控制</span>
                        </div>
                        <div class="phone-appearance-switch-list">
                            <label class="phone-appearance-switch-item" for="phone-hide-table-count-badge">
                                <span class="phone-appearance-switch-main">隐藏数量徽标</span>
                                <input type="checkbox" id="phone-hide-table-count-badge" class="phone-settings-switch" ${getPhoneSettings().hideTableCountBadge ? 'checked' : ''}>
                            </label>
                        </div>
                    </section>

                    <section class="phone-settings-section">
                        <div class="phone-settings-section-head">
                            <span class="phone-settings-section-title">屏蔽表格类 App 图标</span>
                        </div>
                        <div id="phone-hidden-table-apps" class="phone-appearance-checklist"></div>
                    </section>

                    <section class="phone-settings-section">
                        <div class="phone-settings-section-head">
                            <span class="phone-settings-section-title">自定义 App 图标</span>
                        </div>
                        <div id="phone-icon-upload-list" class="phone-icon-upload-list"></div>
                    </section>
                </div>
            </div>
        `;

        container.querySelector('.phone-nav-back')?.addEventListener('click', () => {
            state.mode = 'home';
            render();
        });

        setupBgUpload(container);
        setupIconLayoutSettings(container);
        setupAppearanceToggles(container);
        renderHiddenTableAppsList(container.querySelector('#phone-hidden-table-apps'));
        renderIconUploadList(container.querySelector('#phone-icon-upload-list'));
    };

    const renderDatabasePage = () => {
        const apiAvailability = getDbConfigApiAvailability();
        const dbState = readDbSnapshot();
        const snapshot = dbState.snapshot;

        const rawData = getTableData();
        const sheetKeys = getSheetKeys(rawData);
        const tableEntries = sheetKeys.map((sheetKey) => ({
            key: sheetKey,
            name: String(rawData?.[sheetKey]?.name || sheetKey),
        }));

        const manualSelection = normalizeDbManualSelection(snapshot.manualSelection);
        const selectedSet = manualSelection.hasManualSelection
            ? new Set(manualSelection.selectedTables)
            : new Set(tableEntries.map(it => it.key));

        const presets = getDbPresets();
        const activePresetName = getActiveDbPresetName();

        const presetOptions = [
            `<option value="" ${!activePresetName ? 'selected' : ''}>当前配置（未绑定预设）</option>`,
            ...presets.map((preset) => (
                `<option value="${escapeHtmlAttr(preset.name)}" ${preset.name === activePresetName ? 'selected' : ''}>${escapeHtml(preset.name)}</option>`
            )),
        ].join('');

        const tableChecklistHtml = tableEntries.length === 0
            ? '<div class="phone-empty-msg"></div>'
            : tableEntries.map((item) => `
                <label class="phone-db-table-item" data-sheet-key="${escapeHtmlAttr(item.key)}">
                    <span class="phone-db-table-name">${escapeHtml(item.name)}</span>
                    <input type="checkbox" class="phone-settings-switch" ${selectedSet.has(item.key) ? 'checked' : ''} ${apiAvailability.ok ? '' : 'disabled'}>
                </label>
            `).join('');

        const manualSelectionMeta = tableEntries.length === 0
            ? '当前没有可选表格'
            : (!manualSelection.hasManualSelection
                ? `当前模式：默认全选（${tableEntries.length} 项）`
                : `当前手动选择 ${manualSelection.selectedTables.length} / ${tableEntries.length} 项`);

        const updateConfig = normalizeDbUpdateConfig(snapshot.updateConfig);
        const disabledAttr = apiAvailability.ok ? '' : 'disabled';

        container.innerHTML = `
            <div class="phone-app-page">
                <div class="phone-nav-bar">
                    <button type="button" class="phone-nav-back">${PHONE_ICONS.back}<span>返回</span></button>
                    <span class="phone-nav-title">数据库配置</span>
                    <button type="button" class="phone-settings-btn" id="phone-db-refresh-btn" style="padding:4px 8px; min-height:auto; font-size:12px;">
                        <span>刷新</span>
                    </button>
                </div>

                <div class="phone-app-body phone-settings-scroll phone-settings-open">
                    <section class="phone-settings-section">
                        <div class="phone-settings-section-head">
                            <span class="phone-settings-section-title">接口状态</span>
                        </div>
                        <p class="phone-settings-desc">当前页面严格使用 AutoCardUpdaterAPI 的数据库配置接口读写数据。</p>
                        <div class="phone-db-api-status ${apiAvailability.ok ? 'is-ok' : 'is-error'}">${escapeHtml(apiAvailability.message || '')}</div>
                    </section>

                    <section class="phone-settings-section" id="phone-db-preset-section">
                        <div class="phone-settings-section-head">
                            <span class="phone-settings-section-title">预设配置</span>
                        </div>
                        <p class="phone-settings-desc">预设包含“更新配置参数 + 手动更新表选择”全部参数。切换后会立即同步到数据库配置。</p>

                        <div class="phone-db-preset-grid">
                            <label class="phone-settings-field-inline phone-settings-field-full">
                                <span>切换预设</span>
                                <select id="phone-db-preset-select" class="phone-settings-input" ${disabledAttr}>
                                    ${presetOptions}
                                </select>
                            </label>

                            <label class="phone-settings-field-inline phone-settings-field-full">
                                <span>预设名称</span>
                                <input id="phone-db-preset-name" class="phone-settings-input" value="${escapeHtmlAttr(activePresetName)}" placeholder="输入新预设名" ${disabledAttr}>
                            </label>
                        </div>

                        <div class="phone-settings-action phone-settings-action-wrap">
                            <button type="button" class="phone-settings-btn" id="phone-db-preset-save-btn" ${disabledAttr}>保存为新预设</button>
                            <button type="button" class="phone-settings-btn" id="phone-db-preset-overwrite-btn" ${disabledAttr}>覆盖同名预设</button>
                            <button type="button" class="phone-settings-btn phone-settings-btn-danger" id="phone-db-preset-delete-btn" ${disabledAttr}>删除当前预设</button>
                        </div>

                        <div class="phone-settings-desc" id="phone-db-preset-current-meta">当前激活：${activePresetName ? escapeHtml(activePresetName) : '未绑定预设'}</div>
                    </section>

                    <section class="phone-settings-section" id="phone-db-update-config-section">
                        <div class="phone-settings-section-head">
                            <span class="phone-settings-section-title">更新配置</span>
                        </div>
                        <div class="phone-db-field-grid">
                            <label class="phone-settings-field-inline">
                                <span>AI读取上下文层数</span>
                                <input type="number" min="0" step="1" id="phone-db-auto-update-threshold" class="phone-settings-input" value="${escapeHtmlAttr(updateConfig.autoUpdateThreshold)}" ${disabledAttr}>
                            </label>
                            <label class="phone-settings-field-inline">
                                <span>每N层自动更新一次</span>
                                <input type="number" min="1" step="1" id="phone-db-auto-update-frequency" class="phone-settings-input" value="${escapeHtmlAttr(updateConfig.autoUpdateFrequency)}" ${disabledAttr}>
                            </label>
                            <label class="phone-settings-field-inline">
                                <span>每批次更新楼层数</span>
                                <input type="number" min="1" step="1" id="phone-db-update-batch-size" class="phone-settings-input" value="${escapeHtmlAttr(updateConfig.updateBatchSize)}" ${disabledAttr}>
                            </label>
                            <label class="phone-settings-field-inline">
                                <span>保留X层楼不更新</span>
                                <input type="number" min="0" step="1" id="phone-db-auto-update-token-threshold" class="phone-settings-input" value="${escapeHtmlAttr(updateConfig.autoUpdateTokenThreshold)}" ${disabledAttr}>
                            </label>
                        </div>

                        <div class="phone-settings-action phone-settings-action-wrap">
                            <button type="button" class="phone-settings-btn" id="phone-db-update-config-save-btn" ${disabledAttr}>保存更新配置</button>
                            <button type="button" class="phone-settings-btn" id="phone-db-update-config-reload-btn" ${disabledAttr}>重新读取</button>
                        </div>
                    </section>

                    <section class="phone-settings-section" id="phone-db-manual-selection-section">
                        <div class="phone-settings-section-head">
                            <span class="phone-settings-section-title">手动更新表选择</span>
                        </div>
                        <p class="phone-settings-desc">${escapeHtml(manualSelectionMeta)}</p>

                        <div class="phone-db-table-checklist" id="phone-db-table-checklist">
                            ${tableChecklistHtml}
                        </div>

                        <div class="phone-settings-action phone-settings-action-wrap">
                            <button type="button" class="phone-settings-btn" id="phone-db-manual-check-all-btn" ${tableEntries.length > 0 && apiAvailability.ok ? '' : 'disabled'}>全选</button>
                            <button type="button" class="phone-settings-btn" id="phone-db-manual-invert-btn" ${tableEntries.length > 0 && apiAvailability.ok ? '' : 'disabled'}>反选</button>
                            <button type="button" class="phone-settings-btn" id="phone-db-manual-save-btn" ${tableEntries.length > 0 && apiAvailability.ok ? '' : 'disabled'}>保存选择</button>
                            <button type="button" class="phone-settings-btn phone-settings-btn-danger" id="phone-db-manual-reset-btn" ${tableEntries.length > 0 && apiAvailability.ok ? '' : 'disabled'}>恢复默认全选</button>
                        </div>
                    </section>
                </div>
            </div>
        `;

        container.querySelector('.phone-nav-back')?.addEventListener('click', () => {
            state.mode = 'home';
            render();
        });

        container.querySelector('#phone-db-refresh-btn')?.addEventListener('click', () => {
            rerenderDatabaseKeepScroll();
            showToast(container, '数据库配置已刷新');
        });

        const presetSelect = container.querySelector('#phone-db-preset-select');
        const presetNameInput = container.querySelector('#phone-db-preset-name');

        presetSelect?.addEventListener('change', () => {
            const previousActive = getActiveDbPresetName();
            const targetName = String(presetSelect.value || '');
            const ok = switchPresetByName(targetName, container);
            if (!ok) {
                presetSelect.value = previousActive;
                return;
            }
            rerenderDatabaseKeepScroll();
        });

        presetNameInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                container.querySelector('#phone-db-preset-save-btn')?.click();
            }
        });

        container.querySelector('#phone-db-preset-save-btn')?.addEventListener('click', () => {
            const name = String(presetNameInput?.value || '').trim();
            if (!name) {
                showToast(container, '请输入预设名称', true);
                return;
            }

            const presetsNow = getDbPresets();
            if (presetsNow.some(it => it.name === name)) {
                showToast(container, '同名预设已存在，请使用“覆盖同名预设”', true);
                return;
            }

            const current = readDbSnapshot();
            if (!current.ready) {
                showToast(container, current.apiAvailability?.message || '数据库接口不可用，无法保存预设', true);
                return;
            }

            const next = [...presetsNow, createDbPreset(name, current.snapshot)];
            saveDbPresets(next);
            setActiveDbPresetName(name);
            showToast(container, `预设“${name}”已创建并激活`);
            rerenderDatabaseKeepScroll();
        });

        container.querySelector('#phone-db-preset-overwrite-btn')?.addEventListener('click', () => {
            const typedName = String(presetNameInput?.value || '').trim();
            const selectedName = String(presetSelect?.value || '').trim();
            const targetName = typedName || selectedName;

            if (!targetName) {
                showToast(container, '请先输入或选择要覆盖的预设名', true);
                return;
            }

            const presetsNow = getDbPresets();
            const idx = presetsNow.findIndex(it => it.name === targetName);
            if (idx < 0) {
                showToast(container, `未找到预设：${targetName}`, true);
                return;
            }

            const confirmed = window.confirm(`确定覆盖预设“${targetName}”？`);
            if (!confirmed) return;

            const current = readDbSnapshot();
            if (!current.ready) {
                showToast(container, current.apiAvailability?.message || '数据库接口不可用，无法覆盖预设', true);
                return;
            }

            const nextPresets = [...presetsNow];
            nextPresets[idx] = createDbPreset(targetName, current.snapshot);
            saveDbPresets(nextPresets);
            setActiveDbPresetName(targetName);
            showToast(container, `预设“${targetName}”已覆盖`);
            rerenderDatabaseKeepScroll();
        });

        container.querySelector('#phone-db-preset-delete-btn')?.addEventListener('click', () => {
            const selectedName = String(presetSelect?.value || '').trim();
            if (!selectedName) {
                showToast(container, '当前未选择可删除的预设', true);
                return;
            }

            const confirmed = window.confirm(`确定删除预设“${selectedName}”？`);
            if (!confirmed) return;

            const presetsNow = getDbPresets();
            const filtered = presetsNow.filter(it => it.name !== selectedName);
            if (filtered.length === presetsNow.length) {
                showToast(container, `未找到预设：${selectedName}`, true);
                return;
            }

            saveDbPresets(filtered);
            if (getActiveDbPresetName() === selectedName) {
                setActiveDbPresetName('');
            }
            showToast(container, `预设“${selectedName}”已删除`);
            rerenderDatabaseKeepScroll();
        });

        container.querySelector('#phone-db-update-config-save-btn')?.addEventListener('click', () => {
            const payload = {
                autoUpdateThreshold: clampNumber(container.querySelector('#phone-db-auto-update-threshold')?.value, 0, 999999, 3),
                autoUpdateFrequency: clampNumber(container.querySelector('#phone-db-auto-update-frequency')?.value, 1, 999999, 1),
                updateBatchSize: clampNumber(container.querySelector('#phone-db-update-batch-size')?.value, 1, 999999, 2),
                autoUpdateTokenThreshold: clampNumber(container.querySelector('#phone-db-auto-update-token-threshold')?.value, 0, 99999999, 0),
            };

            const result = writeDbUpdateConfigViaApi(payload);
            if (!result.ok) {
                showToast(container, result.message || '更新配置保存失败', true);
                return;
            }

            const cleared = clearActivePresetBindingIfNeeded();
            showToast(container, cleared ? '更新配置已保存，已解除预设绑定' : '更新配置已保存');
            rerenderDatabaseKeepScroll();
        });

        container.querySelector('#phone-db-update-config-reload-btn')?.addEventListener('click', () => {
            rerenderDatabaseKeepScroll();
            showToast(container, '已重新读取数据库更新配置');
        });

        const checklist = container.querySelector('#phone-db-table-checklist');
        const getChecklistBoxes = () => Array.from(checklist?.querySelectorAll('.phone-db-table-item input[type="checkbox"]') || []);

        container.querySelector('#phone-db-manual-check-all-btn')?.addEventListener('click', () => {
            getChecklistBoxes().forEach(cb => { cb.checked = true; });
        });

        container.querySelector('#phone-db-manual-invert-btn')?.addEventListener('click', () => {
            getChecklistBoxes().forEach(cb => { cb.checked = !cb.checked; });
        });

        container.querySelector('#phone-db-manual-save-btn')?.addEventListener('click', () => {
            const rows = Array.from(checklist?.querySelectorAll('.phone-db-table-item') || []);
            const selectedKeys = rows
                .filter((row) => row.querySelector('input[type="checkbox"]')?.checked)
                .map((row) => String(row.getAttribute('data-sheet-key') || '').trim())
                .filter(Boolean);

            if (rows.length === 0) {
                showToast(container, '当前没有可保存的表格项', true);
                return;
            }

            const result = selectedKeys.length === rows.length
                ? clearManualTableSelectionViaApi()
                : writeManualTableSelectionViaApi(selectedKeys);

            if (!result.ok) {
                showToast(container, result.message || '手动更新表选择保存失败', true);
                return;
            }

            const cleared = clearActivePresetBindingIfNeeded();
            showToast(container, cleared ? '手动表选择已保存，已解除预设绑定' : '手动表选择已保存');
            rerenderDatabaseKeepScroll();
        });

        container.querySelector('#phone-db-manual-reset-btn')?.addEventListener('click', () => {
            const result = clearManualTableSelectionViaApi();
            if (!result.ok) {
                showToast(container, result.message || '恢复默认全选失败', true);
                return;
            }

            const cleared = clearActivePresetBindingIfNeeded();
            showToast(container, cleared ? '已恢复默认全选，已解除预设绑定' : '已恢复默认全选');
            rerenderDatabaseKeepScroll();
        });
    };

    const renderButtonStylePage = () => {
        const settings = getPhoneSettings();
        const currentSize = clampNumber(settings.phoneToggleStyleSize, 32, 72, 44);
        const currentShape = String(settings.phoneToggleStyleShape || 'rounded') === 'circle' ? 'circle' : 'rounded';
        const currentCover = typeof settings.phoneToggleCoverImage === 'string' && settings.phoneToggleCoverImage.trim()
            ? settings.phoneToggleCoverImage.trim()
            : '';

        container.innerHTML = `
            <div class="phone-app-page">
                <div class="phone-nav-bar">
                    <button type="button" class="phone-nav-back">${PHONE_ICONS.back}<span>返回</span></button>
                    <span class="phone-nav-title">按钮调节</span>
                </div>
                <div class="phone-app-body phone-settings-scroll phone-settings-open">
                    <section class="phone-settings-section">
                        <div class="phone-settings-section-head">
                            <span class="phone-settings-section-title">按钮大小</span>
                        </div>
                        <div class="phone-settings-toggle-size-row">
                            <input type="range" min="32" max="72" step="1" id="phone-toggle-style-size-range" value="${escapeHtmlAttr(currentSize)}">
                            <input type="number" min="32" max="72" step="1" id="phone-toggle-style-size-input" class="phone-settings-input" value="${escapeHtmlAttr(currentSize)}">
                        </div>
                        <p class="phone-settings-desc">建议范围 36~56，移动端默认 44。</p>
                    </section>

                    <section class="phone-settings-section">
                        <div class="phone-settings-section-head">
                            <span class="phone-settings-section-title">按钮形状</span>
                        </div>
                        <div class="phone-toggle-shape-list" id="phone-toggle-shape-list">
                            <label class="phone-toggle-shape-item">
                                <span class="phone-toggle-shape-name">长方形</span>
                                <input type="radio" name="phone-toggle-shape" value="rounded" ${currentShape === 'rounded' ? 'checked' : ''}>
                            </label>
                            <label class="phone-toggle-shape-item">
                                <span class="phone-toggle-shape-name">圆形（仅显示图标）</span>
                                <input type="radio" name="phone-toggle-shape" value="circle" ${currentShape === 'circle' ? 'checked' : ''}>
                            </label>
                        </div>
                    </section>

                    <section class="phone-settings-section">
                        <div class="phone-settings-section-head">
                            <span class="phone-settings-section-title">按钮封面</span>
                        </div>
                        <div class="phone-settings-action">
                            <button type="button" class="phone-settings-btn" id="phone-toggle-cover-upload-btn">
                                ${PHONE_ICONS.upload}
                                <span>上传封面</span>
                            </button>
                            <button type="button" class="phone-settings-btn phone-settings-btn-danger" id="phone-toggle-cover-clear-btn" ${currentCover ? '' : 'disabled'}>清除封面</button>
                        </div>
                        <div id="phone-toggle-cover-preview" class="phone-settings-preview">
                            ${currentCover ? `<img src="${escapeHtmlAttr(currentCover)}" class="phone-bg-thumb" alt="按钮封面预览">` : '<div class="phone-empty-msg">未设置封面</div>'}
                        </div>
                        <p class="phone-settings-desc">封面采用 cover 裁剪以保持视觉完整性。</p>
                    </section>

                    <section class="phone-settings-section">
                        <div class="phone-settings-action">
                            <button type="button" class="phone-settings-btn" id="phone-toggle-style-reset-btn">恢复默认</button>
                        </div>
                    </section>
                </div>
            </div>
        `;

        container.querySelector('.phone-nav-back')?.addEventListener('click', () => {
            state.mode = 'home';
            render();
        });

        const sizeRange = container.querySelector('#phone-toggle-style-size-range');
        const sizeInput = container.querySelector('#phone-toggle-style-size-input');
        const shapeRadios = Array.from(container.querySelectorAll('input[name="phone-toggle-shape"]'));
        const uploadBtn = container.querySelector('#phone-toggle-cover-upload-btn');
        const clearBtn = container.querySelector('#phone-toggle-cover-clear-btn');
        const preview = container.querySelector('#phone-toggle-cover-preview');

        const emitToggleStyleUpdated = () => {
            window.dispatchEvent(new CustomEvent('yuzi-phone-toggle-style-updated'));
        };

        const saveToggleSizeDebounced = createDebouncedTask((next) => {
            savePhoneSetting('phoneToggleStyleSize', next);
            emitToggleStyleUpdated();
        }, 180);

        const setSizeValue = (raw, withToast = false, immediate = false) => {
            const next = clampNumber(raw, 32, 72, 44);
            if (sizeRange) sizeRange.value = String(next);
            if (sizeInput) sizeInput.value = String(next);

            if (immediate) {
                saveToggleSizeDebounced.cancel?.();
                savePhoneSetting('phoneToggleStyleSize', next);
                emitToggleStyleUpdated();
            } else {
                saveToggleSizeDebounced(next);
            }

            if (withToast) showToast(container, `按钮大小已调整为 ${next}px`);
        };

        sizeRange?.addEventListener('input', () => {
            setSizeValue(sizeRange.value, false, false);
        });

        sizeInput?.addEventListener('input', () => {
            setSizeValue(sizeInput.value, false, false);
        });

        sizeInput?.addEventListener('change', () => {
            setSizeValue(sizeInput.value, true, true);
        });

        shapeRadios.forEach((radio) => {
            radio.addEventListener('change', () => {
                const nextShape = radio.checked && radio.value === 'circle' ? 'circle' : 'rounded';
                savePhoneSetting('phoneToggleStyleShape', nextShape);
                emitToggleStyleUpdated();
                showToast(container, nextShape === 'circle' ? '按钮已切换为圆形（文字已隐藏）' : '按钮已切换为长方形');
            });
        });

        uploadBtn?.addEventListener('click', () => {
            pickImageFile((dataUrl) => {
                const safeDataUrl = String(dataUrl || '').trim();
                if (!safeDataUrl) {
                    showToast(container, '封面读取失败：空数据', true);
                    return;
                }

                if (estimateBase64Bytes(safeDataUrl) > STORAGE_BUDGETS.toggleCoverBytes) {
                    showToast(container, `按钮封面过大（>${Math.round(STORAGE_BUDGETS.toggleCoverBytes / 1024 / 1024)}MB）`, true);
                    return;
                }

                savePhoneSetting('phoneToggleCoverImage', safeDataUrl);
                emitToggleStyleUpdated();
                if (preview) {
                    preview.innerHTML = `<img src="${escapeHtmlAttr(safeDataUrl)}" class="phone-bg-thumb" alt="按钮封面预览">`;
                }
                if (clearBtn instanceof HTMLButtonElement) {
                    clearBtn.disabled = false;
                }
                showToast(container, '按钮封面已更新');
            }, {
                maxSizeMB: 8,
                onError: (msg) => showToast(container, msg || '按钮封面上传失败', true),
            });
        });

        clearBtn?.addEventListener('click', () => {
            savePhoneSetting('phoneToggleCoverImage', null);
            emitToggleStyleUpdated();
            if (preview) {
                preview.innerHTML = '<div class="phone-empty-msg">未设置封面</div>';
            }
            if (clearBtn instanceof HTMLButtonElement) {
                clearBtn.disabled = true;
            }
            showToast(container, '按钮封面已清除');
        });

        container.querySelector('#phone-toggle-style-reset-btn')?.addEventListener('click', () => {
            savePhoneSettingsPatch({
                phoneToggleStyleSize: 44,
                phoneToggleStyleShape: 'rounded',
                phoneToggleCoverImage: null,
            });
            emitToggleStyleUpdated();
            showToast(container, '按钮样式已恢复默认');
            renderButtonStylePage();
        });
    };

    const renderBeautifyTemplatePage = () => {
        const allSpecialTemplates = getPhoneBeautifyTemplatesByType(PHONE_TEMPLATE_TYPE_SPECIAL, {
            includeBuiltin: true,
            includeUser: true,
            enabledOnly: true,
        });
        const allGenericTemplates = getPhoneBeautifyTemplatesByType(PHONE_TEMPLATE_TYPE_GENERIC, {
            includeBuiltin: true,
            includeUser: true,
            enabledOnly: true,
        });

        const allTemplates = [...allSpecialTemplates, ...allGenericTemplates];

        const activeSpecialMap = getActiveBeautifyTemplateIdsForSpecial({ withFallback: true, persist: true });
        const activeGenericTemplateId = getActiveBeautifyTemplateIdByType(PHONE_TEMPLATE_TYPE_GENERIC, {
            withFallback: true,
            persist: true,
        });

        const getSpecialRendererLabel = (rendererKey) => {
            const key = String(rendererKey || '');
            if (key === 'special_message') return '消息记录';
            if (key === 'special_moments') return '动态';
            if (key === 'special_forum') return '论坛';
            return '专属';
        };

        const getTemplateDraftStore = () => {
            try {
                const host = window;
                if (!host[TEMPLATE_DRAFT_STORE_KEY] || typeof host[TEMPLATE_DRAFT_STORE_KEY] !== 'object') {
                    host[TEMPLATE_DRAFT_STORE_KEY] = {};
                }
                return host[TEMPLATE_DRAFT_STORE_KEY];
            } catch {
                return {};
            }
        };

        const emitDraftUpdated = (templateId) => {
            window.dispatchEvent(new CustomEvent(TEMPLATE_DRAFT_EVENT_UPDATED, {
                detail: {
                    templateId,
                    from: 'phone-settings',
                },
            }));
        };

        const emitDraftCleared = (templateId) => {
            window.dispatchEvent(new CustomEvent(TEMPLATE_DRAFT_EVENT_CLEARED, {
                detail: {
                    templateId,
                    from: 'phone-settings',
                },
            }));
        };

        const getTemplateById = (templateId) => {
            const safeId = String(templateId || '').trim();
            if (!safeId) return null;
            return allTemplates.find(t => t.id === safeId) || null;
        };

        const ensureEditorStateByTemplate = (template) => {
            const safeTemplateId = String(template?.id || '').trim();
            if (!safeTemplateId) return;

            if (state.beautifyEditorTemplateId !== safeTemplateId) {
                state.beautifyEditorTemplateId = safeTemplateId;
            }

            if (state.beautifyEditorLoadedTemplateId === safeTemplateId && state.beautifyEditorText) {
                return;
            }

            const exported = exportPhoneBeautifyPack({
                templateIds: [safeTemplateId],
                exportMode: PHONE_BEAUTIFY_TEMPLATE_EXPORT_MODE_ANNOTATED,
            });

            const payload = exported?.pack?.templates?.[0];
            state.beautifyEditorText = payload
                ? JSON.stringify(payload, null, 2)
                : '{}';
            state.beautifyEditorLoadedTemplateId = safeTemplateId;
            state.beautifyEditorError = '';
            state.beautifyEditorNotice = '';
        };

        const clearEditorState = () => {
            state.beautifyEditorTemplateId = '';
            state.beautifyEditorLoadedTemplateId = '';
            state.beautifyEditorText = '';
            state.beautifyEditorError = '';
            state.beautifyEditorNotice = '';
        };

        const parseEditorTemplateText = () => {
            const rawText = String(state.beautifyEditorText || '').trim();
            if (!rawText) {
                return {
                    ok: false,
                    error: 'JSON 不能为空',
                    template: null,
                };
            }

            let parsed = null;
            try {
                parsed = JSON.parse(rawText);
            } catch (e) {
                return {
                    ok: false,
                    error: `JSON 解析失败：${e?.message || '未知错误'}`,
                    template: null,
                };
            }

            const validated = validatePhoneBeautifyTemplate(parsed);
            if (!validated.ok || !validated.template) {
                return {
                    ok: false,
                    error: validated.errors?.[0] || '模板结构校验失败',
                    template: null,
                };
            }

            return {
                ok: true,
                error: '',
                template: validated.template,
                warnings: validated.warnings || [],
            };
        };

        const summarizeMatcher = (matcher) => {
            const src = matcher && typeof matcher === 'object' ? matcher : {};
            const chunks = [];

            const exact = Array.isArray(src.tableNameExact) ? src.tableNameExact.filter(Boolean) : [];
            const required = Array.isArray(src.requiredHeaders) ? src.requiredHeaders.filter(Boolean) : [];
            const optional = Array.isArray(src.optionalHeaders) ? src.optionalHeaders.filter(Boolean) : [];

            if (exact.length > 0) {
                chunks.push(`表名: ${escapeHtml(exact.slice(0, 3).join(' / '))}${exact.length > 3 ? '…' : ''}`);
            }
            if (required.length > 0) {
                chunks.push(`必需列: ${escapeHtml(required.slice(0, 4).join(' / '))}${required.length > 4 ? '…' : ''}`);
            }
            if (optional.length > 0) {
                chunks.push(`可选列: ${escapeHtml(optional.slice(0, 3).join(' / '))}${optional.length > 3 ? '…' : ''}`);
            }

            return chunks.join(' · ') || '未配置明显匹配特征';
        };

        const renderTemplateListHtml = (templates, config = {}) => {
            const {
                emptyText = '暂无模板',
                type = PHONE_TEMPLATE_TYPE_SPECIAL,
                activeSpecialRendererMap = {},
                activeGenericId = '',
            } = config;

            if (!templates || templates.length === 0) {
                return `<div class="phone-empty-msg">${escapeHtml(emptyText)}</div>`;
            }

            return templates.map((template) => {
                const isBuiltin = template.source === 'builtin';
                const sourceText = isBuiltin ? '内置默认' : '用户导入';
                const badgeClass = isBuiltin ? 'is-builtin' : 'is-user';
                const updatedAt = Number(template.meta?.updatedAt || 0);
                const dateText = Number.isFinite(updatedAt) && updatedAt > 0
                    ? new Date(updatedAt).toLocaleString('zh-CN', { hour12: false })
                    : '未知时间';

                const rendererKey = String(template?.render?.rendererKey || '');
                const isSpecial = type === PHONE_TEMPLATE_TYPE_SPECIAL;
                const groupName = isSpecial
                    ? `phone-beautify-active-special-${rendererKey || 'unknown'}`
                    : 'phone-beautify-active-generic';

                const checked = isSpecial
                    ? String(activeSpecialRendererMap[rendererKey] || '') === template.id
                    : String(activeGenericId || '') === template.id;

                const targetLabel = isSpecial
                    ? getSpecialRendererLabel(rendererKey)
                    : '通用表格';

                const editBtn = isBuiltin
                    ? ''
                    : `<button type="button" class="phone-settings-btn phone-beautify-edit-one" data-template-id="${escapeHtmlAttr(template.id)}">高级编辑</button>`;

                return `
                    <div class="phone-beautify-item" data-template-id="${escapeHtmlAttr(template.id)}" data-template-type="${escapeHtmlAttr(type)}" data-template-renderer="${escapeHtmlAttr(rendererKey)}">
                        <div class="phone-beautify-item-main">
                            <div class="phone-beautify-item-title-row">
                                <span class="phone-beautify-item-title">${escapeHtml(template.name)}</span>
                                <span class="phone-beautify-item-badge ${badgeClass}">${sourceText}</span>
                            </div>
                            <div class="phone-beautify-item-meta">ID: ${escapeHtml(template.id)} · 目标: ${escapeHtml(targetLabel)} · 更新时间: ${escapeHtml(dateText)}</div>
                            <div class="phone-beautify-item-matcher">${summarizeMatcher(template.matcher)}</div>
                        </div>
                        <div class="phone-beautify-item-actions">
                            <label class="phone-beautify-pick-radio" title="勾选即启用该模板">
                                <input type="radio" class="phone-beautify-active-radio" data-template-id="${escapeHtmlAttr(template.id)}" data-template-type="${escapeHtmlAttr(type)}" name="${escapeHtmlAttr(groupName)}" ${checked ? 'checked' : ''}>
                                <span>启用</span>
                            </label>
                            ${editBtn}
                            <button type="button" class="phone-settings-btn phone-beautify-export-one" data-template-id="${escapeHtmlAttr(template.id)}">导出</button>
                            ${isBuiltin
                                ? ''
                                : `<button type="button" class="phone-settings-btn phone-settings-btn-danger phone-beautify-delete-one" data-template-id="${escapeHtmlAttr(template.id)}">删除</button>`}
                        </div>
                    </div>
                `;
            }).join('');
        };

        const specialListHtml = renderTemplateListHtml(allSpecialTemplates, {
            emptyText: '暂无专属小剧场模板',
            type: PHONE_TEMPLATE_TYPE_SPECIAL,
            activeSpecialRendererMap: activeSpecialMap,
            activeGenericId: activeGenericTemplateId,
        });
        const genericListHtml = renderTemplateListHtml(allGenericTemplates, {
            emptyText: '暂无通用表格模板',
            type: PHONE_TEMPLATE_TYPE_GENERIC,
            activeSpecialRendererMap: activeSpecialMap,
            activeGenericId: activeGenericTemplateId,
        });

        const activeSpecialSummary = ['special_message', 'special_moments', 'special_forum']
            .map((key) => {
                const activeId = String(activeSpecialMap[key] || '');
                if (!activeId) return `${getSpecialRendererLabel(key)}: 未启用`;
                const hit = allSpecialTemplates.find(t => t.id === activeId);
                return `${getSpecialRendererLabel(key)}: ${hit?.name || activeId}`;
            })
            .join('；');
        const activeGenericSummary = (() => {
            if (!activeGenericTemplateId) return '未启用';
            const hit = allGenericTemplates.find(t => t.id === activeGenericTemplateId);
            return hit?.name || activeGenericTemplateId;
        })();

        const currentEditorTemplate = getTemplateById(state.beautifyEditorTemplateId);
        if (!currentEditorTemplate) {
            clearEditorState();
        } else {
            ensureEditorStateByTemplate(currentEditorTemplate);
        }

        const editorVisible = !!state.beautifyEditorTemplateId && !!currentEditorTemplate;
        const editorErrorHtml = state.beautifyEditorError
            ? `<div class="phone-beautify-editor-status is-error">${escapeHtml(state.beautifyEditorError)}</div>`
            : '';
        const editorNoticeHtml = state.beautifyEditorNotice
            ? `<div class="phone-beautify-editor-status is-ok">${escapeHtml(state.beautifyEditorNotice)}</div>`
            : '';

        const editorSectionHtml = editorVisible
            ? `
                <section class="phone-settings-section" id="phone-beautify-editor-section">
                    <div class="phone-settings-section-head">
                        <span class="phone-settings-section-title">高级 JSON 编辑器</span>
                    </div>
                    <p class="phone-settings-desc">当前编辑：${escapeHtml(currentEditorTemplate.name)}（${escapeHtml(currentEditorTemplate.id)}）</p>
                    <p class="phone-settings-desc">说明：预览仅写入内存草稿，不会自动覆盖正式模板。保存后才写入用户模板仓库。</p>
                    ${editorErrorHtml}
                    ${editorNoticeHtml}
                    <textarea id="phone-beautify-editor-json" class="phone-beautify-editor-textarea" spellcheck="false">${escapeHtml(state.beautifyEditorText || '')}</textarea>
                    <div class="phone-settings-action phone-settings-action-wrap phone-beautify-editor-actions">
                        <button type="button" class="phone-settings-btn" id="phone-beautify-editor-preview-btn">应用草稿预览</button>
                        <button type="button" class="phone-settings-btn" id="phone-beautify-editor-clear-preview-btn">清除草稿</button>
                        <button type="button" class="phone-settings-btn" id="phone-beautify-editor-save-btn">保存模板</button>
                        <button type="button" class="phone-settings-btn phone-settings-btn-danger" id="phone-beautify-editor-close-btn">关闭编辑器</button>
                    </div>
                </section>
            `
            : '';

        container.innerHTML = `
            <div class="phone-app-page">
                <div class="phone-nav-bar">
                    <button type="button" class="phone-nav-back">${PHONE_ICONS.back}<span>返回</span></button>
                    <span class="phone-nav-title">美化模板</span>
                </div>

                <div class="phone-app-body phone-settings-scroll phone-settings-open">
                    <section class="phone-settings-section">
                        <div class="phone-settings-section-head">
                            <span class="phone-settings-section-title">模板系统</span>
                        </div>
                        <p class="phone-settings-desc">格式：${escapeHtml(PHONE_BEAUTIFY_TEMPLATE_FORMAT)} · 协议版本：v${escapeHtml(PHONE_BEAUTIFY_TEMPLATE_SCHEMA_VERSION)}。勾选即启用该模板：专属按“消息/动态/论坛”分别启用，通用按“通用表格”启用。</p>
                        <p class="phone-settings-desc">高级模式：支持“原始 JSON 编辑 + 全场景实时预览草稿 + 字段旁注释导出（annotated）”。</p>
                        <p class="phone-settings-desc">当前专属启用：${escapeHtml(activeSpecialSummary)}</p>
                        <p class="phone-settings-desc">当前通用启用：${escapeHtml(activeGenericSummary)}</p>
                    </section>

                    <section class="phone-settings-section">
                        <div class="phone-settings-section-head">
                            <span class="phone-settings-section-title">专属小剧场 App 表美化模板</span>
                        </div>
                        <p class="phone-settings-desc">用于“消息记录表 / 动态表 / 论坛表”等专属场景。每个子类型可分别启用一个模板。</p>
                        <div class="phone-settings-action phone-settings-action-wrap phone-beautify-toolbar">
                            <button type="button" class="phone-settings-btn" id="phone-beautify-import-special-btn">导入模板</button>
                            <button type="button" class="phone-settings-btn" id="phone-beautify-export-special-btn">导出本区</button>
                            <button type="button" class="phone-settings-btn" id="phone-beautify-export-special-default-btn">导出默认</button>
                        </div>
                        <input type="file" id="phone-beautify-import-special-input" accept="application/json,.json" style="display:none">
                        <div class="phone-beautify-list" id="phone-beautify-list-special">${specialListHtml}</div>
                    </section>

                    <section class="phone-settings-section">
                        <div class="phone-settings-section-head">
                            <span class="phone-settings-section-title">通用 App 表格样式美化模板</span>
                        </div>
                        <p class="phone-settings-desc">用于通用表格展示风格。该分区只会启用一个模板。</p>
                        <div class="phone-settings-action phone-settings-action-wrap phone-beautify-toolbar">
                            <button type="button" class="phone-settings-btn" id="phone-beautify-import-generic-btn">导入模板</button>
                            <button type="button" class="phone-settings-btn" id="phone-beautify-export-generic-btn">导出本区</button>
                            <button type="button" class="phone-settings-btn" id="phone-beautify-export-generic-default-btn">导出默认</button>
                        </div>
                        <input type="file" id="phone-beautify-import-generic-input" accept="application/json,.json" style="display:none">
                        <div class="phone-beautify-list" id="phone-beautify-list-generic">${genericListHtml}</div>
                    </section>

                    ${editorSectionHtml}

                    <section class="phone-settings-section">
                        <div class="phone-settings-section-head">
                            <span class="phone-settings-section-title">模板统计</span>
                        </div>
                        <p class="phone-settings-desc">当前共 ${allTemplates.length} 个模板（专属 ${allSpecialTemplates.length} / 通用 ${allGenericTemplates.length}）。</p>
                    </section>
                </div>
            </div>
        `;

        container.querySelector('.phone-nav-back')?.addEventListener('click', () => {
            state.mode = 'home';
            render();
        });

        const rerenderBeautifyKeepScroll = () => {
            const body = container.querySelector('.phone-app-body.phone-settings-scroll');
            const top = body ? Math.max(0, Number(body.scrollTop) || 0) : 0;
            renderBeautifyTemplatePage();
            requestAnimationFrame(() => {
                const nextBody = container.querySelector('.phone-app-body.phone-settings-scroll');
                if (!nextBody) return;
                const maxTop = Math.max(0, (nextBody.scrollHeight || 0) - (nextBody.clientHeight || 0));
                nextBody.scrollTop = Math.min(top, maxTop);
            });
        };

        container.querySelectorAll('.phone-beautify-active-radio').forEach((radio) => {
            const input = radio;
            if (!(input instanceof HTMLInputElement)) return;

            input.addEventListener('change', () => {
                if (!input.checked) return;

                const templateId = String(input.dataset.templateId || '').trim();
                const templateType = String(input.dataset.templateType || '').trim();
                const result = setActiveBeautifyTemplateIdByType(templateType, templateId);
                if (!result.success) {
                    showToast(container, result.message || '启用模板失败', true);
                    rerenderBeautifyKeepScroll();
                    return;
                }

                showToast(container, result.message || '模板已启用');
                rerenderBeautifyKeepScroll();
            });
        });

        const triggerExport = (options, filename, successTip) => {
            const result = exportPhoneBeautifyPack(options);
            if (!result.success || !result.pack || result.count <= 0) {
                showToast(container, '没有可导出的模板', true);
                return;
            }

            try {
                downloadTextFile(filename, JSON.stringify(result.pack, null, 2), 'application/json');
                const modeText = result?.pack?.packMeta?.exportMode || PHONE_BEAUTIFY_TEMPLATE_EXPORT_MODE_ANNOTATED;
                showToast(container, `${successTip}（${result.count}项 / ${modeText}）`);
            } catch (e) {
                showToast(container, `导出失败：${e?.message || '未知错误'}`, true);
            }
        };

        const bindImportByType = (triggerSelector, inputSelector, templateType, labelText) => {
            const trigger = container.querySelector(triggerSelector);
            const input = container.querySelector(inputSelector);
            if (!trigger || !input) return;

            trigger.addEventListener('click', () => {
                input.value = '';
                input.click();
            });

            input.addEventListener('change', () => {
                const file = input.files?.[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = () => {
                    const text = String(reader.result || '');
                    const imported = importPhoneBeautifyPackFromData(text, {
                        templateTypeFilter: templateType,
                        overwrite: false,
                    });

                    if (!imported.success) {
                        const detail = imported.errors?.[0] || imported.message || '导入失败';
                        showToast(container, `${labelText}导入失败：${detail}`, true);
                        return;
                    }

                    const warningText = imported.warnings?.length > 0
                        ? `（含${imported.warnings.length}条警告）`
                        : '';
                    showToast(container, `${labelText}导入成功：${imported.imported}项${warningText}`);
                    rerenderBeautifyKeepScroll();
                };

                reader.onerror = () => {
                    showToast(container, `${labelText}导入失败：文件读取异常`, true);
                };

                reader.readAsText(file, 'utf-8');
            });
        };

        bindImportByType('#phone-beautify-import-special-btn', '#phone-beautify-import-special-input', PHONE_TEMPLATE_TYPE_SPECIAL, '专属模板');
        bindImportByType('#phone-beautify-import-generic-btn', '#phone-beautify-import-generic-input', PHONE_TEMPLATE_TYPE_GENERIC, '通用模板');

        container.querySelector('#phone-beautify-export-special-btn')?.addEventListener('click', () => {
            triggerExport(
                {
                    templateType: PHONE_TEMPLATE_TYPE_SPECIAL,
                    packName: '专属小剧场模板包',
                    exportMode: PHONE_BEAUTIFY_TEMPLATE_EXPORT_MODE_ANNOTATED,
                },
                'yuzi_phone_special_templates.json',
                '专属模板已导出'
            );
        });

        container.querySelector('#phone-beautify-export-special-default-btn')?.addEventListener('click', () => {
            triggerExport(
                {
                    templateType: PHONE_TEMPLATE_TYPE_SPECIAL,
                    builtinOnly: true,
                    packName: '专属默认模板参考包',
                    exportMode: PHONE_BEAUTIFY_TEMPLATE_EXPORT_MODE_ANNOTATED,
                },
                'yuzi_phone_special_builtin_templates.json',
                '专属默认模板已导出'
            );
        });

        container.querySelector('#phone-beautify-export-generic-btn')?.addEventListener('click', () => {
            triggerExport(
                {
                    templateType: PHONE_TEMPLATE_TYPE_GENERIC,
                    packName: '通用表格模板包',
                    exportMode: PHONE_BEAUTIFY_TEMPLATE_EXPORT_MODE_ANNOTATED,
                },
                'yuzi_phone_generic_templates.json',
                '通用模板已导出'
            );
        });

        container.querySelector('#phone-beautify-export-generic-default-btn')?.addEventListener('click', () => {
            triggerExport(
                {
                    templateType: PHONE_TEMPLATE_TYPE_GENERIC,
                    builtinOnly: true,
                    packName: '通用默认模板参考包',
                    exportMode: PHONE_BEAUTIFY_TEMPLATE_EXPORT_MODE_ANNOTATED,
                },
                'yuzi_phone_generic_builtin_templates.json',
                '通用默认模板已导出'
            );
        });

        container.querySelectorAll('.phone-beautify-export-one').forEach((btn) => {
            btn.addEventListener('click', () => {
                const templateId = String(btn.getAttribute('data-template-id') || '').trim();
                if (!templateId) return;

                const result = exportPhoneBeautifyPack({
                    templateIds: [templateId],
                    packName: `单模板导出-${templateId}`,
                    exportMode: PHONE_BEAUTIFY_TEMPLATE_EXPORT_MODE_ANNOTATED,
                });

                if (!result.success || result.count <= 0 || !result.pack) {
                    showToast(container, '导出失败：模板不存在', true);
                    return;
                }

                const fileName = `yuzi_phone_template_${templateId.replace(/[^a-zA-Z0-9_.-]/g, '_')}.json`;
                downloadTextFile(fileName, JSON.stringify(result.pack, null, 2), 'application/json');
                showToast(container, '模板已导出');
            });
        });

        container.querySelectorAll('.phone-beautify-edit-one').forEach((btn) => {
            btn.addEventListener('click', () => {
                const templateId = String(btn.getAttribute('data-template-id') || '').trim();
                const template = getTemplateById(templateId);
                if (!template) {
                    showToast(container, '模板不存在，无法编辑', true);
                    return;
                }

                if (template.source === 'builtin') {
                    showToast(container, '内置模板只读，无法直接编辑', true);
                    return;
                }

                ensureEditorStateByTemplate(template);
                state.beautifyEditorError = '';
                state.beautifyEditorNotice = '';
                rerenderBeautifyKeepScroll();
            });
        });

        container.querySelectorAll('.phone-beautify-delete-one').forEach((btn) => {
            btn.addEventListener('click', () => {
                const templateId = String(btn.getAttribute('data-template-id') || '').trim();
                if (!templateId) return;

                const target = allTemplates.find(t => t.id === templateId);
                const displayName = target?.name || templateId;

                if (!window.confirm(`确定删除模板“${displayName}”？`)) {
                    return;
                }

                const result = deletePhoneBeautifyUserTemplate(templateId);
                if (!result.success) {
                    showToast(container, result.message || '删除失败', true);
                    return;
                }

                if (state.beautifyEditorTemplateId === templateId) {
                    const draftStore = getTemplateDraftStore();
                    delete draftStore[templateId];
                    emitDraftCleared(templateId);
                    clearEditorState();
                }

                showToast(container, `模板“${displayName}”已删除`);
                rerenderBeautifyKeepScroll();
            });
        });

        const editorJsonEl = container.querySelector('#phone-beautify-editor-json');
        editorJsonEl?.addEventListener('input', () => {
            state.beautifyEditorText = editorJsonEl.value;
            state.beautifyEditorError = '';
            state.beautifyEditorNotice = '';
        });

        container.querySelector('#phone-beautify-editor-preview-btn')?.addEventListener('click', () => {
            const templateId = String(state.beautifyEditorTemplateId || '').trim();
            if (!templateId) {
                showToast(container, '当前未选择可预览模板', true);
                return;
            }

            const parsed = parseEditorTemplateText();
            if (!parsed.ok) {
                state.beautifyEditorError = parsed.error || '解析失败';
                state.beautifyEditorNotice = '';
                showToast(container, state.beautifyEditorError, true);
                rerenderBeautifyKeepScroll();
                return;
            }

            const draftStore = getTemplateDraftStore();
            draftStore[templateId] = {
                render: parsed.template?.render || {},
            };
            emitDraftUpdated(templateId);

            const warningText = parsed.warnings?.length ? `（${parsed.warnings[0]}）` : '';
            state.beautifyEditorError = '';
            state.beautifyEditorNotice = `草稿预览已应用${warningText}`;
            showToast(container, '草稿预览已应用');
            rerenderBeautifyKeepScroll();
        });

        container.querySelector('#phone-beautify-editor-clear-preview-btn')?.addEventListener('click', () => {
            const templateId = String(state.beautifyEditorTemplateId || '').trim();
            if (!templateId) {
                showToast(container, '当前未选择可清除草稿模板', true);
                return;
            }

            const draftStore = getTemplateDraftStore();
            delete draftStore[templateId];
            emitDraftCleared(templateId);
            state.beautifyEditorError = '';
            state.beautifyEditorNotice = '草稿预览已清除';
            showToast(container, '草稿预览已清除');
            rerenderBeautifyKeepScroll();
        });

        container.querySelector('#phone-beautify-editor-save-btn')?.addEventListener('click', () => {
            const templateId = String(state.beautifyEditorTemplateId || '').trim();
            if (!templateId) {
                showToast(container, '当前未选择可保存模板', true);
                return;
            }

            const parsed = parseEditorTemplateText();
            if (!parsed.ok) {
                state.beautifyEditorError = parsed.error || '解析失败';
                state.beautifyEditorNotice = '';
                showToast(container, state.beautifyEditorError, true);
                rerenderBeautifyKeepScroll();
                return;
            }

            if (String(parsed.template?.id || '').trim() !== templateId) {
                state.beautifyEditorError = '模板 ID 不可在编辑器中修改，请保持与当前模板一致';
                state.beautifyEditorNotice = '';
                showToast(container, state.beautifyEditorError, true);
                rerenderBeautifyKeepScroll();
                return;
            }

            if (String(parsed.template?.source || '').trim() === 'builtin') {
                state.beautifyEditorError = '内置模板不可直接保存，请先导出后导入为用户模板';
                state.beautifyEditorNotice = '';
                showToast(container, state.beautifyEditorError, true);
                rerenderBeautifyKeepScroll();
                return;
            }

            const saved = savePhoneBeautifyUserTemplate(parsed.template, { overwrite: true });
            if (!saved.success) {
                const detail = saved.errors?.[0] || saved.message || '保存失败';
                state.beautifyEditorError = detail;
                state.beautifyEditorNotice = '';
                showToast(container, `模板保存失败：${detail}`, true);
                rerenderBeautifyKeepScroll();
                return;
            }

            const draftStore = getTemplateDraftStore();
            delete draftStore[templateId];
            emitDraftCleared(templateId);

            state.beautifyEditorError = '';
            state.beautifyEditorNotice = saved.message || '模板已保存';
            const warningText = saved.warnings?.length ? `（${saved.warnings[0]}）` : '';
            showToast(container, `${saved.message || '模板已保存'}${warningText}`);
            rerenderBeautifyKeepScroll();
        });

        container.querySelector('#phone-beautify-editor-close-btn')?.addEventListener('click', () => {
            clearEditorState();
            rerenderBeautifyKeepScroll();
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

    listEl.innerHTML = allItems.map(item => {
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
            pickImageFile(dataUrl => {
                if (estimateBase64Bytes(dataUrl) > STORAGE_BUDGETS.appIconBytes) {
                    showToast(listEl, '单个图标过大，请改用更小图片', true);
                    return;
                }

                const icons = getPhoneSettings().appIcons || {};
                const nextIcons = {
                    ...icons,
                    [key]: dataUrl,
                };

                if (estimateIconsStorageBytes(nextIcons) > STORAGE_BUDGETS.appIconsTotalBytes) {
                    showToast(listEl, '图标总占用超限，请先清理部分自定义图标', true);
                    return;
                }

                savePhoneSetting('appIcons', nextIcons);
                cacheSet(CACHE_STORES.images, cacheKey, dataUrl, 1000 * 60 * 60 * 24 * 30).catch(() => {});
                renderIconUploadList(listEl);
                showToast(listEl, '图标已更新');
            }, {
                maxSizeMB: 8,
                maxWidth: 1024,
                maxHeight: 1024,
                quality: 0.78,
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

function getDbPresetsFromPhoneSettings() {
    const raw = getPhoneSettings()?.[DB_PRESETS_SETTING_KEY];
    return normalizeDbPresetList(raw);
}

function saveDbPresetsToPhoneSettings(presets) {
    const normalized = normalizeDbPresetList(presets);
    savePhoneSetting(DB_PRESETS_SETTING_KEY, normalized);
}

function getActiveDbPresetNameFromSettings() {
    return String(getPhoneSettings()?.[DB_ACTIVE_PRESET_SETTING_KEY] || '').trim();
}

function setActiveDbPresetNameToSettings(name) {
    const normalized = String(name || '').trim();
    savePhoneSetting(DB_ACTIVE_PRESET_SETTING_KEY, normalized);
}

function createDbPreset(name, snapshot) {
    const normalizedName = String(name || '').trim();
    const normalizedSnapshot = normalizeDbConfigSnapshot(snapshot);
    return {
        name: normalizedName,
        updateConfig: normalizedSnapshot.updateConfig,
        manualSelection: normalizedSnapshot.manualSelection,
        updatedAt: Date.now(),
    };
}

function normalizeDbPresetList(raw) {
    if (!Array.isArray(raw)) return [];

    const dedup = [];
    const seenNames = new Set();

    raw.forEach((item) => {
        const normalized = normalizeDbPreset(item);
        if (!normalized) return;
        if (seenNames.has(normalized.name)) return;
        seenNames.add(normalized.name);
        dedup.push(normalized);
    });

    return dedup;
}

function normalizeDbPreset(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const name = String(raw.name || '').trim();
    if (!name) return null;

    const updatedAtNum = Number(raw.updatedAt);

    return {
        name,
        updateConfig: normalizeDbUpdateConfig(raw.updateConfig),
        manualSelection: normalizeDbManualSelection(raw.manualSelection),
        updatedAt: Number.isFinite(updatedAtNum) ? updatedAtNum : Date.now(),
    };
}

function normalizeDbConfigSnapshot(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
        updateConfig: normalizeDbUpdateConfig(src.updateConfig),
        manualSelection: normalizeDbManualSelection(src.manualSelection),
    };
}

function normalizeDbUpdateConfig(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
        autoUpdateThreshold: clampNumber(src.autoUpdateThreshold, 0, 999999, 3),
        autoUpdateFrequency: clampNumber(src.autoUpdateFrequency, 1, 999999, 1),
        updateBatchSize: clampNumber(src.updateBatchSize, 1, 999999, 2),
        autoUpdateTokenThreshold: clampNumber(src.autoUpdateTokenThreshold, 0, 99999999, 0),
    };
}

function normalizeDbManualSelection(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const selectedTables = Array.isArray(src.selectedTables)
        ? Array.from(new Set(src.selectedTables
            .map(v => String(v || '').trim())
            .filter(Boolean)))
        : [];

    const hasManualSelection = typeof src.hasManualSelection === 'boolean'
        ? src.hasManualSelection
        : selectedTables.length > 0;

    return {
        hasManualSelection,
        selectedTables,
    };
}

function isSameDbSnapshot(a, b) {
    const left = normalizeDbConfigSnapshot(a);
    const right = normalizeDbConfigSnapshot(b);

    const updateSame = left.updateConfig.autoUpdateThreshold === right.updateConfig.autoUpdateThreshold
        && left.updateConfig.autoUpdateFrequency === right.updateConfig.autoUpdateFrequency
        && left.updateConfig.updateBatchSize === right.updateConfig.updateBatchSize
        && left.updateConfig.autoUpdateTokenThreshold === right.updateConfig.autoUpdateTokenThreshold;

    if (!updateSame) return false;

    if (left.manualSelection.hasManualSelection !== right.manualSelection.hasManualSelection) {
        return false;
    }

    return areStringSetEqual(left.manualSelection.selectedTables, right.manualSelection.selectedTables);
}

function areStringSetEqual(a = [], b = []) {
    if (a.length !== b.length) return false;
    const rightSet = new Set(b.map(v => String(v)));
    return a.every(v => rightSet.has(String(v)));
}


// ===== 工具函数 =====

function pickImageFile(callback, options = {}) {
    const maxSizeMB = Number.isFinite(Number(options.maxSizeMB)) ? Number(options.maxSizeMB) : 8;
    const onError = typeof options.onError === 'function' ? options.onError : null;
    const maxWidth = Number.isFinite(Number(options.maxWidth)) ? Number(options.maxWidth) : 1440;
    const maxHeight = Number.isFinite(Number(options.maxHeight)) ? Number(options.maxHeight) : 1440;
    const quality = Number.isFinite(Number(options.quality)) ? Number(options.quality) : 0.82;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);

    const cleanup = () => {
        try { input.remove(); } catch {}
    };

    const fileToDataUrl = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('图片读取失败'));
        reader.readAsDataURL(file);
    });

    const loadImage = (dataUrl) => new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('图片解析失败'));
        img.src = dataUrl;
    });

    const compressDataUrl = async (rawDataUrl) => {
        const img = await loadImage(rawDataUrl);
        const srcW = Number(img.naturalWidth || img.width || 0);
        const srcH = Number(img.naturalHeight || img.height || 0);
        if (srcW <= 0 || srcH <= 0) return rawDataUrl;

        const ratio = Math.min(1, maxWidth / srcW, maxHeight / srcH);
        const targetW = Math.max(1, Math.round(srcW * ratio));
        const targetH = Math.max(1, Math.round(srcH * ratio));

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) return rawDataUrl;

        ctx.drawImage(img, 0, 0, targetW, targetH);

        const tryWebp = canvas.toDataURL('image/webp', Math.max(0.5, Math.min(0.92, quality)));
        if (typeof tryWebp === 'string' && tryWebp.startsWith('data:image/webp')) {
            return tryWebp;
        }

        return canvas.toDataURL('image/jpeg', Math.max(0.5, Math.min(0.9, quality)));
    };

    input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) {
            cleanup();
            return;
        }

        if (!String(file.type || '').startsWith('image/')) {
            onError?.('请选择图片文件');
            cleanup();
            return;
        }

        const maxBytes = Math.max(1, maxSizeMB) * 1024 * 1024;
        if (Number(file.size) > maxBytes * 1.8) {
            onError?.(`图片过大（>${(maxSizeMB * 1.8).toFixed(1)}MB），请压缩后重试`);
            cleanup();
            return;
        }

        try {
            const rawDataUrl = await fileToDataUrl(file);
            if (!rawDataUrl) {
                onError?.('图片读取失败');
                cleanup();
                return;
            }

            const compressed = await compressDataUrl(rawDataUrl);
            const best = estimateBase64Bytes(compressed) <= estimateBase64Bytes(rawDataUrl)
                ? compressed
                : rawDataUrl;

            if (estimateBase64Bytes(best) > maxBytes) {
                onError?.(`图片压缩后仍超过 ${maxSizeMB}MB，请换更小图片`);
                cleanup();
                return;
            }

            callback(best);
        } catch (e) {
            onError?.(e?.message || '图片处理失败');
        } finally {
            cleanup();
        }
    });

    input.click();
}

function estimateBase64Bytes(dataUrl) {
    const text = String(dataUrl || '');
    const idx = text.indexOf(',');
    const b64 = idx >= 0 ? text.slice(idx + 1) : text;
    if (!b64) return 0;
    return Math.floor(b64.length * 0.75);
}

function estimateIconsStorageBytes(icons) {
    if (!icons || typeof icons !== 'object') return 0;
    let total = 0;
    Object.values(icons).forEach((value) => {
        total += estimateBase64Bytes(String(value || ''));
    });
    return total;
}

function downloadTextFile(filename, text, mimeType = 'text/plain') {
    const blob = new Blob([String(text ?? '')], { type: mimeType });
    const url = URL.createObjectURL(blob);

    try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = String(filename || 'download.txt');
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    } finally {
        setTimeout(() => URL.revokeObjectURL(url), 500);
    }
}


function showToast(container, msg, isError = false) {
    const existing = container.querySelector('.phone-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `phone-toast ${isError ? 'phone-toast-error' : 'phone-toast-success'}`;
    toast.textContent = msg;
    (container.closest('.phone-app-page') || container).appendChild(toast);

    setTimeout(() => toast.classList.add('phone-toast-show'), 10);
    setTimeout(() => {
        toast.classList.remove('phone-toast-show');
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}
