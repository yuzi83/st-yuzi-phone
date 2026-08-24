export function readShujukuTableSnapshot(runtime = {}) {
    if (typeof runtime.exportTableAsJson !== 'function') return null;
    try {
        const tables = runtime.exportTableAsJson();
        return tables && typeof tables === 'object' && !Array.isArray(tables) ? tables : null;
    } catch {
        return null;
    }
}

function findTable(tables, tableName) {
    return Object.values(tables ?? {}).find((candidate) => (
        candidate
        && typeof candidate === 'object'
        && String(candidate.name ?? '').trim() === tableName
        && Array.isArray(candidate.content)
    ));
}

function coerceCellValue(raw) {
    const numeric = Number.parseFloat(raw);
    return Number.isFinite(numeric) ? numeric : String(raw ?? '');
}

export function readShujukuCell(tables, path) {
    const parts = String(path ?? '').split('/').map((part) => part.trim());
    if (parts.length !== 3 || parts.some((part) => !part)) return null;
    const [tableName, rowName, columnName] = parts;
    const table = findTable(tables, tableName);
    if (!table || table.content.length === 0 || !Array.isArray(table.content[0])) return null;
    const columnIndex = table.content[0].findIndex((cell) => String(cell ?? '').trim() === columnName);
    if (columnIndex < 0) return null;
    const row = table.content.slice(1).find((candidate) => (
        Array.isArray(candidate)
        && candidate.some((cell) => String(cell ?? '').trim() === rowName)
    ));
    if (!row) return null;
    const raw = row[columnIndex];
    return coerceCellValue(raw);
}

function normalizeComparisonOperators(expression) {
    return String(expression ?? '')
        .replace(/[≥＞∶]/gu, (operator) => (operator === '＞' ? '>' : '>='))
        .replace(/[≤≦]/gu, '<=')
        .replace(/＜/gu, '<')
        .replace(/≠/gu, '!=')
        .replace(/＝/gu, '==');
}

function compareCellValue(actual, operator, expectedSource) {
    const expectedNumber = Number.parseFloat(expectedSource);
    const numeric = typeof actual === 'number' && Number.isFinite(expectedNumber);
    const left = numeric ? actual : String(actual);
    const right = numeric ? expectedNumber : String(expectedSource);
    if (operator === '>') return left > right;
    if (operator === '<') return left < right;
    if (operator === '>=') return left >= right;
    if (operator === '<=') return left <= right;
    if (operator === '==') return left === right;
    if (operator === '!=') return left !== right;
    return false;
}

export function evaluateShujukuCellCondition(expression, tables) {
    const normalized = normalizeComparisonOperators(expression);
    const operators = ['>=', '<=', '!=', '==', '>', '<'];
    const operator = operators.find((candidate) => normalized.includes(candidate));
    if (!operator) return false;
    const operatorIndex = normalized.indexOf(operator);
    const path = normalized.slice(0, operatorIndex).trim();
    const expected = normalized.slice(operatorIndex + operator.length).trim();
    const parts = path.split('/').map((part) => part.trim()).filter(Boolean);
    if (parts.length === 2) {
        const [tableName, targetName] = parts;
        const table = findTable(tables, tableName);
        if (!table || table.content.length === 0 || !Array.isArray(table.content[0])) return operator === '!=';
        const header = table.content[0];
        const rows = table.content.slice(1).filter(Array.isArray);
        let foundCandidate = false;
        const targetRow = rows.find((row) => String(row[0] ?? '').trim() === targetName);
        if (targetRow) {
            foundCandidate = true;
            if (targetRow.slice(1).some((value) => compareCellValue(coerceCellValue(value), operator, expected))) {
                return true;
            }
        }
        const columnIndex = header.findIndex((value) => String(value ?? '').trim() === targetName);
        if (columnIndex >= 0) {
            foundCandidate = true;
            if (rows.some((row) => compareCellValue(coerceCellValue(row[columnIndex]), operator, expected))) {
                return true;
            }
        }
        return foundCandidate ? false : operator === '!=';
    }
    let actual = readShujukuCell(tables, path);
    if (actual === null && parts.length === 3) {
        actual = readShujukuCell(tables, `${parts[0]}/${parts[2]}/${parts[1]}`);
    }
    if (actual === null) return operator === '!=';
    return compareCellValue(actual, operator, expected);
}
