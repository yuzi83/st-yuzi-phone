const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const FACADE_RELATIVE_PATH = 'modules/utils.js';
const FACADE_ABSOLUTE_PATH = path.resolve(ROOT, FACADE_RELATIVE_PATH);
const SCAN_ROOTS = [
    'index.js',
    'modules',
];
const SOURCE_FILE_PATTERN = /\.(?:js|mjs)$/i;
const IGNORED_DIR_NAMES = new Set([
    'node_modules',
    'dist',
    '.git',
    '.analysis-archive',
    '.kilocode',
    '.vscode',
]);

function toPosixPath(value) {
    return String(value || '').replace(/\\/g, '/');
}

function exists(relativePath) {
    return fs.existsSync(path.join(ROOT, relativePath));
}

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function listSourceFiles(entryRelativePath) {
    const absolutePath = path.join(ROOT, entryRelativePath);
    if (!fs.existsSync(absolutePath)) {
        return [];
    }

    const stat = fs.statSync(absolutePath);
    if (stat.isFile()) {
        return SOURCE_FILE_PATTERN.test(entryRelativePath) ? [toPosixPath(entryRelativePath)] : [];
    }

    if (!stat.isDirectory()) {
        return [];
    }

    const dirName = path.basename(absolutePath);
    if (IGNORED_DIR_NAMES.has(dirName)) {
        return [];
    }

    return fs.readdirSync(absolutePath)
        .flatMap((name) => listSourceFiles(path.join(entryRelativePath, name)));
}

function findStaticModuleSpecifiers(content) {
    const specifiers = [];
    const patterns = [
        /(?:^|[\n;])\s*import\s+(?:[\s\S]*?\s+from\s*)?['"]([^'"]+)['"]/g,
        /(?:^|[\n;])\s*export\s+(?:[\s\S]*?\s+from\s*)['"]([^'"]+)['"]/g,
    ];

    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
            specifiers.push(match[1]);
        }
    }

    return specifiers;
}

function resolveImportTarget(importerRelativePath, specifier) {
    if (!specifier.startsWith('.')) {
        return null;
    }

    const importerDir = path.dirname(path.resolve(ROOT, importerRelativePath));
    return path.resolve(importerDir, specifier);
}

function pointsToUtilsFacade(importerRelativePath, specifier) {
    const target = resolveImportTarget(importerRelativePath, specifier);
    if (!target) {
        return false;
    }

    return target === FACADE_ABSOLUTE_PATH;
}

function main() {
    const sourceFiles = SCAN_ROOTS
        .flatMap(listSourceFiles)
        .filter((file, index, files) => files.indexOf(file) === index)
        .sort((a, b) => a.localeCompare(b, 'en'));

    const violations = [];

    for (const file of sourceFiles) {
        const content = read(file);
        const specifiers = findStaticModuleSpecifiers(content);
        for (const specifier of specifiers) {
            if (pointsToUtilsFacade(file, specifier)) {
                violations.push({ file, specifier });
            }
        }
    }

    const facadeStillExists = exists(FACADE_RELATIVE_PATH);

    if (facadeStillExists || violations.length > 0) {
        console.error('[utils-import-convergence-check] 检查失败：');
        if (facadeStillExists) {
            console.error(`- ${FACADE_RELATIVE_PATH}: utils façade 仍存在，必须删除`);
        }
        for (const item of violations) {
            console.error(`- ${item.file}: 仍通过 ${item.specifier} 指向 ${FACADE_RELATIVE_PATH}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[utils-import-convergence-check] 检查通过');
    console.log(`- OK | ${FACADE_RELATIVE_PATH} | utils façade 已删除`);
    console.log(`- OK | scanned ${sourceFiles.length} source files | 未发现指向 utils façade 的静态 import/export`);
}

main();
