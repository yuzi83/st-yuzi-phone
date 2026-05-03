const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

// 注：阶段二 step_12 已删除 modules/integration.js façade。
// 本脚本现在校验：
//   1. façade 物理已删除
//   2. 所有调用方直接从 integration/event-bridge.js / tavern-helper-bridge.js / toast-bridge.js 导入
//   3. 没有任何调用方仍然 import '../integration.js'
const FILES = {
    eventBridge: 'modules/integration/event-bridge.js',
    tavernHelperBridge: 'modules/integration/tavern-helper-bridge.js',
    toastBridge: 'modules/integration/toast-bridge.js',
    cleanup: 'modules/integration/cleanup.js',
    eventRegistry: 'modules/bootstrap/event-registry.js',
    indexEntry: 'index.js',
    phoneFusionRender: 'modules/phone-fusion/render.js',
    settings: 'modules/settings.js',
    slashActions: 'modules/slash-commands/command-actions.js',
    worldbookSelection: 'modules/settings-app/services/worldbook-selection.js',
    chatSupportSettingsContext: 'modules/phone-core/chat-support/settings-context.js',
};

const FACADE_RELATIVE_PATH = 'modules/integration.js';

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function exists(relativePath) {
    return fs.existsSync(path.join(ROOT, relativePath));
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

    // façade 已删除：物理校验
    results.push({
        file: FACADE_RELATIVE_PATH,
        description: 'integration façade 已删除',
        ok: !exists(FACADE_RELATIVE_PATH),
    });

    // 子模块 API 表面继续保持
    check(results, 'eventBridge', 'event-bridge 暴露 EventTypes', has(contents.eventBridge, 'export const EventTypes'));
    check(results, 'eventBridge', 'event-bridge 暴露 onEvent', has(contents.eventBridge, 'export async function onEvent') || has(contents.eventBridge, 'export function onEvent') || has(contents.eventBridge, 'export const onEvent'));
    check(results, 'tavernHelperBridge', 'tavern-helper-bridge 暴露 getChatMessages', has(contents.tavernHelperBridge, 'getChatMessages'));
    check(results, 'toastBridge', 'toast-bridge 暴露 showNotification', has(contents.toastBridge, 'export function showNotification') || has(contents.toastBridge, 'export const showNotification'));
    check(results, 'cleanup', 'cleanup 暴露 cleanupIntegration()', has(contents.cleanup, 'export function cleanupIntegration'));

    // 调用方直接从子模块导入
    check(results, 'indexEntry', 'index 改为直接从 cleanup 导入 cleanupIntegration()', has(contents.indexEntry, "from './modules/integration/cleanup.js'"));
    check(results, 'indexEntry', 'index 改为直接从 toast-bridge 导入 showNotification()', has(contents.indexEntry, "from './modules/integration/toast-bridge.js'"));
    check(results, 'indexEntry', 'index 改为直接从 tavern-helper-bridge 导入消息能力', has(contents.indexEntry, "from './modules/integration/tavern-helper-bridge.js'"));
    check(results, 'indexEntry', 'index 不再从 integration façade 导入', !has(contents.indexEntry, "from './modules/integration.js'"));

    check(results, 'eventRegistry', 'event-registry 直接从 event-bridge 导入事件监听能力', has(contents.eventRegistry, "from '../integration/event-bridge.js';"));
    check(results, 'eventRegistry', 'event-registry 不再从 integration façade 导入', !has(contents.eventRegistry, "from '../integration.js';"));

    check(results, 'phoneFusionRender', 'phone-fusion render 直接从 toast-bridge 导入 showNotification()', has(contents.phoneFusionRender, "from '../integration/toast-bridge.js';"));
    check(results, 'phoneFusionRender', 'phone-fusion render 不再从 integration façade 导入', !has(contents.phoneFusionRender, "from '../integration.js';"));

    check(results, 'settings', 'settings 直接从 toast-bridge 导入 showNotification()', has(contents.settings, "from './integration/toast-bridge.js';"));
    check(results, 'settings', 'settings 不再从 integration façade 导入', !has(contents.settings, "from './integration.js';"));

    check(results, 'slashActions', 'slash command actions 直接从 toast-bridge 导入 showNotification()', has(contents.slashActions, "from '../integration/toast-bridge.js';"));
    check(results, 'slashActions', 'slash command actions 不再从 integration façade 导入', !has(contents.slashActions, "from '../integration.js';"));

    check(results, 'worldbookSelection', 'worldbook-selection 直接从 event-bridge 导入 onWorldInfoUpdated()', has(contents.worldbookSelection, "from '../../integration/event-bridge.js';"));
    check(results, 'worldbookSelection', 'worldbook-selection 直接从 tavern-helper-bridge 导入世界书能力', has(contents.worldbookSelection, "from '../../integration/tavern-helper-bridge.js';"));
    check(results, 'worldbookSelection', 'worldbook-selection 不再从 integration façade 导入', !has(contents.worldbookSelection, "from '../../integration.js';"));

    check(results, 'chatSupportSettingsContext', 'chat-support settings-context 直接从 tavern-helper-bridge 导入角色与世界书能力', has(contents.chatSupportSettingsContext, "from '../../integration/tavern-helper-bridge.js';"));
    check(results, 'chatSupportSettingsContext', 'chat-support settings-context 不再从 integration façade 导入', !has(contents.chatSupportSettingsContext, "from '../../integration.js';"));

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[integration-import-convergence-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[integration-import-convergence-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
