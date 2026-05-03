const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    errorHandler: 'modules/error-handler.js',
    runtimeManager: 'modules/runtime-manager.js',
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

    check(results, 'errorHandler', 'error-handler 新增 serializeLogError()', has(contents.errorHandler, 'function serializeLogError(error) {'));
    check(results, 'errorHandler', 'error-handler 新增 normalizeLogData()', has(contents.errorHandler, 'function normalizeLogData(value, depth = 0) {'));
    check(results, 'errorHandler', 'error-handler 新增 normalizeLogPayload()', has(contents.errorHandler, 'function normalizeLogPayload(payload = []) {'));
    check(results, 'errorHandler', 'error-handler notify() 使用结构化 raw console 前缀', has(contents.errorHandler, "feature: 'notification'"));
    check(results, 'errorHandler', 'error-handler 暴露 errorLogger scoped logger', has(contents.errorHandler, "const errorLogger = Logger.withScope({ scope: 'error-handler', feature: 'error-handler' });"));
    check(results, 'errorHandler', 'handleError() 使用 errorLogger.error descriptor', has(contents.errorHandler, 'errorLogger.error({'));
    check(results, 'errorHandler', 'reportError() 使用 errorLogger.debug descriptor', has(contents.errorHandler, "action: 'report.pending'"));
    check(results, 'errorHandler', 'tryOrDefault() 使用结构化 warn descriptor', has(contents.errorHandler, "action: 'try-default.sync'"));
    check(results, 'errorHandler', 'tryOrDefaultAsync() 使用结构化 warn descriptor', has(contents.errorHandler, "action: 'try-default.async'"));

    check(results, 'runtimeManager', 'runtime-manager logError() 使用结构化 Logger.warn', has(contents.runtimeManager, "action: 'scope.invoke'"));
    check(results, 'runtimeManager', 'runtime-manager 空闲任务使用结构化 Logger.warn', has(contents.runtimeManager, "action: 'idle-task.execute'"));
    check(results, 'runtimeManager', 'runtime-manager 防抖任务使用结构化 Logger.warn', has(contents.runtimeManager, "action: 'debounce-task.execute'"));

    const failed = results.filter((item) => !item.ok);
    if (failed.length > 0) {
        console.error('[error-handler-contract-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[error-handler-contract-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
