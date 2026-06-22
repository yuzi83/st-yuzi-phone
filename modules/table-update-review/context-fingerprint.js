import { getCharacterData, getTavernHelper } from '../integration/tavern-helper-bridge.js';

function normalizeText(value) {
    return String(value ?? '').trim();
}

function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value ?? null);
}

function hashText(value) {
    const text = String(value || '');
    let hash = 2166136261;
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function resolveChatKey() {
    const helper = getTavernHelper?.();
    const candidates = [
        helper?.chatId,
        helper?.chat_id,
        helper?.currentChatId,
        helper?.chatName,
        helper?.chat,
        globalThis?.chat_metadata?.main_chat,
    ];
    return normalizeText(candidates.find((candidate) => normalizeText(candidate))) || 'chat:fallback-current';
}

function resolveCharacterKey() {
    const character = getCharacterData('current', true) || {};
    const candidates = [
        character.avatar,
        character.name,
        character.data?.avatar,
        character.data?.name,
        character.data?.extensions?.world,
    ];
    return normalizeText(candidates.find((candidate) => normalizeText(candidate))) || 'character:fallback-current';
}

export function buildTableSchemaSignature(snapshot = {}) {
    const sheets = (Array.isArray(snapshot?.sheets) ? snapshot.sheets : [])
        .map((sheet) => ({
            sheetKey: normalizeText(sheet.sheetKey),
            tableName: normalizeText(sheet.tableName),
            headers: (Array.isArray(sheet.headers) ? sheet.headers : []).map(normalizeText),
            rowIdHeader: normalizeText(sheet.rowIdHeader),
        }))
        .filter((sheet) => sheet.sheetKey)
        .sort((a, b) => a.sheetKey.localeCompare(b.sheetKey));
    return `schema:${hashText(stableStringify({ version: 1, sheets }))}`;
}

export function buildReviewContextFingerprint(snapshot = {}) {
    const schemaSignature = buildTableSchemaSignature(snapshot);
    const payload = {
        version: 1,
        chatKey: resolveChatKey(),
        characterKey: resolveCharacterKey(),
        schemaSignature,
    };
    return {
        ...payload,
        fingerprint: `review:${hashText(stableStringify(payload))}`,
    };
}
