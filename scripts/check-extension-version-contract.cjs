#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(projectRoot, 'manifest.json');
const indexPath = path.join(projectRoot, 'index.js');
const packageJsonPath = path.join(projectRoot, 'package.json');
const packageLockPath = path.join(projectRoot, 'package-lock.json');
const stylePath = path.join(projectRoot, 'style.css');
const scriptLoaderPath = path.join(projectRoot, '酒馆助手脚本-玉子手机.json');

function fail(message) {
    throw new Error(`[version-contract] ${message}`);
}

function readUtf8(filePath) {
    return fs.readFileSync(filePath, 'utf8');
}

function assertMatch(content, regex, description) {
    const match = content.match(regex);
    if (!match) {
        fail(`未找到${description}`);
    }

    return match;
}

function readJson(filePath, description) {
    try {
        return JSON.parse(readUtf8(filePath));
    } catch (error) {
        fail(`${description} 不是合法 JSON：${error.message}`);
    }
}

function assertSameVersion(description, actualVersion, expectedVersion) {
    if (actualVersion !== expectedVersion) {
        fail(`${description} 的版本 ${actualVersion || '(空)'} 与 manifest.json 的版本 ${expectedVersion} 不一致`);
    }
}

try {
    const manifest = readJson(manifestPath, 'manifest.json');
    const indexSource = readUtf8(indexPath);
    const packageJson = readJson(packageJsonPath, 'package.json');
    const packageLock = readJson(packageLockPath, 'package-lock.json');
    const styleSource = readUtf8(stylePath);
    const scriptLoader = readJson(scriptLoaderPath, '酒馆助手脚本-玉子手机.json');
    const manifestVersion = manifest.version;

    if (typeof manifestVersion !== 'string' || !manifestVersion.trim()) {
        fail('[`manifest.json`](manifest.json) 的 [`version`](manifest.json:9) 缺失或不是非空字符串');
    }

    assertSameVersion('package.json version', packageJson.version, manifestVersion);
    assertSameVersion('package-lock.json root version', packageLock.version, manifestVersion);
    assertSameVersion('package-lock.json packages[""] version', packageLock.packages?.['']?.version, manifestVersion);

    const constantMatch = assertMatch(
        indexSource,
        /const\s+EXTENSION_VERSION\s*=\s*'([^']+)'\s*;/,
        '[`index.js`](index.js) 中的 [`EXTENSION_VERSION`](index.js:54) 常量'
    );
    const jsVersion = constantMatch[1];

    if (jsVersion !== manifestVersion) {
        fail(`[` + '`manifest.json`' + `](manifest.json:9) 的版本 ${manifestVersion} 与 [` + '`index.js`' + `](index.js:54) 的 EXTENSION_VERSION=${jsVersion} 不一致`);
    }

    const headerMatch = assertMatch(
        indexSource,
        /\*\s+@version\s+([^\s]+)\s*/,
        '[`index.js`](index.js) 文件头 `@version` 注释'
    );
    const headerVersion = headerMatch[1];

    if (headerVersion !== manifestVersion) {
        fail(`[` + '`index.js`' + `](index.js:4) 的注释版本 ${headerVersion} 与 [` + '`manifest.json`' + `](manifest.json:9) 的版本 ${manifestVersion} 不一致`);
    }

    const styleVersionMatch = assertMatch(
        styleSource,
        /\*\s+@version\s+([^\s]+)\s*/,
        '[`style.css`](style.css) 文件头 `@version` 注释'
    );
    const styleVersion = styleVersionMatch[1];
    if (styleVersion !== manifestVersion) {
        fail(`[` + '`style.css`' + `](style.css:12) 的注释版本 ${styleVersion} 与 [` + '`manifest.json`' + `](manifest.json:9) 的版本 ${manifestVersion} 不一致`);
    }

    if (!/context:\s*\{\s*version:\s*EXTENSION_VERSION\s*\}/.test(indexSource)) {
        fail('[`index.js`](index.js:206) 初始化日志没有使用 [`EXTENSION_VERSION`](index.js:54)');
    }

    if (!/showNotification\(`玉子手机已加载 \(v\$\{EXTENSION_VERSION\}\)`\s*,\s*'success'\s*\)/.test(indexSource)) {
        fail('[`index.js`](index.js:208) 加载通知没有使用 [`EXTENSION_VERSION`](index.js:54) 模板字符串');
    }

    const loaderContent = scriptLoader.content;
    if (typeof loaderContent !== 'string' || !loaderContent.trim()) {
        fail('[`酒馆助手脚本-玉子手机.json`](酒馆助手脚本-玉子手机.json) 的 content 缺失或不是非空字符串');
    }
    const expectedFallbackTag = `v${manifestVersion}`;
    if (!loaderContent.includes(`return tags[0]?.name || '${expectedFallbackTag}';`) || !loaderContent.includes(`return '${expectedFallbackTag}';`)) {
        fail(`脚本版 loader fallback tag 必须与 manifest 版本一致，期望 ${expectedFallbackTag}`);
    }

    const staleLiteralPattern = /1\.2\.2/;
    if (staleLiteralPattern.test(indexSource)) {
        fail('[`index.js`](index.js) 中仍残留旧版本字面量 `1.2.2`');
    }

    console.log(`[version-contract] OK manifest/package/package-lock/index/style/loader=${manifestVersion}`);
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
