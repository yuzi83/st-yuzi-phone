const assert = require('assert');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_PATH = path.join(ROOT, 'modules', 'phone-core', 'derived-fields', 'chronicle-today-relation.js');

const PYTHON_CANDIDATES = [
    { command: 'python', args: [] },
    { command: 'python3', args: [] },
    { command: 'py', args: ['-3'] },
];

function runPython(candidate, code, input) {
    return spawnSync(candidate.command, [...candidate.args, '-c', code], {
        cwd: ROOT,
        encoding: 'utf8',
        input,
        stdio: ['pipe', 'pipe', 'pipe'],
    });
}

function findPython() {
    const probe = 'import sqlite3, sys; print(sqlite3.sqlite_version)';
    for (const candidate of PYTHON_CANDIDATES) {
        const result = runPython(candidate, probe, '');
        if (result.status === 0) return { ...candidate, sqliteVersion: String(result.stdout || '').trim() };
    }
    return null;
}

function loadNodeSqlite() {
    const originalEmitWarning = process.emitWarning;
    process.emitWarning = function emitWarningFiltered(warning, ...args) {
        const message = typeof warning === 'string' ? warning : warning?.message;
        const type = typeof args[0] === 'string' ? args[0] : warning?.name;
        if (type === 'ExperimentalWarning' && String(message || '').includes('SQLite')) {
            return undefined;
        }
        return originalEmitWarning.call(this, warning, ...args);
    };

    try {
        return require('node:sqlite');
    } catch (_) {
        return null;
    } finally {
        process.emitWarning = originalEmitWarning;
    }
}

function findSqliteEngine() {
    const python = findPython();
    if (python) {
        return { type: 'python', python };
    }

    const nodeSqlite = loadNodeSqlite();
    if (nodeSqlite?.DatabaseSync) {
        return { type: 'node', nodeSqlite };
    }

    return null;
}

function runNodeSqlite(nodeSqlite, sql, scenarios) {
    const { DatabaseSync } = nodeSqlite;
    const versionDb = new DatabaseSync(':memory:');
    let sqliteVersion = '';
    try {
        sqliteVersion = String(versionDb.prepare('SELECT sqlite_version() AS version').get().version || '');
    } finally {
        versionDb.close();
    }

    const results = scenarios.map((scenario) => {
        const connection = new DatabaseSync(':memory:');
        try {
            scenario.setup.forEach((statement) => {
                connection.exec(statement);
            });
            const rows = connection.prepare(sql).all();
            return { name: scenario.name, rows };
        } catch (error) {
            return { name: scenario.name, error: String(error?.message || error) };
        } finally {
            connection.close();
        }
    });

    return { sqliteVersion, results };
}

async function main() {
    const sqliteEngine = findSqliteEngine();
    const python = sqliteEngine?.python || null;
    assert.ok(sqliteEngine, '执行级 SQL 合同需要 Python sqlite3 或 Node node:sqlite；当前环境缺少可用 python/python3/py -3/node:sqlite，不能伪装通过');

    const mod = await import(pathToFileURL(SOURCE_PATH).href);
    assert.strictEqual(typeof mod.ANCHOR_TABLE_SQL, 'string', '派生器必须导出 ANCHOR_TABLE_SQL 供执行级合同复用');
    assert.ok(Array.isArray(mod.CHRONICLE_TODAY_RELATION_ANCHOR_TABLES), '派生器必须转出集中 today anchor 表白名单配置');
    assert.deepStrictEqual(
        mod.CHRONICLE_TODAY_RELATION_ANCHOR_TABLES,
        ['global_state', 'current_status'],
        '执行级合同必须覆盖集中英文物理表名白名单中的 global_state/current_status 优先级',
    );


    const scenarios = [
        {
            name: 'global_state 与 current_status 都完整时优先 global_state',
            expected: 'global_state',
            setup: [
                'CREATE TABLE global_state (row_id INTEGER PRIMARY KEY, cur_time TEXT)',
                "INSERT INTO global_state (cur_time) VALUES ('2026-06-13 12:00')",
                'CREATE TABLE current_status (row_id INTEGER PRIMARY KEY, cur_time TEXT)',
                "INSERT INTO current_status (cur_time) VALUES ('2026-06-14 12:00')",
            ],
        },
        {
            name: '仅 current_status 完整时选择 current_status',
            expected: 'current_status',
            setup: [
                'CREATE TABLE current_status (row_id INTEGER PRIMARY KEY, cur_time TEXT)',
                "INSERT INTO current_status (cur_time) VALUES ('2026-06-14 12:00')",
            ],
        },
        {
            name: 'global_state 缺 cur_time 时回退 current_status',
            expected: 'current_status',
            setup: [
                'CREATE TABLE global_state (row_id INTEGER PRIMARY KEY)',
                'CREATE TABLE current_status (row_id INTEGER PRIMARY KEY, cur_time TEXT)',
                "INSERT INTO current_status (cur_time) VALUES ('2026-06-14 12:00')",
            ],
        },
        {
            name: 'global_state 缺 row_id 时回退 current_status',
            expected: 'current_status',
            setup: [
                'CREATE TABLE global_state (cur_time TEXT)',
                'CREATE TABLE current_status (row_id INTEGER PRIMARY KEY, cur_time TEXT)',
                "INSERT INTO current_status (cur_time) VALUES ('2026-06-14 12:00')",
            ],
        },
        {
            name: '两者都不完整时返回空结果',
            expected: '',
            setup: [
                'CREATE TABLE global_state (row_id INTEGER PRIMARY KEY)',
                'CREATE TABLE current_status (cur_time TEXT)',
            ],
        },
        {
            name: '中文行号表不能被误选为 today anchor',
            expected: '',
            setup: [
                'CREATE TABLE "行号" (row_id INTEGER PRIMARY KEY, cur_time TEXT)',
            ],
        },
    ];

    const pythonCode = `
import json
import sqlite3
import sys

payload = json.loads(sys.stdin.read())
sql = payload['sql']
results = []
for scenario in payload['scenarios']:
    connection = sqlite3.connect(':memory:')
    try:
        cursor = connection.cursor()
        for statement in scenario['setup']:
            cursor.execute(statement)
        cursor.execute(sql)
        columns = [item[0] for item in cursor.description]
        rows = [dict(zip(columns, row)) for row in cursor.fetchall()]
        results.append({'name': scenario['name'], 'rows': rows})
    except Exception as error:
        results.append({'name': scenario['name'], 'error': str(error)})
    finally:
        connection.close()
print(json.dumps({'sqliteVersion': sqlite3.sqlite_version, 'results': results}, ensure_ascii=False))
`;

    const report = sqliteEngine.type === 'python'
        ? (() => {
            const result = runPython(python, pythonCode, JSON.stringify({ sql: mod.ANCHOR_TABLE_SQL, scenarios }));
            assert.strictEqual(result.status, 0, `Python sqlite3 执行 ANCHOR_TABLE_SQL 失败：${result.stderr || result.stdout}`);
            return JSON.parse(result.stdout);
        })()
        : runNodeSqlite(sqliteEngine.nodeSqlite, mod.ANCHOR_TABLE_SQL, scenarios);
    report.results.forEach((item, index) => {
        assert.ok(!item.error, `${item.name} 不应执行失败：${item.error}`);
        const actual = item.rows?.[0]?.anchor_table || '';
        assert.strictEqual(actual, scenarios[index].expected, `${item.name} 应返回 ${scenarios[index].expected || '空结果'}`);
    });

    console.log(`[通过] 纪要 today_relation anchor SQL 执行合同：SQLite ${report.sqliteVersion} 真实执行 schema 锚点选择通过 (${sqliteEngine.type})`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
