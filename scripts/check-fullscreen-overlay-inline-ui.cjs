const assert = require('node:assert/strict');
(async () => {
    const { buildFullscreenOverlayPageHtml } = await import('../modules/settings-app/layout/page-builders/fullscreen-overlay-builders.js');
    const { normalizeFullscreenOverlaySettings } = await import('../modules/fullscreen-overlay/settings.js');
    const html = buildFullscreenOverlayPageHtml({ status: 'ready', config: normalizeFullscreenOverlaySettings(), selectedModelId: 'inline-table-popup', tables: [] });
    assert.match(html, /value="inline-table-popup" selected/);
    assert.doesNotMatch(html, /id="phone-fullscreen-overlay-popup-duration"/);
    assert.match(html, /phone-fullscreen-overlay-popup-column-count/);
    assert.match(html, /清空当前内容/);
    assert.match(html, /id="phone-fullscreen-overlay-test"[^>]*disabled/);
    console.log('[通过] 正文独立参数面板与关闭时禁用测试');
})().catch(error => { console.error(error); process.exitCode = 1; });
