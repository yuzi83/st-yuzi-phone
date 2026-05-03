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
    routeRenderer: 'modules/phone-core/route-renderer.js',
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

    check(results, 'actions', '存在 showHomeToast()', has(contents.actions, 'export function showHomeToast('));
    check(results, 'actions', '存在 handleDockAction()', has(contents.actions, 'export async function handleDockAction('));

    check(results, 'data', '存在 getHomeDockApps()', has(contents.data, 'export function getHomeDockApps()'));
    check(results, 'data', '存在 normalizeHiddenTableApps()', has(contents.data, 'export function normalizeHiddenTableApps('));
    check(results, 'data', '存在 formatTableCountBadge()', has(contents.data, 'export function formatTableCountBadge('));
    check(results, 'data', '存在 getSheetRowCount()', has(contents.data, 'export function getSheetRowCount('));

    // route-renderer.js 直接动态 import 新路径
    check(results, 'routeRenderer', "route-renderer 'home' 路由动态 import phone-home/render.js", has(contents.routeRenderer, "await import('../phone-home/render.js')"));
    check(results, 'routeRenderer', "route-renderer 不再动态 import 已删除的 phone-home.js façade", !has(contents.routeRenderer, "await import('../phone-home.js')"));

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
