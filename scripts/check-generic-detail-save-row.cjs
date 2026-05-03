const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'modules/table-viewer/detail-edit-controller.js');
const source = fs.readFileSync(sourcePath, 'utf8');

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function extractFunctionBody(name, pattern) {
    const match = pattern.exec(source);
    assert(match, `未找到 ${name} 函数`);

    let index = match.index + match[0].length;
    let depth = 1;
    while (index < source.length && depth > 0) {
        const char = source[index];
        if (char === '{') depth += 1;
        if (char === '}') depth -= 1;
        index += 1;
    }

    assert(depth === 0, `${name} 函数体括号不平衡`);
    return source.slice(match.index, index);
}

function assertOrdered(haystack, tokens, label) {
    let cursor = -1;
    for (const token of tokens) {
        const next = haystack.indexOf(token, cursor + 1);
        assert(next !== -1, `${label} 缺少片段：${token}`);
        assert(next > cursor, `${label} 片段顺序错误：${token}`);
        cursor = next;
    }
}

const cloneBody = extractFunctionBody(
    'cloneTableDataForSave',
    /function\s+cloneTableDataForSave\s*\([^)]*\)\s*{/,
);
assert(cloneBody.includes('JSON.parse(JSON.stringify(rawData))'), '保存快照 helper 必须深拷贝 rawData');
assert(cloneBody.includes("action: 'row.save.clone'"), '保存快照 helper 深拷贝失败必须记录结构化日志');
assert(cloneBody.includes('return null'), '保存快照 helper 失败时必须返回 null 阻断保存');

const saveBody = extractFunctionBody(
    'handleSaveRow',
    /async\s+function\s+handleSaveRow\s*\([^)]*\)\s*{/,
);

assertOrdered(saveBody, [
    'const saveRowIndex = Number(state.rowIndex);',
    'state.setSaving(true);',
    'const dataRowIndex = saveRowIndex + 1;',
    'const freshData = getTableData();',
    'const nextData = cloneTableDataForSave(freshData);',
    'const sheetData = nextData[sheetKey];',
    'content[dataRowIndex][colIndex] = value;',
    'const success = await saveTableData(nextData);',
    'rows[saveRowIndex][rawColIndex] = draft;',
], 'handleSaveRow');

assert(saveBody.includes('保存失败：无法创建保存快照'), '深拷贝失败必须给用户明确反馈');
assert(saveBody.includes('保存失败：行索引无效'), '保存开始时必须校验捕获行号');
assert(saveBody.includes('context: { sheetKey, rowIndex: saveRowIndex }'), '异常日志必须使用保存开始时捕获的行号');
assert(!saveBody.includes('saveTableData(freshData)'), '保存时不能把 getTableData() 原始对象传给 saveTableData');
assert(!saveBody.includes('const sheetData = freshData[sheetKey]'), '保存时不能直接修改 freshData 的 sheetData');
assert(!saveBody.includes('rows[state.rowIndex]'), '保存成功后不能使用可变 state.rowIndex 回写本地 rows');
assert(!/content\s*\[\s*state\.rowIndex\s*\+\s*1\s*\]/.test(saveBody), '保存时不能用可变 state.rowIndex 定位 content 行');

console.log('check-generic-detail-save-row: ok');
