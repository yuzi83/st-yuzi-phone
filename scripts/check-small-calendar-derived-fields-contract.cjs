const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const LIVE_PATH = path.join(ROOT, 'modules', 'phone-theater', 'scenes', 'live.js');
const DIARY_PATH = path.join(ROOT, 'modules', 'phone-theater', 'scenes', 'diary.js');
const SQL_PATH = path.join(ROOT, 'modules', 'phone-core', 'derived-fields', 'small-calendar-derived-fields-sql.js');
const RUNTIME_PATH = path.join(ROOT, 'modules', 'phone-core', 'derived-fields', 'small-calendar-derived-fields.js');
const LIFECYCLE_PATH = path.join(ROOT, 'modules', 'phone-core', 'lifecycle.js');

function read(relativePath) {
    return fs.readFileSync(relativePath, 'utf8');
}

function assertIncludes(source, needle, message) {
    assert.ok(source.includes(needle), message);
}

function assertNotIncludes(source, needle, message) {
    assert.ok(!source.includes(needle), message);
}

async function main() {
    const liveSource = read(LIVE_PATH);
    const diarySource = read(DIARY_PATH);
    const sqlSource = read(SQL_PATH);
    const runtimeSource = read(RUNTIME_PATH);
    const lifecycleSource = read(LIFECYCLE_PATH);
    const sqlMod = await import(pathToFileURL(SQL_PATH).href);

    ['状态标签', '当前状态', '乐子强度', '主推角色/阵营', '正在直播', '正常滚动', "'Stage'", '>Stage<'].forEach((needle) => {
        assertNotIncludes(liveSource, needle, `直播页不得继续包含旧字段或假兜底：${needle}`);
    });
    ['剧情弹幕串', '推角弹幕串', '对线弹幕串', '弹幕热议'].forEach((needle) => {
        assertIncludes(liveSource, needle, `直播页必须保留弹幕合同：${needle}`);
    });

    ['INLINE_POSTSCRIPT_PATTERN', 'parseDiaryPostscriptBody', 'splitDiaryLineByPostscripts', 'phone-theater-diary-secret'].forEach((needle) => {
        assertIncludes(diarySource, needle, `小日记必须保留行内 PS/PPS 和秘密标记能力：${needle}`);
    });
    assertIncludes(diarySource, 'POSTSCRIPT_PATTERN', '小日记必须继续兼容行首 PS/PPS');

    assert.deepStrictEqual(
        sqlMod.SMALL_CALENDAR_DERIVED_FIELDS_REQUIRED_COLUMNS,
        ['row_id', 'date_text', 'weekday_text', 'month_days'],
        '小日历派生字段必需列必须集中声明并保持物理列名契约',
    );
    assert.strictEqual(sqlMod.SMALL_CALENDAR_DERIVED_FIELDS_TABLE, 'small_calendar_days', '小日历派生字段必须使用英文物理表名');

    const availabilitySql = sqlMod.buildSmallCalendarDerivedFieldsAvailabilitySql();
    const signatureSql = sqlMod.buildSmallCalendarDerivedFieldsSignatureSql();
    const updateSql = sqlMod.buildSmallCalendarDerivedFieldsUpdateSql();
    const allSql = `${availabilitySql}\n${signatureSql}\n${updateSql}`;


    ['small_calendar_days', 'date_text', 'weekday_text', 'month_days', '星期一', '星期日', 'source_signature', 'input_signature'].forEach((needle) => {
        assertIncludes(allSql, needle, `小日历 SQL 必须包含派生字段合同片段：${needle}`);
    });
    ['sqlite_master', 'pragma_table_info', 'date(TRIM(date_text)) = TRIM(date_text)', 'strftime'].forEach((needle) => {
        assertIncludes(allSql, needle, `小日历 SQL 必须包含可用性/日期校验片段：${needle}`);
    });
    assertNotIncludes(updateSql, 'UPDATE FROM', '小日历 SQL 禁止 UPDATE FROM');
    assert.ok(!/;\s*\S/.test(availabilitySql), 'availability SQL 禁止分号串多语句');
    assert.ok(!/;\s*\S/.test(signatureSql), 'signature SQL 禁止分号串多语句');
    assert.ok(!/;\s*\S/.test(updateSql), 'update SQL 禁止分号串多语句');

    ['querySqlViaApi', 'executeSqlMutationViaApi', 'subscribeTableUpdate', 'runtime.applying', 'runtime.pending', 'runtime.running', 'startSmallCalendarDerivedFieldsInjection', 'stopSmallCalendarDerivedFieldsInjection'].forEach((needle) => {
        assertIncludes(runtimeSource, needle, `小日历运行时必须包含监听/写入/防递归合同：${needle}`);
    });
    assertIncludes(runtimeSource, 'postSignaturePayload.sourceSignature === preSignaturePayload.sourceSignature', '小日历运行时必须用日期源签名确认写入期间源稳定');
    assertIncludes(runtimeSource, 'preSignaturePayload.inputSignature === runtime.lastInputSignature', '小日历运行时必须用完整签名避免重复写入');

    ['startSmallCalendarDerivedFieldsInjection', 'stopSmallCalendarDerivedFieldsInjection', './derived-fields/small-calendar-derived-fields.js'].forEach((needle) => {
        assertIncludes(lifecycleSource, needle, `lifecycle 必须接入小日历派生字段启动/停止：${needle}`);
    });

    console.log('[check-small-calendar-derived-fields-contract] 小日历派生字段 / 直播旧字段 / 小日记 PS 合同检查通过');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
