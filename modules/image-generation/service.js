import { createChatu8ImageBridge } from '../integration/chatu8-image-bridge.js';
import { createImageFileBridge } from '../integration/image-file-bridge.js';

function defaultCreateRequestId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
    }
    return `image-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createNoopLogger() {
    return Object.freeze({
        warn() {},
    });
}

export function createImageGenerationService(options = {}) {
    const generator = options.generator || createChatu8ImageBridge(options.generatorOptions);
    const imageFiles = options.imageFiles || createImageFileBridge(options.imageFileOptions);
    const createRequestId = options.createRequestId || defaultCreateRequestId;
    const now = options.now || Date.now;
    const logger = options.logger || createNoopLogger();

    let disposed = false;

    function createDisposedResult(requestId) {
        return {
            ok: false,
            status: 'disposed',
            requestId,
            error: { code: 'service-disposed' },
        };
    }

    async function compensateStoredImage(path) {
        if (!path) return;
        try {
            await imageFiles.delete({ path });
        } catch (error) {
            logger.warn('Disposed image generation cleanup failed.', error);
        }
    }

    async function generateAndStore(input = {}) {
        const requestId = String(createRequestId());
        const prompt = typeof input.prompt === 'string' ? input.prompt : '';
        const change = typeof input.change === 'string' ? input.change : '';

        if (disposed) {
            return createDisposedResult(requestId);
        }

        const request = {
            id: requestId,
            prompt,
            width: null,
            height: null,
        };
        if (typeof input.negativePrompt === 'string' && input.negativePrompt) {
            request.negative_prompt = input.negativePrompt;
        }
        if (change) {
            request.change = change;
        }

        let generationResult;
        try {
            generationResult = await generator.requestImage(request, {
                timeoutMs: input.timeoutMs,
            });
        } catch (error) {
            logger.warn('Image generation request failed.', error);
            return {
                ok: false,
                status: 'failed',
                requestId,
                error: { code: 'generation-request-failed' },
            };
        }

        if (!generationResult?.ok) {
            return generationResult || {
                ok: false,
                status: 'failed',
                requestId,
                error: { code: 'generation-request-failed' },
            };
        }
        if (disposed) {
            return createDisposedResult(requestId);
        }

        let storageResult;
        try {
            storageResult = await imageFiles.save({
                imageData: generationResult.imageData,
                folder: typeof input.folder === 'string' ? input.folder : '',
                filename: typeof input.filename === 'string' ? input.filename : '',
                format: generationResult.format,
            });
        } catch (error) {
            logger.warn('Generated image storage failed.', error);
            return {
                ok: false,
                status: 'failed',
                requestId,
                error: { code: 'image-storage-failed' },
            };
        }

        if (!storageResult?.ok) {
            return {
                ...(storageResult || {
                    ok: false,
                    status: 'failed',
                    error: { code: 'image-storage-failed' },
                }),
                requestId,
            };
        }
        if (disposed) {
            await compensateStoredImage(storageResult.path);
            return createDisposedResult(requestId);
        }

        return {
            ok: true,
            status: 'stored',
            requestId,
            path: storageResult.path,
            format: storageResult.format,
            prompt,
            change,
            generatedAt: now(),
        };
    }

    async function deleteStoredImage(input = {}) {
        if (disposed) {
            return {
                ok: false,
                status: 'disposed',
                path: typeof input.path === 'string' ? input.path : '',
                error: { code: 'service-disposed' },
            };
        }

        try {
            return await imageFiles.delete({
                path: typeof input.path === 'string' ? input.path : '',
            });
        } catch (error) {
            logger.warn('Stored image deletion failed.', error);
            return {
                ok: false,
                status: 'failed',
                path: typeof input.path === 'string' ? input.path : '',
                error: { code: 'image-delete-failed' },
            };
        }
    }

    function dispose() {
        if (disposed) return;
        disposed = true;
        if (generator && typeof generator.dispose === 'function') {
            generator.dispose();
        }
    }

    return Object.freeze({
        generateAndStore,
        deleteStoredImage,
        dispose,
    });
}
