const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    notifications: 'modules/phone-core/notifications.js',
    routing: 'modules/phone-core/routing.js',
    debugTools: 'modules/phone-core/data-api/debug-tools.js',
    panelActions: 'modules/phone-core/data-api/panel-actions.js',
    presetRepository: 'modules/phone-core/data-api/preset-repository.js',
    tableRepository: 'modules/phone-core/data-api/table-repository.js',
    mutationQueue: 'modules/phone-core/data-api/mutation-queue.js',
    lockRepository: 'modules/phone-core/data-api/lock-repository.js',
    templateStore: 'modules/phone-core/chat-support/template-store.js',
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

    check(results, 'notifications', 'notifications 使用 scoped logger', has(contents.notifications, "const logger = Logger.withScope({ scope: 'phone-core/notifications', feature: 'notifications' });"));
    check(results, 'notifications', 'notifications 轮询异常使用结构化日志', has(contents.notifications, "action: 'watcher.tick'"));

    check(results, 'routing', 'routing 使用 scoped logger', has(contents.routing, "const logger = Logger.withScope({ scope: 'phone-core/routing', feature: 'route' });"));
    check(results, 'routing', 'routing route callback 失败使用结构化日志', has(contents.routing, "action: 'change.emit'"));

    check(results, 'debugTools', 'debug-tools 使用 scoped logger', has(contents.debugTools, "const logger = Logger.withScope({ scope: 'phone-core/data-api/debug-tools', feature: 'db-api' });"));
    check(results, 'debugTools', 'debug-tools 使用结构化调试快照日志', has(contents.debugTools, "action: 'api.debug'"));

    check(results, 'panelActions', 'panel-actions 使用 scoped logger', has(contents.panelActions, "const logger = Logger.withScope({ scope: 'phone-core/data-api/panel-actions', feature: 'db-api' });"));
    check(results, 'panelActions', 'panel-actions manualUpdate API 失败使用结构化日志', has(contents.panelActions, "action: 'manual-update.api'"));
    check(results, 'panelActions', 'panel-actions fallback 失败使用结构化日志', has(contents.panelActions, "action: 'manual-update.fallback'"));

    check(results, 'presetRepository', 'preset-repository 使用 scoped logger', has(contents.presetRepository, "const logger = Logger.withScope({ scope: 'phone-core/data-api/preset-repository', feature: 'db-api' });"));
    check(results, 'presetRepository', 'preset-repository 使用结构化 preset 日志', has(contents.presetRepository, "action: 'api-presets.get'"));
    check(results, 'presetRepository', 'preset-repository 使用结构化 load 日志', has(contents.presetRepository, "action: 'api-preset.load'"));

    check(results, 'tableRepository', 'table-repository 使用 scoped logger', has(contents.tableRepository, "const logger = Logger.withScope({ scope: 'phone-core/data-api/table-repository', feature: 'db-api' });"));
    check(results, 'tableRepository', 'table-repository getTableData 使用结构化日志', has(contents.tableRepository, "action: 'table-data.get'"));
    check(results, 'tableRepository', 'table-repository saveTableData 使用结构化日志', has(contents.tableRepository, "action: 'table-data.save'"));

    check(results, 'mutationQueue', 'mutation-queue 使用 scoped logger', has(contents.mutationQueue, "const logger = Logger.withScope({ scope: 'phone-core/data-api/mutation-queue', feature: 'db-api' });"));
    check(results, 'mutationQueue', 'mutation-queue 任务失败使用结构化日志', has(contents.mutationQueue, "action: 'mutation.run'"));

    check(results, 'lockRepository', 'lock-repository 使用 scoped logger', has(contents.lockRepository, "const logger = Logger.withScope({ scope: 'phone-core/data-api/lock-repository', feature: 'db-api' });"));
    check(results, 'lockRepository', 'lock-repository get lock state 使用结构化日志', has(contents.lockRepository, "action: 'lock.state.get'"));
    check(results, 'lockRepository', 'lock-repository toggle col 使用结构化日志', has(contents.lockRepository, "action: 'lock.col.toggle'"));

    check(results, 'templateStore', 'template-store 使用 scoped logger', has(contents.templateStore, "const logger = Logger.withScope({ scope: 'phone-core/chat-support/template-store', feature: 'chat-support' });"));
    check(results, 'templateStore', 'template-store 读取失败使用结构化日志', has(contents.templateStore, "action: 'prompt-template.read'"));
    check(results, 'templateStore', 'template-store 删除失败使用结构化日志', has(contents.templateStore, "action: 'prompt-template.delete'"));

    check(results, 'scrollGuards', 'scroll-guards 使用 scoped logger', has(contents.scrollGuards, "const logger = Logger.withScope({ scope: 'phone-core/scroll-guards', feature: 'scroll-guards' });"));
    check(results, 'scrollGuards', 'scroll-guards 声明 ScrollDebug channel 常量', has(contents.scrollGuards, "const SCROLL_DEBUG_CHANNEL = 'ScrollDebug';"));
    check(results, 'scrollGuards', 'scroll-guards 继续保留 ScrollDebug 文本前缀', has(contents.scrollGuards, 'const message = `[${SCROLL_DEBUG_CHANNEL}] ${normalizedTitle}`;'));
    check(results, 'scrollGuards', 'scroll-guards 构造结构化 debug 上下文', has(contents.scrollGuards, 'debugChannel: SCROLL_DEBUG_CHANNEL'));
    check(results, 'scrollGuards', 'scroll-guards 使用结构化 scroll-debug 日志', has(contents.scrollGuards, "action: 'scroll-debug'"));

    const failed = results.filter((item) => !item.ok);
    if (failed.length > 0) {
        console.error('[phone-core-structured-logging-contract-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[phone-core-structured-logging-contract-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
