const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const FILES = {
    bridge: 'modules/phone-core/data-api/database-ui-bridge.js',
    panelActions: 'modules/phone-core/data-api/panel-actions.js',
    dataApi: 'modules/phone-core/data-api.js',
    homeRender: 'modules/phone-home/render.js',
    homeInteractions: 'modules/phone-home/interactions.js',
    homeActions: 'modules/phone-home/actions.js',
    homeData: 'modules/phone-home/home-data.js',
    dbBridge: 'modules/phone-core/db-bridge.js',
};

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function has(content, snippet) {
    return content.includes(snippet);
}

function count(content, snippet) {
    return content.split(snippet).length - 1;
}

function indexOfAll(content, snippets) {
    return snippets.map((snippet) => content.indexOf(snippet));
}

function isStrictlyIncreasing(indexes) {
    return indexes.every((value) => value >= 0)
        && indexes.every((value, index) => index === 0 || value > indexes[index - 1]);
}

function extractFunctionBody(content, functionName) {
    const marker = `function ${functionName}`;
    const start = content.indexOf(marker);
    if (start < 0) return '';
    const bodyStart = content.indexOf('{', start);
    if (bodyStart < 0) return '';

    let depth = 0;
    for (let index = bodyStart; index < content.length; index += 1) {
        const char = content[index];
        if (char === '{') depth += 1;
        if (char === '}') depth -= 1;
        if (depth === 0) return content.slice(bodyStart + 1, index);
    }
    return '';
}

function checkNoForbiddenTokenOutsideAllowed(results, contents, token, allowedKeys) {
    for (const [key, content] of Object.entries(contents)) {
        if (allowedKeys.includes(key)) continue;
        check(results, key, `${token} 未出现在非允许模块`, !has(content, token));
    }
}

function check(results, fileKey, description, ok) {
    results.push({ file: FILES[fileKey], description, ok });
}

function main() {
    const contents = Object.fromEntries(
        Object.entries(FILES).map(([key, relativePath]) => [key, read(relativePath)])
    );
    const results = [];

    check(results, 'bridge', 'bridge 集中持有 shujuku V2 数据库菜单选择器', has(contents.bridge, "const ACU_DATABASE_NEW_UI_MENU_SELECTOR = '#acu-v2-menu-item'"));
    check(results, 'bridge', 'bridge 探测 AutoCardUpdaterV2API', has(contents.bridge, 'targetWindow.AutoCardUpdaterV2API'));
    check(results, 'bridge', 'bridge 保留 AutoCardUpdaterAPI 旧入口 fallback', has(contents.bridge, 'targetWindow.AutoCardUpdaterAPI'));
    check(results, 'bridge', 'bridge 收口 window.top 跨窗口探测', has(contents.bridge, 'addRuntimeWindow(window.top, state)'));
    check(results, 'bridge', 'bridge 导出 openDatabaseUi()', has(contents.bridge, 'export async function openDatabaseUi()'));
    check(results, 'bridge', 'bridge 导出 openDatabaseVisualizerUi()', has(contents.bridge, 'export async function openDatabaseVisualizerUi()'));
    check(results, 'bridge', '可视化 V2 调用失败不静默降级旧 UI', has(contents.bridge, "code: 'v2_failed'") && has(contents.bridge, 'if (v2Result.code ==='));
    check(results, 'bridge', '数据库 V2 API 明确失败不静默降级菜单或旧 UI', has(contents.bridge, "if (apiResult.code === 'v2_failed')") && has(contents.bridge, '数据库新 UI 接口调用失败'));
    check(results, 'bridge', '数据库 V2 菜单点击失败有明确状态', has(contents.bridge, "code: 'v2_menu_failed'") && has(contents.bridge, 'open-ui.v2-menu-failed'));
    check(results, 'bridge', 'V2 可视化遍历所有 runtime window 后再判定失败', has(contents.bridge, 'let apiFound = false;') && has(contents.bridge, 'return apiFound') && !has(extractFunctionBody(contents.bridge, 'openDatabaseVisualizerNewUiViaApi'), "return { ok: false, source: 'v2-api', code: 'v2_failed' };"));
    check(results, 'bridge', '数据库 V2 API 遍历所有候选方法与窗口后再判定失败', has(contents.bridge, 'let apiMethodFound = false;') && has(contents.bridge, 'return apiMethodFound'));

    check(results, 'panelActions', 'panel-actions 通过 bridge 打开数据库 UI', has(contents.panelActions, "import { openDatabaseUi, openDatabaseVisualizerUi } from './database-ui-bridge.js'"));
    check(results, 'panelActions', 'panel-actions 暴露 openDatabaseUiWithStatus()', has(contents.panelActions, 'export async function openDatabaseUiWithStatus('));
    check(results, 'panelActions', 'openDatabaseSettingsWithStatus 保留兼容 wrapper 并标注语义迁移', has(contents.panelActions, 'export async function openDatabaseSettingsWithStatus(') && has(contents.panelActions, 'return openDatabaseUiWithStatus(options);') && has(contents.panelActions, '实际语义已迁移为“打开数据库 UI”'));
    check(results, 'panelActions', 'triggerManualUpdate 仍使用旧 getDB 主链', has(contents.panelActions, 'const api = getDB();') && has(contents.panelActions, 'warmDatabaseSettingsRuntimeBeforeManualUpdate(api)'));

    check(results, 'dataApi', 'data-api 导出 openDatabaseUiWithStatus', has(contents.dataApi, 'openDatabaseUiWithStatus'));
    check(results, 'dataApi', 'data-api 保留 openDatabaseSettingsWithStatus 导出', has(contents.dataApi, 'openDatabaseSettingsWithStatus'));

    check(results, 'homeRender', '主页 render 注入 openDatabaseUiWithStatus', has(contents.homeRender, 'openDatabaseUiWithStatus'));
    check(results, 'homeData', '数据库 Dock 文案指向数据库界面', has(contents.homeData, "pendingMessage: '正在打开数据库界面...'"));
    check(results, 'homeData', '数据库 Dock 不再提示设置面板', !has(contents.homeData, '正在打开数据库设置面板'));

    for (const key of ['homeRender', 'homeInteractions', 'homeActions', 'homeData']) {
        check(results, key, 'phone-home 层不直接引用 AutoCardUpdaterV2API', !has(contents[key], 'AutoCardUpdaterV2API'));
        check(results, key, 'phone-home 层不直接引用 AutoCardUpdaterAPI', !has(contents[key], 'AutoCardUpdaterAPI'));
        check(results, key, 'phone-home 层不直接引用 #acu-v2-menu-item', !has(contents[key], '#acu-v2-menu-item'));
        check(results, key, 'phone-home 层不直接访问 window.top', !has(contents[key], 'window.top'));
    }

    checkNoForbiddenTokenOutsideAllowed(results, contents, '#acu-v2-menu-item', ['bridge']);
    checkNoForbiddenTokenOutsideAllowed(results, contents, 'AutoCardUpdaterV2API', ['bridge']);
    checkNoForbiddenTokenOutsideAllowed(results, contents, 'window.top', ['bridge']);

    check(results, 'dbBridge', 'db-bridge 未混入 AutoCardUpdaterV2API', !has(contents.dbBridge, 'AutoCardUpdaterV2API'));
    check(results, 'bridge', 'V2 菜单选择器只在 bridge 中出现一次', count(contents.bridge, '#acu-v2-menu-item') === 1);

    check(results, 'bridge', '数据库 fallback 顺序为 V2 API -> V2 菜单 -> legacy settings', isStrictlyIncreasing(indexOfAll(contents.bridge, [
        'const apiResult = await openDatabaseNewUiViaApi();',
        'const menuResult = openDatabaseNewUiViaMenuEntry();',
        'const legacyResult = await openLegacyDatabaseSettings();',
    ])));
    check(results, 'homeRender', '主页 render 主路径注入 openDatabaseUiWithStatus 而不是 legacy wrapper', has(contents.homeRender, 'openDatabaseUiWithStatus') && !has(contents.homeRender, 'openDatabaseSettingsWithStatus'));

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[phone-home-shujuku-v2-entry-contract] 检查失败：');
        for (const item of failed) console.error(`- ${item.file}: ${item.description}`);
        process.exitCode = 1;
        return;
    }

    console.log('[phone-home-shujuku-v2-entry-contract] 检查通过');
    for (const item of results) console.log(`- OK | ${item.file} | ${item.description}`);
}

main();
