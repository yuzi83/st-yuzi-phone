const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    return import(`${href}?contract=${Date.now()}-${Math.random()}`);
}

async function testPhoneRuntimeReadsCurrentMappingsAndTimeout() {
    const { createPhoneImageGenerationRuntime } = await importModule(
        'modules/image-generation/runtime.js',
    );
    const rawData = {
        sheet_people: {
            name: '角色资料',
            orderNo: 1,
            content: [
                ['姓名', '外貌'],
                ['星野铃', '银色长发'],
            ],
        },
    };
    const roleMappings = [{
        mappingId: 'mapping-1',
        sheetKey: 'sheet_people',
        tableNameSnapshot: '角色资料',
        nameColumn: { columnIndex: 0, headerSnapshot: '姓名' },
        promptColumns: [{ columnIndex: 1, headerSnapshot: '外貌' }],
    }];
    const generationCalls = [];
    const deletionCalls = [];
    const runtime = createPhoneImageGenerationRuntime({
        getPhoneSettings: () => ({
            imageGeneration: {
                enabled: true,
                timeoutMs: 135_000,
                roleMappings,
            },
        }),
        tableReader: async () => rawData,
        imageGenerationService: {
            async generateAndStore(input) {
                generationCalls.push(input);
                return {
                    ok: true,
                    status: 'stored',
                    path: 'user/images/yuzi-phone-generated/qq-test.png',
                };
            },
            async deleteStoredImage(input) {
                deletionCalls.push(input);
                return { ok: true, status: 'deleted', path: input.path };
            },
        },
    });

    const composition = await runtime.composeCharacterImagePrompt({
        explicitNames: ['星野铃'],
        description: '坐在窗边',
        scanDescription: true,
    });
    assert.equal(composition.prompt, '星野铃，银色长发，坐在窗边');

    const generated = await runtime.generateAndStore({
        prompt: composition.prompt,
        timeoutMs: 1,
        width: null,
        height: null,
    });
    assert.equal(generated.ok, true);
    assert.deepEqual(generationCalls, [{
        prompt: '星野铃，银色长发，坐在窗边',
        timeoutMs: 135_000,
        width: null,
        height: null,
    }]);

    await runtime.deleteStoredImage({
        path: 'user/images/yuzi-phone-generated/qq-test.png',
    });
    assert.deepEqual(deletionCalls, [{
        path: 'user/images/yuzi-phone-generated/qq-test.png',
    }]);
}

async function testPhoneRuntimeBlocksQQGenerationWhenMasterSwitchIsOff() {
    const { createPhoneImageGenerationRuntime } = await importModule(
        'modules/image-generation/runtime.js',
    );
    let generationCalls = 0;
    const runtime = createPhoneImageGenerationRuntime({
        getPhoneSettings: () => ({
            imageGeneration: {
                enabled: false,
                timeoutMs: 300_000,
                roleMappings: [],
            },
        }),
        tableReader: async () => ({}),
        imageGenerationService: {
            async generateAndStore() {
                generationCalls += 1;
                return { ok: true };
            },
            async deleteStoredImage() {
                return { ok: true };
            },
        },
    });

    assert.deepEqual(await runtime.generateAndStore({ prompt: '测试' }), {
        ok: false,
        status: 'disabled',
        error: { code: 'image-generation-disabled' },
    });
    assert.equal(generationCalls, 0);
}

async function testDefaultQQRuntimeUsesThePhoneImageGenerationAdapter() {
    const { createQQV2DefaultProductionRuntime } = await importModule(
        'modules/qq-v2/runtime/default-runtime.js',
    );
    const adapter = {
        composeCharacterImagePrompt() {},
        generateAndStore() {},
        deleteStoredImage() {},
    };
    let capturedOptions = null;
    const expectedRuntime = { marker: 'runtime' };
    const runtime = createQQV2DefaultProductionRuntime({
        host: { marker: 'host' },
        logger: { marker: 'logger' },
        stateStore: { marker: 'state-store' },
        imageGenerationRuntime: adapter,
        createProductionRuntime(options) {
            capturedOptions = options;
            return expectedRuntime;
        },
    });

    assert.equal(runtime, expectedRuntime);
    assert.equal(capturedOptions.imageGenerationService, adapter);
    assert.equal(
        await capturedOptions.composeCharacterImagePrompt({ description: '测试' }),
        undefined,
    );
    assert.equal(capturedOptions.host.marker, 'host');
    assert.equal(capturedOptions.logger.marker, 'logger');
    assert.equal(capturedOptions.stateStore.marker, 'state-store');
}

function testSettingsAndQQShareOneUnderlyingImageService() {
    const settingsRender = fs.readFileSync(
        path.join(ROOT, 'modules/settings-app/render.js'),
        'utf8',
    );
    assert.match(
        settingsRender,
        /sharedImageGenerationService/u,
        '设置测试生图必须复用统一的底层智慧姬生图服务',
    );
    assert.doesNotMatch(
        settingsRender,
        /const sharedImageGenerationService = createImageGenerationService\(\)/u,
        '设置页不能再私自创建第二套所谓 shared 服务',
    );
}

async function main() {
    await testPhoneRuntimeReadsCurrentMappingsAndTimeout();
    await testPhoneRuntimeBlocksQQGenerationWhenMasterSwitchIsOff();
    await testDefaultQQRuntimeUsesThePhoneImageGenerationAdapter();
    testSettingsAndQQShareOneUnderlyingImageService();
    console.log('[image-generation-runtime-wiring] passed');
}

main().catch((error) => {
    console.error('[image-generation-runtime-wiring] failed');
    console.error(error);
    process.exitCode = 1;
});
