const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');

async function importModule(relativePath) {
    const modulePath = path.join(ROOT, relativePath);
    return import(`${pathToFileURL(modulePath).href}?image-generation-presets=${Date.now()}-${Math.random()}`);
}

function createCryptoApi() {
    let serial = 0;
    return {
        randomUUID() {
            serial += 1;
            return `preset-${serial}`;
        },
    };
}

async function createHarness(existingStateStore = null) {
    const { createQQV2SharedResourceStorage, createMemoryQQV2StateStore } = await importModule(
        'modules/qq-v2/storage/state-store.js',
    );
    const { createQQV2ResourceService } = await importModule(
        'modules/qq-v2/resources/service.js',
    );
    const stateStore = existingStateStore || createMemoryQQV2StateStore();
    const storage = createQQV2SharedResourceStorage({ stateStore });
    const service = createQQV2ResourceService({
        storage,
        cryptoApi: createCryptoApi(),
    });
    return { service, stateStore };
}

const validSource = {
    '衣装转换': {
        entries: [
            {
                id: 'entry-1',
                name: '规则',
                role: 'system',
                content: '只输出目标格式',
                enabled: true,
                triggerMode: 'always',
                triggerWords: '',
                andTriggerWords: '',
            },
            {
                id: 'entry-2',
                name: '暂时关闭',
                role: 'assistant',
                content: '这条仍然需要被导出保留',
                enabled: false,
                triggerMode: 'always',
                triggerWords: '',
                andTriggerWords: '',
            },
        ],
    },
};

async function testImageGenerationPresetsAreEmptyByDefault() {
    const { service } = await createHarness();
    assert.deepStrictEqual(await service.listImageGenerationPresets(), []);
}

async function testImageGenerationPresetImportRoundTripsStChatu8Shape() {
    const { service } = await createHarness();
    const imported = await service.importImageGenerationPresets(validSource);

    assert.strictEqual(imported.length, 1);
    assert.strictEqual(imported[0].name, '衣装转换');
    assert.strictEqual(imported[0].id, 'preset-1');
    assert.deepStrictEqual(imported[0].entries, validSource['衣装转换'].entries);

    const selected = await service.getImageGenerationPreset(imported[0].id);
    assert.deepStrictEqual(selected, imported[0]);
    assert.notStrictEqual(selected.entries, imported[0].entries);

    const exported = await service.exportImageGenerationPreset(imported[0].id);
    assert.deepStrictEqual(exported, validSource);
}

async function testImageGenerationPresetImportSupportsMultipleTopLevelPresetsAndNameCopies() {
    const { service } = await createHarness();
    await service.importImageGenerationPresets(validSource);
    const imported = await service.importImageGenerationPresets({
        ...validSource,
        '空预设': { entries: [] },
    });

    assert.deepStrictEqual(imported.map(item => item.name), ['衣装转换 (copy)', '空预设']);
    assert.deepStrictEqual(
        (await service.listImageGenerationPresets()).map(item => item.name),
        ['衣装转换', '衣装转换 (copy)', '空预设'],
    );
}

async function testInvalidImageGenerationPresetImportIsAtomic() {
    const { service } = await createHarness();
    await service.importImageGenerationPresets(validSource);

    await assert.rejects(
        () => service.importImageGenerationPresets({
            合法: { entries: [] },
            非法: {
                entries: [{ id: 'bad', name: '坏角色', role: 'tool', content: '拒绝' }],
            },
        }),
        error => error?.code === 'invalid_image_generation_preset_import',
    );

    assert.deepStrictEqual(
        (await service.listImageGenerationPresets()).map(item => item.name),
        ['衣装转换'],
    );
}

async function testImageGenerationPresetImportRejectsUnknownKeysAndWrongTypes() {
    const { service } = await createHarness();
    const invalidSources = [
        {
            '未知字段': {
                entries: [],
                extra: true,
            },
        },
        {
            '错误消息块': {
                entries: [{
                    role: 'system',
                    content: '内容',
                    enabled: 'true',
                }],
            },
        },
        {
            '错误消息块字段': {
                entries: [{
                    role: 'system',
                    content: '内容',
                    unexpected: '必须拒绝',
                }],
            },
        },
    ];

    for (const source of invalidSources) {
        await assert.rejects(
            () => service.importImageGenerationPresets(source),
            error => error?.code === 'invalid_image_generation_preset_import',
        );
    }
    assert.deepStrictEqual(await service.listImageGenerationPresets(), []);
}

async function testImageGenerationPresetDeleteReturnsTrueThenFalse() {
    const { service } = await createHarness();
    const [imported] = await service.importImageGenerationPresets(validSource);

    assert.strictEqual(await service.deleteImageGenerationPreset(imported.id), true);
    assert.strictEqual(await service.getImageGenerationPreset(imported.id), null);
    assert.strictEqual(await service.deleteImageGenerationPreset(imported.id), false);
}

async function testImageGenerationPresetDefaultsOptionalStChatu8EntryFields() {
    const { service } = await createHarness();
    const [imported] = await service.importImageGenerationPresets({
        '最小预设': {
            entries: [{
                role: 'user',
                content: '把最后追加的中文内容转换为目标格式',
            }],
        },
    });

    assert.deepStrictEqual(imported, {
        id: 'preset-1',
        name: '最小预设',
        entries: [{
            id: '',
            name: '',
            role: 'user',
            content: '把最后追加的中文内容转换为目标格式',
            enabled: true,
            triggerMode: 'always',
            triggerWords: '',
            andTriggerWords: '',
        }],
    });
}

async function testImageGenerationPresetStorageIsSharedAndExportsFreshCopies() {
    const first = await createHarness();
    const [imported] = await first.service.importImageGenerationPresets(validSource);
    const second = await createHarness(first.stateStore);

    const listed = await second.service.listImageGenerationPresets();
    assert.deepStrictEqual(listed, [imported]);
    assert.notStrictEqual(listed[0].entries, imported.entries);
    assert.notStrictEqual(listed[0].entries[0], imported.entries[0]);

    const exported = await second.service.exportImageGenerationPreset(imported.id);
    exported['衣装转换'].entries[0].content = '外部修改不得回写资源';
    assert.equal(
        (await second.service.getImageGenerationPreset(imported.id)).entries[0].content,
        '只输出目标格式',
    );
}

async function testImageGenerationPresetImportRejectsNonStChatu8DocumentsAtomically() {
    const { service } = await createHarness();
    await service.importImageGenerationPresets(validSource);

    await assert.rejects(
        () => service.importImageGenerationPresets({
            presets: [{
                name: 'QQ 风格不支持',
                messages: [{ role: 'system', content: '不要导入' }],
            }],
        }),
        error => error?.code === 'invalid_image_generation_preset_import',
    );

    assert.deepStrictEqual(
        (await service.listImageGenerationPresets()).map(item => item.name),
        ['衣装转换'],
    );
}

async function main() {
    await testImageGenerationPresetsAreEmptyByDefault();
    await testImageGenerationPresetImportRoundTripsStChatu8Shape();
    await testImageGenerationPresetImportSupportsMultipleTopLevelPresetsAndNameCopies();
    await testInvalidImageGenerationPresetImportIsAtomic();
    await testImageGenerationPresetImportRejectsUnknownKeysAndWrongTypes();
    await testImageGenerationPresetDeleteReturnsTrueThenFalse();
    await testImageGenerationPresetDefaultsOptionalStChatu8EntryFields();
    await testImageGenerationPresetStorageIsSharedAndExportsFreshCopies();
    await testImageGenerationPresetImportRejectsNonStChatu8DocumentsAtomically();
    console.log('image-generation-presets-resource-contract: PASS');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
