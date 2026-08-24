const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    return import(href);
}

async function testSettingsRouteRegistersTheReturnedDisposer() {
    const [
        { __test__loadRouteRenderer },
        { disposeRoutePage },
    ] = await Promise.all([
        importModule('modules/phone-core/route-renderer.js'),
        importModule('modules/phone-core/route-page-lifecycle.js'),
    ]);
    const page = {};
    let renderCalls = 0;
    let disposeCalls = 0;
    const routeRenderer = await __test__loadRouteRenderer('settings', 1, {
        renderSettings(receivedPage) {
            renderCalls += 1;
            assert.equal(receivedPage, page);
            return () => {
                disposeCalls += 1;
            };
        },
    });

    await routeRenderer.render(page);
    assert.equal(renderCalls, 1);
    assert.equal(disposeCalls, 0);
    assert.equal(disposeRoutePage(page), true);
    assert.equal(disposeCalls, 1, '移除设置 route page 时必须调用 renderSettings 返回的 disposer');
    assert.equal(disposeRoutePage(page), false, '设置 route disposer 必须只运行一次');
}

async function main() {
    await testSettingsRouteRegistersTheReturnedDisposer();
    console.log('[settings-route-lifecycle] passed');
}

main().catch((error) => {
    console.error('[settings-route-lifecycle] failed');
    console.error(error);
    process.exitCode = 1;
});
