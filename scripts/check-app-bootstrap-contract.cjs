const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    index: 'index.js',
    appBootstrap: 'modules/bootstrap/app-bootstrap.js',
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

    check(results, 'appBootstrap', '继续暴露 mountPhoneBootstrapUi()', has(contents.appBootstrap, 'export function mountPhoneBootstrapUi('));
    check(results, 'appBootstrap', '继续暴露 unmountPhoneBootstrapUi()', has(contents.appBootstrap, 'export function unmountPhoneBootstrapUi('));
    check(results, 'appBootstrap', '继续暴露 initializePhoneBootstrapUi()', has(contents.appBootstrap, 'export async function initializePhoneBootstrapUi('));
    check(results, 'appBootstrap', '继续暴露 togglePhoneBootstrapVisibility()', has(contents.appBootstrap, 'export function togglePhoneBootstrapVisibility('));
    check(results, 'appBootstrap', '继续暴露 setPhoneBootstrapEnabledState()', has(contents.appBootstrap, 'export function setPhoneBootstrapEnabledState('));
    check(results, 'appBootstrap', 'app-bootstrap 继续创建设置面板', has(contents.appBootstrap, 'createPhoneSettingsPanel'));
    check(results, 'appBootstrap', 'app-bootstrap 继续注册事件监听', has(contents.appBootstrap, 'await registerEventListeners();'));

    check(results, 'index', 'index 导入 initializePhoneBootstrapUi()', has(contents.index, 'initializePhoneBootstrapUi'));
    check(results, 'index', 'index 导入 togglePhoneBootstrapVisibility()', has(contents.index, 'togglePhoneBootstrapVisibility'));
    check(results, 'index', 'index 导入 setPhoneBootstrapEnabledState()', has(contents.index, 'setPhoneBootstrapEnabledState'));
    check(results, 'index', 'togglePhone() 继续委托 bootstrap visibility helper', has(contents.index, 'return togglePhoneBootstrapVisibility(show, {'));
    check(results, 'index', 'setPhoneEnabledWithUI() 继续委托 bootstrap enabled-state helper', has(contents.index, 'return setPhoneBootstrapEnabledState(enabled, {'));
    check(results, 'index', 'doInitialize() 继续委托 initializePhoneBootstrapUi()', has(contents.index, 'await initializePhoneBootstrapUi({'));

    const failed = results.filter((item) => !item.ok);
    if (failed.length > 0) {
        console.error('[app-bootstrap-contract-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[app-bootstrap-contract-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
