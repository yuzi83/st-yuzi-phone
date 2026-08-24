import { renderDbQueryTags } from './shujuku-query-template.js';
import { createNumericTemplateStores, renderNumericTemplate } from './shujuku-numeric-template.js';
import { readShujukuTableSnapshot } from './shujuku-cell-template.js';
import { renderConditionalTemplate } from './shujuku-condition-template.js';

function formatQueryResult(result) {
    const columns = Array.isArray(result?.columns) ? result.columns.map(String) : [];
    const values = Array.isArray(result?.values) ? result.values : [];
    if (columns.length === 0 || values.length === 0) return '';
    if (columns.length === 1) {
        return values.map((row) => String(Array.isArray(row) ? (row[0] ?? '') : '')).join('\n');
    }
    return values.map((row) => columns
        .map((column, index) => `${column}: ${Array.isArray(row) ? (row[index] ?? '') : ''}`)
        .join(', '))
        .join('\n');
}

async function renderSqlTags(text, querySql, variables) {
    const pattern = /\{\[sql\s+(["'])([\s\S]*?)\1(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?\s*\]\}/giu;
    let cursor = 0;
    let output = '';

    for (const match of text.matchAll(pattern)) {
        output += text.slice(cursor, match.index);
        let value = '';
        try {
            value = formatQueryResult(await querySql(match[2], []));
        } catch {
            value = '';
        }
        const alias = String(match[3] ?? '').trim();
        if (alias) variables.set(alias, value);
        else output += value;
        cursor = match.index + match[0].length;
    }

    return output + text.slice(cursor);
}

function requiresQueryRuntime(source) {
    if (/\{\[(?:db\.|sql\s)/iu.test(source)) return true;
    if (/<if\s+(?:db|sql)\s*=/iu.test(source)) return true;
    return [...source.matchAll(/<if\s+cond\s*=\s*"([^"]*)"\s*>/giu)]
        .some((match) => /\b(?:db|sql):/iu.test(match[1]));
}

function requiresTableRuntime(source) {
    if (/<(?:calc|max|min)\s+[^>]*(?:expr|values)\s*=\s*"[^"]*\bcell:/iu.test(source)) return true;
    if (/<if\s+cell\s*=/iu.test(source)) return true;
    return [...source.matchAll(/<if\s+cond\s*=\s*"([^"]*)"\s*>/giu)]
        .some((match) => /\bcell:/iu.test(match[1]));
}

export async function renderShujukuTemplate(text, runtime = {}) {
    const source = String(text ?? '');
    if (requiresQueryRuntime(source) && typeof runtime.querySql !== 'function') return source;
    const needsTables = requiresTableRuntime(source);
    if (needsTables && typeof runtime.exportTableAsJson !== 'function') return source;
    const tables = readShujukuTableSnapshot(runtime);
    if (needsTables && tables === null) return source;
    const variables = new Map();
    const numericStores = createNumericTemplateStores();
    const numericRendered = renderNumericTemplate(source, runtime, numericStores, tables);
    const dbRendered = await renderDbQueryTags(numericRendered, runtime, variables);
    const rendered = await renderSqlTags(dbRendered, runtime.querySql, variables);
    const variablesRendered = rendered.replace(/\$v:([^\s<>{}\[\],，。；;]+)/gu, (match, name) => (
        variables.has(name) ? variables.get(name) : match
    ));
    return renderConditionalTemplate(variablesRendered, {
        seedContent: runtime.seedContent,
        plotContent: runtime.plotContent,
        maxNestingDepth: runtime.maxNestingDepth,
        tables,
        variables,
        numericStores,
        runtime,
    });
}
