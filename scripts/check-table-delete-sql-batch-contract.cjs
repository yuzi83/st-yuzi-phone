const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const FILES = {
    repository: 'modules/phone-core/data-api/table-repository.js',
    architectureGuide: 'docs/architecture-guide.md',
    rowDelete: 'modules/table-viewer/row-delete-controller.js',
    theaterDelete: 'modules/phone-theater/delete-service.js',
};

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function has(content, snippet) {
    return content.includes(snippet);
}

function check(results, fileKey, description, ok) {
    results.push({ file: FILES[fileKey], description, ok });
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

function extractNamedFunction(source, name) {
    return extractFunctionBody(source, name, new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*{`));
}

function evaluateNamedFunctions(source, names = []) {
    const functionSource = names.map((name) => extractNamedFunction(source, name)).join('\n');
    return Function(`${functionSource}\nreturn { ${names.join(', ')} };`)();
}

function assertDeleteDiagnostics(actual, expected, label) {
    for (const [field, value] of Object.entries(expected)) {
        const actualJson = JSON.stringify(actual[field]);
        const expectedJson = JSON.stringify(value);
        assert(actualJson === expectedJson, `${label}.${field} 期望 ${expectedJson}，实际 ${actualJson}`);
    }
}

function main() {
    const contents = Object.fromEntries(
        Object.entries(FILES).map(([key, relativePath]) => [key, read(relativePath)])
    );
    const results = [];

    check(results, 'repository', 'deleteTableRowsBatch 仍通过 enqueueTableMutation 执行', has(contents.repository, "return enqueueTableMutation('deleteTableRowsBatch', async () => {"));
    check(results, 'repository', '仍集中构建批量删除行索引结果', has(contents.repository, 'function buildBatchDeleteRowIndexResult({'));
    check(results, 'repository', '旧 deleteRow fallback helper 存在', has(contents.repository, 'function deleteRowsViaLegacyDeleteRowLoop('));
    check(results, 'repository', 'fallback 仍调用 callDeleteRowApi', has(contents.repository, 'callDeleteRowApi(api, safeTableName, dbRowIndex)'));
    check(results, 'repository', '存在 executeSqlMutation 快路径', has(contents.repository, 'executeSqlMutation'));
    check(results, 'repository', 'SQL 快路径构造单条 DELETE FROM', has(contents.repository, 'DELETE FROM'));
    check(results, 'repository', 'SQL 快路径按 row_id IN 删除', has(contents.repository, 'WHERE row_id IN ('));
    check(results, 'repository', 'SQL 快路径使用参数占位符', has(contents.repository, "Array(rowCount).fill('?').join(', ')"));
    check(results, 'repository', 'rowIndex 必须从 content[rowIndex + 1] 映射 row_id', has(contents.repository, 'content[rowIndex + 1]'));
    check(results, 'repository', '物理表名必须经安全标识符校验', has(contents.repository, 'function isSafeSqlIdentifier('));
    check(results, 'repository', 'SQL partial 已可能写入时不得 fallback', has(contents.repository, 'shouldFallback: false') && has(contents.repository, 'partial_unknown'));
    check(results, 'repository', 'diagnostics 暴露删除策略', has(contents.repository, 'deleteStrategy') && has(contents.repository, 'fallbackReason'));
    check(results, 'repository', 'SQL 快路径有参数上限预检，超限时在执行前 fallback', has(contents.repository, 'const SQL_DELETE_MAX_BOUND_PARAMS = 900;') && has(contents.repository, "fallbackReason: 'sql_param_limit_exceeded'"));
    check(results, 'repository', 'SQL mutation 归一化识别 ok:false', has(contents.repository, "'ok' in result && result.ok === false"));
    check(results, 'repository', '早退分支统一构造批量删除 diagnostics', has(contents.repository, 'function buildDeleteBatchDiagnostics({') && has(contents.repository, 'diagnostics: buildDeleteBatchDiagnostics({ tableName: safeTableName'));
    check(results, 'repository', '禁止 executeSqlBatch 主路径', !has(contents.repository, 'executeSqlBatch'));
    check(results, 'repository', '禁止 executeSql 自动分流主路径', !has(contents.repository, 'executeSql('));

    const { normalizeDeleteRowIndexes, buildDeleteBatchDiagnostics, normalizeSqlDeleteMutationResult } = evaluateNamedFunctions(contents.repository, ['normalizeDeleteRowIndexes', 'buildDeleteBatchDiagnostics', 'normalizeSqlDeleteMutationResult']);
    assertDeleteDiagnostics(buildDeleteBatchDiagnostics({ tableName: 'messages', deleteStrategy: 'none', fallbackReason: 'empty_selection', requestedRowIndexes: [1, 3, 3] }), { tableName: 'messages', deleteStrategy: 'none', fallbackReason: 'empty_selection', requestedRowIndexes: [3, 1] }, 'buildDeleteBatchDiagnostics');
    assert(normalizeSqlDeleteMutationResult({ ok: false, code: 'mutation_failed', message: 'boom' }).ok === false, 'normalizeSqlDeleteMutationResult 必须保留 ok:false 失败语义');

    check(results, 'architectureGuide', 'Theater 文档说明 scene 不拼 SQL', has(contents.architectureGuide, '小剧场 scene 只收集删除计划，不拼 SQL。'));
    check(results, 'architectureGuide', 'Theater 文档说明不做跨表 SQL/事务删除', has(contents.architectureGuide, '当前不做跨表单条 SQL，不承诺跨表事务原子性。'));
    check(results, 'theaterDelete', '小剧场仍按表调用 deleteTableRowsBatch', has(contents.theaterDelete, 'const result = await deleteTableRowsBatch(plan.tableName, plan.rowIndexes, {'));
    check(results, 'rowDelete', '通用表格仍通过 deletePhoneSheetRows 进入仓库层', has(contents.rowDelete, 'const result = await deletePhoneSheetRows(sheetKey, requestedRowIndexes, {'));

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[table-delete-sql-batch-contract-check] 检查失败：');
        for (const item of failed) console.error(`- ${item.file}: ${item.description}`);
        process.exitCode = 1;
        return;
    }

    console.log('[table-delete-sql-batch-contract-check] 检查通过');
    for (const item of results) console.log(`- OK | ${item.file} | ${item.description}`);
}

main();
