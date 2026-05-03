import {
    clampNumber,
    normalizeString,
} from './core.js';

export function inferSpecialRendererKeyByTableName(tableName) {
    const name = normalizeString(tableName, 80);
    if (!name) return '';

    if (name.includes('消息') || name.includes('聊天')) return 'special_message';

    return '';
}

export function scoreTemplateMatcher(matcher, tableName, headerSet) {
    const m = matcher || {};
    const normalizedTableName = normalizeString(tableName, 80);

    let score = 0;

    if (m.tableNameExact?.some(name => normalizeString(name, 80) === normalizedTableName)) {
        score += 60;
    }

    if (m.tableNameIncludes?.some(keyword => {
        const text = normalizeString(keyword, 40);
        return text && normalizedTableName.includes(text);
    })) {
        score += 22;
    }

    const requiredHeaders = Array.isArray(m.requiredHeaders) ? m.requiredHeaders : [];
    if (requiredHeaders.length > 0) {
        const matchedCount = requiredHeaders.reduce((acc, header) => {
            return acc + (headerSet.has(normalizeString(header, 80)) ? 1 : 0);
        }, 0);

        score += Math.round((matchedCount / requiredHeaders.length) * 34);
        if (matchedCount < requiredHeaders.length) {
            score -= (requiredHeaders.length - matchedCount) * 18;
        }
    }

    const optionalHeaders = Array.isArray(m.optionalHeaders) ? m.optionalHeaders : [];
    optionalHeaders.forEach((header) => {
        if (headerSet.has(normalizeString(header, 80))) {
            score += 4;
        }
    });

    return clampNumber(score, -999, 999, 0);
}

export function normalizeHeadersSet(headers = []) {
    const set = new Set();
    if (!Array.isArray(headers)) return set;

    headers.forEach((header) => {
        const text = normalizeString(header, 80);
        if (text) set.add(text);
    });

    return set;
}
