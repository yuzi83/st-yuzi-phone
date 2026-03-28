const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    viewer: 'modules/table-viewer/special/feed-viewer.js',
    helpers: 'modules/table-viewer/special/feed-viewer-helpers.js',
    messageViewer: 'modules/table-viewer/special/message-viewer.js',
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

    check(results, 'viewer', 'feed-viewer 继续保留 renderFeedTable()', has(contents.viewer, 'export function renderFeedTable('));
    check(results, 'viewer', 'feed-viewer 新增导入 feed-viewer-helpers', has(contents.viewer, "from './feed-viewer-helpers.js';"));
    check(results, 'viewer', 'feed-viewer 通过 helper 获取 rowsForRender', has(contents.viewer, 'getRowsForRender(state.rowsData, stylePayload.styleOptions)'));
    check(results, 'viewer', 'feed-viewer 当前不与 message-viewer-actions 耦合', !has(contents.viewer, 'message-viewer-actions.js'));

    check(results, 'helpers', 'helpers 暴露 getRowsForRender()', has(contents.helpers, 'export function getRowsForRender('));
    check(results, 'helpers', 'helpers 暴露 renderFeedItem()', has(contents.helpers, 'export function renderFeedItem('));
    check(results, 'helpers', 'helpers 内部承接 getSavedChoice()', has(contents.helpers, 'getSavedChoice('));
    check(results, 'helpers', 'helpers 内部承接 parseCommentPairs()', has(contents.helpers, 'parseCommentPairs('));

    check(results, 'messageViewer', 'message-viewer 尚未反向耦合 feed-viewer-helpers（保持本轮边界清晰）', !has(contents.messageViewer, 'feed-viewer-helpers.js'));

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[feed-viewer-contract-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[feed-viewer-contract-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
