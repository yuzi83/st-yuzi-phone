const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    return import(`${href}?contract=${Date.now()}-${Math.random()}`);
}

const BASE_CONFIG = {
    enabled: true,
    timeoutMs: 300_000,
    roleMappings: [],
    promptTranslationEnabled: true,
    promptTranslationApiPresetId: 'api-1',
    promptTranslationPresetId: 'image-1',
};

function createBaseHarness(overrides = {}) {
    const calls = {
        sharedResources: 0,
        translations: [],
        generations: [],
    };
    const resources = {
        ok: true,
        status: 'ready',
        apiPresets: [{ presetId: 'api-1', name: '转换 API' }],
        imageGenerationPresets: [{
            presetId: 'image-1',
            name: 'Tag 规则',
            entries: [{ role: 'system', content: '只输出 tag' }],
        }],
    };
    const service = {
        getPhoneSettings: () => ({ imageGeneration: BASE_CONFIG }),
        savePhoneSetting: () => true,
        tableReader: async () => ({}),
        characterMapping: {
            composeCharacterImagePrompt: () => ({
                prompt: '星野铃，银色长发，坐在窗边',
                characters: [],
                unmatchedNames: [],
                mappingDiagnostics: [],
            }),
        },
        qqV2PresetService: {
            async readSharedResources() {
                calls.sharedResources += 1;
                return resources;
            },
            async translateImagePrompt(input) {
                calls.translations.push(input);
                return {
                    ok: true,
                    status: 'translated',
                    content: '1girl, silver hair, by the window',
                };
            },
        },
        imageGenerationService: {
            async generateAndStore(input) {
                calls.generations.push(input);
                return {
                    ok: true,
                    status: 'stored',
                    path: 'user/images/yuzi-phone-generated/test.png',
                };
            },
        },
        ...overrides,
    };
    return { service, calls };
}

async function createService(harness) {
    const { createImageGenerationSettingsService } = await importModule(
        'modules/image-generation/settings-service.js',
    );
    return createImageGenerationSettingsService(harness.service);
}

async function testLoadViewModelExposesSharedApiAndImagePresets() {
    const harness = createBaseHarness();
    const service = await createService(harness);
    const viewModel = await service.loadViewModel();

    assert.deepEqual(viewModel.sharedResources, {
        status: 'ready',
        apiPresets: harness.service.qqV2PresetService
            ? [{ presetId: 'api-1', name: '转换 API' }]
            : [],
        imageGenerationPresets: [{
            presetId: 'image-1',
            name: 'Tag 规则',
            entries: [{ role: 'system', content: '只输出 tag' }],
        }],
    });
    assert.equal(harness.calls.sharedResources, 1);
}

async function testTestGenerateTranslatesBeforeCallingImageGeneration() {
    const harness = createBaseHarness();
    const service = await createService(harness);
    const result = await service.testGenerate({
        names: '星野铃',
        description: '坐在窗边',
        timeoutMs: 90_000,
        filename: 'test',
    });

    assert.equal(result.ok, true);
    assert.equal(result.prompt, '星野铃，银色长发，坐在窗边');
    assert.equal(result.aiOutput, '1girl, silver hair, by the window');
    assert.deepEqual(harness.calls.translations, [{
        prompt: '星野铃，银色长发，坐在窗边',
        apiPresetId: 'api-1',
        imageGenerationPresetId: 'image-1',
        timeoutMs: 90_000,
    }]);
    assert.deepEqual(harness.calls.generations, [{
        prompt: '1girl, silver hair, by the window',
        width: null,
        height: null,
        negativePrompt: '',
        change: '',
        timeoutMs: 90_000,
        folder: 'yuzi-phone-generated',
        filename: 'test',
    }]);
}

async function testTranslationFailureFallsBackToNaturalPrompt() {
    const harness = createBaseHarness({
        qqV2PresetService: {
            async readSharedResources() {
                return {
                    ok: true,
                    status: 'ready',
                    apiPresets: [],
                    imageGenerationPresets: [],
                };
            },
            async translateImagePrompt() {
                return {
                    ok: false,
                    status: 'failed',
                    error: { code: 'translation-failed' },
                };
            },
        },
    });
    const service = await createService(harness);
    const result = await service.testGenerate();

    assert.equal(result.ok, true);
    assert.equal(result.prompt, '星野铃，银色长发，坐在窗边');
    assert.equal('aiOutput' in result, false);
    assert.equal(harness.calls.generations[0].prompt, '星野铃，银色长发，坐在窗边');
}

async function testMissingTranslationSelectionSkipsTheMiddleModel() {
    let translationCalls = 0;
    const harness = createBaseHarness({
        getPhoneSettings: () => ({
            imageGeneration: {
                ...BASE_CONFIG,
                promptTranslationApiPresetId: '',
                promptTranslationPresetId: '',
            },
        }),
        qqV2PresetService: {
            async translateImagePrompt() {
                translationCalls += 1;
                return { ok: true, status: 'translated', content: '不应调用' };
            },
        },
    });
    const service = await createService(harness);
    const result = await service.testGenerate();

    assert.equal(result.ok, true);
    assert.equal(result.prompt, '星野铃，银色长发，坐在窗边');
    assert.equal(translationCalls, 0);
}

async function testTranslationTimeoutDoesNotStartImageGeneration() {
    const harness = createBaseHarness({
        qqV2PresetService: {
            async translateImagePrompt() {
                return {
                    ok: false,
                    status: 'timeout',
                    error: { code: 'translation-timeout', message: '超时' },
                };
            },
        },
    });
    const service = await createService(harness);
    const result = await service.testGenerate();

    assert.equal(result.ok, false);
    assert.equal(result.status, 'timeout');
    assert.equal(harness.calls.generations.length, 0);
}

async function main() {
    await testLoadViewModelExposesSharedApiAndImagePresets();
    await testTestGenerateTranslatesBeforeCallingImageGeneration();
    await testTranslationFailureFallsBackToNaturalPrompt();
    await testMissingTranslationSelectionSkipsTheMiddleModel();
    await testTranslationTimeoutDoesNotStartImageGeneration();
    console.log('[image-generation-settings-translation] passed');
}

main().catch((error) => {
    console.error('[image-generation-settings-translation] failed');
    console.error(error);
    process.exitCode = 1;
});
