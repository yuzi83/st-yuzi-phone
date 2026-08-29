const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function importModule(relativePath) {
    return import(pathToFileURL(path.join(ROOT, relativePath)).href);
}

async function main() {
    const state = read('modules/settings-app/state-machine.js');
    const primitives = read('modules/settings-app/layout/primitives.js');
    const builders = read('modules/settings-app/layout/page-builders.js');
    const overviewBuilders = read('modules/settings-app/layout/page-builders/overview-builders.js');
    const frame = read('modules/settings-app/layout/frame.js');
    const render = read('modules/settings-app/render.js');
    const contexts = read('modules/settings-app/page-renderers/page-context-builders.js');
    const renderers = read('modules/settings-app/page-renderers.js');
    const personalization = read('modules/settings-app/page-renderers/personalization-renderers.js');

    assert.match(state, /fullscreenOverlayScrollTop:\s*0/u);
    assert.match(primitives, /fullscreen_overlay:\s*\{/u);
    assert.match(primitives, /title:\s*'弹幕设置'/u);

    assert.match(builders, /export function buildFullscreenOverlayPageHtml/u);
    assert.match(frame, /buildFullscreenOverlayPageHtml/u);
    assert.match(
        overviewBuilders,
        /['"]fullscreen_overlay['"]/u,
        '弹幕设置入口应由 overview builders 的正式 entries/groups 数据声明',
    );
    assert.doesNotMatch(
        builders,
        /appendFullscreenOverlayHomeEntry|indexOf\(|lastIndexOf\(/u,
        'page-builders 聚合层不应通过 HTML 字符串查找/注入设置入口',
    );

    assert.match(render, /createFullscreenOverlaySettingsService/u);
    assert.match(render, /rerenderFullscreenOverlayKeepScroll/u);
    assert.match(render, /fullscreenOverlay:\s*fullscreenOverlaySettingsService/u);
    assert.match(render, /mode === 'fullscreen_overlay'/u);

    assert.match(contexts, /fullscreenOverlay:\s*ensureObject\(deps\.fullscreenOverlay\)/u);
    assert.match(contexts, /rerenderFullscreenOverlayKeepScroll:\s*services\.scroll\.rerenderFullscreenOverlayKeepScroll/u);
    assert.match(contexts, /showToast:\s*services\.feedback\.showToast/u);
    assert.match(contexts, /fullscreenOverlaySettingsService:\s*services\.fullscreenOverlay/u);
    assert.match(contexts, /fullscreenOverlay:\s*buildFullscreenOverlayPageContextFromServices\(services\)/u);

    assert.match(renderers, /assertObjectDep\('fullscreenOverlay', deps\.fullscreenOverlay\)/u);
    assert.doesNotMatch(
        renderers,
        /assertFunctionDeps\('fullscreenOverlay'/u,
        '全屏浮层设置页应注入深 service，不应把具体业务方法展开为 renderer 宽接口',
    );

    assert.match(personalization, /createFullscreenOverlayPage/u);
    assert.match(personalization, /renderFullscreenOverlayPage/u);
    assert.match(personalization, /fullscreen_overlay:\s*\{/u);
    assert.match(personalization, /return createFullscreenOverlayPage\(fullscreenOverlayContext\)/u);

    const { buildSettingsHomePageHtml } = await importModule('modules/settings-app/layout/page-builders.js');
    for (const contentPresetFullPageRuntimeEnabled of [true, false]) {
        const homeHtml = buildSettingsHomePageHtml({ contentPresetFullPageRuntimeEnabled });
        const overlayMatches = homeHtml.match(/data-entry="fullscreen_overlay"/gu) || [];
        assert.equal(overlayMatches.length, 1, '弹幕设置入口应且仅应渲染一次');
        assert.match(homeHtml, />弹幕设置</u);

        const groupStarts = [...homeHtml.matchAll(/class="phone-settings-profile-action-group"/gu)]
            .map(match => match.index);
        const replacementIndex = homeHtml.indexOf('data-entry="table_content_replacement"');
        const overlayIndex = homeHtml.indexOf('data-entry="fullscreen_overlay"');
        const groupIndexFor = entryIndex => groupStarts.findLastIndex(groupStart => groupStart < entryIndex);

        assert.ok(replacementIndex >= 0);
        assert.ok(overlayIndex > replacementIndex, '弹幕设置应排在表格内容词汇替换之后');
        assert.equal(
            groupIndexFor(overlayIndex),
            groupIndexFor(replacementIndex),
            '弹幕设置应保持在表格工具所在的末尾分组',
        );
    }

    console.log('[通过] 全屏浮层设置页接入 Settings App 中央渲染循环');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
