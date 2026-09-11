const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = file => import(`${pathToFileURL(path.resolve(file)).href}?t=${Date.now()}-${Math.random()}`);

const declaration = {
    imageGeneration: {
        canvases: [{
            tableName: '广场表',
            stableIdentityFields: ['帖子ID'],
            canvas: '封面',
            promptFields: ['标题', '图片描述'],
        }],
    },
};

const rawData = {
    sheet_square: {
        name: '广场表',
        content: [
            ['帖子ID', '标题', '图片描述'],
            ['post-1', '第一帖', '雨夜咖啡店'],
            ['post-2', '第二帖', '晴天的公园'],
        ],
    },
};

async function main() {
    const { createContentPresetImageActions } = await load('modules/content-presets/image-actions.js');
    const calls = { generate: [], read: [] };
    const settingsListeners = new Set();
    let enabled = true;
    let imageGenerationEnabled = true;
    let sourceActive = true;
    let current = true;
    const actions = createContentPresetImageActions({
        declaration,
        source: {
            kind: 'page',
            presetId: 'square-preset',
            itemId: 'square-page',
            originSheetKey: 'sheet_square',
        },
        getRawData: () => rawData,
        getChatScope: () => 'chat-alpha',
        isSourceActive: async () => sourceActive,
        isCurrent: () => current,
        isImageGenerationEnabled: async () => imageGenerationEnabled,
        isTableEnabled: async ({ sheetKey }) => enabled && sheetKey === 'sheet_square',
        subscribeSettings(listener) {
            settingsListeners.add(listener);
            return () => settingsListeners.delete(listener);
        },
        imageGenerationService: {
            async generate(input) {
                calls.generate.push(input);
                return { ok: true, status: 'generated', imagePath: 'user/images/yuzi-phone-generated/post-1.png' };
            },
            async read(input) {
                calls.read.push(input);
                return { imagePath: 'user/images/yuzi-phone-generated/post-1.png' };
            },
        },
    });

    const state = await actions.getImageGenerationState('封面', {
        帖子ID: 'post-1',
        标题: '第一帖',
        图片描述: '雨夜咖啡店',
    });
    assert.deepEqual(state, {
        available: true,
        status: 'ready',
        canvasName: '封面',
        sheetKey: 'sheet_square',
    }, '作者 mount 必须能在不触发生图时读取当前画布的可用状态');

    const generated = await actions.generateImage('封面', {
        帖子ID: 'post-1',
        标题: '第一帖',
        图片描述: '雨夜咖啡店',
        不应传给宿主: 'secret',
    });
    assert.deepEqual(generated, {
        ok: true,
        status: 'generated',
        imagePath: 'user/images/yuzi-phone-generated/post-1.png',
    });
    assert.equal(calls.generate.length, 1, '合法画布必须只请求一次共享表格生图服务');
    assert.deepEqual(calls.generate[0].canvas, {
        id: '封面',
        tableName: 'sheet_square',
        stableIdentityFields: ['帖子ID'],
        promptFields: ['标题', '图片描述'],
    }, '稳定归属必须使用真实物理表 sheetKey，而不是作者可改的显示名称');
    assert.deepEqual(calls.generate[0].candidateRows, [
        { 帖子ID: 'post-1', 标题: '第一帖', 图片描述: '雨夜咖啡店' },
        { 帖子ID: 'post-2', 标题: '第二帖', 图片描述: '晴天的公园' },
    ], '唯一性检查只能读取当前物理表快照');
    assert.deepEqual(calls.generate[0].requestContext.source, {
        kind: 'page',
        presetId: 'square-preset',
        itemId: 'square-page',
        originSheetKey: 'sheet_square',
    }, '晚到结果复核必须保留实际应用来源');

    const image = await actions.readImage('封面', { 帖子ID: 'post-1', 标题: '第一帖', 图片描述: '雨夜咖啡店' });
    assert.equal(image.ok, true, '页面与正文都必须能回读同一稳定归属图片');
    assert.equal(image.status, 'ready');
    assert.equal(image.imagePath, 'user/images/yuzi-phone-generated/post-1.png');

    imageGenerationEnabled = false;
    const masterDisabled = await actions.getImageGenerationState('封面', {
        帖子ID: 'post-1',
        标题: '第一帖',
        图片描述: '雨夜咖啡店',
    });
    assert.deepEqual(masterDisabled, {
        available: false,
        ok: false,
        status: 'disabled',
        reason: 'image-generation-disabled',
        canvasName: '封面',
    }, '图片总开关关闭后，作者必须能立即把生图按钮隐藏或禁用');
    const blockedByMaster = await actions.generateImage('封面', {
        帖子ID: 'post-1',
        标题: '第一帖',
        图片描述: '雨夜咖啡店',
    });
    assert.deepEqual(blockedByMaster, {
        ok: false,
        status: 'disabled',
        reason: 'image-generation-disabled',
    }, '图片总开关关闭后不得再提交生成请求');
    assert.equal(calls.generate.length, 1);

    imageGenerationEnabled = true;
    enabled = false;
    const tableDisabled = await actions.getImageGenerationState('封面', {
        帖子ID: 'post-1',
        标题: '第一帖',
        图片描述: '雨夜咖啡店',
    });
    assert.deepEqual(tableDisabled, {
        available: false,
        ok: false,
        status: 'disabled',
        reason: 'table-disabled',
        canvasName: '封面',
    }, '当前表被取消勾选后，作者必须能读取表级不可用状态');
    const disabled = await actions.generateImage('封面', { 帖子ID: 'post-1', 标题: '第一帖', 图片描述: '雨夜咖啡店' });
    assert.deepEqual(disabled, { ok: false, status: 'disabled', reason: 'table-disabled' });
    assert.equal(calls.generate.length, 1, '表级取消勾选后不得请求共享生图服务');

    enabled = true;
    sourceActive = false;
    const staleSourceState = await actions.getImageGenerationState('封面', {
        帖子ID: 'post-1',
        标题: '第一帖',
        图片描述: '雨夜咖啡店',
    });
    assert.deepEqual(staleSourceState, {
        available: false,
        ok: false,
        status: 'stale',
        reason: 'source-inactive',
        canvasName: '封面',
    }, '预设撤销应用后，作者必须读取到来源已失效');
    const staleSource = await actions.generateImage('封面', { 帖子ID: 'post-1', 标题: '第一帖', 图片描述: '雨夜咖啡店' });
    assert.deepEqual(staleSource, { ok: false, status: 'stale', reason: 'source-inactive' });

    sourceActive = true;
    current = false;
    const staleInstanceState = await actions.getImageGenerationState('封面', {
        帖子ID: 'post-1',
        标题: '第一帖',
        图片描述: '雨夜咖啡店',
    });
    assert.deepEqual(staleInstanceState, {
        available: false,
        ok: false,
        status: 'stale',
        reason: 'instance-inactive',
        canvasName: '封面',
    }, '实例销毁后，作者必须读取到当前 mount 已失效');
    const staleInstance = await actions.generateImage('封面', { 帖子ID: 'post-1', 标题: '第一帖', 图片描述: '雨夜咖啡店' });
    assert.deepEqual(staleInstance, { ok: false, status: 'stale', reason: 'instance-inactive' });

    current = true;
    const updates = [];
    const unsubscribe = actions.subscribeImageGeneration(detail => updates.push(detail));
    assert.equal(settingsListeners.size, 1, '作者订阅后必须只登记一个设置监听器');
    for (const listener of settingsListeners) listener({ key: 'imageGeneration' });
    assert.deepEqual(updates, [{ key: 'imageGeneration' }], '设置变化必须通知作者自行刷新按钮状态');
    const unsubscribeBrokenListener = actions.subscribeImageGeneration(() => {
        throw new Error('作者刷新按钮失败');
    });
    assert.doesNotThrow(() => {
        for (const listener of settingsListeners) listener({ key: 'imageGeneration' });
    }, '作者的订阅回调异常不得打断小手机设置更新链');
    assert.equal(updates.length, 2, '一个作者回调失败不得阻止其他作者订阅收到设置变化');
    unsubscribeBrokenListener();
    current = false;
    for (const listener of settingsListeners) listener({ key: 'imageGeneration' });
    assert.equal(updates.length, 2, '实例失效后不得再向作者推送设置变化');
    unsubscribe();
    assert.equal(settingsListeners.size, 0, '作者取消订阅后必须立即释放设置监听器');

    console.log('[content-presets-image-actions] 通过');
}

main().catch(error => {
    console.error('[content-presets-image-actions] 失败');
    console.error(error);
    process.exitCode = 1;
});
