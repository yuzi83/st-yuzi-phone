const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');

function moduleUrl(relativePath) {
    return pathToFileURL(path.join(ROOT, relativePath)).href;
}

async function main() {
    const snapshot = {
        sheet_summary: {
            uid: 'sheet_summary',
            name: '纪要表',
            sourceData: {
                ddl: 'CREATE TABLE chronicle (row_id INTEGER PRIMARY KEY, time_span TEXT, today_relation TEXT);',
            },
            content: [[
                'row_id',
                '编码索引',
                '时间跨度',
                '概览',
                '纪要',
            ]],
        },
    };

    global.window = {
        parent: { AutoCardUpdaterAPI: { exportTableAsJson: () => snapshot } },
        AutoCardUpdaterAPI: null,
    };

    const repository = await import(moduleUrl('modules/phone-core/data-api/table-repository.js'));
    const resolver = await import(moduleUrl('modules/phone-core/derived-fields/table-candidate-resolver.js'));

    const availability = repository.getTableAvailabilityViaApi('chronicle');
    assert.deepStrictEqual(
        availability,
        {
            status: 'present',
            columns: ['row_id', '编码索引', '时间跨度', '概览', '纪要'],
        },
        '表存在性预检查必须返回已加载快照中的列别名',
    );

    const columnAliases = {
        row_id: ['row_id', '行号'],
        time_span: ['time_span', '时间跨度'],
        today_relation: ['today_relation', '与今天的关系'],
    };
    let missingQueryCalls = 0;
    const missing = await resolver.resolveFirstAvailableTableCandidate({
        deps: {
            getTableAvailability: async () => availability,
            queryTableRows: async () => {
                missingQueryCalls += 1;
                return { ok: true };
            },
        },
        tableNames: ['chronicle'],
        columns: ['row_id', 'time_span', 'today_relation'],
        columnAliases,
    });
    assert.strictEqual(missing.status, 'schema-blocked', '快照明确缺列时必须安全阻断');
    assert.strictEqual(missingQueryCalls, 0, '快照明确缺列时不得调用 queryTableRows');

    let completeQueryCalls = 0;
    const complete = await resolver.resolveFirstAvailableTableCandidate({
        deps: {
            getTableAvailability: async () => ({
                ...availability,
                columns: [...availability.columns, '与今天的关系'],
            }),
            queryTableRows: async (options) => {
                completeQueryCalls += 1;
                assert.deepStrictEqual(options, {
                    tableName: 'chronicle',
                    columns: ['row_id', 'time_span', 'today_relation'],
                    limit: 1,
                }, '字段完整时仍必须使用原有别名感知 queryTableRows 校验');
                return { ok: true };
            },
        },
        tableNames: ['chronicle'],
        columns: ['row_id', 'time_span', 'today_relation'],
        columnAliases,
    });
    assert.deepStrictEqual(complete, { status: 'ready', tableName: 'chronicle' }, '字段完整时必须继续进入候选表 ready 路径');
    assert.strictEqual(completeQueryCalls, 1, '字段完整时必须调用一次 queryTableRows');

    console.log('[通过] 表格快照字段预检：缺列不调用 queryTableRows，字段完整保留原查询校验');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
