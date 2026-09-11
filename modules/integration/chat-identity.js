import { getTavernHelper } from './tavern-helper-bridge.js';
import { getFreshSillyTavernContext } from './context-bridge.js';

function asText(value) {
    return String(value ?? '').trim();
}

function readCharacterAvatar(context, characterId) {
    const characters = context?.characters;
    if (characters && typeof characters === 'object' && !Array.isArray(characters)) {
        return asText(characters[characterId]?.avatar);
    }
    if (!Array.isArray(characters)) return '';
    const byId = characters.find((character) => (
        asText(character?.id) === characterId || asText(character?.avatar) === characterId
    ));
    return asText(byId?.avatar) || asText(characters[Number(characterId)]?.avatar);
}

export function resolveStableChatId(options = {}) {
    // Read the fresh host context, just like QQ; TavernHelper is only a legacy fallback.
    let context;
    try { context = (options.getContext || getFreshSillyTavernContext)(); } catch {}
    try {
        const current = asText(context?.getCurrentChatId?.());
        if (current) return current;
    } catch {}
    for (const key of ['chatId', 'chat_id', 'chat_file']) {
        const value = asText(context?.[key]);
        if (value) return value;
    }
    try {
        const helper = (options.getTavernHelper || getTavernHelper)?.();
        for (const key of ['chatId', 'chat_id', 'currentChatId']) {
            const value = asText(helper?.[key]);
            if (value) return value;
        }
    } catch {}
    return '';
}

export function resolveHostIdentity(context, chatId = '') {
    if (!context || typeof context !== 'object') return null;
    const groupId = asText(context.groupId ?? context.group_id);
    const characterId = asText(context.characterId ?? context.character_id);
    const characterAvatar = readCharacterAvatar(context, characterId);
    const fallbackChatId = asText(chatId || context.chatId || context.chat_id || context.chat_file);
    const hostType = groupId ? 'group' : (characterAvatar || characterId ? 'character' : 'chat');
    const hostId = groupId || characterAvatar || characterId || fallbackChatId;
    return hostId ? Object.freeze({ hostType, hostId }) : null;
}

export function resolveCurrentHostIdentity(options = {}) {
    const getContext = typeof options.getContext === 'function'
        ? options.getContext
        : getFreshSillyTavernContext;
    try {
        return resolveHostIdentity(getContext());
    } catch {
        return null;
    }
}
