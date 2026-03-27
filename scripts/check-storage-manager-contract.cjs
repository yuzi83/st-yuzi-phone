const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    facade: 'modules/storage-manager.js',
    core: 'modules/storage-manager/core.js',
    manager: 'modules/storage-manager/manager.js',
    choiceStore: 'modules/table-viewer/special/choice-store.js',
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

    check(results, 'facade', '继续 re-export createStorageManager()', has(contents.facade, 'createStorageManager,'));
    check(results, 'facade', '继续 re-export getSessionStorageNamespace()', has(contents.facade, 'getSessionStorageNamespace,'));
    check(results, 'facade', '继续 re-export detectStorageErrorType()', has(contents.facade, 'detectStorageErrorType,'));

    check(results, 'core', '存在 detectStorageErrorType()', has(contents.core, 'export function detectStorageErrorType('));
    check(results, 'core', '存在 loadIndex()', has(contents.core, 'export function loadIndex('));
    check(results, 'core', '存在 saveIndex()', has(contents.core, 'export function saveIndex('));
    check(results, 'core', '存在 writeRaw()', has(contents.core, 'export function writeRaw('));

    check(results, 'manager', '存在 createStorageManager()', has(contents.manager, 'export function createStorageManager('));
    check(results, 'manager', '存在 getSessionStorageNamespace()', has(contents.manager, 'export function getSessionStorageNamespace('));

    check(results, 'choiceStore', '继续从 façade 导入 createStorageManager 与 getSessionStorageNamespace', has(contents.choiceStore, "from '../../storage-manager.js';"));
    check(results, 'choiceStore', '继续调用 createStorageManager()', has(contents.choiceStore, 'createStorageManager({'));
    check(results, 'choiceStore', '继续调用 getSessionStorageNamespace()', has(contents.choiceStore, "getSessionStorageNamespace('specialChoices')"));

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[storage-manager-contract-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[storage-manager-contract-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
