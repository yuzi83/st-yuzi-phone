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
    phoneThemeMode = 'light',
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
            desc: '上传背景图。',
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
                <div class="phone-settings-layout-grid">
                    <label class="phone-settings-field-inline" for="phone-theme-mode-select">
                        <span>主题模式</span>
                        <select id="phone-theme-mode-select" class="phone-settings-select">
                            <option value="light" ${phoneThemeMode === 'light' ? 'selected' : ''}>白天</option>
                            <option value="dark" ${phoneThemeMode === 'dark' ? 'selected' : ''}>夜间</option>
                        </select>
                    </label>
                    <label class="phone-settings-field-inline" for="phone-home-app-label-color-mode">
                        <span>首页名称颜色</span>
                        <select id="phone-home-app-label-color-mode" class="phone-settings-select">
                            <option value="white" ${homeAppLabelColorMode === 'white' ? 'selected' : ''}>白色</option>
                            <option value="black" ${homeAppLabelColorMode === 'black' ? 'selected' : ''}>黑色</option>
                        </select>
                    </label>
                </div>
            `,
        })}

        ${buildSettingsSectionHtml({
            title: '外观资源包',
            desc: '导入官方美化包。',
            actionsHtml: `
                <div class="phone-settings-action phone-settings-action-wrap">
                    <button type="button" class="phone-settings-btn" id="phone-import-appearance-pack">
                        ${PHONE_ICONS.upload}
                        <span>导入到仓库</span>
                    </button>
                    <button type="button" class="phone-settings-btn" id="phone-export-appearance-pack">导出当前外观</button>
                    <input type="file" id="phone-appearance-pack-file" accept="application/json,.json" hidden>
                </div>
            `,
            bodyHtml: `
                <div id="phone-appearance-pack-repository" class="phone-appearance-pack-repository">
                    <div id="phone-appearance-pack-repository-list" class="phone-appearance-pack-repository-list" aria-live="polite"></div>
                </div>
            `,
        })}

        ${buildSettingsSectionHtml({
            title: '字体库',
            desc: '选择或导入字体。',
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
                    <div class="phone-settings-font-panel">
                        <label class="phone-settings-field-inline phone-settings-field-full">
                            <span>显示名称</span>
                            <input type="text" id="phone-font-url-name" class="phone-settings-input" placeholder="例如：寒蝉全圆体">
                        </label>
                        <label class="phone-settings-field-inline phone-settings-field-full">
                            <span>字体 CSS URL</span>
                            <input type="url" id="phone-font-css-url" class="phone-settings-input" placeholder="https://fontsapi.zeoseven.com/3/main/result.css" inputmode="url" spellcheck="false" autocapitalize="off" autocomplete="off">
                        </label>
                        <label class="phone-settings-field-inline phone-settings-field-full">
                            <span>字体族名</span>
                            <input type="text" id="phone-font-url-family" class="phone-settings-input" placeholder="例如：寒蝉全圆体">
                        </label>
                        <div class="phone-settings-action phone-settings-action-wrap">
                            <button type="button" class="phone-settings-btn" id="phone-import-font-url-btn">
                                <span>保存网络字体</span>
                            </button>
                        </div>
                        <div class="phone-settings-note">仅支持 HTTPS 字体 CSS 地址，需联网加载。</div>
                    </div>
                    <div class="phone-settings-note">${escapeHtml(String(userFontCount))}/${escapeHtml(String(maxFonts))} 个 · ${escapeHtml(formatBytes(totalFontBytes))}/${escapeHtml(formatBytes(maxTotalFontBytes))} · 单文件 ≤${escapeHtml(formatBytes(singleFontBytes))}</div>
                </div>
            `,
        })}

        ${buildSettingsSectionHtml({
            title: '主要内容字体大小',
            desc: '调整首页名称与通用表格文字，不影响按钮和标题栏。',
            bodyHtml: `
                <div class="phone-settings-readable-text-scale-panel">
                    <div class="phone-settings-readable-text-scale-row">
                        <input type="range" min="80" max="160" step="1" id="phone-readable-text-scale-range" value="${escapeHtmlAttr(readableTextScaleValue)}" aria-label="主要内容字体大小">
                        <input type="number" min="80" max="160" step="1" id="phone-readable-text-scale-input" class="phone-settings-input" value="${escapeHtmlAttr(readableTextScaleValue)}" aria-label="主要内容字体大小百分比">
                        <span class="phone-settings-readable-text-scale-value" id="phone-readable-text-scale-value">${escapeHtml(String(readableTextScaleValue))}%</span>
                    </div>
                </div>
            `,
        })}

        ${buildSettingsSectionHtml({
            title: '图标布局',
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
                        <input type="number" min="8" max="24" step="0.001" id="phone-app-grid-gap" class="phone-settings-input" value="${escapeHtmlAttr(layoutValues.appGridGap)}">
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
            bodyHtml: `
                <div class="phone-appearance-switch-list">
                    <label class="phone-appearance-switch-item" for="phone-hide-table-count-badge">
                        <span class="phone-appearance-switch-main">隐藏数量徽标</span>
                        <input type="checkbox" id="phone-hide-table-count-badge" class="phone-settings-switch" ${hideTableCountBadge ? 'checked' : ''}>
                    </label>
                </div>
            `,
        })}

        ${buildSettingsSectionHtml({
            title: '隐藏表格类 App',
            desc: '勾选后在首页隐藏。',
            bodyHtml: `<div id="phone-hidden-table-apps" class="phone-appearance-checklist"></div>`,
        })}

        ${buildSettingsSectionHtml({
            title: '自定义图标',
            desc: '上传或清除应用图标。',
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

function buildToggleCoverPreviewHtml(shape, coverDataUrl, sizePx = 40) {
    const safeShape = String(shape || 'circle') === 'rounded' ? 'rounded' : 'circle';
    const safeCover = String(coverDataUrl || '').trim();
    const safeSize = Number.isFinite(Number(sizePx)) ? Math.max(32, Math.min(72, Math.round(Number(sizePx)))) : 40;
    const coverStyle = safeCover
        ? `background-image:url('${escapeHtmlAttr(safeCover)}');`
        : '';
    const stateClass = safeCover ? 'has-cover' : 'no-cover';
    const shapeClass = safeShape === 'circle' ? 'is-circle' : 'is-rounded';
    const textHtml = safeShape === 'circle' || safeCover
        ? ''
        : '<span class="phone-toggle-preview-text">玉子</span>';

    return `
        <div class="phone-toggle-preview-shell">
            <div class="phone-toggle-preview-button ${shapeClass} ${stateClass}"
                style="${coverStyle}--yuzi-phone-toggle-preview-size:${escapeHtmlAttr(safeSize)}px;"
                role="img"
                aria-label="${safeCover ? '按钮封面预览' : '毛玻璃按钮预览'}">
                <span class="phone-toggle-preview-icon">${PHONE_ICONS.phone || ''}</span>
                ${textHtml}
            </div>
        </div>
    `;
}

export function buildButtonStylePageHtml({ currentSize, currentShape, currentCover, floatingToggleEnabled = true }) {
    const previewHtml = buildToggleCoverPreviewHtml(currentShape, currentCover, currentSize);

    const bodyHtml = `
        ${buildSettingsSectionHtml({
            title: '悬浮入口',
            actionsHtml: `<div class="phone-settings-action phone-settings-action-wrap"><button type="button" class="phone-settings-btn" id="phone-toggle-position-reset-btn">重置位置</button></div>`,
            bodyHtml: `<label class="phone-toggle-shape-item" for="phone-floating-toggle-enabled"><span class="phone-toggle-shape-name">显示悬浮按钮</span><input type="checkbox" id="phone-floating-toggle-enabled" ${floatingToggleEnabled ? 'checked' : ''}></label><p class="phone-settings-desc">隐藏按钮不影响已打开的手机。</p>`,
        })}

        ${buildSettingsSectionHtml({
            title: '按钮大小',
            bodyHtml: `
                <div class="phone-settings-toggle-size-row">
                    <input type="range" min="32" max="72" step="1" id="phone-toggle-style-size-range" value="${escapeHtmlAttr(currentSize)}">
                    <input type="number" min="32" max="72" step="1" id="phone-toggle-style-size-input" class="phone-settings-input" value="${escapeHtmlAttr(currentSize)}">
                </div>
                <p class="phone-settings-desc">32–72 px，默认 40。</p>
            `,
        })}

        ${buildSettingsSectionHtml({
            title: '按钮形状',
            bodyHtml: `
                <div class="phone-toggle-shape-list" id="phone-toggle-shape-list">
                    <label class="phone-toggle-shape-item">
                        <span class="phone-toggle-shape-name">长方形</span>
                        <input type="radio" name="phone-toggle-shape" value="rounded" ${currentShape === 'rounded' ? 'checked' : ''}>
                    </label>
                    <label class="phone-toggle-shape-item">
                        <span class="phone-toggle-shape-name">圆形</span>
                        <input type="radio" name="phone-toggle-shape" value="circle" ${currentShape === 'circle' ? 'checked' : ''}>
                    </label>
                </div>
            `,
        })}

        ${buildSettingsSectionHtml({
            title: '按钮封面',
            desc: '按按钮形状裁剪。',
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
        bodyClass: 'phone-app-body phone-settings-scroll phone-settings-open',
        bodyHtml,
    });
}
