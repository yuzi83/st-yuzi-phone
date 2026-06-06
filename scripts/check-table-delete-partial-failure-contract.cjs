const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = {
    repository: 'modules/phone-core/data-api/table-repository.js',
    projection: 'modules/phone-core/chat-support/message-projection.js',
    rowDelete: 'modules/table-viewer/row-delete-controller.js',
    listController: 'modules/table-viewer/list-page-controller.js',
    messageViewer: 'modules/table-viewer/special/message-viewer.js',
    theaterDelete: 'modules/phone-theater/delete-service.js',
};

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function extractFunctionBody(source, name, pattern) {
    const match = pattern.exec(source);
    assert(match, `未找到 ${name}`);

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

function extractNamedFunction(source, name) {
    return extractFunctionBody(source, name, new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*{`));
}

function evaluateNamedFunctions(source, names = []) {
    const functionSource = names.map((name) => extractNamedFunction(source, name)).join('\n');
    return Function(`${functionSource}\nreturn { ${names.join(', ')} };`)();
}

function assertRowIndexes(actual, expected, label) {
    const actualJson = JSON.stringify(actual);
    const expectedJson = JSON.stringify(expected);
    assert(actualJson === expectedJson, `${label} 期望 ${expectedJson}，实际 ${actualJson}`);
}

function assertDeleteRowIndexResult(actual, expected, label) {
    [
        'requestedRowIndexes',
        'attemptedRowIndexes',
        'deletedRowIndexes',
        'failedRowIndexes',
        'unattemptedRowIndexes',
        'notDeletedRowIndexes',
    ].forEach((field) => {
        assertRowIndexes(actual[field], expected[field], `${label}.${field}`);
    });
}

const sources = Object.fromEntries(
    Object.entries(files).map(([key, relativePath]) => [key, read(relativePath)]),
);

const repositoryBody = extractFunctionBody(
    sources.repository,
    'deleteTableRowsBatch',
    /export\s+async\s+function\s+deleteTableRowsBatch\s*\([^)]*\)\s*{/
);
assert(sources.repository.includes('function buildBatchDeleteRowIndexResult({'), 'table-repository 必须集中构建批量删除行索引结果');
assert(sources.repository.includes('unattemptedRowIndexes: requested.filter((rowIndex) => !attemptedSet.has(rowIndex)),'), 'table-repository 必用 requested-attempted 计算未尝试行');
assert(sources.repository.includes('notDeletedRowIndexes: requested.filter((rowIndex) => !deletedSet.has(rowIndex)),'), 'table-repository 必须用 requested-deleted 计算未删除行');
assertOrdered(repositoryBody, [
    'const attemptedRowIndexes = [];',
    'attemptedRowIndexes.push(uiRowIndex);',
    'failedRowIndexes.push(uiRowIndex);',
    'break;',
    'const batchRowIndexes = buildBatchDeleteRowIndexResult({',
    'attemptedRowIndexes,',
    'deletedRowIndexes,',
    'failedRowIndexes,',
    'const allDeleted = batchRowIndexes.notDeletedRowIndexes.length === 0 && failedRowIndexes.length === 0;',
], 'deleteTableRowsBatch 必须区分已尝试失败、未尝试和未删除行');
assert(!repositoryBody.includes('failedRowIndexes: normalizedRowIndexes'), 'deleteTableRowsBatch 前置失败不得把 requested 写入 failedRowIndexes');

const { buildBatchDeleteRowIndexResult } = evaluateNamedFunctions(
    sources.repository,
    ['normalizeDeleteRowIndexes', 'buildBatchDeleteRowIndexResult'],
);
assertDeleteRowIndexResult(buildBatchDeleteRowIndexResult({ requestedRowIndexes: [1, 2, 3] }), {
    requestedRowIndexes: [3, 2, 1],
    attemptedRowIndexes: [],
    deletedRowIndexes: [],
    failedRowIndexes: [],
    unattemptedRowIndexes: [3, 2, 1],
    notDeletedRowIndexes: [3, 2, 1],
}, 'table-repository 前置失败矩阵');
assertDeleteRowIndexResult(buildBatchDeleteRowIndexResult({
    requestedRowIndexes: [5, 4, 3],
    attemptedRowIndexes: [5, 4],
    deletedRowIndexes: [5],
    failedRowIndexes: [4],
}), {
    requestedRowIndexes: [5, 4, 3],
    attemptedRowIndexes: [5, 4],
    deletedRowIndexes: [5],
    failedRowIndexes: [4],
    unattemptedRowIndexes: [3],
    notDeletedRowIndexes: [4, 3],
}, 'table-repository 部分失败矩阵');

const projectionBody = extractFunctionBody(
    sources.projection,
    'deletePhoneSheetRows',
    /export\s+async\s+function\s+deletePhoneSheetRows\s*\([^)]*\)\s*{/
);
assert(sources.projection.includes('function buildPhoneDeleteRowIndexResult({'), 'message-projection 必须集中构建批量删除行索引结果');
assertOrdered(projectionBody, [
    'const resultAttemptedRowIndexes = Array.isArray(result.attemptedRowIndexes)',
    'attemptedRowIndexes: resultAttemptedRowIndexes,',
    'unattemptedRowIndexes: result.unattemptedRowIndexes,',
    'notDeletedRowIndexes: result.notDeletedRowIndexes,',
], 'deletePhoneSheetRows 失败分支必须透传新增行索引字段');
assertOrdered(projectionBody, [
    'attemptedRowIndexes: resultAttemptedRowIndexes.length > 0 ? resultAttemptedRowIndexes : normalizedRowIndexes,',
    'unattemptedRowIndexes: result.unattemptedRowIndexes || [],',
    'notDeletedRowIndexes: result.notDeletedRowIndexes || [],',
], 'deletePhoneSheetRows 成功分支必须返回同形新增行索引字段');
assert(!projectionBody.includes('failedRowIndexes: requestedFallbackRowIndexes') && !projectionBody.includes('failedRowIndexes: normalizedRowIndexes'), 'deletePhoneSheetRows 前置失败不得把 requested 写入 failedRowIndexes');

const { buildPhoneDeleteRowIndexResult } = evaluateNamedFunctions(
    sources.projection,
    ['normalizePhoneDeleteRowIndexes', 'buildPhoneDeleteRowIndexResult'],
);
assertDeleteRowIndexResult(buildPhoneDeleteRowIndexResult({ requestedRowIndexes: [1, 2, 3] }), {
    requestedRowIndexes: [3, 2, 1],
    attemptedRowIndexes: [],
    deletedRowIndexes: [],
    failedRowIndexes: [],
    unattemptedRowIndexes: [3, 2, 1],
    notDeletedRowIndexes: [3, 2, 1],
}, 'message-projection 前置失败矩阵');
assertDeleteRowIndexResult(buildPhoneDeleteRowIndexResult({
    requestedRowIndexes: [5, 4, 3],
    attemptedRowIndexes: [5, 4],
    deletedRowIndexes: [5],
    failedRowIndexes: [4],
}), {
    requestedRowIndexes: [5, 4, 3],
    attemptedRowIndexes: [5, 4],
    deletedRowIndexes: [5],
    failedRowIndexes: [4],
    unattemptedRowIndexes: [3],
    notDeletedRowIndexes: [4, 3],
}, 'message-projection 部分失败矩阵');

const rowDeleteBody = extractFunctionBody(
    sources.rowDelete,
    'deleteRowsFromList',
    /const\s+deleteRowsFromList\s*=\s*async\s*\([^)]*\)\s*=>\s*{/
);
assertOrdered(rowDeleteBody, [
    'const failedRowIndexes = normalizeRowIndexes(result.failedRowIndexes || []);',
    'const fallbackNotDeletedRowIndexes = requestedRowIndexes.filter((rowIndex) => !deletedRowIndexes.includes(rowIndex));',
    'const notDeletedRowIndexes = normalizeRowIndexes(result.notDeletedRowIndexes || fallbackNotDeletedRowIndexes);',
    'const unattemptedRowIndexes = normalizeRowIndexes(result.unattemptedRowIndexes || notDeletedRowIndexes.filter((rowIndex) => !failedRowIndexes.includes(rowIndex)));',
    'const notDeletedViewRowIndexes = remapRemainingRowIndexes(notDeletedRowIndexes, deletedRowIndexes);',
    'state.setSelectedDeleteRowIndexes(notDeletedViewRowIndexes);',
], 'row-delete-controller 必须用未删除集合维护选择状态');

const normalizeDeleteOutcomeBody = extractFunctionBody(
    sources.listController,
    'normalizeDeleteOutcome',
    /function\s+normalizeDeleteOutcome\s*\([^)]*\)\s*{/
);
assertOrdered(normalizeDeleteOutcomeBody, [
    'const notDeletedRowIndexes = normalizeRowIndexes(',
    'const notDeletedViewRowIndexes = normalizeRowIndexes(result.notDeletedViewRowIndexes || notDeletedRowIndexes);',
    'attemptedRowIndexes: normalizeRowIndexes(result.attemptedRowIndexes || []),',
    'unattemptedRowIndexes,',
    'notDeletedRowIndexes,',
    'notDeletedViewRowIndexes,',
], 'list-page-controller 必须归一化并透传新增行索引字段');
assert(sources.listController.includes('|| deleteOutcome.notDeletedViewRowIndexes.length > 0;'), 'list-page-controller toast 必须使用未删除 view 集合判断部分失败');

assert(sources.messageViewer.includes('function remapRemainingMessageRowIndexes('), 'message-viewer 必须显式 remap 消息页未删除行到 view 坐标');
const { remapRemainingMessageRowIndexes } = evaluateNamedFunctions(
    sources.messageViewer,
    ['normalizeMessageRowIndexes', 'remapRemainingMessageRowIndexes'],
);
assertRowIndexes(remapRemainingMessageRowIndexes([5, 4], [3]), [3, 4], 'message-viewer 删除较小索引后的 raw->view remap');
assertRowIndexes(remapRemainingMessageRowIndexes([4, 3], [5]), [3, 4], 'message-viewer 删除较大索引时 raw->view remap 不偏移');
assertRowIndexes(remapRemainingMessageRowIndexes([2, 2, 1], []), [1, 2], 'message-viewer raw->view remap 去重并保留未删除坐标');

const messageDeleteBody = extractFunctionBody(
    sources.messageViewer,
    'executeDeleteSelectedMessages',
    /const\s+executeDeleteSelectedMessages\s*=\s*async\s*\([^)]*\)\s*=>\s*{/
);
assertOrdered(messageDeleteBody, [
    'const notDeletedRawRowIndexes = Array.isArray(result.notDeletedRowIndexes)',
    ': failedRowIndexes;',
    'const notDeletedViewRowIndexes = Array.isArray(result.notDeletedViewRowIndexes)',
    ': remapRemainingMessageRowIndexes(notDeletedRawRowIndexes, deletedRowIndexes);',
    'setSelectedMessageRowIndexes(notDeletedViewRowIndexes);',
], 'message-viewer 必须用 remap 后的 view 坐标回选部分失败消息');
assert(!messageDeleteBody.includes('setSelectedMessageRowIndexes(notDeletedRowIndexes);'), 'message-viewer 不得使用 raw notDeletedRowIndexes 回选 UI');

const theaterBody = extractFunctionBody(
    sources.theaterDelete,
    'executeTheaterDeletionPlans',
    /async\s+function\s+executeTheaterDeletionPlans\s*\([^)]*\)\s*{/
);
assertOrdered(theaterBody, [
    'const notDeletedPlans = [',
    '...collectTheaterNotDeletedPlans(results),',
    '...collectUnattemptedTheaterNotDeletedPlans(orderedPlans.slice(planIndex + 1)),',
    'notDeletedPlans,',
    'notDeletedRowsBySheetKey: buildTheaterNotDeletedRowsBySheetKey(notDeletedPlans),',
], 'delete-service 必须归集剧场各计划未删除行');
assert(sources.theaterDelete.includes('attempted: false,') && sources.theaterDelete.includes("reason: 'unattempted_after_previous_failure'"), 'delete-service 必须标记小剧场后续未执行计划');

console.log('[table-delete-partial-failure-contract-check] 检查通过');
console.log('- OK | 批量删除 partial failure 区分 attempted/unattempted/notDeleted');
console.log('- OK | 通用列表、消息页、小剧场均按契约消费 notDeleted/view 行索引');

