const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function importModule(relativePath) {
    const href = pathToFileURL(path.join(ROOT, relativePath)).href;
    return import(`${href}?contract=${Date.now()}-${Math.random()}`);
}

async function testSqlScalarUsesPublicReadOnlyQueryAdapter() {
    const { renderShujukuTemplate } = await importModule(
        'modules/worldbook-reading/shujuku-template-renderer.js',
    );
    const rendered = await renderShujukuTemplate(
        '总数量: {[sql "SELECT SUM(quantity) FROM inventory"]}',
        {
            async querySql() {
                return {
                    columns: ['SUM(quantity)'],
                    values: [[9]],
                    rows: [{ 'SUM(quantity)': 9 }],
                };
            },
        },
    );

    assert.equal(rendered, '总数量: 9');
}

async function testMissingDatabaseRuntimePreservesTemplateVerbatim() {
    const { renderShujukuTemplate } = await importModule(
        'modules/worldbook-reading/shujuku-template-renderer.js',
    );
    const source = '总数量: {[sql "SELECT SUM(quantity) FROM inventory"]}';

    const rendered = await renderShujukuTemplate(source, {});

    assert.equal(rendered, source);
}

async function testSqlAliasIsVisibleOnlyInsideOneRenderCall() {
    const { renderShujukuTemplate } = await importModule(
        'modules/worldbook-reading/shujuku-template-renderer.js',
    );
    const runtime = {
        async querySql() {
            return { columns: ['total'], values: [[9]], rows: [{ total: 9 }] };
        },
    };

    const first = await renderShujukuTemplate(
        '{[sql "SELECT SUM(quantity) FROM inventory" as total]}总数=$v:total',
        runtime,
    );
    const second = await renderShujukuTemplate('总数=$v:total', runtime);

    assert.deepEqual([first, second], ['总数=9', '总数=$v:total']);
}

async function testOrmWhereGetUsesReadOnlyQueryAdapter() {
    const { renderShujukuTemplate } = await importModule(
        'modules/worldbook-reading/shujuku-template-renderer.js',
    );
    const rendered = await renderShujukuTemplate(
        "你有 {[db.背包物品表.where('物品名称', '铁剑').get('数量')]} 把铁剑",
        {
            async querySql(sql, params) {
                if (sql.includes('背包物品表') && sql.includes('物品名称') && params?.[0] === '铁剑') {
                    return { columns: ['数量'], values: [[3]], rows: [{ 数量: 3 }] };
                }
                return null;
            },
        },
    );

    assert.equal(rendered, '你有 3 把铁剑');
}

async function testOrmWhereInArrayCanCountRows() {
    const { renderShujukuTemplate } = await importModule(
        'modules/worldbook-reading/shujuku-template-renderer.js',
    );
    const rendered = await renderShujukuTemplate(
        "共 {[db.背包物品表.whereIn('物品名称', ['铁剑', '魔法书']).count()]} 种目标物品",
        {
            async querySql(sql, params) {
                if (sql.includes('COUNT(*)') && params?.join('|') === '铁剑|魔法书') {
                    return { columns: ['COUNT(*)'], values: [[2]], rows: [{ 'COUNT(*)': 2 }] };
                }
                return null;
            },
        },
    );

    assert.equal(rendered, '共 2 种目标物品');
}

async function testOrmQueryModifiersProduceAList() {
    const { renderShujukuTemplate } = await importModule(
        'modules/worldbook-reading/shujuku-template-renderer.js',
    );
    const rendered = await renderShujukuTemplate(
        "结果：{[db.背包物品表.whereBetween('数量', 10, 2).whereNotIn('状态', ['禁用']).whereNotNull('名称').whereLike('名称', '%剑%').orderBy('数量', 'DESC').limit(2).offset(1).list('名称')]}",
        {
            async querySql(sql, params) {
                const complete = ['BETWEEN', 'NOT IN', 'IS NOT NULL', 'LIKE', 'ORDER BY', 'LIMIT 2', 'OFFSET 1']
                    .every((part) => sql.includes(part));
                if (complete && params?.join('|') === '2|10|禁用|%剑%') {
                    return {
                        columns: ['名称'],
                        values: [['铁剑'], ['银剑']],
                        rows: [{ 名称: '铁剑' }, { 名称: '银剑' }],
                    };
                }
                return null;
            },
        },
    );

    assert.equal(rendered, '结果：铁剑, 银剑');
}

async function testOrmOrWhereKeepsConditionGroups() {
    const { renderShujukuTemplate } = await importModule(
        'modules/worldbook-reading/shujuku-template-renderer.js',
    );
    const rendered = await renderShujukuTemplate(
        "人物：{[db.重要角色表.where('姓名', '艾莉').orWhere('姓名', '本').list('姓名')]}",
        {
            async querySql(sql, params) {
                if (sql.includes(') OR (') && params?.join('|') === '艾莉|本') {
                    return {
                        columns: ['姓名'],
                        values: [['艾莉'], ['本']],
                        rows: [{ 姓名: '艾莉' }, { 姓名: '本' }],
                    };
                }
                return null;
            },
        },
    );

    assert.equal(rendered, '人物：艾莉, 本');
}

async function testOrmGroupingDistinctHavingAndAllRows() {
    const { renderShujukuTemplate } = await importModule(
        'modules/worldbook-reading/shujuku-template-renderer.js',
    );
    const rendered = await renderShujukuTemplate(
        "{[db.背包物品表.distinct().groupBy('类别').having('COUNT(*) > 1').all()]}",
        {
            async querySql(sql) {
                if (sql.startsWith('SELECT DISTINCT') && sql.includes('GROUP BY') && sql.includes('HAVING COUNT(*) > 1')) {
                    return {
                        columns: ['类别', '数量'],
                        values: [['武器', 2], ['药剂', 3]],
                        rows: [{ 类别: '武器', 数量: 2 }, { 类别: '药剂', 数量: 3 }],
                    };
                }
                return null;
            },
        },
    );

    assert.equal(rendered, '类别: 武器, 数量: 2\n类别: 药剂, 数量: 3');
}

async function testOrmAggregateTerminals() {
    const { renderShujukuTemplate } = await importModule(
        'modules/worldbook-reading/shujuku-template-renderer.js',
    );
    const rendered = await renderShujukuTemplate(
        "总和={[db.背包物品表.sum('数量')]}，平均={[db.背包物品表.avg('数量')]}，最大={[db.背包物品表.max('数量')]}，最小={[db.背包物品表.min('数量')]}",
        {
            async querySql(sql) {
                const values = { 'SUM(': 9, 'AVG(': 3, 'MAX(': 5, 'MIN(': 1 };
                const found = Object.entries(values).find(([marker]) => sql.includes(marker));
                return found
                    ? { columns: ['value'], values: [[found[1]]], rows: [{ value: found[1] }] }
                    : null;
            },
        },
    );

    assert.equal(rendered, '总和=9，平均=3，最大=5，最小=1');
}

async function testDbCalcCanUseEarlierOrmAlias() {
    const { renderShujukuTemplate } = await importModule(
        'modules/worldbook-reading/shujuku-template-renderer.js',
    );
    const rendered = await renderShujukuTemplate(
        "{[db.背包物品表.where('物品名称', '铁剑').get('数量') as sword_count]}{[db.calc(\"$v:sword_count * 10\") as damage]}伤害: $v:damage",
        {
            async querySql(sql) {
                if (sql.startsWith('SELECT 3 * 10')) {
                    return { columns: ['value'], values: [[30]], rows: [{ value: 30 }] };
                }
                return { columns: ['数量'], values: [[3]], rows: [{ 数量: 3 }] };
            },
        },
    );

    assert.equal(rendered, '伤害: 30');
}

async function testOrmValueExpressionRunsInsideQueryContext() {
    const { renderShujukuTemplate } = await importModule(
        'modules/worldbook-reading/shujuku-template-renderer.js',
    );
    const rendered = await renderShujukuTemplate(
        "结果={[db.背包物品表.where('类别', '武器').value('SUM(数量) * 2 + 100')]}",
        {
            async querySql(sql, params) {
                if (sql.includes('SUM(数量) * 2 + 100') && params?.[0] === '武器') {
                    return { columns: ['value'], values: [[118]], rows: [{ value: 118 }] };
                }
                return null;
            },
        },
    );

    assert.equal(rendered, '结果=118');
}

async function testOrmExistsReturnsBooleanText() {
    const { renderShujukuTemplate } = await importModule(
        'modules/worldbook-reading/shujuku-template-renderer.js',
    );
    const rendered = await renderShujukuTemplate(
        "存在={[db.背包物品表.where('物品名称', '铁剑').exists()]}",
        {
            async querySql(sql) {
                if (sql.startsWith('SELECT EXISTS(')) {
                    return { columns: ['e'], values: [[1]], rows: [{ e: 1 }] };
                }
                return null;
            },
        },
    );

    assert.equal(rendered, '存在=true');
}

async function testNumericTagsRenderWithRequestLocalVariables() {
    const { renderShujukuTemplate } = await importModule(
        'modules/worldbook-reading/shujuku-template-renderer.js',
    );
    const source = '<random id="dice" min="5" max="5" />'
        + '<calc id="total" expr="$random:dice * 2 + 3" />'
        + '<max id="highest" values="$calc:total, 10, 3" />'
        + '<min id="lowest" values="$random:dice, 2, 9" />'
        + '掷骰=$random:dice;总数=$calc:total;最大=$max:highest;最小=$min:lowest';

    const first = await renderShujukuTemplate(source, {});
    const second = await renderShujukuTemplate('未定义=$calc:total', {});

    assert.deepEqual([first, second], [
        '掷骰=5;总数=13;最大=13;最小=2',
        '未定义=$calc:total',
    ]);
}

async function testNumericTagsReadCellsFromThePublicTableSnapshot() {
    const { renderShujukuTemplate } = await importModule(
        'modules/worldbook-reading/shujuku-template-renderer.js',
    );
    const rendered = await renderShujukuTemplate(
        '<calc id="boosted" expr="cell:角色属性表/勇者/攻击 + 5" />'
            + '<max id="peak" values="cell:角色属性表/勇者/攻击, $calc:boosted" />'
            + '攻击=$calc:boosted;峰值=$max:peak',
        {
            exportTableAsJson() {
                return {
                    sheet_0: {
                        name: '角色属性表',
                        content: [
                            ['姓名', '攻击'],
                            ['勇者', '25'],
                        ],
                    },
                };
            },
        },
    );

    assert.equal(rendered, '攻击=30;峰值=30');
}

async function testNestedSeedBranchesStopAfterTenLevels() {
    const { renderShujukuTemplate } = await importModule(
        'modules/worldbook-reading/shujuku-template-renderer.js',
    );
    const runtime = { seedContent: '勇者拔出铁剑，准备战斗' };
    const nested = await renderShujukuTemplate(
        '<if seed="战斗">外层<if seed="魔法">错<else>内层</if><else>外错</if>',
        runtime,
    );
    const tooDeep = `${'<if seed="战斗">'.repeat(11)}命中${'</if>'.repeat(11)}`;
    const depthLimited = await renderShujukuTemplate(tooDeep, runtime);

    assert.deepEqual([nested, depthLimited], [
        '外层内层',
        '<if seed="战斗">命中</if>',
    ]);
}

async function testCellConditionSelectsOneBranchFromTheTableSnapshot() {
    const { renderShujukuTemplate } = await importModule(
        'modules/worldbook-reading/shujuku-template-renderer.js',
    );
    const rendered = await renderShujukuTemplate(
        '<if cell="角色属性表/勇者/攻击 ≥ 25">达标<else>未达标</if>',
        {
            exportTableAsJson() {
                return {
                    sheet_0: {
                        name: '角色属性表',
                        content: [
                            ['姓名', '攻击'],
                            ['勇者', '25'],
                        ],
                    },
                };
            },
        },
    );

    assert.equal(rendered, '达标');
}

async function testThreePartCellConditionRetriesWithRowAndColumnSwapped() {
    const { renderShujukuTemplate } = await importModule(
        'modules/worldbook-reading/shujuku-template-renderer.js',
    );
    const rendered = await renderShujukuTemplate(
        '<if cell="角色属性表/攻击/勇者 == 25">命中<else>未命中</if>',
        {
            exportTableAsJson() {
                return {
                    sheet_0: {
                        name: '角色属性表',
                        content: [
                            ['姓名', '攻击'],
                            ['勇者', '25'],
                        ],
                    },
                };
            },
        },
    );

    assert.equal(rendered, '命中');
}

async function testCondCombinesSeedCellNumericAndDatabaseVariables() {
    const { renderShujukuTemplate } = await importModule(
        'modules/worldbook-reading/shujuku-template-renderer.js',
    );
    const rendered = await renderShujukuTemplate(
        '<random id="dice" min="5" max="5" />'
            + '<calc id="total" expr="10 + 5" />'
            + '{[sql "SELECT 9" as stock]}'
            + '<if cond="seed:战斗 & cell:角色属性表/勇者/攻击 >= 25 & random:dice == 5 & calc:total == 15 & v:stock == 9">'
            + '组合命中<else>组合失败</if>',
        {
            seedContent: '勇者开始战斗',
            querySql() {
                return { columns: ['stock'], values: [[9]], rows: [{ stock: 9 }] };
            },
            exportTableAsJson() {
                return {
                    sheet_0: {
                        name: '角色属性表',
                        content: [
                            ['姓名', '攻击'],
                            ['勇者', '25'],
                        ],
                    },
                };
            },
        },
    );

    assert.equal(rendered, '组合命中');
}

async function testDatabaseConditionsUseTruthyResultsAndFailClosed() {
    const { renderShujukuTemplate } = await importModule(
        'modules/worldbook-reading/shujuku-template-renderer.js',
    );
    const rendered = await renderShujukuTemplate(
        '<if db="db.背包物品表.count() > 2">有物品<else>无物品</if>|'
            + '<if sql="SELECT 1 WHERE 1=0">错误<else>正常</if>|'
            + '<if sql="SELECT * FROM missing_table">错误<else>查询降级</if>',
        {
            querySql(sql) {
                if (sql.includes('COUNT(*)')) {
                    return { columns: ['COUNT(*)'], values: [[3]], rows: [{ 'COUNT(*)': 3 }] };
                }
                if (sql === 'SELECT 1 WHERE 1=0') {
                    return { columns: ['1'], values: [[0]], rows: [{ 1: 0 }] };
                }
                return null;
            },
        },
    );

    assert.equal(rendered, '有物品|正常|查询降级');
}

async function testCondCanCombineDatabaseAndSqlSubconditions() {
    const { renderShujukuTemplate } = await importModule(
        'modules/worldbook-reading/shujuku-template-renderer.js',
    );
    const rendered = await renderShujukuTemplate(
        '<if cond="db:背包物品表.count() > 2 & sql:SELECT 1">双查询命中<else>双查询失败</if>',
        {
            querySql(sql) {
                const value = sql.includes('COUNT(*)') ? 3 : 1;
                return { columns: ['value'], values: [[value]], rows: [{ value }] };
            },
        },
    );

    assert.equal(rendered, '双查询命中');
}

async function testCondInlineRandomRangeUsesTheRequestRandomSource() {
    const { renderShujukuTemplate } = await importModule(
        'modules/worldbook-reading/shujuku-template-renderer.js',
    );
    const rendered = await renderShujukuTemplate(
        '<if cond="random:1-100 > 80">稀有事件<else>普通事件</if>',
        { random: () => 0.99 },
    );

    assert.equal(rendered, '稀有事件');
}

async function testMissingQueryRuntimePreservesDatabaseConditionsVerbatim() {
    const { renderShujukuTemplate } = await importModule(
        'modules/worldbook-reading/shujuku-template-renderer.js',
    );
    const source = '{[db.背包物品表.count()]}|'
        + '{[sql "SELECT 1"]}|'
        + '<if db="db.背包物品表.count() > 2">有<else>无</if>|'
        + '<if sql="SELECT 1">有<else>无</if>|'
        + '<if cond="seed:战斗 & db:背包物品表.count() > 2">命中<else>未命中</if>|'
        + '<if cond="seed:战斗 & sql:SELECT 1">命中<else>未命中</if>';

    const rendered = await renderShujukuTemplate(source, { seedContent: '战斗' });

    assert.equal(rendered, source);
}

async function testOrmToSqlReturnsAStatementWithoutExecutingIt() {
    const { renderShujukuTemplate } = await importModule(
        'modules/worldbook-reading/shujuku-template-renderer.js',
    );
    const rendered = await renderShujukuTemplate(
        "SQL={[db.背包物品表.where('状态', \"可'用\").orderBy('数量', 'DESC').toSQL()]}",
        {
            querySql() {
                throw new Error('toSQL must not execute');
            },
        },
    );

    assert.equal(
        rendered,
        'SQL=SELECT * FROM "背包物品表" WHERE "状态" = \'可\'\'用\' ORDER BY "数量" DESC',
    );
}

async function testOrmNegativeOffsetNormalizesToZero() {
    const { renderShujukuTemplate } = await importModule(
        'modules/worldbook-reading/shujuku-template-renderer.js',
    );
    const rendered = await renderShujukuTemplate(
        'SQL={[db.背包物品表.offset(-2).toSQL()]}',
        { querySql() { throw new Error('toSQL must not execute'); } },
    );

    assert.equal(rendered, 'SQL=SELECT * FROM "背包物品表" LIMIT -1 OFFSET 0');
}

async function testTwoPartCellConditionCanMatchAnyValueInAColumn() {
    const { renderShujukuTemplate } = await importModule(
        'modules/worldbook-reading/shujuku-template-renderer.js',
    );
    const rendered = await renderShujukuTemplate(
        '<if cell="角色属性表/数值 > 50">有高属性<else>无高属性</if>',
        {
            exportTableAsJson() {
                return {
                    sheet_0: {
                        name: '角色属性表',
                        content: [
                            ['属性', '数值'],
                            ['攻击', '25'],
                            ['生命', '80'],
                        ],
                    },
                };
            },
        },
    );

    assert.equal(rendered, '有高属性');
}

async function testMissingTableRuntimePreservesCellTemplatesVerbatim() {
    const { renderShujukuTemplate } = await importModule(
        'modules/worldbook-reading/shujuku-template-renderer.js',
    );
    const cellOnly = '<if cell="角色属性表/勇者/攻击 > 20">命中<else>未命中</if>';
    const calcCellOnly = '<calc id="boosted" expr="cell:角色属性表/勇者/攻击 + 5" />'
        + '攻击=$calc:boosted';

    const rendered = await Promise.all([
        renderShujukuTemplate(cellOnly, {}),
        renderShujukuTemplate(calcCellOnly, {}),
    ]);

    assert.deepEqual(rendered, [cellOnly, calcCellOnly]);
}

async function testMalformedRandomTagStaysVerbatim() {
    const { renderShujukuTemplate } = await importModule(
        'modules/worldbook-reading/shujuku-template-renderer.js',
    );
    const source = '<random id="dice" max="5" />结果=$random:dice';

    const rendered = await renderShujukuTemplate(source, { random: () => 0 });

    assert.equal(rendered, source);
}

async function testOrmTerminalMethodMustBeLast() {
    const { renderShujukuTemplate } = await importModule(
        'modules/worldbook-reading/shujuku-template-renderer.js',
    );
    const rendered = await renderShujukuTemplate(
        "非法={[db.背包物品表.get('数量').where('状态', '可用')]}",
        {
            querySql() {
                return { columns: ['数量'], values: [[3]], rows: [{ 数量: 3 }] };
            },
        },
    );

    assert.equal(rendered, '非法=');
}

async function testSqlAliasMustUseAValidIdentifier() {
    const { renderShujukuTemplate } = await importModule(
        'modules/worldbook-reading/shujuku-template-renderer.js',
    );
    const source = '{[sql "SELECT 9" as 9bad]}值=$v:9bad';
    const rendered = await renderShujukuTemplate(source, {
        querySql() {
            throw new Error('invalid SQL alias must not execute');
        },
    });

    assert.equal(rendered, source);
}

async function main() {
    await testSqlScalarUsesPublicReadOnlyQueryAdapter();
    await testMissingDatabaseRuntimePreservesTemplateVerbatim();
    await testSqlAliasIsVisibleOnlyInsideOneRenderCall();
    await testOrmWhereGetUsesReadOnlyQueryAdapter();
    await testOrmWhereInArrayCanCountRows();
    await testOrmQueryModifiersProduceAList();
    await testOrmOrWhereKeepsConditionGroups();
    await testOrmGroupingDistinctHavingAndAllRows();
    await testOrmAggregateTerminals();
    await testDbCalcCanUseEarlierOrmAlias();
    await testOrmValueExpressionRunsInsideQueryContext();
    await testOrmExistsReturnsBooleanText();
    await testNumericTagsRenderWithRequestLocalVariables();
    await testNumericTagsReadCellsFromThePublicTableSnapshot();
    await testNestedSeedBranchesStopAfterTenLevels();
    await testCellConditionSelectsOneBranchFromTheTableSnapshot();
    await testThreePartCellConditionRetriesWithRowAndColumnSwapped();
    await testCondCombinesSeedCellNumericAndDatabaseVariables();
    await testDatabaseConditionsUseTruthyResultsAndFailClosed();
    await testCondCanCombineDatabaseAndSqlSubconditions();
    await testCondInlineRandomRangeUsesTheRequestRandomSource();
    await testMissingQueryRuntimePreservesDatabaseConditionsVerbatim();
    await testOrmToSqlReturnsAStatementWithoutExecutingIt();
    await testOrmNegativeOffsetNormalizesToZero();
    await testTwoPartCellConditionCanMatchAnyValueInAColumn();
    await testMissingTableRuntimePreservesCellTemplatesVerbatim();
    await testMalformedRandomTagStaysVerbatim();
    await testOrmTerminalMethodMustBeLast();
    await testSqlAliasMustUseAValidIdentifier();
    console.log('[shujuku-template-renderer-contract] passed');
}

main().catch((error) => {
    console.error('[shujuku-template-renderer-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
