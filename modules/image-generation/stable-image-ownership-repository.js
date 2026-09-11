/**
 * Repository adapter for stable table-display image ownership records.
 *
 * Persistence is supplied by the host. This keeps browser IndexedDB, tests,
 * and any future host-backed store replaceable without leaking storage details
 * into image ownership or generation services.
 */

function text(value) {
    return String(value ?? '').normalize('NFKC').trim();
}

function plainText(value) {
    return String(value ?? '').trim();
}

function copyRecord(record) {
    if (!record || typeof record !== 'object') return null;
    return {
        chatScope: plainText(record.chatScope),
        physicalTable: text(record.physicalTable),
        identityRule: Array.isArray(record.identityRule) ? record.identityRule.map(text) : [],
        identityValues: Array.isArray(record.identityValues) ? record.identityValues.map(text) : [],
        canvas: text(record.canvas),
        key: plainText(record.key),
        imagePath: plainText(record.imagePath),
        savedAt: Number(record.savedAt) || 0,
    };
}

/**
 * Wraps an injected durable store as the public ownership repository.
 *
 * The injected store has exactly two async methods: `read(key)` and
 * `write(record)`. A host may implement those with IndexedDB, while tests and
 * alternative hosts can use any equivalent durable backend.
 */
export function createStableImageOwnershipRepository(options = {}) {
    const store = options.store || options.persistentStore;
    if (!store || typeof store.read !== 'function' || typeof store.write !== 'function') {
        throw new TypeError('图片归属仓储需要具备 read(key) 与 write(record) 的持久 store');
    }

    return Object.freeze({
        async read(key) {
            // The serialized key contains an opaque chat ID; NFKC would merge distinct chats.
            const safeKey = plainText(key);
            if (!safeKey) return null;
            return copyRecord(await store.read(safeKey));
        },
        async write(record) {
            const copy = copyRecord(record);
            if (!copy?.key || !copy.chatScope || !copy.physicalTable || !copy.canvas) {
                throw new TypeError('图片归属记录无效');
            }
            await store.write(copy);
            return copyRecord(copy);
        },
    });
}
