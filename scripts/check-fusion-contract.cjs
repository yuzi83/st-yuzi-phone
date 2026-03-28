const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    facade: 'modules/phone-fusion.js',
    templates: 'modules/phone-fusion/templates.js',
    utils: 'modules/phone-fusion/utils.js',
    runtime: 'modules/phone-fusion/runtime.js',
    interactions: 'modules/phone-fusion/interactions.js',
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

    check(results, 'facade', '继续暴露 `renderFusion()`', has(contents.facade, 'export function renderFusion(container)'));
    check(results, 'facade', '继续组合模板模块', has(contents.facade, "from './phone-fusion/templates.js'"));
    check(results, 'facade', '继续组合 runtime 模块', has(contents.facade, "from './phone-fusion/runtime.js'"));
    check(results, 'facade', '继续组合交互模块', has(contents.facade, "from './phone-fusion/interactions.js'"));

    check(results, 'templates', '存在 `buildFusionPageHtml()`', has(contents.templates, 'export function buildFusionPageHtml()'));
    check(results, 'templates', '存在 `buildFusionCompareRowHtml()`', has(contents.templates, 'export function buildFusionCompareRowHtml('));
    check(results, 'templates', '存在 `buildFusionCompareHtml()`', has(contents.templates, 'export function buildFusionCompareHtml('));
    check(results, 'templates', '存在 `buildFusionSuccessResultHtml()`', has(contents.templates, 'export function buildFusionSuccessResultHtml('));

    check(results, 'utils', '存在 `extractSheets()`', has(contents.utils, 'export function extractSheets('));
    check(results, 'utils', '存在 `pickJsonFile()`', has(contents.utils, 'export function pickJsonFile('));

    check(results, 'runtime', '存在 `cleanupFusionPageResources()`', has(contents.runtime, 'export function cleanupFusionPageResources()'));
    check(results, 'runtime', '存在 `bindFusionContainerCleanup()`', has(contents.runtime, 'export function bindFusionContainerCleanup('));
    check(results, 'runtime', '存在 `clearFusionResult()`', has(contents.runtime, 'export function clearFusionResult('));

    check(results, 'interactions', '存在 `createFusionInteractionController()`', has(contents.interactions, 'export function createFusionInteractionController('));
    check(results, 'interactions', '存在 `reportFusionError()`', has(contents.interactions, 'export function reportFusionError('));

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[fusion-contract-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[fusion-contract-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
