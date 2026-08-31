function normalizedKey(value) {
    return String(value ?? '').trim();
}

export function createRenderLeaseCoordinator({ acquire, release, cacheLimit = 0 } = {}) {
    if (typeof acquire !== 'function' || typeof release !== 'function') {
        throw new TypeError('Render lease coordinator needs acquire and release functions');
    }

    const normalizedCacheLimit = Math.max(0, Math.trunc(Number(cacheLimit) || 0));
    const entries = new Map();
    const sessions = new Set();
    let mountedKeys = new Set();
    let disposed = false;
    let accessSequence = 0;

    const touch = (entry) => {
        entry.lastUsed = ++accessSequence;
        return entry;
    };

    const retainedKeys = () => {
        const keys = new Set(mountedKeys);
        sessions.forEach((session) => session.usedKeys.forEach((key) => keys.add(key)));
        return keys;
    };

    const releaseUnused = async () => {
        const retained = retainedKeys();
        const idle = [];
        for (const [key, entry] of entries) {
            if (!retained.has(key) && !entry.promise) idle.push([key, entry]);
        }
        idle.sort((left, right) => right[1].lastUsed - left[1].lastUsed);
        const cached = new Set(idle.slice(0, disposed ? 0 : normalizedCacheLimit).map(([key]) => key));
        const releases = [];
        for (const [key, entry] of entries) {
            if (retained.has(key) || cached.has(key) || entry.promise) continue;
            entries.delete(key);
            if (entry.value) releases.push(Promise.resolve(release(entry.value)).catch(() => {}));
        }
        await Promise.all(releases);
    };

    const loadEntry = async (key) => {
        if (disposed) return null;
        let entry = entries.get(key);
        if (entry?.value) return touch(entry).value;
        if (!entry) {
            entry = touch({ value: null, promise: null, invalidated: false, lastUsed: 0 });
            entries.set(key, entry);
        }
        if (!entry.promise) {
            entry.promise = Promise.resolve(acquire(key)).then(async (value) => {
                entry.promise = null;
                if (disposed || entry.invalidated || entries.get(key) !== entry) {
                    if (value) await Promise.resolve(release(value)).catch(() => {});
                    return null;
                }
                if (value) touch(entry).value = value;
                else entries.delete(key);
                void releaseUnused();
                return value || null;
            }, (error) => {
                entry.promise = null;
                entries.delete(key);
                throw error;
            });
        }
        return entry.promise;
    };

    const begin = () => {
        if (disposed) throw new Error('Render lease coordinator is disposed');
        const session = {
            usedKeys: new Set(),
            state: 'open',
            peek(rawKey) {
                const key = normalizedKey(rawKey);
                if (!key || this.state === 'aborted') return null;
                if (this.state === 'committed' && !this.usedKeys.has(key)) return null;
                if (this.state === 'open') this.usedKeys.add(key);
                const entry = entries.get(key);
                return entry?.value ? touch(entry).value : null;
            },
            async load(rawKey) {
                const key = normalizedKey(rawKey);
                if (!key || this.state === 'aborted') return null;
                if (this.state === 'committed' && !this.usedKeys.has(key)) return null;
                if (this.state === 'open') this.usedKeys.add(key);
                return loadEntry(key);
            },
            async commit() {
                if (this.state !== 'open') return;
                this.state = 'committed';
                sessions.delete(this);
                mountedKeys = new Set(this.usedKeys);
                await releaseUnused();
            },
            async abort() {
                if (this.state !== 'open') return;
                this.state = 'aborted';
                sessions.delete(this);
                await releaseUnused();
            },
        };
        sessions.add(session);
        return session;
    };

    return Object.freeze({
        begin,
        async invalidate(rawKeys) {
            const values = typeof rawKeys === 'string' ? [rawKeys] : [...(rawKeys || [])];
            const releases = [];
            values.map(normalizedKey).filter(Boolean).forEach((key) => {
                mountedKeys.delete(key);
                sessions.forEach((session) => session.usedKeys.delete(key));
                const entry = entries.get(key);
                if (!entry) return;
                entry.invalidated = true;
                entries.delete(key);
                if (entry.value) releases.push(Promise.resolve(release(entry.value)).catch(() => {}));
            });
            await Promise.all(releases);
        },
        async dispose() {
            disposed = true;
            sessions.forEach((session) => { session.state = 'aborted'; });
            sessions.clear();
            mountedKeys.clear();
            await releaseUnused();
        },
    });
}
