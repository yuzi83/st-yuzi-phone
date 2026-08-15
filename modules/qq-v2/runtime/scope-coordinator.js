function asScopeId(value) {
    return String(value ?? '').trim().slice(0, 512);
}

function freezeScope(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError('QQ scope coordinator needs scope metadata');
    }
    const scopeId = asScopeId(value.scopeId);
    if (!scopeId) throw new TypeError('QQ scope coordinator needs scopeId');
    return Object.freeze({ ...value, scopeId });
}

function inactiveScopeError(scopeId) {
    const error = new Error(`QQ scope ${scopeId || '(none)'} is no longer current`);
    error.code = 'scope_inactive';
    return error;
}

function createSessionRecord(initialScope, generation, isCurrentRecord) {
    const controller = new AbortController();
    let scope = initialScope;
    let ready = false;
    let session;

    const record = {
        markReady() {
            if (!controller.signal.aborted) ready = true;
        },
        revoke(reason) {
            ready = false;
            if (!controller.signal.aborted) controller.abort(reason);
        },
    };

    session = Object.freeze({
        get scope() {
            return scope;
        },
        scopeId: initialScope.scopeId,
        generation,
        signal: controller.signal,
        isCurrent() {
            return !controller.signal.aborted && isCurrentRecord(record);
        },
        isReady() {
            return ready && session.isCurrent();
        },
        assertCurrent() {
            if (!session.isCurrent()) throw inactiveScopeError(session.scopeId);
            return session;
        },
    });
    record.session = session;
    return record;
}

export function createQQV2ScopeCoordinator(options = {}) {
    if (typeof options.readScope !== 'function') {
        throw new TypeError('QQ scope coordinator needs readScope');
    }

    const readScope = options.readScope;
    const onTransition = typeof options.onTransition === 'function' ? options.onTransition : async () => {};
    const onReady = typeof options.onReady === 'function' ? options.onReady : async () => {};
    const onUnavailable = typeof options.onUnavailable === 'function' ? options.onUnavailable : async () => {};
    const onDestroy = typeof options.onDestroy === 'function' ? options.onDestroy : () => {};
    let phase = 'idle';
    let generation = 0;
    let currentRecord = null;
    let pendingPreviousSession = null;
    let destroyed = false;
    let hostMutation = Promise.resolve();
    let refreshRequest = 0;

    const isCurrentRecord = (record) => !destroyed && currentRecord === record;
    const isCurrentRefresh = (request) => !destroyed && refreshRequest === request;

    const retireRecord = (record, reason) => {
        if (!record) return null;
        const session = record.session;
        if (!pendingPreviousSession) pendingPreviousSession = session;
        if (currentRecord === record) currentRecord = null;
        record.revoke(reason);
        return session;
    };

    const runHostMutation = (operation) => {
        if (typeof operation !== 'function') {
            throw new TypeError('QQ scope coordinator host mutation must be a function');
        }
        const execute = () => destroyed ? null : operation();
        const task = hostMutation.then(execute, execute);
        hostMutation = task.catch(() => {});
        return task;
    };

    const failTransition = (record, request, error) => {
        if (!isCurrentRefresh(request) || !isCurrentRecord(record) || record.session.signal.aborted) {
            return null;
        }
        retireRecord(record, 'transition-failed');
        phase = 'error';
        throw error;
    };

    const runTransition = async (record, previousSession, request) => {
        phase = 'transitioning';
        try {
            await onTransition(Object.freeze({
                previous: previousSession,
                current: record.session,
            }));
        } catch (error) {
            return failTransition(record, request, error);
        }
        if (!isCurrentRefresh(request) || !isCurrentRecord(record) || record.session.signal.aborted) return null;
        record.markReady();
        phase = 'ready';
        try {
            await onReady(record.session);
        } catch (error) {
            return failTransition(record, request, error);
        }
        if (!isCurrentRefresh(request) || !isCurrentRecord(record) || record.session.signal.aborted) return null;
        return record.session;
    };

    const markUnavailable = async (error) => {
        const previous = currentRecord?.session || pendingPreviousSession || null;
        if (currentRecord) retireRecord(currentRecord, 'host-unavailable');
        pendingPreviousSession = null;
        phase = 'unavailable';
        try {
            await onUnavailable(Object.freeze({ error, previous }));
        } catch {
            // Cleanup observers cannot replace the host error seen by callers.
        }
        throw error;
    };

    const performRefresh = async (request) => {
        if (!isCurrentRefresh(request)) return null;

        let nextScope;
        try {
            nextScope = freezeScope(await readScope());
        } catch (error) {
            if (!isCurrentRefresh(request)) return null;
            if (error?.code === 'host_unavailable') return markUnavailable(error);
            phase = 'error';
            throw error;
        }
        if (!isCurrentRefresh(request)) return null;

        const previousSession = pendingPreviousSession;
        pendingPreviousSession = null;
        const nextRecord = createSessionRecord(nextScope, generation += 1, isCurrentRecord);
        currentRecord = nextRecord;
        return runTransition(nextRecord, previousSession, request);
    };

    const coordinator = Object.freeze({
        refresh() {
            if (destroyed) return runHostMutation(() => null);
            const request = refreshRequest += 1;
            retireRecord(currentRecord, 'refresh-requested');
            phase = 'idle';
            return runHostMutation(() => performRefresh(request));
        },
        runHostMutation,
        capture(expectedScopeId) {
            const session = currentRecord?.session || null;
            if (!session || !session.isCurrent()) return null;
            if (expectedScopeId !== undefined && expectedScopeId !== null
                && asScopeId(expectedScopeId) !== session.scopeId) return null;
            return session;
        },
        getCurrentSession() {
            return currentRecord?.session?.isCurrent() ? currentRecord.session : null;
        },
        getStatus() {
            const session = currentRecord?.session || null;
            return Object.freeze({
                phase,
                scopeId: session?.isCurrent() ? session.scopeId : '',
                generation,
                ready: session?.isReady() === true,
            });
        },
        destroy() {
            if (destroyed) return;
            destroyed = true;
            const previous = currentRecord?.session || pendingPreviousSession || null;
            if (currentRecord) retireRecord(currentRecord, 'destroyed');
            pendingPreviousSession = null;
            phase = 'destroyed';
            try {
                Promise.resolve(onDestroy(Object.freeze({ previous }))).catch(() => {});
            } catch {
                // Destruction is final even if an observer fails synchronously.
            }
        },
    });

    return coordinator;
}
