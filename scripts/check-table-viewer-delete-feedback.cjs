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
assert(outcomeBody.includes('return { ok, deleted, message, refreshed, viewSynced };'), '删除结果 helper 必须保留 ok/deleted/message/refreshed/viewSynced 字段');

const deleteBody = extractFunctionBody(
    rowDelete,
    'deleteRowFromList',
    /const\s+deleteRowFromList\s*=\s*async\s*\([^)]*\)\s*=>\s*{/
);
assert(deleteBody.includes('return createDeleteOutcome({ message });'), '前置校验失败必须返回结构化失败结果');
assert(deleteBody.includes('showInlineToast(container, message, true);'), '前置校验失败必须使用错误样式');
assertOrdered(deleteBody, [
    'const result = await deletePhoneSheetRows(sheetKey, [rowIndex], {',
    'if (!result.ok) {',
    'return createDeleteOutcome({ message, refreshed: result.refreshed ?? null });',
], 'deleteRowFromList 删除失败结构化返回');
assertOrdered(deleteBody, [
    'applyLockStateAfterRowDelete(sheetKey, rowIndex);',
    'if (!isViewerActive()) {',
    'return createDeleteOutcome({',
    'deleted: true,',
    'refreshed: result.refreshed ?? null,',
], 'deleteRowFromList inactive 成功路径必须保留 refreshed');
assertOrdered(deleteBody, [
    'const synced = syncRowsFromSheet();',
    'const message = result.message || \'删除成功\';',
    'if (!synced) {',
    'viewSynced: false,',
], 'deleteRowFromList 必须区分本地视图同步失败');
assert(deleteBody.includes('refreshed: result.refreshed ?? null,'), 'deleteRowFromList 成功路径必须透传 refreshed');
assert(!/return\s+true\s*;/.test(deleteBody), 'deleteRowFromList 不能再把成功压缩为裸 true');
assert(!/return\s+false\s*;/.test(deleteBody), 'deleteRowFromList 不能再把失败压缩为裸 false');

const normalizeBody = extractFunctionBody(
    listController,
    'normalizeDeleteOutcome',
    /function\s+normalizeDeleteOutcome\s*\([^)]*\)\s*{/
);
assert(normalizeBody.includes('refreshed: result.refreshed ?? null,'), 'list controller 必须保留 refreshed 字段');
assert(normalizeBody.includes('viewSynced: result.viewSynced ?? null,'), 'list controller 必须保留 viewSynced 字段');

const handleBody = extractFunctionBody(
    listController,
    'handleDeleteRow',
    /async\s+function\s+handleDeleteRow\s*\([^)]*\)\s*{/
);
assert(handleBody.includes('let deleteOutcome = normalizeDeleteOutcome(false);'), 'handleDeleteRow 必须使用结构化删除结果变量');
assert(!handleBody.includes('deleted = !!(await context.deleteRowFromList(idx));'), 'handleDeleteRow 不能再把删除结果强转成布尔值');
assert(!handleBody.includes("context.showInlineToast(container, '删除成功');"), 'handleDeleteRow 不能固定展示删除成功');
assertOrdered(handleBody, [
    'deleteOutcome = normalizeDeleteOutcome(await context.deleteRowFromList(idx));',
    'if (deleteOutcome.deleted && isGenericListContextActive(context)) {',
    'const toastIsError = deleteOutcome.refreshed === false || deleteOutcome.viewSynced === false;',
    'context.showInlineToast(container, toastMessage, toastIsError);',
], 'handleDeleteRow 必须根据 refreshed/viewSynced 选择 toast 样式');
assertOrdered(handleBody, [
    'if (deleteOutcome.deleted) {',
    'refreshListAfterDataMutation(container);',
], 'handleDeleteRow 仍只能在实际删除后刷新列表');
assert(handleBody.includes("context.showInlineToast(container, `删除异常: ${err?.message || '未知错误'}`, true);"), 'handleDeleteRow 异常必须使用错误样式');

console.log('[table-viewer-delete-feedback-check] 检查通过');
console.log('- OK | 通用表删除结果保留 ok/deleted/message/refreshed/viewSynced');
console.log('- OK | 通用表外层不再把删除结果强转为布尔值');
console.log('- OK | 通用表投影刷新失败或视图同步失败会使用异常样式');
