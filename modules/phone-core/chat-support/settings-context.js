import { Logger } from '../../error-handler.js';
import { getCharacterData, getCurrentCharacterWorldbooks, getWorldbook } from '../../integration/tavern-helper-bridge.js';
import { getPhoneSettings, savePhoneSettingsPatch } from '../../settings.js';
import {
    defaultSettings,
    PHONE_CHAT_NUMERIC_LIMITS,
    normalizePhoneChatSettings,
} from '../../settings/schema.js';
import { normalizeWorldbookSelection, resolveEntrySelectionState } from '../../settings-app/services/worldbook-selection.js';
import { clampNonNegativeInteger, getDB } from '../db-bridge.js';

const logger = Logger.withScope({ scope: 'phone-core/chat-support/settings-context', feature: 'chat-support' });

export const PHONE_CHAT_DEFAULT_SETTINGS = Object.freeze({ ...defaultSettings.phoneChat });

function normalizePhoneWorldbookSettings(raw) {
    return normalizeWorldbookSelection(raw);
}

function clampPhoneChatInteger(value, fallback, limits = {}) {
    const min = Number.isFinite(Number(limits.min)) ? Number(limits.min) : 0;
    const max = Number.isFinite(Number(limits.max)) ? Number(limits.max) : Number.MAX_SAFE_INTEGER;
    const next = clampNonNegativeInteger(value, fallback);
    return Math.max(min, Math.min(max, next));
}

function dedupeTextList(list) {
    return Array.from(new Set((Array.isArray(list) ? list : [list])
        .map((item) => String(item || '').trim())
        .filter(Boolean)));
}

function formatPhoneChatWorldbookEntries(entries, { maxEntries = PHONE_CHAT_DEFAULT_SETTINGS.worldbookMaxEntries, maxChars = PHONE_CHAT_DEFAULT_SETTINGS.worldbookMaxChars } = {}) {
    const list = Array.isArray(entries) ? entries : [];
    const normalizedMaxEntries = clampPhoneChatInteger(
        maxEntries,
        PHONE_CHAT_DEFAULT_SETTINGS.worldbookMaxEntries,
        PHONE_CHAT_NUMERIC_LIMITS.worldbookMaxEntries,
    );
    const normalizedMaxChars = clampPhoneChatInteger(
        maxChars,
        PHONE_CHAT_DEFAULT_SETTINGS.worldbookMaxChars,
        PHONE_CHAT_NUMERIC_LIMITS.worldbookMaxChars,
    );
    if (list.length === 0 || normalizedMaxEntries === 0 || normalizedMaxChars === 0) return '';

    const picked = list.slice(0, normalizedMaxEntries).map((entry) => {
        const worldbookName = String(entry?.__worldbookName || '').trim();
        const entryName = String(entry?.name || entry?.comment || `条目 ${entry?.uid ?? ''}`).trim();
        const content = String(entry?.content || '').trim();
        const title = worldbookName ? `[${worldbookName}] ${entryName}` : entryName;
        return `- ${title}\n${content}`.trim();
    }).filter(Boolean);

    let text = picked.join('\n\n');
    if (text.length > normalizedMaxChars) {
        text = `${text.slice(0, normalizedMaxChars).trim()}\n\n（世界书内容已截断）`;
    }
    if (list.length > picked.length) {
        text += `\n\n（另有 ${list.length - picked.length} 条世界书条目未展开）`;
    }
    return text;
}

export function getPhoneChatSettings() {
    return normalizePhoneChatSettings(getPhoneSettings()?.phoneChat);
}

export function savePhoneChatSettingsPatch(patch = {}) {
    const current = normalizePhoneChatSettings(getPhoneSettings()?.phoneChat);
    const next = normalizePhoneChatSettings({
        ...current,
        ...(patch && typeof patch === 'object' ? patch : {}),
    });
    savePhoneSettingsPatch({ phoneChat: next });
    return next;
}

export function getPhoneWorldbookSelectionSettings() {
    return normalizePhoneWorldbookSettings(getPhoneSettings()?.worldbookSelection);
}

export function getCurrentCharacterDisplayName(fallback = '对方') {
    const safeFallback = String(fallback || '对方').trim() || '对方';
    try {
        const character = getCharacterData('current', true);
        const name = String(character?.name || character?.data?.name || '').trim();
        return name || safeFallback;
    } catch (error) {
        logger.warn({
            action: 'character-name.get',
            message: '获取当前角色名称失败',
            context: { fallback: safeFallback },
            error,
        });
        return safeFallback;
    }
}

export async function getPhoneStoryContext(maxTurns = 3) {
    const api = getDB();
    if (!api || typeof api.getStoryContext !== 'function') {
        return '';
    }

    const normalizedTurns = clampNonNegativeInteger(maxTurns, PHONE_CHAT_DEFAULT_SETTINGS.storyContextTurns);

    try {
        const result = await Promise.resolve(api.getStoryContext(normalizedTurns));
        return String(result || '').trim();
    } catch (error) {
        logger.warn({
            action: 'story-context.get',
            message: 'getStoryContext 调用失败',
            context: { maxTurns: normalizedTurns },
            error,
        });
        return '';
    }
}

export async function getPhoneChatWorldbookContext(phoneChatSettings = null) {
    const selection = getPhoneWorldbookSelectionSettings();
    const normalizedPhoneChatSettings = normalizePhoneChatSettings(phoneChatSettings || getPhoneSettings()?.phoneChat);
    if (selection.sourceMode === 'off') {
        return {
            mode: 'off',
            worldbooks: [],
            entries: [],
            text: '',
        };
    }

    let worldbooks = [];
    if (selection.sourceMode === 'character_bound') {
        const bound = await getCurrentCharacterWorldbooks();
        worldbooks = dedupeTextList([bound?.primary, ...(Array.isArray(bound?.additional) ? bound.additional : [])]);
    } else if (selection.selectedWorldbook) {
        worldbooks = [selection.selectedWorldbook];
    }

    if (worldbooks.length === 0) {
        return {
            mode: selection.sourceMode,
            worldbooks: [],
            entries: [],
            text: '',
        };
    }

    const mergedEntries = [];
    for (const worldbookName of worldbooks) {
        try {
            const worldbookEntries = await getWorldbook(worldbookName);
            const filteredEntries = (Array.isArray(worldbookEntries) ? worldbookEntries : [])
                .filter((entry) => entry && typeof entry === 'object' && entry.enabled !== false)
                .filter((entry) => {
                    if (selection.sourceMode === 'character_bound') {
                        return resolveEntrySelectionState(selection, worldbookName, entry.uid, selection.sourceMode);
                    }

                    const selectionMap = selection.entries?.[worldbookName] && typeof selection.entries[worldbookName] === 'object'
                        ? selection.entries[worldbookName]
                        : {};
                    const hasStoredSelection = Object.keys(selectionMap).length > 0;
                    return hasStoredSelection ? selectionMap[entry.uid] === true : true;
                })
                .map((entry) => ({
                    ...entry,
                    __worldbookName: worldbookName,
                }));

            mergedEntries.push(...filteredEntries);
        } catch (error) {
            logger.warn({
                action: 'worldbook.read',
                message: '读取世界书失败',
                context: {
                    worldbookName,
                    sourceMode: selection.sourceMode,
                },
                error,
            });
        }
    }

    return {
        mode: selection.sourceMode,
        worldbooks,
        entries: mergedEntries,
        text: formatPhoneChatWorldbookEntries(mergedEntries, {
            maxEntries: normalizedPhoneChatSettings.worldbookMaxEntries,
            maxChars: normalizedPhoneChatSettings.worldbookMaxChars,
        }),
    };
}
