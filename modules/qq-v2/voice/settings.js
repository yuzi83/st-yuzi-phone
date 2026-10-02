import { t } from '../../i18n/index.js';
import {
    QQ_VOICE_DEFAULT_BASE_URL,
    QQ_VOICE_DEFAULT_MODEL,
    QQ_VOICE_DEFAULT_TIMEOUT_MS,
    QQ_VOICE_MAX_TIMEOUT_MS,
    QQ_VOICE_MIN_TIMEOUT_MS,
    normalizeQQVoiceBaseUrl,
    normalizeQQVoiceModel,
} from './fish-client.js';

export const QQ_VOICE_SETTINGS_KEY = 'voice';
export const QQ_VOICE_API_KEY_ID = 'qq-voice-fish';

const NORMALIZED_DEFAULT_BASE_URL = normalizeQQVoiceBaseUrl(QQ_VOICE_DEFAULT_BASE_URL);

export const QQ_VOICE_SETTINGS_DEFAULTS = Object.freeze({
    enabled: false,
    baseUrl: QQ_VOICE_DEFAULT_BASE_URL,
    model: QQ_VOICE_DEFAULT_MODEL,
    defaultVoiceId: '',
    speakSelf: false,
    emotionTags: true,
    directFetch: true,
    apiKeySaved: false,
    timeoutMs: QQ_VOICE_DEFAULT_TIMEOUT_MS,
});

function asText(value, maxLength = 0) {
    const text = String(value ?? '').trim();
    return maxLength > 0 ? text.slice(0, maxLength) : text;
}

function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeTimeout(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return QQ_VOICE_SETTINGS_DEFAULTS.timeoutMs;
    return Math.min(QQ_VOICE_MAX_TIMEOUT_MS, Math.max(QQ_VOICE_MIN_TIMEOUT_MS, Math.trunc(number)));
}

/** Tolerate a stored value written by any earlier shape; never throw while reading. */
export function normalizeQQVoiceSettings(value) {
    const source = asObject(value);
    let baseUrl = NORMALIZED_DEFAULT_BASE_URL;
    let model = QQ_VOICE_DEFAULT_MODEL;
    try {
        baseUrl = normalizeQQVoiceBaseUrl(source.baseUrl || QQ_VOICE_SETTINGS_DEFAULTS.baseUrl);
        model = normalizeQQVoiceModel(source.model || QQ_VOICE_DEFAULT_MODEL, baseUrl);
    } catch {
        baseUrl = NORMALIZED_DEFAULT_BASE_URL;
        model = QQ_VOICE_DEFAULT_MODEL;
    }
    return {
        enabled: source.enabled === true,
        baseUrl,
        model,
        defaultVoiceId: asText(source.defaultVoiceId, 256),
        speakSelf: source.speakSelf === true,
        emotionTags: source.emotionTags !== false,
        directFetch: source.directFetch !== false,
        apiKeySaved: source.apiKeySaved === true,
        timeoutMs: normalizeTimeout(source.timeoutMs),
    };
}

/** Apply a partial settings patch. Invalid input throws so the settings page can report it. */
export function applyQQVoiceSettingsPatch(current, patch) {
    const source = asObject(patch);
    const next = normalizeQQVoiceSettings(current);
    if (Object.hasOwn(source, 'enabled')) next.enabled = source.enabled === true;
    if (Object.hasOwn(source, 'speakSelf')) next.speakSelf = source.speakSelf === true;
    if (Object.hasOwn(source, 'emotionTags')) next.emotionTags = source.emotionTags !== false;
    if (Object.hasOwn(source, 'directFetch')) next.directFetch = source.directFetch !== false;
    if (Object.hasOwn(source, 'apiKeySaved')) next.apiKeySaved = source.apiKeySaved === true;
    if (Object.hasOwn(source, 'defaultVoiceId')) next.defaultVoiceId = asText(source.defaultVoiceId, 256);
    if (Object.hasOwn(source, 'baseUrl')) {
        try {
            next.baseUrl = normalizeQQVoiceBaseUrl(source.baseUrl);
        } catch (error) {
            throw new RangeError(error?.message || t("语音服务地址无效"));
        }
    }
    if (Object.hasOwn(source, 'model')) {
        try {
            const baseUrl = Object.hasOwn(source, 'baseUrl') ? next.baseUrl : current?.baseUrl || next.baseUrl;
            next.model = normalizeQQVoiceModel(source.model, normalizeQQVoiceBaseUrl(baseUrl));
        } catch (error) {
            throw new RangeError(error?.message || t("语音模型名称无效"));
        }
    }
    if (Object.hasOwn(source, 'timeoutMs')) {
        const number = Number(source.timeoutMs);
        if (!Number.isInteger(number) || number < QQ_VOICE_MIN_TIMEOUT_MS || number > QQ_VOICE_MAX_TIMEOUT_MS) {
            throw new RangeError(t("语音超时时间超出范围"));
        }
        next.timeoutMs = number;
    }
    return next;
}

/** A voice id is only ever sent to the TTS service, never parsed as a URL or path. */
export function normalizeQQVoiceId(value) {
    return asText(value, 256);
}
