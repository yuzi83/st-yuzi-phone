const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    integrationFacade: 'modules/integration.js',
    eventBridge: 'modules/integration/event-bridge.js',
    tavernHelperBridge: 'modules/integration/tavern-helper-bridge.js',
    toastBridge: 'modules/integration/toast-bridge.js',
    eventRegistry: 'modules/bootstrap/event-registry.js',
    phoneFusion: 'modules/phone-fusion.js',
    settings: 'modules/settings.js',
    slashActions: 'modules/slash-commands/command-actions.js',
    worldbookSelection: 'modules/settings-app/services/worldbook-selection.js',
    chatSupportSettingsContext: 'modules/phone-core/chat-support/settings-context.js',
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

    check(results, 'integrationFacade', 'integration façade 继续保留 event bridge re-export', has(contents.integrationFacade, "from './integration/event-bridge.js';"));
    check(results, 'integrationFacade', 'integration façade 继续保留 tavern-helper bridge re-export', has(contents.integrationFacade, "from './integration/tavern-helper-bridge.js';"));
    check(results, 'integrationFacade', 'integration façade 继续保留 toast bridge re-export', has(contents.integrationFacade, "from './integration/toast-bridge.js';"));

    check(results, 'eventRegistry', 'event-registry 改为直接从 event-bridge 导入事件监听能力', has(contents.eventRegistry, "from '../integration/event-bridge.js';"));
    check(results, 'eventRegistry', 'event-registry 不再直接从 integration façade 导入', !has(contents.eventRegistry, "from '../integration.js';"));

    check(results, 'phoneFusion', 'phone-fusion 改为直接从 toast-bridge 导入 showNotification()', has(contents.phoneFusion, "from './integration/toast-bridge.js';"));
    check(results, 'phoneFusion', 'phone-fusion 不再直接从 integration façade 导入', !has(contents.phoneFusion, "from './integration.js';"));

    check(results, 'settings', 'settings 改为直接从 toast-bridge 导入 showNotification()', has(contents.settings, "from './integration/toast-bridge.js';"));
    check(results, 'settings', 'settings 不再直接从 integration façade 导入', !has(contents.settings, "from './integration.js';"));

    check(results, 'slashActions', 'slash command actions 改为直接从 toast-bridge 导入 showNotification()', has(contents.slashActions, "from '../integration/toast-bridge.js';"));
    check(results, 'slashActions', 'slash command actions 不再直接从 integration façade 导入', !has(contents.slashActions, "from '../integration.js';"));

    check(results, 'worldbookSelection', 'worldbook-selection 改为直接从 event-bridge 导入 onWorldInfoUpdated()', has(contents.worldbookSelection, "from '../../integration/event-bridge.js';"));
    check(results, 'worldbookSelection', 'worldbook-selection 改为直接从 tavern-helper-bridge 导入世界书能力', has(contents.worldbookSelection, "from '../../integration/tavern-helper-bridge.js';"));
    check(results, 'worldbookSelection', 'worldbook-selection 不再直接从 integration façade 导入', !has(contents.worldbookSelection, "from '../../integration.js';"));

    check(results, 'chatSupportSettingsContext', 'chat-support settings-context 改为直接从 tavern-helper-bridge 导入角色与世界书能力', has(contents.chatSupportSettingsContext, "from '../../integration/tavern-helper-bridge.js';"));
    check(results, 'chatSupportSettingsContext', 'chat-support settings-context 不再直接从 integration façade 导入', !has(contents.chatSupportSettingsContext, "from '../../integration.js';"));

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
