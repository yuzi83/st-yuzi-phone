const assert = require('node:assert/strict');
class Element {
    constructor() { this.children = []; this.style = { setProperty() {} }; this.attributes = {}; }
    appendChild(child) { child.remove(); child.parentNode = this; this.children.push(child); return child; }
    setAttribute(k, v) { this.attributes[k] = v; }
    remove() { if (this.parentNode) { const p = this.parentNode; p.children.splice(p.children.indexOf(this), 1); this.parentNode = null; } }
}
(async () => {
    const { createInlineTablePopupRenderer } = await import('../modules/fullscreen-overlay/renderers/inline-table-popup.js');
    const parent = new Element(), text = new Element(), foreign = new Element();
    parent.appendChild(text); parent.appendChild(foreign);
    text.after = node => { node.remove(); node.parentNode = parent; parent.children.splice(parent.children.indexOf(text) + 1, 0, node); };
    let target = { element: text, messageId: 0 };
    const renderer = createInlineTablePopupRenderer({
        documentRef: { createElement: () => new Element() },
        getSettings: () => ({}), getTarget: () => target,
    });
    const batch = (key, value) => ({ inlineGroupKey: key, sheetKey: 'sheet_1', items: [{ cells: [{ label: '内容', value }] }] });
    await renderer.play(batch('a', '一'));
    assert.equal(parent.children.length, 3);
    const first = parent.children[1];
    assert.equal(first.className, 'yuzi-phone-inline-table-popup-container');
    await renderer.play(batch('a', '二'));
    assert.equal(first.children.length, 2, '同一批次不同来源连续追加');
    await renderer.play(batch('b', '三'));
    assert.equal(parent.children.length, 3);
    assert.equal(parent.children[1].children.length, 1, '新批次替换旧组');
    assert.equal(parent.children[2], foreign, '不删除外部节点');
    renderer.clear();
    assert.equal(parent.children.length, 2);
    const aborted = new AbortController(); aborted.abort();
    await renderer.play(batch('c', '四'), { signal: aborted.signal });
    assert.equal(parent.children.length, 2);
    target = null;
    await assert.rejects(renderer.play(batch('d', '五')), /no-ai-message/);
    renderer.dispose();
    // 真正组合 runtime + scheduler + Adapter + renderer，只有宿主/数据库是测试替身。
    const { createFullscreenOverlayRuntime } = await import('../modules/fullscreen-overlay/runtime.js');
    const { createFullscreenOverlayScheduler } = await import('../modules/fullscreen-overlay/scheduler.js');
    const { createOverlaySourceRegistry } = await import('../modules/fullscreen-overlay/source-registry.js');
    const { createGenericTableSourceAdapter } = await import('../modules/fullscreen-overlay/sources/generic-table.js');
    const { buildOverlaySourceCatalog } = await import('../modules/fullscreen-overlay/source-catalog.js');
    const { normalizeFullscreenOverlaySettings } = await import('../modules/fullscreen-overlay/settings.js');
    const { createReviewResultCoordinator } = await import('../modules/fullscreen-overlay/review-result-coordinator.js');
    const documentRef = { createElement: () => new Element(), addEventListener() {}, removeEventListener() {} };
    let config = normalizeFullscreenOverlaySettings({ enabled: true, sourceOrder: ['sheet_b', 'sheet_a'], sourceModelBySheetKey: { sheet_a: 'inline-table-popup', sheet_b: 'inline-table-popup' } });
    const snapshot = { sheet_a: { name: 'A', content: [['内容'], ['甲']] }, sheet_b: { name: 'B', content: [['内容'], ['乙']] } };
    target = { element: text, messageId: 0 };
    let scheduled, invalidation, reviewSubscriber;
    const runtime = createFullscreenOverlayRuntime({
        getSettings: () => config, normalizeSettings: normalizeFullscreenOverlaySettings,
        readSnapshot: () => snapshot, getInlineTarget: () => target,
        registry: createOverlaySourceRegistry([createGenericTableSourceAdapter()]), buildSourceCatalog: buildOverlaySourceCatalog,
        subscribeInlineInvalidation: callback => { invalidation = callback; return () => { invalidation = null; }; },
        createRendererRegistry: ({ getSettings, getInlineEpoch }) => new Map([['inline-table-popup', createInlineTablePopupRenderer({ documentRef, getSettings, getInlineEpoch, getTarget: () => target })]]),
        createScheduler: options => (scheduled = createFullscreenOverlayScheduler({ ...options, documentRef, sourceGapMs: 0 })),
        createCoordinator: ({ onStableSnapshot }) => createReviewResultCoordinator({ onStableSnapshot, subscribeResults: callback => { reviewSubscriber = callback; return () => { reviewSubscriber = null; }; } }),
    });
    runtime.start();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal((await runtime.testSelectedSources()).ok, true);
    await scheduled.whenIdle();
    assert.deepEqual(parent.children[1].children.map(card => card.children[0].children[1].textContent), ['乙', '甲']);
    scheduled.pause();
    await runtime.testSelectedSources();
    invalidation();
    scheduled.resume();
    await scheduled.whenIdle();
    assert.equal(parent.children.length, 2, '清理后排队旧批次不能复活');
    target = null;
    assert.equal((await runtime.testSelectedSources()).reason, 'no-ai-message');
    config.enabled = false; runtime.refreshSettings();
    assert.equal(invalidation, null);
    assert.equal(reviewSubscriber, null);
    assert.equal((await runtime.testSelectedSources()).reason, 'disabled');
    runtime.stop();
    console.log('[通过] 正文渲染批次、节点隔离与清理');
})().catch(error => { console.error(error); process.exitCode = 1; });
