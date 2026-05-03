import {
    buildSettingsHeroHtml,
    buildSettingsPageFrame,
    buildSettingsSectionHtml,
} from '../primitives.js';
import { PHONE_ICONS } from '../../../phone-home/icons.js';
import { escapeHtmlAttr } from '../../../utils/dom-escape.js';

export function buildAppearancePageHtml({ layoutValues, hideTableCountBadge }) {
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
            desc: '控制表格类 App 的数量徽标是否展示，减少视觉噪音。',
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
            desc: '按需屏蔽不常用的表格入口，让首页更聚焦。',
            bodyHtml: `<div id="phone-hidden-table-apps" class="phone-appearance-checklist"></div>`,
        })}

        ${buildSettingsSectionHtml({
            title: '自定义图标',
            desc: '为不同 App 上传更具识别度的图标资源，形成统一视觉记忆。',
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
