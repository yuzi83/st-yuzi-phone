const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    viewer: 'modules/table-viewer/special/message-viewer.js',
    helpers: 'modules/table-viewer/special/message-viewer-helpers.js',
    actions: 'modules/table-viewer/special/message-viewer-actions.js',
    feedViewer: 'modules/table-viewer/special/feed-viewer.js',
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

    check(results, 'viewer', 'message-viewer 继续保留 renderMessageTable()', has(contents.viewer, 'export function renderMessageTable('));
    check(results, 'viewer', 'message-viewer 继续导入 message-viewer-helpers', has(contents.viewer, "from './message-viewer-helpers.js';"));
    check(results, 'viewer', 'message-viewer 新增导入 message-viewer-actions', has(contents.viewer, "from './message-viewer-actions.js';"));
    check(results, 'viewer', 'message-viewer 通过动作工厂装配发送/重试链路', has(contents.viewer, 'createMessageViewerActions({'));
    check(results, 'viewer', 'message-viewer 不再内联 renderOneMessageRow()', !has(contents.viewer, 'function renderOneMessageRow('));
    check(results, 'viewer', 'message-viewer 不再内联 buildPhoneChatSystemMessages()', !has(contents.viewer, 'function buildPhoneChatSystemMessages('));
    check(results, 'viewer', 'message-viewer 不再内联 handleSendMessage()', !has(contents.viewer, 'const handleSendMessage = async ('));
    check(results, 'viewer', 'message-viewer 不再内联 handleRetryMessage()', !has(contents.viewer, 'const handleRetryMessage = async ('));

    check(results, 'helpers', 'helpers 暴露 materializeRowFromPayload()', has(contents.helpers, 'export function materializeRowFromPayload('));
    check(results, 'helpers', 'helpers 暴露 buildPhoneChatConversationMessages()', has(contents.helpers, 'export function buildPhoneChatConversationMessages('));
    check(results, 'helpers', 'helpers 暴露 buildPhoneChatSystemMessages()', has(contents.helpers, 'export function buildPhoneChatSystemMessages('));
    check(results, 'helpers', 'helpers 暴露 getRetryTarget()', has(contents.helpers, 'export function getRetryTarget('));
    check(results, 'helpers', 'helpers 暴露 renderOneMessageRow()', has(contents.helpers, 'export function renderOneMessageRow('));

    check(results, 'actions', 'actions 暴露 createMessageViewerActions()', has(contents.actions, 'export function createMessageViewerActions('));
    check(results, 'actions', 'actions 内部承接 handleSendMessage()', has(contents.actions, 'const handleSendMessage = async ('));
    check(results, 'actions', 'actions 内部承接 handleRetryMessage()', has(contents.actions, 'const handleRetryMessage = async ('));

    check(results, 'feedViewer', 'feed-viewer 尚未耦合 message-viewer-actions（保持本轮边界清晰）', !has(contents.feedViewer, 'message-viewer-actions.js'));

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[message-viewer-contract-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[message-viewer-contract-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
