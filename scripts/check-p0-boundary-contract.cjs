const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    contextBridge: 'modules/integration/context-bridge.js',
    settingsContext: 'modules/settings/context.js',
    slashHostAdapter: 'modules/slash-commands/host-adapter.js',
    dbBridge: 'modules/phone-core/db-bridge.js',
    tableRepository: 'modules/phone-core/data-api/table-repository.js',
    lockRepository: 'modules/phone-core/data-api/lock-repository.js',
    dataApiFacade: 'modules/phone-core/data-api.js',
    rowDeleteController: 'modules/table-viewer/row-delete-controller.js',
    configRepository: 'modules/phone-core/data-api/config-repository.js',
    presetRepository: 'modules/phone-core/data-api/preset-repository.js',
    aiRuntime: 'modules/phone-core/chat-support/ai-runtime.js',
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

function countMatches(content, regex) {
    return Array.from(content.matchAll(regex)).length;
}

function main() {
    const contents = Object.fromEntries(
        Object.entries(FILES).map(([key, relativePath]) => [key, read(relativePath)])
    );

    const results = [];

    check(results, 'contextBridge', 'integration context bridge 暴露 getSillyTavernContext()', has(contents.contextBridge, 'export function getSillyTavernContext()'));
    check(results, 'settingsContext', 'settings context 复用 integration context bridge', has(contents.settingsContext, "from '../integration/context-bridge.js';"));
    check(results, 'settingsContext', 'settings context 不再直接访问 window.SillyTavern', !has(contents.settingsContext, 'window.SillyTavern'));
    check(results, 'settingsContext', 'settings context 不再直接调用 SillyTavern.getContext()', !has(contents.settingsContext, 'SillyTavern.getContext'));

    check(results, 'slashHostAdapter', 'slash host adapter 复用 integration context bridge', has(contents.slashHostAdapter, "from '../integration/context-bridge.js';"));
    check(results, 'slashHostAdapter', 'slash host adapter 不再直接访问 window.SillyTavern', !has(contents.slashHostAdapter, 'window.SillyTavern'));
    check(results, 'slashHostAdapter', 'slash host adapter 不再直接调用 window.getContext()', !has(contents.slashHostAdapter, 'window.getContext'));

    check(results, 'dbBridge', 'db bridge 暴露严格布尔成功判定', has(contents.dbBridge, 'export function isDbBooleanSuccess(value)'));
    check(results, 'dbBridge', 'db bridge 布尔成功判定只接受 true', has(contents.dbBridge, 'return value === true;'));
    check(results, 'dbBridge', 'db bridge 暴露插入行号归一化', has(contents.dbBridge, 'export function normalizeDbInsertedRowIndex(value)'));

    check(results, 'tableRepository', 'table repository 使用 db bridge 严格布尔判定', has(contents.tableRepository, 'isDbBooleanSuccess'));
    check(results, 'tableRepository', 'table repository 使用 db bridge 插入行号归一化', has(contents.tableRepository, 'normalizeDbInsertedRowIndex'));
    check(results, 'tableRepository', 'table repository 不再保留 isApiBooleanSuccess 调用', !has(contents.tableRepository, 'isApiBooleanSuccess'));
    check(results, 'tableRepository', 'table repository 不再保留本地 normalizeInsertedRowIndex', !has(contents.tableRepository, 'normalizeInsertedRowIndex'));

    check(results, 'lockRepository', 'lock repository 使用严格布尔锁写入判定', has(contents.lockRepository, 'isLockWriteSuccess(value)'));
    check(results, 'lockRepository', 'lock repository 暴露删除后锁状态重排出口', has(contents.lockRepository, 'export function remapTableLockStateAfterRowDelete('));
    check(results, 'dataApiFacade', 'data-api facade 导出删除后锁状态重排出口', has(contents.dataApiFacade, 'remapTableLockStateAfterRowDelete'));

    check(results, 'rowDeleteController', 'row delete controller 通过 data-api 调用锁状态重排', has(contents.rowDeleteController, "from '../phone-core/data-api.js';"));
    check(results, 'rowDeleteController', 'row delete controller 不再直接访问 AutoCardUpdaterAPI', !has(contents.rowDeleteController, 'AutoCardUpdaterAPI'));
    check(results, 'rowDeleteController', 'row delete controller 不再定义本地 getRuntimeApi()', !has(contents.rowDeleteController, 'function getRuntimeApi'));
    check(results, 'rowDeleteController', 'row delete controller 不再直接调用 getTableLockState()', !has(contents.rowDeleteController, 'api.getTableLockState'));
    check(results, 'rowDeleteController', 'row delete controller 不再直接调用 setTableLockState()', !has(contents.rowDeleteController, 'api.setTableLockState'));

    check(results, 'configRepository', 'config repository 使用严格布尔判定', countMatches(contents.configRepository, /isDbBooleanSuccess\(/g) >= 3);
    check(results, 'presetRepository', 'preset repository 使用严格布尔判定', countMatches(contents.presetRepository, /isDbBooleanSuccess\(/g) >= 3);
    check(results, 'aiRuntime', 'AI runtime 加载 API 预设使用严格布尔判定', has(contents.aiRuntime, 'isDbBooleanSuccess(api.loadApiPreset(requestedPresetName))'));

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[p0-boundary-contract-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[p0-boundary-contract-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
