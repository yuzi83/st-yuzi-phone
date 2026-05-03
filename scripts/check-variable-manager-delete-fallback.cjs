const fs = require('fs');
const path = require('path');

const root = process.cwd();
const sourcePath = path.join(root, 'modules/variable-manager/variable-api.js');
const source = fs.readFileSync(sourcePath, 'utf8');

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function deleteNestedValue(obj, variablePath) {
    if (!obj || typeof obj !== 'object') return;

    const keys = variablePath.split('.');
    let current = obj;
    for (let index = 0; index < keys.length - 1; index++) {
        const key = keys[index];
        if (!current[key] || typeof current[key] !== 'object') return;
        current = current[key];
    }
    delete current[keys[keys.length - 1]];
}

function deleteMvuVariablePath(mvuData, variablePath) {
    deleteNestedValue(mvuData?.stat_data, variablePath);
    deleteNestedValue(mvuData?.display_data, variablePath);
    deleteNestedValue(mvuData?.delta_data, variablePath);
}

function assertSourceContract() {
    assert(
        source.includes('function deleteMvuVariablePath(mvuData, path) {'),
        'variable-api.js must define deleteMvuVariablePath() for MVU three-layer fallback deletion.',
    );
    assert(
        source.includes('deleteMvuVariablePath(mvuData, path);'),
        'deleteFloorVariable() lodash fallback must delegate to deleteMvuVariablePath().',
    );
    assert(
        source.includes('deleteNestedValue(mvuData?.stat_data, path);')
            && source.includes('deleteNestedValue(mvuData?.display_data, path);')
            && source.includes('deleteNestedValue(mvuData?.delta_data, path);'),
        'deleteMvuVariablePath() must delete stat_data, display_data, and delta_data.',
    );
    assert(
        source.includes("if (!obj || typeof obj !== 'object') return;"),
        'deleteNestedValue() must no-op for missing or non-object MVU layers.',
    );
}

function assertDeletesAllMvuLayers() {
    const data = {
        stat_data: { role: { name: 'stat', nested: { value: 1 } } },
        display_data: { role: { name: 'display', nested: { value: 2 } } },
        delta_data: { role: { name: 'delta', nested: { value: 3 } } },
    };

    deleteMvuVariablePath(data, 'role.nested.value');

    assert(!Object.prototype.hasOwnProperty.call(data.stat_data.role.nested, 'value'), 'stat_data path should be deleted.');
    assert(!Object.prototype.hasOwnProperty.call(data.display_data.role.nested, 'value'), 'display_data path should be deleted.');
    assert(!Object.prototype.hasOwnProperty.call(data.delta_data.role.nested, 'value'), 'delta_data path should be deleted.');
    assert(data.stat_data.role.name === 'stat', 'unrelated stat_data fields must be preserved.');
    assert(data.display_data.role.name === 'display', 'unrelated display_data fields must be preserved.');
    assert(data.delta_data.role.name === 'delta', 'unrelated delta_data fields must be preserved.');
}

function assertMissingLayersDoNotThrow() {
    const data = {
        stat_data: { role: { value: 1 } },
    };

    deleteMvuVariablePath(data, 'role.value');

    assert(!Object.prototype.hasOwnProperty.call(data.stat_data.role, 'value'), 'stat_data should still be deleted when display/delta layers are missing.');
}

function assertNonObjectLayersDoNotThrowOrMutate() {
    const data = {
        stat_data: { role: { value: 1 } },
        display_data: 'not-an-object',
        delta_data: null,
    };

    deleteMvuVariablePath(data, 'role.value');

    assert(!Object.prototype.hasOwnProperty.call(data.stat_data.role, 'value'), 'stat_data should be deleted when sibling layers are non-object.');
    assert(data.display_data === 'not-an-object', 'non-object display_data should be left untouched.');
    assert(data.delta_data === null, 'null delta_data should be left untouched.');
}

function assertMissingIntermediatePathIsNoop() {
    const data = {
        stat_data: { role: { name: 'stat' } },
        display_data: { role: { name: 'display' } },
        delta_data: { role: { name: 'delta' } },
    };

    deleteMvuVariablePath(data, 'role.missing.value');

    assert(data.stat_data.role.name === 'stat', 'missing intermediate path should not mutate stat_data.');
    assert(data.display_data.role.name === 'display', 'missing intermediate path should not mutate display_data.');
    assert(data.delta_data.role.name === 'delta', 'missing intermediate path should not mutate delta_data.');
}

assertSourceContract();
assertDeletesAllMvuLayers();
assertMissingLayersDoNotThrow();
assertNonObjectLayersDoNotThrowOrMutate();
assertMissingIntermediatePathIsNoop();

console.log('check-variable-manager-delete-fallback: ok');
