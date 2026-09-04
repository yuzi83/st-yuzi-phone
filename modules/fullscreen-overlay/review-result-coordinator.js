const DEFAULT_RETRY_DELAYS_MS = Object.freeze([1000, 2000, 5000]);
const CHRONICLE_TABLE_NAMES = new Set(['纪要表', '纪要']);
const CHRONICLE_TODAY_RELATION_FIELDS = new Set(['与今天的关系', 'today_relation']);

function normalizeText(value) {
    return String(value ?? '').trim();
}

function normalizeRowIndex(value) {
    if (value === null || value === undefined || value === '') return -1;
    const rowIndex = Number(value);
    return Number.isInteger(rowIndex) && rowIndex >= 0 ? rowIndex : -1;
}

function normalizeFields(fields = []) {
    return (Array.isArray(fields) ? fields : [])
        .map(field => ({
            field: normalizeText(field?.field),
            before: String(field?.before ?? ''),
            after: String(field?.after ?? ''),
        }))
        .sort((left, right) => (
            left.field.localeCompare(right.field)
            || left.before.localeCompare(right.before)
            || left.after.localeCompare(right.after)
        ));
}

function normalizeChanges(changes = []) {
    return (Array.isArray(changes) ? changes : [])
        .map(change => ({
            type: normalizeText(change?.type),
            rowKey: normalizeText(change?.rowKey),
            rowId: normalizeText(change?.rowId),
            rowIndex: normalizeRowIndex(change?.rowIndex),
            fields: normalizeFields(change?.fields),
        }))
        .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function buildChangeIdentity(change) {
    const rowKey = normalizeText(change?.rowKey);
    if (rowKey) return `row-key:${rowKey}`;
    const rowId = normalizeText(change?.rowId);
    if (rowId) return `row-id:${rowId}`;
    const rowIndex = normalizeRowIndex(change?.rowIndex);
    if (rowIndex >= 0) return `row-index:${rowIndex}`;
    return `unidentified:${normalizeText(change?.type)}`;
}

function createChangeRecords(changes = []) {
    const occurrenceCounts = new Map();
    return normalizeChanges(changes).map((change) => {
        const baseIdentity = buildChangeIdentity(change);
        const occurrence = occurrenceCounts.get(baseIdentity) ?? 0;
        occurrenceCounts.set(baseIdentity, occurrence + 1);
        return {
            change,
            identity: `${baseIdentity}\u001f${occurrence}`,
            signature: JSON.stringify(change),
        };
    });
}

function buildTableSignature(sessionKey, chatKey, table) {
    const sheetKey = normalizeText(table?.sheetKey);
    return JSON.stringify({
        sessionKey,
        chatKey,
        sheetKey,
        changes: normalizeChanges(table?.changes),
    });
}

function buildResultSemanticSignature(sessionKey, chatKey, tables) {
    return JSON.stringify({
        sessionKey,
        chatKey,
        tables: tables
            .map(({ sheetKey, signature }) => [sheetKey, signature])
            .sort((left, right) => (
                left[0].localeCompare(right[0])
                || left[1].localeCompare(right[1])
            )),
    });
}

function createSignatureMap(tables) {
    return new Map(tables.map(table => [
        table.signatureKey,
        table.signature,
    ]));
}

function signatureMapsEqual(left, right) {
    if (left.size !== right.size) return false;
    return [...left].every(([signatureKey, signature]) => (
        Object.is(right.get(signatureKey), signature)
    ));
}

function normalizeReadyTables(result) {
    if (normalizeText(result?.status) !== 'ready') return [];
    const sessionKey = normalizeText(result?.sessionKey);
    const chatKey = normalizeText(result?.chatKey);
    if (!sessionKey) return [];

    return (Array.isArray(result?.tables) ? result.tables : [])
        .map(table => ({
            table,
            sheetKey: normalizeText(table?.sheetKey),
        }))
        .filter(({ table, sheetKey }) => (
            sheetKey
            && Array.isArray(table?.changes)
            && table.changes.length > 0
        ))
        .map(({ table, sheetKey }) => ({
            table,
            sheetKey,
            changeRecords: createChangeRecords(table.changes),
            signatureKey: `${chatKey}\u001f${sessionKey}\u001f${sheetKey}`,
            signature: buildTableSignature(sessionKey, chatKey, table),
        }));
}

function isPlainSnapshot(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function hasCurrentRowChanges(table) {
    return table.changes.some((change) => {
        const changeType = normalizeText(change?.type);
        return changeType === 'insert' || changeType === 'update';
    });
}

function isChronicleTodayRelationOnlyUpdate(table, change) {
    const fields = Array.isArray(change?.fields) ? change.fields : [];
    return CHRONICLE_TABLE_NAMES.has(normalizeText(table?.tableName))
        && normalizeText(change?.type) === 'update'
        && fields.length > 0
        && fields.every(field => (
            CHRONICLE_TODAY_RELATION_FIELDS.has(normalizeText(field?.field))
        ));
}

function hasConsumableChangedSheet(changedSnapshot, sheetKey) {
    if (!isPlainSnapshot(changedSnapshot)
        || !Object.prototype.hasOwnProperty.call(changedSnapshot, sheetKey)) {
        return false;
    }
    const sheet = changedSnapshot[sheetKey];
    return isPlainSnapshot(sheet)
        && Array.isArray(sheet.content)
        && Array.isArray(sheet.content[0]);
}

function createChangeBaseline(tables) {
    return new Map(tables.map(table => [
        table.signatureKey,
        new Map(table.changeRecords.map(record => [
            record.identity,
            record.signature,
        ])),
    ]));
}

function selectDeltaChanges(table, acceptedChangeBaseline, sameAcceptedContext) {
    if (!sameAcceptedContext) {
        return table.changeRecords.map(record => record.change);
    }
    const acceptedTableChanges = acceptedChangeBaseline.get(table.signatureKey);
    return table.changeRecords
        .filter(record => (
            !acceptedTableChanges
            || !Object.is(acceptedTableChanges.get(record.identity), record.signature)
        ))
        .map(record => record.change);
}

function buildChangedRowsBySheetKey(tables) {
    return Object.fromEntries(tables.map(({ sheetKey, table, deltaChanges }) => {
        const rowIndexes = new Set();
        const rowIds = new Set();
        const changes = Array.isArray(deltaChanges) ? deltaChanges : table.changes;
        const hasDeleteWithoutStableRowId = changes.some(change => (
            normalizeText(change?.type) === 'delete'
            && !normalizeText(change?.rowId)
        ));
        if (hasDeleteWithoutStableRowId) {
            return [sheetKey, {
                rowIndexes: [],
                rowIds: [],
            }];
        }
        changes.forEach((change) => {
            if (isChronicleTodayRelationOnlyUpdate(table, change)) return;
            const changeType = normalizeText(change?.type);
            if (changeType !== 'insert' && changeType !== 'update') {
                return;
            }
            const rowIndex = normalizeRowIndex(change?.rowIndex);
            if (rowIndex >= 0) {
                rowIndexes.add(rowIndex);
            }
            const rowId = normalizeText(change?.rowId);
            if (rowId) {
                rowIds.add(rowId);
            }
        });
        return [sheetKey, {
            rowIndexes: [...rowIndexes].sort((left, right) => left - right),
            rowIds: [...rowIds].sort((left, right) => left.localeCompare(right)),
        }];
    }));
}

function safeDispose(disposer) {
    if (typeof disposer !== 'function') return;
    try {
        disposer();
    } catch {
        // 协调器停止必须完成，即使上游 disposer 已失效。
    }
}

export function createReviewResultCoordinator(deps = {}) {
    const setTimeoutFn = typeof deps.setTimeout === 'function'
        ? deps.setTimeout
        : (...args) => globalThis.setTimeout(...args);
    const clearTimeoutFn = typeof deps.clearTimeout === 'function'
        ? deps.clearTimeout
        : (...args) => globalThis.clearTimeout(...args);

    const acceptedSignatures = new Map();
    const acceptedChangeBaseline = new Map();
    let started = false;
    let suspended = true;
    let suspensionMode = 'initial';
    let initialSuspendObserved = false;
    let generation = 0;
    let unsubscribe = null;
    let pending = null;
    let processingOwner = null;
    let retryTimer = null;
    let retryAttempt = 0;
    let nextRetryDelayMs = null;
    let acceptedSessionKey = '';
    let acceptedChatKey = '';
    let expectedChatKey = '';

    function clearRetryTimer() {
        const timer = retryTimer;
        retryTimer = null;
        nextRetryDelayMs = null;
        if (timer === null) return;
        try {
            clearTimeoutFn(timer);
        } catch {
            // 本地状态已经先行失效，不允许宿主 timer 清理异常恢复旧任务。
        }
    }

    function scheduleRetry() {
        if (!started || suspended || !pending || retryTimer !== null) return false;
        const delayIndex = Math.min(retryAttempt, DEFAULT_RETRY_DELAYS_MS.length - 1);
        const delayMs = DEFAULT_RETRY_DELAYS_MS[delayIndex];
        retryAttempt += 1;
        nextRetryDelayMs = delayMs;
        retryTimer = setTimeoutFn(() => {
            retryTimer = null;
            nextRetryDelayMs = null;
            void processPending();
        }, delayMs);
        return true;
    }

    async function processPending() {
        if (!started || suspended || processingOwner !== null || !pending) return false;
        const current = pending;
        const currentGeneration = generation;
        const taskOwner = {};
        processingOwner = taskOwner;

        try {
            const snapshot = current.changedSnapshot;
            if (!started
                || suspended
                || currentGeneration !== generation
                || pending !== current) {
                return false;
            }

            const accepted = await deps.onStableSnapshot?.(snapshot, {
                changedSheetKeys: current.changedSheetKeys,
                changedRowsBySheetKey: current.changedRowsBySheetKey,
                reviewResult: current.result,
            });
            if (!started
                || suspended
                || currentGeneration !== generation
                || pending !== current) {
                return false;
            }
            if (accepted !== true) {
                scheduleRetry();
                return false;
            }

            acceptedSignatures.clear();
            current.signatures.forEach((signature, signatureKey) => {
                acceptedSignatures.set(signatureKey, signature);
            });
            acceptedChangeBaseline.clear();
            current.changeBaseline.forEach((changes, signatureKey) => {
                acceptedChangeBaseline.set(signatureKey, new Map(changes));
            });
            acceptedSessionKey = current.sessionKey;
            acceptedChatKey = current.chatKey;
            pending = null;
            retryAttempt = 0;
            clearRetryTimer();
            return true;
        } catch {
            if (started
                && !suspended
                && currentGeneration === generation
                && pending === current) {
                scheduleRetry();
            }
            return false;
        } finally {
            if (processingOwner === taskOwner) {
                processingOwner = null;
                if (started
                    && !suspended
                    && pending
                    && pending !== current
                    && retryTimer === null) {
                    void processPending();
                }
            }
        }
    }

    function acceptEmptyResult(sessionKey, chatKey) {
        if (pending?.sessionKey === sessionKey
            && pending?.chatKey === chatKey) {
            generation += 1;
            clearRetryTimer();
            pending = null;
            retryAttempt = 0;
        }
        if (acceptedSessionKey === sessionKey
            && acceptedChatKey === chatKey) {
            acceptedSignatures.clear();
            acceptedChangeBaseline.clear();
            acceptedSessionKey = '';
            acceptedChatKey = '';
        }
        return true;
    }

    function acceptResult(result) {
        if (!started) return false;
        const sessionKey = normalizeText(result?.sessionKey);
        if (!sessionKey) return false;
        const chatKey = normalizeText(result?.chatKey);
        if (suspended
            && suspensionMode !== 'initial'
            && (suspensionMode !== 'chat'
                || !expectedChatKey
                || !chatKey
                || chatKey !== expectedChatKey)) {
            return false;
        }
        const status = normalizeText(result?.status);
        if (status === 'empty') {
            return acceptEmptyResult(sessionKey, chatKey);
        }
        if (status !== 'ready') return false;

        const tables = normalizeReadyTables(result);
        if (tables.length === 0) return false;
        const suppliedChangedSnapshot = result?.changedSnapshot;
        if (tables.some(({ table, sheetKey }) => (
            hasCurrentRowChanges(table)
            && !hasConsumableChangedSheet(suppliedChangedSnapshot, sheetKey)
        ))) {
            return false;
        }
        const changedSnapshot = isPlainSnapshot(suppliedChangedSnapshot)
            ? suppliedChangedSnapshot
            : {};
        const signatures = createSignatureMap(tables);
        const semanticSignature = buildResultSemanticSignature(sessionKey, chatKey, tables);

        if (pending?.semanticSignature === semanticSignature) {
            return false;
        }

        const matchesAcceptedResult = acceptedSessionKey === sessionKey
            && acceptedChatKey === chatKey
            && signatureMapsEqual(acceptedSignatures, signatures);
        if (matchesAcceptedResult) {
            return false;
        }

        const sameAcceptedContext = acceptedSessionKey === sessionKey
            && acceptedChatKey === chatKey;
        const changedTables = sameAcceptedContext
            ? tables.filter(({ signatureKey, signature }) => (
                !Object.is(acceptedSignatures.get(signatureKey), signature)
            ))
            : tables;
        const playbackTables = changedTables.map(table => ({
            ...table,
            deltaChanges: selectDeltaChanges(
                table,
                acceptedChangeBaseline,
                sameAcceptedContext,
            ),
        }));

        generation += 1;
        clearRetryTimer();
        retryAttempt = 0;
        pending = {
            result,
            sessionKey,
            chatKey,
            changedSnapshot,
            changedSheetKeys: changedTables.map(table => table.sheetKey),
            changedRowsBySheetKey: buildChangedRowsBySheetKey(playbackTables),
            signatures,
            changeBaseline: createChangeBaseline(tables),
            semanticSignature,
        };
        if (!suspended) {
            void processPending();
        }
        return true;
    }

    function start() {
        if (started) return true;
        const disposer = deps.subscribeResults?.(acceptResult);
        if (typeof disposer !== 'function') return false;
        unsubscribe = disposer;
        started = true;
        suspended = true;
        suspensionMode = 'initial';
        initialSuspendObserved = false;
        expectedChatKey = '';
        generation += 1;
        return true;
    }

    function stop() {
        started = false;
        suspended = true;
        suspensionMode = 'stopped';
        initialSuspendObserved = false;
        generation += 1;
        clearRetryTimer();
        pending = null;
        processingOwner = null;
        retryAttempt = 0;
        acceptedSignatures.clear();
        acceptedChangeBaseline.clear();
        acceptedSessionKey = '';
        acceptedChatKey = '';
        expectedChatKey = '';
        const disposer = unsubscribe;
        unsubscribe = null;
        safeDispose(disposer);
        return true;
    }

    function suspendForChatChange(chatKey = null) {
        if (!started) return false;
        const requestedChatKey = normalizeText(chatKey);
        const preservingInitialResult = suspensionMode === 'initial'
            && !initialSuspendObserved
            && !requestedChatKey;
        initialSuspendObserved = true;
        suspended = true;
        suspensionMode = preservingInitialResult ? 'initial' : 'chat';
        expectedChatKey = preservingInitialResult ? '' : requestedChatKey;
        generation += 1;
        clearRetryTimer();
        retryAttempt = 0;
        if (!preservingInitialResult) {
            pending = null;
            acceptedSignatures.clear();
            acceptedChangeBaseline.clear();
            acceptedSessionKey = '';
            acceptedChatKey = '';
        }
        return true;
    }

    async function resumeWithBaseline() {
        if (!started) return false;
        suspended = false;
        suspensionMode = 'active';
        expectedChatKey = '';
        generation += 1;
        clearRetryTimer();
        retryAttempt = 0;
        if (pending) {
            void processPending();
        }
        return true;
    }

    function invalidateBaseline() {
        if (!started) return false;
        acceptedSignatures.clear();
        acceptedChangeBaseline.clear();
        acceptedSessionKey = '';
        acceptedChatKey = '';
        return true;
    }

    function getState() {
        return {
            started,
            suspended,
            suspensionMode,
            processing: processingOwner !== null,
            hasPendingResult: Boolean(pending),
            hasRetryTimer: retryTimer !== null,
            retryAttempt,
            nextRetryDelayMs,
            acceptedSignatureCount: acceptedSignatures.size,
            acceptedSessionKey,
            acceptedChatKey,
            expectedChatKey,
        };
    }

    return Object.freeze({
        start,
        stop,
        suspendForChatChange,
        resumeWithBaseline,
        invalidateBaseline,
        getState,
    });
}
