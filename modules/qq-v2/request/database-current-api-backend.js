import { getDB } from '../../phone-core/db-bridge.js';
import { isQQV2DatabaseCurrentApiPresetId } from '../database-current-api.js';

function asText(value) {
    return String(value ?? '').trim();
}

function currentPresetId(preset) {
    return asText(preset?.id || preset?.presetId);
}

function createDatabaseApiUnavailableError() {
    const error = new Error('数据库当前 API 不可用，请确认神·数据库已加载');
    error.code = 'database_api_unavailable';
    return error;
}

function createDatabaseApiFailedError() {
    const error = new Error('数据库当前 API 调用失败');
    error.code = 'database_api_failed';
    return error;
}

function throwIfAborted(signal) {
    if (!signal?.aborted) return;
    const error = new Error('请求已取消');
    error.name = 'AbortError';
    throw error;
}

/**
 * Backend adapter for the read-only database-current-api virtual preset.
 * The database plugin owns URL, credentials, model and generation settings.
 */
export function createQQV2DatabaseCurrentApiBackend(options = {}) {
    const getDatabaseApi = typeof options.getDatabaseApi === 'function'
        ? options.getDatabaseApi
        : () => {
            try {
                return getDB();
            } catch {
                return null;
            }
        };
    const onPromptReady = typeof options.onPromptReady === 'function'
        ? options.onPromptReady
        : null;

    return Object.freeze({
        async generate(input = {}) {
            if (!isQQV2DatabaseCurrentApiPresetId(currentPresetId(input.preset))) {
                const error = new Error('数据库代理只能处理数据库当前 API 虚拟预设');
                error.code = 'invalid_database_api_preset';
                throw error;
            }
            throwIfAborted(input.signal);
            const databaseApi = getDatabaseApi();
            if (typeof databaseApi?.callAI !== 'function') {
                throw createDatabaseApiUnavailableError();
            }

            try {
                onPromptReady?.({ model: '', messages: input.messages });
            } catch {
                // Prompt observation must never block the database request.
            }
            const content = await Reflect.apply(databaseApi.callAI, databaseApi, [input.messages]);
            throwIfAborted(input.signal);
            if (typeof content !== 'string' || !content.trim()) {
                throw createDatabaseApiFailedError();
            }
            return Object.freeze({
                content: content.trim(),
                model: '',
                finishReason: '',
            });
        },
    });
}

export function createQQV2BackendRouter(options = {}) {
    const primaryBackend = options.primaryBackend;
    const databaseBackend = options.databaseBackend;
    if (!primaryBackend || typeof primaryBackend.generate !== 'function') {
        throw new TypeError('QQ v2 backend router needs a primary backend');
    }
    if (!databaseBackend || typeof databaseBackend.generate !== 'function') {
        throw new TypeError('QQ v2 backend router needs a database backend');
    }

    return Object.freeze({
        generate(input = {}) {
            return isQQV2DatabaseCurrentApiPresetId(currentPresetId(input.preset))
                ? databaseBackend.generate(input)
                : primaryBackend.generate(input);
        },
        loadModels(input = {}) {
            if (typeof primaryBackend.loadModels !== 'function') {
                throw new Error('QQ v2 primary backend does not support model loading');
            }
            return primaryBackend.loadModels(input);
        },
    });
}

