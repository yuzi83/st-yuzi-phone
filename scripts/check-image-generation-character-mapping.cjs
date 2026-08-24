const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    return import(`${href}?contract=${Date.now()}-${Math.random()}`);
}

function testBuildModelUsesCanonicalSheetOrderingSource() {
    const source = fs.readFileSync(
        path.join(ROOT, 'modules/image-generation/character-mapping.js'),
        'utf8',
    );

    assert.match(
        source,
        /import\s*\{\s*getSheetKeys\s*\}\s*from\s*['"]\.\.\/phone-core\/data-api\.js['"]/u,
        '人物映射必须复用 phone-core/data-api.js 导出的唯一 getSheetKeys()',
    );
    assert.doesNotMatch(
        source,
        /function\s+getOrderedSheetKeys\s*\(/u,
        '人物映射不得复制自己的 sheet_* 排序实现',
    );
    assert.match(
        source,
        /getSheetKeys\(safeRawData\)/u,
        '人物映射表目录必须由 getSheetKeys(safeRawData) 构建',
    );
}

async function testBuildModelKeepsSheetIdentityAndTableOrder() {
    const { buildCharacterMappingModel } = await importModule(
        'modules/image-generation/character-mapping.js',
    );
    const rawData = {
        metadata: { ignored: true },
        sheet_later: {
            name: '人物表',
            orderNo: 20,
            content: [
                ['姓名', '', '姓名'],
                ['木下', '黑色短发', '备用名'],
            ],
        },
        sheet_first: {
            name: '人物表',
            orderNo: 10,
            content: [
                ['角色名', '外貌'],
                ['星野铃', '银色长发'],
            ],
        },
    };

    const model = buildCharacterMappingModel(rawData, []);

    assert.deepEqual(
        model.tables.map(table => ({
            sheetKey: table.sheetKey,
            tableName: table.tableName,
            headers: table.headers,
            rowCount: table.rowCount,
            status: table.status,
        })),
        [
            {
                sheetKey: 'sheet_first',
                tableName: '人物表',
                headers: [
                    { columnIndex: 0, rawName: '角色名', displayName: '角色名' },
                    { columnIndex: 1, rawName: '外貌', displayName: '外貌' },
                ],
                rowCount: 1,
                status: 'available',
            },
            {
                sheetKey: 'sheet_later',
                tableName: '人物表',
                headers: [
                    { columnIndex: 0, rawName: '姓名', displayName: '姓名' },
                    { columnIndex: 1, rawName: '', displayName: '列2' },
                    { columnIndex: 2, rawName: '姓名', displayName: '姓名' },
                ],
                rowCount: 1,
                status: 'available',
            },
        ],
    );
}

async function testBuildModelRetainsUnavailableMappingsWithoutSilentlyRemappingColumns() {
    const { buildCharacterMappingModel } = await importModule(
        'modules/image-generation/character-mapping.js',
    );
    const rawData = {
        sheet_people: {
            name: '重要角色表',
            content: [
                ['姓名', '年龄', '外貌'],
                ['星野铃', 18, '银色长发'],
            ],
        },
    };
    const savedMappings = [
        {
            mappingId: 'mapping-1',
            sheetKey: 'sheet_people',
            tableNameSnapshot: '旧角色表',
            nameColumn: { columnIndex: 0, headerSnapshot: '姓名' },
            promptColumns: [
                { columnIndex: 1, headerSnapshot: '外貌' },
                { columnIndex: 3, headerSnapshot: '穿着' },
            ],
        },
        {
            mappingId: 'mapping-2',
            sheetKey: 'sheet_missing',
            tableNameSnapshot: '已删除的人物表',
            nameColumn: { columnIndex: 0, headerSnapshot: '名字' },
            promptColumns: [{ columnIndex: 1, headerSnapshot: '设定' }],
        },
    ];
    const savedSnapshot = structuredClone(savedMappings);

    const model = buildCharacterMappingModel(rawData, savedMappings);

    assert.deepEqual(model.resolvedMappings, [
        {
            mappingId: 'mapping-1',
            sheetKey: 'sheet_people',
            tableName: '重要角色表',
            tableNameSnapshot: '旧角色表',
            nameColumn: {
                columnIndex: 0,
                headerSnapshot: '姓名',
                currentHeader: '姓名',
                status: 'available',
            },
            promptColumns: [
                {
                    columnIndex: 1,
                    headerSnapshot: '外貌',
                    currentHeader: '',
                    status: 'missing',
                },
                {
                    columnIndex: 3,
                    headerSnapshot: '穿着',
                    currentHeader: '',
                    status: 'missing',
                },
            ],
            status: 'partially_missing_prompt_columns',
            missingFields: [
                {
                    kind: 'prompt_column',
                    columnIndex: 1,
                    headerSnapshot: '外貌',
                },
                {
                    kind: 'prompt_column',
                    columnIndex: 3,
                    headerSnapshot: '穿着',
                },
            ],
        },
        {
            mappingId: 'mapping-2',
            sheetKey: 'sheet_missing',
            tableName: '已删除的人物表',
            tableNameSnapshot: '已删除的人物表',
            nameColumn: {
                columnIndex: 0,
                headerSnapshot: '名字',
                currentHeader: '',
                status: 'missing',
            },
            promptColumns: [
                {
                    columnIndex: 1,
                    headerSnapshot: '设定',
                    currentHeader: '',
                    status: 'missing',
                },
            ],
            status: 'missing_sheet',
            missingFields: [
                { kind: 'sheet', sheetKey: 'sheet_missing' },
            ],
        },
    ]);
    assert.deepEqual(savedMappings, savedSnapshot, '构建视图模型不得修改已保存映射');
}

async function testComposePromptUsesExplicitNameOrderAndFirstMatchingMapping() {
    const { composeCharacterImagePrompt } = await importModule(
        'modules/image-generation/character-mapping.js',
    );
    const rawData = {
        sheet_primary: {
            name: '主要人物',
            orderNo: 1,
            content: [
                ['row_id', '姓名', '外貌', '穿着'],
                [1, '星野铃', '银色长发', '白色衬衫'],
            ],
        },
        sheet_secondary: {
            name: '其他人物',
            orderNo: 2,
            content: [
                ['角色名', '设定'],
                ['星野铃', '这一条不应被采用'],
                ['木下', '黑色短发'],
            ],
        },
    };
    const mappings = [
        {
            mappingId: 'primary',
            sheetKey: 'sheet_primary',
            nameColumn: { columnIndex: 1, headerSnapshot: '姓名' },
            promptColumns: [
                { columnIndex: 3, headerSnapshot: '穿着' },
                { columnIndex: 2, headerSnapshot: '外貌' },
            ],
        },
        {
            mappingId: 'secondary',
            sheetKey: 'sheet_secondary',
            nameColumn: { columnIndex: 0, headerSnapshot: '角色名' },
            promptColumns: [{ columnIndex: 1, headerSnapshot: '设定' }],
        },
    ];

    const result = composeCharacterImagePrompt({
        rawData,
        mappings,
        explicitNames: '星野铃；木下; 未知角色；星野铃',
        description: '三个人站在海边',
        scanDescription: false,
    });

    assert.equal(
        result.prompt,
        '星野铃，银色长发，白色衬衫，木下，黑色短发，未知角色，三个人站在海边',
    );
    assert.deepEqual(result.characters, [
        {
            name: '星野铃',
            source: 'explicit',
            matched: true,
            mappingId: 'primary',
            sheetKey: 'sheet_primary',
            rowIndex: 0,
            promptParts: ['银色长发', '白色衬衫'],
        },
        {
            name: '木下',
            source: 'explicit',
            matched: true,
            mappingId: 'secondary',
            sheetKey: 'sheet_secondary',
            rowIndex: 1,
            promptParts: ['黑色短发'],
        },
        {
            name: '未知角色',
            source: 'explicit',
            matched: false,
            mappingId: '',
            sheetKey: '',
            rowIndex: -1,
            promptParts: [],
        },
    ]);
    assert.deepEqual(result.unmatchedNames, ['未知角色']);
    assert.deepEqual(result.mappingDiagnostics, []);
}

async function testComposePromptScansDescriptionWithLongestNamePriority() {
    const { composeCharacterImagePrompt } = await importModule(
        'modules/image-generation/character-mapping.js',
    );
    const rawData = {
        sheet_people: {
            name: '角色表',
            content: [
                ['姓名', '设定'],
                ['发送者', '金色短发'],
                ['星野', '短名不应误命中'],
                ['星野铃', '银色长发'],
                ['木下', '黑色短发'],
            ],
        },
    };
    const mappings = [{
        mappingId: 'people',
        sheetKey: 'sheet_people',
        nameColumn: { columnIndex: 0, headerSnapshot: '姓名' },
        promptColumns: [{ columnIndex: 1, headerSnapshot: '设定' }],
    }];

    const result = composeCharacterImagePrompt({
        rawData,
        mappings,
        explicitNames: '发送者',
        description: '星野铃和木下在咖啡店聊天，星野铃正在微笑。',
        scanDescription: true,
    });

    assert.equal(
        result.prompt,
        '发送者，金色短发，星野铃，银色长发，木下，黑色短发，星野铃和木下在咖啡店聊天，星野铃正在微笑。',
    );
    assert.deepEqual(
        result.characters.map(character => ({
            name: character.name,
            source: character.source,
        })),
        [
            { name: '发送者', source: 'explicit' },
            { name: '星野铃', source: 'description' },
            { name: '木下', source: 'description' },
        ],
    );
}

async function testComposePromptKeepsFirstEmptyMatchAndReportsUnavailableMappings() {
    const { composeCharacterImagePrompt } = await importModule(
        'modules/image-generation/character-mapping.js',
    );
    const rawData = {
        sheet_first: {
            name: '优先人物表',
            content: [
                ['姓名', '提示词'],
                ['星野铃', ''],
            ],
        },
        sheet_second: {
            name: '备用人物表',
            content: [
                ['姓名', '提示词'],
                ['星野铃', '不应越过第一条命中读取这里'],
            ],
        },
    };
    const mappings = [
        {
            mappingId: 'missing',
            sheetKey: 'sheet_deleted',
            tableNameSnapshot: '已删除的人物表',
            nameColumn: { columnIndex: 0, headerSnapshot: '姓名' },
            promptColumns: [{ columnIndex: 1, headerSnapshot: '提示词' }],
        },
        {
            mappingId: 'first',
            sheetKey: 'sheet_first',
            nameColumn: { columnIndex: 0, headerSnapshot: '姓名' },
            promptColumns: [{ columnIndex: 1, headerSnapshot: '提示词' }],
        },
        {
            mappingId: 'second',
            sheetKey: 'sheet_second',
            nameColumn: { columnIndex: 0, headerSnapshot: '姓名' },
            promptColumns: [{ columnIndex: 1, headerSnapshot: '提示词' }],
        },
    ];

    const result = composeCharacterImagePrompt({
        rawData,
        mappings,
        explicitNames: '星野铃；未收录人物',
        description: '站在窗边',
        scanDescription: false,
    });

    assert.equal(result.prompt, '星野铃，未收录人物，站在窗边');
    assert.equal(result.characters[0].mappingId, 'first');
    assert.deepEqual(result.characters[0].promptParts, []);
    assert.deepEqual(result.unmatchedNames, ['未收录人物']);
    assert.deepEqual(result.mappingDiagnostics, [
        {
            mappingId: 'missing',
            sheetKey: 'sheet_deleted',
            status: 'missing_sheet',
            missingFields: [{ kind: 'sheet', sheetKey: 'sheet_deleted' }],
        },
    ]);
}

async function testComposePromptDeduplicatesResolvedPromptColumns() {
    const { composeCharacterImagePrompt } = await importModule(
        'modules/image-generation/character-mapping.js',
    );
    const rawData = {
        sheet_people: {
            name: '角色表',
            content: [
                ['姓名', '外貌'],
                ['木下', '黑色短发'],
            ],
        },
    };
    const mappings = [{
        mappingId: 'people',
        sheetKey: 'sheet_people',
        nameColumn: { columnIndex: 0, headerSnapshot: '姓名' },
        promptColumns: [
            { columnIndex: 1, headerSnapshot: '外貌' },
            { columnIndex: 1, headerSnapshot: '外貌' },
        ],
    }];

    const result = composeCharacterImagePrompt({
        rawData,
        mappings,
        explicitNames: '木下',
        description: '站在窗边',
        scanDescription: false,
    });

    assert.equal(result.prompt, '木下，黑色短发，站在窗边');
    assert.deepEqual(result.characters[0].promptParts, ['黑色短发']);
}

async function main() {
    testBuildModelUsesCanonicalSheetOrderingSource();
    await testBuildModelKeepsSheetIdentityAndTableOrder();
    await testBuildModelRetainsUnavailableMappingsWithoutSilentlyRemappingColumns();
    await testComposePromptUsesExplicitNameOrderAndFirstMatchingMapping();
    await testComposePromptScansDescriptionWithLongestNamePriority();
    await testComposePromptKeepsFirstEmptyMatchAndReportsUnavailableMappings();
    await testComposePromptDeduplicatesResolvedPromptColumns();
    console.log('[image-generation-character-mapping] passed');
}

main().catch((error) => {
    console.error('[image-generation-character-mapping] failed');
    console.error(error);
    process.exitCode = 1;
});
