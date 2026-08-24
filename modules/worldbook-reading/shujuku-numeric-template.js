function readAttribute(attributes, name) {
    const match = String(attributes ?? '').match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'iu'));
    return match ? match[1] : null;
}

function replaceStoredReference(text, prefix, store) {
    const pattern = new RegExp(`\\$${prefix}:([A-Za-z_][A-Za-z0-9_]*)`, 'giu');
    return text.replace(pattern, (match, name) => (
        store.has(name) ? String(store.get(name)) : match
    ));
}

function tokenizeArithmetic(expression) {
    const tokens = [];
    let cursor = 0;
    while (cursor < expression.length) {
        const rest = expression.slice(cursor);
        const whitespace = rest.match(/^\s+/u);
        if (whitespace) {
            cursor += whitespace[0].length;
            continue;
        }
        const number = rest.match(/^(?:\d+\.?\d*|\.\d+)/u);
        if (number) {
            tokens.push({ type: 'number', value: Number(number[0]) });
            cursor += number[0].length;
            continue;
        }
        const operator = rest[0];
        if ('+-*/%()'.includes(operator)) {
            tokens.push({ type: operator, value: operator });
            cursor += 1;
            continue;
        }
        throw new Error('invalid arithmetic token');
    }
    return tokens;
}

function evaluateArithmetic(expression) {
    const tokens = tokenizeArithmetic(expression);
    let cursor = 0;

    function parsePrimary() {
        const token = tokens[cursor];
        if (!token) throw new Error('missing operand');
        if (token.type === '+' || token.type === '-') {
            cursor += 1;
            const value = parsePrimary();
            return token.type === '-' ? -value : value;
        }
        if (token.type === 'number') {
            cursor += 1;
            return token.value;
        }
        if (token.type === '(') {
            cursor += 1;
            const value = parseSum();
            if (tokens[cursor]?.type !== ')') throw new Error('unclosed parenthesis');
            cursor += 1;
            return value;
        }
        throw new Error('invalid operand');
    }

    function parseProduct() {
        let value = parsePrimary();
        while (['*', '/', '%'].includes(tokens[cursor]?.type)) {
            const operator = tokens[cursor].type;
            cursor += 1;
            const right = parsePrimary();
            if ((operator === '/' || operator === '%') && right === 0) throw new Error('division by zero');
            if (operator === '*') value *= right;
            else if (operator === '/') value /= right;
            else value %= right;
        }
        return value;
    }

    function parseSum() {
        let value = parseProduct();
        while (tokens[cursor]?.type === '+' || tokens[cursor]?.type === '-') {
            const operator = tokens[cursor].type;
            cursor += 1;
            const right = parseProduct();
            value = operator === '+' ? value + right : value - right;
        }
        return value;
    }

    const value = parseSum();
    if (cursor !== tokens.length || !Number.isFinite(value)) throw new Error('invalid arithmetic expression');
    return Math.floor(value);
}

function resolveNumericValue(source, stores, tables) {
    const value = String(source ?? '').trim();
    if (/^-?\d+(?:\.\d+)?$/u.test(value)) return Number(value);
    if (value.startsWith('cell:')) {
        const cell = readShujukuCell(tables, value.slice(5));
        if (typeof cell !== 'number' || !Number.isFinite(cell)) throw new Error('cell is not numeric');
        return cell;
    }
    const reference = value.match(/^\$(calc|max|min):([A-Za-z_][A-Za-z0-9_]*)$/u);
    if (!reference) throw new Error('unsupported numeric value');
    const store = stores[`${reference[1]}Variables`];
    if (!store?.has(reference[2])) throw new Error('unknown numeric variable');
    return Number(store.get(reference[2]));
}

function parseExtremaTags(text, tagName, stores, tables) {
    const store = stores[`${tagName}Variables`];
    const pattern = new RegExp(`<${tagName}\\s+([^>]*?)\\s*\\/?>`, 'giu');
    return text.replace(pattern, (match, attributes) => {
        const id = readAttribute(attributes, 'id')?.trim();
        const valuesSource = readAttribute(attributes, 'values');
        if (!id || valuesSource === null) return match;
        try {
            const values = valuesSource.split(',')
                .map((value) => value.trim())
                .filter(Boolean)
                .map((value) => resolveNumericValue(value, stores, tables));
            if (values.length === 0 || values.some((value) => !Number.isFinite(value))) return match;
            store.set(id, tagName === 'max' ? Math.max(...values) : Math.min(...values));
            return '';
        } catch {
            return match;
        }
    });
}

export function createNumericTemplateStores() {
    return {
        randomVariables: new Map(),
        calcVariables: new Map(),
        maxVariables: new Map(),
        minVariables: new Map(),
    };
}

export function renderNumericTemplate(
    text,
    runtime = {},
    stores = createNumericTemplateStores(),
    tables = readShujukuTableSnapshot(runtime),
) {
    let rendered = String(text ?? '');
    rendered = rendered.replace(/<random\s+([^>]*?)\s*\/?>/giu, (match, attributes) => {
        const minimumSource = readAttribute(attributes, 'min');
        const maximumSource = readAttribute(attributes, 'max');
        if (!/^\d+$/u.test(minimumSource ?? '') || !/^\d+$/u.test(maximumSource ?? '')) return match;
        const minimum = Number(minimumSource);
        const maximum = Number(maximumSource);
        if (!Number.isInteger(minimum) || !Number.isInteger(maximum)) return match;
        const lower = Math.min(minimum, maximum);
        const upper = Math.max(minimum, maximum);
        const random = typeof runtime.random === 'function' ? Number(runtime.random()) : Math.random();
        const unit = Number.isFinite(random) ? Math.min(Math.max(random, 0), 0.9999999999999999) : 0;
        const result = Math.floor(unit * (upper - lower + 1)) + lower;
        const id = readAttribute(attributes, 'id')?.trim();
        if (!id) return String(result);
        stores.randomVariables.set(id, result);
        return '';
    });
    rendered = replaceStoredReference(rendered, 'random', stores.randomVariables);

    rendered = rendered.replace(/<calc\s+([^>]*?)\s*\/?>/giu, (match, attributes) => {
        const id = readAttribute(attributes, 'id')?.trim();
        const expression = readAttribute(attributes, 'expr');
        if (!id || expression === null) return match;
        try {
            let prepared = replaceStoredReference(expression, 'calc', stores.calcVariables);
            prepared = replaceStoredReference(prepared, 'max', stores.maxVariables);
            prepared = replaceStoredReference(prepared, 'min', stores.minVariables);
            prepared = prepared.replace(
                /cell:([^+\-*%()\s/]+\/[^+\-*%()\s/]+\/[^+\-*%()\s/]+)/giu,
                (_match, path) => {
                const cell = readShujukuCell(tables, path);
                if (typeof cell !== 'number' || !Number.isFinite(cell)) throw new Error('cell is not numeric');
                return String(cell);
                },
            );
            stores.calcVariables.set(id, evaluateArithmetic(prepared));
            return '';
        } catch {
            return match;
        }
    });
    rendered = parseExtremaTags(rendered, 'max', stores, tables);
    rendered = parseExtremaTags(rendered, 'min', stores, tables);
    rendered = replaceStoredReference(rendered, 'calc', stores.calcVariables);
    rendered = replaceStoredReference(rendered, 'max', stores.maxVariables);
    rendered = replaceStoredReference(rendered, 'min', stores.minVariables);
    return rendered;
}

import { readShujukuCell, readShujukuTableSnapshot } from './shujuku-cell-template.js';
