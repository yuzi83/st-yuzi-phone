import {
    nowTs,
    sanitizeId,
} from './core.js';

export function ensureUniqueTemplateId(seedId, usedIdSet) {
    const base = sanitizeId(seedId, `user.template.${nowTs().toString(36)}`);
    if (!usedIdSet.has(base)) {
        usedIdSet.add(base);
        return base;
    }

    let idx = 2;
    while (idx < 9999) {
        const nextId = `${base}.${idx}`;
        if (!usedIdSet.has(nextId)) {
            usedIdSet.add(nextId);
            return nextId;
        }
        idx++;
    }

    const fallback = `user.template.${nowTs().toString(36)}`;
    usedIdSet.add(fallback);
    return fallback;
}
