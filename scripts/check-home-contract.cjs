const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

// 注：façade modules/phone-home.js 已在阶段二 step_10 拆分并删除。
// 主屏渲染入口现位于 modules/phone-home/render.js，
// 主屏交互 runtime 现位于 modules/phone-home/runtime.js，
// PHONE_ICONS 仍然由 modules/phone-home/icons.js 直接导出。
const FILES = {
    render: 'modules/phone-home/render.js',
    runtime: 'modules/phone-home/runtime.js',
    icons: 'modules/phone-home/icons.js',
    templates: 'modules/phone-home/templates.js',
    actions: 'modules/phone-home/actions.js',
    data: 'modules/phone-home/home-data.js',
    viewModel: 'modules/phone-home/view-model.js',
    qqAppDefinition: 'modules/qq-v2/app-definition.js',
    settingsSchema: 'modules/settings/schema.js',
    routeRenderer: 'modules/phone-core/route-renderer.js',
    dbBridge: 'modules/phone-core/db-bridge.js',
    homeCss: 'styles/phone-base/02-page-home.css',
    tokens: 'styles/phone-base/00-phone-tokens.css',
};

const FACADE_RELATIVE_PATH = 'modules/phone-home.js';

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function exists(relativePath) {
    return fs.existsSync(path.join(ROOT, relativePath));
}

function has(content, snippet) {
    return content.includes(snippet);
}

function check(results, fileKey, description, ok) {
    results.push({ file: FILES[fileKey], description, ok });
}

function main() {
    const contents = Object.fromEntries(
        Object.entries(FILES).map(([key, relativePath]) => [key, read(relativePath)])
    );

    const results = [];

    // façade 已删除：物理校验
    results.push({
        file: FACADE_RELATIVE_PATH,
        description: 'phone-home façade 已删除',
        ok: !exists(FACADE_RELATIVE_PATH),
    });

    // render.js 暴露主屏渲染入口
    check(results, 'render', 'render 暴露 renderHomeScreen()', has(contents.render, 'export function renderHomeScreen(container)'));
    check(results, 'render', 'render 暴露 ensureHomeShell()', has(contents.render, 'export function ensureHomeShell(container, homeShellStyle)'));
    check(results, 'render', 'render 暴露 patchHomeGrid()', has(contents.render, 'export function patchHomeGrid(grid'));
    check(results, 'render', 'render 暴露 patchHomeDock()', has(contents.render, 'export function patchHomeDock(dock'));
    check(results, 'render', 'render 直接组合模板模块', has(contents.render, "from './templates.js'"));
    check(results, 'render', 'render 直接组合 view-model 模块', has(contents.render, "from './view-model.js'"));
    check(results, 'render', 'render 直接组合交互绑定模块', has(contents.render, "from './interactions.js'"));
    check(results, 'render', 'render 直接组合 runtime 模块', has(contents.render, "from './runtime.js'"));
    check(results, 'render', 'render 存在首页 App 名称颜色 token 映射函数', has(contents.render, 'function resolveHomeAppLabelColorTokens(mode)'));
    check(results, 'render', 'render 读取 homeAppLabelColorMode 并映射首页标签颜色', has(contents.render, 'phoneSettings.homeAppLabelColorMode') && has(contents.render, 'resolveHomeAppLabelColorTokens('));
    check(results, 'render', 'render 的标签颜色映射只引用深浅壁纸 token', has(contents.render, "'var(--yuzi-phone-home-app-label-color-on-light)'")
        && has(contents.render, "'var(--yuzi-phone-home-app-label-color-on-dark)'")
        && !has(contents.render, "color: 'rgba("));
    check(results, 'render', 'render 将首页 App 名称颜色模式标记在首页根节点', has(contents.render, 'shell.root.dataset.homeAppLabelColorMode ='));
    check(results, 'render', 'Dock 由独立 glass material 承载动态动作', has(contents.render, "material.className = 'phone-dock-material';")
        && has(contents.render, 'dock.appendChild(material);')
        && has(contents.render, 'material.appendChild(el);'));
    check(results, 'render', 'Dock 动态动作保留无障碍名称', has(contents.render, "el.setAttribute('aria-label', String(app.name || ''))"));
    check(results, 'render', '网格间距保留 Figma 小数基线，不走整数钳制', has(contents.render, 'function clampHomeGridGap(value)')
        && has(contents.render, 'const appGridGap = clampHomeGridGap(phoneSettings.appGridGap);'));
    check(results, 'render', '主页空表首屏只做有限的可见态重试', has(contents.render, 'HOME_TABLE_READY_RETRY_MAX = 6')
        && has(contents.render, "getCurrentRoute() !== 'home'")
        && has(contents.render, "classList.contains('visible')")
        && has(contents.render, 'runtime.setInterval(')
        && has(contents.render, 'getSheetKeys(getTableData()).length > 0')
        && !has(contents.render, 'subscribeTableUpdate'));
    check(results, 'dbBridge', '数据库桥接从顶层同源窗口逐级回退查找 API', has(contents.dbBridge, 'while (cursor && !windows.includes(cursor))')
        && has(contents.dbBridge, 'for (let index = windows.length - 1; index >= 0; index -= 1)')
        && has(contents.dbBridge, 'AutoCardUpdaterAPI'));

    // runtime.js 暴露主屏交互 runtime 工厂
    check(results, 'runtime', 'runtime 暴露 ensureHomeInteractionRuntime()', has(contents.runtime, 'export function ensureHomeInteractionRuntime(container)'));
    check(results, 'runtime', 'runtime 暴露 HOME_INTERACTION_RUNTIME_KEY 常量', has(contents.runtime, "export const HOME_INTERACTION_RUNTIME_KEY = '__yuziHomeInteractionRuntime'"));

    // icons.js 仍然提供 PHONE_ICONS / 工具方法
    check(results, 'icons', '存在 PHONE_ICONS', has(contents.icons, 'export const PHONE_ICONS = {'));
    check(results, 'icons', '存在 getIconForSheet()', has(contents.icons, 'export function getIconForSheet(sheetName)'));
    check(results, 'icons', '存在 getTextIcon()', has(contents.icons, 'export function getTextIcon(letter, colorA, colorB)'));

    // templates.js / actions.js / data.js 内部 API 表面保持不变
    check(results, 'templates', '存在 buildHomeShellStyleText()', has(contents.templates, 'export function buildHomeShellStyleText('));
    check(results, 'templates', '存在 buildHomeShellHtml()', has(contents.templates, 'export function buildHomeShellHtml('));
    check(results, 'templates', '存在 buildHomeAppItemHtml()', has(contents.templates, 'export function buildHomeAppItemHtml('));
    check(results, 'templates', '存在 buildDockItemHtml()', has(contents.templates, 'export function buildDockItemHtml('));
    check(results, 'templates', '主页模板将用户布局设置注入新主屏运行时变量', has(contents.templates, '--yuzi-phone-home-app-icon-size:')
        && has(contents.templates, '--yuzi-phone-home-grid-columns:')
        && has(contents.templates, '--yuzi-phone-home-grid-column-gap:')
        && has(contents.templates, '--yuzi-phone-home-dock-icon-size:'));
    check(results, 'templates', '主页模板注入首页标签颜色 CSS 变量', has(contents.templates, '--yuzi-phone-home-app-label-color:')
        && has(contents.templates, '--yuzi-phone-home-app-label-shadow:'));
    check(results, 'templates', '主页模板不再渲染黑色遮罩层', !has(contents.templates, 'phone-home-overlay'));

    check(results, 'actions', '存在 showHomeToast()', has(contents.actions, 'export function showHomeToast('));
    check(results, 'actions', '存在 handleDockAction()', has(contents.actions, 'export async function handleDockAction('));

    check(results, 'data', '存在 getHomeDockApps()', has(contents.data, 'export function getHomeDockApps()'));
    check(results, 'data', '存在 normalizeHiddenTableApps()', has(contents.data, 'export function normalizeHiddenTableApps('));
    check(results, 'data', '存在 formatTableCountBadge()', has(contents.data, 'export function formatTableCountBadge('));
    check(results, 'data', '存在 getSheetRowCount()', has(contents.data, 'export function getSheetRowCount('));

    check(results, 'qqAppDefinition', 'QQ 系统 App 定义保持稳定', has(contents.qqAppDefinition, 'export const QQ_APP = Object.freeze({')
        && has(contents.qqAppDefinition, "id: '__qq__'")
        && has(contents.qqAppDefinition, "route: 'qq'")
        && has(contents.qqAppDefinition, 'isSystemApp: true'));
    check(results, 'viewModel', '首页复用 QQ 系统 App 定义', has(contents.viewModel, "from '../qq-v2/app-definition.js'"));
    check(results, 'viewModel', 'QQ 遵循首页隐藏 App 设置', has(contents.viewModel, 'if (!hiddenTableApps[QQ_APP.id]) {'));
    check(results, 'viewModel', 'QQ 图标保留 appIcons.__qq__ 覆盖', has(contents.viewModel, 'const qqCustomIcon = phoneSettings?.appIcons?.[QQ_APP.id] || \'\';'));
    check(results, 'viewModel', 'QQ 默认图标颜色引用公共 token', has(contents.viewModel, "'var(--yuzi-phone-home-qq-icon-start)'")
        && has(contents.viewModel, "'var(--yuzi-phone-home-qq-icon-end)'"));

    check(results, 'settingsSchema', '新设置默认值使用 Figma 主屏图标与网格基线', has(contents.settingsSchema, 'appIconSize: 64,')
        && has(contents.settingsSchema, 'appGridGap: 20.667,')
        && has(contents.settingsSchema, 'dockIconSize: 64,'));

    // 主页背景视觉合同：用户壁纸不得被固定整屏黑幕压暗。
    check(results, 'homeCss', '主页 CSS 不再定义黑幕 overlay', !has(contents.homeCss, '.phone-home-overlay'));
    check(results, 'homeCss', '主页 CSS 不再硬编码 15% 黑色遮罩', !has(contents.homeCss, 'rgba(0, 0, 0, 0.15)'));
    check(results, 'homeCss', '主页默认壁纸通过登记 token 引用', has(contents.homeCss, 'background-image: var(--yuzi-phone-home-wallpaper-image);'));
    check(results, 'homeCss', '主页不再保留旧暖色渐变背景', !has(contents.homeCss, 'linear-gradient(180deg, #f4efe6'));
    check(results, 'homeCss', '主页 App 名称通过受控 CSS 变量保障可读性', has(contents.homeCss, '.phone-app-label')
        && has(contents.homeCss, 'color: var(--yuzi-phone-home-app-label-color);')
        && has(contents.homeCss, 'text-shadow: var(--yuzi-phone-home-app-label-shadow);'));
    check(results, 'homeCss', '主页网格消费 Figma 主屏布局 token', has(contents.homeCss, 'grid-template-columns: repeat(var(--yuzi-phone-home-grid-columns), minmax(0, 1fr));')
        && has(contents.homeCss, 'grid-auto-rows: var(--yuzi-phone-home-app-slot-height);')
        && has(contents.homeCss, 'column-gap: var(--yuzi-phone-home-grid-column-gap);')
        && has(contents.homeCss, 'row-gap: var(--yuzi-phone-home-grid-row-gap);'));
    check(results, 'homeCss', 'Dock 根节点与 glass material 分层', has(contents.homeCss, '.phone-dock-material {')
        && has(contents.homeCss, 'backdrop-filter: blur(var(--yuzi-phone-home-dock-glass-blur));')
        && has(contents.homeCss, 'display: var(--yuzi-phone-home-dock-label-display);'));
    check(results, 'homeCss', '玻璃材质不使用遮罩伪元素或混合模式', !has(contents.homeCss, '.phone-dock-material::before')
        && !has(contents.homeCss, '.phone-home-status-card::before')
        && !has(contents.homeCss, 'mix-blend-mode:'));
    check(results, 'homeCss', '主页不渲染未映射搜索胶囊', !has(contents.homeCss, 'phone-home-search'));

    // route-renderer.js 直接动态 import 新路径
    check(results, 'routeRenderer', "route-renderer 'home' 路由动态 import phone-home/render.js", has(contents.routeRenderer, "await import('../phone-home/render.js')"));
    check(results, 'routeRenderer', "route-renderer 不再动态 import 已删除的 phone-home.js façade", !has(contents.routeRenderer, "await import('../phone-home.js')"));

    check(results, 'homeCss', 'legacy dock material stays on the Figma dock surface', has(contents.homeCss, 'background: var(--yuzi-phone-home-dock-glass-background);')
        && has(contents.homeCss, 'backdrop-filter: blur(var(--yuzi-phone-home-dock-glass-blur));')
        && has(contents.homeCss, 'box-shadow: var(--yuzi-phone-shadow-medium);'));
    check(results, 'homeCss', 'legacy status-card material remains distinct from the dock', has(contents.homeCss, 'background: var(--yuzi-phone-home-status-glass-background);')
        && has(contents.homeCss, 'backdrop-filter: blur(var(--yuzi-phone-home-status-glass-blur)) saturate(var(--yuzi-phone-home-status-glass-saturation));')
        && has(contents.homeCss, 'box-shadow: var(--yuzi-phone-home-status-glass-shadow);'));
    check(results, 'tokens', 'legacy home glass values are public tokens', has(contents.tokens, '--yuzi-phone-home-glass-border-width: 1px;')
        && has(contents.tokens, '--yuzi-phone-home-glass-border-color: rgba(255, 255, 255, 0.15);')
        && has(contents.tokens, '--yuzi-phone-home-dock-glass-background: rgba(255, 255, 255, 0.2);')
        && has(contents.tokens, '--yuzi-phone-home-dock-glass-blur: 30px;')
        && has(contents.tokens, '--yuzi-phone-home-status-glass-background: rgba(255, 255, 255, 0.08);')
        && has(contents.tokens, '--yuzi-phone-home-status-glass-blur: 20px;')
        && has(contents.tokens, '--yuzi-phone-home-status-glass-saturation: 1.6;'));

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[home-contract-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[home-contract-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
