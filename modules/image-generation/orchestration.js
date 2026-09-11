import { filterImagePromptOutput } from './prompt-output-filter.js';

function text(value) {
    return String(value ?? '').trim();
}

function optionalTimeout(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function copyResult(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {
            ok: false,
            status: 'failed',
            error: { code: 'image-generation-failed' },
        };
    }
    return { ...value };
}

function failedResult(status, error, naturalPrompt, prompt) {
    return {
        ok: false,
        status,
        error,
        naturalPrompt,
        prompt,
    };
}

/**
 * Creates the shared post-composition image-generation flow.
 *
 * Callers own their domain-specific work before and after this seam: composing
 * a character prompt, naming a file, and binding a successful file to a QQ
 * message or a table canvas. This flow only translates/filters a completed
 * prompt and asks the injected image service to generate and store it.
 */
export function createImageGenerationOrchestrator(options = {}) {
    const generateAndStore = typeof options.generateAndStore === 'function'
        ? options.generateAndStore
        : null;
    const translateImagePrompt = typeof options.translateImagePrompt === 'function'
        ? options.translateImagePrompt
        : null;
    const filterPromptOutput = typeof options.filterPromptOutput === 'function'
        ? options.filterPromptOutput
        : filterImagePromptOutput;
    const now = typeof options.now === 'function' ? options.now : Date.now;

    async function generate(input = {}) {
        const naturalPrompt = text(input.naturalPrompt ?? input.prompt);
        if (!naturalPrompt) {
            return failedResult(
                'invalid-input',
                { code: 'empty-image-prompt' },
                '',
                '',
            );
        }
        if (!generateAndStore) {
            return failedResult(
                'unavailable',
                { code: 'image-generation-unavailable' },
                naturalPrompt,
                naturalPrompt,
            );
        }

        const timeoutMs = optionalTimeout(input.timeoutMs);
        const translationConfig = input.translation && typeof input.translation === 'object'
            ? input.translation
            : null;
        const deadline = translationConfig && timeoutMs !== null
            ? Number(now()) + timeoutMs
            : null;
        let prompt = naturalPrompt;
        let aiOutput;

        if (translationConfig && translateImagePrompt) {
            let translation;
            try {
                const translationInput = {
                    prompt: naturalPrompt,
                    apiPresetId: text(translationConfig.apiPresetId),
                    imageGenerationPresetId: text(translationConfig.imageGenerationPresetId),
                };
                if (deadline !== null) {
                    translationInput.timeoutMs = Math.max(0, deadline - Number(now()));
                }
                if (input.signal) translationInput.signal = input.signal;
                translation = await translateImagePrompt(translationInput);
            } catch (error) {
                translation = {
                    ok: false,
                    status: 'failed',
                    error: {
                        code: text(error?.code) || 'image-prompt-translation-failed',
                        message: text(error?.message) || '生图提示词转换失败',
                    },
                };
            }

            if (translation?.ok === true) {
                aiOutput = text(filterPromptOutput(translation.content, input.filterSettings || {}));
                prompt = aiOutput;
            } else if (translation?.status === 'timeout' || translation?.status === 'cancelled') {
                return failedResult(
                    translation.status,
                    translation.error || {
                        code: translation.status === 'timeout'
                            ? 'image-prompt-translation-timeout'
                            : 'image-prompt-translation-cancelled',
                    },
                    naturalPrompt,
                    naturalPrompt,
                );
            }

            if (deadline !== null && deadline - Number(now()) <= 0) {
                return failedResult(
                    'timeout',
                    { code: 'image-generation-timeout', message: '图片生成总超时' },
                    naturalPrompt,
                    naturalPrompt,
                );
            }
        }

        const generationInput = {
            prompt,
            width: input.width ?? null,
            height: input.height ?? null,
            negativePrompt: text(input.negativePrompt),
            change: text(input.change),
            ...(timeoutMs !== null
                ? {
                    timeoutMs: deadline === null
                        ? timeoutMs
                        : Math.max(0, deadline - Number(now())),
                }
                : {}),
            ...(text(input.folder) ? { folder: text(input.folder) } : {}),
            ...(text(input.filename) ? { filename: text(input.filename) } : {}),
        };

        let generationResult;
        try {
            generationResult = await generateAndStore(generationInput);
        } catch {
            generationResult = {
                ok: false,
                status: 'failed',
                error: { code: 'image-generation-failed' },
            };
        }

        return {
            ...copyResult(generationResult),
            naturalPrompt,
            prompt,
            ...(aiOutput !== undefined ? { aiOutput } : {}),
        };
    }

    return Object.freeze({ generate });
}