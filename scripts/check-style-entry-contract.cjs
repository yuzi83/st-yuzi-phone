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
    tokens: 'styles/phone-base/00-phone-tokens.css',
    navCore: 'styles/phone-base/06-layout-nav-core.css',
    genericTemplate: 'styles/05-phone-generic-template.css',
    tableUpdateReview: 'styles/phone-base/12-table-update-review.css',
    contentPresets: 'styles/13-content-presets.css',
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
    'styles/14-qq.css',
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
    check(results, 'entry', '顶层入口继续导入 generic template layer', has(contents.entry, "@import url('./styles/05-phone-generic-template.css');"));
    check(results, 'entry', '顶层入口不再导入旧 QQ App 样式层', !has(contents.entry, "@import url('./styles/14-qq.css');"));
    check(results, 'entry', '顶层入口不再导入旧 special 样式层', !has(contents.entry, "@import url('./styles/03-phone-special-base.css');")
        && !has(contents.entry, "@import url('./styles/04-phone-special-interactions.css');"));
    check(results, 'entry', '顶层入口声明 shell / base / generic 分层说明', has(contents.entry, 'Layer map') && !has(contents.entry, '内置 QQ 实时聊天 App'));

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
    const contentPresetRootBlock = getCssRuleBlock(contents.contentPresets, '.phone-content-preset-root');
    const phoneShellBlock = getCssRuleBlock(contents.shell, '#yuzi-phone-standalone .yuzi-phone-shell');
    const dynamicIslandBlock = getCssRuleBlock(contents.shell, '#yuzi-phone-standalone .yuzi-phone-notch');
    const baseNavBlock = getCssRuleBlock(contents.navCore, '.phone-nav-bar');
    const settingsNavBlock = getCssRuleBlock(contents.settingsModern, '.phone-settings-page .phone-nav-bar');
    const genericNavBlock = getCssRuleBlock(contents.genericTemplate, '.phone-generic-root.phone-generic-template-scope .phone-generic-slot-nav');

    check(results, 'shell', 'legacy shell exposes a physical bezel around the screen', has(phoneShellBlock, 'display: flex;')
        && has(phoneShellBlock, 'flex-direction: column;')
        && has(phoneShellBlock, 'border: var(--yuzi-phone-frame-border-width, 6px) solid var(--yuzi-phone-bg-app, #000);')
        && has(phoneShellBlock, '0 0 0 var(--yuzi-phone-shell-bezel-inner-width, 4px) var(--yuzi-phone-bg-shell-bezel-inner, #3a3a3a)')
        && has(phoneShellBlock, '0 0 0 var(--yuzi-phone-shell-bezel-outer-width, 8px) var(--yuzi-phone-bg-shell-bezel-outer, #1a1a1a)'));
    check(results, 'tokens', 'bezel rings and app nav geometry are public visual tokens', has(contents.tokens, '--yuzi-phone-bg-shell-bezel-inner: #3a3a3a;')
        && has(contents.tokens, '--yuzi-phone-bg-shell-bezel-outer: #1a1a1a;')
        && has(contents.tokens, '--yuzi-phone-shell-bezel-inner-width: 4px;')
        && has(contents.tokens, '--yuzi-phone-shell-bezel-outer-width: 8px;')
        && has(contents.tokens, '--yuzi-phone-app-nav-top-padding: var(--yuzi-phone-status-safe-height);')
        && has(contents.tokens, '--yuzi-phone-nav-content-height: 54px;')
        && has(contents.tokens, '--yuzi-phone-nav-padding-inline-start: 10px;')
        && has(contents.tokens, '--yuzi-phone-nav-padding-inline-end: 12px;')
        && has(contents.tokens, '--yuzi-phone-nav-control-size: 32px;')
        && has(contents.tokens, '--yuzi-phone-nav-icon-size: 24px;')
        && has(contents.tokens, '--yuzi-phone-nav-side-slot-width: clamp(44px, 15cqi, 60px);')
        && has(contents.tokens, '--yuzi-phone-nav-title-font-size: 17px;')
        && has(contents.tokens, '--yuzi-phone-nav-title-line-height: 24px;')
        && has(contents.tokens, '--yuzi-phone-nav-title-font-weight: 500;')
        && has(contents.tokens, '--yuzi-phone-nav-secondary-actions-gap: 6px;')
        && has(contents.tokens, '--yuzi-phone-nav-secondary-actions-padding-inline: 10px;')
        && has(contents.tokens, '--yuzi-phone-nav-secondary-actions-padding-block-end: 10px;')
        && has(contents.tokens, '--yuzi-phone-nav-inline-actions-side-slot-width: clamp(76px, 27cqi, 108px);')
        && has(contents.tokens, '--yuzi-phone-nav-inline-actions-gap: clamp(4px, 1.5cqi, 6px);')
        && has(contents.tokens, '--yuzi-phone-nav-inline-action-padding-inline: clamp(4px, 2cqi, 8px);'));
    check(results, 'shell', 'phone screen exposes the shared inline-size container', has(contents.shell, 'container-name: yuzi-phone-screen;')
        && has(contents.shell, 'container-type: inline-size;'));
    check(results, 'shell', 'core shell selectors are rooted and Yuzi namespaced',
        has(contents.shell, '#yuzi-phone-standalone .yuzi-phone-shell')
        && has(contents.shell, '#yuzi-phone-standalone .yuzi-phone-screen')
        && has(contents.shell, '#yuzi-phone-standalone .yuzi-phone-home-indicator')
        && !/(^|[,{]\s*)\.phone-(?:shell|screen|home-indicator|notch|status-bar|status-time|status-icons|temporary-layer-host)\b/m.test(contents.shell));
    check(results, 'shell', 'dynamic island keeps the new UI dimensions', has(dynamicIslandBlock, 'width: var(--yuzi-phone-dynamic-island-width, 78px);')
        && has(dynamicIslandBlock, 'height: var(--yuzi-phone-dynamic-island-height, 24px);'));
    check(results, 'navCore', 'base app nav owns the shared three-slot geometry below the status-safe area', has(baseNavBlock, 'var(--yuzi-phone-nav-side-slot-width)')
        && has(baseNavBlock, 'minmax(0, 1fr)')
        && has(baseNavBlock, 'min-height: calc(var(--yuzi-phone-app-nav-top-padding) + var(--yuzi-phone-nav-content-height));')
        && has(baseNavBlock, 'padding: var(--yuzi-phone-app-nav-top-padding) 0 0;'));
    check(results, 'navCore', 'base app nav owns icon-only controls and title ellipsis', has(contents.navCore, 'width: var(--yuzi-phone-nav-control-size);')
        && has(contents.navCore, 'height: var(--yuzi-phone-nav-control-size);')
        && has(contents.navCore, 'width: var(--yuzi-phone-nav-icon-size);')
        && has(contents.navCore, 'background: transparent;')
        && has(contents.navCore, 'pointer-events: none;')
        && has(contents.navCore, 'width: max-content;')
        && has(contents.navCore, 'text-overflow: ellipsis;')
        && has(contents.navCore, 'white-space: nowrap;'));
    check(results, 'settingsModern', 'settings and fusion only override shared nav theme roles', has(settingsNavBlock, '--yuzi-phone-nav-background:')
        && has(settingsNavBlock, '--yuzi-phone-nav-border-color:')
        && has(settingsNavBlock, '--yuzi-phone-nav-action-color:')
        && has(settingsNavBlock, '--yuzi-phone-nav-title-color:')
        && !/(?:^|;)\s*(?:padding|height|min-height|grid-template-columns|font-size)\s*:/m.test(settingsNavBlock));
    check(results, 'genericTemplate', 'generic nav only supplies its template theme roles', has(genericNavBlock, 'background: var(--_gt-nav-bg);')
        && has(genericNavBlock, 'border-bottom: 1px solid var(--_gt-nav-border);')
        && !/(?:^|;)\s*(?:padding|height|min-height|grid-template-columns|font-size)\s*:/m.test(genericNavBlock));
    check(results, 'contentPresets', '完整页面预设根节点可伸缩并负责纵向滚动', has(contentPresetRootBlock, 'flex: 1 1 auto;')
        && has(contentPresetRootBlock, 'min-height: 0;')
        && has(contentPresetRootBlock, 'height: 100%;')
        && has(contentPresetRootBlock, 'overflow-y: auto;')
        && has(contentPresetRootBlock, 'touch-action: pan-y;'));
    check(results, 'home', '主页不再保留整屏 overlay 规则', homeOverlayBlock.length === 0);
    check(results, 'home', '主页不再使用 15% 黑色遮罩压暗壁纸', !has(contents.home, 'background: rgba(0, 0, 0, 0.15);'));
    check(results, 'home', '主页无壁纸时由登记的 Figma 壁纸 token 提供默认背景', has(contents.home, 'background-image: var(--yuzi-phone-home-wallpaper-image);')
        && !has(contents.home, 'linear-gradient(180deg, #f4efe6'));
    check(results, 'home', '主页 App 名称使用受控颜色变量与局部文字阴影保障可读性', has(contents.home, '.phone-app-label')
        && has(contents.home, 'color: var(--yuzi-phone-home-app-label-color);')
        && has(contents.home, 'text-shadow: var(--yuzi-phone-home-app-label-shadow);'));
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
