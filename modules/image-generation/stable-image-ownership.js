/**
 * Stable generated-image ownership for table content.
 *
 * This module deliberately has no DOM, SillyTavern, file-system, or IndexedDB
 * dependency. The host injects the small `store` seam and remains responsible
 * for resolving table rows before requesting a replacement.
 */

const OWNERSHIP_KEY_VERSION = 'yuzi-stable-image-ownership/v1';

function text(value) {
    return String(value ?? '').normalize('NFKC').trim();
}

function plainText(value) {
    return String(value ?? '').trim();
}

function valuesEqual(left, right) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

function normalizeRule(input) {
    const fields = Array.isArray(input.identityRule)
        ? input.identityRule
        : input.identityFields;
    if (!Array.isArray(fields) || fields.length === 0) return null;

    const normalized = fields.map(text);
    if (normalized.some(value => !value) || new Set(normalized).size !== normalized.length) return null;
    return normalized;
}

function normalizeValues(input, rule) {
    const source = Array.isArray(input.identityValues)
        ? input.identityValues
        : rule.map(field => input.identityValues?.[field]);
    if (!Array.isArray(source) || source.length !== rule.length) return null;
    return source.map(text);
}

function resolveTarget(input) {
    const source = input && typeof input === 'object' ? input : {};
    // Chat IDs are opaque host identities, not user-facing text to normalize.
    const chatScope = plainText(source.chatScope);
    const physicalTable = text(source.physicalTable);
    const canvas = text(source.canvas);
    const identityRule = normalizeRule(source);
    if (!chatScope || !physicalTable || !canvas || !identityRule) {
        return { ok: false, reason: 'target-invalid' };
    }

    const identityValues = normalizeValues(source, identityRule);
    if (!identityValues) return { ok: false, reason: 'target-invalid' };
    if (identityValues.some(value => !value)) return { ok: false, reason: 'identity-empty' };

    const key = JSON.stringify([
        OWNERSHIP_KEY_VERSION,
        chatScope,
        physicalTable,
        identityRule,
        identityValues,
        canvas,
    ]);
    return {
        ok: true,
        target: Object.freeze({
            chatScope,
            physicalTable,
            identityRule: Object.freeze(identityRule),
            identityValues: Object.freeze(identityValues),
            canvas,
            key,
        }),
    };
}

function normalizeCandidate(candidate, identityRule) {
    if (Array.isArray(candidate)) {
        return candidate.length === identityRule.length ? candidate.map(text) : null;
    }
    if (!candidate || typeof candidate !== 'object') return null;
    return normalizeValues(candidate, identityRule);
}

function validateCandidates(target, candidates) {
    if (!Array.isArray(candidates)) return { ok: false, reason: 'identity-candidates-required' };
    const matchingTargets = candidates
        .map(candidate => normalizeCandidate(candidate, target.identityRule))
        .filter(Boolean)
        .filter(candidate => valuesEqual(candidate, target.identityValues));

    if (matchingTargets.length !== 1) {
        return {
            ok: false,
            reason: matchingTargets.length > 1 ? 'identity-duplicate' : 'identity-not-found',
        };
    }
    return { ok: true };
}

function copyRecord(record) {
    if (!record || typeof record !== 'object') return null;
    return {
        chatScope: plainText(record.chatScope),
        physicalTable: text(record.physicalTable),
        identityRule: Array.isArray(record.identityRule) ? [...record.identityRule].map(text) : [],
        identityValues: Array.isArray(record.identityValues) ? [...record.identityValues].map(text) : [],
        canvas: text(record.canvas),
        key: plainText(record.key),
        imagePath: plainText(record.imagePath),
        savedAt: Number(record.savedAt) || 0,
    };
}

function readImagePath(record) {
    return plainText(record?.imagePath);
}

function invalidTargetResult(reason) {
    return { ok: false, status: 'invalid-target', reason };
}

/**
 * Canonicalizes a stable table-image target. It intentionally excludes row
 * position, prompt text, and table snapshots: none are stable identity.
 */
export function createStableImageOwnershipTarget(input = {}) {
    const resolved = resolveTarget(input);
    if (!resolved.ok) {
        throw new TypeError(`无法建立稳定图片归属：${resolved.reason}`);
    }
    return resolved.target;
}

/**
 * Verifies only the requested content's stable identity. Empty or duplicate
 * identities elsewhere do not make this target unavailable.
 */
export function validateStableImageOwnershipTarget(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const resolved = resolveTarget(source.target || source);
    if (!resolved.ok) return { ok: false, reason: resolved.reason };

    const candidates = validateCandidates(resolved.target, source.identityCandidates);
    return candidates.ok
        ? { ok: true, target: resolved.target }
        : { ok: false, reason: candidates.reason };
}

/**
 * Creates a pure service around an injected persistence boundary.
 *
 * `store` must expose async `read(key)` and `write(record)`. Files remain the
 * host's concern; this service never calls a delete operation.
 */
export function createStableImageOwnershipService(options = {}) {
    const store = options.store;
    if (!store || typeof store.read !== 'function' || typeof store.write !== 'function') {
        throw new TypeError('稳定图片归属服务需要具备 read(key) 与 write(record) 的 store');
    }

    const now = typeof options.now === 'function' ? options.now : Date.now;
    const activeTickets = new Map();
    let nextTicketId = 0;

    function ticketIsActive(ticket) {
        return Boolean(ticket && activeTickets.get(ticket.key) === ticket);
    }

    function invalidateTarget(target) {
        const resolved = resolveTarget(target);
        if (resolved.ok) activeTickets.delete(resolved.target.key);
    }

    async function read(targetInput) {
        const resolved = resolveTarget(targetInput);
        if (!resolved.ok) return null;
        const record = copyRecord(await store.read(resolved.target.key));
        return record?.key === resolved.target.key ? record : null;
    }

    async function beginReplacement(input = {}) {
        const validation = validateStableImageOwnershipTarget({
            target: input.target,
            identityCandidates: input.identityCandidates,
        });
        if (!validation.ok) return invalidTargetResult(validation.reason);

        const previous = await read(validation.target);
        const ticket = Object.freeze({
            key: validation.target.key,
            id: `${++nextTicketId}`,
            target: validation.target,
        });
        activeTickets.set(ticket.key, ticket);
        return {
            ok: true,
            status: 'started',
            ticket,
            target: validation.target,
            previousImagePath: readImagePath(previous),
        };
    }

    async function commitReplacement(input = {}) {
        const ticket = input.ticket;
        if (!ticketIsActive(ticket)) {
            return { ok: false, status: 'stale', reason: 'ticket-invalid' };
        }

        const imagePath = plainText(input.imagePath);
        // An explicit clear persists an empty record, so legacy fallbacks cannot resurrect it.
        if (!imagePath && input.clear !== true) {
            return { ok: false, status: 'invalid-result', reason: 'image-path-empty' };
        }
        if (typeof input.recheckOwnership !== 'function') {
            return { ok: false, status: 'invalid-result', reason: 'ownership-recheck-required' };
        }

        let isStillOwned;
        try {
            isStillOwned = await input.recheckOwnership(ticket.target);
        } catch (_error) {
            isStillOwned = false;
        }
        if (isStillOwned !== true) {
            activeTickets.delete(ticket.key);
            return { ok: false, status: 'stale', reason: 'ownership-changed' };
        }
        if (!ticketIsActive(ticket)) {
            return { ok: false, status: 'stale', reason: 'ticket-invalid' };
        }

        try {
            const previous = await read(ticket.target);
            if (!ticketIsActive(ticket)) {
                return { ok: false, status: 'stale', reason: 'ticket-invalid' };
            }
            const record = {
                ...ticket.target,
                imagePath,
                savedAt: Number(now()) || 0,
            };
            await store.write(record);
            activeTickets.delete(ticket.key);
            return {
                ok: true,
                status: 'replaced',
                previousImagePath: readImagePath(previous),
                record: copyRecord(record),
            };
        } catch (_error) {
            return { ok: false, status: 'failed', reason: 'ownership-save-failed' };
        }
    }

    return Object.freeze({
        read,
        beginReplacement,
        commitReplacement,
        invalidate: invalidateTarget,
        invalidateChatScope(chatScope) {
            const scope = plainText(chatScope);
            for (const ticket of activeTickets.values()) {
                if (ticket.target.chatScope === scope) {
                    activeTickets.delete(ticket.key);
                }
            }
        },
    });
}
