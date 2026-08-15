const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_PATH = path.join(ROOT, 'modules', 'phone-core', 'derived-fields', 'chronicle-today-relation.js');
const SQL_BUILDER_PATH = path.join(ROOT, 'modules', 'phone-core', 'derived-fields', 'chronicle-today-relation-sql.js');

function success() {
    return { ok: true, code: 'ok', rows: [], columns: [], values: [], rowCount: 0 };
}

function failure(code, message = code) {
    return { ok: false, code, message, rows: [], columns: [], values: [], rowCount: 0 };
}

async function runResolver(resolveContext, responses = {}, availabilityByTable = {}) {
    const calls = [];
    const result = await resolveContext({
        getTableAvailability: async (tableName) => availabilityByTable[tableName] || { status: 'present' },
        queryTableRows: async (options) => {
            calls.push({ ...options, columns: [...(options.columns || [])] });
            const response = responses[options.tableName];
            if (typeof response === 'function') return response(options, calls);
            return response || failure('table_not_found', `${options.tableName} missing`);
        },
    });
    return { result, calls };
}

function assertQueryCall(call, tableName, columns) {
    assert.deepStrictEqual(call, {
        tableName,
        columns,
        limit: 1,
    }, `${tableName} 必须通过 queryTableRows 按逻辑表名和集中列契约检查`);
}

async function main() {
    const sourceModule = await import(pathToFileURL(SOURCE_PATH).href);
    const sqlModule = await import(pathToFileURL(SQL_BUILDER_PATH).href);
    const resolveContext = sourceModule.resolveChronicleTodayRelationContext;

    assert.strictEqual(typeof resolveContext, 'function', '纪要派生器必须导出 context resolver');
    assert.deepStrictEqual(
        sqlModule.CHRONICLE_TODAY_RELATION_ANCHOR_TABLES,
        ['quanjushujubiao', 'global_state', 'current_status'],
        '故事日期锚点必须保持拼音优先与旧表兼容回退顺序',
    );
    assert.deepStrictEqual(
        sqlModule.CHRONICLE_TODAY_RELATION_TABLES,
        ['jiyaobiao', 'chronicle'],
        '纪要目标表必须保持拼音优先与旧表兼容回退顺序',
    );

    const preferred = await runResolver(resolveContext, {
        jiyaobiao: success(),
        quanjushujubiao: success(),
    });
    assert.deepStrictEqual(
        preferred.result,
        { status: 'ready', context: { chronicleTable: 'jiyaobiao', anchorTable: 'quanjushujubiao' } },
        '拼音目标表和拼音日期锚点都可用时必须优先使用它们',
    );
    assert.strictEqual(preferred.calls.length, 2, '命中拼音候选后不得继续探测旧表');
    assertQueryCall(preferred.calls[0], 'jiyaobiao', [...sqlModule.CHRONICLE_TODAY_RELATION_REQUIRED_COLUMNS]);
    assertQueryCall(preferred.calls[1], 'quanjushujubiao', [...sqlModule.CHRONICLE_TODAY_RELATION_ANCHOR_REQUIRED_COLUMNS]);

    const targetFallback = await runResolver(resolveContext, {
        jiyaobiao: failure('column_not_resolved', 'jiyaobiao.time_span missing'),
        chronicle: success(),
        quanjushujubiao: success(),
    });
    assert.deepStrictEqual(
        targetFallback.result,
        { status: 'ready', context: { chronicleTable: 'chronicle', anchorTable: 'quanjushujubiao' } },
        '拼音纪要表字段不完整时必须回退旧纪要表',
    );
    assert.deepStrictEqual(targetFallback.calls.map((call) => call.tableName), ['jiyaobiao', 'chronicle', 'quanjushujubiao'], '纪要候选探测顺序必须稳定');

    const anchorFallback = await runResolver(resolveContext, {
        jiyaobiao: success(),
        quanjushujubiao: failure('column_not_resolved', 'quanjushujubiao.cur_time missing'),
        global_state: success(),
    });
    assert.deepStrictEqual(
        anchorFallback.result,
        { status: 'ready', context: { chronicleTable: 'jiyaobiao', anchorTable: 'global_state' } },
        '拼音全局数据表字段不完整时必须回退 global_state',
    );
    assert.deepStrictEqual(anchorFallback.calls.map((call) => call.tableName), ['jiyaobiao', 'quanjushujubiao', 'global_state'], '日期锚点候选探测顺序必须稳定');

    const legacyFallback = await runResolver(resolveContext, {
        chronicle: success(),
        global_state: success(),
    }, {
        jiyaobiao: { status: 'absent' },
        quanjushujubiao: { status: 'absent' },
    });
    assert.deepStrictEqual(
        legacyFallback.result,
        { status: 'ready', context: { chronicleTable: 'chronicle', anchorTable: 'global_state' } },
        '拼音候选缺失时必须兼容旧纪要表与 global_state',
    );
    assert.deepStrictEqual(legacyFallback.calls.map((call) => call.tableName), ['chronicle', 'global_state'], '预检查已知缺失的拼音候选时不得调用 queryTableRows');

    const blocked = await runResolver(resolveContext, {
        jiyaobiao: success(),
        current_status: failure('alias_conflict', 'current_status ambiguous'),
        global_state: failure('column_not_resolved', 'global_state.cur_time missing'),
    }, {
        quanjushujubiao: { status: 'absent' },
    });
    assert.strictEqual(blocked.result.status, 'completed', '所有可用日期锚点字段不完整时必须安全跳过');
    assert.strictEqual(blocked.result.warning?.action, 'chronicle-today-relation.schema-blocked', '结构阻断必须给出稳定 warning action');
    assert.deepStrictEqual(blocked.result.warning?.context?.failures?.map((item) => item.tableName), ['global_state', 'current_status'], '缺失候选必须静默跳过，只保留真实结构错误');

    const chronicleMissing = await runResolver(resolveContext, {
    }, {
        jiyaobiao: { status: 'absent' },
        chronicle: { status: 'absent' },
    });
    assert.strictEqual(chronicleMissing.result.status, 'completed', '两个纪要候选都缺失时必须安全跳过');
    assert.deepStrictEqual(chronicleMissing.calls, [], '纪要候选缺失时不得调用 queryTableRows 或继续检查日期锚点');

    const runtimeNotReady = await runResolver(resolveContext, {
        jiyaobiao: failure('runtime_not_ready', 'runtime warming'),
    });
    assert.deepStrictEqual(runtimeNotReady.result, { status: 'runtime-not-ready' }, 'runtime 暂不可用必须交给共享服务做有界等待');

    const transientFailure = failure('query_failed', 'temporary read failure');
    const queryFailed = await runResolver(resolveContext, {
        jiyaobiao: success(),
        quanjushujubiao: transientFailure,
    });
    assert.strictEqual(queryFailed.result.status, 'query-failed', '非结构读取失败必须进入查询重试语义');
    assert.strictEqual(queryFailed.result.result, transientFailure, '查询失败必须保留 repository 归一化结果');

    console.log('[通过] 纪要 today_relation context resolver 执行合同：拼音优先、旧表回退、缺表静默、结构阻断与暂时失败分流通过');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
