import { onEvent as defaultOnEvent, triggerEvent as defaultTriggerEvent } from './event-bridge.js';

const REQUEST_EVENT = 'generate-image-request';
const RESPONSE_EVENT = 'generate-image-response';

function createNoopLogger() {
    return Object.freeze({
        debug() {},
        warn() {},
    });
}

export function createChatu8ImageBridge(options = {}) {
    const onEvent = options.onEvent || defaultOnEvent;
    const triggerEvent = options.triggerEvent || defaultTriggerEvent;
    const setTimeoutImpl = options.setTimeoutImpl || globalThis.setTimeout;
    const clearTimeoutImpl = options.clearTimeoutImpl || globalThis.clearTimeout;
    const logger = options.logger || createNoopLogger();
    const pending = new Map();

    let disposed = false;
    let unsubscribe = null;
    let listenerPromise = null;

    function settleRequest(requestId, result) {
        const request = pending.get(requestId);
        if (!request) return false;

        pending.delete(requestId);
        if (request.timeoutId !== null) {
            clearTimeoutImpl(request.timeoutId);
        }
        request.resolve(result);
        return true;
    }

    function handleResponse(response) {
        if (!response || typeof response !== 'object') return;

        const requestId = String(response.id || '');
        if (!pending.has(requestId)) return;

        if (response.success !== true) {
            const cancelled = response.cancelled === true;
            const error = {
                code: cancelled ? 'generation-cancelled' : 'generation-failed',
            };
            if (typeof response.error === 'string' && response.error) {
                error.detail = response.error;
            }

            settleRequest(requestId, {
                ok: false,
                status: cancelled ? 'cancelled' : 'failed',
                requestId,
                error,
            });
            return;
        }

        if (typeof response.imageData !== 'string' || !response.imageData.trim()) {
            settleRequest(requestId, {
                ok: false,
                status: 'invalid-response',
                requestId,
                error: { code: 'missing-image-data' },
            });
            return;
        }

        settleRequest(requestId, {
            ok: true,
            status: 'generated',
            requestId,
            imageData: response.imageData,
            format: typeof response.format === 'string' ? response.format : '',
            prompt: typeof response.prompt === 'string' ? response.prompt : '',
            change: typeof response.change === 'string' ? response.change : '',
            isVideo: response.isVideo === true,
        });
    }

    async function ensureResponseListener() {
        if (unsubscribe) return;
        if (!listenerPromise) {
            listenerPromise = Promise.resolve(onEvent(RESPONSE_EVENT, handleResponse))
                .then((cleanup) => {
                    if (disposed) {
                        if (typeof cleanup === 'function') cleanup();
                        return;
                    }
                    unsubscribe = typeof cleanup === 'function' ? cleanup : () => {};
                })
                .finally(() => {
                    listenerPromise = null;
                });
        }
        await listenerPromise;
    }

    async function requestImage(input = {}, requestOptions = {}) {
        const requestId = String(input.id ?? '').trim();
        if (!requestId) {
            return {
                ok: false,
                status: 'invalid-request',
                requestId: '',
                error: { code: 'invalid-request-id' },
            };
        }
        if (pending.has(requestId)) {
            return {
                ok: false,
                status: 'duplicate-request',
                requestId,
                error: { code: 'duplicate-request-id' },
            };
        }

        if (disposed) {
            return {
                ok: false,
                status: 'disposed',
                requestId,
                error: { code: 'bridge-disposed' },
            };
        }

        try {
            await ensureResponseListener();
        } catch (error) {
            logger.warn('Failed to register image generation response listener.', error);
            return {
                ok: false,
                status: 'unavailable',
                requestId,
                error: { code: 'response-listener-unavailable' },
            };
        }

        if (disposed) {
            return {
                ok: false,
                status: 'disposed',
                requestId,
                error: { code: 'bridge-disposed' },
            };
        }
        if (pending.has(requestId)) {
            return {
                ok: false,
                status: 'duplicate-request',
                requestId,
                error: { code: 'duplicate-request-id' },
            };
        }

        const resultPromise = new Promise((resolve) => {
            const timeoutMs = Number.isFinite(Number(requestOptions.timeoutMs))
                && Number(requestOptions.timeoutMs) >= 0
                ? Number(requestOptions.timeoutMs)
                : 300000;
            const timeoutId = setTimeoutImpl(() => {
                settleRequest(requestId, {
                    ok: false,
                    status: 'timeout',
                    requestId,
                    error: { code: 'generation-timeout' },
                });
            }, timeoutMs);

            pending.set(requestId, {
                resolve,
                timeoutId,
            });
        });

        const payload = {
            id: requestId,
            prompt: typeof input.prompt === 'string' ? input.prompt : '',
            width: null,
            height: null,
        };

        if (typeof input.negative_prompt === 'string' && input.negative_prompt) {
            payload.negative_prompt = input.negative_prompt;
        }
        if (typeof input.change === 'string' && input.change) {
            payload.change = input.change;
        }

        try {
            await triggerEvent(REQUEST_EVENT, payload);
        } catch (error) {
            settleRequest(requestId, {
                ok: false,
                status: 'failed',
                requestId,
                error: { code: 'request-event-failed' },
            });
            logger.warn('Failed to emit image generation request.', error);
        }

        return resultPromise;
    }

    function dispose() {
        if (disposed) return;
        disposed = true;

        if (typeof unsubscribe === 'function') {
            unsubscribe();
            unsubscribe = null;
        }

        for (const [requestId, request] of pending.entries()) {
            if (request.timeoutId !== null) {
                clearTimeoutImpl(request.timeoutId);
            }
            request.resolve({
                ok: false,
                status: 'disposed',
                requestId,
                error: { code: 'bridge-disposed' },
            });
        }
        pending.clear();
    }

    return Object.freeze({
        requestImage,
        dispose,
    });
}
