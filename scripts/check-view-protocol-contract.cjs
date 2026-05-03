const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

// 注：阶段二 step_10 已把 phone-home.js façade 拆分并删除。
// home 渲染入口现位于 modules/phone-home/render.js。
const FILES = {
    viewRegions: 'modules/view-regions.js',
    frame: 'modules/settings-app/layout/frame.js',
    homeTemplates: 'modules/phone-home/templates.js',
    homeScreen: 'modules/phone-home/render.js',
    homeInteractions: 'modules/phone-home/interactions.js',
};

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function has(content, snippet) {
    return content.includes(snippet);
}

function pushCheck(results, fileKey, description, ok) {
    results.push({
        file: FILES[fileKey],
        description,
        ok,
    });
}

function main() {
    const contents = Object.fromEntries(
        Object.entries(FILES).map(([key, relativePath]) => [key, read(relativePath)])
    );

    const results = [];

    pushCheck(results, 'viewRegions', '中性模块导出 [`buildShellRegionHtml()`](modules/view-regions.js:3)', has(contents.viewRegions, 'export function buildShellRegionHtml({ region = \'\', contentHtml = \'\', className = \'\', attrs = \'\' }) {'));
    pushCheck(results, 'frame', 'frame 层转发导入 [`buildShellRegionHtml()`](modules/view-regions.js:3)', has(contents.frame, "import { buildShellRegionHtml } from '../../view-regions.js';"));
    pushCheck(results, 'frame', 'frame 层继续转发导出 [`buildShellRegionHtml()`](modules/view-regions.js:3)', has(contents.frame, 'buildShellRegionHtml,'));
    pushCheck(results, 'homeTemplates', 'home 模板直接消费中性 region helper', has(contents.homeTemplates, "import { buildShellRegionHtml } from '../view-regions.js';"));
    pushCheck(results, 'homeTemplates', 'home shell 输出稳定 root 标记 `data-home-shell="root"`', has(contents.homeTemplates, 'data-home-shell="root"'));
    pushCheck(results, 'homeTemplates', 'home shell 输出 `home-grid` region', has(contents.homeTemplates, "region: 'home-grid'"));
    pushCheck(results, 'homeTemplates', 'home shell 输出 `home-dock` region', has(contents.homeTemplates, "region: 'home-dock'"));
    pushCheck(results, 'homeScreen', 'home 渲染提供 [`ensureHomeShell()`](modules/phone-home.js:22) shell 复用入口', has(contents.homeScreen, 'function ensureHomeShell(container, homeShellStyle) {'));
    pushCheck(results, 'homeScreen', 'home shell 仅在 root/grid/dock 缺失时重建', has(contents.homeScreen, 'if (currentRoot instanceof HTMLElement && currentGrid instanceof HTMLElement && currentDock instanceof HTMLElement) {') && has(contents.homeScreen, 'container.innerHTML = buildHomeShellHtml(homeShellStyle);'));
    pushCheck(results, 'homeScreen', 'home shell 复用路径会更新 root style', has(contents.homeScreen, "currentRoot.setAttribute('style', String(homeShellStyle || ''));"));
    pushCheck(results, 'homeScreen', 'home 渲染通过 [`ensureHomeShell()`](modules/phone-home.js:22) 解析 shell', has(contents.homeScreen, 'const shell = ensureHomeShell(container, homeShellStyle);'));
    pushCheck(results, 'homeScreen', 'home 渲染优先消费 `home-grid` region', has(contents.homeScreen, "container.querySelector('[data-shell-region=\"home-grid\"]')"));
    pushCheck(results, 'homeScreen', 'home 渲染优先消费 `home-dock` region', has(contents.homeScreen, "container.querySelector('[data-shell-region=\"home-dock\"]')"));
    pushCheck(results, 'homeScreen', 'home 渲染保留 `.phone-app-grid` 兼容回退', has(contents.homeScreen, "|| container.querySelector('.phone-app-grid')"));
    pushCheck(results, 'homeScreen', 'home 渲染保留 `.phone-dock` 兼容回退', has(contents.homeScreen, "|| container.querySelector('.phone-dock')"));
    pushCheck(results, 'homeScreen', 'home 通过 [`patchHomeGrid()`](modules/phone-home.js:45) 局部更新 grid', has(contents.homeScreen, 'patchHomeGrid(grid, viewModel.apps);'));
    pushCheck(results, 'homeScreen', 'home grid patch 使用 [`replaceChildren()`](modules/phone-home.js:30) 清理旧节点', has(contents.homeScreen, 'grid.replaceChildren();'));
    pushCheck(results, 'homeScreen', 'home 通过 [`patchHomeDock()`](modules/phone-home.js:55) 局部更新 dock', has(contents.homeScreen, 'patchHomeDock(dock, viewModel.dockApps);'));
    pushCheck(results, 'homeScreen', 'home dock patch 使用 [`replaceChildren()`](modules/phone-home.js:59) 清理旧节点', has(contents.homeScreen, 'dock.replaceChildren();'));
    pushCheck(results, 'homeInteractions', 'grid 交互具备幂等绑定 flag', has(contents.homeInteractions, "const HOME_GRID_BOUND_FLAG = 'homeGridInteractionsBound';"));
    pushCheck(results, 'homeInteractions', 'grid 交互在重复 render 时跳过重复绑定', has(contents.homeInteractions, "grid.dataset[HOME_GRID_BOUND_FLAG] === 'true'"));
    pushCheck(results, 'homeInteractions', 'dock 交互具备幂等绑定 flag', has(contents.homeInteractions, "const HOME_DOCK_BOUND_FLAG = 'homeDockInteractionsBound';"));
    pushCheck(results, 'homeInteractions', 'dock 交互保存最新 dockApps 引用', has(contents.homeInteractions, "dock[HOME_DOCK_APPS_REF] = Array.isArray(dockApps) ? dockApps : [];"));
    pushCheck(results, 'homeInteractions', 'dock 交互点击时读取最新 dockApps 引用', has(contents.homeInteractions, 'const dockAppsRef = Array.isArray(dock[HOME_DOCK_APPS_REF])'));

    const failed = results.filter((item) => !item.ok);

    if (failed.length > 0) {
        console.error('[view-protocol-check] 检查失败：');
        failed.forEach((item) => {
            console.error(`- ${item.file}: ${item.description}`);
        });
        process.exitCode = 1;
        return;
    }

    console.log('[view-protocol-check] 检查通过');
    results.forEach((item) => {
        console.log(`- OK | ${item.file} | ${item.description}`);
    });
}

main();
