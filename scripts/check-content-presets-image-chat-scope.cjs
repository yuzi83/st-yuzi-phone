const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const load = file => import(pathToFileURL(path.resolve(file)).href);

async function main() {
    const { createContentPresetImageGenerationHost } = await load('modules/content-presets/image-generation-host.js');
    const { createStableImageOwnershipService, createStableImageOwnershipTarget } = await load('modules/image-generation/stable-image-ownership.js');
    const { createStableImageOwnershipRepository } = await load('modules/image-generation/stable-image-ownership-repository.js');
    const { createTableDisplayImageGenerationService } = await load('modules/image-generation/table-display-image-generation-service.js');
    const records = new Map();
    const store = {
        async read(key) { return structuredClone(records.get(key) || null); },
        async write(record) { records.set(record.key, structuredClone(record)); },
    };
    const full = '报告大王！不要沉迷奇怪游戏（测试）';
    const half = full.normalize('NFKC');
    let scope = full;
    let uploadCount = 0;
    let generationCount = 0;
    let afterUpload = () => {};
    const canvas = { tableName: '主角信息', stableIdentityFields: ['姓名'], canvas: 'protagonist-avatar', promptFields: ['外貌特征'] };
    const item = { id: 'hero', imageGeneration: { canvases: [canvas] } };
    const row = { 姓名: '吴志远', 外貌特征: '短发' };
    const options = {
        getPhoneSettings: () => ({ imageGeneration: { enabled: true, promptTranslationEnabled: false } }),
        getContentPresetIndexSnapshot: () => ({ pageByTable: new Map([['sheet_hero', { presetId: 'preset', itemId: 'hero' }]]) }),
        getRawData: () => ({ sheet_hero: { name: '主角信息', content: [Object.keys(row), Object.values(row)] } }),
        getChatScope: () => scope,
        ownershipStore: store,
        imageFiles: { async save() { const path = `user/images/yuzi-phone-generated/test-upload-${++uploadCount}.png`; afterUpload(); return { ok: true, path }; } },
        imageGenerationRuntime: {
            async composeCharacterImagePrompt() { return { prompt: 'TEST ONLY' }; },
            async generateAndStore() { generationCount++; return { ok: true, path: 'user/images/yuzi-phone-generated/test-generation.png' }; },
        },
    };
    const open = () => createContentPresetImageGenerationHost(options).createPageActions({ item, presetId: 'preset', itemId: 'hero', sheetKey: 'sheet_hero', isCurrent: () => true });
    const image = new Blob([Uint8Array.from([137,80,78,71,13,10,26,10])], { type: 'image/png' });
    const paths = new Map();
    for (const name of [full, half]) {
        scope = name;
        assert.equal((await open().readImage(canvas.canvas, row)).status, 'empty', '不同聊天首次读取应无图');
        const result = await open().saveImage(canvas.canvas, row, image);
        assert.equal(result.status, 'saved', `同一聊天上传不应误判 stale：${JSON.stringify(result)}`);
        assert.equal(result.record.chatScope, name, '聊天 ID 保留宿主原文');
        paths.set(name, result.imagePath);
        assert.equal((await open().readImage(canvas.canvas, row)).imagePath, result.imagePath, '重新创建宿主后也能回读');
    }
    assert.equal(generationCount, 0, '上传不触发生图');
    assert.equal(records.size, 2, '全半角不同的聊天不能合并图片归属');
    scope = full;
    assert.equal((await open().deleteImage(canvas.canvas, row)).status, 'deleted');
    assert.equal((await open().readImage(canvas.canvas, row)).cleared, true);
    scope = half;
    assert.equal((await open().readImage(canvas.canvas, row)).imagePath, paths.get(half), '清空一个聊天不影响另一个');
    scope = full;
    const generated = await open().generateImage(canvas.canvas, row);
    assert.equal(generated.status, 'generated', '生图也使用相同的原文聊天归属');
    assert.equal((await open().readImage(canvas.canvas, row)).imagePath, generated.imagePath);
    afterUpload = () => { scope = half; };
    const stale = await open().saveImage(canvas.canvas, row, image);
    assert.equal(stale.status, 'stale', '真正切换到全半角不同的另一聊天必须阻止回写');
    scope = full;
    assert.equal((await open().readImage(canvas.canvas, row)).imagePath, generated.imagePath, '失败不覆盖旧图');

    // Cancellation must use the same exact scope as lookup and persistence.
    const ownership = createStableImageOwnershipService({ store: createStableImageOwnershipRepository({ store }) });
    const target = name => createStableImageOwnershipTarget({ chatScope: name, physicalTable: 'sheet_hero', identityFields: ['姓名'], identityValues: ['吴志远'], canvas: canvas.canvas });
    const first = await ownership.beginReplacement({ target: target(full), identityCandidates: [['吴志远']] });
    const second = await ownership.beginReplacement({ target: target(half), identityCandidates: [['吴志远']] });
    ownership.invalidateChatScope(full);
    assert.equal((await ownership.commitReplacement({ ticket: first.ticket, imagePath: 'test.png', recheckOwnership: async () => true })).status, 'stale');
    assert.equal((await ownership.commitReplacement({ ticket: second.ticket, imagePath: 'test.png', recheckOwnership: async () => true })).status, 'replaced');
    let finish;
    const service = createTableDisplayImageGenerationService({
        ownershipService: ownership, isTableEnabled: async () => true, isCurrentTarget: async () => true,
        orchestrator: { generate: () => new Promise(resolve => { finish = resolve; }) },
    });
    const pending = service.generate({ canvas, chatScope: full, rowValues: row, candidateRows: [row], naturalPrompt: 'TEST ONLY' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(typeof finish, 'function');
    service.invalidateChatScope(full);
    finish({ ok: true, path: 'late.png' });
    assert.equal((await pending).status, 'stale', '全角聊天的在途生成也必须能撤销');
    console.log('[content-presets-image-chat-scope] 通过：全角聊天上传/生图/回读/清空、全半角聊天隔离、切聊拒绝与撤销；纯内存，无真实上传或生图');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
