const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    entry: 'style.css',
    base: 'styles/01-phone-base.css',
    home: 'styles/phone-base/02-page-home.css',
    readme: 'styles/README.md',
    phoneBaseReadme: 'styles/phone-base/README.md',
    shell: 'styles/phone-base/01-shell-system.css',
    tableUpdateReview: 'styles/phone-base/12-table-update-review.css',
    settingsModern: 'styles/phone-base/07-settings-modern.css',
    fontLibrary: 'modules/settings-app/services/appearance-settings/font-library-service.js',
};

const REMOVED_FILES = [
    'styles/legacy/README.md',
    'styles/legacy/phone-base/README.md',
    'styles/legacy/phone-base',
    'styles/legacy',
    'styles/phone-base/03-table-legacy.css',
    'styles/phone-base/04-settings-legacy.css',
];

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

function getCssRuleBlock(content, selector) {
    const source = String(content || '');
    const index = source.indexOf(selector);
    if (index < 0) return '';
    const openIndex = source.indexOf('{', index);
    if (openIndex < 0) return '';
    const closeIndex = source.indexOf('}', openIndex + 1);
    if (closeIndex < 0) return '';
    return source.slice(openIndex + 1, closeIndex);
}

function check(results, fileKey, description, ok) {
    results.push({ file: FILES[fileKey] || fileKey, description, ok });
}

function appearsBefore(content, firstSnippet, secondSnippet) {
    const firstIndex = content.indexOf(firstSnippet);
    const secondIndex = content.indexOf(secondSnippet);
    return firstIndex >= 0 && secondIndex >= 0 && firstIndex < secondIndex;
}

function main() {
    const contents = Object.fromEntries(
        Object.entries(FILES).map(([key, relativePath]) => [key, read(relativePath)])
    );

    const results = [];

    check(results, 'entry', '顶层入口继续导入 shell layer', has(contents.entry, "@import url('./styles/00-phone-shell.css');"));
    check(results, 'entry', '顶层入口继续导入 base layer', has(contents.entry, "@import url('./styles/01-phone-base.css');"));
    check(results, 'entry', '顶层入口继续导入 nav/detail layer', has(contents.entry, "@import url('./styles/02-phone-nav-detail.css');"));
    check(results, 'entry', '顶层入口继续导入 special base layer', has(contents.entry, "@import url('./styles/03-phone-special-base.css');"));
    check(results, 'entry', '顶层入口继续导入 special interactions layer', has(contents.entry, "@import url('./styles/04-phone-special-interactions.css');"));
    check(results, 'entry', '顶层入口继续导入 generic template layer', has(contents.entry, "@import url('./styles/05-phone-generic-template.css');"));
    check(results, 'entry', '顶层入口声明 shell / base / special / generic 分层说明', has(contents.entry, 'Layer map'));

    check(results, 'base', 'base 入口继续声明 Active modern layers', has(contents.base, 'Active modern layers'));
    check(results, 'base', 'base 入口继续导入 tokens', has(contents.base, "@import url('./phone-base/00-phone-tokens.css');"));
    check(results, 'base', 'base 入口继续导入 shell system', has(contents.base, "@import url('./phone-base/01-shell-system.css');"));
    check(results, 'base', 'base 入口继续导入 settings modern', has(contents.base, "@import url('./phone-base/07-settings-modern.css');"));
    check(results, 'base', 'base 入口继续导入 table manage detail', has(contents.base, "@import url('./phone-base/09-table-manage-detail.css');"));
    check(results, 'base', 'base 入口继续导入 scroll patches', has(contents.base, "@import url('./phone-base/10-scroll-generic-patches.css');"));
    check(results, 'base', 'base 入口继续导入 table update review', has(contents.base, "@import url('./phone-base/12-table-update-review.css');"));
    check(results, 'base', 'base 入口保持 table manage detail 在 table update review 之前', appearsBefore(contents.base, "@import url('./phone-base/09-table-manage-detail.css');", "@import url('./phone-base/12-table-update-review.css');"));
    check(results, 'base', 'base 入口保持 table update review 在 scroll patches 之前', appearsBefore(contents.base, "@import url('./phone-base/12-table-update-review.css');", "@import url('./phone-base/10-scroll-generic-patches.css');"));
    check(results, 'base', 'base 入口不再默认加载 table legacy', !has(contents.base, "@import url('./phone-base/03-table-legacy.css');"));
    check(results, 'base', 'base 入口不再默认加载 settings legacy', !has(contents.base, "@import url('./phone-base/04-settings-legacy.css');"));
    check(results, 'base', 'base 入口不再保留已清理的 Legacy archive 注释段落', !has(contents.base, 'Legacy archive'));

    check(results, 'tableUpdateReview', '审核页样式层文件存在并被合同读取', exists(FILES.tableUpdateReview));
    for (const selector of [
        '.tur-page',
        '.tur-nav',
        '.tur-nav-back',
        '.tur-body',
        '.tur-content',
        '.tur-summary',
        '.tur-kicker',
        '.tur-metrics',
        '.tur-table-list',
        '.tur-table-card',
        '.tur-table-header',
        '.tur-table-count',
        '.tur-change-list',
        '.tur-change-item',
        '.tur-change-type',
        '.tur-change-main',
        '.tur-row-title',
        '.tur-change-fields',
        '.tur-field-block',
        '.tur-field-name',
        '.tur-field-before',
        '.tur-field-arrow',
        '.tur-field-after',
        '.tur-field-value',
        '.tur-empty',
    ]) {
        check(results, 'tableUpdateReview', `审核页样式层包含关键选择器 ${selector}`, has(contents.tableUpdateReview, selector));
    }
    check(results, 'tableUpdateReview', '审核页字段单值展示使用两列 grid 布局', has(contents.tableUpdateReview, '.tur-field-block.is-single-value')
        && has(contents.tableUpdateReview, 'grid-template-columns: minmax(0, .8fr) minmax(0, 2fr);'));
    check(results, 'tableUpdateReview', '审核页样式层不再保留刷新按钮选择器', !has(contents.tableUpdateReview, '.tur-refresh-btn'));
    check(results, 'tableUpdateReview', '审核页白天模式标题栏使用审核页文本色保证可读', has(contents.tableUpdateReview, '.tur-nav .phone-nav-title')
        && has(contents.tableUpdateReview, 'color: var(--tur-text);'));
    check(results, 'tableUpdateReview', '审核页包含 details/summary 折叠态样式', has(contents.tableUpdateReview, '.tur-table-card[open]')
        && has(contents.tableUpdateReview, '.tur-table-summary'));
    check(results, 'tableUpdateReview', '审核页删除态样式包含红线、轻红底和不可点击视觉', has(contents.tableUpdateReview, '.tur-change-item.is-delete')
        && has(contents.tableUpdateReview, 'border-left')
        && has(contents.tableUpdateReview, 'cursor: default'));
    check(results, 'tableUpdateReview', '审核页长文本有截断样式', has(contents.tableUpdateReview, 'text-overflow: ellipsis')
        && has(contents.tableUpdateReview, 'overflow: hidden')
        && has(contents.tableUpdateReview, 'white-space: nowrap'));
    check(results, 'tableUpdateReview', '审核页变更说明样式匹配模板 small 元素', has(contents.tableUpdateReview, '.tur-change-main small'));
    check(results, 'tableUpdateReview', '审核页不再保留字段更多提示样式', !has(contents.tableUpdateReview, '.tur-field-more'));

    const homeOverlayBlock = getCssRuleBlock(contents.home, '.phone-home-overlay');
    check(results, 'home', '主页不再保留整屏 overlay 规则', homeOverlayBlock.length === 0);
    check(results, 'home', '主页不再使用 15% 黑色遮罩压暗壁纸', !has(contents.home, 'background: rgba(0, 0, 0, 0.15);'));
    check(results, 'home', '主页无壁纸时由 .phone-home 提供浅暖玉默认背景', has(contents.home, 'linear-gradient(180deg, #f4efe6'));
    check(results, 'home', '主页 App 名称使用受控颜色变量与局部文字阴影保障可读性', has(contents.home, '.phone-app-label')
        && has(contents.home, 'color: var(--phone-home-app-label-color, rgba(255, 255, 255, 0.96));')
        && has(contents.home, 'text-shadow: var(--phone-home-app-label-shadow, 0 1px 3px rgba(0, 0, 0, 0.32));'));
    check(results, 'home', '主页 overlay 不得使用 backdrop-filter 模糊高清壁纸', !/backdrop-filter\s*:/i.test(homeOverlayBlock) && !/-webkit-backdrop-filter\s*:/i.test(homeOverlayBlock));
    check(results, 'shell', '手机容器声明字体库 CSS 变量入口', has(contents.shell, '#yuzi-phone-standalone')
        && has(contents.shell, '--yuzi-phone-font-family')
        && has(contents.shell, 'font-family: var(--yuzi-phone-font-family);'));
    check(results, 'fontLibrary', '字体库动态样式使用小手机作用域高优先级覆盖并排除专用字体节点', has(contents.fontLibrary, 'function buildScopedFontOverrideCss(')
        && has(contents.fontLibrary, '[data-yuzi-phone-font-id]')
        && has(contents.fontLibrary, '!important')
        && has(contents.fontLibrary, ':not(.fa-solid)')
        && has(contents.fontLibrary, ':not(.fa-brands)')
        && has(contents.fontLibrary, ':not(code)')
        && has(contents.fontLibrary, ':not(textarea)')
        && has(contents.fontLibrary, 'buildScopedFontOverrideCss(activeFont)'));
    check(results, 'fontLibrary', '字体库内置字体保持 4 种 UI 入口并移除书面/手写旧入口', has(contents.fontLibrary, "id: 'builtin.system-ui'")
        && has(contents.fontLibrary, "id: 'builtin.modern-sans'")
        && has(contents.fontLibrary, "id: 'builtin.chill-round'")
        && has(contents.fontLibrary, "id: 'builtin.basic-sans'")
        && has(contents.fontLibrary, "name: '系统清晰'")
        && has(contents.fontLibrary, "name: '现代黑体'")
        && has(contents.fontLibrary, "name: '寒蝉圆体'")
        && has(contents.fontLibrary, "name: '基础无衬线'")
        && has(contents.fontLibrary, 'YuziPhoneChillRoundF')
        && !has(contents.fontLibrary, "id: 'builtin.system'")
        && !has(contents.fontLibrary, "id: 'builtin.rounded'")
        && !has(contents.fontLibrary, "id: 'builtin.serif'")
        && !has(contents.fontLibrary, "id: 'builtin.handwriting'")
        && !has(contents.fontLibrary, "name: '宋体阅读'")
        && !has(contents.fontLibrary, "name: '手写便签'")
        && !has(contents.fontLibrary, "id: 'builtin.pixel'")
        && !has(contents.fontLibrary, "id: 'builtin.mono'")
        && !has(contents.fontLibrary, "name: '像素复古'")
        && !has(contents.fontLibrary, "name: '等宽终端'"));
    check(results, 'home', 'Dock 大字图标使用字体库变量', has(contents.home, 'font-family: var(--yuzi-phone-font-family'));
    check(results, 'shell', '手机默认字体栈使用系统 UI 无衬线链路', has(contents.shell, '-apple-system')
        && has(contents.shell, 'BlinkMacSystemFont')
        && has(contents.shell, '"PingFang SC"')
        && has(contents.shell, '"Helvetica Neue"')
        && has(contents.shell, '"Microsoft YaHei"')
        && has(contents.shell, '"HarmonyOS Sans"')
        && has(contents.shell, '"Noto Sans CJK SC"')
        && has(contents.shell, 'sans-serif')
        && !has(contents.shell, 'Tahoma, Geneva, Verdana'));
    check(results, 'settingsModern', '设置页包含字体库预览样式', has(contents.settingsModern, '.phone-settings-font-panel')
        && has(contents.settingsModern, '.phone-settings-font-preview')
        && has(contents.settingsModern, '.phone-settings-font-preview-sample'));

    check(results, 'readme', 'styles README 说明顶层入口', has(contents.readme, '## 顶层入口'));
    check(results, 'readme', 'styles README 说明 phone-base 子目录', has(contents.readme, '## phone-base 子目录'));
    check(results, 'readme', 'styles README 指向 phone-base README', has(contents.readme, '`styles/phone-base/README.md`'));
    check(results, 'readme', 'styles README 不再指向已清理的 legacy README', !has(contents.readme, '`styles/legacy/README.md`'));
    check(results, 'readme', 'styles README 不再指向已清理的 legacy phone-base README', !has(contents.readme, '`styles/legacy/phone-base/README.md`'));
    check(results, 'readme', 'styles README 说明收口原则', has(contents.readme, '## 当前收口原则'));
    check(results, 'readme', 'styles README 登记 table update review 样式层', has(contents.readme, '`12-table-update-review.css`'));
    check(results, 'readme', 'styles README 保持 table update review 在 scroll patches 之前', appearsBefore(contents.readme, '`12-table-update-review.css`', '`10-scroll-generic-patches.css`'));

    check(results, 'phoneBaseReadme', 'phone-base README 说明 modern active', has(contents.phoneBaseReadme, '## modern active'));
    check(results, 'phoneBaseReadme', 'phone-base README 登记 table update review 样式层', has(contents.phoneBaseReadme, '`12-table-update-review.css`'));
    check(results, 'phoneBaseReadme', 'phone-base README 保持 table update review 在 scroll patches 之前', appearsBefore(contents.phoneBaseReadme, '`12-table-update-review.css`', '`10-scroll-generic-patches.css`'));
    check(results, 'phoneBaseReadme', 'phone-base README 不再保留已清理的 legacy archive 段落', !has(contents.phoneBaseReadme, '## legacy archive'));

    for (const removedPath of REMOVED_FILES) {
        check(results, removedPath, `已清理 legacy 资源：${removedPath}`, !exists(removedPath));
    }

    const failed = results.filter((item) => !item.ok);
    if (failed.length > 0) {
        console.error('[style-entry-contract-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[style-entry-contract-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
