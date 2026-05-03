const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    dataBuilders: 'modules/settings-app/layout/page-builders/data-builders.js',
    page: 'modules/settings-app/pages/database.js',
    pageShell: 'modules/settings-app/ui/page-shell.js',
    controller: 'modules/settings-app/services/database-page-controller.js',
};

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function has(content, snippet) {
    return content.includes(snippet);
}

function lacks(content, snippet) {
    return !has(content, snippet);
}

function countOccurrences(content, snippet) {
    return content.split(snippet).length - 1;
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

    pushCheck(results, 'dataBuilders', '数据库页模板引入 [`buildShellRegionHtml()`](modules/view-regions.js:1)', has(contents.dataBuilders, "import { buildShellRegionHtml } from '../../../view-regions.js';"));
    pushCheck(results, 'dataBuilders', '数据库页模板声明 hero region `database-hero`', has(contents.dataBuilders, "region: 'database-hero'"));
    pushCheck(results, 'dataBuilders', '数据库页模板声明接口状态 region `database-api-status`', has(contents.dataBuilders, "region: 'database-api-status'"));
    pushCheck(results, 'dataBuilders', '数据库页模板声明预设中心 region `database-preset-section`', has(contents.dataBuilders, "region: 'database-preset-section'"));
    pushCheck(results, 'dataBuilders', '数据库页模板声明更新策略 region `database-update-config-section`', has(contents.dataBuilders, "region: 'database-update-config-section'"));
    pushCheck(results, 'dataBuilders', '数据库页模板声明同步范围 region `database-manual-selection-section`', has(contents.dataBuilders, "region: 'database-manual-selection-section'"));
    pushCheck(results, 'dataBuilders', '数据库页模板继续保留 [`#phone-db-table-checklist`](modules/settings-app/layout/page-builders/data-builders.js:129) 锚点', has(contents.dataBuilders, 'id="phone-db-table-checklist"'));
    pushCheck(results, 'dataBuilders', '数据库页 frame 使用 hero region 与分区 bodyHtml', has(contents.dataBuilders, 'heroHtml: heroRegionHtml,') && has(contents.dataBuilders, '${apiStatusSectionHtml}') && has(contents.dataBuilders, '${presetSectionHtml}') && has(contents.dataBuilders, '${updateConfigSectionHtml}') && has(contents.dataBuilders, '${manualSelectionSectionHtml}'));

    pushCheck(results, 'pageShell', '共享 page-shell 暴露 createPageShellSnapshot()', has(contents.pageShell, 'export function createPageShellSnapshot('));
    pushCheck(results, 'pageShell', '共享 page-shell 暴露 ensurePageShell()', has(contents.pageShell, 'export function ensurePageShell('));
    pushCheck(results, 'pageShell', '共享 page-shell 暴露 normalizePageShellRefreshPlan()', has(contents.pageShell, 'export function normalizePageShellRefreshPlan('));
    pushCheck(results, 'pageShell', '共享 page-shell 暴露 patchPageShell()', has(contents.pageShell, 'export function patchPageShell('));
    pushCheck(results, 'pageShell', '共享 page-shell patch 通过 replaceWith() 定向替换 region', has(contents.pageShell, 'currentRegion.replaceWith(nextRegion);'));

    pushCheck(results, 'page', '数据库页定义稳定 shell root selector', has(contents.page, "const DATABASE_PAGE_ROOT_SELECTOR = '.phone-settings-page';"));
    pushCheck(results, 'page', '数据库页定义完整 region selector 集合', has(contents.page, "hero: '[data-shell-region=\"database-hero\"]'") && has(contents.page, "apiStatus: '[data-shell-region=\"database-api-status\"]'") && has(contents.page, "preset: '[data-shell-region=\"database-preset-section\"]'") && has(contents.page, "updateConfig: '[data-shell-region=\"database-update-config-section\"]'") && has(contents.page, "manualSelection: '[data-shell-region=\"database-manual-selection-section\"]'"));
    pushCheck(results, 'page', '数据库页抽出 [`buildDatabasePagePayload()`](modules/settings-app/pages/database.js:23) 统一 frame payload', has(contents.page, 'function buildDatabasePagePayload(databaseConfigService) {'));
    pushCheck(results, 'page', '数据库页使用共享 shell snapshot / ensure / patch', has(contents.page, 'function createDatabaseShellSnapshot(framePayload) {')
        && has(contents.page, 'return createPageShellSnapshot({')
        && has(contents.page, 'const shellState = ensurePageShell(container, shellSnapshot,')
        && has(contents.page, 'patchPageShell(shellState.pageRoot, shellSnapshot,'));
    pushCheck(results, 'page', '数据库页使用共享 refresh plan normalizer 覆盖五段默认刷新', has(contents.page, 'function normalizeDatabaseRefreshPlan(refreshPlan) {')
        && has(contents.page, 'return normalizePageShellRefreshPlan(refreshPlan, {')
        && has(contents.page, 'hero: true,')
        && has(contents.page, 'apiStatus: true,')
        && has(contents.page, 'preset: true,')
        && has(contents.page, 'updateConfig: true,')
        && has(contents.page, 'manualSelection: true,'));
    pushCheck(results, 'page', '数据库页渲染入口支持 [`options.refreshPlan`](modules/settings-app/pages/database.js:109)', has(contents.page, 'export function renderDatabasePage(ctx, options = {}) {')
        && has(contents.page, 'refreshPlan: normalizeDatabaseRefreshPlan(options?.refreshPlan),'));
    pushCheck(results, 'page', '数据库页向 controller 注入 [`refreshDatabasePage()`](modules/settings-app/pages/database.js:154) 局部刷新入口', has(contents.page, 'refreshDatabasePage(refreshOptions = {}) {') && has(contents.page, 'renderDatabasePage(ctx, refreshOptions);'));
    pushCheck(results, 'page', '数据库页不再直接整页 [`container.innerHTML =`](modules/settings-app/pages/database.js:85) 重建', lacks(contents.page, 'container.innerHTML = buildDatabasePageHtml({'));

    pushCheck(results, 'controller', '数据库页 controller 建立幂等 cleanup 宿主键', has(contents.controller, "const DATABASE_INTERACTION_CLEANUP_KEY = '__stYuziPhoneDatabasePageCleanup';"));
    pushCheck(results, 'controller', '数据库页 controller 在重复绑定前执行上次 cleanup', has(contents.controller, 'const previousCleanup = container[DATABASE_INTERACTION_CLEANUP_KEY];') && has(contents.controller, "if (typeof previousCleanup === 'function') {") && has(contents.controller, 'previousCleanup();'));
    pushCheck(results, 'controller', '数据库页 controller 将本轮 cleanup 回写到 container 宿主键', has(contents.controller, 'container[DATABASE_INTERACTION_CLEANUP_KEY] = cleanupInteractions;'));
    pushCheck(results, 'controller', '数据库页 controller 提供 refreshPage 包装并保留 [`rerenderDatabaseKeepScroll()`](modules/settings-app/services/database-page-controller.js:81) fallback', has(contents.controller, 'const refreshPage = (refreshOptions = {}) => {') && has(contents.controller, "if (typeof refreshDatabasePage === 'function') {") && has(contents.controller, "if (typeof rerenderDatabaseKeepScroll === 'function') {") && countOccurrences(contents.controller, 'rerenderDatabaseKeepScroll();') === 1);
    pushCheck(results, 'controller', '数据库页 controller 刷新按钮走全区域 refreshPlan', has(contents.controller, 'const onRefreshClick = () => {') && has(contents.controller, 'hero: true,') && has(contents.controller, 'apiStatus: true,') && has(contents.controller, 'preset: true,') && has(contents.controller, 'updateConfig: true,') && has(contents.controller, 'manualSelection: true,'));
    pushCheck(results, 'controller', '数据库页 controller 的预设相关操作按区刷新而非整页重刷', countOccurrences(contents.controller, 'apiStatus: false,') >= 5 && countOccurrences(contents.controller, 'manualSelection: true,') >= 5 && has(contents.controller, 'const onPresetChange = () => {') && has(contents.controller, 'const onPresetSaveClick = () => {') && has(contents.controller, 'const onPresetOverwriteClick = () => {') && has(contents.controller, 'const onPresetDeleteClick = () => {'));
    pushCheck(results, 'controller', '数据库页 controller 的更新策略保存/重载分别使用定向 refreshPlan', has(contents.controller, 'const onUpdateConfigSaveClick = () => {') && has(contents.controller, 'manualSelection: false,') && has(contents.controller, 'const onUpdateConfigReloadClick = () => {') && has(contents.controller, 'hero: false,') && has(contents.controller, 'apiStatus: true,') && has(contents.controller, 'updateConfig: true,'));
    pushCheck(results, 'controller', '数据库页 controller 保留全选/反选本地即时交互', has(contents.controller, 'const onManualCheckAllClick = () => {') && has(contents.controller, 'checkbox.checked = true;') && has(contents.controller, 'const onManualInvertClick = () => {') && has(contents.controller, 'checkbox.checked = !checkbox.checked;'));
    pushCheck(results, 'controller', '数据库页 controller 的手动保存/恢复默认按区刷新并保留 manualSelection patch', has(contents.controller, 'const onManualSaveClick = () => {') && has(contents.controller, 'const onManualResetClick = () => {') && countOccurrences(contents.controller, 'manualSelection: true,') >= 7 && countOccurrences(contents.controller, 'updateConfig: false,') >= 2);
    pushCheck(results, 'controller', '数据库页 controller 导出 cleanup 返回值，供 page runtime 清理', has(contents.controller, 'return cleanupInteractions;'));

    const failed = results.filter((item) => !item.ok);

    if (failed.length > 0) {
        console.error('[database-page-contract-check] 检查失败：');
        failed.forEach((item) => {
            console.error(`- ${item.file}: ${item.description}`);
        });
        process.exitCode = 1;
        return;
    }

    console.log('[database-page-contract-check] 检查通过');
    results.forEach((item) => {
        console.log(`- OK | ${item.file} | ${item.description}`);
    });
}

main();
