const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const load = file => import(`${pathToFileURL(path.resolve(file)).href}?t=${Date.now()}-${Math.random()}`);

async function main() {
    const { createFullscreenOverlayRuntime } = await load('modules/fullscreen-overlay/runtime.js');
    let invalidate;
    let invalidations = 0;
    const renderer = {
        batches: [],
        async play(batch) { this.batches.push(batch); return { emittedCount: batch.items.length }; },
        dispose() {}, clear() {},
        invalidateInline() { invalidations++; },
    };
    const display = {
        modelId: 'content-preset-display:preset:combo', presetId: 'preset', displayId: 'combo',
        display: { id: 'combo', kind: 'inline', name: '人物任务总览' },
        targetSheetKeys: ['sheet_people', 'sheet_tasks'],
    };
    const adapter = {
        id: 'content-preset-display', modelId: 'content-preset-display', modelIds: [], defaultEnabled: true,
        matches: () => true,
        getSignature: context => JSON.stringify(context.rawData),
        readEvents: context => [{ customDisplay: context.customDisplay, tables: context.customDisplay.targetSheetKeys.map(sheetKey => ({ sheetKey })) }],
    };
    let resolveDynamicCalls = 0;
    const runtime = createFullscreenOverlayRuntime({
        settingKey: 'fullscreenOverlay',
        getSettings: () => ({ enabled: true, sourceEnabledBySheetKey: { [display.modelId]: true }, sourceModelBySheetKey: { [display.modelId]: display.modelId }, models: {} }),
        normalizeSettings: value => value,
        readSnapshot: async () => ({}),
        buildSourceCatalog: () => [{
            sheetKey: display.modelId,
            tableName: '人物任务总览', sourceId: 'content-preset-display',
            modelId: display.modelId, modelIds: [display.modelId], supported: true, enabled: true,
            customDisplay: display, targetSheetKeys: display.targetSheetKeys,
        }],
        registry: { get: () => adapter },
        createLayerRuntime: () => ({ clear() {}, dispose() {}, getState: () => ({}) }),
        createRendererRegistry: () => new Map(),
        resolveDynamicRenderer(rendererId) {
            resolveDynamicCalls += 1;
            return rendererId === display.modelId ? renderer : null;
        },
        createScheduler: ({ resolveRenderer }) => ({
            async replace(batches) {
                for (const batch of batches) await resolveRenderer(batch.rendererId)?.play(batch, {});
                return true;
            },
            async append(batches) { return this.replace(batches); },
            clear() {}, dispose() {}, getState: () => ({}),
        }),
        createCoordinator: () => ({ start() {}, stop() {}, getState: () => ({}) }),
        subscribeInlineInvalidation: async callback => { invalidate = callback; return () => {}; },
        logger: { warn() {} },
    });
    try {
        runtime.start();
        const snapshot = {
            sheet_people: { name: '人物表', content: [['ID', '姓名'], ['p1', 'Alice']] },
            sheet_tasks: { name: '任务表', content: [['ID', '标题'], ['t1', '找猫']] },
        };
        const result = await runtime.testSelectedSources(snapshot);
        assert.equal(result.ok, true, '组合自定义展示必须可被测试入口调度');
        assert.equal(renderer.batches.length, 1, '组合展示一次测试只能交付一个批次');
        assert.equal(resolveDynamicCalls, 1, '未知的自定义样式必须通过动态 renderer resolver 解析');
        assert.equal(renderer.batches[0].customDisplay, display, '批次必须携带作者展示定义');
        assert.equal(renderer.batches[0].snapshot, snapshot, '批次必须携带一致的完整表快照');
        assert.deepEqual(renderer.batches[0].targetSheetKeys, ['sheet_people', 'sheet_tasks']);
        const before = invalidations;
        invalidate();
        assert.equal(invalidations, before + 1, '消息失效通知必须到达动态正文 renderer');
    } finally {
        runtime.stop();
    }
    console.log('[fullscreen-overlay-content-preset-display-runtime] 通过');
}
main().catch(error => {
    console.error('[fullscreen-overlay-content-preset-display-runtime] 失败');
    console.error(error);
    process.exitCode = 1;
});
