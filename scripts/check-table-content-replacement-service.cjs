const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

function createRawData() {
    return {
        sheet_1: {
            name: '纪要',
            sourceData: {
                ddl: `CREATE TABLE chronicle ( -- 纪要
  row_id INTEGER PRIMARY KEY, -- 行号
  content TEXT, -- 内容
  quantity INTEGER -- 数量
);`,
            },
            content: [
                ['row_id', '内容', '数量'],
                [1, '你好你好', 7],
            ],
        },
        sheet_2: {
            name: '其他',
            content: [
                ['row_id', '内容'],
                [1, '你好'],
            ],
        },
    };
}

async function main() {
    const modulePath = path.resolve(__dirname, '..', 'modules', 'table-content-replacement', 'service.js');
    const { createTableContentReplacementService } = await import(pathToFileURL(modulePath).href);

    const updates = new Set();
    const fills = new Set();
    const mutations = [];
    const settings = {
        tableContentReplacement: {
            global: {
                enabled: true,
                rules: [{ id: 'g1', source: '你好', target: '不好' }],
            },
            tableRules: [{
                mappingId: 'm1',
                sheetKey: 'sheet_1',
                tableNameSnapshot: '纪要',
                enabled: true,
                rules: [{ id: 't1', source: '不好', target: '欢迎' }],
            }],
        },
    };

    const service = createTableContentReplacementService({
        getSettings: () => settings,
        getTableData: () => createRawData(),
        executeSqlMutation: async (sql, params, options) => {
            mutations.push({ sql, params, options });
            return { ok: true, changes: 1 };
        },
        subscribeTableUpdate: callback => {
            updates.add(callback);
            return () => updates.delete(callback);
        },
        subscribeTableFillStart: callback => {
            fills.add(callback);
            return () => fills.delete(callback);
        },
        setTimeout: (callback) => {
            callback();
            return 1;
        },
        clearTimeout: () => {},
        debounceMs: 0,
    });

    assert.deepStrictEqual(await service.applyArea({ kind: 'table', mappingId: 'm1' }), {
        ok: true,
        changedCellCount: 1,
        tableCount: 1,
    }, '保存单表区域必须只应用该表并按全局后单表规则计算');
    assert.strictEqual(mutations.length, 1, '单表保存只能发起一次该表 mutation');
    assert.ok(mutations[0].sql.includes('UPDATE "sheet_1"'), '单表 mutation 必须指向配置表');
    assert.ok(mutations[0].sql.includes('REPLACE(REPLACE("content"'), '全局规则必须先于单表规则嵌套且使用 DDL 物理列名');
    assert.deepStrictEqual(mutations[0].options, {
        targetSheetKeys: ['sheet_1'],
        silent: true,
    }, '单表 mutation 必须把当前 sheetKey 交给 shujuku 解析列别名并静默通知');

    mutations.length = 0;
    const globalResult = await service.applyArea({ kind: 'global' });
    assert.deepStrictEqual(globalResult, { ok: true, changedCellCount: 2, tableCount: 2 }, '保存全局区域必须处理全部普通数据表');
    assert.strictEqual(mutations.length, 2, '全局保存必须按表分别进入 mutation');
    assert.deepStrictEqual(mutations.map(item => item.options?.targetSheetKeys), [
        ['sheet_1'],
        ['sheet_2'],
    ], '全局 mutation 必须逐表限定目标 sheetKey');

    let rawData = createRawData();
    const queuedTimers = [];
    mutations.length = 0;
    const eventService = createTableContentReplacementService({
        getSettings: () => settings,
        getTableData: () => rawData,
        executeSqlMutation: async (sql, params, options) => {
            mutations.push({ sql, params, options });
            return { ok: true, changes: 1 };
        },
        subscribeTableUpdate: callback => {
            updates.add(callback);
            return () => updates.delete(callback);
        },
        subscribeTableFillStart: callback => {
            fills.add(callback);
            return () => fills.delete(callback);
        },
        setTimeout: (callback) => {
            const timer = { callback, active: true };
            queuedTimers.push(timer);
            return timer;
        },
        clearTimeout: (timer) => {
            if (timer) timer.active = false;
        },
        debounceMs: 50,
    });
    eventService.start();
    const updateListener = Array.from(updates).at(-1);
    const fillListener = Array.from(fills).at(-1);
    fillListener();
    rawData = createRawData();
    rawData.sheet_2.content[1][1] = '新的你好';
    updateListener(rawData);
    assert.strictEqual(mutations.length, 0, '填表期间的更新不得立即发起替换');
    assert.strictEqual(queuedTimers.length, 1, '首个稳定信号只应启动防抖任务');
    updateListener(rawData);
    assert.strictEqual(queuedTimers.length, 2, '后续更新必须重置防抖任务');
    const latestTimer = queuedTimers.at(-1);
    if (latestTimer.active) latestTimer.callback();
    await new Promise(resolve => setImmediate(resolve));
    assert.strictEqual(mutations.length, 1, '更新信号只应处理变化的表');
    eventService.stop();

    service.start();
    assert.strictEqual(updates.size, 1, '服务启动必须订阅 table-update');
    assert.strictEqual(fills.size, 1, '服务启动必须订阅 table-fill-start');
    service.stop();
    assert.strictEqual(updates.size, 0, '服务停止必须清理 table-update 订阅');
    assert.strictEqual(fills.size, 0, '服务停止必须清理 table-fill-start 订阅');

    const silentFailureService = createTableContentReplacementService({
        getSettings: () => settings,
        getTableData: () => createRawData(),
        executeSqlMutation: async () => { throw new Error('expected failure'); },
    });
    const failed = await silentFailureService.applyArea({ kind: 'table', mappingId: 'm1' });
    assert.strictEqual(failed.ok, false, 'mutation 异常必须转为静默失败结果');
    assert.strictEqual(failed.error, undefined, '静默失败结果不得暴露异常对象');

    console.log('[通过] 表格内容词汇替换后台应用 seam');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
