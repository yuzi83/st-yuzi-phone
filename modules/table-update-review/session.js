import { diffSnapshots } from './diff-engine.js';
import { buildReviewContextFingerprint } from './context-fingerprint.js';

function normalizeFloorId(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : -1;
}

function normalizeText(value) {
    return String(value ?? '').trim();
}

function cloneSessionState(sessionState) {
    return {
        ...sessionState,
        activeFloor: sessionState.activeFloor ? { ...sessionState.activeFloor } : null,
    };
}

export function createTableUpdateReviewSession(options = {}) {
    const readSnapshot = typeof options.readSnapshot === 'function' ? options.readSnapshot : () => null;
    let version = 0;
    let sessionState = {
        version,
        sessionId: '',
        contextFingerprint: '',
        schemaSignature: '',
        activeFloor: null,
        preAiSnapshot: null,
        baselineSnapshot: null,
        latestSnapshot: null,
        baselineSource: '',
        lastTableUpdateAt: 0,
        lastComputedAt: 0,
        lastReason: 'created',
        receivingOpen: false,
    };

    const resetReviewSession = (reason = 'reset') => {
        version += 1;
        sessionState = {
            ...sessionState,
            version,
            sessionId: '',
            contextFingerprint: '',
            schemaSignature: '',
            activeFloor: null,
            preAiSnapshot: null,
            baselineSnapshot: null,
            latestSnapshot: null,
            baselineSource: '',
            lastReason: reason,
            receivingOpen: false,
        };
        return cloneSessionState(sessionState);
    };

    const beginPreSnapshot = (reason = 'generation-started') => {
        const snapshot = readSnapshot();
        const context = buildReviewContextFingerprint(snapshot);
        sessionState = {
            ...sessionState,
            preAiSnapshot: snapshot,
            contextFingerprint: context.fingerprint,
            schemaSignature: context.schemaSignature,
            lastReason: reason,
            baselineSource: 'generation-started',
            receivingOpen: true,
        };
        return cloneSessionState(sessionState);
    };

    const openAiFloor = (payload = {}, reason = 'ai-floor') => {
        const floorId = normalizeFloorId(payload.floorId);
        const messageRef = normalizeText(payload.messageRef || payload.messageId || floorId);
        const nextSessionId = `${floorId}:${messageRef || 'message'}`;
        if (sessionState.sessionId === nextSessionId && sessionState.baselineSnapshot) {
            sessionState = { ...sessionState, receivingOpen: true, lastReason: reason };
            return cloneSessionState(sessionState);
        }
        const hasPreAiSnapshot = !!sessionState.preAiSnapshot;
        const baselineSnapshot = hasPreAiSnapshot ? sessionState.preAiSnapshot : readSnapshot();
        const context = buildReviewContextFingerprint(baselineSnapshot);
        version += 1;
        sessionState = {
            version,
            sessionId: nextSessionId,
            contextFingerprint: context.fingerprint,
            schemaSignature: context.schemaSignature,
            activeFloor: {
                floorId,
                floorLabel: floorId >= 0 ? `#${floorId}` : '',
                messageRef,
            },
            preAiSnapshot: null,
            baselineSnapshot,
            latestSnapshot: baselineSnapshot,
            baselineSource: hasPreAiSnapshot ? 'generation-started' : 'ai-floor-fallback',
            lastTableUpdateAt: 0,
            lastComputedAt: 0,
            lastReason: reason,
            receivingOpen: true,
        };
        return cloneSessionState(sessionState);
    };


    const closeReceivingWindow = (reason = 'message-sent') => {
        sessionState = {
            ...sessionState,
            receivingOpen: false,
            lastReason: reason,
        };
        return cloneSessionState(sessionState);
    };

    const applyTableUpdate = (reason = 'table-update') => {
        if (!sessionState.baselineSnapshot || !sessionState.activeFloor || !sessionState.receivingOpen) {
            sessionState = { ...sessionState, lastReason: `skipped:${reason}` };
            return null;
        }

        const latestSnapshot = readSnapshot();
        const context = buildReviewContextFingerprint(latestSnapshot);
        if (sessionState.contextFingerprint && context.fingerprint !== sessionState.contextFingerprint) {
            resetReviewSession('context-changed');
            return null;
        }

        const now = Date.now();
        sessionState = {
            ...sessionState,
            latestSnapshot,
            lastTableUpdateAt: now,
            lastComputedAt: now,
            lastReason: reason,
        };

        return diffSnapshots(sessionState.baselineSnapshot, sessionState.latestSnapshot, {
            floorId: sessionState.activeFloor.floorId,
            floorLabel: sessionState.activeFloor.floorLabel,
            reason,
        });
    };

    const getReviewSessionStatus = () => cloneSessionState(sessionState);

    return {
        beginPreSnapshot,
        openAiFloor,
        closeReceivingWindow,
        applyTableUpdate,
        resetReviewSession,
        getReviewSessionStatus,
    };
}
