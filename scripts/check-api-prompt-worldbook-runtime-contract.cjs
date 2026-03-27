const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    facade: 'modules/settings-app/services/api-prompt-worldbook-runtime.js',
    renderers: 'modules/settings-app/services/api-prompt-worldbook-runtime/renderers.js',
    stateActions: 'modules/settings-app/services/api-prompt-worldbook-runtime/state-actions.js',
    subscription: 'modules/settings-app/services/api-prompt-worldbook-runtime/subscription.js',
    page: 'modules/settings-app/pages/api-prompt-config.js',
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

    check(results, 'facade', '继续暴露 createApiPromptWorldbookRuntime()', has(contents.facade, 'export function createApiPromptWorldbookRuntime('));
    check(results, 'facade', '继续组合 createWorldbookRenderers()', has(contents.facade, 'createWorldbookRenderers('));
    check(results, 'facade', '继续组合 createWorldbookStateActions()', has(contents.facade, 'createWorldbookStateActions('));
    check(results, 'facade', '继续组合 createWorldbookSubscription()', has(contents.facade, 'createWorldbookSubscription('));

    check(results, 'renderers', '存在 createWorldbookRenderers()', has(contents.renderers, 'export function createWorldbookRenderers('));
    check(results, 'stateActions', '存在 createWorldbookStateActions()', has(contents.stateActions, 'export function createWorldbookStateActions('));
    check(results, 'subscription', '存在 createWorldbookSubscription()', has(contents.subscription, 'export function createWorldbookSubscription('));

    check(results, 'page', '继续从 façade 导入 createApiPromptWorldbookRuntime()', has(contents.page, "from '../services/api-prompt-worldbook-runtime.js';"));
    check(results, 'page', '继续调用 createApiPromptWorldbookRuntime()', has(contents.page, 'createApiPromptWorldbookRuntime({'));
    check(results, 'page', '继续解构 bindWorldbookSubscription', has(contents.page, 'bindWorldbookSubscription,'));
    check(results, 'page', '继续解构 initWorldbook', has(contents.page, 'initWorldbook,'));
    check(results, 'page', '继续解构 refreshWorldbook', has(contents.page, 'refreshWorldbook,'));

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[api-prompt-worldbook-runtime-contract-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[api-prompt-worldbook-runtime-contract-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
