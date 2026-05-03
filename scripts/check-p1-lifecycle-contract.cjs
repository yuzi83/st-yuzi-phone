const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const FILES = {
    scrollGuards: 'modules/phone-core/scroll-guards.js',
    tableContext: 'modules/table-viewer/context.js',
    tableViewerRender: 'modules/table-viewer/render.js',
    theaterRender: 'modules/phone-theater/render.js',
    theaterInteractions: 'modules/phone-theater/interactions.js',
    liveScene: 'modules/phone-theater/scenes/live.js',
};

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function has(content, snippet) {
    return content.includes(snippet);
}

function check(results, fileKey, description, ok) {
    results.push({ file: FILES[fileKey], description, ok });
}

function main() {
    const contents = Object.fromEntries(
        Object.entries(FILES).map(([key, relativePath]) => [key, read(relativePath)])
    );

    const results = [];

    check(results, 'scrollGuards', 'scroll guards 定义 touch 独立幂等标记', has(contents.scrollGuards, "const PHONE_TOUCH_GUARD_BOUND_ATTR = 'phoneTouchGuardBound';"));
    check(results, 'scrollGuards', 'bindTouchGuard() 读取 touch 幂等标记', has(contents.scrollGuards, 'boundary.dataset[PHONE_TOUCH_GUARD_BOUND_ATTR] === \'1\''));
    check(results, 'scrollGuards', 'bindTouchGuard() 设置 touch 幂等标记', has(contents.scrollGuards, "boundary.dataset[PHONE_TOUCH_GUARD_BOUND_ATTR] = '1';"));

    check(results, 'tableContext', 'table viewer 加载失败页接收 runtime', has(contents.tableContext, 'runtime = null,'));
    check(results, 'tableContext', 'table viewer 加载失败页优先 runtime.addEventListener() 托管返回按钮', has(contents.tableContext, "runtime.addEventListener(backButton, 'click', navigateBack);"));
    check(results, 'tableContext', 'table viewer 加载失败页在缺少可用 runtime 时保留 fallback', has(contents.tableContext, "backButton.addEventListener('click', navigateBack);"));
    check(results, 'tableViewerRender', 'table viewer render 无效表格路径向加载失败页传入 viewerRuntime', has(contents.tableViewerRender, 'runtime: viewerRuntime,'));

    check(results, 'theaterRender', 'theater lifecycle 暴露 runtime 代理', has(contents.theaterRender, 'runtime: phoneRuntime,'));
    check(results, 'theaterRender', 'theater lifecycle 暴露 addEventListener 代理', has(contents.theaterRender, 'addEventListener: (...args) => phoneRuntime.addEventListener(...args),'));
    check(results, 'theaterRender', 'theater lifecycle 暴露 isDisposed 代理', has(contents.theaterRender, 'isDisposed: () => typeof phoneRuntime?.isDisposed === \'function\' && phoneRuntime.isDisposed(),'));
    check(results, 'theaterRender', 'theater 返回按钮通过生命周期托管', has(contents.theaterRender, "runtime.addEventListener(backButton, 'click', navigateBack);"));
    check(results, 'theaterRender', 'theater render 绑定通用事件时传入 lifecycle', has(contents.theaterRender, 'bindTheaterSceneEvents(container, lifecycle);'));

    check(results, 'theaterInteractions', 'scene-specific interactions 由 createSceneInteractionContext() 统一注入', has(contents.theaterInteractions, 'function createSceneInteractionContext(options = {}) {'));
    check(results, 'theaterInteractions', 'scene context 暴露 addEventListener runtime 能力', has(contents.theaterInteractions, 'addEventListener: (...args) => {'));
    check(results, 'theaterInteractions', 'scene context 暴露 registerCleanup runtime 能力', has(contents.theaterInteractions, 'registerCleanup: (...args) => {'));
    check(results, 'theaterInteractions', 'theater 容器 click 优先通过 lifecycle.addEventListener() 托管', has(contents.theaterInteractions, "container.__phoneTheaterClickCleanup = lifecycle.addEventListener(container, 'click', container.__phoneTheaterClickHandler);"));
    check(results, 'theaterInteractions', 'theater 容器 click fallback 保留显式 cleanup', has(contents.theaterInteractions, 'container.__phoneTheaterClickCleanup = () => {'));

    check(results, 'liveScene', 'live scene bindInteractions 接收 context', has(contents.liveScene, 'function bindInteractions(container, context = {})'));
    check(results, 'liveScene', 'live scene bindBarrageToggle 接收 context', has(contents.liveScene, 'function bindBarrageToggle(toggleButton, context = {})'));
    check(results, 'liveScene', 'live scene 点击处理检查 isActive', has(contents.liveScene, "typeof context.isActive === 'function' && !context.isActive()"));
    check(results, 'liveScene', 'live scene 点击处理检查 isDisposed', has(contents.liveScene, "typeof context.isDisposed === 'function' && context.isDisposed()"));
    check(results, 'liveScene', 'live scene 优先通过 context.addEventListener() 托管弹幕按钮', has(contents.liveScene, "context.addEventListener(toggleButton, 'click', handleClick);"));

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[p1-lifecycle-contract-check] 检查失败：');
        for (const item of failed) {
            console.error(`- ${item.file}: ${item.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[p1-lifecycle-contract-check] 检查通过');
    for (const item of results) {
        console.log(`- OK | ${item.file} | ${item.description}`);
    }
}

main();
