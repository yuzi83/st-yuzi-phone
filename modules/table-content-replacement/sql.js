import { isIdentityHeader, validateReplacementRules } from './rules.js';

function quoteIdentifier(value) {
    return `"${String(value ?? '').replace(/"/gu, '""')}"`;
}

function normalizeColumnIndexes(value) {
    if (!Array.isArray(value)) return [];
    return value
        .map(index => Number(index))
        .filter(index => Number.isInteger(index) && index >= 0);
}

function stripIdentifierQuotes(value) {
    const text = String(value ?? '').trim();
    if (text.length < 2) return text;
    const first = text[0];
    const last = text[text.length - 1];
    if ((first === '"' && last === '"')
        || (first === '`' && last === '`')
        || (first === '[' && last === ']')
        || (first === "'" && last === "'")) {
        return text.slice(1, -1).replace(new RegExp(`\\${first}`, 'gu'), first);
    }
    return text;
}

function stripLeadingSqlComments(value) {
    let text = String(value ?? '').trimStart();
    let changed = true;
    while (changed) {
        changed = false;
        if (text.startsWith('--')) {
            const newlineIndex = text.indexOf('\n');
            text = newlineIndex < 0 ? '' : text.slice(newlineIndex + 1).trimStart();
            changed = true;
        } else if (text.startsWith('/*')) {
            const closingIndex = text.indexOf('*/', 2);
            text = closingIndex < 0 ? '' : text.slice(closingIndex + 2).trimStart();
            changed = true;
        }
    }
    return text.trim();
}

function readLeadingIdentifier(value) {
    const text = stripLeadingSqlComments(value);
    if (!text) return '';
    if (['PRIMARY', 'FOREIGN', 'UNIQUE', 'CHECK', 'CONSTRAINT'].some(keyword => (
        new RegExp(`^${keyword}\\b`, 'iu').test(text)
    ))) return '';

    if (['"', '`', '[', "'"].includes(text[0])) {
        const closing = text[0] === '[' ? ']' : text[0];
        const closingIndex = text.indexOf(closing, 1);
        return closingIndex > 0 ? stripIdentifierQuotes(text.slice(0, closingIndex + 1)) : '';
    }
    return stripIdentifierQuotes(text.match(/^[^\s,()]+/u)?.[0] || '');
}

function getCreateTableBody(ddl) {
    const text = String(ddl ?? '');
    const openingIndex = text.search(/\(/u);
    if (openingIndex < 0) return '';

    let depth = 0;
    let quote = '';
    let lineComment = false;
    let blockComment = false;
    for (let index = openingIndex; index < text.length; index += 1) {
        const char = text[index];
        const next = text[index + 1];
        if (lineComment) {
            if (char === '\n') lineComment = false;
            continue;
        }
        if (blockComment) {
            if (char === '*' && next === '/') {
                blockComment = false;
                index += 1;
            }
            continue;
        }
        if (quote) {
            if (char === quote) {
                if (text[index + 1] === quote) index += 1;
                else quote = '';
            } else if (quote === '[' && char === ']') {
                quote = '';
            }
            continue;
        }
        if (char === '-' && next === '-') {
            lineComment = true;
            index += 1;
            continue;
        }
        if (char === '/' && next === '*') {
            blockComment = true;
            index += 1;
            continue;
        }
        if (['"', '`', "'", '['].includes(char)) {
            quote = char;
            continue;
        }
        if (char === '(') depth += 1;
        if (char === ')') {
            depth -= 1;
            if (depth === 0) return text.slice(openingIndex + 1, index);
        }
    }
    return '';
}

function splitColumnDefinitions(body) {
    const definitions = [];
    let current = '';
    let depth = 0;
    let quote = '';
    let lineComment = false;
    let blockComment = false;
    for (let index = 0; index < body.length; index += 1) {
        const char = body[index];
        const next = body[index + 1];
        current += char;
        if (lineComment) {
            if (char === '\n') lineComment = false;
            continue;
        }
        if (blockComment) {
            if (char === '*' && next === '/') {
                current += next;
                index += 1;
                blockComment = false;
            }
            continue;
        }
        if (quote) {
            if (char === quote) {
                if (body[index + 1] === quote) {
                    current += body[index + 1];
                    index += 1;
                } else quote = '';
            } else if (quote === '[' && char === ']') {
                quote = '';
            }
            continue;
        }
        if (char === '-' && next === '-') {
            current += next;
            index += 1;
            lineComment = true;
            continue;
        }
        if (char === '/' && next === '*') {
            current += next;
            index += 1;
            blockComment = true;
            continue;
        }
        if (['"', '`', "'", '['].includes(char)) {
            quote = char;
            continue;
        }
        if (char === '(') depth += 1;
        if (char === ')') depth -= 1;
        if (char === ',' && depth === 0) {
            definitions.push(current.slice(0, -1));
            current = '';
        }
    }
    if (current.trim()) definitions.push(current);
    return definitions;
}

function parseDdlColumnMappings(ddl) {
    const body = getCreateTableBody(ddl);
    if (!body) return [];
    const comments = new Map();
    body.split(/\r?\n/u).forEach((line) => {
        const commentIndex = line.indexOf('--');
        if (commentIndex < 0) return;
        const comment = line.slice(commentIndex + 2).trim().replace(/,$/u, '').trim();
        const name = readLeadingIdentifier(line.slice(0, commentIndex));
        if (name && comment) comments.set(name.toLowerCase(), comment);
    });
    return splitColumnDefinitions(body)
        .map(readLeadingIdentifier)
        .filter(Boolean)
        .map(sqlName => ({ sqlName, comment: comments.get(sqlName.toLowerCase()) || '' }));
}

function resolveSqlColumnName(header, ddlMappings) {
    const normalizedHeader = String(header ?? '').trim();
    if (!normalizedHeader) return '';
    const exact = ddlMappings.find(item => item.sqlName === normalizedHeader);
    if (exact) return exact.sqlName;
    const commentMatches = ddlMappings.filter(item => item.comment === normalizedHeader);
    return commentMatches.length === 1 ? commentMatches[0].sqlName : normalizedHeader;
}

export function buildTableReplacementMutation({
    tableName = '',
    headers = [],
    textColumnIndexes = [],
    ddl = '',
    rules = [],
} = {}) {
    const safeTableName = String(tableName ?? '').trim();
    const safeHeaders = Array.isArray(headers) ? headers : [];
    const ddlMappings = parseDdlColumnMappings(ddl);
    const validationErrors = validateReplacementRules(rules);
    if (!safeTableName || validationErrors.length > 0) return null;

    const seenColumns = new Set();
    const columns = normalizeColumnIndexes(textColumnIndexes)
        .map(index => ({
            index,
            name: resolveSqlColumnName(safeHeaders[index], ddlMappings),
        }))
        .filter(({ index, name }) => {
            if (!name || isIdentityHeader(safeHeaders[index]) || seenColumns.has(name.toLowerCase())) return false;
            seenColumns.add(name.toLowerCase());
            return Number.isInteger(index);
        });
    if (columns.length === 0 || !Array.isArray(rules) || rules.length === 0) return null;

    const setParams = [];
    const setFragments = columns.map(({ name }) => {
        const identifier = quoteIdentifier(name);
        let expression = identifier;
        rules.forEach((rule) => {
            expression = `REPLACE(${expression}, ?, ?)`;
            setParams.push(String(rule.source ?? ''), String(rule.target ?? ''));
        });
        return `${identifier} = CASE WHEN typeof(${identifier}) = 'text' THEN ${expression} ELSE ${identifier} END`;
    });

    const whereParams = [];
    const whereFragments = columns.flatMap(({ name }) => {
        const identifier = quoteIdentifier(name);
        return rules.map((rule) => {
            whereParams.push(String(rule.source ?? ''));
            return `(typeof(${identifier}) = 'text' AND instr(${identifier}, ?) > 0)`;
        });
    });

    return {
        sql: `UPDATE ${quoteIdentifier(safeTableName)} SET ${setFragments.join(', ')} WHERE ${whereFragments.join(' OR ')}`,
        params: [...setParams, ...whereParams],
        columns: columns.map(column => column.name),
    };
}
