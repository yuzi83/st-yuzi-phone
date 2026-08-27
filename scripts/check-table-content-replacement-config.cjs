const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

async function main() {
    const modulePath = path.resolve(__dirname, '..', 'modules', 'table-content-replacement', 'config.js');
    const {
        TABLE_CONTENT_REPLACEMENT_DEFAULTS,
        normalizeTableContentReplacementSettings,
    } = await import(pathToFileURL(modulePath).href);

    assert.deepStrictEqual(
        TABLE_CONTENT_REPLACEMENT_DEFAULTS,
        {
            global: { enabled: false, rules: [] },
            tableRules: [],
        },
        '词汇替换默认配置必须是全局/单表区域关闭且无规则',
    );

    const normalized = normalizeTableContentReplacementSettings({
        global: {
            enabled: 1,
            rules: [{ id: 'global-1', source: '  你好  ', target: '不好' }],
        },
        tableRules: [{
            mappingId: 'mapping-1',
            sheetKey: 'sheet_1',
            tableNameSnapshot: '纪要',
            enabled: true,
            rules: [{ id: 'table-1', source: '\n旧词', target: '新词\n' }],
        }],
    });

    assert.deepStrictEqual(
        normalized,
        {
            global: {
                enabled: true,
                rules: [{ id: 'global-1', source: '  你好  ', target: '不好' }],
            },
            tableRules: [{
                mappingId: 'mapping-1',
                sheetKey: 'sheet_1',
                tableNameSnapshot: '纪要',
                enabled: true,
                rules: [{ id: 'table-1', source: '\n旧词', target: '新词\n' }],
            }],
        },
        '配置归一化必须保留规则空白并保留单表映射标识',
    );

    const duplicateMappings = normalizeTableContentReplacementSettings({
        tableRules: [
            { mappingId: 'same', sheetKey: 'sheet_1', tableNameSnapshot: '纪要', rules: [] },
            { mappingId: 'same', sheetKey: 'sheet_2', tableNameSnapshot: '其他', rules: [] },
            { mappingId: 'other', sheetKey: 'sheet_1', tableNameSnapshot: '纪要', rules: [] },
        ],
    });
    assert.deepStrictEqual(
        duplicateMappings.tableRules.map(area => [area.mappingId, area.sheetKey]),
        [['same', 'sheet_1']],
        '配置归一化必须保证同一映射标识或同一稳定表格只保留一个单表区域',
    );

    const schemaPath = path.resolve(__dirname, '..', 'modules', 'settings', 'schema.js');
    const { defaultSettings, validateSetting, validateSettings } = await import(pathToFileURL(schemaPath).href);
    assert.deepStrictEqual(defaultSettings.tableContentReplacement, TABLE_CONTENT_REPLACEMENT_DEFAULTS, '设置 schema 必须提供词汇替换默认值');
    assert.deepStrictEqual(
        validateSettings({ tableContentReplacement: normalized }).tableContentReplacement,
        normalized,
        '设置 schema 必须归一化词汇替换配置',
    );
    assert.deepStrictEqual(
        validateSetting('tableContentReplacement', normalized).value,
        normalized,
        '单项设置保存也必须走词汇替换配置归一化',
    );

    const fallback = normalizeTableContentReplacementSettings(null);
    assert.deepStrictEqual(fallback, TABLE_CONTENT_REPLACEMENT_DEFAULTS, '非法配置必须回到安全默认值');

    console.log('[通过] 表格内容词汇替换配置 seam');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

