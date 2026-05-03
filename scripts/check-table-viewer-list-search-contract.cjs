const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    controller: 'modules/table-viewer/list-page-controller.js',
    renderer: 'modules/table-viewer/list-page-renderer.js',
    template: 'modules/table-viewer/list-page-template.js',
    runtime: 'modules/table-viewer/generic-runtime.js',
};

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
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

    check(results, 'controller', '继续暴露 bindGenericListPageController()', has(contents.controller, 'export function bindGenericListPageController('));
    check(results, 'controller', '搜索输入更新前记录 active 状态', has(contents.controller, 'const searchWasActive = document.activeElement === searchInput;'));
    check(results, 'controller', '搜索输入在未激活时不再强制恢复选区', has(contents.controller, 'if (!searchWasActive) return;'));
    check(results, 'controller', '搜索输入在选区已同步时不再重复恢复', has(contents.controller, 'const selectionAlreadySynced = document.activeElement === nextInput'));
    check(results, 'controller', '搜索输入仅在不同步时调用 restoreSearchSelection()', has(contents.controller, 'if (!selectionAlreadySynced) {'));
    check(results, 'controller', '已移除状态更新后无条件 restoreSearchSelection() 的旧写法', !/state\.set\('listSearchQuery', nextValue\);\s*restoreSearchSelection\(container, selectionStart, selectionEnd\);/m.test(contents.controller));
    check(results, 'controller', 'clear-search 继续显式恢复到输入起点', has(contents.controller, "restoreSearchSelection(container, 0, 0);"));
    check(results, 'controller', '删除链路已移除 updateDeleteManageRowUi() 旁路函数', !has(contents.controller, 'function updateDeleteManageRowUi(container) {'));
    check(results, 'controller', '删除链路不再直接调用 updateDeleteManageRowUi()', !has(contents.controller, 'updateDeleteManageRowUi(container);'));
    check(results, 'controller', '删除成功与否通过结构化 deleteOutcome.deleted 区分后续刷新', has(contents.controller, 'let deleteOutcome = normalizeDeleteOutcome(false);'));
    check(results, 'controller', '删除失败时不再无条件 refreshListAfterDataMutation()', /if \(deleteOutcome\.deleted\) \{\s*refreshListAfterDataMutation\(container\);\s*\}/m.test(contents.controller));

    check(results, 'renderer', 'renderer 继续支持 preserveToolbarSearch 路径', has(contents.renderer, 'if (preserveToolbarSearch) {'));
    check(results, 'renderer', 'renderer 对搜索框 value 改为差异写入', has(contents.renderer, 'if (existingSearchInput.value !== nextSearchValue) {'));
    check(results, 'renderer', 'renderer 对搜索框 disabled 改为差异写入', has(contents.renderer, 'if (existingSearchInput.disabled !== nextSearchDisabled) {'));
    check(results, 'renderer', 'renderer 继续保留 toolbarSearchState 作为搜索节点 patch 数据源', has(contents.renderer, 'toolbarSearchState: {'));
    check(results, 'renderer', 'renderer 将 deletingRowIndex 纳入 content patch 条件', has(contents.renderer, "|| changedKeySet.has('deletingRowIndex')"));
    check(results, 'renderer', 'renderer 行级 patch 不再使用易失效 cursor insertBefore', !has(contents.renderer, 'insertBefore(rowNode, cursor)'));
    check(results, 'renderer', 'renderer 行级 patch 使用实时 children 锚点重排', has(contents.renderer, 'const referenceNode = list.children[targetIndex] || null;'));
    check(results, 'renderer', 'renderer 行级 patch 使用实时锚点 insertBefore', has(contents.renderer, 'list.insertBefore(node, referenceNode);'));
    check(results, 'renderer', 'renderer 行级 patch 失败时回退到全量内容刷新', has(contents.renderer, 'contentRegion.innerHTML = regionHtml.contentHtml;'));
    check(results, 'renderer', 'renderer 行级 patch 失败日志接入 Logger', has(contents.renderer, "Logger.withScope({ scope: 'table-viewer/list-page-renderer'"));

    check(results, 'template', '模板继续提供搜索 region', has(contents.template, 'data-generic-toolbar-region="search"'));
    check(results, 'template', '模板继续提供稳定搜索输入 id', has(contents.template, 'id="phone-generic-list-search"'));
    check(results, 'template', '模板继续暴露 toolbar region 容器', has(contents.template, 'data-generic-list-region="toolbar"'));
    check(results, 'template', '模板行节点继续暴露 data-row-key', has(contents.template, 'data-row-key='));
    check(results, 'template', '模板行节点继续暴露 data-row-version', has(contents.template, 'data-row-version='));

    check(results, 'runtime', 'runtime 继续维护 LIST_STATE_REFRESH_KEYS', has(contents.runtime, 'const LIST_STATE_REFRESH_KEYS = new Set(['));
    check(results, 'runtime', 'runtime 继续对 listSearchQuery 触发局部刷新', has(contents.runtime, "'listSearchQuery'"));
    check(results, 'runtime', 'runtime 继续对 listSortDescending 触发局部刷新', has(contents.runtime, "'listSortDescending'"));
    check(results, 'runtime', 'runtime 已将 deletingRowIndex 纳入局部刷新键', has(contents.runtime, "'deletingRowIndex'"));
    check(results, 'runtime', 'runtime 继续在 list 模式下派发订阅刷新', has(contents.runtime, "if (state.mode !== 'list') return;"));
    check(results, 'runtime', 'runtime 继续通过 activeListRefreshHandler 驱动局部刷新', has(contents.runtime, 'activeListRefreshHandler(Array.isArray(changedKeys) ? changedKeys : []);'));

    const failed = results.filter((item) => !item.ok);
    if (failed.length > 0) {
        console.error('[table-viewer-list-search-contract-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[table-viewer-list-search-contract-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
