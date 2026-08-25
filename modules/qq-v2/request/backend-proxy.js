import { normalizeQQV2OpenAIBaseUrl as normalizeApiEndpoint } from '../api-endpoint-policy.js';

const LOCAL_GENERATE_PATH = '/api/backends/chat-completions/generate';
const LOCAL_STATUS_PATH = '/api/backends/chat-completions/status';
const OPENAI_SOURCE = 'openai';

function asText(value, maxLength = 0) {
    const text = String(value ?? '').trim();
    return maxLength > 0 ? text.slice(0, maxLength) : text;
}

function readPositiveInteger(value, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    const integer = Math.floor(number);
    if (integer < 1 || integer > 131072) {
        throw new QQV2BackendError('QQ API maximum output must be between 1 and 131072', 'invalid_max_output');
    }
    return integer;
}

function readTemperature(value, fallback = 1) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    if (number < 0 || number > 2) {
        throw new QQV2BackendError('QQ API temperature must be between 0 and 2', 'invalid_temperature');
    }
    return number;
}

/**
 * SillyTavern's OpenAI backend appends `/chat/completions` itself. Normalize
 * user-friendly endpoint forms to the base URL it expects.
 */
export function normalizeQQV2OpenAIBaseUrl(value) {
    try {
        return normalizeApiEndpoint(asText(value, 2048));
    } catch (error) {
        throw new QQV2BackendError(error?.message || 'API 地址无效', 'invalid_endpoint', error);
    }
}

function requireConnection(input) {
    const apiKey = asText(input?.apiKey, 8192);
    if (!apiKey) throw new QQV2BackendError('Current QQ API preset has no API key', 'api_key_missing');
    return {
        endpoint: normalizeQQV2OpenAIBaseUrl(input?.endpoint),
        apiKey,
    };
}

function requirePreset(input) {
    const connection = requireConnection(input);
    const model = asText(input?.model, 240);
    if (!model) throw new QQV2BackendError('Current QQ API preset has no model', 'model_missing');
    return {
        ...connection,
        model,
        temperature: readTemperature(input?.temperature),
        maxOutput: readPositiveInteger(input?.maxOutput, 4096),
    };
}

function modelEntries(value) {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];
    return [
        ...(Array.isArray(value.data) ? value.data : []),
        ...(Array.isArray(value.models) ? value.models : []),
    ];
}

function parseModelIds(value) {
    return Object.freeze([...new Set(modelEntries(value)
        .map((entry) => asText(typeof entry === 'string' ? entry : entry?.id, 240))
        .filter(Boolean))]);
}

function normalizeMessages(messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
        throw new QQV2BackendError('QQ request requires prompt messages', 'messages_missing');
    }
    return messages.map((message, index) => {
        const role = asText(message?.role, 32);
        const content = typeof message?.content === 'string' ? message.content : '';
        if (!['system', 'user', 'assistant'].includes(role) || !content.trim()) {
            throw new QQV2BackendError(`QQ prompt message ${index + 1} is invalid`, 'invalid_messages');
        }
        return { role, content };
    });
}

function redactText(value, secrets) {
    let text = String(value ?? '');
    for (const secret of secrets) {
        if (secret) text = text.split(secret).join('[REDACTED]');
    }
    return text;
}

function redactValue(value, secrets) {
    if (typeof value === 'string') return redactText(value, secrets);
    if (Array.isArray(value)) return value.map((item) => redactValue(item, secrets));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value)
        .filter(([key]) => !/api[_-]?key|authorization|proxy_password|secret|token/i.test(key))
        .map(([key, item]) => [key, redactValue(item, secrets)]));
}

function safeErrorMessage(error, secrets) {
    return redactText(error?.message || 'QQ backend request failed', secrets).slice(0, 1000);
}

function extractContent(value) {
    if (typeof value === 'string') return value.trim();
    if (!Array.isArray(value)) return '';
    return value.map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part.text === 'string') return part.text;
        return '';
    }).join('').trim();
}

async function readJson(response) {
    if (!response || typeof response.json !== 'function') {
        throw new QQV2BackendError('QQ backend returned an invalid response', 'invalid_response');
    }
    try {
        return await response.json();
    } catch (error) {
        throw new QQV2BackendError('QQ backend returned invalid JSON', 'invalid_response', error);
    }
}

function backendPayload(config, messages) {
    return {
        chat_completion_source: OPENAI_SOURCE,
        reverse_proxy: config.endpoint,
        proxy_password: config.apiKey,
        model: config.model,
        messages,
        temperature: config.temperature,
        max_tokens: config.maxOutput,
        stream: false,
    };
}

function safeDebugPayload(payload) {
    return redactValue(payload, [payload?.proxy_password]);
}

function notifyPromptReady(observer, payload) {
    if (!observer) return;
    const snapshot = {
        model: String(payload.model ?? ''),
        messages: payload.messages.map((message) => ({ ...message })),
    };
    try {
        const result = observer(snapshot);
        if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
        // Observability is best-effort and must not affect the backend request.
    }
}

export class QQV2BackendError extends Error {
    constructor(message, code = 'backend_request_failed', cause = null) {
        super(message, cause ? { cause } : undefined);
        this.name = 'QQV2BackendError';
        this.code = code;
    }
}

/**
 * Sends QQ traffic only to SillyTavern's own backend. The API key exists only
 * in the local POST body consumed by that backend and is stripped from logs.
 */
export function createSillyTavernQQV2Backend(options = {}) {
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
        throw new TypeError('QQ v2 backend needs fetch');
    }
    const getRequestHeaders = typeof options.getRequestHeaders === 'function'
        ? options.getRequestHeaders
        : () => ({});
    const logger = options.logger && typeof options.logger === 'object' ? options.logger : null;
    const onPromptReady = typeof options.onPromptReady === 'function'
        ? options.onPromptReady
        : null;

    const post = async (path, payload, signal) => {
        const requestHeaders = await Promise.resolve(getRequestHeaders());
        const headers = {
            'Content-Type': 'application/json',
            ...(requestHeaders || {}),
        };
        try {
            return await fetchImpl(path, {
                method: 'POST',
                headers,
                cache: 'no-cache',
                body: JSON.stringify(payload),
                signal,
            });
        } catch (error) {
            if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') throw error;
            throw new QQV2BackendError(safeErrorMessage(error, [payload.proxy_password]), 'network_failed', error);
        }
    };

    const logDebug = (event, payload) => {
        logger?.debug?.({ event, request: safeDebugPayload(payload) });
    };

    return Object.freeze({
        async generate(input = {}) {
            const config = requirePreset(input.preset);
            const messages = normalizeMessages(input.messages);
            const payload = backendPayload(config, messages);
            notifyPromptReady(onPromptReady, payload);
            logDebug('qq-v2.backend.generate', payload);
            const response = await post(LOCAL_GENERATE_PATH, payload, input.signal);
            const data = await readJson(response);
            if (!response.ok || data?.error) {
                throw new QQV2BackendError(
                    redactText(data?.error?.message || `QQ backend request failed (HTTP ${response?.status ?? 0})`, [config.apiKey]),
                    'backend_request_failed',
                );
            }
            const choice = Array.isArray(data?.choices) ? data.choices[0] : null;
            const content = extractContent(choice?.message?.content);
            if (!content) throw new QQV2BackendError('QQ backend returned no message content', 'invalid_response');
            return Object.freeze({
                content,
                model: asText(data?.model, 240) || config.model,
                finishReason: asText(choice?.finish_reason, 80),
            });
        },
        async loadModels(input = {}) {
            const config = requireConnection(input.preset);
            const payload = {
                chat_completion_source: OPENAI_SOURCE,
                reverse_proxy: config.endpoint,
                proxy_password: config.apiKey,
            };
            logDebug('qq-v2.backend.load-models', payload);
            const response = await post(LOCAL_STATUS_PATH, payload, input.signal);
            const data = await readJson(response);
            if (!response.ok || data?.error) {
                throw new QQV2BackendError(
                    redactText(data?.error?.message || `QQ backend model request failed (HTTP ${response?.status ?? 0})`, [config.apiKey]),
                    'model_list_failed',
                );
            }
            return parseModelIds(data);
        },
    });
}
