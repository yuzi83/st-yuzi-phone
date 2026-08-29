import { cloneRawTableSnapshot } from './snapshot.js';

const subscribers = new Set();

function cloneField(field = {}) {
    return { ...field };
}

function cloneChange(change = {}) {
    return {
        ...change,
        fields: Array.isArray(change.fields) ? change.fields.map(cloneField) : [],
    };
}

function cloneTable(table = {}) {
    return {
        ...table,
        changes: Array.isArray(table.changes) ? table.changes.map(cloneChange) : [],
    };
}

function normalizeEnvelope(result = {}) {
    return {
        ...result,
        sessionKey: String(result.sessionKey || '').trim(),
        chatKey: String(result.chatKey || '').trim(),
        floorId: Number.isInteger(Number(result.floorId)) ? Number(result.floorId) : -1,
        status: String(result.status || ''),
        tables: Array.isArray(result.tables) ? result.tables : [],
    };
}

function cloneResultForSubscriber(envelope = {}) {
    const cloned = {
        ...envelope,
        tables: envelope.tables.map(cloneTable),
    };
    if (Object.hasOwn(envelope, 'changedSnapshot')) {
        cloned.changedSnapshot = cloneRawTableSnapshot(envelope.changedSnapshot);
    }
    return cloned;
}

export function subscribeTableUpdateReviewResults(callback) {
    if (typeof callback !== 'function') return () => {};
    subscribers.add(callback);
    return () => subscribers.delete(callback);
}

export function publishTableUpdateReviewResult(result) {
    const envelope = normalizeEnvelope(result);
    if (!envelope.sessionKey
        || (envelope.status !== 'ready' && envelope.status !== 'empty')) {
        return false;
    }
    for (const callback of Array.from(subscribers)) {
        try {
            callback(cloneResultForSubscriber(envelope));
        } catch {
            // 单个结果消费者失败不得影响审核 Store 或其他消费者。
        }
    }
    return true;
}
