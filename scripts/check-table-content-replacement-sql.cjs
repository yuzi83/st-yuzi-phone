const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

async function main() {
    const modulePath = path.resolve(__dirname, '..', 'modules', 'table-content-replacement', 'sql.js');
    const { buildTableReplacementMutation } = await import(pathToFileURL(modulePath).href);

    const mutation = buildTableReplacementMutation({
        tableName: 'sheet_1',
        headers: ['内容', '数量', 'row_id', '备注'],
        textColumnIndexes: [0, 3],
        rules: [
            { source: '你好', target: '不好' },
            { source: '：', target: ':' },
        ],
    });

    assert.deepStrictEqual(
        mutation.columns,
        ['内容', '备注'],
        'SQL 替换必须跳过身份列和明确的非文本列',
    );
    assert.deepStrictEqual(
        mutation.params,
        ['你好', '不好', '：', ':', '你好', '不好', '：', ':', '你好', '：', '你好', '：'],
        'SQL 参数必须按 SET 规则顺序和 WHERE 匹配顺序绑定',
    );
    assert.ok(mutation.sql.includes('UPDATE "sheet_1" SET'), '必须生成目标表 UPDATE');
    assert.ok(mutation.sql.includes('CASE WHEN typeof("内容") = \'text\''), '必须只更新 SQLite 文本值');
    assert.ok(mutation.sql.includes('REPLACE(REPLACE("内容", ?, ?), ?, ?)'), '同一列规则必须按顺序嵌套');
    assert.ok(mutation.sql.includes('typeof("内容") = \'text\' AND instr("内容", ?) > 0'), '必须用 WHERE 避免无匹配写入');
    assert.ok(!mutation.sql.includes('row_id'), '身份列不得进入 UPDATE SQL');

    const mappedMutation = buildTableReplacementMutation({
        tableName: 'sheet_OptionsNew',
        headers: ['row_id', '选项一', '选项二', '选项三'],
        textColumnIndexes: [1, 2, 3],
        ddl: `CREATE TABLE options ( -- 选项表
  row_id INTEGER PRIMARY KEY, -- 行号
  option_1 TEXT NOT NULL, -- 选项一
  option_2 TEXT NOT NULL, -- 选项二
  option_3 TEXT NOT NULL -- 选项三
);`,
        rules: [{ source: '。', target: '，' }],
    });
    assert.deepStrictEqual(
        mappedMutation.columns,
        ['option_1', 'option_2', 'option_3'],
        'SQL 替换必须把显示列名映射为 DDL 中声明的物理列名',
    );
    assert.ok(mappedMutation.sql.includes('"option_1"'), 'SQL 必须使用 option_1 物理列名');
    assert.ok(!mappedMutation.sql.includes('"选项一"'), 'SQL 不得把选项一显示名当作物理列名');

    assert.strictEqual(
        buildTableReplacementMutation({ tableName: 'sheet_1', headers: ['内容'], textColumnIndexes: [0], rules: [] }),
        null,
        '没有规则时不得生成写入 SQL',
    );

    console.log('[通过] 表格内容词汇替换 SQL seam');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
