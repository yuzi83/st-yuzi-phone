#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(projectRoot, 'manifest.json');
const indexPath = path.join(projectRoot, 'index.js');

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

try {
    const manifest = JSON.parse(readUtf8(manifestPath));
    const indexSource = readUtf8(indexPath);
    const manifestVersion = manifest.version;

    if (typeof manifestVersion !== 'string' || !manifestVersion.trim()) {
        fail('[`manifest.json`](manifest.json) 的 [`version`](manifest.json:9) 缺失或不是非空字符串');
    }

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

    if (!/context:\s*\{\s*version:\s*EXTENSION_VERSION\s*\}/.test(indexSource)) {
        fail('[`index.js`](index.js:206) 初始化日志没有使用 [`EXTENSION_VERSION`](index.js:54)');
    }

    if (!/showNotification\(`玉子手机已加载 \(v\$\{EXTENSION_VERSION\}\)`\s*,\s*'success'\s*\)/.test(indexSource)) {
        fail('[`index.js`](index.js:208) 加载通知没有使用 [`EXTENSION_VERSION`](index.js:54) 模板字符串');
    }

    const staleLiteralPattern = /1\.2\.2/;
    if (staleLiteralPattern.test(indexSource)) {
        fail('[`index.js`](index.js) 中仍残留旧版本字面量 `1.2.2`');
    }

    console.log(`[version-contract] OK manifest=${manifestVersion} index=${jsVersion}`);
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
