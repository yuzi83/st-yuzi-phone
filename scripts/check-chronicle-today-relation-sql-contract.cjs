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

async function main() {
    const builderSource = fs.readFileSync(BUILDER_PATH, 'utf8');
    const mod = await import(pathToFileURL(BUILDER_PATH).href);
    const signatureSql = mod.buildChronicleTodayRelationSignatureSql();
    const updateSql = mod.buildChronicleTodayRelationUpdateSql();
    const debugSql = mod.buildChronicleInvalidTimeSpanDebugSql();
    const currentStatusSignatureSql = mod.buildChronicleTodayRelationSignatureSql('current_status');
    const currentStatusUpdateSql = mod.buildChronicleTodayRelationUpdateSql('current_status');
    const anchorSql = mod.buildChronicleTodayRelationAnchorTableSql();
    const allSql = `${signatureSql}\n${updateSql}\n${debugSql}\n${currentStatusSignatureSql}\n${currentStatusUpdateSql}`;

    assert.ok(Array.isArray(mod.CHRONICLE_TODAY_RELATION_ANCHOR_TABLES), 'SQL builder 必须导出集中 today anchor 表白名单数组');
    assert.deepStrictEqual(
        mod.CHRONICLE_TODAY_RELATION_ANCHOR_TABLES,
        ['global_state', 'current_status'],
        'today anchor 英文物理表名白名单必须集中维护并保持 global_state/current_status 优先级',
    );
    assert.deepStrictEqual(
        mod.CHRONICLE_TODAY_RELATION_ANCHOR_REQUIRED_COLUMNS,
        ['row_id', 'cur_time'],
        'today anchor 统一 schema 要求必须集中声明 row_id/cur_time',
    );
    assertIncludes(anchorSql, "VALUES ('global_state', 0), ('current_status', 1)", 'anchor SQL 必须由集中配置生成 global_state/current_status 候选 VALUES');
    assertIncludes(anchorSql, 'candidate_anchor_tables', 'anchor SQL 必须只从候选白名单选表，不得扫描全部 cur_time 表');
    assertIncludes(anchorSql, 'sqlite_master', 'anchor SQL 必须检查候选表存在');
    mod.CHRONICLE_TODAY_RELATION_ANCHOR_REQUIRED_COLUMNS.forEach((columnName) => {
        assertIncludes(anchorSql, `WHERE name = '${columnName}'`, `anchor SQL 必须从统一 required columns 配置生成 ${columnName} schema 检查`);
    });

    ['WITH', 'UPDATE chronicle', 'today_relation', 'global_state', 'current_status', 'cur_time', 'time_span', 'julianday', 'new_relation IS NOT NULL'].forEach((needle) => {
        assertIncludes(allSql, needle, `SQL builder 必须包含 ${needle}`);
    });
    assertIncludes(signatureSql, `FROM ${mod.CHRONICLE_TODAY_RELATION_ANCHOR_TABLES[0]}`, '默认 signature SQL 必须使用白名单第一项 global_state 锚点');
    assertIncludes(updateSql, `FROM ${mod.CHRONICLE_TODAY_RELATION_ANCHOR_TABLES[0]}`, '默认 update SQL 必须使用白名单第一项 global_state 锚点');
    assertIncludes(currentStatusSignatureSql, 'FROM current_status', 'signature SQL 必须支持 current_status 锚点表');
    assertIncludes(currentStatusUpdateSql, 'FROM current_status', 'update SQL 必须支持 current_status 锚点表');
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

    assertNotIncludes(allSql, 'UPDATE FROM', 'SQL builder 禁止 UPDATE FROM');
    assertNotIncludes(allSql, 'UPDATE ... FROM', 'SQL builder 禁止 UPDATE FROM 变体');
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

    console.log('[通过] 纪要 today_relation SQL 合同：集中锚点表白名单、global_state/current_status、批量 UPDATE、无多语句、文案桶正负方向通过');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
