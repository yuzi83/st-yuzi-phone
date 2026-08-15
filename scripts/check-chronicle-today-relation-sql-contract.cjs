const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const BUILDER_PATH = path.join(ROOT, 'modules', 'phone-core', 'derived-fields', 'chronicle-today-relation-sql.js');

function assertIncludes(source, needle, message) {
    assert.ok(source.includes(needle), message);
}

function assertNotIncludes(source, needle, message) {
    assert.ok(!source.includes(needle), message);
}

function assertSignatureContract(signatureSql, anchorTable) {
    assertIncludes(signatureSql, `FROM ${anchorTable}`, `signature SQL 必须使用 ${anchorTable} 锚点表`);
    assertIncludes(
        signatureSql,
        'SELECT CAST(row_id AS TEXT) || char(31) || time_span AS source_part',
        'chronicle source_signature 必须包含 row_id/time_span 业务源',
    );
    assertIncludes(
        signatureSql,
        'SELECT CAST(row_id AS TEXT) || char(31) || time_span || char(31) || today_relation AS signature_part',
        'chronicle 完整 input_signature 必须包含 row_id/time_span/today_relation',
    );
    assertIncludes(
        signatureSql,
        "COALESCE((SELECT cur_time FROM current_anchor), '') || char(29) || COALESCE((SELECT group_concat(source_part, char(30)) FROM ordered_sources), '') AS source_signature",
        'chronicle source_signature 必须包含锚点 cur_time 与有序业务源',
    );
    assertIncludes(
        signatureSql,
        "COALESCE((SELECT cur_time FROM current_anchor), '') || char(29) || COALESCE((SELECT group_concat(signature_part, char(30)) FROM ordered_inputs), '') AS input_signature",
        'chronicle input_signature 必须包含锚点 cur_time 与完整有序输入',
    );
    assertIncludes(signatureSql, 'pending_updates AS (', 'chronicle signature SQL 必须计算待更新行集合');
    assertIncludes(
        signatureSql,
        'COALESCE((SELECT COUNT(*) FROM pending_updates), 0) AS pending_update_count',
        'chronicle signature SQL 必须输出 pending_update_count',
    );
}

async function main() {
    const builderSource = fs.readFileSync(BUILDER_PATH, 'utf8');
    const mod = await import(pathToFileURL(BUILDER_PATH).href);
    const signatureSql = mod.buildChronicleTodayRelationSignatureSql();
    const updateSql = mod.buildChronicleTodayRelationUpdateSql();
    const debugSql = mod.buildChronicleInvalidTimeSpanDebugSql();
    const currentStatusSignatureSql = mod.buildChronicleTodayRelationSignatureSql('current_status');
    const currentStatusUpdateSql = mod.buildChronicleTodayRelationUpdateSql('current_status');
    const pinyinSignatureSql = mod.buildChronicleTodayRelationSignatureSql('quanjushujubiao', 'jiyaobiao');
    const pinyinUpdateSql = mod.buildChronicleTodayRelationUpdateSql('quanjushujubiao', 'jiyaobiao');
    const pinyinDebugSql = mod.buildChronicleInvalidTimeSpanDebugSql('jiyaobiao');
    const allSql = `${signatureSql}\n${updateSql}\n${debugSql}\n${currentStatusSignatureSql}\n${currentStatusUpdateSql}\n${pinyinSignatureSql}\n${pinyinUpdateSql}\n${pinyinDebugSql}`;

    assert.ok(Array.isArray(mod.CHRONICLE_TODAY_RELATION_ANCHOR_TABLES), 'SQL builder 必须导出集中 today anchor 表白名单数组');
    assert.deepStrictEqual(
        mod.CHRONICLE_TODAY_RELATION_ANCHOR_TABLES,
        ['quanjushujubiao', 'global_state', 'current_status'],
        'today anchor 候选表必须保持拼音优先与英文兼容回退顺序',
    );
    assert.deepStrictEqual(mod.CHRONICLE_TODAY_RELATION_TABLES, ['jiyaobiao', 'chronicle'], '纪要目标表候选必须保持拼音优先与英文兼容回退顺序');
    assert.deepStrictEqual(
        mod.CHRONICLE_TODAY_RELATION_ANCHOR_REQUIRED_COLUMNS,
        ['row_id', 'cur_time'],
        'today anchor 统一 schema 要求必须集中声明 row_id/cur_time',
    );
    assert.deepStrictEqual(mod.CHRONICLE_TODAY_RELATION_REQUIRED_COLUMNS, ['row_id', 'time_span', 'today_relation'], 'chronicle 逻辑表必需列必须集中声明');
    [
        'buildChronicleTodayRelationSchemaGateSql',
        'buildChronicleTodayRelationAnchorTableSql',
        'sqlite_master',
        'pragma_table_info',
    ].forEach((needle) => {
        assertNotIncludes(builderSource, needle, `SQL builder 不得保留旧物理 schema gate：${needle}`);
    });

    ['WITH', 'UPDATE chronicle', 'UPDATE jiyaobiao', 'today_relation', 'quanjushujubiao', 'global_state', 'current_status', 'cur_time', 'time_span', 'julianday', 'new_relation IS NOT NULL', 'source_signature', 'input_signature', 'pending_update_count'].forEach((needle) => {
        assertIncludes(allSql, needle, `SQL builder 必须包含 ${needle}`);
    });
    assertSignatureContract(signatureSql, 'global_state');
    assertSignatureContract(currentStatusSignatureSql, 'current_status');
    assertSignatureContract(pinyinSignatureSql, 'quanjushujubiao');
    assertIncludes(signatureSql, 'FROM global_state', '默认 signature SQL 必须继续兼容 global_state 锚点');
    assertIncludes(updateSql, 'FROM global_state', '默认 update SQL 必须继续兼容 global_state 锚点');
    assertIncludes(currentStatusSignatureSql, 'FROM current_status', 'signature SQL 必须支持 current_status 锚点表');
    assertIncludes(currentStatusUpdateSql, 'FROM current_status', 'update SQL 必须支持 current_status 锚点表');
    assertIncludes(pinyinSignatureSql, 'FROM quanjushujubiao', 'signature SQL 必须支持全局数据表拼音锚点');
    assertIncludes(pinyinSignatureSql, 'FROM jiyaobiao', 'signature SQL 必须支持纪要表拼音目标');
    assertIncludes(pinyinUpdateSql, 'UPDATE jiyaobiao', 'update SQL 必须支持纪要表拼音目标');
    assertIncludes(pinyinDebugSql, 'FROM jiyaobiao', 'debug SQL 必须支持纪要表拼音目标');
    [
        'YYYY-MM-DD HH:MM ~ YYYY-MM-DD HH:MM',
        'non-ISO rows are treated as invalid inputs',
        'Broader legacy',
    ].forEach((needle) => {
        assertIncludes(builderSource, needle, `SQL builder 源码必须明确严格 ISO time_span 产品边界：${needle}`);
    });
    [
        "WHEN INSTR(time_span, '~') > 0 THEN date(SUBSTR(TRIM(SUBSTR(time_span, INSTR(time_span, '~') + 1)), 1, 10))",
        'date(SUBSTR(TRIM(time_span), 1, 10))',
    ].forEach((needle) => {
        assertIncludes(allSql, needle, `SQL builder 输出 SQL 必须固化严格 ISO time_span 解析边界：${needle}`);
    });
    ['一周', '半个月', '三周', '半年'].forEach((needle) => {
        assertIncludes(allSql, needle, `SQL builder 必须覆盖文案 ${needle}`);
    });

    assertIncludes(updateSql, 'row_id AS target_row_id', 'chronicle mutation 必须为计算结果声明稳定目标行身份');
    assertIncludes(updateSql, 'SET today_relation = computed_relation.new_relation', 'chronicle mutation 必须直接消费单次计算结果');
    assertIncludes(updateSql, 'FROM computed_relation', 'chronicle mutation 必须通过 UPDATE ... FROM 一次连接计算结果');
    assertIncludes(updateSql, 'WHERE row_id = computed_relation.target_row_id', 'chronicle mutation 必须通过无表名前缀的 row_id 对号写回');
    assertNotIncludes(updateSql, 'chronicle.row_id', 'chronicle mutation 不得把逻辑表名硬编码为目标行限定符');
    assert.ok(!/;\s*\S/.test(signatureSql), 'signature SQL 禁止分号串多语句');
    assert.ok(!/;\s*\S/.test(updateSql), 'update SQL 禁止分号串多语句');
    assert.ok(!/;\s*\S/.test(debugSql), 'debug SQL 禁止分号串多语句');
    assert.throws(() => mod.buildChronicleTodayRelationSignatureSql('行号'), /Unsupported chronicle today_relation anchor table/, 'signature builder 必须拒绝把中文行号误当锚点表');
    assert.throws(() => mod.buildChronicleTodayRelationUpdateSql('chronicle; DROP TABLE chronicle'), /Unsupported chronicle today_relation anchor table/, 'update builder 必须拒绝非白名单锚点表');


    const relationCases = [
        [-720, '两年后'],
        [-540, '一年半后'],
        [-360, '一年后'],
        [-180, '半年后'],
        [-179, '五个半月后'],
        [-30, '一个月后'],
        [-29, '29天后'],
        [-22, '22天后'],
        [-21, '三周后'],
        [-20, '20天后'],
        [-16, '16天后'],
        [-15, '半个月后'],
        [-14, '14天后'],
        [-8, '8天后'],
        [-7, '一周后'],
        [-6, '6天后'],
        [-4, '4天后'],
        [-3, '3天后'],
        [-2, '后天'],
        [-1, '明天'],
        [0, '今天'],
        [1, '昨天'],
        [2, '前天'],
        [3, '3天前'],
        [4, '4天前'],
        [6, '6天前'],
        [7, '一周前'],
        [8, '8天前'],
        [14, '14天前'],
        [15, '半个月前'],
        [16, '16天前'],
        [20, '20天前'],
        [21, '三周前'],
        [22, '22天前'],
        [29, '29天前'],
        [30, '一个月前'],
        [45, '一个半月前'],
        [60, '两个月前'],
        [165, '五个半月前'],
        [179, '五个半月前'],
        [180, '半年前'],
        [359, '半年前'],
        [360, '一年前'],
        [540, '一年半前'],
        [720, '两年前'],
    ];

    relationCases.forEach(([diffDays, expected]) => {
        const actual = diffDays === 0
            ? '今天'
            : mod.formatRelativeDayNumberForContract(Math.abs(diffDays), diffDays > 0 ? '前' : '后');
        assert.strictEqual(actual, expected, `diffDays=${diffDays} 文案必须为 ${expected}`);
    });

    console.log('[通过] 纪要 today_relation SQL 合同：无旧 schema gate、集中逻辑表列契约、复杂 signature/批量 UPDATE、文案桶正负方向通过');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
