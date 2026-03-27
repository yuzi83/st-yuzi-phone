const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const MODULES_DIR = path.join(ROOT, 'modules');
const FACADE_IMPORT_RE = /from\s+['"](\.{1,2}\/[^'"]+)['"]/g;
const TARGET_FACADES = new Set([
    'phone-core.js',
    'phone-settings.js',
    'phone-table-viewer.js',
    'integration.js',
    'phone-beautify-templates.js',
    'window.js',
    'storage-manager.js',
]);

function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...walk(fullPath));
            continue;
        }
        if (entry.isFile() && fullPath.endsWith('.js')) {
            files.push(fullPath);
        }
    }

    return files;
}

function toRelative(filePath) {
    return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function normalizeImportTarget(importPath) {
    const normalized = importPath.replace(/\\/g, '/');
    const parts = normalized.split('/');
    return parts[parts.length - 1] || normalized;
}

function collectFacadeImports() {
    const results = new Map();
    const files = walk(MODULES_DIR);

    for (const filePath of files) {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split(/\r?\n/);

        lines.forEach((line, index) => {
            const matches = line.matchAll(FACADE_IMPORT_RE);
            for (const match of matches) {
                const importPath = match[1];
                const target = normalizeImportTarget(importPath);
                if (!TARGET_FACADES.has(target)) continue;

                if (!results.has(target)) {
                    results.set(target, []);
                }

                results.get(target).push({
                    importer: toRelative(filePath),
                    line: index + 1,
                    importPath,
                });
            }
        });
    }

    return results;
}

function main() {
    const results = collectFacadeImports();
    const orderedTargets = [...TARGET_FACADES].sort((a, b) => a.localeCompare(b, 'en'));

    console.log('[audit-legacy-facade-imports] 当前 façade 依赖审计结果');

    orderedTargets.forEach((target) => {
        const items = results.get(target) || [];
        console.log(`\n## ${target} (${items.length})`);
        if (items.length === 0) {
            console.log('- 未发现直接导入');
            return;
        }

        items
            .sort((a, b) => a.importer.localeCompare(b.importer, 'en') || a.line - b.line)
            .forEach((item) => {
                console.log(`- ${item.importer}:${item.line} <- ${item.importPath}`);
            });
    });
}

main();
