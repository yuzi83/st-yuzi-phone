const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

async function main() {
    const modulePath = path.resolve(
        __dirname,
        '..',
        'modules',
        'settings-app',
        'services',
        'table-content-replacement.js',
    );
    const { createTableContentReplacementSettingsService } = await import(pathToFileURL(modulePath).href);

    let storedConfig = {
        global: { enabled: true, rules: [{ id: 'g1', source: '你好', target: '不好' }] },
        tableRules: [{
            mappingId: 'm1',
            sheetKey: 'sheet_1',
            tableNameSnapshot: '纪要',
            enabled: false,
            rules: [{ id: 't1', source: '旧词', target: '新词' }],
        }, {
            mappingId: 'm2',
            sheetKey: 'sheet_missing',
            tableNameSnapshot: '未来表',
            enabled: true,
            rules: [],
        }],
    };
    const saved = [];
    const applied = [];
    const service = createTableContentReplacementSettingsService({
        getPhoneSettings: () => ({ tableContentReplacement: storedConfig }),
        savePhoneSetting: (key, value) => {
            saved.push({ key, value });
            storedConfig = value;
            return true;
        },
        tableReader: async () => ({
            sheet_1: {
                name: '纪要',
                content: [['row_id', '内容'], [1, '你好']],
                orderNo: 2,
            },
            sheet_2: {
                name: '其他',
                content: [['row_id', '内容'], [1, '别动']],
                orderNo: 3,
            },
        }),
        replacementService: {
            applyArea: async (area) => {
                applied.push(area);
                return { ok: true, changedCellCount: 3, tableCount: area.kind === 'global' ? 2 : 1 };
            },
        },
    });

    const viewModel = await service.loadViewModel();
    assert.strictEqual(viewModel.status, 'ready', '表格目录读取成功时页面状态必须 ready');
    assert.deepStrictEqual(
        viewModel.tables.map(table => [table.sheetKey, table.tableName, table.status]),
        [['sheet_1', '纪要', 'available'], ['sheet_2', '其他', 'available']],
        '页面服务必须按稳定 sheetKey 提供当前普通表目录',
    );
    assert.strictEqual(viewModel.tableRules[1].status, 'missing', '缺失表必须保留映射并显示不可用状态');

    const draft = {
        ...viewModel.config,
        tableRules: viewModel.config.tableRules.map((area) => area.mappingId === 'm1'
            ? { ...area, enabled: true, rules: [{ id: 't1', source: '旧词', target: '新词' }] }
            : area),
    };
    const result = await service.saveArea({ kind: 'table', mappingId: 'm1', config: draft });
    assert.strictEqual(result.ok, true, '有效单表草稿必须保存并应用');
    assert.deepStrictEqual(saved.map(item => item.key), ['tableContentReplacement'], '保存必须写入统一设置键');
    assert.deepStrictEqual(applied, [{ kind: 'table', mappingId: 'm1' }], '单表保存只能应用对应映射区域');
    assert.strictEqual(storedConfig.tableRules.find(area => area.mappingId === 'm1').enabled, true);

    const invalid = await service.saveArea({
        kind: 'global',
        config: {
            ...storedConfig,
            global: { enabled: true, rules: [{ id: 'bad', source: '同', target: '同名' }] },
        },
    });
    assert.strictEqual(invalid.ok, false, '无效全局规则必须阻止保存');
    assert.strictEqual(saved.length, 1, '无效规则不得写入设置');
    assert.strictEqual(applied.length, 1, '无效规则不得执行 SQL 应用');

    const disabled = await service.saveArea({
        kind: 'table',
        mappingId: 'm1',
        config: {
            ...storedConfig,
            tableRules: storedConfig.tableRules.map((area) => area.mappingId === 'm1'
                ? { ...area, enabled: false, rules: area.rules }
                : area),
        },
    });
    assert.strictEqual(disabled.ok, true, '关闭区域仍必须允许保存配置');
    assert.strictEqual(applied.length, 1, '关闭区域保存不得执行 SQL 应用');

    const deletedDraft = {
        ...storedConfig,
        tableRules: storedConfig.tableRules.filter(area => area.mappingId !== 'm1'),
    };
    const deleted = await service.deleteArea({ mappingId: 'm1', config: deletedDraft });
    assert.strictEqual(deleted.ok, true, '删除单表区域必须只保存配置');
    assert.strictEqual(applied.length, 1, '删除单表区域不得执行 SQL 应用');
    assert.equal(storedConfig.tableRules.some(area => area.mappingId === 'm1'), false);

    const added = await service.saveArea({
        kind: 'table',
        mappingId: 'm3',
        config: {
            ...storedConfig,
            tableRules: [...storedConfig.tableRules, {
                mappingId: 'm3',
                sheetKey: 'sheet_2',
                tableNameSnapshot: '其他',
                enabled: false,
                rules: [{ id: 't3', source: '旧', target: '新' }],
            }],
        },
    });
    assert.strictEqual(added.ok, true, '新单表区域保存必须允许追加映射配置');
    assert.equal(storedConfig.tableRules.some(area => area.mappingId === 'm3'), true);

    console.log('[通过] 表格内容词汇替换设置服务 seam');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
