import {
    buildSettingsHeroHtml,
    buildSettingsPageFrame,
    buildSettingsSectionHtml,
} from '../primitives.js';
import { PHONE_ICONS } from '../../../phone-home/icons.js';
import { escapeHtml, escapeHtmlAttr } from '../../../utils/dom-escape.js';

function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)}MB`;
    if (value >= 1024) return `${Math.round(value / 1024)}KB`;
    return `${Math.max(0, Math.round(value))}B`;
}

function buildFontLibraryOptionsHtml(fontLibrary) {
    const activeFontId = String(fontLibrary?.activeFontId || 'builtin.system-ui');
    const options = Array.isArray(fontLibrary?.options) ? fontLibrary.options : [];
    return options.map((font) => {
        const id = String(font?.id || '').trim();
        if (!id) return '';
        const label = `${font?.builtin ? '内置' : '用户'} · ${String(font?.name || id)}`;
        return `<option value="${escapeHtmlAttr(id)}" ${id === activeFontId ? 'selected' : ''}>${escapeHtmlAttr(label)}</option>`;
    }).join('');
}

export function buildAppearancePageHtml({
    layoutValues,
    hideTableCountBadge,
    homeAppLabelColorMode = 'white',
    fontLibrary = {},
    readableTextScalePercent = 100,
}) {
    const activeFont = fontLibrary?.activeFont || {};
    const userFontCount = Number(fontLibrary?.stats?.userFontCount) || 0;
    const maxFonts = Number(fontLibrary?.limits?.maxFonts) || 0;
    const totalFontBytes = Number(fontLibrary?.stats?.totalBytes) || 0;
    const maxTotalFontBytes = Number(fontLibrary?.limits?.totalFontBytes) || 0;
    const singleFontBytes = Number(fontLibrary?.limits?.singleFontBytes) || 0;
    const fontOptionsHtml = buildFontLibraryOptionsHtml(fontLibrary);
    const canDeleteActiveFont = !!activeFont?.id && !activeFont?.builtin;
    const readableTextScaleValue = Math.max(80, Math.min(160, Math.round(Number(readableTextScalePercent) || 100)));

    const heroHtml = buildSettingsHeroHtml({
        eyebrow: '界面外观',
        title: '桌面视觉与布局',
        description: '统一管理背景、图标密度、显示细节与自定义图标资源。',
        chips: [
            { text: `${layoutValues.appGridColumns} 列网格`, tone: 'info' },
            { text: `图标 ${layoutValues.appIconSize}px`, tone: 'soft' },
            { text: hideTableCountBadge ? '数量徽标已隐藏' : '数量徽标显示中', tone: 'neutral' },
        ],
    });

    const bodyHtml = `
        ${buildSettingsSectionHtml({
            title: '主题与背景',
            desc: '上传背景图或恢复默认背景，让桌面保持轻盈、干净的视觉氛围。',
            actionsHtml: `
                <div class="phone-settings-action">
                    <button type="button" class="phone-settings-btn" id="phone-upload-bg">
                        ${PHONE_ICONS.upload}
                        <span>上传</span>
                    </button>
                    <button type="button" class="phone-settings-btn phone-settings-btn-danger" id="phone-clear-bg">清除</button>
                </div>
            `,
            bodyHtml: `
                <div class="phone-settings-note">建议选择浅色、低干扰背景，以保证图标与文字的可读性。</div>
                <div id="phone-bg-preview" class="phone-settings-preview"></div>
            `,
        })}

        ${buildSettingsSectionHtml({
            title: '外观资源包',
            desc: '导入官方美化包，或导出当前背景与当前自定义图标。',
            actionsHtml: `
                <div class="phone-settings-action phone-settings-action-wrap">
                    <button type="button" class="phone-settings-btn" id="phone-import-appearance-pack">
                        ${PHONE_ICONS.upload}
                        <span>导入美化包</span>
                    </button>
                    <button type="button" class="phone-settings-btn" id="phone-export-appearance-pack">导出当前外观</button>
                    <input type="file" id="phone-appearance-pack-file" accept="application/json,.json" hidden>
                </div>
            `,
            bodyHtml: `
                <div class="phone-settings-note">导入会替换当前自定义图标：带 slotKey 的图标优先回到对应 App，旧包图标按当前顺序分配；多余图标直接丢弃，不足位置回退默认文字图标。</div>
            `,
        })}

        ${buildSettingsSectionHtml({
            title: '字体库',
            desc: '选择内置字体，或导入 woff2 / woff / ttf / otf 字体并应用到小手机普通文本。',
            actionsHtml: `
                <div class="phone-settings-action phone-settings-action-wrap">
                    <button type="button" class="phone-settings-btn" id="phone-import-font-btn">
                        ${PHONE_ICONS.upload}
                        <span>导入字体</span>
                    </button>
                    <button type="button" class="phone-settings-btn phone-settings-btn-danger" id="phone-delete-font-btn" ${canDeleteActiveFont ? '' : 'disabled'}>删除当前字体</button>
                    <input type="file" id="phone-font-file" accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf,application/x-font-ttf,application/x-font-otf" hidden>
                </div>
            `,
            bodyHtml: `
                <div class="phone-settings-font-panel">
                    <label class="phone-settings-field-inline phone-settings-field-full">
                        <span>当前字体</span>
                        <select id="phone-font-select" class="phone-settings-select">
                            ${fontOptionsHtml}
                        </select>
                    </label>
                    <div class="phone-settings-font-preview" id="phone-font-preview" style="font-family: var(--yuzi-phone-font-family);">
                        <span class="phone-settings-font-preview-title">${escapeHtml(activeFont.name || '系统默认')}</span>
                        <span class="phone-settings-font-preview-sample">${escapeHtml(activeFont.previewText || '玉子手机 · 字体预览 Aa 123')}</span>
                    </div>
                    <div class="phone-settings-note">已保存 ${escapeHtml(String(userFontCount))} / ${escapeHtml(String(maxFonts))} 个用户字体；字体库占用 ${escapeHtml(formatBytes(totalFontBytes))} / ${escapeHtml(formatBytes(maxTotalFontBytes))}；单个字体上限 ${escapeHtml(formatBytes(singleFontBytes))}。</div>
                </div>
            `,
        })}

        ${buildSettingsSectionHtml({
            title: '主要内容字体大小',
            desc: '只调整首页 App 名称、通用表列表行文字与通用表详情字段文字。标题栏、搜索区和所有按钮保持原字号。',
            bodyHtml: `
                <div class="phone-settings-readable-text-scale-panel">
                    <div class="phone-settings-readable-text-scale-row">
                        <input type="range" min="80" max="160" step="1" id="phone-readable-text-scale-range" value="${escapeHtmlAttr(readableTextScaleValue)}" aria-label="主要内容字体大小">
                        <input type="number" min="80" max="160" step="1" id="phone-readable-text-scale-input" class="phone-settings-input" value="${escapeHtmlAttr(readableTextScaleValue)}" aria-label="主要内容字体大小百分比">
                        <span class="phone-settings-readable-text-scale-value" id="phone-readable-text-scale-value">${escapeHtml(String(readableTextScaleValue))}%</span>
                    </div>
                    <div class="phone-settings-note">范围 80%~160%；不影响返回标题栏、搜索框、排序、底部操作按钮、行右侧查看按钮、专属消息表、小剧场或变量管理。</div>
                </div>
            `,
        })}

        ${buildSettingsSectionHtml({
            title: '图标布局',
            desc: '通过图标数量、尺寸、圆角与间距建立更清晰的桌面秩序。',
            bodyHtml: `
                <div class="phone-settings-layout-grid">
                    <label class="phone-settings-field-inline">
                        <span>每行图标</span>
                        <input type="number" min="3" max="6" id="phone-app-grid-columns" class="phone-settings-input" value="${escapeHtmlAttr(layoutValues.appGridColumns)}">
                    </label>
                    <label class="phone-settings-field-inline">
                        <span>图标大小</span>
                        <input type="number" min="40" max="88" id="phone-app-icon-size" class="phone-settings-input" value="${escapeHtmlAttr(layoutValues.appIconSize)}">
                    </label>
                    <label class="phone-settings-field-inline">
                        <span>圆角</span>
                        <input type="number" min="6" max="26" id="phone-app-icon-radius" class="phone-settings-input" value="${escapeHtmlAttr(layoutValues.appIconRadius)}">
                    </label>
                    <label class="phone-settings-field-inline">
                        <span>图标间距</span>
                        <input type="number" min="8" max="24" id="phone-app-grid-gap" class="phone-settings-input" value="${escapeHtmlAttr(layoutValues.appGridGap)}">
                    </label>
                    <label class="phone-settings-field-inline">
                        <span>Dock 图标大小</span>
                        <input type="number" min="32" max="72" id="phone-dock-icon-size" class="phone-settings-input" value="${escapeHtmlAttr(layoutValues.dockIconSize)}">
                    </label>
                </div>
            `,
        })}

        ${buildSettingsSectionHtml({
            title: '显示控制',
            desc: '控制首页标签与表格类 App 的显示细节，减少视觉噪音。',
            bodyHtml: `
                <div class="phone-appearance-switch-list">
                    <label class="phone-appearance-switch-item" for="phone-hide-table-count-badge">
                        <span class="phone-appearance-switch-main">隐藏数量徽标</span>
                        <input type="checkbox" id="phone-hide-table-count-badge" class="phone-settings-switch" ${hideTableCountBadge ? 'checked' : ''}>
                    </label>
                    <label class="phone-settings-field-inline phone-settings-field-full" for="phone-home-app-label-color-mode">
                        <span>首页 App 名称颜色</span>
                        <select id="phone-home-app-label-color-mode" class="phone-settings-select">
                            <option value="white" ${homeAppLabelColorMode === 'white' ? 'selected' : ''}>白色文字（适合深色背景）</option>
                            <option value="black" ${homeAppLabelColorMode === 'black' ? 'selected' : ''}>黑色文字（适合浅色背景）</option>
                        </select>
                    </label>
                </div>
            `,
        })}

        ${buildSettingsSectionHtml({
            title: '隐藏表格类 App',
            desc: '按需屏蔽不常用的表格入口，让首页更聚焦。',
            bodyHtml: `<div id="phone-hidden-table-apps" class="phone-appearance-checklist"></div>`,
        })}

        ${buildSettingsSectionHtml({
            title: '自定义图标',
            desc: '为不同 App 上传更具识别度的图标资源；下方会列出当前设置内的全部图标，包含不再对应当前 App 位的隐藏旧图标。',
            bodyHtml: `<div id="phone-icon-upload-list" class="phone-icon-upload-list"></div>`,
        })}
    `;

    return buildSettingsPageFrame({
        title: '界面外观',
        heroHtml,
        bodyClass: 'phone-app-body phone-settings-scroll phone-settings-open',
        bodyHtml,
    });
}

export function buildButtonStylePageHtml({ currentSize, currentShape, currentCover }) {
    const previewHtml = currentCover
        ? `<img src="${escapeHtmlAttr(currentCover)}" class="phone-bg-thumb" alt="按钮封面预览">`
        : '<div class="phone-empty-msg">未设置封面</div>';

    const heroHtml = buildSettingsHeroHtml({
        eyebrow: '控件与按钮',
        title: '悬浮入口样式',
        description: '调整入口尺寸、按钮形态与封面素材，让触达体验更轻盈。',
        chips: [
            { text: `尺寸 ${currentSize}px`, tone: 'info' },
            { text: currentShape === 'circle' ? '圆形模式' : '圆角模式', tone: 'soft' },
            { text: currentCover ? '封面已设置' : '未设置封面', tone: 'neutral' },
        ],
    });

    const bodyHtml = `
        ${buildSettingsSectionHtml({
            title: '尺寸调节',
            desc: '滑动调整按钮尺寸，获得更合适的点击区域与视觉比例。',
            bodyHtml: `
                <div class="phone-settings-toggle-size-row">
                    <input type="range" min="32" max="72" step="1" id="phone-toggle-style-size-range" value="${escapeHtmlAttr(currentSize)}">
                    <input type="number" min="32" max="72" step="1" id="phone-toggle-style-size-input" class="phone-settings-input" value="${escapeHtmlAttr(currentSize)}">
                </div>
                <p class="phone-settings-desc">建议范围 36~56，移动端默认 44。</p>
            `,
        })}

        ${buildSettingsSectionHtml({
            title: '按钮形态',
            desc: '圆形更简洁，圆角模式则更适合保留文字标签。',
            bodyHtml: `
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
            `,
        })}

        ${buildSettingsSectionHtml({
            title: '封面管理',
            desc: '上传封面后会使用 cover 裁剪，建议主体位于中心区域。',
            actionsHtml: `
                <div class="phone-settings-action">
                    <button type="button" class="phone-settings-btn" id="phone-toggle-cover-upload-btn">
                        ${PHONE_ICONS.upload}
                        <span>上传封面</span>
                    </button>
                    <button type="button" class="phone-settings-btn phone-settings-btn-danger" id="phone-toggle-cover-clear-btn" ${currentCover ? '' : 'disabled'}>清除封面</button>
                </div>
            `,
            bodyHtml: `<div id="phone-toggle-cover-preview" class="phone-settings-preview">${previewHtml}</div>`,
        })}
    `;

    return buildSettingsPageFrame({
        title: '控件与按钮',
        heroHtml,
        bodyClass: 'phone-app-body phone-settings-scroll phone-settings-open',
        bodyHtml,
    });
}
