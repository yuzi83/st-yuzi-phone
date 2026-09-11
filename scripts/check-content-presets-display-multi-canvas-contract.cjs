const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const load = file => import(`${pathToFileURL(path.resolve(file)).href}?t=${Date.now()}-${Math.random()}`);

const files = {
    'display.mjs': { mimeType: 'text/javascript', encoding: 'text', content: 'export function mount(context) {}' },
};
const display = {
    id: 'gallery', name: '图集正文', kind: 'inline',
    targets: [{ tableName: '广场表', fields: ['帖子ID', '标题', '封面描述', '插图描述'] }],
    entry: { mount: 'display.mjs' }, assets: [],
    imageGeneration: {
        canvases: [
            { tableName: '广场表', stableIdentityFields: ['帖子ID'], canvas: '封面', promptFields: ['标题', '封面描述'] },
            { tableName: '广场表', stableIdentityFields: ['帖子ID'], canvas: '插图', promptFields: ['标题', '插图描述'] },
        ],
    },
    interactions: ['image-generate'],
};

async function main() {
    const { importContentPreset, exportContentPreset } = await load('modules/content-presets/import-export.js');
    const bundle = {
        format: 'yuzi-beautify-preset', formatVersion: 3, apiVersion: 2,
        manifest: { id: 'multi-canvas', name: '多画布', version: '1', author: 'test', items: [], displays: [display] },
        files,
    };
    const record = importContentPreset(bundle);
    assert.deepEqual(record.displays[0].imageGeneration.canvases.map(item => item.canvas), ['封面', '插图']);
    const restored = importContentPreset(exportContentPreset(record));
    assert.deepEqual(restored.displays[0].imageGeneration, record.displays[0].imageGeneration, '多画布声明必须完整导出并回读');
    console.log('[content-presets-display-multi-canvas-contract] 通过');
}
main().catch(error => {
    console.error('[content-presets-display-multi-canvas-contract] 失败');
    console.error(error);
    process.exitCode = 1;
});