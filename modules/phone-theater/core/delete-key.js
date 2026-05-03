import { normalizeText } from './table-index.js';

export function buildTheaterDeleteKey(role, rowIndex, identity = '') {
    const safeRole = normalizeText(role).replace(/[^a-z0-9_-]/gi, '');
    const safeRowIndex = Number(rowIndex);
    if (!safeRole || !Number.isInteger(safeRowIndex) || safeRowIndex < 0) return '';
    return `${safeRole}:${safeRowIndex}:${encodeURIComponent(normalizeText(identity))}`;
}

export function parseTheaterDeleteKey(deleteKey) {
    const text = normalizeText(deleteKey);
    const match = /^([a-z0-9_-]+):(\d+):(.*)$/i.exec(text);
    if (!match) return null;
    const rowIndex = Number(match[2]);
    if (!Number.isInteger(rowIndex) || rowIndex < 0) return null;
    let identity = '';
    try {
        identity = decodeURIComponent(match[3] || '');
    } catch {
        identity = '';
    }
    return {
        role: match[1],
        rowIndex,
        identity,
    };
}

export function buildDeleteTargets(selectedSet, role) {
    const targets = [];
    selectedSet.forEach((key) => {
        const parsed = parseTheaterDeleteKey(key);
        if (!parsed || parsed.role !== role) return;
        targets.push(parsed);
    });
    return targets;
}

export function hasDeleteTarget(targets, rowIndex, identity) {
    const safeIdentity = normalizeText(identity);
    return targets.some(target => target.rowIndex === rowIndex && normalizeText(target.identity) === safeIdentity);
}
