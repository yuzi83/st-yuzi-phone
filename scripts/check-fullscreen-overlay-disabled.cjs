const assert = require('node:assert/strict');
(async () => {
    const { createFullscreenOverlayRuntime } = await import('../modules/fullscreen-overlay/runtime.js');
    const { normalizeFullscreenOverlaySettings } = await import('../modules/fullscreen-overlay/settings.js');
    let config = { enabled: false };
    let creates = 0, disposes = 0, reads = 0;
    const runtime = createFullscreenOverlayRuntime({
        normalizeSettings: normalizeFullscreenOverlaySettings, getSettings: () => config,
        readSnapshot: () => { reads++; return {}; }, buildSourceCatalog: () => [],
        createLayerRuntime: () => { creates++; return { dispose() { disposes++; } }; },
        createRendererRegistry: () => new Map(),
        createScheduler: () => ({ dispose() {}, replace() { return true; } }),
        createCoordinator: () => ({ start: () => true, stop() {}, resumeWithBaseline: () => true }),
    });
    runtime.start();
    assert.equal(creates, 0, '默认关闭不建立浮层运行时资源');
    assert.equal((await runtime.testSelectedSources()).reason, 'disabled', '测试不能绕过总开关');
    assert.equal(reads, 0);
    config = { enabled: true }; runtime.refreshSettings();
    assert.equal(creates, 1);
    config = { enabled: false }; runtime.refreshSettings();
    assert.equal(disposes, 1, '关闭销毁而非暂停');
    assert.equal(runtime.getState().scheduler, null);
    config = { enabled: true }; runtime.refreshSettings();
    assert.equal(creates, 2, '重新开启建立新资源');
    runtime.stop();
    assert.equal(disposes, 2);
    console.log('[通过] 总开关完全停止与重新启用');
})().catch(error => { console.error(error); process.exitCode = 1; });
