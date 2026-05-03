const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    settingsContext: 'modules/phone-core/chat-support/settings-context.js',
    messageProjection: 'modules/phone-core/chat-support/message-projection.js',
    scrollGuards: 'modules/phone-core/scroll-guards.js',
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

    check(results, 'settingsContext', 'settings-context 使用 scoped logger', has(contents.settingsContext, "const logger = Logger.withScope({ scope: 'phone-core/chat-support/settings-context', feature: 'chat-support' });"));
    check(results, 'settingsContext', 'settings-context 角色名失败使用结构化日志', has(contents.settingsContext, "action: 'character-name.get'"));
    check(results, 'settingsContext', 'settings-context 故事上下文失败使用结构化日志', has(contents.settingsContext, "action: 'story-context.get'"));
    check(results, 'settingsContext', 'settings-context 世界书读取失败使用结构化日志', has(contents.settingsContext, "action: 'worldbook.read'"));

    check(results, 'messageProjection', 'message-projection 使用 scoped logger', has(contents.messageProjection, "const logger = Logger.withScope({ scope: 'phone-core/chat-support/message-projection', feature: 'chat-support' });"));
    check(results, 'messageProjection', 'message-projection 深拷贝失败使用结构化日志', has(contents.messageProjection, "action: 'table-data.clone'"));
    check(results, 'messageProjection', 'message-projection 投影刷新失败使用结构化日志', has(contents.messageProjection, "action: 'projection.refresh'"));

    check(results, 'scrollGuards', 'scroll-guards 使用 scoped logger', has(contents.scrollGuards, "const logger = Logger.withScope({ scope: 'phone-core/scroll-guards', feature: 'scroll-guards' });"));
    check(results, 'scrollGuards', 'scroll-guards 仍通过 logPhoneScrollDebug() 管理 debug 输出', has(contents.scrollGuards, 'function logPhoneScrollDebug(title, payload) {'));
    check(results, 'scrollGuards', 'scroll-guards 声明 ScrollDebug channel 常量', has(contents.scrollGuards, "const SCROLL_DEBUG_CHANNEL = 'ScrollDebug';"));
    check(results, 'scrollGuards', 'scroll-guards 当前保留 [ScrollDebug] 文本前缀', has(contents.scrollGuards, 'const message = `[${SCROLL_DEBUG_CHANNEL}] ${normalizedTitle}`;'));
    check(results, 'scrollGuards', 'scroll-guards 构造结构化 debug 上下文', has(contents.scrollGuards, 'debugChannel: SCROLL_DEBUG_CHANNEL'));
    check(results, 'scrollGuards', 'scroll-guards 使用结构化 scroll-debug 日志', has(contents.scrollGuards, "action: 'scroll-debug'"));

    const failed = results.filter((item) => !item.ok);
    if (failed.length > 0) {
        console.error('[chat-support-logging-contract-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[chat-support-logging-contract-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
