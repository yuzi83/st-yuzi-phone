import {
    getCurrentCharacterWorldbooks,
    getWorldbook,
} from '../integration/tavern-helper-bridge.js';
import { onWorldInfoUpdated } from '../integration/event-bridge.js';
import {
    getPhoneSettings,
    normalizeWorldbookReadingSelectionSettings,
    normalizeWorldbookReadingBlockedKeywordsSettings,
    savePhoneSetting,
} from '../settings.js';
import { createWorldbookReadingCatalog } from './catalog.js';

function characterWorldbookRefs(binding) {
    const refs = [];
    const seen = new Set();
    const append = (name, sourceRole) => {
        const safeName = String(name ?? '').trim();
        if (!safeName || seen.has(safeName)) return;
        seen.add(safeName);
        refs.push(Object.freeze({ name: safeName, sourceRole }));
    };

    append(binding?.primary, 'primary');
    for (const name of Array.isArray(binding?.additional) ? binding.additional : []) {
        append(name, 'additional');
    }
    return refs;
}

export function createSillyTavernWorldbookReadingCatalog(overrides = {}) {
    const deps = {
        getCurrentCharacterWorldbooks,
        getWorldbook,
        getPhoneSettings,
        savePhoneSetting,
        onWorldInfoUpdated,
        ...overrides,
    };

    return createWorldbookReadingCatalog({
        source: {
            async load(request = {}) {
                const binding = await deps.getCurrentCharacterWorldbooks({
                    strict: true,
                    silent: true,
                    request,
                });
                const refs = characterWorldbookRefs(binding);
                return Promise.all(refs.map(async (ref) => ({
                    ...ref,
                    entries: await deps.getWorldbook(ref.name, {
                        strict: true,
                        silent: true,
                        request,
                    }),
                })));
            },
            async subscribe(listener) {
                return deps.onWorldInfoUpdated(listener);
            },
        },
        preferences: {
            async read() {
                return normalizeWorldbookReadingSelectionSettings(
                    deps.getPhoneSettings()?.worldbookReadingSelection,
                );
            },
            async write(next) {
                const normalized = normalizeWorldbookReadingSelectionSettings(next);
                if (!deps.savePhoneSetting('worldbookReadingSelection', normalized)) {
                    throw new Error('保存世界书读取选择失败');
                }
            },
        },
        blockedKeywords: {
            async read() {
                return normalizeWorldbookReadingBlockedKeywordsSettings(
                    deps.getPhoneSettings()?.worldbookReadingBlockedKeywords,
                );
            },
            async write(next) {
                const normalized = normalizeWorldbookReadingBlockedKeywordsSettings(next);
                if (!deps.savePhoneSetting('worldbookReadingBlockedKeywords', normalized)) {
                    throw new Error('保存世界书自动排除关键词失败');
                }
            },
        },
    });
}

export const sillyTavernWorldbookReadingCatalog = createSillyTavernWorldbookReadingCatalog();
