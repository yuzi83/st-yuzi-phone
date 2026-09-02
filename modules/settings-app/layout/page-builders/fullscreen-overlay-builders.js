import { escapeHtml, escapeHtmlAttr } from '../../../utils/dom-escape.js';
import {
    buildSettingsHeroHtml,
    buildSettingsPageFrame,
    buildSettingsSectionHtml,
} from '../primitives.js';
import {
    MAX_FULLSCREEN_OVERLAY_PALETTE_SIZE,
    buildFullscreenOverlayColorRowsHtml,
    buildFullscreenOverlaySingleColorHtml,
} from '../../ui/color-control.js';
import {
    SCROLLING_BARRAGE_MODEL_ID,
    TABLE_POPUP_MODEL_ID,
} from '../../../fullscreen-overlay/settings.js';

const MODEL_LABELS = Object.freeze({
    [SCROLLING_BARRAGE_MODEL_ID]: '横向滚动弹幕',
    [TABLE_POPUP_MODEL_ID]: '普通表格弹窗',
});

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function checked(value) {
    return value === true ? ' checked' : '';
}

function selected(value) {
    return value ? ' selected' : '';
}

function disabled(value) {
    return value ? ' disabled' : '';
}

function valueAttr(value) {
    return escapeHtmlAttr(String(value ?? ''));
}

function modelLabel(modelId) {
    return MODEL_LABELS[modelId] || modelId || '未知模型';
}

function modelOptionsHtml(modelIds, selectedModelId) {
    return asArray(modelIds).map(optionModelId => `
        <option value="${escapeHtmlAttr(optionModelId)}"${selected(selectedModelId === optionModelId)}>
            ${escapeHtml(modelLabel(optionModelId))}
        </option>
    `).join('');
}

function buildSourceRowHtml(table, index, tableCount) {
    const isAvailable = table?.availability === 'available';
    const sheetKey = String(table?.sheetKey || '').trim();
    const tableName = String(table?.tableName || sheetKey || '未命名表格');
    const statusLabel = String(table?.statusLabel || (
        table?.availability === 'format_mismatch' ? '格式不匹配' : '暂未适配'
    ));
    const modelIds = asArray(table?.modelIds);
    const selectedModelId = String(table?.modelId || modelIds[0] || '');
    const modelControl = isAvailable && modelIds.length > 0
        ? `
            <select class="phone-settings-select phone-fullscreen-overlay-source-model-select"
                data-fullscreen-overlay-source-model="${escapeHtmlAttr(sheetKey)}"
                aria-label="${escapeHtmlAttr(tableName)}播放模型"${disabled(modelIds.length <= 1)}>
                ${modelOptionsHtml(modelIds, selectedModelId)}
            </select>
        `
        : `
            <span class="phone-fullscreen-overlay-source-status is-${escapeHtmlAttr(table?.availability || 'unsupported')}">
                ${escapeHtml(statusLabel)}
            </span>
        `;
    return `
        <article class="phone-fullscreen-overlay-source-row${isAvailable ? ' is-available' : ' is-disabled'}"
            data-fullscreen-overlay-source-row="${escapeHtmlAttr(sheetKey)}">
            <label class="phone-fullscreen-overlay-source-toggle">
                <input type="checkbox"
                    class="phone-settings-switch"
                    data-fullscreen-overlay-source="${escapeHtmlAttr(sheetKey)}"${disabled(!isAvailable)}${checked(table?.enabled)}>
                <span class="phone-fullscreen-overlay-source-copy">
                    <span class="phone-fullscreen-overlay-source-name">${escapeHtml(tableName)}</span>
                    <span class="phone-fullscreen-overlay-source-meta">${escapeHtml(sheetKey)}</span>
                </span>
            </label>
            <div class="phone-fullscreen-overlay-source-side">
                ${modelControl}
                <span class="phone-fullscreen-overlay-order-actions">
                    <button type="button"
                        class="phone-settings-btn phone-fullscreen-overlay-icon-btn"
                        data-fullscreen-overlay-move="up"
                        data-sheet-key="${escapeHtmlAttr(sheetKey)}"
                        aria-label="上移 ${escapeHtmlAttr(tableName)}"${disabled(index <= 0)}>↑</button>
                    <button type="button"
                        class="phone-settings-btn phone-fullscreen-overlay-icon-btn"
                        data-fullscreen-overlay-move="down"
                        data-sheet-key="${escapeHtmlAttr(sheetKey)}"
                        aria-label="下移 ${escapeHtmlAttr(tableName)}"${disabled(index >= tableCount - 1)}>↓</button>
                </span>
            </div>
        </article>
    `;
}

function buildParameterField({
    id,
    label,
    value,
    min,
    max,
    step,
    suffix,
    description,
}) {
    return `
        <label class="phone-fullscreen-overlay-parameter-row"
            for="${escapeHtmlAttr(id)}"
            title="${escapeHtmlAttr(description)}">
            <span class="phone-fullscreen-overlay-parameter-label">${escapeHtml(label)}</span>
            <span class="phone-fullscreen-overlay-parameter-control">
                <input type="number"
                    id="${escapeHtmlAttr(id)}"
                    class="phone-settings-input phone-fullscreen-overlay-parameter-input"
                    value="${valueAttr(value)}"
                    min="${valueAttr(min)}"
                    max="${valueAttr(max)}"
                    step="${valueAttr(step)}">
                ${suffix ? `<span class="phone-fullscreen-overlay-parameter-unit">${escapeHtml(suffix)}</span>` : ''}
            </span>
        </label>
    `;
}

function buildSelectParameterField({ id, label, value, options, description }) {
    return `
        <label class="phone-fullscreen-overlay-parameter-row"
            for="${escapeHtmlAttr(id)}"
            title="${escapeHtmlAttr(description)}">
            <span class="phone-fullscreen-overlay-parameter-label">${escapeHtml(label)}</span>
            <select id="${escapeHtmlAttr(id)}"
                class="phone-settings-select phone-fullscreen-overlay-parameter-select">
                ${options.map(option => `
                    <option value="${escapeHtmlAttr(option.value)}"${selected(value === option.value)}>
                        ${escapeHtml(option.label)}
                    </option>
                `).join('')}
            </select>
        </label>
    `;
}

function buildBarrageModelHtml(barrage) {
    const areaPercent = [25, 50, 75, 100].includes(Number(barrage.areaPercent))
        ? Number(barrage.areaPercent)
        : 75;
    return `
        <label class="phone-settings-field-inline" for="phone-fullscreen-overlay-area">
            <span>弹幕区域</span>
            <select id="phone-fullscreen-overlay-area" class="phone-settings-select">
                <option value="25"${selected(areaPercent === 25)}>上方 25%</option>
                <option value="50"${selected(areaPercent === 50)}>上方 50%</option>
                <option value="75"${selected(areaPercent === 75)}>上方 75%</option>
                <option value="100"${selected(areaPercent === 100)}>全屏</option>
            </select>
        </label>
        <label class="phone-fullscreen-overlay-master-switch" for="phone-fullscreen-overlay-eternal">
            <span>
                <strong>永恒弹幕</strong>
                <small>当前内容完整发射一轮后持续循环；新内容到达时会自动接管，不阻塞后续表格。</small>
            </span>
            <input type="checkbox"
                id="phone-fullscreen-overlay-eternal"
                class="phone-settings-switch"${checked(barrage.eternalEnabled)}>
        </label>
        <div class="phone-fullscreen-overlay-parameter-list">
            ${buildParameterField({
                id: 'phone-fullscreen-overlay-density',
                label: '密度',
                value: barrage.maxConcurrent,
                min: 1,
                max: 6,
                step: 1,
                suffix: '条',
                description: '控制垂直轨道数量与视觉密度（1–6）。',
            })}
            ${buildParameterField({
                id: 'phone-fullscreen-overlay-interval',
                label: '间隔',
                value: Number(barrage.intervalMs) / 1000,
                min: 0.5,
                max: 10,
                step: 0.1,
                suffix: '秒',
                description: '相邻两条弹幕发射的最短时间（0.5–10 秒）。',
            })}
            ${buildParameterField({
                id: 'phone-fullscreen-overlay-duration',
                label: '速度',
                value: Number(barrage.durationMs) / 1000,
                min: 4,
                max: 20,
                step: 0.5,
                suffix: '秒',
                description: '数字越小移动越快（4–20 秒穿屏）。',
            })}
            ${buildParameterField({
                id: 'phone-fullscreen-overlay-font-size',
                label: '字号',
                value: barrage.fontSizePx,
                min: 12,
                max: 28,
                step: 1,
                suffix: 'px',
                description: '弹幕文字大小（12–28px）。',
            })}
            ${buildParameterField({
                id: 'phone-fullscreen-overlay-opacity',
                label: '透明度',
                value: barrage.opacity,
                min: 0.3,
                max: 1,
                step: 0.01,
                suffix: '',
                description: '只改变弹幕文字透明度，不增加全屏滤镜。',
            })}
        </div>
    `;
}

function buildPopupModelHtml(popup) {
    const areaPercent = [25, 50, 75, 100].includes(Number(popup.areaPercent))
        ? Number(popup.areaPercent)
        : 75;
    return `
        <label class="phone-settings-field-inline" for="phone-fullscreen-overlay-popup-area">
            <span>弹窗区域</span>
            <select id="phone-fullscreen-overlay-popup-area" class="phone-settings-select">
                <option value="25"${selected(areaPercent === 25)}>上方 25%</option>
                <option value="50"${selected(areaPercent === 50)}>上方 50%</option>
                <option value="75"${selected(areaPercent === 75)}>上方 75%</option>
                <option value="100"${selected(areaPercent === 100)}>全屏</option>
            </select>
        </label>
        <div class="phone-fullscreen-overlay-parameter-list">
            ${buildParameterField({
                id: 'phone-fullscreen-overlay-popup-max-concurrent',
                label: '同时显示',
                value: popup.maxConcurrent,
                min: 1,
                max: 6,
                step: 1,
                suffix: '张',
                description: '最多同时显示的普通表格弹窗数量（1–6）。',
            })}
            ${buildParameterField({
                id: 'phone-fullscreen-overlay-popup-interval',
                label: '交接间隔',
                value: Number(popup.intervalMs) / 1000,
                min: 0,
                max: 2,
                step: 0.1,
                suffix: '秒',
                description: '同一来源相邻弹窗的发射间隔（0–2 秒）。',
            })}
            ${buildParameterField({
                id: 'phone-fullscreen-overlay-popup-duration',
                label: '停留时长',
                value: Number(popup.durationMs) / 1000,
                min: 1,
                max: 15,
                step: 0.5,
                suffix: '秒',
                description: '每张弹窗从淡入到淡出的显示时长（1–15 秒）。',
            })}
            ${buildSelectParameterField({
                id: 'phone-fullscreen-overlay-popup-column-count',
                label: '网格列数',
                value: String(popup.columnCount),
                options: [
                    { value: '1', label: '1 列' },
                    { value: '2', label: '2 列' },
                    { value: '3', label: '3 列' },
                ],
                description: '固定使用用户选择的 1、2 或 3 列，不自动降列。',
            })}
            ${buildSelectParameterField({
                id: 'phone-fullscreen-overlay-popup-size',
                label: '弹窗大小',
                value: String(popup.sizePreset),
                options: [
                    { value: 'compact', label: '紧凑' },
                    { value: 'normal', label: '正常' },
                    { value: 'large', label: '放大' },
                ],
                description: '同步调整卡片、字号、间距和圆角。',
            })}
            ${buildParameterField({
                id: 'phone-fullscreen-overlay-popup-radius',
                label: '圆角',
                value: popup.borderRadiusPx,
                min: 8,
                max: 32,
                step: 1,
                suffix: 'px',
                description: '普通表格弹窗圆角（8–32px）。',
            })}
            ${buildParameterField({
                id: 'phone-fullscreen-overlay-popup-opacity',
                label: '背景透明度',
                value: popup.opacity,
                min: 0.72,
                max: 1,
                step: 0.01,
                suffix: '',
                description: '只调整弹窗背景透明度，文字保持清晰。',
            })}
        </div>
    `;
}

function buildLoadingBody() {
    return buildSettingsSectionHtml({
        title: '正在读取表格',
        desc: '正在通过共享表格目录识别可用内容源。',
        bodyHtml: '<div class="phone-settings-note">请稍候……</div>',
    });
}

function buildErrorBody(viewModel) {
    return buildSettingsSectionHtml({
        title: '暂时无法读取表格',
        desc: String(viewModel?.error?.message || '当前表格目录不可用，请稍后重试。'),
        bodyHtml: '<div class="phone-settings-inline-status is-danger"><span class="phone-settings-inline-status-dot"></span><span class="phone-settings-inline-status-text">弹幕设置没有修改任何现有配置。</span></div>',
    });
}

export function buildFullscreenOverlayPageHtml(viewModel = {}) {
    const config = viewModel?.config && typeof viewModel.config === 'object' ? viewModel.config : {};
    const barrage = config?.models?.[SCROLLING_BARRAGE_MODEL_ID]
        && typeof config.models[SCROLLING_BARRAGE_MODEL_ID] === 'object'
        ? config.models[SCROLLING_BARRAGE_MODEL_ID]
        : {};
    const popup = config?.models?.[TABLE_POPUP_MODEL_ID]
        && typeof config.models[TABLE_POPUP_MODEL_ID] === 'object'
        ? config.models[TABLE_POPUP_MODEL_ID]
        : {};
    const tables = asArray(viewModel.tables);
    const eyeDropperSupported = viewModel.eyeDropperSupported === true;
    const enabledCount = tables.filter(table => table?.enabled === true).length;
    const availableCount = tables.filter(table => table?.availability === 'available').length;
    const palette = asArray(barrage.palette);
    const selectedModelId = viewModel.selectedModelId === TABLE_POPUP_MODEL_ID
        ? TABLE_POPUP_MODEL_ID
        : SCROLLING_BARRAGE_MODEL_ID;
    const editingPopup = selectedModelId === TABLE_POPUP_MODEL_ID;

    const heroHtml = buildSettingsHeroHtml({
        eyebrow: '全屏临时视觉内容',
        title: '弹幕设置',
        description: '按表格顺序调度透明浮层内容；每张表可独立选择滚动弹幕或普通表格弹窗。',
        chips: [
            { text: config.enabled === true ? '自动播放已开启' : '自动播放已关闭', tone: config.enabled === true ? 'info' : 'neutral' },
            { text: `${enabledCount}/${availableCount} 个可用来源`, tone: 'soft' },
            { text: `正在编辑：${modelLabel(selectedModelId)}`, tone: 'neutral' },
        ],
    });

    let bodyHtml = '';
    if (viewModel.status === 'loading') {
        bodyHtml = buildLoadingBody();
    } else if (viewModel.status === 'error') {
        bodyHtml = buildErrorBody(viewModel);
    } else {
        const sourceRows = tables.length > 0
            ? tables.map((table, index) => buildSourceRowHtml(table, index, tables.length)).join('')
            : '<div class="phone-settings-note">当前数据库没有可显示的物理表格。</div>';
        bodyHtml = `
            ${buildSettingsSectionHtml({
                title: '运行状态',
                desc: '关闭主开关不会影响测试按钮；小手机窗口关闭后，已启用的后台监听仍继续工作。',
                bodyHtml: `
                    <label class="phone-fullscreen-overlay-master-switch" for="phone-fullscreen-overlay-enabled">
                        <span>
                            <strong>启用全屏浮层</strong>
                            <small>只响应已适配、已勾选且真正发生变化的表格来源。</small>
                        </span>
                        <input type="checkbox"
                            id="phone-fullscreen-overlay-enabled"
                            class="phone-settings-switch"${checked(config.enabled)}>
                    </label>
                `,
            })}

            ${buildSettingsSectionHtml({
                title: '表格来源与顺序',
                desc: '全部物理表都可使用普通表格弹窗；直播表还可保留滚动弹幕。多个来源严格按此顺序依次交接。',
                bodyHtml: `<div class="phone-fullscreen-overlay-source-list">${sourceRows}</div>`,
            })}

            ${buildSettingsSectionHtml({
                title: '全局播放模型',
                desc: '这里仅切换正在编辑的模型参数；每张表实际使用的模型由上方来源行单独选择。',
                bodyHtml: `
                    <label class="phone-settings-field-inline" for="phone-fullscreen-overlay-playback-model">
                        <span>播放模型</span>
                        <select id="phone-fullscreen-overlay-playback-model" class="phone-settings-select">
                            <option value="${SCROLLING_BARRAGE_MODEL_ID}"${selected(selectedModelId === SCROLLING_BARRAGE_MODEL_ID)}>横向滚动弹幕</option>
                            <option value="${TABLE_POPUP_MODEL_ID}"${selected(selectedModelId === TABLE_POPUP_MODEL_ID)}>普通表格弹窗</option>
                        </select>
                    </label>
                    ${editingPopup
                        ? buildPopupModelHtml(popup)
                        : buildBarrageModelHtml(barrage)}
                `,
            })}

            ${editingPopup
                ? buildSettingsSectionHtml({
                    title: '弹窗背景色',
                    desc: '普通表格弹窗使用单一背景色；文字颜色会自动保持对比度。',
                    bodyHtml: `
                        <div class="phone-fullscreen-overlay-color-list">
                            ${buildFullscreenOverlaySingleColorHtml(
                                popup.backgroundColor,
                                { eyeDropperSupported },
                            )}
                        </div>
                        <p class="phone-settings-desc">${eyeDropperSupported
                            ? '吸管可以从当前用户界面或屏幕中取色；取消取色不会改变原值。'
                            : '当前浏览器不支持吸管取色，仍可使用颜色选择器或 HEX 输入。'}</p>
                    `,
                })
                : buildSettingsSectionHtml({
                    title: '弹幕调色板',
                    desc: `每条弹幕发射时等概率随机取色，并尽量避免连续同色。允许重复颜色，最多 ${MAX_FULLSCREEN_OVERLAY_PALETTE_SIZE} 种。`,
                    actionsHtml: `
                        <div class="phone-settings-action phone-settings-action-wrap">
                            <button type="button" class="phone-settings-btn" id="phone-fullscreen-overlay-add-color"
                                ${disabled(palette.length >= MAX_FULLSCREEN_OVERLAY_PALETTE_SIZE)}>添加颜色</button>
                            <button type="button" class="phone-settings-btn" id="phone-fullscreen-overlay-reset-palette">恢复默认</button>
                        </div>
                    `,
                    bodyHtml: `
                        <div class="phone-fullscreen-overlay-color-list">
                            ${buildFullscreenOverlayColorRowsHtml(palette, { eyeDropperSupported })}
                        </div>
                        <p class="phone-settings-desc">${eyeDropperSupported
                            ? '吸管可以从当前用户界面或屏幕中取色；取消取色不会改变原值。'
                            : '当前浏览器不支持吸管取色，仍可使用颜色选择器或 HEX 输入。'}</p>
                    `,
                })}

            ${buildSettingsSectionHtml({
                title: '立即操作',
                desc: '测试会读取所有已勾选来源；弹幕读取完整弹幕串，弹窗每张表只读取第一条可展示行。主开关关闭时也可测试。',
                bodyHtml: `
                    <div class="phone-fullscreen-overlay-action-grid">
                        <button type="button" class="phone-settings-btn phone-fullscreen-overlay-primary-action"
                            id="phone-fullscreen-overlay-test">测试已勾选来源</button>
                        <button type="button" class="phone-settings-btn phone-settings-btn-danger"
                            id="phone-fullscreen-overlay-clear">清空当前浮层</button>
                    </div>
                `,
            })}
        `;
    }

    return buildSettingsPageFrame({
        title: '弹幕设置',
        heroHtml,
        bodyClass: 'phone-app-body phone-settings-scroll phone-settings-open phone-fullscreen-overlay-settings-page',
        bodyHtml,
    });
}
