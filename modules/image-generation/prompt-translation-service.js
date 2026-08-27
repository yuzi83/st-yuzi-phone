function asText(value) {
    return String(value ?? '').trim();
}

function createError(code, message) {
    return Object.freeze({
        code: asText(code) || 'image-prompt-translation-failed',
        message: asText(message) || '生图提示词转换失败',
    });
}

function createController() {
    if (typeof globalThis.AbortController !== 'function') return null;
    return new globalThis.AbortController();
}

function linkAbortSignal(source, target, onAbort) {
    if (!source || !target || typeof source.addEventListener !== 'function') return () => {};
    if (source.aborted) {
        onAbort();
        return () => {};
    }
    source.addEventListener('abort', onAbort, { once: true });
    return () => source.removeEventListener('abort', onAbort);
}

export function buildImagePromptTranslationMessages(entries) {
    if (!Array.isArray(entries)) return [];
    return entries
        .filter(entry => entry?.enabled !== false && asText(entry?.content))
        .map(entry => ({
            role: entry?.role,
            content: entry?.content,
        }));
}

/**
 * Sends a deliberately context-free prompt translation request.
 * The service only transports the model response; it never interprets it.
 */
export function createImagePromptTranslationService(options = {}) {
    const backend = options.backend;
    const apiPresetResolver = options.apiPresetResolver;
    const now = typeof options.now === 'function' ? options.now : Date.now;
    const setTimeoutImpl = options.setTimeoutImpl || globalThis.setTimeout;
    const clearTimeoutImpl = options.clearTimeoutImpl || globalThis.clearTimeout;

    if (!backend || typeof backend.generate !== 'function') {
        throw new TypeError('Image prompt translation service needs backend.generate');
    }
    if (typeof apiPresetResolver !== 'function') {
        throw new TypeError('Image prompt translation service needs apiPresetResolver');
    }

    async function translate(input = {}) {
        const prompt = typeof input.prompt === 'string' ? input.prompt : '';
        const apiPresetId = asText(input.apiPresetId);
        const messages = Array.isArray(input.messages) ? input.messages : [];
        if (!apiPresetId) {
            return { ok: false, status: 'skipped', reason: 'api-preset-missing' };
        }
        if (messages.length === 0) {
            return { ok: false, status: 'skipped', reason: 'image-preset-empty' };
        }
        if (!prompt.trim()) {
            return { ok: false, status: 'skipped', reason: 'prompt-empty' };
        }

        let apiPreset;
        try {
            apiPreset = await apiPresetResolver(apiPresetId);
        } catch (error) {
            return {
                ok: false,
                status: 'failed',
                error: createError(error?.code, error?.message),
            };
        }
        if (!apiPreset) {
            return { ok: false, status: 'skipped', reason: 'api-preset-missing' };
        }

        const controller = createController();
        const requestSignal = controller?.signal || input.signal;
        let timedOut = false;
        let timerId = null;
        const startedAt = Number(now());
        const timeoutMs = Number.isFinite(Number(input.timeoutMs))
            ? Math.max(0, Number(input.timeoutMs))
            : 300_000;
        const abortForTimeout = () => {
            timedOut = true;
            try {
                controller?.abort();
            } catch {
                // The backend still receives the timeout result below.
            }
        };
        const unlinkExternal = linkAbortSignal(input.signal, controller, () => {
            try {
                controller.abort(input.signal.reason);
            } catch {
                // AbortController implementations may reject a repeated abort.
            }
        });

        if (controller && Number.isFinite(startedAt)) {
            timerId = setTimeoutImpl(abortForTimeout, timeoutMs);
        }

        try {
            const response = await backend.generate({
                preset: apiPreset,
                messages: [
                    ...messages.map(message => ({
                        role: message.role,
                        content: message.content,
                    })),
                    { role: 'user', content: prompt },
                ],
                signal: requestSignal,
            });
            if (timedOut) {
                return {
                    ok: false,
                    status: 'timeout',
                    error: createError('image-prompt-translation-timeout', '生图提示词转换超时'),
                };
            }
            return {
                ok: true,
                status: 'translated',
                content: response?.content,
            };
        } catch (error) {
            if (timedOut) {
                return {
                    ok: false,
                    status: 'timeout',
                    error: createError('image-prompt-translation-timeout', '生图提示词转换超时'),
                };
            }
            if (input.signal?.aborted) {
                return {
                    ok: false,
                    status: 'cancelled',
                    error: createError('image-prompt-translation-cancelled', '生图提示词转换已取消'),
                };
            }
            return {
                ok: false,
                status: 'failed',
                error: createError(error?.code, error?.message),
            };
        } finally {
            if (timerId !== null) clearTimeoutImpl(timerId);
            unlinkExternal();
        }
    }

    return Object.freeze({ translate });
}
