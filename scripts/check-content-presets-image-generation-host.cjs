const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = file => import(`${pathToFileURL(path.resolve(file)).href}?t=${Date.now()}-${Math.random()}`);

const item = {
    id: 'square-page',
    target: { tableName: '广场表', fields: ['帖子ID', '标题', '图片描述'] },
    entry: { mount: 'page.mjs' },
    activatable: true,
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
        ],
    },
};

async function main() {
    const { createContentPresetImageGenerationHost } = await load('modules/content-presets/image-generation-host.js');
    let settings = {
        imageGeneration: {
            enabled: true,
            tableDisplayEnabledBySheetKey: {},
        },
    };
    let index = {
        pageByTable: new Map([['sheet_square', { presetId: 'preset-square', itemId: 'square-page' }]]),
        activeByTable: new Map([['sheet_square', { presetId: 'preset-square', itemId: 'square-page' }]]),
        popupByTable: new Map(),
    };
    const settingsListeners = new Set();
    const calls = [];
    const host = createContentPresetImageGenerationHost({
        getPhoneSettings: () => settings,
        getContentPresetIndexSnapshot: () => index,
        getRawData: () => rawData,
        getChatScope: () => 'chat-alpha',
        subscribeSettings(listener) {
            settingsListeners.add(listener);
            return () => settingsListeners.delete(listener);
        },
        listPresetRecords: async () => [{ id: 'preset-square', items: [item], displays: [] }],
        imageGenerationService: {
            async generate(input) {
                calls.push(input);
                return { ok: true, status: 'generated', imagePath: 'user/images/yuzi-phone-generated/post-1.png' };
            },
            async read() { return null; },
        },
    });

    const actions = host.createPageActions({
        item,
        presetId: 'preset-square',
        itemId: 'square-page',
        sheetKey: 'sheet_square',
        isCurrent: () => true,
    });
    const generated = await actions.generateImage('封面', {
        帖子ID: 'post-1',
        标题: '第一帖',
        图片描述: '雨夜咖啡店',
    });
    assert.equal(generated.ok, true, '有效页面应用必须可以使用共享表格生图动作');
    assert.equal(calls.length, 1);
    assert.deepEqual(await actions.getImageGenerationState('封面'), {
        available: true,
        status: 'ready',
        canvasName: '封面',
        sheetKey: 'sheet_square',
    }, '宿主必须把总开关、表级开关和来源校验后的状态暴露给页面作者');
    const updates = [];
    const unsubscribe = actions.subscribeImageGeneration(detail => updates.push(detail));
    for (const listener of settingsListeners) listener({ key: 'imageGeneration' });
    assert.deepEqual(updates, [{ key: 'imageGeneration' }], '宿主必须把小手机设置事件转交给作者的生图状态订阅');
    unsubscribe();
    assert.equal(settingsListeners.size, 0, '页面销毁时作者可通过返回函数释放生图设置订阅');

    const sources = await host.getTableDisplaySources({ rawData });
    assert.deepEqual(sources, [{
        sheetKey: 'sheet_square',
        tableName: '广场表',
        usageCount: 1,
    }], '设置页目录必须从有效页面应用直接登记实际表，不要求先打开页面');

    settings = {
        imageGeneration: {
            enabled: true,
            tableDisplayEnabledBySheetKey: { sheet_square: false },
        },
    };
    assert.deepEqual(await actions.getImageGenerationState('封面'), {
        available: false,
        ok: false,
        status: 'disabled',
        reason: 'table-disabled',
        canvasName: '封面',
    }, '宿主状态必须反映当前表的勾选开关');
    const disabled = await actions.generateImage('封面', {
        帖子ID: 'post-1',
        标题: '第一帖',
        图片描述: '雨夜咖啡店',
    });
    assert.deepEqual(disabled, { ok: false, status: 'disabled', reason: 'table-disabled' });
    assert.equal(calls.length, 1, '表级设置关闭后不得再提交请求');

    index = {
        pageByTable: new Map(),
        activeByTable: new Map(),
        popupByTable: new Map(),
    };
    settings = { imageGeneration: { enabled: true, tableDisplayEnabledBySheetKey: {} } };
    const inactive = await actions.generateImage('封面', {
        帖子ID: 'post-1',
        标题: '第一帖',
        图片描述: '雨夜咖啡店',
    });
    assert.deepEqual(inactive, { ok: false, status: 'stale', reason: 'source-inactive' });

    console.log('[content-presets-image-generation-host] 通过');
}

main().catch(error => {
    console.error('[content-presets-image-generation-host] 失败');
    console.error(error);
    process.exitCode = 1;
});
