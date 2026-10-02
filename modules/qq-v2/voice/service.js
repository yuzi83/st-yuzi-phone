import { t } from '../../i18n/index.js';
import { QQ_VOICE_MAX_TEXT_CHARS, QQV2VoiceError } from './fish-client.js';
import { parseQQVoiceText } from './emotion-tags.js';

export const QQ_VOICE_DURATION_TIMEOUT_MS = 4000;

function asText(value, maxLength = 0) {
    const text = String(value ?? '').trim();
    return maxLength > 0 ? text.slice(0, maxLength) : text;
}

/**
 * Decide whose voice reads one message. Precedence: the person's own binding,
 * then the shared role binding remembered by name, then the default voice.
 */
export function resolveQQVoiceId({ settings, personVoiceId = '', roleVoiceId = '', senderType = '' } = {}) {
    const defaultVoiceId = asText(settings?.defaultVoiceId, 256);
    if (senderType === 'self') {
        if (settings?.speakSelf !== true) return '';
        return asText(personVoiceId, 256) || asText(roleVoiceId, 256) || defaultVoiceId;
    }
    return asText(personVoiceId, 256) || asText(roleVoiceId, 256) || defaultVoiceId;
}

/**
 * One place for "what should be read aloud": the transcript the bubble shows and
 * the text the synthesizer receives differ only by the emotion-tag setting.
 */
export function prepareQQVoiceText(content, { emotionTags = true } = {}) {
    const parsed = parseQQVoiceText(content);
    // A line made only of sound-control tags has nothing to read aloud.
    if (!parsed.speakable) throw new QQV2VoiceError(t("语音文本为空"), 'voice_text_empty');
    const text = emotionTags ? parsed.ttsText : parsed.displayText;
    if (Array.from(text).length > QQ_VOICE_MAX_TEXT_CHARS) {
        throw new QQV2VoiceError(t`单条语音不能超过 ${QQ_VOICE_MAX_TEXT_CHARS} 字符`, 'voice_text_too_long');
    }
    return Object.freeze({
        text,
        displayText: parsed.displayText,
        tags: parsed.tags,
        unknownTags: parsed.unknownTags,
        overTagLimit: parsed.overTagLimit,
        speakable: parsed.speakable,
    });
}

/**
 * Audio duration is only known after decoding metadata, so measurement must be
 * injectable: the browser path uses an <audio> element, every other caller gets 0.
 */
export async function measureQQVoiceDurationMs(blob, options = {}) {
    if (!(blob instanceof Blob)) return 0;
    const urlApi = options.urlApi ?? globalThis.URL;
    const AudioCtor = options.AudioCtor ?? globalThis.Audio;
    if (typeof urlApi?.createObjectURL !== 'function' || typeof AudioCtor !== 'function') return 0;
    const url = urlApi.createObjectURL(blob);
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : QQ_VOICE_DURATION_TIMEOUT_MS;
    try {
        return await new Promise((resolve) => {
            const audio = new AudioCtor();
            let settled = false;
            let timer = 0;
            const finish = (value) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                audio.removeAttribute?.('src');
                resolve(value);
            };
            timer = setTimeout(() => finish(0), timeoutMs);
            audio.addEventListener('loadedmetadata', () => {
                const seconds = Number(audio.duration);
                finish(Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : 0);
            }, { once: true });
            audio.addEventListener('error', () => finish(0), { once: true });
            audio.preload = 'metadata';
            audio.src = url;
        });
    } catch {
        return 0;
    } finally {
        try {
            urlApi.revokeObjectURL(url);
        } catch {
            // A revoked or already released URL must not break synthesis.
        }
    }
}

/** Bubble-facing summary; falls back to the character-count estimate until audio exists. */
export function summarizeQQVoiceMessage(content, voice) {
    const parsed = parseQQVoiceText(content);
    const durationMs = Math.max(0, Math.trunc(Number(voice?.durationMs) || 0));
    return Object.freeze({
        hasAudio: Boolean(asText(voice?.assetId, 256)),
        durationMs,
        durationSeconds: durationMs > 0 ? Math.max(1, Math.round(durationMs / 1000)) : 0,
        displayText: parsed.displayText,
        tokens: parsed.tokens,
        tags: parsed.tags,
        unknownTags: parsed.unknownTags,
    });
}
