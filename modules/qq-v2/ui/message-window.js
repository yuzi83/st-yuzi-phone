export const EMPTY_MESSAGE_PAGE = Object.freeze({ items: Object.freeze([]), hasMore: false, nextBeforeSequence: null });

export function mergeMessagePage(previous = EMPTY_MESSAGE_PAGE, next = EMPTY_MESSAGE_PAGE, { prepend = false } = {}) {
    const items = prepend ? [...previous.items, ...next.items] : next.items;
    return Object.freeze({
        items: Object.freeze([...new Map(items.map(message => [message.messageId, message])).values()]
            .sort((left, right) => Number(left.sequence) - Number(right.sequence))),
        hasMore: next.hasMore === true,
        nextBeforeSequence: next.nextBeforeSequence ?? null,
    });
}

/** One browsing window per conversation. Reads are serialized; cached rows are never a deletion authority. */
export function createMessageWindow({ query, canRead = () => true, onDeferred = () => {} }) {
    const records = new Map();
    let generation = 0;
    let pending = 0;
    const recordFor = (id) => {
        if (!records.has(id)) records.set(id, { page: EMPTY_MESSAGE_PAGE, expanded: false, tail: Promise.resolve(), older: null });
        return records.get(id);
    };
    const load = (id, { prepend = false, retain = false } = {}) => {
        if (!canRead(id)) { onDeferred(); return Promise.resolve(null); }
        const record = recordFor(id);
        if (prepend && record.older) return record.older;
        const version = generation;
        const current = () => version === generation && records.get(id) === record && canRead(id);
        pending += 1;
        const task = record.tail.then(async () => {
            if (!current()) return null;
            const previous = record.page;
            if (prepend && (!previous.hasMore || !Number.isInteger(previous.nextBeforeSequence))) return previous;
            const fromSequence = previous.items[0]?.sequence;
            const keepWindow = record.expanded || retain;
            let result;
            try {
                result = await query({
                    conversationId: id,
                    ...(prepend ? { beforeSequence: previous.nextBeforeSequence, limit: 50 }
                        : keepWindow && Number.isInteger(fromSequence) ? { fromSequence }
                            : { limit: 50 }),
                });
            } catch (error) {
                if (!current()) return null;
                throw error;
            }
            if (!current()) return null;
            if (!result?.ok || !Array.isArray(result.page?.items)) {
                throw new Error(result?.error?.message || '读取聊天消息失败');
            }
            record.page = mergeMessagePage(previous, result.page, { prepend });
            record.expanded = prepend || keepWindow;
            return record.page;
        });
        void task.then(() => { pending -= 1; }, () => { pending -= 1; });
        record.tail = task.catch(() => {});
        if (prepend) {
            record.older = task;
            const clear = () => { if (record.older === task) record.older = null; };
            void task.then(clear, clear);
        }
        return task;
    };
    return Object.freeze({
        get: id => records.get(id)?.page || EMPTY_MESSAGE_PAGE,
        set: (id, page) => { recordFor(id).page = page; },
        load,
        reset: id => records.delete(id),
        invalidate: () => { generation += 1; return pending > 0; },
        clear: () => { generation += 1; records.clear(); },
    });
}

/** Only scroll keys participate: deleted anchors move to the nearest surviving neighbour. */
export function reconcileMessageScrollAnchor(snapshot, previousKeys, nextKeys) {
    if (snapshot?.registrationKey !== 'private-chat' || snapshot.state?.mode !== 'anchor') return snapshot;
    const surviving = new Set(nextKeys);
    if (surviving.has(snapshot.state.key)) return snapshot;
    const index = previousKeys.indexOf(snapshot.state.key);
    const key = previousKeys.slice(index + 1).find(candidate => surviving.has(candidate))
        || previousKeys.slice(0, Math.max(0, index)).reverse().find(candidate => surviving.has(candidate))
        || nextKeys[0];
    if (!key) return null;
    return { ...snapshot, state: { ...snapshot.state, key } };
}
