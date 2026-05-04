// build.mjs
// 玉子手机扩展打包脚本
// 用法：node build.mjs        （生产构建）
//      node build.mjs --dev  （开发构建：未压缩，便于调试）
//      node build.mjs --watch（开发模式：文件变化自动重建）

import * as esbuild from 'esbuild';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const DIST = resolve(ROOT, 'dist');
const isWatch = process.argv.includes('--watch');
const isDev = process.argv.includes('--dev') || isWatch;

const jsOutfile = resolve(DIST, 'yuzi-phone.bundle.js');
const cssOutfile = resolve(DIST, 'yuzi-phone.bundle.css');

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function cleanDist() {
    if (existsSync(DIST)) {
        rmSync(DIST, { recursive: true, force: true });
    }
    mkdirSync(DIST, { recursive: true });
}

function assertBuildOutput(filePath, label) {
    if (!existsSync(filePath)) {
        throw new Error(`[build] ${label} 构建产物缺失: ${filePath}`);
    }
    const stats = statSync(filePath);
    if (!stats.isFile() || stats.size <= 0) {
        throw new Error(`[build] ${label} 构建产物为空或不是文件: ${filePath}`);
    }
    return stats.size;
}

function normalizeSourceMapLineEndings(filePath) {
    if (!existsSync(filePath)) return;

    const raw = readFileSync(filePath, 'utf8');
    const sourceMap = JSON.parse(raw);
    if (!Array.isArray(sourceMap.sourcesContent)) return;

    let changed = false;
    sourceMap.sourcesContent = sourceMap.sourcesContent.map((content) => {
        if (typeof content !== 'string') return content;
        const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        if (normalized !== content) changed = true;
        return normalized;
    });

    if (!changed) return;
    writeFileSync(filePath, `${JSON.stringify(sourceMap)}\n`, 'utf8');
}

const sharedOptions = {
    bundle: true,
    minify: !isDev,
    sourcemap: isDev ? 'inline' : true,
    target: ['es2022'],
    format: 'esm',
    platform: 'browser',
    legalComments: 'none',
    logLevel: 'info',
};

const jsBuild = {
    ...sharedOptions,
    entryPoints: [resolve(ROOT, 'index.js')],
    outfile: jsOutfile,
    loader: {
        '.css': 'css',
    },
};

const cssBuild = {
    ...sharedOptions,
    entryPoints: [resolve(ROOT, 'style.css')],
    outfile: cssOutfile,
};

if (isWatch) {
    cleanDist();
    const jsCtx = await esbuild.context(jsBuild);
    const cssCtx = await esbuild.context(cssBuild);
    await Promise.all([
        jsCtx.watch(),
        cssCtx.watch(),
    ]);
    console.log('[build] watching for changes...');
} else {
    cleanDist();
    const t0 = Date.now();
    await Promise.all([
        esbuild.build(jsBuild),
        esbuild.build(cssBuild),
    ]);
    normalizeSourceMapLineEndings(`${jsOutfile}.map`);
    normalizeSourceMapLineEndings(`${cssOutfile}.map`);

    const jsSize = assertBuildOutput(jsOutfile, 'JS');
    const cssSize = assertBuildOutput(cssOutfile, 'CSS');
    console.log(`[build] done in ${Date.now() - t0}ms`);
    console.log(`        dist/yuzi-phone.bundle.js  ${formatBytes(jsSize)}`);
    console.log(`        dist/yuzi-phone.bundle.css ${formatBytes(cssSize)}`);
}
