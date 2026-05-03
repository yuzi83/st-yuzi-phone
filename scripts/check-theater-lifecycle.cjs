const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = {
    routeRenderer: 'modules/phone-core/route-renderer.js',
    render: 'modules/phone-theater/render.js',
    interactions: 'modules/phone-theater/interactions.js',
};

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function extractFunctionBody(source, name, pattern) {
    const match = pattern.exec(source);
    assert(match, `未找到 ${name}`);

    let index = match.index + match[0].length;
    let depth = 1;
    while (index < source.length && depth > 0) {
        const char = source[index];
        if (char === '{') depth += 1;
        if (char === '}') depth -= 1;
        index += 1;
    }

    assert(depth === 0, `${name} 函数体括号不平衡`);
    return source.slice(match.index, index);
}

function assertOrdered(haystack, tokens, label) {
    let cursor = -1;
    tokens.forEach((token) => {
        const next = haystack.indexOf(token, cursor + 1);
        assert(next !== -1, `${label} 缺少片段：${token}`);
        assert(next > cursor, `${label} 片段顺序错误：${token}`);
        cursor = next;
    });
}

const sources = Object.fromEntries(Object.entries(files).map(([key, relativePath]) => [key, read(relativePath)]));
const routeRenderer = sources.routeRenderer;
const render = sources.render;
const interactions = sources.interactions;

assert(
    routeRenderer.includes('async function loadRouteRenderer(route, renderToken)')
        && routeRenderer.includes('const routeRenderer = await loadRouteRenderer(route, renderToken);'),
    'route-renderer 必须把 renderToken 传入 loadRouteRenderer，不能让 theater 自己猜 route token',
);
assert(
    routeRenderer.includes('renderTheaterScene(page, sceneId, { renderToken });'),
    'theater route 必须把 renderToken 显式传给 renderTheaterScene',
);

const lifecycleBody = extractFunctionBody(
    render,
    'createTheaterLifecycleContext',
    /function\s+createTheaterLifecycleContext\s*\([^)]*\)\s*{/
);
assert(lifecycleBody.includes('const renderToken = normalizeRenderToken(options.renderToken);'), 'theater lifecycle 必须读取 options.renderToken');
assert(lifecycleBody.includes('phoneRuntime.isDisposed()'), 'theater lifecycle 必须检查 phoneRuntime.isDisposed()');
assert(lifecycleBody.includes('!container.isConnected'), 'theater lifecycle 必须检查 container.isConnected');
assert(lifecycleBody.includes('container.__phoneTheaterSceneState?.sceneId !== expectedSceneId'), 'theater lifecycle 必须检查 sceneId 未漂移');
assert(lifecycleBody.includes('getPhoneCoreState().routeRenderToken !== renderToken'), 'theater lifecycle 必须检查 routeRenderToken 未过期');

const renderSceneBody = extractFunctionBody(
    render,
    'renderTheaterScene',
    /export\s+function\s+renderTheaterScene\s*\([^)]*\)\s*{/
);
assert(renderSceneBody.includes('export function renderTheaterScene(container, sceneId, options = {})'), 'renderTheaterScene 必须接收 options');
assertOrdered(renderSceneBody, [
    'const lifecycle = createTheaterLifecycleContext(container, state.sceneId, options);',
    'if (!lifecycle.isActive()) return;',
    'container.innerHTML = buildTheaterScenePageHtml(viewModel, uiState);',
    'lifecycle,',
], 'renderTheaterScene');
assert(renderSceneBody.includes('if (!lifecycle.isActive()) return;\n        renderTheaterScene(container, state.sceneId, options);'), 'renderCurrentScene 必须在重渲染前检查 lifecycle');

assert(interactions.includes('function isTheaterInteractionActive(container, options = {})'), 'interactions 必须定义 active guard');
assert(interactions.includes('function requestRenderIfActive(container, options)'), 'interactions 必须定义 render active helper');
assert(interactions.includes('function showToastIfActive(container, options, message, isError = false)'), 'interactions 必须定义 toast active helper');
assert(interactions.includes('lifecycle: options.lifecycle,'), 'scene bindInteractions context 必须传递 lifecycle');

const executeBody = extractFunctionBody(
    interactions,
    'executeConfirmedDelete',
    /async\s+function\s+executeConfirmedDelete\s*\([^)]*\)\s*{/
);
assertOrdered(executeBody, [
    'if (!isTheaterInteractionActive(container, options)) return;',
    'state.deleting = true;',
    'requestRenderIfActive(container, options);',
    'const result = await deleteTheaterEntities(getTableData(), sceneId, selectedKeys);',
    'if (!isTheaterInteractionActive(container, options)) return;',
    'state.deleting = false;',
], 'executeConfirmedDelete success/failure lifecycle');
assert(!executeBody.includes('requestRender(options);'), 'executeConfirmedDelete await 链路不能裸 requestRender');
assert(!executeBody.includes('showToast(container,'), 'executeConfirmedDelete await 链路不能裸 showToast');
assertOrdered(executeBody, [
    "console.error('[YuziPhone] Theater delete failed:', error);",
    'if (!isTheaterInteractionActive(container, options)) return;',
    'state.deleting = false;',
    'requestRenderIfActive(container, options);',
    "showToastIfActive(container, options, '删除失败：执行过程中发生异常', true);",
], 'executeConfirmedDelete catch lifecycle');

const confirmBody = extractFunctionBody(
    interactions,
    'confirmDelete',
    /function\s+confirmDelete\s*\([^)]*\)\s*{/
);
assert(confirmBody.includes('if (!isTheaterInteractionActive(container, options)) return;'), 'confirmDelete 必须在打开确认弹窗前检查 active');
assert(confirmBody.includes("showToastIfActive(container, options, '请先选择要删除的内容', true);"), 'confirmDelete 空选择 toast 必须 active-only');
assert(confirmBody.includes('() => executeConfirmedDelete(container, options)'), '确认弹窗回调必须进入 executeConfirmedDelete，让延迟确认再次检查 active');

['setDeleteMode', 'selectAllCurrent', 'clearSelection', 'toggleSelection'].forEach((name) => {
    const body = extractFunctionBody(interactions, name, new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*{`));
    assert(body.includes('if (!isTheaterInteractionActive(container, options)) return;'), `${name} 必须在写 state 前检查 active`);
    assert(body.includes('requestRenderIfActive(container, options);'), `${name} 必须 active-only render`);
});

console.log('[theater-lifecycle-check] 检查通过');
console.log('- OK | route token 显式传入 theater render');
console.log('- OK | theater render 组合检查 route token、runtime、container 与 sceneId');
console.log('- OK | 删除确认入口与 await 后 UI 回写受 lifecycle guard 保护');
console.log('- OK | 同步删除管理交互不在 inactive 旧容器上写 state/render');
