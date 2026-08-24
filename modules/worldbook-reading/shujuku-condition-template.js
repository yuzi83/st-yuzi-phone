const IF_OPEN_PATTERN = /<if\s+(seed|cell|cond|db|sql)\s*=\s*"([^"]*)"\s*>/iu;
const IF_TOKEN_PATTERN = /<if\s+(?:seed|cell|cond|db|sql)\s*=\s*"[^"]*"\s*>|<else>|<\/if>/giu;

function findNextIf(source, fromIndex) {
    const match = source.slice(fromIndex).match(IF_OPEN_PATTERN);
    if (!match) return null;
    return {
        start: fromIndex + match.index,
        end: fromIndex + match.index + match[0].length,
        type: match[1].toLowerCase(),
        expression: match[2],
    };
}

function scanIfBlock(source, opening) {
    IF_TOKEN_PATTERN.lastIndex = opening.end;
    let nesting = 1;
    let elseStart = -1;
    let elseEnd = -1;
    for (let token = IF_TOKEN_PATTERN.exec(source); token; token = IF_TOKEN_PATTERN.exec(source)) {
        const normalized = token[0].toLowerCase();
        if (normalized.startsWith('<if')) nesting += 1;
        else if (normalized === '<else>') {
            if (nesting === 1 && elseStart < 0) {
                elseStart = token.index;
                elseEnd = token.index + token[0].length;
            }
        } else {
            nesting -= 1;
            if (nesting === 0) {
                return {
                    end: token.index + token[0].length,
                    ifContent: source.slice(opening.end, elseStart < 0 ? token.index : elseStart),
                    elseContent: elseStart < 0 ? '' : source.slice(elseEnd, token.index),
                };
            }
        }
    }
    return null;
}

function splitTopLevelBoolean(source, separator) {
    const parts = [];
    let start = 0;
    let depth = 0;
    let quote = '';
    let escaped = false;
    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        if (quote) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === quote) quote = '';
        } else if (char === '"' || char === "'") quote = char;
        else if (char === '(') depth += 1;
        else if (char === ')') depth = Math.max(0, depth - 1);
        else if (char === separator && depth === 0) {
            parts.push(source.slice(start, index).trim());
            start = index + 1;
        }
    }
    parts.push(source.slice(start).trim());
    return parts.filter(Boolean);
}

function compareConditionValue(actual, operator, expectedSource) {
    const actualNumber = Number(actual);
    const expectedNumber = Number(expectedSource);
    const numeric = Number.isFinite(actualNumber) && Number.isFinite(expectedNumber);
    const left = numeric ? actualNumber : String(actual);
    const right = numeric ? expectedNumber : String(expectedSource);
    if (operator === '>') return left > right;
    if (operator === '<') return left < right;
    if (operator === '>=') return left >= right;
    if (operator === '<=') return left <= right;
    if (operator === '==') return left === right;
    if (operator === '!=') return left !== right;
    return false;
}

function evaluateStoredComparison(expression, store) {
    const normalized = String(expression ?? '').trim();
    const operators = ['>=', '<=', '!=', '==', '>', '<'];
    const operator = operators.find((candidate) => normalized.includes(candidate));
    if (!operator) {
        if (!store.has(normalized)) return false;
        const value = store.get(normalized);
        return value !== '' && value !== 0 && value !== '0' && value !== false && value !== 'false';
    }
    const index = normalized.indexOf(operator);
    const name = normalized.slice(0, index).trim();
    const expected = normalized.slice(index + operator.length).trim();
    return store.has(name) && compareConditionValue(store.get(name), operator, expected);
}

function evaluateInlineRandomComparison(expression, runtime = {}) {
    const match = String(expression ?? '').trim().match(
        /^(\d+)-(\d+)\s*(>=|<=|!=|==|>|<)\s*(-?(?:\d+\.?\d*|\.\d+))$/u,
    );
    if (!match) return null;
    const first = Number(match[1]);
    const second = Number(match[2]);
    const lower = Math.min(first, second);
    const upper = Math.max(first, second);
    const random = typeof runtime.random === 'function' ? Number(runtime.random()) : Math.random();
    const unit = Number.isFinite(random) ? Math.min(Math.max(random, 0), 0.9999999999999999) : 0;
    const value = Math.floor(unit * (upper - lower + 1)) + lower;
    return compareConditionValue(value, match[3], match[4]);
}

function hasSingleOuterPair(source) {
    if (!source.startsWith('(') || !source.endsWith(')')) return false;
    let depth = 0;
    for (let index = 0; index < source.length; index += 1) {
        if (source[index] === '(') depth += 1;
        else if (source[index] === ')') depth -= 1;
        if (depth === 0 && index < source.length - 1) return false;
    }
    return depth === 0;
}

function evaluateSeedExpression(expression, session) {
    const content = `${String(session.seedContent ?? '')}\n${String(session.plotContent ?? '')}`.toLocaleLowerCase();
    if (!content.trim()) return false;

    function evaluate(source) {
        const trimmed = source.trim();
        if (!trimmed) return false;
        const orParts = splitTopLevelBoolean(trimmed, ',');
        if (orParts.length > 1) return orParts.some(evaluate);
        const andParts = splitTopLevelBoolean(trimmed, '&');
        if (andParts.length > 1) return andParts.every(evaluate);
        if (trimmed.startsWith('!')) return !evaluate(trimmed.slice(1));
        if (hasSingleOuterPair(trimmed)) return evaluate(trimmed.slice(1, -1));
        return content.includes(trimmed.toLocaleLowerCase());
    }

    return evaluate(String(expression ?? ''));
}

async function evaluateCondExpression(expression, session) {
    async function evaluate(source) {
        const trimmed = source.trim();
        if (!trimmed) return false;
        const orParts = splitTopLevelBoolean(trimmed, ',');
        if (orParts.length > 1) {
            for (const part of orParts) {
                if (await evaluate(part)) return true;
            }
            return false;
        }
        const andParts = splitTopLevelBoolean(trimmed, '&');
        if (andParts.length > 1) {
            for (const part of andParts) {
                if (!await evaluate(part)) return false;
            }
            return true;
        }
        if (trimmed.startsWith('!')) return !await evaluate(trimmed.slice(1));
        if (hasSingleOuterPair(trimmed)) return evaluate(trimmed.slice(1, -1));

        const prefixed = trimmed.match(/^(seed|cell|random|calc|max|min|db|sql|v):([\s\S]*)$/iu);
        if (!prefixed) return evaluateSeedExpression(trimmed, session);
        const type = prefixed[1].toLowerCase();
        const body = prefixed[2].trim();
        if (type === 'seed') return evaluateSeedExpression(body, session);
        if (type === 'cell') return evaluateShujukuCellCondition(body, session.tables);
        if (type === 'db') return evaluateDbTemplateCondition(body, session.runtime, session.variables);
        if (type === 'sql') return evaluateSqlTemplateCondition(body, session.runtime);
        if (type === 'v') return evaluateStoredComparison(body, session.variables ?? new Map());
        if (type === 'random') {
            const inlineResult = evaluateInlineRandomComparison(body, session.runtime);
            if (inlineResult !== null) return inlineResult;
        }
        const store = session.numericStores?.[`${type}Variables`];
        return store instanceof Map && evaluateStoredComparison(body, store);
    }

    return evaluate(String(expression ?? ''));
}

async function evaluateIfCondition(type, expression, session) {
    if (type === 'seed') return evaluateSeedExpression(expression, session);
    if (type === 'cell') return evaluateShujukuCellCondition(expression, session.tables);
    if (type === 'cond') return evaluateCondExpression(expression, session);
    if (type === 'db') return evaluateDbTemplateCondition(expression, session.runtime, session.variables);
    if (type === 'sql') return evaluateSqlTemplateCondition(expression, session.runtime);
    return false;
}

async function renderConditionalContent(source, session, depth) {
    let output = '';
    let cursor = 0;
    while (cursor < source.length) {
        const opening = findNextIf(source, cursor);
        if (!opening) return output + source.slice(cursor);
        output += source.slice(cursor, opening.start);
        const block = scanIfBlock(source, opening);
        if (!block) return output + source.slice(opening.start);
        if (depth >= session.maxNestingDepth) {
            output += source.slice(opening.start, block.end);
            cursor = block.end;
            continue;
        }
        const matched = await evaluateIfCondition(opening.type, opening.expression, session);
        const selected = matched ? block.ifContent : block.elseContent;
        output += await renderConditionalContent(selected, session, depth + 1);
        cursor = block.end;
    }
    return output;
}

export async function renderConditionalTemplate(text, session = {}) {
    const maxNestingDepth = Number.isInteger(session.maxNestingDepth) && session.maxNestingDepth > 0
        ? session.maxNestingDepth
        : 10;
    return renderConditionalContent(String(text ?? ''), { ...session, maxNestingDepth }, 0);
}

import { evaluateShujukuCellCondition } from './shujuku-cell-template.js';
import {
    evaluateDbTemplateCondition,
    evaluateSqlTemplateCondition,
} from './shujuku-query-template.js';
