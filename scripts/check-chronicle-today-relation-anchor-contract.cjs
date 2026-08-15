const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_PATH = path.join(ROOT, 'modules', 'phone-core', 'derived-fields', 'chronicle-today-relation.js');
const DERIVED_FIELD_SERVICE_PATH = path.join(ROOT, 'modules', 'phone-core', 'derived-fields', 'derived-field-service.js');
const SQL_BUILDER_PATH = path.join(ROOT, 'modules', 'phone-core', 'derived-fields', 'chronicle-today-relation-sql.js');
const DATA_API_PATH = path.join(ROOT, 'modules', 'phone-core', 'data-api.js');
const SQL_REPOSITORY_PATH = path.join(ROOT, 'modules', 'phone-core', 'data-api', 'sql-repository.js');
const TABLE_CANDIDATE_RESOLVER_PATH = path.join(ROOT, 'modules', 'phone-core', 'derived-fields', 'table-candidate-resolver.js');

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
    const derivedFieldService = read(DERIVED_FIELD_SERVICE_PATH);
    const builder = read(SQL_BUILDER_PATH);
    const dataApi = read(DATA_API_PATH);
    const sqlRepository = read(SQL_REPOSITORY_PATH);
    const tableCandidateResolver = read(TABLE_CANDIDATE_RESOLVER_PATH);
    const sourceModule = await import(pathToFileURL(SOURCE_PATH).href);
    const builderModule = await import(pathToFileURL(SQL_BUILDER_PATH).href);

    assertIncludes(source, 'querySqlViaApi', '派生器必须通过 data-api 查询 SQL signature');
    assertIncludes(source, 'getTableAvailabilityViaApi', '派生器必须通过 data-api 预检查可选表是否存在');
    assertIncludes(source, 'queryTableRowsViaApi', '派生器必须通过 data-api 做别名感知的逻辑表列检查');
    assertIncludes(source, 'executeSqlMutationViaApi', '派生器必须通过 data-api 执行 SQL mutation');
    assertIncludes(source, 'buildChronicleTodayRelationSignatureSql', '派生器必须使用 signature SQL builder');
    assertIncludes(source, 'buildChronicleTodayRelationUpdateSql', '派生器必须使用 UPDATE SQL builder');
    assertIncludes(source, 'resolveChronicleTodayRelationContext', '派生器必须提供异步 context resolver');
    assertIncludes(source, 'resolveContext: resolveChronicleTodayRelationContext', '派生器必须把 context resolver 接入共享服务');
    assertIncludes(source, 'resolveFirstAvailableTableCandidate', 'context resolver 必须复用候选表选择器');
    assertIncludes(source, 'tableNames: CHRONICLE_TODAY_RELATION_TABLES', 'context resolver 必须按集中顺序检查纪要候选表');
    assertIncludes(source, 'columns: CHRONICLE_TODAY_RELATION_REQUIRED_COLUMNS', 'context resolver 必须用集中列契约检查 chronicle');
    assertIncludes(source, 'tableNames: CHRONICLE_TODAY_RELATION_ANCHOR_TABLES', 'context resolver 必须按集中顺序检查锚点候选表');
    assertIncludes(source, 'columns: CHRONICLE_TODAY_RELATION_ANCHOR_REQUIRED_COLUMNS', 'context resolver 必须用集中列契约检查锚点表');
    assertIncludes(tableCandidateResolver, 'limit: 1', '候选表逻辑列检查必须使用最小读取范围');
    assertIncludes(source, 'maxSignatureRetry: 1', '纪要适配器必须配置一次有界 signature 重试');
    assertIncludes(derivedFieldService, 'const DEFAULT_MAX_SIGNATURE_RETRY = 1', '共享派生服务必须保留一次有界 signature 重试默认值');
    assertIncludes(derivedFieldService, 'for (let attempt = 0; attempt <= maxSignatureRetry; attempt += 1)', '共享派生服务必须按配置执行有界 signature 重试');
    assertIncludes(derivedFieldService, "typeof config.resolveContext === 'function'", '共享派生服务必须支持异步 context resolver');
    assertIncludes(derivedFieldService, 'await config.resolveContext(deps, {', '共享派生服务必须等待 context resolver 完成并传入暂停检查');
    assertIncludes(derivedFieldService, 'runtime.lastInputSignature', '共享派生服务必须保留输入签名缓存');
    assertIncludes(derivedFieldService, 'runtime.lastInvalidWarningSignature', '共享派生服务必须对 invalid warning 去重');
    assertIncludes(source, "from '../data-api.js'", '派生器必须只通过 data-api facade 调 repository');

    assertIncludes(dataApi, 'querySqlViaApi', 'data-api facade 必须导出 querySqlViaApi');
    assertIncludes(dataApi, 'getTableAvailabilityViaApi', 'data-api facade 必须导出表存在性预检查');
    assertIncludes(dataApi, 'queryTableRowsViaApi', 'data-api facade 必须导出 queryTableRowsViaApi');
    assertIncludes(dataApi, 'executeSqlMutationViaApi', 'data-api facade 必须导出 executeSqlMutationViaApi');
    assertIncludes(sqlRepository, 'export async function queryTableRowsViaApi(options = {})', 'SQL repository 必须提供 queryTableRows facade');
    assertIncludes(sqlRepository, 'api.queryTableRows', 'queryTableRows facade 必须调用数据库声明式单表查询');
    assertIncludes(sqlRepository, "normalizeReadDiagnostic(api, 'queryTableRows', startedAt)", 'queryTableRows facade 必须保留结构失败诊断');
    assertIncludes(source, 'CHRONICLE_TODAY_RELATION_ANCHOR_TABLES', '派生器必须复用集中 today anchor 表配置');
    assertIncludes(builder, 'export const CHRONICLE_TODAY_RELATION_ANCHOR_TABLES', 'SQL builder 必须导出集中 today anchor 表白名单配置');
    assertIncludes(builder, 'CHRONICLE_TODAY_RELATION_ANCHOR_REQUIRED_COLUMNS', 'SQL builder 必须集中声明 today anchor 统一所需列');
    assertIncludes(source, 'schema-blocked', '派生器必须在 schema 不完整时安全阻断');
    assertIncludes(tableCandidateResolver, "'runtime_not_ready'", '候选表选择器必须把 runtime 暂不可用与结构缺失分开处理');
    assertIncludes(tableCandidateResolver, "'alias_conflict'", '候选表选择器必须把别名冲突视为结构阻断');
    assertIncludes(tableCandidateResolver, "'table_not_found'", '候选表选择器必须识别逻辑表缺失');
    assertIncludes(tableCandidateResolver, "'column_not_resolved'", '候选表选择器必须识别逻辑列缺失');
    assertIncludes(builder, 'normalizeChronicleTodayRelationAnchorTable', 'SQL builder 必须校验 today anchor 表名');
    assert.deepStrictEqual(
        builderModule.CHRONICLE_TODAY_RELATION_ANCHOR_TABLES,
        ['quanjushujubiao', 'global_state', 'current_status'],
        'today anchor 候选表必须集中维护并保持拼音优先、旧表兼容回退顺序',
    );
    assert.deepStrictEqual(
        builderModule.CHRONICLE_TODAY_RELATION_TABLES,
        ['jiyaobiao', 'chronicle'],
        '纪要候选表必须集中维护并保持拼音优先、旧表兼容回退顺序',
    );
    assert.deepStrictEqual(
        builderModule.CHRONICLE_TODAY_RELATION_ANCHOR_REQUIRED_COLUMNS,
        ['row_id', 'cur_time'],
        'today anchor 统一 schema 要求必须集中声明 row_id/cur_time',
    );
    assert.strictEqual(typeof sourceModule.resolveChronicleTodayRelationContext, 'function', '派生器必须导出 context resolver 供行为合同直接验证');

    const chronicleMissingCalls = [];
    const chronicleMissing = await sourceModule.resolveChronicleTodayRelationContext({
        getTableAvailability: async () => ({ status: 'absent' }),
        queryTableRows: async (options) => {
            chronicleMissingCalls.push(options);
            return { ok: false, code: 'table_not_found', message: 'chronicle missing' };
        },
    });
    assert.deepStrictEqual(chronicleMissing, { status: 'completed' }, '纪要表缺失必须静默跳过');
    assert.deepStrictEqual(chronicleMissingCalls, [], '纪要表缺失时不得调用 queryTableRows');

    const preferredQueryCalls = [];
    const preferred = await sourceModule.resolveChronicleTodayRelationContext({
        getTableAvailability: async () => ({ status: 'present' }),
        queryTableRows: async (options) => {
            preferredQueryCalls.push({ ...options, columns: [...options.columns] });
            return { ok: true, code: 'ok', rows: [], columns: [], values: [], rowCount: 0 };
        },
    });
    assert.deepStrictEqual(
        preferred,
        { status: 'ready', context: { chronicleTable: 'jiyaobiao', anchorTable: 'quanjushujubiao' } },
        '所有拼音候选可用时必须优先使用拼音表名',
    );
    assert.deepStrictEqual(preferredQueryCalls.map((call) => call.tableName), ['jiyaobiao', 'quanjushujubiao'], '命中拼音候选后不得继续查询旧表');

    const fallbackQueryCalls = [];
    const legacyFallback = await sourceModule.resolveChronicleTodayRelationContext({
        getTableAvailability: async (tableName) => ({
            status: ['jiyaobiao', 'quanjushujubiao'].includes(tableName) ? 'absent' : 'present',
        }),
        queryTableRows: async (options) => {
            fallbackQueryCalls.push({ ...options, columns: [...options.columns] });
            return { ok: true, code: 'ok', rows: [], columns: [], values: [], rowCount: 0 };
        },
    });
    assert.deepStrictEqual(
        legacyFallback,
        { status: 'ready', context: { chronicleTable: 'chronicle', anchorTable: 'global_state' } },
        '拼音候选缺失时必须回退旧纪要表与 global_state',
    );
    assert.deepStrictEqual(fallbackQueryCalls.map((call) => call.tableName), ['chronicle', 'global_state'], '已知缺失候选不得调用 queryTableRows');

    const allAnchorsMissingCalls = [];
    const allAnchorsMissing = await sourceModule.resolveChronicleTodayRelationContext({
        getTableAvailability: async (tableName) => ({ status: tableName === 'chronicle' ? 'present' : 'absent' }),
        queryTableRows: async (options) => {
            allAnchorsMissingCalls.push(options);
            return { ok: true, code: 'ok', rows: [], columns: [], values: [], rowCount: 0 };
        },
    });
    assert.deepStrictEqual(allAnchorsMissing, { status: 'completed' }, '全部全局日期锚点缺失时必须静默完成');
    assert.deepStrictEqual(allAnchorsMissingCalls.map((call) => call.tableName), ['chronicle'], '全部全局日期锚点缺失时只允许检查可用纪要表');

    let unavailableQueried = false;
    const unavailable = await sourceModule.resolveChronicleTodayRelationContext({
        getTableAvailability: async () => ({ status: 'unavailable' }),
        queryTableRows: async () => {
            unavailableQueried = true;
            return { ok: false, code: 'runtime_not_ready', message: 'runtime warming' };
        },
    });
    assert.deepStrictEqual(unavailable, { status: 'runtime-not-ready' }, '纪要快照不可用必须交给共享服务等待');
    assert.strictEqual(unavailableQueried, false, '纪要快照不可用时不得调用 queryTableRows');

    const structural = await sourceModule.resolveChronicleTodayRelationContext({
        getTableAvailability: async () => ({ status: 'present' }),
        queryTableRows: async () => ({ ok: false, code: 'column_not_resolved', message: 'time_span missing' }),
    });
    assert.strictEqual(structural.status, 'completed', '纪要缺列必须安全阻断');
    assert.strictEqual(structural.warning?.action, 'chronicle-today-relation.schema-blocked', '纪要真实结构错误必须保留 warning');
    assertIncludes(builder, 'cur_time', 'SQL builder 必须读取 today anchor 表 cur_time');
    assertIncludes(builder, 'CHRONICLE_TODAY_RELATION_TABLES', 'SQL builder 必须集中声明纪要候选表');
    assertIncludes(builder, 'time_span', 'SQL builder 必须读取 chronicle.time_span');
    assertIncludes(builder, 'normalizeChronicleTodayRelationTable', 'SQL builder 必须校验纪要目标表名');
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
    ['sqlite_master', 'pragma_table_info', 'probeSqliteCapabilityViaApi', 'buildChronicleTodayRelationSchemaGateSql', 'buildChronicleTodayRelationAnchorTableSql'].forEach((needle) => {
        assertNotIncludes(`${source}\n${builder}`, needle, `纪要派生链路不得保留旧物理 schema 探测：${needle}`);
    });

    console.log('[通过] 纪要与今天关系锚点合同：拼音优先、旧表回退、缺表静默、异步 context resolver、批量 UPDATE、无旧物理 probe');
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
