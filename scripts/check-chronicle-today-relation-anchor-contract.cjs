const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_PATH = path.join(ROOT, 'modules', 'phone-core', 'derived-fields', 'chronicle-today-relation.js');
const SQL_BUILDER_PATH = path.join(ROOT, 'modules', 'phone-core', 'derived-fields', 'chronicle-today-relation-sql.js');
const DATA_API_PATH = path.join(ROOT, 'modules', 'phone-core', 'data-api.js');

function read(filePath) {
    return fs.readFileSync(filePath, 'utf8');
}

function assertIncludes(source, needle, message) {
    assert.ok(source.includes(needle), message);
}

function assertNotIncludes(source, needle, message) {
    assert.ok(!source.includes(needle), message);
}

async function main() {
    const source = read(SOURCE_PATH);
    const builder = read(SQL_BUILDER_PATH);
    const dataApi = read(DATA_API_PATH);
    const sourceModule = await import(pathToFileURL(SOURCE_PATH).href);
    const builderModule = await import(pathToFileURL(SQL_BUILDER_PATH).href);

    assertIncludes(source, 'querySqlViaApi', '派生器必须通过 data-api 查询 SQL signature');
    assertIncludes(source, 'executeSqlMutationViaApi', '派生器必须通过 data-api 执行 SQL mutation');
    assertIncludes(source, 'buildChronicleTodayRelationSignatureSql', '派生器必须使用 signature SQL builder');
    assertIncludes(source, 'buildChronicleTodayRelationUpdateSql', '派生器必须使用 UPDATE SQL builder');
    assertIncludes(source, 'MAX_SIGNATURE_RETRY = 1', '派生器必须使用一次有界 signature 重试');
    assertIncludes(source, 'runtime.lastInputSignature', '派生器必须保留输入签名缓存');
    assertIncludes(source, 'runtime.lastInvalidWarningSignature', '派生器必须对 invalid time_span warning 去重');
    assertIncludes(source, "from '../data-api.js'", '派生器必须只通过 data-api facade 调 repository');

    assertIncludes(dataApi, 'querySqlViaApi', 'data-api facade 必须导出 querySqlViaApi');
    assertIncludes(dataApi, 'executeSqlMutationViaApi', 'data-api facade 必须导出 executeSqlMutationViaApi');

    assertIncludes(source, 'export const ANCHOR_TABLE_SQL = buildChronicleTodayRelationAnchorTableSql()', '派生器必须导出由集中配置生成的 today anchor SQL，供执行级合同复用单一 SQL 来源');
    assertIncludes(source, 'CHRONICLE_TODAY_RELATION_ANCHOR_TABLES', '派生器必须复用集中 today anchor 表配置');
    assertIncludes(builder, 'export const CHRONICLE_TODAY_RELATION_ANCHOR_TABLES', 'SQL builder 必须导出集中 today anchor 表白名单配置');
    assertIncludes(builder, 'buildChronicleTodayRelationAnchorTableSql', 'SQL builder 必须提供 today anchor SQL 生成器');
    assertIncludes(builder, 'candidate_anchor_tables', 'SQL builder 必须通过候选锚点表集合选择 today anchor');
    assertIncludes(builder, 'pragma_table_info(candidate_anchor_tables.name)', 'SQL builder 必须检查候选锚点表 schema 能力');
    assertIncludes(builder, 'buildRequiredColumnChecksSql', 'SQL builder 必须由统一 required columns 配置生成 schema 检查');
    assertIncludes(builder, 'CHRONICLE_TODAY_RELATION_ANCHOR_REQUIRED_COLUMNS', 'SQL builder 必须集中声明 today anchor 统一所需列');
    assertIncludes(builder, "formatSqlStringLiteral(columnName)", 'SQL builder 必须用统一 required columns 生成列名 SQL 字面量');
    assertIncludes(builder, 'ORDER BY priority', 'SQL builder 必须按配置顺序优先使用 global_state，缺失或 schema 不完整时再使用 current_status');
    assertIncludes(source, 'anchor-missing', '派生器必须在缺少 today anchor 表时明确告警');
    assertIncludes(builder, 'normalizeChronicleTodayRelationAnchorTable', 'SQL builder 必须校验 today anchor 表名');
    assertNotIncludes(source, "VALUES ('global_state', 0), ('current_status', 1)", '派生器不得散落硬编码 today anchor VALUES，必须由集中配置生成');
    assert.deepStrictEqual(
        builderModule.CHRONICLE_TODAY_RELATION_ANCHOR_TABLES,
        ['global_state', 'current_status'],
        'today anchor 英文物理表名白名单必须集中维护并保持 global_state/current_status 优先级',
    );
    assert.deepStrictEqual(
        builderModule.CHRONICLE_TODAY_RELATION_ANCHOR_REQUIRED_COLUMNS,
        ['row_id', 'cur_time'],
        'today anchor 统一 schema 要求必须集中声明 row_id/cur_time',
    );
    assert.strictEqual(sourceModule.ANCHOR_TABLE_SQL, builderModule.buildChronicleTodayRelationAnchorTableSql(), '派生器导出的 ANCHOR_TABLE_SQL 必须等于 builder 由集中配置生成的 SQL');
    assertIncludes(sourceModule.ANCHOR_TABLE_SQL, "VALUES ('global_state', 0), ('current_status', 1)", '生成后的 anchor SQL 必须按优先级兼容 global_state/current_status');
    assertIncludes(builder, 'cur_time', 'SQL builder 必须读取 today anchor 表 cur_time');
    assertIncludes(builder, 'FROM chronicle', 'SQL builder 必须读取 chronicle');
    assertIncludes(builder, 'time_span', 'SQL builder 必须读取 chronicle.time_span');
    assertIncludes(builder, 'UPDATE chronicle', 'SQL builder 必须保留清晰 UPDATE chronicle');
    assertIncludes(builder, 'today_relation', 'SQL builder 必须更新 chronicle.today_relation');

    assertNotIncludes(source, 'updateTableCell', '派生器不得继续逐行调用 updateTableCell');
    assertNotIncludes(source, 'date-relation.js', '派生器不得继续依赖 JS date-relation 计算链路');
    assertNotIncludes(source, 'getTableData', '派生器不得继续读取 JS 表快照计算派生字段');
    assertNotIncludes(source, 'processTableData', '派生器不得继续解析 JS 表快照计算派生字段');
    assertNotIncludes(source, 'collectChronicleUpdates', '旧 JS collectChronicleUpdates 必须移除');
    assertNotIncludes(source, 'applyChronicleUpdates', '旧 JS applyChronicleUpdates 必须移除');
    assertNotIncludes(source, 'AutoCardUpdaterAPI', '业务派生器不得直接访问 AutoCardUpdaterAPI');
    assertNotIncludes(source, 'window.parent', '业务派生器不得直接访问 window.parent');
    assertNotIncludes(source, 'executeSqlBatch', '派生链路禁止 executeSqlBatch');
    assertNotIncludes(source, 'executeSql(', '派生链路禁止 executeSql 自动分流');
    assertNotIncludes(source, '小日历表', '与今天关系派生不得把小日历表作为 today anchor 来源');

    console.log('[通过] 纪要与今天关系锚点合同：集中英文物理表名白名单、schema 锚点、批量 UPDATE、无旧 JS 逐行写回');
}

try {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
} catch (error) {
    console.error(error);
    process.exitCode = 1;
}
