const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    callbacks: 'modules/phone-core/callbacks.js',
    lifecycle: 'modules/phone-core/lifecycle.js',
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

    check(results, 'callbacks', 'callbacks 使用 scoped logger', has(contents.callbacks, "const logger = Logger.withScope({ scope: 'phone-core/callbacks', feature: 'callbacks' });"));
    check(results, 'callbacks', 'callbacks 新增 shouldSkipSmartRefresh()', has(contents.callbacks, 'function shouldSkipSmartRefresh('));
    check(results, 'callbacks', 'callbacks 新增 dispatchSmartRefreshEvent()', has(contents.callbacks, 'function dispatchSmartRefreshEvent('));
    check(results, 'callbacks', 'registerTableUpdateListener() 使用结构化注册日志', has(contents.callbacks, "action: 'table-update.register'"));
    check(results, 'callbacks', 'unregisterTableUpdateListener() 使用结构化注销日志', has(contents.callbacks, "action: 'table-update.unregister'"));
    check(results, 'callbacks', 'registerTableFillStartListener() 使用结构化注册日志', has(contents.callbacks, "action: 'table-fill-start.register'"));
    check(results, 'callbacks', 'unregisterTableFillStartListener() 使用结构化注销日志', has(contents.callbacks, "action: 'table-fill-start.unregister'"));
    check(results, 'callbacks', 'initSmartRefreshListener() 输出 setup 日志', has(contents.callbacks, "action: 'smart-refresh.setup'"));
    check(results, 'callbacks', 'smart refresh 输出 skip 日志', has(contents.callbacks, "action: 'smart-refresh.skip'"));
    check(results, 'callbacks', 'smart refresh 输出 dispatch 日志', has(contents.callbacks, "action: 'smart-refresh.dispatch'"));

    check(results, 'lifecycle', 'lifecycle 继续导入 initSmartRefreshListener()', has(contents.lifecycle, 'initSmartRefreshListener'));
    check(results, 'lifecycle', 'lifecycle 继续在 initPhoneUI() 接线 smart refresh', has(contents.lifecycle, 'initSmartRefreshListener();'));

    const failed = results.filter((item) => !item.ok);
    if (failed.length > 0) {
        console.error('[phone-core-callbacks-contract-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[phone-core-callbacks-contract-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
