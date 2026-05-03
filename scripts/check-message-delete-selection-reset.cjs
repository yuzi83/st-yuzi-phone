const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'modules/table-viewer/special/message-viewer.js');
const source = fs.readFileSync(sourcePath, 'utf8');

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function extractFunctionBody(name) {
    const assignmentPattern = new RegExp(`const\\s+${name}\\s*=\\s*\\([^)]*\\)\\s*=>\\s*{`);
    const match = assignmentPattern.exec(source);
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

const clearBody = extractFunctionBody('clearDeleteSelectionAfterExternalSync');
assert(clearBody.includes('state.deleteManageMode'), '清空 helper 必须只在删除管理模式下生效');
assert(clearBody.includes('state.deletingSelection'), '清空 helper 必须避开正在删除中的选择');
assert(clearBody.includes('state.selectedMessageRowIndexes.length === 0'), '清空 helper 必须避免无选择时产生噪音');
assert(clearBody.includes('setSelectedMessageRowIndexes([])'), '清空 helper 必须通过选择 setter 清空旧行号');
assert(clearBody.includes('return true'), '清空 helper 必须返回是否发生重置');

const syncBody = extractFunctionBody('syncRowsFromSheet');
assert(!syncBody.includes('setSelectedMessageRowIndexes([])'), 'syncRowsFromSheet 不能无条件清空选择，否则详情页普通重渲染会破坏删除管理模式');
assert(!syncBody.includes('clearDeleteSelectionAfterExternalSync'), 'syncRowsFromSheet 不能直接触发外部同步选择重置');

const updateBody = extractFunctionBody('handleExternalTableUpdate');
assertOrdered(updateBody, [
    'if (event?.detail?.sheetKey !== sheetKey) return;',
    'if (Date.now() < state.suppressExternalUpdateUntil) return;',
    'if (!syncRowsFromSheet()) return;',
    'const selectionReset = clearDeleteSelectionAfterExternalSync();',
    'renderKeepScroll();',
    'if (selectionReset)',
    "showInlineToast(container, '表格已刷新，已清空删除选择，请重新选择');",
], 'handleExternalTableUpdate');

assert(!updateBody.includes('deletePhoneSheetRows'), '外部同步选择重置不应触发删除操作');

console.log('check-message-delete-selection-reset: ok');
