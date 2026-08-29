import { escapeHtml, escapeHtmlAttr } from '../../../utils/dom-escape.js';
import {
    buildSettingsHeroHtml,
    buildSettingsPageFrame,
    buildSettingsSectionHtml,
} from '../primitives.js';
import {
    MAX_FULLSCREEN_OVERLAY_PALETTE_SIZE,
    buildFullscreenOverlayColorRowsHtml,
} from '../../ui/color-control.js';

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function checked(value) {
    return value === true ? ' checked' : '';
}

function disabled(value) {
    return value ? ' disabled' : '';
}

function valueAttr(value) {
    return escapeHtmlAttr(String(value ?? ''));
}

function buildSourceRowHtml(table, index, tableCount) {
    const isAvailable = table?.availability === 'available';
    const sheetKey = String(table?.sheetKey || '').trim();
    const tableName = String(table?.tableName || sheetKey || '未命名表格');
    const statusLabel = String(table?.statusLabel || (
        table?.availability === 'format_mismatch' ? '格式不匹配' : '暂未适配'
    ));
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
                <span class="phone-fullscreen-overlay-source-status is-${escapeHtmlAttr(table?.availability || 'unsupported')}">
                    ${escapeHtml(statusLabel)}
                </span>
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
    const barrage = config?.models?.['scrolling-barrage']
        && typeof config.models['scrolling-barrage'] === 'object'
        ? config.models['scrolling-barrage']
        : {};
    const tables = asArray(viewModel.tables);
    const eyeDropperSupported = viewModel.eyeDropperSupported === true;
    const enabledCount = tables.filter(table => table?.enabled === true).length;
    const availableCount = tables.filter(table => table?.availability === 'available').length;
    const palette = asArray(barrage.palette);

    const heroHtml = buildSettingsHeroHtml({
        eyebrow: '全屏临时视觉内容',
        title: '弹幕设置',
        description: '按表格顺序调度透明浮层内容；第一版仅开放格式正确的直播表滚动弹幕。',
        chips: [
            { text: config.enabled === true ? '自动播放已开启' : '自动播放已关闭', tone: config.enabled === true ? 'info' : 'neutral' },
            { text: `${enabledCount}/${availableCount} 个可用来源`, tone: 'soft' },
            { text: `${Math.max(1, palette.length)} 色调色板`, tone: 'neutral' },
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
                desc: '全部物理表都会显示；暂未适配或格式不匹配的表格不可勾选。多个来源会严格按此顺序依次完成。',
                bodyHtml: `<div class="phone-fullscreen-overlay-source-list">${sourceRows}</div>`,
            })}

            ${buildSettingsSectionHtml({
                title: '全局播放模型',
                desc: '第一版只提供横向滚动弹幕；后续模型仍从这里统一复用。',
                bodyHtml: `
                    <label class="phone-settings-field-inline" for="phone-fullscreen-overlay-playback-model">
                        <span>播放模型</span>
                        <select id="phone-fullscreen-overlay-playback-model" class="phone-settings-select" disabled>
                            <option value="scrolling-barrage" selected>横向滚动弹幕</option>
                        </select>
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
                `,
            })}

            ${buildSettingsSectionHtml({
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
                desc: '测试会读取所有已勾选且可用的来源，主开关关闭时也可以使用。',
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
