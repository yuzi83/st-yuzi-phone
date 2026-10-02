import { t } from '../../i18n/index.js';
import { normalizeQQV2OpenAIBaseUrl } from '../api-endpoint-policy.js';

export const QQ_VOICE_DEFAULT_BASE_URL = 'https://api.fish.audio';
export const QQ_VOICE_DEFAULT_MODEL = 's2.1-pro-free';
export const QQ_VOICE_OFFICIAL_HOST = 'api.fish.audio';
export const QQ_VOICE_MODELS = Object.freeze(['s2.1-pro-free', 's2.1-pro', 's2-pro', 's1', 'drama-3-preview']);
export const QQ_VOICE_MAX_TEXT_CHARS = 2000;
export const QQ_VOICE_MAX_AUDIO_BYTES = 25 * 1024 * 1024;
export const QQ_VOICE_DEFAULT_TIMEOUT_MS = 120000;
export const QQ_VOICE_MIN_TIMEOUT_MS = 10000;
export const QQ_VOICE_MAX_TIMEOUT_MS = 600000;

/** Voice synthesis failures carry a stable code so the UI can pick its own wording. */
export class QQV2VoiceError extends Error {
    constructor(message, code = 'voice_request_failed', cause = null) {
        super(message, cause ? { cause } : undefined);
        this.name = 'QQV2VoiceError';
        this.code = code;
    }
}

function asText(value, maxLength = 0) {
    const text = String(value ?? '').trim();
    return maxLength > 0 ? text.slice(0, maxLength) : text;
}

function charLength(value) {
    return Array.from(String(value ?? '')).length;
}

export function normalizeQQVoiceBaseUrl(value) {
    const candidate = asText(value, 2048) || QQ_VOICE_DEFAULT_BASE_URL;
    let normalized;
    try {
        normalized = normalizeQQV2OpenAIBaseUrl(candidate.replace(/\/tts\/?$/iu, ''));
    } catch (error) {
        throw new QQV2VoiceError(error?.message || t("语音服务地址无效"), 'voice_endpoint_invalid', error);
    }
    return normalized;
}

export function normalizeQQVoiceModel(value, baseUrl = '') {
    const model = asText(value, 120) || QQ_VOICE_DEFAULT_MODEL;
    if (/[\r\n]/u.test(model)) throw new QQV2VoiceError(t("语音模型名称无效"), 'voice_model_invalid');
    let host = '';
    try {
        host = new URL(baseUrl || QQ_VOICE_DEFAULT_BASE_URL).hostname.toLowerCase();
    } catch {
        host = '';
    }
    if (host === QQ_VOICE_OFFICIAL_HOST && !QQ_VOICE_MODELS.includes(model)) {
        throw new QQV2VoiceError(t("未知的官方语音模型"), 'voice_model_invalid');
    }
    return model;
}

/**
 * Build the Fish Audio `v1/tts` request. Direct fetch is the default because the
 * official endpoint answers cross-origin; the SillyTavern proxy stays available
 * for hosts that block it.
 */
export function buildQQVoiceSynthesisRequest(input = {}) {
    const baseUrl = normalizeQQVoiceBaseUrl(input.baseUrl);
    const model = normalizeQQVoiceModel(input.model, baseUrl);
    const voiceId = asText(input.voiceId, 256);
    const apiKey = asText(input.apiKey, 8192);
    const text = String(input.text ?? '');
    if (!apiKey || /[\r\n]/u.test(apiKey)) throw new QQV2VoiceError(t("请先填写语音 API Key"), 'voice_api_key_missing');
    if (!voiceId) throw new QQV2VoiceError(t("请先填写默认音色 ID 或为该联系人绑定音色"), 'voice_id_missing');
    if (!text.trim()) throw new QQV2VoiceError(t("语音文本为空"), 'voice_text_empty');
    if (charLength(text) > QQ_VOICE_MAX_TEXT_CHARS) {
        throw new QQV2VoiceError(t`单条语音不能超过 ${QQ_VOICE_MAX_TEXT_CHARS} 字符`, 'voice_text_too_long');
    }

    const endpoint = `${baseUrl.replace(/\/+$/u, '')}/tts`;
    const url = input.directFetch === false ? `/proxy/${endpoint}` : endpoint;
    return Object.freeze({
        url,
        model,
        baseUrl,
        voiceId,
        options: Object.freeze({
            method: 'POST',
            headers: Object.freeze({
                Authorization: `Bearer ${apiKey}`,
                model,
                'Content-Type': 'application/json',
                ...(input.headers && typeof input.headers === 'object' ? input.headers : {}),
            }),
            body: JSON.stringify({ text, reference_id: voiceId, format: 'mp3', latency: 'normal' }),
        }),
    });
}

/** Some hosts forward the body without the upstream content type; read the signature too. */
export function detectQQVoiceAudioMimeType(bytes) {
    if (!bytes || typeof bytes.length !== 'number') return '';
    const slice = (start, end) => String.fromCharCode(...Array.from(bytes.slice(start, end)));
    if (bytes.length >= 10 && slice(0, 3) === 'ID3' && bytes[3] >= 2 && bytes[3] <= 4) return 'audio/mpeg';
    if (bytes.length >= 4
        && bytes[0] === 0xff
        && (bytes[1] & 0xe0) === 0xe0
        && (bytes[1] & 0x18) !== 0x08
        && (bytes[1] & 0x06) !== 0
        && (bytes[2] & 0xf0) !== 0
        && (bytes[2] & 0xf0) !== 0xf0
        && (bytes[2] & 0x0c) !== 0x0c) return 'audio/mpeg';
    if (bytes.length >= 12 && slice(0, 4) === 'RIFF' && slice(8, 12) === 'WAVE') return 'audio/wav';
    if (bytes.length >= 27 && slice(0, 4) === 'OggS' && bytes[4] === 0) return 'audio/ogg';
    if (bytes.length >= 8 && slice(0, 4) === 'fLaC') return 'audio/flac';
    if (bytes.length >= 12 && slice(4, 8) === 'ftyp') return 'audio/mp4';
    return '';
}

function timeoutOf(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return QQ_VOICE_DEFAULT_TIMEOUT_MS;
    return Math.min(QQ_VOICE_MAX_TIMEOUT_MS, Math.max(QQ_VOICE_MIN_TIMEOUT_MS, Math.trunc(number)));
}

async function readAudioBody(response, onProgress) {
    const total = Number(response.headers?.get?.('content-length')) || null;
    if (typeof response.body?.getReader !== 'function') {
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > QQ_VOICE_MAX_AUDIO_BYTES) {
            throw new QQV2VoiceError(t("语音音频超过 25 MB 限制"), 'voice_audio_too_large');
        }
        return new Blob([buffer]);
    }
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            received += value.byteLength;
            if (received > QQ_VOICE_MAX_AUDIO_BYTES) {
                throw new QQV2VoiceError(t("语音音频超过 25 MB 限制"), 'voice_audio_too_large');
            }
            chunks.push(value);
            onProgress?.({ receivedBytes: received, totalBytes: total });
        }
    } finally {
        try {
            await reader.cancel();
        } catch {
            // The stream is already closed or canceled; nothing to release.
        }
    }
    if (!received) throw new QQV2VoiceError(t("语音服务返回空音频"), 'voice_audio_empty');
    return new Blob(chunks);
}

/**
 * Synthesize one segment. The caller owns storage; this function only turns
 * text and a voice id into an audio blob.
 */
export async function synthesizeQQVoice(input = {}) {
    const request = buildQQVoiceSynthesisRequest(input);
    const fetchImpl = input.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') throw new QQV2VoiceError(t("当前环境不支持网络请求"), 'voice_fetch_unavailable');

    const controller = new AbortController();
    const externalSignal = input.signal;
    let timedOut = false;
    const abortFromOutside = () => controller.abort();
    if (externalSignal) {
        if (externalSignal.aborted) throw new QQV2VoiceError(t("语音合成已取消"), 'voice_aborted');
        externalSignal.addEventListener('abort', abortFromOutside, { once: true });
    }
    const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeoutOf(input.timeoutMs));

    try {
        const response = await fetchImpl(request.url, { ...request.options, signal: controller.signal, redirect: 'error' });
        if (!response.ok) {
            if (response.status === 404) {
                throw new QQV2VoiceError(
                    input.directFetch === false
                        ? t("语音接口不存在：请检查服务地址，或确认酒馆已启用 enableCorsProxy")
                        : t("语音接口不存在：请检查服务地址"),
                    'voice_endpoint_missing',
                );
            }
            throw new QQV2VoiceError(t`语音服务返回 HTTP ${response.status}`, 'voice_http_error');
        }
        const received = await readAudioBody(response, input.onProgress);
        const bytes = new Uint8Array(await received.slice(0, 32).arrayBuffer());
        const headerType = asText(response.headers?.get?.('content-type'), 120).split(';')[0].toLowerCase();
        const mimeType = detectQQVoiceAudioMimeType(bytes)
            || (/^audio\//u.test(headerType) ? headerType : '');
        if (!mimeType) {
            throw new QQV2VoiceError(t("返回内容不是音频：请检查服务地址与模型"), 'voice_audio_unrecognized');
        }
        return Object.freeze({
            blob: received.type === mimeType ? received : received.slice(0, received.size, mimeType),
            mimeType,
            byteLength: received.size,
            voiceId: request.voiceId,
            model: request.model,
            baseUrl: request.baseUrl,
        });
    } catch (error) {
        if (error?.name === 'AbortError') {
            if (externalSignal?.aborted) throw new QQV2VoiceError(t("语音合成已取消"), 'voice_aborted', error);
            if (timedOut) throw new QQV2VoiceError(t("语音请求超时"), 'voice_timeout', error);
            throw new QQV2VoiceError(t("语音合成已取消"), 'voice_aborted', error);
        }
        if (error instanceof QQV2VoiceError) throw error;
        if (error instanceof TypeError) {
            throw new QQV2VoiceError(t("网络请求失败：请检查系统代理、VPN 或服务地址"), 'voice_network_failed', error);
        }
        throw new QQV2VoiceError(error?.message || t("语音合成失败"), 'voice_request_failed', error);
    } finally {
        clearTimeout(timer);
        externalSignal?.removeEventListener('abort', abortFromOutside);
    }
}
