const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    docsReadme: 'docs/README.md',
    architectureGuide: 'docs/architecture-guide.md',
    phoneUiVariables: 'docs/phone-ui-variables.md',
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
        if (!rawTarget || rawTarget.startsWith('#')) {
            continue;
        }

        const targetWithoutAnchor = rawTarget.split('#')[0];
        const localLineLinkMatch = targetWithoutAnchor.match(/^(.+\.[a-z0-9_-]+):\d+$/i);
        const normalizedTarget = localLineLinkMatch
            ? localLineLinkMatch[1]
            : targetWithoutAnchor;

        if (/^[a-z][a-z0-9+.-]*:/i.test(normalizedTarget)) {
            continue;
        }

        if (!targetWithoutAnchor) continue;
        links.push({ rawTarget, targetWithoutAnchor: normalizedTarget });
    }
    return links;
}

function hasAll(content, snippets) {
    return snippets.every(snippet => has(content, snippet));
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
    const phoneUiVariables = read(FILES.phoneUiVariables);
    const reviewLedger = read(FILES.reviewLedger);
    const results = [];

    check(results, FILES.docsReadme, 'docs README 指向稳定架构说明', has(docsReadme, '[`architecture-guide.md`](./architecture-guide.md)'));
    check(results, FILES.docsReadme, 'docs README 指向审查问题台账', has(docsReadme, '[`review-issue-ledger.md`](./review-issue-ledger.md)'));
    check(results, FILES.docsReadme, 'docs README 指向构建发布说明', has(docsReadme, '[`../BUILD.md`](../BUILD.md)'));
    check(results, FILES.docsReadme, 'docs README 指向小手机 UI 变量文档', has(docsReadme, '[`phone-ui-variables.md`](./phone-ui-variables.md)'));
    check(results, FILES.docsReadme, 'docs README 指向真实数据库 API 文档', has(docsReadme, '[`reference/API_DOCUMENTATION.md`](./reference/API_DOCUMENTATION.md)'));
    check(results, FILES.docsReadme, 'docs README 不再指向不存在的 docs/api.md', !/\]\((?:\.\/)?api\.md(?::\d+)?(?:#[^)]+)?\)/.test(docsReadme));
    check(results, FILES.docsReadme, 'docs README 明确 docs 与 plans 边界', has(docsReadme, '未实施的计划不写入'));

    check(results, FILES.architectureGuide, 'architecture guide 样式链接使用上级 styles 路径', !has(architectureGuide, '](styles/'));
    check(results, FILES.architectureGuide, 'architecture guide 不再引用不存在的 api.md', !/\]\(api\.md(?::\d+)?(?:#[^)]+)?\)/.test(architectureGuide));
    check(results, FILES.architectureGuide, 'architecture guide 指向 reference/API_DOCUMENTATION.md', has(architectureGuide, '[`reference/API_DOCUMENTATION.md`](reference/API_DOCUMENTATION.md)'));
    check(results, FILES.architectureGuide, 'architecture guide 新增功能清单包含 check:ci', has(architectureGuide, '[`npm run check:ci`](../package.json:12)'));
    check(results, FILES.architectureGuide, 'architecture guide 新增功能清单包含 manifest 打包产物路径', has(architectureGuide, '[`manifest.json`](../manifest.json:6)')
        && has(architectureGuide, '`dist/yuzi-phone.bundle.js`')
        && has(architectureGuide, '`dist/yuzi-phone.bundle.css`'));
    check(results, FILES.architectureGuide, 'architecture guide 当前文档边界区分 docs 与 plans', has(architectureGuide, '演进规划保存在 [`plans/`](../plans)'));
    check(results, FILES.architectureGuide, 'architecture guide 登记 Table Update Review 审核 App', hasAll(architectureGuide, [
        'Table Update Review 审核 App',
        'Table Update Review 是系统 App',
        '净变化',
    ]));
    check(results, FILES.architectureGuide, 'architecture guide 登记 table-update-review route', hasAll(architectureGuide, [
        'table-update-review route',
        'renderTableUpdateReview',
        '../modules/table-update-review/index.js',
    ]));
    check(results, FILES.architectureGuide, 'architecture guide 登记审核 App Home 注入', hasAll(architectureGuide, [
        'TABLE_UPDATE_REVIEW_APP_ID',
        'TABLE_UPDATE_REVIEW_ROUTE',
        '../modules/phone-home/view-model.js',
    ]));
    check(results, FILES.architectureGuide, 'architecture guide 登记审核 App route preload', hasAll(architectureGuide, [
        'ROUTE_MODULES',
        '../modules/phone-core/preload.js',
        '../table-update-review/index.js',
    ]));
    check(results, FILES.architectureGuide, 'architecture guide 登记审核 App 路由渲染入口', hasAll(architectureGuide, [
        'loadRouteRenderer',
        '../modules/phone-core/route-renderer.js',
        'table-update-review',
        'renderTableUpdateReview',
    ]));
    check(results, FILES.architectureGuide, 'architecture guide 登记审核到通用表详情跳转合同', hasAll(architectureGuide, [
        'pending navigation intent',
        'Generic 表仍先写入 pending navigation intent，再进入 `table:<sheetKey>`',
        'Table Viewer',
    ]) && !has(architectureGuide, 'Generic 与 Special 表'));
    check(results, FILES.architectureGuide, 'architecture guide 声明 table 是唯一正常表格入口且兼容路由旁路预设', hasAll(architectureGuide, [
        '唯一正常表格入口',
        '`app:<sheetKey>` 兼容 route',
        '`theater:<sceneId>` 兼容 route',
        '不参与 content preset 绑定或自动刷新',
    ]));
    check(results, FILES.architectureGuide, 'architecture guide 使用玉子美化 v2 数据库名称', has(architectureGuide, '`yuzi-phone-template-workshop-v2`')
        && !has(architectureGuide, '`yuzi-phone-template-workshop`'));
    check(results, FILES.architectureGuide, 'architecture guide 登记物理表 route 与 replace-only 循环语义', hasAll(architectureGuide, [
        'table:<sheetKey>',
        'replaceCurrentRoute',
        'getSheetKeys',
        'routeRenderToken',
    ]));
    check(results, FILES.architectureGuide, 'architecture guide 登记审核 Theater 分流且禁止脏 intent', hasAll(architectureGuide, [
        '命中可用 Theater',
        '写入 pending navigation intent 之前分流',
        '不创建或清理 Generic intent',
    ]));
    check(results, FILES.architectureGuide, 'architecture guide 登记审核返回语义边界', hasAll(architectureGuide, [
        '不要为了审核返回链路修改',
        'navigateBack',
        '详情本地返回和列表路由返回必须保持不同 action 语义',
    ]));
    check(results, FILES.architectureGuide, 'architecture guide 登记全局应用标题栏深模块', hasAll(architectureGuide, [
        '全局应用标题栏深模块',
        '../modules/phone-core/navigation-ui.js',
        'buildPhoneNavBar',
        'buildPhoneBackButton',
        'buildPhoneSwitchButton',
        'buildPhoneNavTitleSwitcher',
        'createPhoneNavIconElement',
    ]));
    check(results, FILES.architectureGuide, 'architecture guide 登记标题栏容器响应和审核 App 消费者', hasAll(architectureGuide, [
        'yuzi-phone-screen',
        '@container yuzi-phone-screen',
        'Table Update Review 审核 App',
        'Content Presets',
        'QQ 二级页/聊天页',
    ]) && has(architectureGuide, '浏览器 viewport'));
    check(results, FILES.architectureGuide, 'architecture guide 不再登记小手机旧数据库更新配置链', !has(architectureGuide, 'config-repository.js')
        && !has(architectureGuide, 'preset-repository.js')
        && !has(architectureGuide, 'manualUpdate()')
        && !has(architectureGuide, '手动更新只能'));
    check(results, FILES.architectureGuide, 'architecture guide 保留外部数据库能力参考边界', hasAll(architectureGuide, [
        'reference/API_DOCUMENTATION.md',
        '外部数据库插件本身的能力',
        '不会改写或删减这份外部能力参考',
    ]));

    check(results, FILES.phoneUiVariables, 'UI 变量文档区分两类 QQ 头像角色', hasAll(phoneUiVariables, [
        '当前用户头像',
        '--yuzi-qq-accent',
        '--yuzi-qq-on-accent',
        '人物占位头像',
        '--yuzi-qq-avatar-surface',
        '--yuzi-qq-avatar-ink',
    ]));
    check(results, FILES.phoneUiVariables, 'UI 变量文档登记原生表单与宿主隔离', hasAll(phoneUiVariables, [
        '--yuzi-phone-form-surface',
        '--yuzi-phone-form-text',
        '--yuzi-phone-form-placeholder',
        '--yuzi-phone-native-control-color-scheme',
        'select option',
        '-webkit-text-fill-color',
    ]));
    check(results, FILES.phoneUiVariables, 'UI 变量文档登记共享底栏与独立 Home 区域契约', hasAll(phoneUiVariables, [
        'data-phone-bottom-bar',
        '--yuzi-variable-manager-surface-strong',
        'backdrop-filter',
        '独立 Home 区域',
    ]));
    check(results, FILES.phoneUiVariables, 'UI 变量文档禁止直接消费宿主主题颜色', hasAll(phoneUiVariables, [
        '--SmartTheme*',
        '--ui-color-*',
        '宿主主题隔离',
    ]));
    check(results, FILES.phoneUiVariables, 'UI 变量文档登记消息加号菜单专用表面', hasAll(phoneUiVariables, [
        '.yuzi-qq-message-add-menu',
        '--yuzi-qq-dialog-surface',
        '行背景透明',
    ]));
    check(results, FILES.phoneUiVariables, 'UI 变量文档登记 Figma 全局应用标题栏基准', hasAll(phoneUiVariables, [
        '## 全局应用标题栏契约',
        '177:1532',
        '54px',
        '10px',
        '12px',
        '24px',
        '32px',
        '../modules/phone-core/navigation-ui.js',
    ]));
    check(results, FILES.phoneUiVariables, 'UI 变量文档登记全部共享标题栏 token', hasAll(phoneUiVariables, [
        '--yuzi-phone-nav-content-height',
        '--yuzi-phone-nav-padding-inline-start',
        '--yuzi-phone-nav-padding-inline-end',
        '--yuzi-phone-nav-control-size',
        '--yuzi-phone-nav-icon-size',
        '--yuzi-phone-nav-side-slot-width',
        '--yuzi-phone-nav-title-gap',
        '--yuzi-phone-nav-title-padding-inline',
        '--yuzi-phone-nav-title-font-size',
        '--yuzi-phone-nav-title-line-height',
        '--yuzi-phone-nav-title-font-weight',
        '--yuzi-phone-nav-control-radius',
        '--yuzi-phone-nav-action-color',
        '--yuzi-phone-nav-title-color',
        '--yuzi-phone-nav-background',
        '--yuzi-phone-nav-border-color',
        '--yuzi-phone-nav-control-hover-background',
        '--yuzi-phone-nav-focus-ring-color',
        '--yuzi-phone-nav-focus-ring-width',
        '--yuzi-phone-nav-disabled-opacity',
        '--yuzi-phone-nav-secondary-actions-gap',
        '--yuzi-phone-nav-secondary-actions-padding-inline',
        '--yuzi-phone-nav-secondary-actions-padding-block-end',
        '--yuzi-phone-nav-inline-actions-side-slot-width',
        '--yuzi-phone-nav-inline-actions-gap',
        '--yuzi-phone-nav-inline-action-padding-inline',
    ]));
    check(results, FILES.phoneUiVariables, 'UI 变量文档登记标题栏结构、可访问性与容器规则', hasAll(phoneUiVariables, [
        '.phone-nav-leading',
        '.phone-nav-center',
        '.phone-nav-trailing',
        '.has-inline-actions',
        '.phone-nav-inline-actions',
        '.has-secondary-actions',
        '.phone-nav-secondary-actions',
        'pointer-events: none',
        '紧凑居中',
        'text-overflow: ellipsis',
        'icon-only button',
        'aria-label',
        'M16 19L8 12L16 5',
        '@container yuzi-phone-screen',
        '浏览器 viewport',
        'Table Update Review 审核 App',
    ]));

    check(results, FILES.reviewLedger, 'review ledger 顶部包含当前工程结构优化状态', has(reviewLedger, '## 当前工程结构优化状态'));
    check(results, FILES.reviewLedger, 'review ledger 记录 P0 归档', has(reviewLedger, '2026-05-01_1958_P0工程结构边界修复.md'));
    check(results, FILES.reviewLedger, 'review ledger 记录 P1 归档', has(reviewLedger, '2026-05-01_2336_P1工程结构优化收尾.md'));
    check(results, FILES.reviewLedger, 'review ledger 当前状态包含 check:ci 发布门禁', has(reviewLedger, '[`npm run check:ci`](../package.json:12)'));
    check(results, FILES.reviewLedger, 'review ledger 声明不重写历史验证结果', has(reviewLedger, '不重写下方历史问题条目的当时验证结果'));

    assertLinksExist(results, FILES.docsReadme, docsReadme);
    assertLinksExist(results, FILES.architectureGuide, architectureGuide);
    assertLinksExist(results, FILES.phoneUiVariables, phoneUiVariables);

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
