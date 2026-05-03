const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

// 注：阶段二 step_12 已删除 modules/storage-manager.js façade。
// feed 专属视图删除后，原 choice-store 调用方也已移除，本检查只覆盖 storage-manager 自身边界。
const FILES = {
    core: 'modules/storage-manager/core.js',
    manager: 'modules/storage-manager/manager.js',
};

const FACADE_RELATIVE_PATH = 'modules/storage-manager.js';

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
        description: 'storage-manager façade 已删除',
        ok: !exists(FACADE_RELATIVE_PATH),
    });

    check(results, 'core', '存在 detectStorageErrorType()', has(contents.core, 'export function detectStorageErrorType('));
    check(results, 'core', '存在 loadIndex()', has(contents.core, 'export function loadIndex('));
    check(results, 'core', '存在 saveIndex()', has(contents.core, 'export function saveIndex('));
    check(results, 'core', '存在 writeRaw()', has(contents.core, 'export function writeRaw('));

    check(results, 'manager', '存在 createStorageManager()', has(contents.manager, 'export function createStorageManager('));
    check(results, 'manager', '存在 getSessionStorageNamespace()', has(contents.manager, 'export function getSessionStorageNamespace('));

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
