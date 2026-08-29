const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

function read(relativePath) {
    const absolutePath = path.resolve(ROOT, relativePath);
    assert.ok(
        fs.existsSync(absolutePath),
        `缺少全屏浮层发布契约文件：${relativePath}`,
    );
    return fs.readFileSync(absolutePath, 'utf8');
}

function getImports(cssText) {
    return [...cssText.matchAll(/@import\s+url\(['"]([^'"]+)['"]\);/g)]
        .map(match => match[1]);
}

function assertContains(text, pattern, message) {
    assert.ok(
        typeof pattern === 'string' ? text.includes(pattern) : pattern.test(text),
        message,
    );
}

function extractMarkdownSection(text, headingPattern, nextHeadingPattern, label) {
    const startIndex = text.search(headingPattern);
    assert.ok(startIndex >= 0, `必须能定位${label}`);

    const sectionAndTail = text.slice(startIndex);
    const headingEndIndex = sectionAndTail.indexOf('\n');
    const sectionBodyStart = headingEndIndex >= 0 ? headingEndIndex + 1 : 0;
    const sectionTail = sectionAndTail.slice(sectionBodyStart);
    const nextHeadingIndex = sectionTail.search(nextHeadingPattern);

    return nextHeadingIndex >= 0
        ? sectionAndTail.slice(0, sectionBodyStart + nextHeadingIndex)
        : sectionAndTail;
}

function containsForbiddenOverlayAutoTriggerSemantics(text) {
    const clauses = text
        .split(/[，；。！？\n]/)
        .map(clause => clause.trim())
        .filter(Boolean);

    return clauses.some((clause) => {
        const requiresDatabaseEventSubscription = (
            /(?:table-fill-start|table-update)/.test(clause)
            && /(?:订阅|监听)/.test(clause)
            && !/(?:不|无须|无需|禁止|避免)[^，；。！？\n]*(?:订阅|监听)/.test(clause)
        );
        const requiresQuietWindow = (
            /quiet window/i.test(clause)
            && /(?:等待|依赖)/.test(clause)
            && !/(?:不|无须|无需|禁止|避免)[^，；。！？\n]*(?:等待|依赖)/.test(clause)
        );

        return requiresDatabaseEventSubscription || requiresQuietWindow;
    });
}

const FORBIDDEN_SOURCE_HANDOFF_PATTERNS = [
    /等待[^。\n]*(?:所有|全部)[^。\n]*(?:弹幕|视觉元素|元素|内容)[^。\n]*(?:离场|离开|完成|结束|清理)[^。\n]*(?:后|以后)[^。\n]*(?:再|才)[^。\n]*(?:切换|进入|开始)[^。\n]*来源/,
    /前一来源[^。\n]*(?:全部|所有)[^。\n]*(?:播放)?(?:完成|结束|清理|离场|离开)[^。\n]*(?:后[^。\n]*)?(?:才|再)[^。\n]*(?:开始|进入|切换)[^。\n]*(?:下一|下一个|下个|后续)来源/,
    /前一来源[^。\n]*最后一个[^。\n]*(?:视觉元素|元素|弹幕)[^。\n]*(?:完成|结束|清理|离场|离开)[^。\n]*后[^。\n]*(?:下一|下一个|下个|后续)来源[^。\n]*(?:才|再)[^。\n]*(?:开始|进入|切换|可开始)/,
    /(?:一个|当前)来源[^。\n]*最后一个[^。\n]*(?:视觉元素|元素|弹幕)[^。\n]*(?:完成|结束|清理|离场|离开)[^。\n]*后[^。\n]*(?:才|再)[^。\n]*(?:开始|进入|切换)[^。\n]*(?:下一|下一个|下个|后续)来源/,
];

function containsForbiddenSourceHandoffSemantics(text) {
    return FORBIDDEN_SOURCE_HANDOFF_PATTERNS.some(pattern => pattern.test(text));
}

function testForbiddenSourceHandoffMatcher() {
    [
        '等待所有弹幕离场后再切换来源。',
        '前一来源全部播放完成才开始下一来源。',
        '前一来源最后一个视觉元素完成并清理后，下一来源才可开始。',
        '一个来源的最后一个元素结束后才进入下一个来源。',
    ].forEach((example) => {
        assert.ok(
            containsForbiddenSourceHandoffSemantics(example),
            `旧来源交接语义检测器必须拦截：${example}`,
        );
    });

    [
        '严格来源顺序仍保留；handoff 发生在当前来源完成发射/入口交接时。',
        '已发射的视觉元素可在交接后自然离场，不阻塞下一来源。',
        '轨道在上一条弹幕离开入口区域后即可复用，不必等待其从屏幕左侧离场。',
    ].forEach((example) => {
        assert.ok(
            !containsForbiddenSourceHandoffSemantics(example),
            `旧来源交接语义检测器不得误伤当前正确描述：${example}`,
        );
    });
}

function testStyleEntryContract() {
    const styleEntry = read('style.css');
    const overlayEntry = read('styles/16-fullscreen-overlay.css');
    const overlayRuntime = read('styles/fullscreen-overlay/00-runtime.css');
    const overlaySettings = read('styles/fullscreen-overlay/01-settings.css');
    const stylesReadme = read('styles/README.md');

    assert.deepStrictEqual(
        getImports(overlayEntry),
        [
            './fullscreen-overlay/00-runtime.css',
            './fullscreen-overlay/01-settings.css',
        ],
        '全屏浮层样式聚合层必须按 runtime → settings 顺序导入，且不得夹带其他层',
    );

    const rootImports = getImports(styleEntry);
    const imageGenerationIndex = rootImports.indexOf('./styles/15-image-generation.css');
    const fullscreenOverlayIndex = rootImports.indexOf('./styles/16-fullscreen-overlay.css');
    assert.ok(imageGenerationIndex >= 0, 'style.css 必须保留现有图片生成设置层');
    assert.strictEqual(
        fullscreenOverlayIndex,
        imageGenerationIndex + 1,
        'style.css 必须在现有最后一层之后导入全屏浮层层',
    );
    assert.strictEqual(
        fullscreenOverlayIndex,
        rootImports.length - 1,
        '全屏浮层必须是 style.css 当前最后一个聚合层',
    );

    assertContains(
        stylesReadme,
        '`16-fullscreen-overlay.css`',
        'styles README 必须登记全屏浮层聚合层',
    );
    assertContains(
        stylesReadme,
        '`fullscreen-overlay/00-runtime.css`',
        'styles README 必须登记全屏浮层 runtime 子层',
    );
    assertContains(
        stylesReadme,
        '`fullscreen-overlay/01-settings.css`',
        'styles README 必须登记全屏浮层 settings 子层',
    );
    assertContains(
        overlayEntry,
        /fullscreen-overlay/,
        '全屏浮层聚合入口必须保持独立作用域语义',
    );
    assertContains(
        overlaySettings,
        /@container\s+yuzi-phone-screen\s*\(\s*max-width:\s*420px\s*\)/,
        '弹幕设置页窄屏布局必须跟随 yuzi-phone-screen 命名容器',
    );
    assertContains(
        overlayRuntime,
        /\.yuzi-phone-fullscreen-overlay-layer\s*\{[^}]*width:\s*100vw\s*;[^}]*height:\s*100vh\s*;[^}]*width:\s*100dvw\s*;[^}]*height:\s*100dvh\s*;/s,
        '全屏浮层必须显式声明 100vw/100vh 回退与 100dvw/100dvh 动态视口尺寸',
    );
    assert.ok(
        !/@media\b/.test(overlaySettings),
        '弹幕设置页不得使用浏览器 viewport media 判断小手机窄屏布局',
    );
}

function testTypesContract() {
    const types = read('types.d.ts');

    const requiredInterfaces = [
        'FullscreenOverlayScrollingBarrageSettings',
        'FullscreenOverlaySettings',
        'FullscreenOverlaySourceCatalogEntry',
        'FullscreenOverlayEvent',
        'FullscreenOverlayRuntimePublicSeam',
        'SettingsFullscreenOverlayService',
    ];
    requiredInterfaces.forEach((name) => {
        assertContains(
            types,
            new RegExp(`export interface ${name}\\b`),
            `types.d.ts 必须声明 ${name}`,
        );
    });

    [
        'maxConcurrent: number',
        'intervalMs: number',
        'durationMs: number',
        'fontSizePx: number',
        'opacity: number',
        'palette: string[]',
        'sourceEnabledBySheetKey: Record<string, boolean>',
        'sourceOrder: string[]',
        'sourceModelBySheetKey: Record<string, string>',
        "'scrolling-barrage': FullscreenOverlayScrollingBarrageSettings",
        'sourceOrderIndex: number',
        'supported: boolean',
        'disabled: boolean',
        'enabled: boolean',
        'modelId: string',
        'text: string',
        'start:',
        'stop:',
        'suspendForChatChange:',
        'resumeAfterChatChange:',
        'refreshSettings:',
        'testSelectedSources:',
        'getState:',
        'testSources:',
        'clear:',
    ].forEach((field) => {
        assertContains(
            types,
            field,
            `types.d.ts 缺少全屏浮层关键字段：${field}`,
        );
    });

    assertContains(
        types,
        "'fullscreen_overlay'",
        'SettingsPageMode 必须登记 fullscreen_overlay',
    );
    assertContains(
        types,
        'fullscreenOverlayScrollTop: number',
        'SettingsAppState 必须登记全屏浮层页滚动位置',
    );
    assertContains(
        types,
        'rerenderFullscreenOverlayKeepScroll: () => void',
        '设置页滚动依赖必须声明全屏浮层防回顶入口',
    );
    assertContains(
        types,
        'fullscreenOverlay?: SettingsFullscreenOverlayService',
        'SettingsPageRendererGroupedDeps 必须登记全屏浮层设置服务',
    );
    assertContains(
        types,
        'renderFullscreenOverlayPage(): void',
        'SettingsPageRenderers 必须登记全屏浮层页面 renderer',
    );
    assertContains(
        types,
        'fullscreenOverlay: FullscreenOverlaySettings',
        'PhoneSettings 必须登记全屏浮层持久设置',
    );

    const overlayTypesStart = types.indexOf('// ===== 全屏浮层类型定义 =====');
    const overlayTypesEnd = types.indexOf('// ===== 性能工具类型定义 =====');
    assert.ok(
        overlayTypesStart >= 0 && overlayTypesEnd > overlayTypesStart,
        '全屏浮层类型必须收敛在独立类型区段',
    );
    const overlayTypes = types.slice(overlayTypesStart, overlayTypesEnd);
    assert.ok(
        !/\bany\b/.test(overlayTypes),
        '全屏浮层公共类型区段不得引入 any 扩散',
    );

    const eventMatch = types.match(
        /export interface FullscreenOverlayEvent\s*\{([\s\S]*?)\n\}/,
    );
    assert.ok(eventMatch, '必须能定位 FullscreenOverlayEvent 类型区段');
    assert.ok(
        !/\bmodelId\s*:/.test(eventMatch[1]),
        'FullscreenOverlayEvent 必须保持表现无关，不得携带 modelId',
    );

    const catalogMatch = types.match(
        /export interface FullscreenOverlaySourceCatalogEntry\s*\{([\s\S]*?)\n\}/,
    );
    assert.ok(catalogMatch, '必须能定位 FullscreenOverlaySourceCatalogEntry 类型区段');
    assertContains(
        catalogMatch[1],
        'modelId: string',
        '来源最终模型必须在 Catalog 层解析并声明',
    );
}

function testDocumentationContract() {
    const context = read('CONTEXT.md');
    const architecture = read('docs/architecture-guide.md');
    const contextOverlaySection = extractMarkdownSection(
        context,
        /^## 全屏浮层\s*$/m,
        /^##\s+/m,
        '领域词典的全屏浮层区段',
    );
    const architectureOverlaySection = extractMarkdownSection(
        architecture,
        /^#### 6\.3\.7 全屏浮层与弹幕设置\s*$/m,
        /^###\s+/m,
        '架构文档的全屏浮层与弹幕设置区段',
    );
    const combined = `${contextOverlaySection}\n${architectureOverlaySection}`;

    [
        '全屏浮层',
        '内容源 Adapter',
        '全局模型 registry',
        '严格串行 scheduler',
        'enabled 生命周期',
        '直播表 v1',
        'changedSnapshot',
        'rowSelection',
        '调色板',
    ].forEach((term) => {
        assertContains(
            combined,
            term,
            `领域/架构文档必须登记稳定术语：${term}`,
        );
    });

    const sourceModelBoundary =
        'Adapter 声明默认模型，Catalog/运行时解析来源绑定；事件表现无关。';
    assertContains(
        context,
        sourceModelBoundary,
        '领域词典必须登记来源默认模型、绑定解析与事件表现无关边界',
    );
    assertContains(
        architecture,
        sourceModelBoundary,
        '架构文档必须登记来源默认模型、绑定解析与事件表现无关边界',
    );

    assertContains(
        architecture,
        /弹窗[^。\n]*(可扩展接口|扩展接口)[^。\n]*(不是|并非|不属于|不在)[^。\n]*v1|v1[^。\n]*(不实现|未实现)[^。\n]*弹窗/,
        '架构文档必须明确弹窗只是可扩展接口，不能写成 v1 已实现能力',
    );
    assertContains(
        architecture,
        /transform/,
        '架构文档必须登记移动端动画仅走 transform 的性能边界',
    );
    assertContains(
        architecture,
        /pointer-events:\s*none/,
        '架构文档必须登记全屏浮层点击穿透边界',
    );

    const sourceHandoffBoundary =
        '严格来源顺序仍保留；handoff 发生在当前来源完成发射/入口交接时。';
    const naturalExitBoundary =
        '已发射的视觉元素可在交接后自然离场，不阻塞下一来源。';
    const barrageDensityBoundary =
        '滚动弹幕密度表示轨道/视觉密度，不等于活动 DOM 数；运行时另设内部 DOM 硬上限。';
    const reviewResultSeamBoundary =
        /审核结果自动触发 seam[\s\S]{0,120}全屏浮层唯一的自动播放入口|结构化审核结果[^。\n]*全屏浮层唯一的自动触发 seam/;
    const noSecondDatabaseReadBoundary =
        /(?:不|不得)[^。\n]*自动路径[^。\n]*(?:二次读取数据库|再次调用数据库读取)|自动路径[^。\n]*(?:不|不得)[^。\n]*(?:二次读取数据库|再次调用数据库读取)/;
    const sharedPlaybackPipelineBoundary =
        /(?:手动测试|手动路径)[^。\n]*(?:自动播放|自动路径)[^。\n]*(?:复用|统一进入)[^。\n]*Adapter[^。\n]*模型[^。\n]*(?:Scheduler|scheduler)|(?:自动播放|自动路径)[^。\n]*(?:手动测试|手动路径)[^。\n]*(?:复用|统一进入)[^。\n]*Adapter[^。\n]*模型[^。\n]*(?:Scheduler|scheduler)/;

    [
        [sourceHandoffBoundary, '来源严格顺序与 handoff 边界'],
        [naturalExitBoundary, '已发视觉元素自然离场边界'],
        [barrageDensityBoundary, '弹幕轨道密度与内部 DOM 硬上限边界'],
        [reviewResultSeamBoundary, '审核结果作为唯一自动触发 seam 的边界'],
        [noSecondDatabaseReadBoundary, '自动路径不得二次读取数据库的边界'],
        [sharedPlaybackPipelineBoundary, '手动与自动复用播放管线的边界'],
    ].forEach(([boundary, label]) => {
        assertContains(
            contextOverlaySection,
            boundary,
            `领域词典必须登记${label}`,
        );
        assertContains(
            architectureOverlaySection,
            boundary,
            `架构文档必须登记${label}`,
        );
    });

    assert.ok(
        !containsForbiddenSourceHandoffSemantics(combined),
        '领域/架构文档不得继续要求最后一个视觉元素完成并清理后才切换来源',
    );
    assert.ok(
        !containsForbiddenOverlayAutoTriggerSemantics(contextOverlaySection),
        '领域词典的全屏浮层区段不得要求订阅 table-fill-start/table-update 或等待 quiet window',
    );
    assert.ok(
        !containsForbiddenOverlayAutoTriggerSemantics(architectureOverlaySection),
        '架构文档的全屏浮层区段不得要求订阅 table-fill-start/table-update 或等待 quiet window',
    );
}

function main() {
    testForbiddenSourceHandoffMatcher();
    testStyleEntryContract();
    testTypesContract();
    testDocumentationContract();
    console.log('[fullscreen-overlay-docs-style-contract] passed');
}

main();
