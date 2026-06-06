const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = process.cwd();
function toModuleUrl(relativePath) {
    return pathToFileURL(path.join(ROOT, relativePath)).href;
}

async function main() {
    let helperCalls = 0;
    global.window = {
        TavernHelper: {
            getVariables() {
                helperCalls += 1;
                return { fallback: 'helper' };
            },
        },
    };

    const api = await import(toModuleUrl('modules/variable-manager/variable-api.js'));

    let waitCalls = 0;
    globalThis.waitGlobalInitialized = async (name) => {
        waitCalls += 1;
        assert.equal(name, 'Mvu');
        global.window.Mvu = {
            getMvuData({ message_id }) {
                return {
                    stat_data: { fromMvu: message_id },
                    display_data: { ignored: true },
                };
            },
        };
    };

    const waitedResult = await api.getFloorVariablesAsync(7, { timeoutMs: 20, retryIntervalMs: 1 });
    assert.equal(waitCalls, 1, '初始 MVU 不可用时必须等待初始化');
    assert.equal(helperCalls, 0, '等待后 MVU 可用时不得直接 fallback TavernHelper');
    assert.equal(waitedResult.status, 'ready');
    assert.equal(waitedResult.isMvu, true);
    assert.deepEqual(waitedResult.data, { fromMvu: 7 });
    assert.equal(waitedResult.meta.source, 'mvu');
    assert.equal(waitedResult.meta.waitedMvu, true);
    assert.equal(waitedResult.meta.mvuInitiallyAvailable, false);
    assert.equal(waitedResult.meta.mvuAvailableAfterWait, true);


    delete global.window.Mvu;
    globalThis.waitGlobalInitialized = async () => {
        waitCalls += 1;
    };

    const fallbackResult = await api.getFloorVariablesAsync(8, { timeoutMs: 5, retryIntervalMs: 1 });
    assert.equal(fallbackResult.status, 'ready');
    assert.equal(fallbackResult.isMvu, false);
    assert.deepEqual(fallbackResult.data, { fallback: 'helper' });
    assert.equal(fallbackResult.meta.source, 'tavern-helper');
    assert.equal(fallbackResult.meta.mvuInitiallyAvailable, false);
    assert.equal(fallbackResult.meta.mvuAvailableAfterWait, false);
    assert.ok(fallbackResult.meta.waitedMvu === false || fallbackResult.meta.waitedMvu === true);

    delete globalThis.waitGlobalInitialized;
    console.log('[variable-manager-mvu-readiness-behavior-check] 检查通过');
}

main().catch((error) => {
    console.error('[variable-manager-mvu-readiness-behavior-check] 检查失败：');
    console.error(error);
    process.exitCode = 1;
});
