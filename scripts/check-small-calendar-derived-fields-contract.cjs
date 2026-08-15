const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const LIVE_PATH = path.join(ROOT, 'modules', 'phone-theater', 'scenes', 'live.js');
const DIARY_PATH = path.join(ROOT, 'modules', 'phone-theater', 'scenes', 'diary.js');
const SQL_PATH = path.join(ROOT, 'modules', 'phone-core', 'derived-fields', 'small-calendar-derived-fields-sql.js');
const RUNTIME_PATH = path.join(ROOT, 'modules', 'phone-core', 'derived-fields', 'small-calendar-derived-fields.js');
const SERVICE_PATH = path.join(ROOT, 'modules', 'phone-core', 'derived-fields', 'derived-field-service.js');
const BACKGROUND_SERVICES_PATH = path.join(ROOT, 'modules', 'phone-core', 'background-services.js');
const LIFECYCLE_PATH = path.join(ROOT, 'modules', 'phone-core', 'lifecycle.js');
const TABLE_CANDIDATE_RESOLVER_PATH = path.join(ROOT, 'modules', 'phone-core', 'derived-fields', 'table-candidate-resolver.js');

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
    const serviceSource = read(SERVICE_PATH);
    const backgroundServicesSource = read(BACKGROUND_SERVICES_PATH);
    const lifecycleSource = read(LIFECYCLE_PATH);
    const tableCandidateResolverSource = read(TABLE_CANDIDATE_RESOLVER_PATH);
    const sqlMod = await import(pathToFileURL(SQL_PATH).href);
    const runtimeMod = await import(pathToFileURL(RUNTIME_PATH).href);

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
    assert.deepStrictEqual(
        sqlMod.SMALL_CALENDAR_DERIVED_FIELDS_TABLES,
        ['xiaorilibiao', 'small_calendar_days'],
        '小日历候选表必须保持拼音优先与旧表兼容回退顺序',
    );

    const signatureSql = sqlMod.buildSmallCalendarDerivedFieldsSignatureSql();
    const updateSql = sqlMod.buildSmallCalendarDerivedFieldsUpdateSql();
    const pinyinSignatureSql = sqlMod.buildSmallCalendarDerivedFieldsSignatureSql('xiaorilibiao');
    const pinyinUpdateSql = sqlMod.buildSmallCalendarDerivedFieldsUpdateSql('xiaorilibiao');
    const allSql = `${signatureSql}\n${updateSql}\n${pinyinSignatureSql}\n${pinyinUpdateSql}`;


    ['small_calendar_days', 'date_text', 'weekday_text', 'month_days', '星期一', '星期日', 'source_signature', 'input_signature', 'pending_update_count'].forEach((needle) => {
        assertIncludes(allSql, needle, `小日历 SQL 必须包含派生字段合同片段：${needle}`);
    });
    ['date(TRIM(date_text)) = TRIM(date_text)', 'strftime'].forEach((needle) => {
        assertIncludes(allSql, needle, `小日历 SQL 必须保留日期校验/复杂计算片段：${needle}`);
    });
    ['sqlite_master', 'pragma_table_info', 'buildSmallCalendarDerivedFieldsAvailabilitySql'].forEach((needle) => {
        assertNotIncludes(sqlSource, needle, `小日历 SQL builder 不得保留旧物理 schema gate：${needle}`);
    });
    assertIncludes(updateSql, 'row_id AS target_row_id', '小日历 mutation 必须为计算结果声明稳定目标行身份');
    assertIncludes(updateSql, 'FROM computed_calendar_fields', '小日历 mutation 必须通过 UPDATE ... FROM 一次连接计算结果');
    assertIncludes(updateSql, 'WHERE row_id = computed_calendar_fields.target_row_id', '小日历 mutation 必须通过无表名前缀的 row_id 对号写回');
    assertNotIncludes(updateSql, 'small_calendar_days.row_id', '小日历 mutation 不得把逻辑表名硬编码为目标行限定符');
    assertIncludes(pinyinSignatureSql, 'FROM xiaorilibiao', '小日历 signature SQL 必须支持拼音目标表');
    assertIncludes(pinyinUpdateSql, 'UPDATE xiaorilibiao', '小日历 update SQL 必须支持拼音目标表');
    assert.ok(!/;\s*\S/.test(signatureSql), 'signature SQL 禁止分号串多语句');
    assert.ok(!/;\s*\S/.test(updateSql), 'update SQL 禁止分号串多语句');

    assertIncludes(signatureSql, 'SELECT CAST(row_id AS TEXT) || char(31) || date_text AS source_part', '小日历 source_signature 必须只包含 row_id/date_text 业务源');
    assertIncludes(
        signatureSql,
        'SELECT CAST(row_id AS TEXT) || char(31) || date_text || char(31) || weekday_text || char(31) || month_days AS signature_part',
        '小日历完整 input_signature 必须包含 row_id/date_text/weekday_text/month_days',
    );
    assertIncludes(signatureSql, 'pending_updates AS (', '小日历 signature SQL 必须计算待更新行集合');
    assertIncludes(signatureSql, 'COALESCE((SELECT COUNT(*) FROM pending_updates), 0) AS pending_update_count', '小日历 signature SQL 必须输出 pending_update_count');

    [
        'createDerivedFieldService',
        'readDerivedField',
        'querySqlViaApi',
        'getTableAvailabilityViaApi',
        'queryTableRowsViaApi',
        'executeSqlMutationViaApi',
        'subscribeTableUpdate',
        'subscribeTableFillStart',
        'resolveSmallCalendarDerivedFieldsContext',
        'resolveContext: resolveSmallCalendarDerivedFieldsContext',
        'resolveFirstAvailableTableCandidate',
        'tableNames: SMALL_CALENDAR_DERIVED_FIELDS_TABLES',
        'columns: SMALL_CALENDAR_DERIVED_FIELDS_REQUIRED_COLUMNS',
        "readDerivedField(result, 'source_signature', 0)",
        "readDerivedField(result, 'input_signature', 1)",
        "readDerivedField(result, 'pending_update_count', 4)",
        'maxMutationAttempts: 2',
        'startSmallCalendarDerivedFieldsInjection',
        'stopSmallCalendarDerivedFieldsInjection',
    ].forEach((needle) => {
        assertIncludes(runtimeSource, needle, `小日历适配器必须包含共享调度接线合同：${needle}`);
    });
    assertIncludes(tableCandidateResolverSource, 'limit: 1', '候选表逻辑列检查必须使用最小读取范围');
    ['notificationVersion', 'DEBOUNCE_MS = 600', 'runtime.running'].forEach((needle) => {
        assertNotIncludes(runtimeSource, needle, `小日历适配器不得重新复制共享调度实现：${needle}`);
    });

    [
        'const DEFAULT_DEBOUNCE_MS = 600;',
        'notificationVersion',
        'runtime.running',
        'if (pre.pendingUpdateCount === 0)',
        'post.sourceSignature === pre.sourceSignature',
        'runtime.mutationAttempts >= maxMutationAttempts',
        'runtime.mutationCircuitOpen = true;',
    ].forEach((needle) => {
        assertIncludes(serviceSource, needle, `共享派生服务必须包含小日历调度合同：${needle}`);
    });
    assertIncludes(serviceSource, "typeof config.resolveContext === 'function'", '共享派生服务必须支持异步 context resolver');
    assertIncludes(serviceSource, 'await config.resolveContext(deps, {', '共享派生服务必须等待 context resolver 完成并传入暂停检查');

    const readyCalls = [];
    const ready = await runtimeMod.resolveSmallCalendarDerivedFieldsContext({
        getTableAvailability: async () => ({ status: 'present' }),
        queryTableRows: async (options) => {
            readyCalls.push({ ...options, columns: [...options.columns] });
            return { ok: true, code: 'ok', rows: [], columns: [], values: [], rowCount: 0 };
        },
    });
    assert.deepStrictEqual(ready, { status: 'ready', context: { tableName: 'xiaorilibiao' } }, '拼音小日历表只要逻辑列可访问就必须进入 ready');
    assert.deepStrictEqual(readyCalls, [{
        tableName: 'xiaorilibiao',
        columns: [...sqlMod.SMALL_CALENDAR_DERIVED_FIELDS_REQUIRED_COLUMNS],
        limit: 1,
    }], '小日历 context resolver 必须先通过 queryTableRows 检查拼音候选表');

    const legacyFallbackCalls = [];
    const legacyFallback = await runtimeMod.resolveSmallCalendarDerivedFieldsContext({
        getTableAvailability: async (tableName) => ({ status: tableName === 'xiaorilibiao' ? 'absent' : 'present' }),
        queryTableRows: async (options) => {
            legacyFallbackCalls.push({ ...options, columns: [...options.columns] });
            return { ok: true, code: 'ok', rows: [], columns: [], values: [], rowCount: 0 };
        },
    });
    assert.deepStrictEqual(legacyFallback, { status: 'ready', context: { tableName: 'small_calendar_days' } }, '拼音小日历表缺失时必须回退旧表');
    assert.deepStrictEqual(legacyFallbackCalls.map((call) => call.tableName), ['small_calendar_days'], '已知缺失的拼音小日历表不得调用 queryTableRows');

    const absentCalls = [];
    const absent = await runtimeMod.resolveSmallCalendarDerivedFieldsContext({
        getTableAvailability: async () => ({ status: 'absent' }),
        queryTableRows: async (options) => {
            absentCalls.push(options);
            return { ok: false, code: 'table_not_found', message: 'small_calendar_days missing' };
        },
    });
    assert.deepStrictEqual(absent, { status: 'completed' }, '小日历表缺失必须静默跳过');
    assert.deepStrictEqual(absentCalls, [], '小日历表缺失时不得调用 queryTableRows');

    let unavailableQueried = false;
    const unavailable = await runtimeMod.resolveSmallCalendarDerivedFieldsContext({
        getTableAvailability: async () => ({ status: 'unavailable' }),
        queryTableRows: async () => {
            unavailableQueried = true;
            return { ok: false, code: 'runtime_not_ready', message: 'runtime warming' };
        },
    });
    assert.deepStrictEqual(unavailable, { status: 'runtime-not-ready' }, '小日历快照不可用必须交给共享服务等待');
    assert.strictEqual(unavailableQueried, false, '小日历快照不可用时不得调用 queryTableRows');

    const structural = await runtimeMod.resolveSmallCalendarDerivedFieldsContext({
        getTableAvailability: async () => ({ status: 'present' }),
        queryTableRows: async () => ({ ok: false, code: 'column_not_resolved', message: 'month_days missing' }),
    });
    assert.strictEqual(structural.status, 'completed', '小日历结构缺失必须安全跳过');
    assert.strictEqual(structural.warning?.action, 'small-calendar-derived-fields.schema-blocked', '小日历结构阻断必须使用稳定 warning action');

    const runtimeNotReady = await runtimeMod.resolveSmallCalendarDerivedFieldsContext({
        getTableAvailability: async () => ({ status: 'present' }),
        queryTableRows: async () => ({ ok: false, code: 'runtime_not_ready', message: 'runtime warming' }),
    });
    assert.deepStrictEqual(runtimeNotReady, { status: 'runtime-not-ready' }, '小日历 runtime 暂不可用必须交给共享服务等待');

    const transientFailure = { ok: false, code: 'query_failed', message: 'temporary read failure' };
    const queryFailed = await runtimeMod.resolveSmallCalendarDerivedFieldsContext({
        getTableAvailability: async () => ({ status: 'present' }),
        queryTableRows: async () => transientFailure,
    });
    assert.strictEqual(queryFailed.status, 'query-failed', '小日历非结构读取失败必须进入查询重试语义');
    assert.strictEqual(queryFailed.result, transientFailure, '小日历查询失败必须保留 repository 归一化结果');

    const lateMissing = await runtimeMod.resolveSmallCalendarDerivedFieldsContext({
        getTableAvailability: async () => ({ status: 'present' }),
        queryTableRows: async () => ({ ok: false, code: 'table_not_found', message: 'runtime schema stale' }),
    });
    assert.deepStrictEqual(lateMissing, { status: 'completed' }, '小日历查询阶段的缺表回退也必须静默');

    ['sqlite_master', 'pragma_table_info', 'probeSqliteCapabilityViaApi'].forEach((needle) => {
        assertNotIncludes(`${runtimeSource}\n${sqlSource}`, needle, `小日历派生链路不得保留旧物理 schema 探测：${needle}`);
    });

    ['startSmallCalendarDerivedFieldsInjection', 'stopSmallCalendarDerivedFieldsInjection', './derived-fields/small-calendar-derived-fields.js'].forEach((needle) => {
        assertIncludes(backgroundServicesSource, needle, `后台服务必须接入小日历派生字段启动/停止：${needle}`);
    });
    ['startSmallCalendarDerivedFieldsInjection', 'stopSmallCalendarDerivedFieldsInjection'].forEach((needle) => {
        assertNotIncludes(lifecycleSource, needle, `UI lifecycle 不得直接拥有后台小日历派生器：${needle}`);
    });

    console.log('[check-small-calendar-derived-fields-contract] 小日历 queryTableRows context resolver / 复杂 SQL 派生 / 直播旧字段 / 小日记 PS 合同检查通过');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
