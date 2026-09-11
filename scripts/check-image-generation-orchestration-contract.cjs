const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    return import(`${href}?contract=${Date.now()}-${Math.random()}`);
}

function createClock(...moments) {
    const values = [...moments];
    return () => values.length > 1 ? values.shift() : values[0];
}

async function createOrchestrator(overrides = {}) {
    const { createImageGenerationOrchestrator } = await importModule(
        'modules/image-generation/orchestration.js',
    );
    const calls = {
        translations: [],
        generations: [],
    };
    const orchestrator = createImageGenerationOrchestrator({
        now: createClock(1_000),
        async translateImagePrompt(input) {
            calls.translations.push(input);
            return { ok: true, status: 'translated', content: 'translated prompt' };
        },
        async generateAndStore(input) {
            calls.generations.push(input);
            return {
                ok: true,
                status: 'generated',
                path: 'user/images/yuzi-phone-generated/test.png',
            };
        },
        ...overrides,
    });
    return { orchestrator, calls };
}

async function testGeneratesNaturalPromptWhenTranslationIsNotRequested() {
    const { orchestrator, calls } = await createOrchestrator();

    const result = await orchestrator.generate({
        naturalPrompt: '星野铃，坐在窗边',
        timeoutMs: 90_000,
        folder: 'yuzi-phone-generated',
        filename: 'qq-message-1',
    });

    assert.deepEqual(calls.translations, []);
    assert.deepEqual(calls.generations, [{
        prompt: '星野铃，坐在窗边',
        width: null,
        height: null,
        negativePrompt: '',
        change: '',
        timeoutMs: 90_000,
        folder: 'yuzi-phone-generated',
        filename: 'qq-message-1',
    }]);
    assert.equal(result.ok, true);
    assert.equal(result.naturalPrompt, '星野铃，坐在窗边');
    assert.equal(result.prompt, '星野铃，坐在窗边');
    assert.equal('aiOutput' in result, false);
}

async function testFiltersTranslatedPromptAndPassesOnlyRemainingTotalTimeoutToGeneration() {
    const { orchestrator, calls } = await createOrchestrator({
        now: createClock(1_000, 1_000, 1_400, 1_400),
        async translateImagePrompt(input) {
            calls.translations.push(input);
            return {
                ok: true,
                status: 'translated',
                content: '<content>1girl, silver hair</content><analysis>ignore</analysis>',
            };
        },
    });

    const result = await orchestrator.generate({
        naturalPrompt: '星野铃，银色长发，坐在窗边',
        timeoutMs: 1_000,
        translation: {
            apiPresetId: 'api-1',
            imageGenerationPresetId: 'prompt-1',
        },
        filterSettings: {
            promptTranslationExtractTag: 'content',
            promptTranslationExcludeTags: 'analysis',
        },
    });

    assert.deepEqual(calls.translations, [{
        prompt: '星野铃，银色长发，坐在窗边',
        apiPresetId: 'api-1',
        imageGenerationPresetId: 'prompt-1',
        timeoutMs: 1_000,
    }]);
    assert.equal(calls.generations.length, 1);
    assert.equal(calls.generations[0].prompt, '1girl, silver hair');
    assert.equal(calls.generations[0].timeoutMs, 600);
    assert.equal(result.ok, true);
    assert.equal(result.naturalPrompt, '星野铃，银色长发，坐在窗边');
    assert.equal(result.prompt, '1girl, silver hair');
    assert.equal(result.aiOutput, '1girl, silver hair');
}

async function testFallsBackToNaturalPromptWhenTranslationFailsNormally() {
    const { orchestrator, calls } = await createOrchestrator({
        async translateImagePrompt(input) {
            calls.translations.push(input);
            return { ok: false, status: 'failed', error: { code: 'translation-failed' } };
        },
    });

    const result = await orchestrator.generate({
        naturalPrompt: '星野铃，坐在窗边',
        timeoutMs: 90_000,
        translation: { apiPresetId: 'api-1', imageGenerationPresetId: 'prompt-1' },
    });

    assert.equal(result.ok, true);
    assert.equal(result.prompt, '星野铃，坐在窗边');
    assert.equal('aiOutput' in result, false);
    assert.equal(calls.generations.length, 1);
    assert.equal(calls.generations[0].prompt, '星野铃，坐在窗边');
}

async function testStopsBeforeGenerationWhenTranslationTimesOutOrIsCancelled() {
    for (const status of ['timeout', 'cancelled']) {
        const { orchestrator, calls } = await createOrchestrator({
            async translateImagePrompt(input) {
                calls.translations.push(input);
                return { ok: false, status, error: { code: `translation-${status}` } };
            },
        });

        const result = await orchestrator.generate({
            naturalPrompt: '星野铃，坐在窗边',
            timeoutMs: 90_000,
            translation: { apiPresetId: 'api-1', imageGenerationPresetId: 'prompt-1' },
        });

        assert.equal(result.ok, false);
        assert.equal(result.status, status);
        assert.equal(result.error.code, `translation-${status}`);
        assert.equal(calls.generations.length, 0);
    }
}

async function testStopsBeforeGenerationWhenTranslationConsumesTheTotalTimeout() {
    const { orchestrator, calls } = await createOrchestrator({
        now: createClock(1_000, 1_000, 2_000),
    });

    const result = await orchestrator.generate({
        naturalPrompt: '星野铃，坐在窗边',
        timeoutMs: 1_000,
        translation: { apiPresetId: 'api-1', imageGenerationPresetId: 'prompt-1' },
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 'timeout');
    assert.deepEqual(result.error, {
        code: 'image-generation-timeout',
        message: '图片生成总超时',
    });
    assert.equal(calls.generations.length, 0);
}

async function testNormalizesGeneratorFailureWithoutBindingAnyCallerSpecificState() {
    const { orchestrator } = await createOrchestrator({
        async generateAndStore() {
            throw new Error('provider offline');
        },
    });

    const result = await orchestrator.generate({
        naturalPrompt: '星野铃，坐在窗边',
        timeoutMs: 90_000,
    });

    assert.deepEqual(result, {
        ok: false,
        status: 'failed',
        error: { code: 'image-generation-failed' },
        naturalPrompt: '星野铃，坐在窗边',
        prompt: '星野铃，坐在窗边',
    });
}

async function main() {
    await testGeneratesNaturalPromptWhenTranslationIsNotRequested();
    await testFiltersTranslatedPromptAndPassesOnlyRemainingTotalTimeoutToGeneration();
    await testFallsBackToNaturalPromptWhenTranslationFailsNormally();
    await testStopsBeforeGenerationWhenTranslationTimesOutOrIsCancelled();
    await testStopsBeforeGenerationWhenTranslationConsumesTheTotalTimeout();
    await testNormalizesGeneratorFailureWithoutBindingAnyCallerSpecificState();
    console.log('[image-generation-orchestration] passed');
}

main().catch((error) => {
    console.error('[image-generation-orchestration] failed');
    console.error(error);
    process.exitCode = 1;
});