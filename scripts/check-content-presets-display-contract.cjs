const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const url = file => `${pathToFileURL(path.join(process.cwd(), file)).href}?t=${Date.now()}-${Math.random()}`;
const clone = value => structuredClone(value);

function bundle(displays) {
    return {
        format: 'yuzi-beautify-preset',
        formatVersion: 3,
        apiVersion: 2,
        manifest: {
            id: 'display-contract',
            name: '展示合同',
            version: '1.0.0',
            author: '测试者',
            items: [],
            displays,
        },
        files: {
            'displays/mount.mjs': {
                mimeType: 'text/javascript',
                encoding: 'text',
                content: 'export function mount(context) {}',
            },
        },
    };
}

function display(overrides = {}) {
    const value = {
        id: 'profile-inline',
        name: '人物任务总览',
        kind: 'inline',
        targets: [
            { tableName: '人物表', fields: ['角色ID', '姓名', '描述'] },
            { tableName: '任务表', fields: ['任务ID', '标题', '状态'] },
        ],
        entry: { mount: 'displays/mount.mjs' },
        assets: [],
        integrations: { theme: true, font: true },
        imageGeneration: {
            canvases: [{
                tableName: '人物表',
                stableIdentityFields: ['角色ID'],
                canvas: '人物肖像',
                promptFields: ['姓名', '描述'],
            }],
        },
        interactions: ['expand', 'tabs', 'append-input', 'image-generate'],
        ...overrides,
    };
    for (const [key, item] of Object.entries(value)) if (item === undefined) delete value[key];
    return value;
}

async function main() {
    const { isContentPresetBundle, isTrustedContentPresetRecord } = await import(url('modules/content-presets/format.js'));
    const { importContentPreset, exportContentPreset, readbackContentPreset } = await import(url('modules/content-presets/import-export.js'));
    const { listMatchingDisplays } = await import(url('modules/content-presets/matcher.js'));
    const { buildContentPresetCatalog } = await import(url('modules/content-presets/catalog.js'));

    const source = bundle([
        display(),
        display({
            id: 'notice-popup',
            name: '人物浮窗',
            kind: 'popup',
            targets: [{ tableName: '人物表', fields: ['角色ID', '姓名'] }],
            integrations: { theme: true },
            imageGeneration: undefined,
            interactions: undefined,
        }),
        display({
            id: 'notice-barrage',
            name: '任务弹幕',
            kind: 'barrage',
            targets: [{ tableName: '任务表', fields: ['任务ID', '标题'] }],
            integrations: undefined,
            imageGeneration: undefined,
            interactions: undefined,
        }),
    ]);

    assert.equal(isContentPresetBundle(source), true, 'v3 Bundle 必须接受三类正式展示声明');
    const record = importContentPreset(source);
    assert.equal(isTrustedContentPresetRecord(record), true, '导入后的三类展示记录必须可信');
    assert.deepEqual(record.displays.map(value => value.kind), ['inline', 'popup', 'barrage']);
    assert.deepEqual(record.displays[0].integrations, { theme: true, font: true });
    assert.deepEqual(record.displays[0].imageGeneration, {
        canvases: [{
            tableName: '人物表',
            stableIdentityFields: ['角色ID'],
            canvas: '人物肖像',
            promptFields: ['姓名', '描述'],
        }],
    });
    assert.deepEqual(record.displays[0].interactions, ['expand', 'tabs', 'append-input', 'image-generate']);

    const exported = exportContentPreset(record);
    assert.deepEqual(exported.manifest.displays, source.manifest.displays, '导出不得遗漏展示能力声明');
    assert.deepEqual(readbackContentPreset(record).record.displays, record.displays, '展示声明必须完整回读');

    const tables = [
        { tableName: '人物表', headers: ['角色ID', '姓名', '描述'] },
        { tableName: '任务表', headers: ['任务ID', '标题', '状态'] },
    ];
    const matches = listMatchingDisplays([record], tables);
    assert.deepEqual(matches.map(candidate => candidate.presetId), ['display-contract'], '展示候选必须按预设来源聚合');
    assert.deepEqual(matches[0].displays.map(value => value.displayId), ['profile-inline', 'notice-popup', 'notice-barrage'], '所有目标已满足时来源候选必须保留三类具体样式');
    assert.equal(listMatchingDisplays([record], [tables[0]])[0].displays.some(value => value.displayId === 'profile-inline'), false, '组合展示缺少任一依赖表时不得伪装为可应用候选');

    const catalog = buildContentPresetCatalog({
        sheet_people: { name: '人物表', content: [['角色ID', '姓名', '描述']] },
        sheet_tasks: { name: '任务表', content: [['任务ID', '标题', '状态']] },
    }, [record]);
    const peopleCandidates = catalog.find(table => table.sheetKey === 'sheet_people').popupCandidates;
    const taskCandidates = catalog.find(table => table.sheetKey === 'sheet_tasks').popupCandidates;
    assert.deepEqual(peopleCandidates.map(candidate => candidate.presetId), ['display-contract'], '人物表的展示候选必须按预设来源去重');
    assert.deepEqual(peopleCandidates[0].displays.map(value => value.displayId), ['profile-inline', 'notice-popup'], '人物表目录必须同时列出完整组合和单表浮窗样式');
    assert.deepEqual(taskCandidates.map(candidate => candidate.presetId), ['display-contract'], '任务表的展示候选必须按预设来源去重');
    assert.deepEqual(taskCandidates[0].displays.map(value => value.displayId), ['profile-inline', 'notice-barrage'], '任务表目录必须同时列出完整组合和单表弹幕样式');

    const invalid = [
        ['不支持的 kind', value => { value.kind = 'toast'; }],
        ['重复目标表', value => { value.targets.push({ tableName: '人物表', fields: ['角色ID'] }); }],
        ['空必需字段', value => { value.targets[0].fields = ['角色ID', '']; }],
        ['生图归属不在目标中', value => { value.imageGeneration.canvases[0].tableName = '不存在的表'; }],
        ['生图标识字段不在归属字段中', value => { value.imageGeneration.canvases[0].stableIdentityFields = ['不存在']; }],
        ['空画布', value => { value.imageGeneration.canvases[0].canvas = ' '; }],
        ['生图提示字段不在归属字段中', value => { value.imageGeneration.canvases[0].promptFields = ['标题']; }],
        ['浮窗交互', value => { value.kind = 'popup'; value.interactions = ['expand']; }],
        ['弹幕生图', value => { value.kind = 'barrage'; value.interactions = undefined; }],
        ['无意义的接入声明', value => { value.integrations = {}; }],
        ['未知接入声明', value => { value.integrations = { theme: true, contrast: true }; }],
        ['未知交互', value => { value.interactions = ['open-phone']; }],
        ['重复交互', value => { value.interactions = ['tabs', 'tabs']; }],
        ['生图按钮没有生图声明', value => { delete value.imageGeneration; value.interactions = ['image-generate']; }],
    ];
    for (const [name, mutate] of invalid) {
        const candidate = display();
        mutate(candidate);
        assert.equal(isContentPresetBundle(bundle([candidate])), false, `${name} 必须在原始格式校验阶段被拒绝`);
        assert.throws(() => importContentPreset(bundle([candidate])), undefined, `${name} 必须在导入阶段被拒绝`);
    }

    const trusted = clone(record);
    trusted.displays[0].imageGeneration.canvases[0].canvas = ' ';
    assert.equal(isTrustedContentPresetRecord(trusted), false, '可信记录校验不得放过失效的展示声明');

    console.log('[content-presets-display-contract-check] 检查通过');
}

main().catch(error => {
    console.error('[content-presets-display-contract-check] 检查失败');
    console.error(error);
    process.exitCode = 1;
});
