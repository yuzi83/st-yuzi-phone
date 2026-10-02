/**
 * Fish Audio FAS2 sound-control tags. The catalog mirrors the vocabulary the
 * official Fish-Dialogue worldbook offers the chat model, so one voice line
 * stays portable between the Fish extension and QQ.
 */
export const QQ_VOICE_TAG_LIMIT = 10;
export const QQ_VOICE_TAG_MAX_CHARS = 60;

export const QQ_VOICE_TAG_CATALOG = Object.freeze({
    breath: Object.freeze({
        label: '呼吸',
        tags: Object.freeze(['breathing', 'panting', 'sigh', 'sniffing', 'clears throat']),
    }),
    reaction: Object.freeze({
        label: '声音反应',
        tags: Object.freeze(['laughter', 'chuckling', 'cough', 'crying']),
    }),
    timing: Object.freeze({
        label: '节奏',
        tags: Object.freeze(['slight pause', 'long pause', 'speaking fast', 'speaking slowly']),
    }),
    delivery: Object.freeze({
        label: '语气',
        tags: Object.freeze(['whispering', 'shouting', 'mumbling', 'monotone']),
    }),
    pitch: Object.freeze({
        label: '音高',
        tags: Object.freeze(['pitch up', 'pitch down', 'singing']),
    }),
    emotion: Object.freeze({
        label: '情绪',
        tags: Object.freeze(['happy', 'sad', 'angry', 'scared', 'excited']),
    }),
});

export const QQ_VOICE_KNOWN_TAGS = Object.freeze(
    Object.values(QQ_VOICE_TAG_CATALOG).flatMap((group) => group.tags),
);

const KNOWN_TAG_SET = new Set(QQ_VOICE_KNOWN_TAGS.map((tag) => tag.toLowerCase()));
const TAG_PATTERN = /\[([^[\]]{1,60})\]/gu;

function knownTag(value) {
    return KNOWN_TAG_SET.has(String(value ?? '').trim().toLowerCase());
}

/**
 * Split one voice line into plain text and tag tokens so the transcript can
 * keep the delivery cues in place instead of dropping them.
 */
export function tokenizeQQVoiceText(content) {
    const source = String(content ?? '');
    const tokens = [];
    let cursor = 0;
    for (const match of source.matchAll(TAG_PATTERN)) {
        if (match.index > cursor) {
            tokens.push(Object.freeze({ type: 'text', value: source.slice(cursor, match.index) }));
        }
        const value = match[1].trim();
        tokens.push(Object.freeze({ type: 'tag', value, known: knownTag(value) }));
        cursor = match.index + match[0].length;
    }
    if (cursor < source.length) tokens.push(Object.freeze({ type: 'text', value: source.slice(cursor) }));
    return Object.freeze(tokens);
}

function collapseWhitespace(value) {
    return String(value ?? '')
        .replace(/[ \t\u00a0\u3000]+/gu, ' ')
        .replace(/ ?\n ?/gu, '\n')
        .trim();
}

/**
 * Describe one voice line: what the synthesizer receives, what the bubble shows,
 * and whether any tag breaks the FAS2 contract.
 */
export function parseQQVoiceText(content) {
    const source = String(content ?? '');
    const tokens = tokenizeQQVoiceText(source);
    const tags = tokens.filter((token) => token.type === 'tag');
    const displayText = collapseWhitespace(tokens
        .filter((token) => token.type === 'text')
        .map((token) => token.value)
        .join(''));
    const unknownTags = Object.freeze([...new Set(tags.filter((tag) => !tag.known).map((tag) => tag.value))]);
    return Object.freeze({
        tokens,
        tags: Object.freeze(tags.map((tag) => tag.value)),
        unknownTags,
        tagCount: tags.length,
        overTagLimit: tags.length > QQ_VOICE_TAG_LIMIT,
        hasUnknownTags: unknownTags.length > 0,
        ttsText: source.trim(),
        displayText,
        speakable: displayText.length > 0,
    });
}

/** Prompt-facing summary: the language model must never exceed the tag budget. */
export function describeQQVoiceTagBudget() {
    return { limit: QQ_VOICE_TAG_LIMIT, maxChars: QQ_VOICE_TAG_MAX_CHARS, knownTags: QQ_VOICE_KNOWN_TAGS };
}
