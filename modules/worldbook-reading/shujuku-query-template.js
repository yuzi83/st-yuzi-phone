function quoteIdentifier(value) {
    return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function sqlLiteral(value) {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'boolean') return value ? '1' : '0';
    return `'${String(value).replace(/'/g, "''")}'`;
}

function inlineGeneratedParameters(sql, params) {
    let output = '';
    let parameterIndex = 0;
    let quote = '';
    for (let index = 0; index < sql.length; index += 1) {
        const char = sql[index];
        if (quote) {
            output += char;
            if (char === quote) {
                if (sql[index + 1] === quote) {
                    output += sql[index + 1];
                    index += 1;
                } else quote = '';
            }
        } else if (char === '"' || char === "'") {
            quote = char;
            output += char;
        } else if (char === '?') {
            if (parameterIndex >= params.length) throw new Error('missing generated SQL parameter');
            output += sqlLiteral(params[parameterIndex]);
            parameterIndex += 1;
        } else output += char;
    }
    if (parameterIndex !== params.length) throw new Error('unused generated SQL parameter');
    return output;
}

function splitTopLevel(source, separator = ',') {
    const parts = [];
    let start = 0;
    let quote = '';
    let escaped = false;
    let parenDepth = 0;
    let bracketDepth = 0;

    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        if (quote) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === quote) quote = '';
            continue;
        }
        if (char === '"' || char === "'") quote = char;
        else if (char === '(') parenDepth += 1;
        else if (char === ')') parenDepth -= 1;
        else if (char === '[') bracketDepth += 1;
        else if (char === ']') bracketDepth -= 1;
        else if (char === separator && parenDepth === 0 && bracketDepth === 0) {
            parts.push(source.slice(start, index).trim());
            start = index + 1;
        }
    }
    parts.push(source.slice(start).trim());
    return parts;
}

function unquote(source) {
    const quote = source[0];
    let result = '';
    let escaped = false;
    for (let index = 1; index < source.length - 1; index += 1) {
        const char = source[index];
        if (escaped) {
            result += char === 'n' ? '\n' : char === 'r' ? '\r' : char === 't' ? '\t' : char;
            escaped = false;
        } else if (char === '\\') escaped = true;
        else result += char;
    }
    if (source[source.length - 1] !== quote) throw new Error('unterminated string');
    return result;
}

function parseValue(source, variables) {
    const value = source.trim();
    if (!value) return undefined;
    if ((value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'"))) return unquote(value);
    if (value.startsWith('[') && value.endsWith(']')) {
        const inner = value.slice(1, -1).trim();
        return inner ? splitTopLevel(inner).map((part) => parseValue(part, variables)) : [];
    }
    if (/^-?(?:\d+\.?\d*|\.\d+)$/u.test(value)) return Number(value);
    if (value === 'null') return null;
    if (value === 'true') return true;
    if (value === 'false') return false;
    const variable = value.match(/^\$v:([A-Za-z_][A-Za-z0-9_]*)$/u);
    if (variable && variables.has(variable[1])) return variables.get(variable[1]);
    throw new Error('unsupported argument');
}

function findClosingParen(source, openIndex) {
    let depth = 1;
    let quote = '';
    let escaped = false;
    for (let index = openIndex + 1; index < source.length; index += 1) {
        const char = source[index];
        if (quote) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === quote) quote = '';
            continue;
        }
        if (char === '"' || char === "'") quote = char;
        else if (char === '(') depth += 1;
        else if (char === ')' && --depth === 0) return index;
    }
    return -1;
}

function parseTableChain(expression, variables) {
    const root = expression.match(/^db\.([^\s.()]+)/u);
    if (!root) throw new Error('invalid db expression');
    const methods = [];
    let cursor = root[0].length;
    while (cursor < expression.length) {
        if (expression[cursor] !== '.') throw new Error('invalid method separator');
        const method = expression.slice(cursor + 1).match(/^([A-Za-z][A-Za-z0-9_]*)\s*\(/u);
        if (!method) throw new Error('invalid method');
        const openIndex = cursor + 1 + method[0].lastIndexOf('(');
        const closeIndex = findClosingParen(expression, openIndex);
        if (closeIndex < 0) throw new Error('unterminated method');
        const rawArguments = expression.slice(openIndex + 1, closeIndex).trim();
        methods.push({
            name: method[1],
            arguments: rawArguments
                ? splitTopLevel(rawArguments).map((part) => parseValue(part, variables))
                : [],
        });
        cursor = closeIndex + 1;
    }
    return { tableName: root[1], methods };
}

function compileWhere(argumentsList, params) {
    if (argumentsList.length !== 2 && argumentsList.length !== 3) throw new Error('invalid where');
    const [column, second, third] = argumentsList;
    const operator = argumentsList.length === 3 ? String(second).toUpperCase() : '=';
    if (!['=', '!=', '<>', '>', '>=', '<', '<='].includes(operator)) throw new Error('invalid operator');
    const value = argumentsList.length === 3 ? third : second;
    if (value === null) return `${quoteIdentifier(column)} ${operator === '=' ? 'IS NULL' : 'IS NOT NULL'}`;
    params.push(value);
    return `${quoteIdentifier(column)} ${operator} ?`;
}

function compileWhereIn(argumentsList, params, negate = false) {
    if (argumentsList.length !== 2 || !Array.isArray(argumentsList[1])) throw new Error('invalid whereIn');
    const [column, values] = argumentsList;
    if (values.length === 0) return negate ? '1 = 1' : '1 = 0';
    params.push(...values);
    return `${quoteIdentifier(column)} ${negate ? 'NOT IN' : 'IN'} (${values.map(() => '?').join(', ')})`;
}

function compileWhereBetween(argumentsList, params) {
    if (argumentsList.length !== 3) throw new Error('invalid whereBetween');
    const [column, first, second] = argumentsList;
    const swap = typeof first === 'number' && typeof second === 'number' && first > second;
    params.push(swap ? second : first, swap ? first : second);
    return `${quoteIdentifier(column)} BETWEEN ? AND ?`;
}

const ORM_TERMINALS = new Set([
    'get', 'first', 'list', 'all', 'count', 'sum', 'avg', 'max', 'min', 'value', 'exists', 'toSQL',
]);

async function evaluateTableChain(expression, runtime, variables) {
    const { tableName, methods } = parseTableChain(expression, variables);
    const terminalIndexes = methods
        .map((method, index) => (ORM_TERMINALS.has(method.name) ? index : -1))
        .filter((index) => index >= 0);
    if (terminalIndexes.length !== 1 || terminalIndexes[0] !== methods.length - 1) {
        throw new Error('terminal method must be last');
    }
    const params = [];
    const whereGroups = [];
    let where = [];
    let terminal = null;
    let orderBy = '';
    let limit = null;
    let offset = null;
    let distinct = false;
    let groupBy = '';
    let having = '';

    for (const method of methods) {
        if (method.name === 'where') where.push(compileWhere(method.arguments, params));
        else if (method.name === 'orWhere') {
            if (where.length > 0) whereGroups.push(where);
            where = [compileWhere(method.arguments, params)];
        }
        else if (method.name === 'whereIn') where.push(compileWhereIn(method.arguments, params));
        else if (method.name === 'whereNotIn') where.push(compileWhereIn(method.arguments, params, true));
        else if (method.name === 'whereBetween') where.push(compileWhereBetween(method.arguments, params));
        else if (method.name === 'whereNull' || method.name === 'whereNotNull') {
            if (method.arguments.length !== 1) throw new Error('invalid null condition');
            where.push(`${quoteIdentifier(method.arguments[0])} IS ${method.name === 'whereNotNull' ? 'NOT ' : ''}NULL`);
        } else if (method.name === 'whereLike') {
            if (method.arguments.length !== 2) throw new Error('invalid whereLike');
            params.push(method.arguments[1]);
            where.push(`${quoteIdentifier(method.arguments[0])} LIKE ?`);
        } else if (method.name === 'orderBy') {
            if (method.arguments.length < 1 || method.arguments.length > 2) throw new Error('invalid orderBy');
            const direction = String(method.arguments[1] ?? 'ASC').toUpperCase();
            if (!['ASC', 'DESC'].includes(direction)) throw new Error('invalid direction');
            orderBy = `${quoteIdentifier(method.arguments[0])} ${direction}`;
        } else if (method.name === 'limit' || method.name === 'offset') {
            if (method.arguments.length !== 1) {
                throw new Error('invalid pagination');
            }
            if (method.name === 'limit') {
                if (!Number.isInteger(method.arguments[0]) || method.arguments[0] < 0) {
                    throw new Error('invalid pagination');
                }
                limit = method.arguments[0];
            } else {
                offset = Number.isInteger(method.arguments[0]) && method.arguments[0] >= 0
                    ? method.arguments[0]
                    : 0;
            }
        } else if (method.name === 'distinct') {
            if (method.arguments.length !== 0) throw new Error('invalid distinct');
            distinct = true;
        } else if (method.name === 'groupBy') {
            if (method.arguments.length !== 1) throw new Error('invalid groupBy');
            groupBy = quoteIdentifier(method.arguments[0]);
        } else if (method.name === 'having') {
            if (method.arguments.length !== 1) throw new Error('invalid having');
            const expressionValue = String(method.arguments[0]);
            if (/[;]|--|\/\*/u.test(expressionValue)) throw new Error('unsafe having');
            having = expressionValue;
        }
        else if (method.name === 'get') terminal = { name: 'get', arguments: method.arguments };
        else if (method.name === 'count') terminal = { name: 'count', arguments: method.arguments };
        else if (method.name === 'list') terminal = { name: 'list', arguments: method.arguments };
        else if (method.name === 'all' || method.name === 'first') terminal = { name: method.name, arguments: method.arguments };
        else if (['sum', 'avg', 'max', 'min'].includes(method.name)) terminal = { name: method.name, arguments: method.arguments };
        else if (method.name === 'value') terminal = { name: 'value', arguments: method.arguments };
        else if (method.name === 'exists') terminal = { name: 'exists', arguments: method.arguments };
        else if (method.name === 'toSQL') terminal = { name: 'toSQL', arguments: method.arguments };
        else throw new Error('unsupported method');
    }
    if (!terminal) throw new Error('missing terminal');
    const valueExpression = terminal.name === 'value' ? String(terminal.arguments[0] ?? '') : '';
    if (valueExpression && (/[;]|--|\/\*/u.test(valueExpression))) throw new Error('unsafe value expression');
    const selectExpression = terminal.name === 'get' || terminal.name === 'list'
        ? quoteIdentifier(terminal.arguments[0])
        : terminal.name === 'count'
            ? 'COUNT(*)'
            : ['sum', 'avg', 'max', 'min'].includes(terminal.name)
                ? `${terminal.name.toUpperCase()}(${quoteIdentifier(terminal.arguments[0])})`
                : terminal.name === 'value' ? valueExpression : terminal.name === 'exists' ? '1' : '*';
    if (((terminal.name === 'get' || terminal.name === 'list') && terminal.arguments.length !== 1)
        || (['sum', 'avg', 'max', 'min'].includes(terminal.name) && terminal.arguments.length !== 1)
        || (terminal.name === 'value' && terminal.arguments.length !== 1)
        || (['count', 'all', 'first', 'exists', 'toSQL'].includes(terminal.name) && terminal.arguments.length !== 0)) {
        throw new Error('invalid terminal');
    }
    let sql = `SELECT${distinct ? ' DISTINCT' : ''} ${selectExpression} FROM ${quoteIdentifier(tableName)}`;
    if (where.length > 0) whereGroups.push(where);
    if (whereGroups.length === 1) sql += ` WHERE ${whereGroups[0].join(' AND ')}`;
    else if (whereGroups.length > 1) {
        sql += ` WHERE ${whereGroups.map((group) => `(${group.join(' AND ')})`).join(' OR ')}`;
    }
    if (groupBy) sql += ` GROUP BY ${groupBy}`;
    if (having) sql += ` HAVING ${having}`;
    if (orderBy) sql += ` ORDER BY ${orderBy}`;
    if (terminal.name === 'get' || terminal.name === 'first') sql += ' LIMIT 1';
    else if (limit !== null) sql += ` LIMIT ${limit}`;
    else if (offset !== null) sql += ' LIMIT -1';
    if (offset !== null) sql += ` OFFSET ${offset}`;
    if (terminal.name === 'exists') sql = `SELECT EXISTS(${sql}) AS e`;
    if (terminal.name === 'toSQL') return inlineGeneratedParameters(sql, params);
    const result = await runtime.querySql(sql, params);
    if (!Array.isArray(result?.values) || result.values.length === 0) return '';
    if (terminal.name === 'list') return result.values.map((row) => String(row?.[0] ?? '')).join(', ');
    if (terminal.name === 'exists') return result.values[0]?.[0] === 1 ? 'true' : 'false';
    if (terminal.name === 'all' || terminal.name === 'first') {
        const rows = terminal.name === 'first' ? result.values.slice(0, 1) : result.values;
        return rows.map((row) => result.columns
            .map((column, index) => `${column}: ${row?.[index] ?? ''}`)
            .join(', '))
            .join('\n');
    }
    return String(result.values[0]?.[0] ?? '');
}

function inlineNumericVariables(expression, variables) {
    return String(expression).replace(/\$v:([A-Za-z_][A-Za-z0-9_]*)/gu, (_match, name) => {
        if (!variables.has(name)) throw new Error('unknown variable');
        const value = Number(variables.get(name));
        if (!Number.isFinite(value)) throw new Error('non numeric variable');
        return String(value);
    });
}

async function evaluateStaticDbExpression(expression, runtime, variables) {
    const match = expression.match(/^db\.(expr|rand|calc|max|min)\(([\s\S]*)\)$/u);
    if (!match) return null;
    const name = match[1];
    const rawArguments = match[2].trim();
    const args = rawArguments
        ? splitTopLevel(rawArguments).map((part) => parseValue(part, variables))
        : [];

    if (name === 'max' || name === 'min') {
        const numbers = args.flat(Infinity).map(Number).filter(Number.isFinite);
        if (numbers.length === 0) return '';
        return String(name === 'max' ? Math.max(...numbers) : Math.min(...numbers));
    }
    if (name === 'rand') {
        if (args.length !== 2) return '';
        let lower = Number(args[0]);
        let upper = Number(args[1]);
        if (!Number.isFinite(lower) || !Number.isFinite(upper)) return '';
        if (lower > upper) [lower, upper] = [upper, lower];
        const random = typeof runtime.random === 'function' ? runtime.random() : Math.random();
        return String(Math.floor(random * (upper - lower + 1)) + lower);
    }
    if (args.length !== 1 || typeof args[0] !== 'string') return '';
    const sqlExpression = name === 'calc'
        ? inlineNumericVariables(args[0], variables)
        : args[0].trim();
    if (!sqlExpression || /[;]|--|\/\*/u.test(sqlExpression)) return '';
    if (name === 'calc' && !/^[\d\s+*/%().-]+$/u.test(sqlExpression)) return '';
    const result = await runtime.querySql(`SELECT ${sqlExpression}`, []);
    return Array.isArray(result?.values) && result.values.length > 0
        ? String(result.values[0]?.[0] ?? '')
        : '';
}

async function evaluateDbExpression(expression, runtime, variables) {
    const staticValue = await evaluateStaticDbExpression(expression, runtime, variables);
    return staticValue === null
        ? evaluateTableChain(expression, runtime, variables)
        : staticValue;
}

function splitConditionComparison(expression) {
    const operators = ['>=', '<=', '!=', '==', '>', '<'];
    let quote = '';
    let escaped = false;
    let parenDepth = 0;
    let bracketDepth = 0;
    for (let index = 0; index < expression.length; index += 1) {
        const char = expression[index];
        if (quote) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === quote) quote = '';
            continue;
        }
        if (char === '"' || char === "'") quote = char;
        else if (char === '(') parenDepth += 1;
        else if (char === ')') parenDepth -= 1;
        else if (char === '[') bracketDepth += 1;
        else if (char === ']') bracketDepth -= 1;
        else if (parenDepth === 0 && bracketDepth === 0) {
            const operator = operators.find((candidate) => expression.startsWith(candidate, index));
            if (operator) {
                return {
                    left: expression.slice(0, index).trim(),
                    operator,
                    right: expression.slice(index + operator.length).trim(),
                };
            }
        }
    }
    return null;
}

function isConditionTruthy(value) {
    if (value === null || value === undefined || value === '' || value === '0' || value === 'false') return false;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'boolean') return value;
    return true;
}

function compareConditionResult(left, operator, right) {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    const numeric = Number.isFinite(leftNumber) && Number.isFinite(rightNumber);
    const actual = numeric ? leftNumber : String(left);
    const expected = numeric ? rightNumber : String(right);
    if (operator === '>') return actual > expected;
    if (operator === '<') return actual < expected;
    if (operator === '>=') return actual >= expected;
    if (operator === '<=') return actual <= expected;
    if (operator === '==') return actual === expected;
    if (operator === '!=') return actual !== expected;
    return false;
}

export async function evaluateDbTemplateCondition(expression, runtime, variables = new Map()) {
    try {
        const normalized = String(expression ?? '').trim();
        if (!normalized) return false;
        const comparison = splitConditionComparison(normalized);
        const dbExpression = comparison ? comparison.left : normalized;
        const value = await evaluateDbExpression(
            dbExpression.startsWith('db.') ? dbExpression : `db.${dbExpression}`,
            runtime,
            variables,
        );
        if (!comparison) return isConditionTruthy(value);
        const expected = parseValue(comparison.right, variables);
        return compareConditionResult(value, comparison.operator, expected);
    } catch {
        return false;
    }
}

export async function evaluateSqlTemplateCondition(expression, runtime) {
    try {
        const result = await runtime.querySql(String(expression ?? '').trim(), []);
        const value = Array.isArray(result?.values) && result.values.length > 0
            ? result.values[0]?.[0]
            : null;
        return isConditionTruthy(value);
    } catch {
        return false;
    }
}

function splitAlias(expression) {
    const match = expression.match(/^([\s\S]*?)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/u);
    return match ? { expression: match[1].trim(), alias: match[2] } : { expression: expression.trim(), alias: '' };
}

function findDbTag(source, fromIndex) {
    const start = source.indexOf('{[db.', fromIndex);
    if (start < 0) return null;
    let bracketDepth = 1;
    let quote = '';
    let escaped = false;
    for (let index = start + 2; index < source.length; index += 1) {
        const char = source[index];
        if (quote) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === quote) quote = '';
            continue;
        }
        if (char === '"' || char === "'") quote = char;
        else if (char === '[') bracketDepth += 1;
        else if (char === ']') {
            bracketDepth -= 1;
            if (bracketDepth === 0 && source[index + 1] === '}') {
                return {
                    start,
                    end: index + 2,
                    expression: source.slice(start + 2, index),
                };
            }
        }
    }
    return null;
}

export async function renderDbQueryTags(text, runtime, variables) {
    let cursor = 0;
    let output = '';
    while (cursor < text.length) {
        const tag = findDbTag(text, cursor);
        if (!tag) {
            output += text.slice(cursor);
            break;
        }
        output += text.slice(cursor, tag.start);
        const parsed = splitAlias(tag.expression);
        let value = '';
        try {
            value = await evaluateDbExpression(parsed.expression, runtime, variables);
        } catch {
            value = '';
        }
        if (parsed.alias) variables.set(parsed.alias, value);
        else output += value;
        cursor = tag.end;
    }
    return output;
}
