const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = {
    rowDelete: 'modules/table-viewer/row-delete-controller.js',
    listController: 'modules/table-viewer/list-page-controller.js',
    sharedUi: 'modules/table-viewer/shared-ui.js',
};

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
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

const sources = Object.fromEntries(
    Object.entries(files).map(([key, relativePath]) => [key, read(relativePath)]),
);

const rowDelete = sources.rowDelete;
const listController = sources.listController;
const sharedUi = sources.sharedUi;

assert(
    /export\s+function\s+showInlineToast\s*\(container,\s*msg,\s*isError\s*=\s*false\)/.test(sharedUi),
    'showInlineToast 必须继续支持 isError 参数，删除反馈依赖异常样式',
);
assert(
    sharedUi.includes("el.className = `phone-inline-toast ${isError ? 'is-error' : 'is-success'}`.trim();"),
    'showInlineToast 必须把 isError 映射到 is-error 样式',
);

const outcomeBody = extractFunctionBody(
    rowDelete,
    'createDeleteOutcome',
    /function\s+createDeleteOutcome\s*\([^)]*\)\s*{/
);
assert(outcomeBody.includes('ok,') && outcomeBody.includes('deleted,') && outcomeBody.includes('message,') && outcomeBody.includes('refreshed,') && outcomeBody.includes('viewSynced,'), '删除结果 helper 必须保留 ok/deleted/message/refreshed/viewSynced 字段');
assert(outcomeBody.includes('deletedCount,') && outcomeBody.includes('requestedRowIndexes,') && outcomeBody.includes('deletedRowIndexes,') && outcomeBody.includes('failedRowIndexes,') && outcomeBody.includes('attemptedRowIndexes,') && outcomeBody.includes('unattemptedRowIndexes,') && outcomeBody.includes('notDeletedRowIndexes,') && outcomeBody.includes('failedViewRowIndexes,') && outcomeBody.includes('unattemptedViewRowIndexes,') && outcomeBody.includes('notDeletedViewRowIndexes,'), '删除结果 helper 必须透传批量行级删除的部分失败字段和 UI view 字段');

const preflightBody = extractFunctionBody(
    rowDelete,
    'createDeletePreflightFailureOutcome',
    /function\s+createDeletePreflightFailureOutcome\s*\([^)]*\)\s*{/
);
assertOrdered(preflightBody, [
    'requestedRowIndexes,',
    'failedRowIndexes: [],',
    'unattemptedRowIndexes: requestedRowIndexes,',
    'notDeletedRowIndexes: requestedRowIndexes,',
    'failedViewRowIndexes: [],',
    'unattemptedViewRowIndexes: requestedRowIndexes,',
    'notDeletedViewRowIndexes: requestedRowIndexes,',
], '前置校验失败必须同形返回未尝试和未删除行，且不得污染 failedRowIndexes');

const deleteBody = extractFunctionBody(
    rowDelete,
    'deleteRowsFromList',
    /const\s+deleteRowsFromList\s*=\s*async\s*\([^)]*\)\s*=>\s*{/
);
assert(deleteBody.includes('return createDeleteOutcome({ message });'), '未选择条目时必须返回结构化失败结果');
assert(deleteBody.includes('showInlineToast(container, message, true);'), '前置校验失败必须使用错误样式');
assert(deleteBody.includes('return createDeletePreflightFailureOutcome(message, requestedRowIndexes);'), '前置校验失败必须透传请求行、未尝试行与未删除行');
assertOrdered(deleteBody, [
    'const result = await deletePhoneSheetRows(sheetKey, requestedRowIndexes, {',
    'const deletedRowIndexes = normalizeRowIndexes(result.deletedRowIndexes || []);',
    'const failedRowIndexes = normalizeRowIndexes(result.failedRowIndexes || []);',
    'const fallbackNotDeletedRowIndexes = requestedRowIndexes.filter((rowIndex) => !deletedRowIndexes.includes(rowIndex));',
    'const notDeletedRowIndexes = normalizeRowIndexes(result.notDeletedRowIndexes || fallbackNotDeletedRowIndexes);',
    'const attemptedRowIndexes = normalizeRowIndexes(result.attemptedRowIndexes || [...deletedRowIndexes, ...failedRowIndexes]);',
    'const unattemptedRowIndexes = normalizeRowIndexes(result.unattemptedRowIndexes || notDeletedRowIndexes.filter((rowIndex) => !failedRowIndexes.includes(rowIndex)));',
    'const hasDeletion = deletedRowIndexes.length > 0;',
    'const failedViewRowIndexes = remapRemainingRowIndexes(failedRowIndexes, deletedRowIndexes);',
    'const unattemptedViewRowIndexes = remapRemainingRowIndexes(unattemptedRowIndexes, deletedRowIndexes);',
    'const notDeletedViewRowIndexes = remapRemainingRowIndexes(notDeletedRowIndexes, deletedRowIndexes);',
], 'deleteRowsFromList 必须使用批量行级删除结果并重映射失败、未尝试和未删除 view 行');
assertOrdered(deleteBody, [
    'if (!result.ok && !hasDeletion) {',
    'if (isViewerActive()) {',
    'syncRowsFromSheet();',
    'showInlineToast(container, message, true);',
    'return createDeleteOutcome({',
    'failedRowIndexes,',
    'attemptedRowIndexes,',
    'unattemptedRowIndexes,',
    'notDeletedRowIndexes,',
    'failedViewRowIndexes: failedRowIndexes,',
    'unattemptedViewRowIndexes: unattemptedRowIndexes,',
    'notDeletedViewRowIndexes: notDeletedRowIndexes,',
], 'deleteRowsFromList 删除失败结构化返回并只在 active 时同步旧 UI');
assertOrdered(deleteBody, [
    'if (hasDeletion) {',
    'applyLockStateAfterRowsDelete(sheetKey, deletedRowIndexes);',
    'if (!isViewerActive()) {',
    'return createDeleteOutcome({',
    'deleted: hasDeletion,',
    'refreshed: result.refreshed ?? null,',
], 'deleteRowsFromList 成功或部分成功后必须先重排锁状态并阻断 inactive UI 回写');
assertOrdered(deleteBody, [
    'const synced = syncRowsFromSheet();',
    "const message = result.message || (deletedRowIndexes.length > 1 ? `已删除 ${deletedRowIndexes.length} 条记录` : '删除成功');",
    'if (!synced) {',
    'viewSynced: false,',
], 'deleteRowsFromList 必须区分本地视图同步失败');
assertOrdered(deleteBody, [
    'if (rows.length === 0) {',
    'selectedDeleteRowIndexes: [],',
    '} else if (notDeletedViewRowIndexes.length > 0) {',
    'state.setSelectedDeleteRowIndexes(notDeletedViewRowIndexes);',
    '} else {',
    'state.clearDeleteSelection();',
], 'deleteRowsFromList 成功后必须按空表、未删除 view 集合、全成功维护删除选择状态');
assert(deleteBody.includes('refreshed: result.refreshed ?? null,'), 'deleteRowsFromList 成功路径必须透传 refreshed');
assert(!/return\s+true\s*;/.test(deleteBody), 'deleteRowsFromList 不能把成功压缩为裸 true');
assert(!/return\s+false\s*;/.test(deleteBody), 'deleteRowsFromList 不能把失败压缩为裸 false');

const normalizeBody = extractFunctionBody(
    listController,
    'normalizeDeleteOutcome',
    /function\s+normalizeDeleteOutcome\s*\([^)]*\)\s*{/
);
assert(normalizeBody.includes('refreshed: result.refreshed ?? null,'), 'list controller 必须保留 refreshed 字段');
assert(normalizeBody.includes('viewSynced: result.viewSynced ?? null,'), 'list controller 必须保留 viewSynced 字段');
assert(normalizeBody.includes('deletedCount: Number(result.deletedCount || 0),'), 'list controller 必须保留批量删除数量字段');
assert(normalizeBody.includes('const failedRowIndexes = normalizeRowIndexes(result.failedRowIndexes || []);'), 'list controller 必须保留已尝试失败行字段');
assert(normalizeBody.includes('const unattemptedRowIndexes = normalizeRowIndexes(result.unattemptedRowIndexes || []);'), 'list controller 必须归一化未尝试行字段');
assert(normalizeBody.includes('const notDeletedRowIndexes = normalizeRowIndexes('), 'list controller 必须归一化未删除行字段');
assert(normalizeBody.includes('const notDeletedViewRowIndexes = normalizeRowIndexes(result.notDeletedViewRowIndexes || notDeletedRowIndexes);'), 'list controller 必须归一化未删除 view 行字段');
assert(normalizeBody.includes('attemptedRowIndexes: normalizeRowIndexes(result.attemptedRowIndexes || []),'), 'list controller 必须保留已尝试行字段');
assert(normalizeBody.includes('unattemptedRowIndexes,'), 'list controller 必须保留未尝试行字段');
assert(normalizeBody.includes('notDeletedRowIndexes,'), 'list controller 必须优先透传未删除行字段');
assert(normalizeBody.includes('notDeletedViewRowIndexes,'), 'list controller 必须透传未删除 view 行字段');

const handleBody = extractFunctionBody(
    listController,
    'executeDeleteSelectedRows',
    /async\s+function\s+executeDeleteSelectedRows\s*\([^)]*\)\s*{/
);
assert(handleBody.includes('let deleteOutcome = normalizeDeleteOutcome(false);'), 'executeDeleteSelectedRows 必须使用结构化删除结果变量');
assert(!handleBody.includes('deleted = !!(await context.deleteRowsFromList(rowIndexes));'), 'executeDeleteSelectedRows 不能把删除结果强转成布尔值');
assert(!handleBody.includes("context.showInlineToast(container, '删除成功');"), 'executeDeleteSelectedRows 不能固定展示删除成功');
assertOrdered(handleBody, [
    'deleteOutcome = normalizeDeleteOutcome(await context.deleteRowsFromList(rowIndexes));',
    'if (deleteOutcome.deleted && isGenericListContextActive(context)) {',
    'const toastIsError = deleteOutcome.refreshed === false',
    '|| deleteOutcome.viewSynced === false',
    '|| deleteOutcome.notDeletedViewRowIndexes.length > 0;',
    'context.showInlineToast(container, toastMessage, toastIsError);',
], 'executeDeleteSelectedRows 必须根据 refreshed/viewSynced/notDeletedViewRowIndexes 选择 toast 样式');
assertOrdered(handleBody, [
    'if (deleteOutcome.deleted) {',
    'refreshListAfterDataMutation(container);',
], 'executeDeleteSelectedRows 仍只能在实际删除后刷新列表');
assert(handleBody.includes("context.showInlineToast(container, `删除异常: ${err?.message || '未知错误'}`, true);"), 'executeDeleteSelectedRows 异常必须使用错误样式');

console.log('[table-viewer-delete-feedback-check] 检查通过');
console.log('- OK | 通用表批量删除结果保留 ok/deleted/message/refreshed/viewSynced');
console.log('- OK | 通用表外层不再把删除结果强转为布尔值');
console.log('- OK | 通用表投影刷新失败、视图同步失败或部分失败会使用异常样式');
