function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function entryEnabled(entry) {
    return entry?.disable !== true && entry?.enabled !== false;
}

function normalizeBlockedKeywords(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value
        .map((keyword) => String(keyword ?? '').trim())
        .filter(Boolean))];
}

function isEntryBlockedByKeyword(entry, blockedKeywords) {
    const comment = String(entry?.comment || entry?.name || '');
    return blockedKeywords.some((keyword) => comment.includes(keyword));
}

function entrySelected(selection, entry, bookName, uid, enabled, blockedKeywords) {
    if (!enabled || isEntryBlockedByKeyword(entry, blockedKeywords)) return false;
    const bookPreferences = asObject(asObject(selection)[bookName]);
    return bookPreferences[uid] !== false;
}

export function createWorldbookReadingCatalog({ source, preferences, blockedKeywords } = {}) {
    return Object.freeze({
        async load(request = {}) {
            const [worldbooks, selection, rawBlockedKeywords] = await Promise.all([
                source.load(request),
                preferences.read(request),
                typeof blockedKeywords?.read === 'function' ? blockedKeywords.read(request) : [],
            ]);
            const normalizedBlockedKeywords = normalizeBlockedKeywords(rawBlockedKeywords);
            const books = [];
            const entries = [];

            for (const worldbook of asArray(worldbooks)) {
                const bookName = String(worldbook?.name ?? '').trim();
                if (!bookName) continue;
                const sourceRole = worldbook?.sourceRole === 'primary' ? 'primary' : 'additional';
                books.push(Object.freeze({ name: bookName, sourceRole }));

                for (const value of asArray(worldbook?.entries)) {
                    const uid = String(value?.uid ?? '').trim();
                    if (!uid) continue;
                    const enabled = entryEnabled(value);
                    entries.push(Object.freeze({
                        ref: Object.freeze({ bookName, uid }),
                        sourceRole,
                        enabled,
                        selected: entrySelected(selection, value, bookName, uid, enabled, normalizedBlockedKeywords),
                        value,
                    }));
                }
            }

            return Object.freeze({
                books: Object.freeze(books),
                entries: Object.freeze(entries),
                issues: Object.freeze([]),
                blockedKeywords: Object.freeze(normalizedBlockedKeywords),
            });
        },
        async setSelected(refs, selected, request = {}) {
            const current = asObject(await preferences.read(request));
            const next = {};

            for (const [bookName, values] of Object.entries(current)) {
                next[bookName] = { ...asObject(values) };
            }

            if (selected === false) {
                for (const ref of asArray(refs)) {
                    const bookName = String(ref?.bookName ?? '').trim();
                    const uid = String(ref?.uid ?? '').trim();
                    if (!bookName || !uid) continue;
                    next[bookName] = { ...asObject(next[bookName]), [uid]: false };
                }
            } else if (selected === true) {
                for (const ref of asArray(refs)) {
                    const bookName = String(ref?.bookName ?? '').trim();
                    const uid = String(ref?.uid ?? '').trim();
                    if (!bookName || !uid || !next[bookName]) continue;
                    delete next[bookName][uid];
                    if (Object.keys(next[bookName]).length === 0) delete next[bookName];
                }
            }

            await preferences.write(next, request);
        },
        async setBlockedKeywords(value, request = {}) {
            if (typeof blockedKeywords?.write !== 'function') {
                throw new Error('保存世界书自动排除关键词失败');
            }
            await blockedKeywords.write(normalizeBlockedKeywords(value), request);
        },
        async subscribe(listener) {
            if (typeof listener !== 'function' || typeof source.subscribe !== 'function') {
                return () => {};
            }
            const dispose = await source.subscribe(listener);
            return typeof dispose === 'function' ? dispose : () => {};
        },
    });
}
