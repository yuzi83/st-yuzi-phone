const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    packageJson: 'package.json',
    buildDoc: 'BUILD.md',
    manifest: 'manifest.json',
    gitignore: '.gitignore',
    changelog: 'CHANGELOG.md',
    readme: 'README.md',
};

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function has(content, snippet) {
    return content.includes(snippet);
}

function check(results, file, description, ok, details = '') {
    results.push({ file, description, ok, details });
}

function fileExistsAndNonEmpty(relativePath) {
    try {
        const stats = fs.statSync(path.join(ROOT, relativePath));
        return stats.isFile() && stats.size > 0;
    } catch {
        return false;
    }
}

function assertPackageScripts(results, packageJson) {
    const scripts = packageJson.scripts || {};
    check(results, FILES.packageJson, 'package.json 暴露 build 脚本', scripts.build === 'node build.mjs');
    check(results, FILES.packageJson, 'package.json 暴露 lint 脚本', typeof scripts.lint === 'string' && scripts.lint.includes('eslint'));
    check(results, FILES.packageJson, 'package.json 暴露 check 脚本', scripts.check === 'node scripts/run-contract-checks.cjs');
    check(results, FILES.packageJson, 'package.json 暴露 check:ci 脚本', scripts['check:ci'] === 'node scripts/run-contract-checks-ci.cjs');
}

function assertManifestDist(results, manifest) {
    check(results, FILES.manifest, 'manifest js 指向 dist bundle', manifest.js === 'dist/yuzi-phone.bundle.js');
    check(results, FILES.manifest, 'manifest css 指向 dist bundle', manifest.css === 'dist/yuzi-phone.bundle.css');
    check(results, manifest.js || FILES.manifest, 'manifest js 目标存在且非空', typeof manifest.js === 'string' && fileExistsAndNonEmpty(manifest.js));
    check(results, manifest.css || FILES.manifest, 'manifest css 目标存在且非空', typeof manifest.css === 'string' && fileExistsAndNonEmpty(manifest.css));
}

function extractUnreleasedSection(changelog) {
    const startMarker = '## [Unreleased]';
    const start = changelog.indexOf(startMarker);
    if (start < 0) return '';

    const nextVersion = changelog.indexOf('\n## [', start + startMarker.length);
    if (nextVersion < 0) {
        return changelog.slice(start);
    }

    return changelog.slice(start, nextVersion);
}

function main() {
    const packageJson = JSON.parse(read(FILES.packageJson));
    const buildDoc = read(FILES.buildDoc);
    const manifest = JSON.parse(read(FILES.manifest));
    const gitignore = read(FILES.gitignore);
    const changelog = read(FILES.changelog);
    const changelogUnreleased = extractUnreleasedSection(changelog);
    const readme = read(FILES.readme);
    const results = [];

    assertPackageScripts(results, packageJson);
    assertManifestDist(results, manifest);

    check(results, FILES.buildDoc, 'BUILD 命令表包含 check:ci', has(buildDoc, '| `npm run check:ci` |'));
    check(results, FILES.buildDoc, 'BUILD 发布命令包含 lint/check/check:ci/build', /npm run lint[\s\S]*npm run check[\s\S]*npm run check:ci[\s\S]*npm run build/.test(buildDoc));
    check(results, FILES.buildDoc, 'BUILD 说明当前历史失败基线应为 0', has(buildDoc, '当前基线应为 0'));
    check(results, FILES.buildDoc, 'BUILD 说明 dist 必须提交', has(buildDoc, 'dist/` 必须提交') || has(buildDoc, '`dist/` 必须提交'));
    check(results, FILES.buildDoc, 'BUILD 发布步骤校验 manifest dist 入口', has(buildDoc, 'manifest.json') && has(buildDoc, 'dist/yuzi-phone.bundle.js') && has(buildDoc, 'dist/yuzi-phone.bundle.css'));

    check(results, FILES.gitignore, '.gitignore 说明不忽略 dist', has(gitignore, '不忽略 dist/'));
    check(results, FILES.gitignore, '.gitignore 没有启用 dist/ 忽略规则', !/^dist\/?\s*$/m.test(gitignore));

    check(results, FILES.changelog, 'CHANGELOG 存在 Unreleased 区块', changelogUnreleased.length > 0);
    check(results, FILES.changelog, 'CHANGELOG Unreleased 记录 check:ci 发布门禁', has(changelogUnreleased, 'npm run check:ci'));
    check(results, FILES.changelog, 'CHANGELOG Unreleased 记录 P0/P1/P2 工程结构收尾', has(changelogUnreleased, 'P0/P1/P2 工程结构边界'));
    check(results, FILES.changelog, 'CHANGELOG Unreleased 记录 P2 文档与发布链路合同', has(changelogUnreleased, 'P2 文档与发布链路 contract 检查'));

    check(results, FILES.readme, 'README 说明 manifest 加载 dist bundle', has(readme, 'manifest.json') && has(readme, 'dist/yuzi-phone.bundle.js') && has(readme, 'dist/yuzi-phone.bundle.css'));
    check(results, FILES.readme, 'README 发布命令包含 check:ci', /npm run lint[\s\S]*npm run check[\s\S]*npm run check:ci[\s\S]*npm run build/.test(readme));
    check(results, FILES.readme, 'README 说明 dist 必须提交', has(readme, '`dist/` 必须提交'));

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[release-chain-contract-check] 检查失败：');
        for (const item of failed) {
            const suffix = item.details ? ` (${item.details})` : '';
            console.error(`- ${item.file}: ${item.description}${suffix}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[release-chain-contract-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
