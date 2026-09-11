const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const load = file => import(`${pathToFileURL(path.resolve(file)).href}?t=${Date.now()}-${Math.random()}`);

function canvas(tableName, name, stableIdentityFields = ['ID'], promptFields = ['标题']) {
    return { tableName, stableIdentityFields, canvas: name, promptFields };
}

function item(id, tableName, fields, canvases = []) {
    return {
        id,
        activatable: true,
        target: { tableName, fields },
        entry: { mount: `pages/${id}.mjs` },
        ...(canvases.length ? { imageGeneration: { canvases } } : {}),
    };
}

function display(id, kind, targets, canvases = []) {
    return {
        id,
        kind,
        activatable: true,
        targets,
        entry: { mount: `displays/${id}.mjs` },
        ...(canvases.length ? { imageGeneration: { canvases } } : {}),
    };
}

function preset(id, { items = [], displays = [] } = {}) {
    return { id, items, displays };
}

function registrations(directory, sheetKey) {
    return directory.bySheetKey.get(sheetKey) || [];
}

async function main() {
    const { buildActiveContentPresetImageGenerationDirectory } = await load('modules/content-presets/image-generation-directory.js');
    const rawData = {
        sheet_square: { name: '广场表', content: [['ID', '标题', '描述']] },
        sheet_tasks: { name: '任务表', content: [['ID', '标题', '状态']] },
        sheet_missing: { name: '缺字段表', content: [['ID']] },
    };
    const pageCanvas = canvas('广场表', '页面封面', ['ID'], ['标题']);
    const inlineCanvas = canvas('广场表', '正文封面', ['ID'], ['标题', '描述']);
    const taskCanvas = canvas('任务表', '任务配图', ['ID'], ['标题']);
    const records = [
        preset('page-preset', {
            items: [
                item('square-page', '广场表', ['ID', '标题', '描述'], [pageCanvas]),
                item('missing-page', '缺字段表', ['ID', '标题'], [canvas('缺字段表', '不应出现')]),
                item('ghost-page', '不存在表', ['ID'], [canvas('不存在表', '缺表不应出现')]),
            ],
        }),
        preset('display-preset', {
            displays: [
                display('square-inline', 'inline', [{ tableName: '广场表', fields: ['ID', '标题', '描述'] }], [inlineCanvas]),
                display('joined-inline', 'inline', [
                    { tableName: '广场表', fields: ['ID', '标题', '描述'] },
                    { tableName: '任务表', fields: ['ID', '标题', '状态'] },
                ], [inlineCanvas, taskCanvas]),
                display('blocked-popup', 'popup', [{ tableName: '广场表', fields: ['ID', '标题'] }], [canvas('广场表', '浮窗禁止')]),
                display('blocked-barrage', 'barrage', [{ tableName: '广场表', fields: ['ID', '标题'] }], [canvas('广场表', '弹幕禁止')]),
                
            ],
        }),
        // 重复的记录不得让同一使用方得到重复登记。
        preset('unapplied-display-preset', {
            displays: [display('not-applied', 'inline', [{ tableName: '广场表', fields: ['ID', '标题'] }], [canvas('广场表', '未应用')])],
        }),
    ];

    const directory = buildActiveContentPresetImageGenerationDirectory(
        rawData,
        records,
        new Map([
            ['sheet_square', { sheetKey: 'sheet_square', presetId: 'page-preset', itemId: 'square-page' }],
            ['sheet_missing', { sheetKey: 'sheet_missing', presetId: 'page-preset', itemId: 'missing-page' }],
            ['sheet_ghost', { sheetKey: 'sheet_ghost', presetId: 'page-preset', itemId: 'ghost-page' }],
        ]),
        new Map([
            ['sheet_square', { sheetKey: 'sheet_square', presetId: 'display-preset' }],
            ['sheet_tasks', { sheetKey: 'sheet_tasks', presetId: 'display-preset' }],
        ]),
    );

    assert.equal(Object.isFrozen(directory), true, '目录外壳必须只读');
    assert(directory.bySheetKey instanceof Map, '目录必须按物理 sheetKey 提供索引');
    assert.deepEqual(registrations(directory, 'sheet_square'), [
        { presetId: 'page-preset', itemId: 'square-page', canvas: pageCanvas },
        { presetId: 'display-preset', displayId: 'square-inline', canvas: inlineCanvas },
        { presetId: 'display-preset', displayId: 'joined-inline', canvas: inlineCanvas },
    ], '单表页面、单表正文展示、组合正文展示均应落在广场表；相同画布的不同使用方必须保留');
    assert.deepEqual(registrations(directory, 'sheet_tasks'), [
        { presetId: 'display-preset', displayId: 'joined-inline', canvas: taskCanvas },
    ], '组合展示的画布必须按 canvas.tableName 落到对应物理表');
    assert.equal(registrations(directory, 'sheet_missing').length, 0, '真实表缺少作者要求字段时不得登记页面生图');
    assert.equal(directory.bySheetKey.has('sheet_ghost'), false, '真实表不存在时不得登记页面生图');
    assert.equal(registrations(directory, 'sheet_square').some(entry => entry.canvas.canvas === '浮窗禁止'), false, 'popup 不得登记生图使用方');
    assert.equal(registrations(directory, 'sheet_square').some(entry => entry.canvas.canvas === '弹幕禁止'), false, 'barrage 不得登记生图使用方');
    assert.equal(registrations(directory, 'sheet_square').some(entry => entry.canvas.canvas === '未应用'), false, '未应用展示不得登记生图使用方');
    assert.equal(registrations(directory, 'sheet_square').filter(entry => entry.displayId === 'square-inline').length, 1, '同一使用方必须稳定去重');
    assert.equal(Object.isFrozen(registrations(directory, 'sheet_square')), true, '每张表的使用方列表必须只读');
    assert.equal(Object.isFrozen(registrations(directory, 'sheet_square')[0]), true, '每个使用方登记必须只读');
    assert.equal(Object.isFrozen(registrations(directory, 'sheet_square')[0].canvas), true, '作者画布合同必须只读');

    const incomplete = buildActiveContentPresetImageGenerationDirectory(
        rawData,
        records,
        new Map(),
        new Map([['sheet_square', { sheetKey: 'sheet_square', presetId: 'display-preset' }]]),
    );
    assert.equal(registrations(incomplete, 'sheet_square').some(entry => entry.displayId === 'joined-inline'), false, '组合展示缺少任一同源绑定时不得登记组合画布');
    assert.equal(registrations(incomplete, 'sheet_square').some(entry => entry.displayId === 'square-inline'), true, '组合失效不得误伤同源的单表展示');

    const revoked = buildActiveContentPresetImageGenerationDirectory(rawData, records, new Map(), new Map());
    assert.equal(revoked.bySheetKey.size, 0, '撤销全部应用后目录必须为空');

    console.log('[content-presets-image-generation-directory] 通过');
}

main().catch(error => {
    console.error('[content-presets-image-generation-directory] 失败');
    console.error(error);
    process.exitCode = 1;
});


