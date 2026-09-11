const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = file => import(`${pathToFileURL(path.resolve(file)).href}?t=${Date.now()}-${Math.random()}`);
const clone = value => JSON.parse(JSON.stringify(value));

function pageItem() {
    return {
        id: 'square-page',
        name: '广场页面',
        target: { tableName: '广场表', fields: ['帖子ID', '标题', '图片描述'] },
        entry: { mount: 'page.mjs' },
        assets: [],
        integrations: { theme: true, font: true },
        imageGeneration: {
            canvases: [{
                tableName: '广场表',
                stableIdentityFields: ['帖子ID'],
                canvas: '帖子封面',
                promptSuffix: '1∶1正方形，用户补充：柔和光线',
                promptFields: ['标题', '图片描述'],
            }, {
                tableName: '广场表',
                stableIdentityFields: ['帖子ID'],
                canvas: '帖子缩略图',
                promptFields: ['图片描述'],
            }],
        },
    };
}

function bundle(item = pageItem()) {
    return {
        format: 'yuzi-beautify-preset',
        formatVersion: 3,
        apiVersion: 2,
        manifest: {
            id: 'page-host-capabilities',
            name: '页面宿主能力',
            version: '1.0.0',
            author: '测试',
            items: [item],
            displays: [],
        },
        files: {
            'page.mjs': {
                mimeType: 'text/javascript',
                encoding: 'text',
                content: 'export function mount(context) {}',
            },
        },
    };
}

async function main() {
    const {
        isContentPresetBundle,
        isTrustedContentPresetRecord,
    } = await load('modules/content-presets/format.js');
    const {
        exportContentPreset,
        importContentPreset,
        readbackContentPreset,
    } = await load('modules/content-presets/import-export.js');

    const source = bundle();
    assert.equal(
        isContentPresetBundle(source),
        true,
        'v3 页面预设必须接受可选主题、字体和生图画布声明',
    );
    const record = importContentPreset(source);
    assert.deepEqual(record.items[0].integrations, { theme: true, font: true });
    assert.deepEqual(record.items[0].imageGeneration, source.manifest.items[0].imageGeneration);
    assert.deepEqual(
        exportContentPreset(record).manifest.items[0],
        source.manifest.items[0],
        '导出不得遗漏页面宿主能力声明',
    );
    assert.deepEqual(
        readbackContentPreset(record).record.items[0].imageGeneration,
        source.manifest.items[0].imageGeneration,
        '页面画布必须能完整回读',
    );

    const invalid = [
        ['附加描述不是字符串', item => { item.imageGeneration.canvases[0].promptSuffix = 42; }],
        ['画布归属其他表', item => { item.imageGeneration.canvases[0].tableName = '人物表'; }],
        ['稳定标识不属于页面字段', item => { item.imageGeneration.canvases[0].stableIdentityFields = ['不存在']; }],
        ['提示词字段不属于页面字段', item => { item.imageGeneration.canvases[0].promptFields = ['不存在']; }],
        ['重复画布名称', item => { item.imageGeneration.canvases[1].canvas = '帖子封面'; }],
        ['空接入声明', item => { item.integrations = {}; }],
    ];
    for (const [name, mutate] of invalid) {
        const item = pageItem();
        mutate(item);
        const candidate = bundle(item);
        assert.equal(isContentPresetBundle(candidate), false, `${name} 必须在原始 Bundle 校验时被拒绝`);
        assert.throws(() => importContentPreset(candidate), undefined, `${name} 必须在导入阶段被拒绝`);
    }

    const trusted = clone(record);
    trusted.items[0].imageGeneration.canvases[0].canvas = ' ';
    assert.equal(isTrustedContentPresetRecord(trusted), false, '可信记录校验不得放过失效页面画布');

    console.log('[content-presets-page-host-capabilities] 通过');
}

main().catch(error => {
    console.error('[content-presets-page-host-capabilities] 失败');
    console.error(error);
    process.exitCode = 1;
});
