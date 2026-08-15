function normalizedKey(value) {
    return String(value ?? '').trim();
}

export function createViewSnapshotCache({ limit = 4, onEvict = () => {} } = {}) {
    const capacity = Math.max(0, Math.trunc(Number(limit) || 0));
    const snapshots = new Map();

    const evict = (key) => {
        const snapshot = snapshots.get(key);
        if (!snapshot) return;
        snapshots.delete(key);
        onEvict(snapshot);
    };

    return Object.freeze({
        store(rawKey, snapshot) {
            const key = normalizedKey(rawKey);
            if (!key || !snapshot || capacity === 0) return;
            evict(key);
            snapshots.set(key, snapshot);
            while (snapshots.size > capacity) evict(snapshots.keys().next().value);
        },
        take(rawKey) {
            const key = normalizedKey(rawKey);
            if (!key || !snapshots.has(key)) return null;
            const snapshot = snapshots.get(key);
            snapshots.delete(key);
            return snapshot;
        },
        clear() {
            [...snapshots.keys()].forEach(evict);
        },
    });
}
