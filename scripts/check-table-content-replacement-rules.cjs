const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

async function main() {
    const modulePath = path.resolve(__dirname, '..', 'modules', 'table-content-replacement', 'rules.js');
    const {
        validateReplacementRule,
        validateReplacementRules,
        applyLiteralRulesToRow,
    } = await import(pathToFileURL(modulePath).href);

    assert.deepStrictEqual(
        validateReplacementRule({ source: '你好', target: '你好' }),
        { valid: false, code: 'source_target_equal' },
        'source 与 target 相同时必须拒绝',
    );

    assert.deepStrictEqual(
        validateReplacementRule({ source: '你好', target: '你好呀' }),
        { valid: false, code: 'target_contains_source' },
        'target 包含 source 时必须拒绝膨胀规则',
    );

    assert.strictEqual(
        validateReplacementRule({ source: '  ', target: '' }).valid,
        true,
        '只包含空白但长度大于 0 的 source 必须允许',
    );

    const duplicateErrors = validateReplacementRules([
        { id: 'a', source: '同名', target: '一' },
        { id: 'b', source: '同名', target: '二' },
    ]);
    assert.deepStrictEqual(
        duplicateErrors.map(error => error.code),
        ['duplicate_source', 'duplicate_source'],
        '同一区域重复 source 的两条规则都必须被识别',
    );

    const result = applyLiteralRulesToRow(
        ['你好你好', 42, 'row-1'],
        ['内容', '数量', 'row_id'],
        [{ source: '你好', target: '不好' }],
    );
    assert.deepStrictEqual(
        result,
        { row: ['不好不好', 42, 'row-1'], changedCellCount: 1 },
        '只替换文本数据单元格，且同一单元格内全部替换',
    );

    console.log('[通过] 表格内容词汇替换规则 seam');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});


