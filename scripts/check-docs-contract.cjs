const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    docsReadme: 'docs/README.md',
    architectureGuide: 'docs/architecture-guide.md',
    reviewLedger: 'docs/review-issue-ledger.md',
};

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function exists(relativePath) {
    try {
        fs.accessSync(path.join(ROOT, relativePath));
        return true;
    } catch {
        return false;
    }
}

function has(content, snippet) {
    return content.includes(snippet);
}

function check(results, file, description, ok, details = '') {
    results.push({ file, description, ok, details });
}

function collectMarkdownLinks(content) {
    const links = [];
    const linkPattern = /\[[^\]\n]+\]\(([^)]+)\)/g;
    for (const match of content.matchAll(linkPattern)) {
        const rawTarget = match[1].trim();
        if (!rawTarget || rawTarget.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(rawTarget)) {
            continue;
        }
        const targetWithoutAnchor = rawTarget.split('#')[0].split(':')[0];
        if (!targetWithoutAnchor) continue;
        links.push({ rawTarget, targetWithoutAnchor });
    }
    return links;
}

function assertLinksExist(results, sourceFile, content) {
    const sourceDir = path.dirname(sourceFile);
    for (const link of collectMarkdownLinks(content)) {
        const resolved = path.normalize(path.join(sourceDir, link.targetWithoutAnchor)).replace(/\\/g, '/');
        check(
            results,
            sourceFile,
            `Markdown 链接存在：${link.rawTarget}`,
            exists(resolved),
            resolved,
        );
    }
}

function main() {
    const docsReadme = read(FILES.docsReadme);
    const architectureGuide = read(FILES.architectureGuide);
    const reviewLedger = read(FILES.reviewLedger);
    const results = [];

    check(results, FILES.docsReadme, 'docs README 指向稳定架构说明', has(docsReadme, '[`architecture-guide.md`](./architecture-guide.md)'));
    check(results, FILES.docsReadme, 'docs README 指向审查问题台账', has(docsReadme, '[`review-issue-ledger.md`](./review-issue-ledger.md)'));
    check(results, FILES.docsReadme, 'docs README 指向构建发布说明', has(docsReadme, '[`../BUILD.md`](../BUILD.md)'));
    check(results, FILES.docsReadme, 'docs README 指向真实数据库 API 文档', has(docsReadme, '[`reference/API_DOCUMENTATION.md`](./reference/API_DOCUMENTATION.md)'));
    check(results, FILES.docsReadme, 'docs README 不再指向不存在的 docs/api.md', !has(docsReadme, './api.md') && !has(docsReadme, '](api.md)'));
    check(results, FILES.docsReadme, 'docs README 明确 docs 与 plans 边界', has(docsReadme, '未实施的计划不写入'));

    check(results, FILES.architectureGuide, 'architecture guide 样式链接使用上级 styles 路径', !has(architectureGuide, '](styles/'));
    check(results, FILES.architectureGuide, 'architecture guide 不再引用不存在的 api.md', !has(architectureGuide, '](api.md)'));
    check(results, FILES.architectureGuide, 'architecture guide 指向 reference/API_DOCUMENTATION.md', has(architectureGuide, '[`reference/API_DOCUMENTATION.md`](reference/API_DOCUMENTATION.md)'));
    check(results, FILES.architectureGuide, 'architecture guide 新增功能清单包含 check:ci', has(architectureGuide, '[`npm run check:ci`](../package.json:12)'));
    check(results, FILES.architectureGuide, 'architecture guide 新增功能清单包含 dist manifest 入口', has(architectureGuide, '[`dist/yuzi-phone.bundle.js`](../dist/yuzi-phone.bundle.js)') && has(architectureGuide, '[`dist/yuzi-phone.bundle.css`](../dist/yuzi-phone.bundle.css)'));
    check(results, FILES.architectureGuide, 'architecture guide 当前文档边界区分 docs 与 plans', has(architectureGuide, '演进规划保存在 [`plans/`](../plans)'));

    check(results, FILES.reviewLedger, 'review ledger 顶部包含当前工程结构优化状态', has(reviewLedger, '## 当前工程结构优化状态'));
    check(results, FILES.reviewLedger, 'review ledger 记录 P0 归档', has(reviewLedger, '2026-05-01_1958_P0工程结构边界修复.md'));
    check(results, FILES.reviewLedger, 'review ledger 记录 P1 归档', has(reviewLedger, '2026-05-01_2336_P1工程结构优化收尾.md'));
    check(results, FILES.reviewLedger, 'review ledger 当前状态包含 check:ci 发布门禁', has(reviewLedger, '[`npm run check:ci`](../package.json:12)'));
    check(results, FILES.reviewLedger, 'review ledger 声明不重写历史验证结果', has(reviewLedger, '不重写下方历史问题条目的当时验证结果'));

    assertLinksExist(results, FILES.docsReadme, docsReadme);
    assertLinksExist(results, FILES.architectureGuide, architectureGuide);

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[docs-contract-check] 检查失败：');
        for (const item of failed) {
            const suffix = item.details ? ` (${item.details})` : '';
            console.error(`- ${item.file}: ${item.description}${suffix}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[docs-contract-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
