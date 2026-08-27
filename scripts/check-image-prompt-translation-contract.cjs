const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    return import(`${href}?contract=${Date.now()}-${Math.random()}`);
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

async function testTranslationMessageAdapterFiltersDisabledEntriesAndDropsControlFields() {
    const { buildImagePromptTranslationMessages } = await importModule(
        'modules/image-generation/prompt-translation-service.js',
    );

    assert.deepEqual(
        buildImagePromptTranslationMessages([
            {
                id: 'entry-1',
                name: '规则',
                role: 'system',
                content: '保留',
                enabled: true,
                triggerMode: 'always',
                triggerWords: '不会进入消息',
                andTriggerWords: '也不会进入消息',
            },
            {
                id: 'entry-2',
                name: '禁用',
                role: 'assistant',
                content: '丢弃',
                enabled: false,
            },
        ]),
        [{ role: 'system', content: '保留' }],
    );
}

async function testTranslationMessageAdapterTreatsBlankEnabledEntriesAsEmpty() {
    const { buildImagePromptTranslationMessages } = await importModule(
        'modules/image-generation/prompt-translation-service.js',
    );

    assert.deepEqual(
        buildImagePromptTranslationMessages([
            { role: 'system', content: '   ', enabled: true },
            { role: 'assistant', content: '', enabled: true },
            { role: 'user', content: '有效规则', enabled: true },
        ]),
        [{ role: 'user', content: '有效规则' }],
    );
}

async function testTranslationAppendsPromptWithoutInterpretingOutput() {
    const { createImagePromptTranslationService } = await importModule(
        'modules/image-generation/prompt-translation-service.js',
    );
    const calls = [];
    const service = createImagePromptTranslationService({
        apiPresetResolver: async (id) => ({ id, apiKey: 'secret', model: 'translator' }),
        backend: {
            async generate(input) {
                calls.push(input);
                return {
                    content: '模型想返回什么都原样保留\n<not-a-tag>',
                    model: 'translator',
                };
            },
        },
    });

    const result = await service.translate({
        prompt: '小玉穿着白色连衣裙站在窗边',
        apiPresetId: 'api-1',
        messages: [{ role: 'system', content: '请转换' }],
        timeoutMs: 10_000,
    });

    assert.equal(calls.length, 1);
    assert.deepEqual({
        preset: calls[0].preset,
        messages: calls[0].messages,
    }, {
        preset: { id: 'api-1', apiKey: 'secret', model: 'translator' },
        messages: [
            { role: 'system', content: '请转换' },
            { role: 'user', content: '小玉穿着白色连衣裙站在窗边' },
        ],
    });
    assert.equal(typeof calls[0].signal?.aborted, 'boolean');
    assert.deepEqual(result, {
        ok: true,
        status: 'translated',
        content: '模型想返回什么都原样保留\n<not-a-tag>',
    });
}

async function testTranslationSkipsWhenApiOrEffectivePresetIsMissing() {
    const { createImagePromptTranslationService } = await importModule(
        'modules/image-generation/prompt-translation-service.js',
    );
    let calls = 0;
    const service = createImagePromptTranslationService({
        apiPresetResolver: async () => null,
        backend: {
            async generate() {
                calls += 1;
                return { content: 'never' };
            },
        },
    });

    assert.deepEqual(
        await service.translate({
            prompt: '中文',
            apiPresetId: '',
            messages: [{ role: 'system', content: '规则' }],
        }),
        { ok: false, status: 'skipped', reason: 'api-preset-missing' },
    );
    assert.deepEqual(
        await service.translate({
            prompt: '中文',
            apiPresetId: 'api-1',
            messages: [],
        }),
        { ok: false, status: 'skipped', reason: 'image-preset-empty' },
    );
    assert.equal(calls, 0);
}

async function testTranslationFailureIsStructuredForCallerFallback() {
    const { createImagePromptTranslationService } = await importModule(
        'modules/image-generation/prompt-translation-service.js',
    );
    const service = createImagePromptTranslationService({
        apiPresetResolver: async () => ({ id: 'api-1' }),
        backend: {
            async generate() {
                throw Object.assign(new Error('network down'), { code: 'network_failed' });
            },
        },
    });

    const result = await service.translate({
        prompt: '中文',
        apiPresetId: 'api-1',
        messages: [{ role: 'system', content: '规则' }],
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 'failed');
    assert.equal(result.error.code, 'network_failed');
}

async function testTranslationTimeoutAbortsTheBackendAndIgnoresLateOutput() {
    const { createImagePromptTranslationService } = await importModule(
        'modules/image-generation/prompt-translation-service.js',
    );
    const backendResult = deferred();
    let timerCallback = null;
    let timerDelay = null;
    let requestSignal = null;
    const service = createImagePromptTranslationService({
        apiPresetResolver: async () => ({
            id: 'api-timeout',
            apiKey: 'secret',
            model: 'translator',
        }),
        backend: {
            async generate(input) {
                requestSignal = input.signal;
                return backendResult.promise;
            },
        },
        setTimeoutImpl(callback, delay) {
            timerCallback = callback;
            timerDelay = delay;
            return 1;
        },
        clearTimeoutImpl() {},
    });

    const resultPromise = service.translate({
        prompt: '中文描述',
        apiPresetId: 'api-timeout',
        messages: [{ role: 'system', content: '只转换' }],
        timeoutMs: 1234,
    });
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(timerDelay, 1234);
    assert.equal(typeof timerCallback, 'function');
    assert.equal(requestSignal?.aborted, false);

    timerCallback();
    assert.equal(requestSignal.aborted, true);
    backendResult.resolve({ content: '迟到的任意输出' });

    assert.deepEqual(await resultPromise, {
        ok: false,
        status: 'timeout',
        error: {
            code: 'image-prompt-translation-timeout',
            message: '生图提示词转换超时',
        },
    });
}

async function testTranslationCancellationUsesTheCallerSignal() {
    const { createImagePromptTranslationService } = await importModule(
        'modules/image-generation/prompt-translation-service.js',
    );
    const controller = new AbortController();
    let requestSignal = null;
    const service = createImagePromptTranslationService({
        apiPresetResolver: async () => ({
            id: 'api-cancel',
            apiKey: 'secret',
            model: 'translator',
        }),
        backend: {
            async generate(input) {
                requestSignal = input.signal;
                return new Promise((resolve, reject) => {
                    input.signal.addEventListener('abort', () => {
                        const error = new Error('请求已取消');
                        error.name = 'AbortError';
                        reject(error);
                    }, { once: true });
                });
            },
        },
        setTimeoutImpl() {
            return 1;
        },
        clearTimeoutImpl() {},
    });

    const resultPromise = service.translate({
        prompt: '中文描述',
        apiPresetId: 'api-cancel',
        messages: [{ role: 'system', content: '只转换' }],
        signal: controller.signal,
    });
    await new Promise(resolve => setImmediate(resolve));

    controller.abort('scope-changed');
    assert.equal(requestSignal.aborted, true);

    assert.deepEqual(await resultPromise, {
        ok: false,
        status: 'cancelled',
        error: {
            code: 'image-prompt-translation-cancelled',
            message: '生图提示词转换已取消',
        },
    });
}

async function main() {
    await testTranslationMessageAdapterFiltersDisabledEntriesAndDropsControlFields();
    await testTranslationMessageAdapterTreatsBlankEnabledEntriesAsEmpty();
    await testTranslationAppendsPromptWithoutInterpretingOutput();
    await testTranslationSkipsWhenApiOrEffectivePresetIsMissing();
    await testTranslationFailureIsStructuredForCallerFallback();
    await testTranslationTimeoutAbortsTheBackendAndIgnoresLateOutput();
    await testTranslationCancellationUsesTheCallerSignal();
    console.log('[image-prompt-translation-contract] 检查通过');
}

main().catch((error) => {
    console.error('[image-prompt-translation-contract] 检查失败：');
    console.error(error);
    process.exitCode = 1;
});
