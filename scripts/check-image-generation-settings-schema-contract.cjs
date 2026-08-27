const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    return import(`${href}?contract=${Date.now()}-${Math.random()}`);
}

async function testImageGenerationDefaultsAndNormalization() {
    const {
        IMAGE_GENERATION_DEFAULTS,
        normalizeImageGenerationSettings,
        validateSetting,
        validateSettings,
    } = await importModule('modules/settings/schema.js');

    assert.deepEqual(IMAGE_GENERATION_DEFAULTS, {
        enabled: false,
        timeoutMs: 300_000,
        roleMappings: [],
        promptTranslationEnabled: false,
        promptTranslationApiPresetId: '',
        promptTranslationPresetId: '',
    });
    assert.deepEqual(validateSettings({}).imageGeneration, IMAGE_GENERATION_DEFAULTS);

    const normalized = normalizeImageGenerationSettings({
        enabled: 'true',
        timeoutMs: '999999999',
        roleMappings: [],
        unknownRootKey: 'drop',
    });
    assert.deepEqual(normalized, {
        enabled: true,
        timeoutMs: 1_800_000,
        roleMappings: [],
        promptTranslationEnabled: false,
        promptTranslationApiPresetId: '',
        promptTranslationPresetId: '',
    });
    assert.deepEqual(validateSetting('imageGeneration', normalized), {
        valid: true,
        value: normalized,
    });
}

async function testRoleMappingsAreBoundedNormalizedAndDeepCloned() {
    const {
        IMAGE_GENERATION_LIMITS,
        normalizeImageGenerationSettings,
        validateSettings,
    } = await importModule('modules/settings/schema.js');
    const raw = {
        enabled: false,
        timeoutMs: 300_000,
        roleMappings: [
            {
                mappingId: '  mapping-1  ',
                sheetKey: '  sheet_people  ',
                tableNameSnapshot: '  重要角色表  ',
                nameColumn: {
                    columnIndex: '0',
                    headerSnapshot: '  姓名  ',
                    unknownColumnKey: 'drop',
                },
                promptColumns: [
                    { columnIndex: '2', headerSnapshot: '  外貌  ' },
                    { columnIndex: 1, headerSnapshot: '穿着' },
                    { columnIndex: 2, headerSnapshot: '重复外貌列' },
                    { columnIndex: -1, headerSnapshot: '非法列' },
                ],
                unknownMappingKey: 'drop',
            },
            {
                mappingId: 'mapping-2',
                sheetKey: 'sheet_missing',
                tableNameSnapshot: '已经删除的表',
                nameColumn: {
                    columnIndex: 4,
                    headerSnapshot: '已经删除的姓名字段',
                },
                promptColumns: [
                    {
                        columnIndex: 8,
                        headerSnapshot: '已经删除的提示词字段',
                    },
                ],
            },
            {
                mappingId: 'mapping-1',
                sheetKey: 'sheet_duplicate',
                nameColumn: { columnIndex: 0, headerSnapshot: '姓名' },
                promptColumns: [],
            },
            {
                mappingId: '',
                sheetKey: 'sheet_without_id',
            },
            null,
        ],
    };
    const normalized = normalizeImageGenerationSettings(raw);

    assert.deepEqual(normalized.roleMappings, [
        {
            mappingId: 'mapping-1',
            sheetKey: 'sheet_people',
            tableNameSnapshot: '重要角色表',
            nameColumn: {
                columnIndex: 0,
                headerSnapshot: '姓名',
            },
            promptColumns: [
                { columnIndex: 2, headerSnapshot: '外貌' },
                { columnIndex: 1, headerSnapshot: '穿着' },
            ],
        },
        {
            mappingId: 'mapping-2',
            sheetKey: 'sheet_missing',
            tableNameSnapshot: '已经删除的表',
            nameColumn: {
                columnIndex: 4,
                headerSnapshot: '已经删除的姓名字段',
            },
            promptColumns: [
                {
                    columnIndex: 8,
                    headerSnapshot: '已经删除的提示词字段',
                },
            ],
        },
    ]);
    assert.equal(normalized.roleMappings.length <= IMAGE_GENERATION_LIMITS.roleMappings, true);

    raw.roleMappings[0].nameColumn.headerSnapshot = '被调用方修改';
    raw.roleMappings[0].promptColumns[0].headerSnapshot = '被调用方修改';
    assert.equal(normalized.roleMappings[0].nameColumn.headerSnapshot, '姓名');
    assert.equal(normalized.roleMappings[0].promptColumns[0].headerSnapshot, '外貌');

    const validated = validateSettings({ imageGeneration: normalized });
    validated.imageGeneration.roleMappings[0].promptColumns[0].headerSnapshot = '修改返回值';
    const nextValidated = validateSettings({ imageGeneration: normalized });
    assert.equal(nextValidated.imageGeneration.roleMappings[0].promptColumns[0].headerSnapshot, '外貌');
}

async function testImageGenerationLimitsAndDefaultReferencesAreIsolated() {
    const {
        IMAGE_GENERATION_LIMITS,
        defaultSettings,
        normalizeImageGenerationSettings,
        validateSetting,
    } = await importModule('modules/settings/schema.js');
    const manyMappings = Array.from(
        { length: IMAGE_GENERATION_LIMITS.roleMappings + 5 },
        (_, mappingIndex) => ({
            mappingId: `mapping-${mappingIndex}`,
            sheetKey: `sheet_${mappingIndex}`,
            tableNameSnapshot: '表'.repeat(IMAGE_GENERATION_LIMITS.tableNameLength + 5),
            nameColumn: { columnIndex: 0, headerSnapshot: '姓名' },
            promptColumns: Array.from(
                { length: IMAGE_GENERATION_LIMITS.promptColumns + 5 },
                (_, columnIndex) => ({
                    columnIndex,
                    headerSnapshot: `字段${columnIndex}`,
                }),
            ),
        }),
    );
    const normalized = normalizeImageGenerationSettings({
        roleMappings: manyMappings,
    });

    assert.equal(normalized.roleMappings.length, IMAGE_GENERATION_LIMITS.roleMappings);
    assert.equal(
        normalized.roleMappings[0].promptColumns.length,
        IMAGE_GENERATION_LIMITS.promptColumns,
    );
    assert.equal(
        normalized.roleMappings[0].tableNameSnapshot.length,
        IMAGE_GENERATION_LIMITS.tableNameLength,
    );

    const defaultResult = validateSetting('imageGeneration', null);
    defaultResult.value.roleMappings.push({
        mappingId: 'must-not-leak',
        sheetKey: '',
        tableNameSnapshot: '',
        nameColumn: { columnIndex: -1, headerSnapshot: '' },
        promptColumns: [],
    });
    assert.deepEqual(defaultSettings.imageGeneration.roleMappings, []);
}

async function testSettingsFacadeExportsImageGenerationSchema() {
    const settings = await importModule('modules/settings.js');

    assert.equal(typeof settings.normalizeImageGenerationSettings, 'function');
    assert.deepEqual(settings.IMAGE_GENERATION_DEFAULTS, {
        enabled: false,
        timeoutMs: 300_000,
        roleMappings: [],
        promptTranslationEnabled: false,
        promptTranslationApiPresetId: '',
        promptTranslationPresetId: '',
    });
    assert.equal(settings.IMAGE_GENERATION_LIMITS.timeoutMs.min, 10_000);
    assert.equal(settings.IMAGE_GENERATION_LIMITS.timeoutMs.max, 1_800_000);
}

async function testSettingsServiceLoadsNormalizedMappingViewModel() {
    const { createImageGenerationSettingsService } = await importModule(
        'modules/image-generation/settings-service.js',
    );
    const rawData = {
        sheet_people: {
            name: '重要角色表',
            content: [
                ['姓名', '外貌'],
                ['星野铃', '银色长发'],
            ],
        },
    };
    const storedSettings = {
        imageGeneration: {
            enabled: 'true',
            timeoutMs: '120000',
            roleMappings: [
                {
                    mappingId: ' mapping-1 ',
                    sheetKey: ' sheet_people ',
                    tableNameSnapshot: ' 重要角色表 ',
                    nameColumn: { columnIndex: '0', headerSnapshot: ' 姓名 ' },
                    promptColumns: [{ columnIndex: '1', headerSnapshot: ' 外貌 ' }],
                },
            ],
        },
    };
    const mappingCalls = [];
    const service = createImageGenerationSettingsService({
        getPhoneSettings: () => storedSettings,
        tableReader: async () => rawData,
        characterMapping: {
            buildCharacterMappingModel(receivedRawData, mappings) {
                mappingCalls.push([receivedRawData, mappings]);
                return {
                    tables: [{ sheetKey: 'sheet_people', tableName: '重要角色表' }],
                    resolvedMappings: [{ mappingId: 'mapping-1', status: 'available' }],
                };
            },
        },
        savePhoneSetting: () => true,
        imageGenerationService: {},
    });

    const viewModel = await service.loadViewModel();

    assert.deepEqual(viewModel, {
        config: {
            enabled: true,
            timeoutMs: 120_000,
            roleMappings: [
                {
                    mappingId: 'mapping-1',
                    sheetKey: 'sheet_people',
                    tableNameSnapshot: '重要角色表',
                    nameColumn: { columnIndex: 0, headerSnapshot: '姓名' },
                    promptColumns: [{ columnIndex: 1, headerSnapshot: '外貌' }],
                },
            ],
            promptTranslationEnabled: false,
            promptTranslationApiPresetId: '',
            promptTranslationPresetId: '',
        },
        tables: [{ sheetKey: 'sheet_people', tableName: '重要角色表' }],
        resolvedMappings: [{ mappingId: 'mapping-1', status: 'available' }],
    });
    assert.deepEqual(mappingCalls, [[rawData, viewModel.config.roleMappings]]);

    viewModel.config.roleMappings[0].nameColumn.headerSnapshot = '调用方修改';
    const nextViewModel = await service.loadViewModel();
    assert.equal(nextViewModel.config.roleMappings[0].nameColumn.headerSnapshot, '姓名');
}

async function testSettingsServiceBuildsPreviewFromDraftConfigAndTestInput() {
    const { createImageGenerationSettingsService } = await importModule(
        'modules/image-generation/settings-service.js',
    );
    const rawData = {
        sheet_draft: {
            name: '主角表',
            content: [['名字', '设定'], ['小玉', '黑色长发']],
        },
    };
    const draftConfig = {
        enabled: true,
        timeoutMs: 90_000,
        roleMappings: [
            {
                mappingId: 'draft-mapping',
                sheetKey: 'sheet_draft',
                tableNameSnapshot: '主角表',
                nameColumn: { columnIndex: 0, headerSnapshot: '名字' },
                promptColumns: [{ columnIndex: 1, headerSnapshot: '设定' }],
            },
        ],
        promptTranslationEnabled: false,
        promptTranslationApiPresetId: '',
        promptTranslationPresetId: '',
    };
    const composeCalls = [];
    const service = createImageGenerationSettingsService({
        getPhoneSettings: () => ({
            imageGeneration: {
                enabled: false,
                timeoutMs: 300_000,
                roleMappings: [],
            },
        }),
        tableReader: async () => rawData,
        characterMapping: {
            buildCharacterMappingModel(receivedRawData, mappings) {
                return {
                    tables: [{ sheetKey: 'sheet_draft', tableName: '主角表' }],
                    resolvedMappings: mappings,
                };
            },
            composeCharacterImagePrompt(input) {
                composeCalls.push(input);
                return {
                    prompt: '小玉，黑色长发，站在雨中',
                    characters: [{ name: '小玉', matched: true }],
                    unmatchedNames: [],
                    mappingDiagnostics: [],
                };
            },
        },
        savePhoneSetting: () => true,
        imageGenerationService: {},
    });

    const viewModel = await service.loadViewModel({
        config: draftConfig,
        testInput: {
            names: '小玉',
            description: '站在雨中',
        },
    });

    assert.deepEqual(viewModel.config, draftConfig);
    assert.deepEqual(viewModel.testInput, {
        names: '小玉',
        description: '站在雨中',
        finalPrompt: '小玉，黑色长发，站在雨中',
    });
    assert.deepEqual(composeCalls, [{
        rawData,
        mappings: draftConfig.roleMappings,
        explicitNames: '小玉',
        description: '站在雨中',
        scanDescription: true,
    }]);
}

async function testSettingsServiceSavesOneNormalizedConfigObject() {
    const { createImageGenerationSettingsService } = await importModule(
        'modules/image-generation/settings-service.js',
    );
    const calls = [];
    const nextConfig = {
        enabled: 1,
        timeoutMs: 1,
        roleMappings: [
            {
                mappingId: ' mapping-1 ',
                sheetKey: ' sheet_people ',
                tableNameSnapshot: ' 重要角色表 ',
                nameColumn: { columnIndex: '0', headerSnapshot: ' 姓名 ' },
                promptColumns: [{ columnIndex: '2', headerSnapshot: ' 外貌 ' }],
            },
        ],
    };
    const service = createImageGenerationSettingsService({
        getPhoneSettings: () => ({ imageGeneration: {} }),
        tableReader: async () => ({}),
        characterMapping: {},
        imageGenerationService: {},
        savePhoneSetting(key, value) {
            calls.push([key, value]);
            return true;
        },
    });

    const result = await service.saveConfig(nextConfig);

    assert.deepEqual(result, {
        ok: true,
        status: 'saved',
        config: {
            enabled: true,
            timeoutMs: 10_000,
            roleMappings: [
                {
                    mappingId: 'mapping-1',
                    sheetKey: 'sheet_people',
                    tableNameSnapshot: '重要角色表',
                    nameColumn: { columnIndex: 0, headerSnapshot: '姓名' },
                    promptColumns: [{ columnIndex: 2, headerSnapshot: '外貌' }],
                },
            ],
            promptTranslationEnabled: false,
            promptTranslationApiPresetId: '',
            promptTranslationPresetId: '',
        },
    });
    assert.deepEqual(calls, [['imageGeneration', result.config]]);

    nextConfig.roleMappings[0].nameColumn.headerSnapshot = '调用方修改';
    assert.equal(calls[0][1].roleMappings[0].nameColumn.headerSnapshot, '姓名');
}

async function testSettingsServiceComposesAndStoresTestImage() {
    const { createImageGenerationSettingsService } = await importModule(
        'modules/image-generation/settings-service.js',
    );
    const rawData = {
        sheet_people: {
            name: '重要角色表',
            content: [
                ['姓名', '外貌'],
                ['星野铃', '银色长发'],
            ],
        },
    };
    const storedConfig = {
        enabled: false,
        timeoutMs: 300_000,
        roleMappings: [
            {
                mappingId: 'mapping-1',
                sheetKey: 'sheet_people',
                tableNameSnapshot: '重要角色表',
                nameColumn: { columnIndex: 0, headerSnapshot: '姓名' },
                promptColumns: [{ columnIndex: 1, headerSnapshot: '外貌' }],
            },
        ],
    };
    const composeCalls = [];
    const generationCalls = [];
    const service = createImageGenerationSettingsService({
        getPhoneSettings: () => ({ imageGeneration: storedConfig }),
        tableReader: async () => rawData,
        characterMapping: {
            buildCharacterMappingModel() {
                return { tables: [], resolvedMappings: [] };
            },
            composeCharacterImagePrompt(input) {
                composeCalls.push(input);
                return {
                    prompt: '星野铃，银色长发，木下，两个人坐在咖啡店',
                    characters: [
                        { name: '星野铃', matched: true },
                        { name: '木下', matched: false },
                    ],
                    unmatchedNames: ['木下'],
                    mappingDiagnostics: [],
                };
            },
        },
        savePhoneSetting: () => true,
        imageGenerationService: {
            async generateAndStore(input) {
                generationCalls.push(input);
                return {
                    ok: true,
                    status: 'stored',
                    requestId: 'request-001',
                    path: 'user/images/yuzi-phone-generated/settings-test.png',
                    format: 'png',
                    prompt: input.prompt,
                    change: '',
                    generatedAt: 123,
                };
            },
        },
    });

    const result = await service.testGenerate({
        names: '星野铃;木下',
        description: '两个人坐在咖啡店',
        timeoutMs: 90_000,
        filename: 'settings-test',
    });

    assert.deepEqual(composeCalls, [{
        rawData,
        mappings: storedConfig.roleMappings,
        explicitNames: '星野铃;木下',
        description: '两个人坐在咖啡店',
        scanDescription: true,
    }]);
    assert.deepEqual(generationCalls, [{
        prompt: '星野铃，银色长发，木下，两个人坐在咖啡店',
        width: null,
        height: null,
        negativePrompt: '',
        change: '',
        timeoutMs: 90_000,
        folder: 'yuzi-phone-generated',
        filename: 'settings-test',
    }]);
    assert.deepEqual(result, {
        ok: true,
        status: 'stored',
        requestId: 'request-001',
        path: 'user/images/yuzi-phone-generated/settings-test.png',
        format: 'png',
        prompt: '星野铃，银色长发，木下，两个人坐在咖啡店',
        change: '',
        generatedAt: 123,
        characters: [
            { name: '星野铃', matched: true },
            { name: '木下', matched: false },
        ],
        unmatchedNames: ['木下'],
        mappingDiagnostics: [],
    });
}

async function main() {
    await testImageGenerationDefaultsAndNormalization();
    await testRoleMappingsAreBoundedNormalizedAndDeepCloned();
    await testImageGenerationLimitsAndDefaultReferencesAreIsolated();
    await testSettingsFacadeExportsImageGenerationSchema();
    await testSettingsServiceLoadsNormalizedMappingViewModel();
    await testSettingsServiceBuildsPreviewFromDraftConfigAndTestInput();
    await testSettingsServiceSavesOneNormalizedConfigObject();
    await testSettingsServiceComposesAndStoresTestImage();
    console.log('[image-generation-settings-schema-contract] 检查通过');
}

main().catch((error) => {
    console.error('[image-generation-settings-schema-contract] 检查失败：');
    console.error(error);
    process.exitCode = 1;
});
