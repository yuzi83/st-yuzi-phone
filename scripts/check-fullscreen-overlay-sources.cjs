const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

async function importModule(relativePath) {
    return import(pathToFileURL(path.resolve(relativePath)).href);
}

async function checkRegistryContract() {
    const { createOverlaySourceRegistry } = await importModule('modules/fullscreen-overlay/source-registry.js');
    const liveAdapter = Object.freeze({
        id: 'live-table',
        modelId: 'scrolling-barrage',
        matches: context => context?.tableName === '直播表',
        getSignature: context => context?.tableName || '',
        readEvents: () => [],
    });
    const genericAdapter = Object.freeze({
        id: 'generic-table',
        modelId: 'popup',
        matches: context => context?.tableName === '通用表',
        getSignature: context => context?.tableName || '',
        readEvents: () => [],
    });

    const registry = createOverlaySourceRegistry([liveAdapter, null, genericAdapter]);

    assert.deepEqual(registry.list(), [liveAdapter, genericAdapter]);
    assert.equal(registry.get('live-table'), liveAdapter);
    assert.equal(registry.get('missing'), null);
    assert.equal(registry.match({ tableName: '直播表' }), liveAdapter);
    assert.equal(registry.match({ tableName: '未适配表' }), null);
    assert.throws(
        () => createOverlaySourceRegistry([liveAdapter, { ...liveAdapter }]),
        /duplicate overlay source adapter id: live-table/,
    );
    assert.throws(
        () => createOverlaySourceRegistry([{
            id: 'broken-table',
            modelId: 'popup',
            matches: () => true,
        }]),
        /invalid overlay source adapter "broken-table": missing getSignature, readEvents/,
        'Registry 必须在注册边界拒绝不完整 Adapter',
    );
    assert.throws(
        () => createOverlaySourceRegistry([{
            id: 'broken-model',
            modelId: false,
            matches: () => true,
            getSignature: () => '',
            readEvents: () => [],
        }]),
        /invalid overlay source adapter "broken-model": missing modelId/,
        'Adapter id 与 modelId 必须是非空字符串',
    );

    const throwingAdapter = Object.freeze({
        id: 'throwing-table',
        modelId: 'popup',
        matches() {
            throw new Error('matcher failed');
        },
        getSignature: () => '',
        readEvents: () => [],
    });
    const isolatedRegistry = createOverlaySourceRegistry([throwingAdapter, liveAdapter]);
    assert.equal(
        isolatedRegistry.match({ tableName: '直播表' }),
        liveAdapter,
        '单个 Adapter.matches 抛错不得阻止后续合法 Adapter 匹配',
    );
}

async function checkSourceCatalogContract() {
    const { createOverlaySourceRegistry } = await importModule('modules/fullscreen-overlay/source-registry.js');
    const { buildOverlaySourceCatalog } = await importModule('modules/fullscreen-overlay/source-catalog.js');
    const liveAdapter = Object.freeze({
        id: 'live-table',
        modelId: 'scrolling-barrage',
        modelIds: ['scrolling-barrage', 'table-popup'],
        defaultEnabled: true,
        matches: context => context?.tableName === '直播表',
        getSignature: context => context?.tableName || '',
        readEvents: () => [],
    });
    const genericAdapter = Object.freeze({
        id: 'generic-table',
        modelId: 'table-popup',
        modelIds: ['table-popup'],
        defaultEnabled: false,
        matches: context => context?.tableName === '通用表',
        getSignature: context => context?.tableName || '',
        readEvents: () => [],
    });
    const registry = createOverlaySourceRegistry([liveAdapter, genericAdapter]);
    const rawData = {
        metadata: { ignored: true },
        sheet_unknown: {
            name: '未适配表',
            orderNo: 1,
            content: [['内容'], ['保留可见']],
        },
        sheet_live: {
            name: '直播表',
            orderNo: 2,
            content: [['剧情弹幕串', '推角弹幕串', '对线弹幕串'], ['A', 'B', 'C']],
        },
        sheet_generic: {
            name: '通用表',
            orderNo: 3,
            content: [['内容'], ['弹窗']],
        },
    };

    const catalog = buildOverlaySourceCatalog(rawData, {
        sourceOrder: ['sheet_live', 'missing', 'sheet_unknown', 'sheet_live'],
        sourceEnabledBySheetKey: {
            sheet_live: false,
            sheet_generic: true,
        },
        sourceModelBySheetKey: {
            sheet_live: ' table-popup ',
            sheet_generic: 'scrolling-barrage',
        },
    }, registry);

    assert.deepEqual(catalog.map(item => item.sheetKey), [
        'sheet_live',
        'sheet_unknown',
        'sheet_generic',
    ]);
    assert.deepEqual(catalog.map(item => ({
        sheetKey: item.sheetKey,
        supported: item.supported,
        disabled: item.disabled,
        enabled: item.enabled,
        sourceId: item.sourceId,
        modelId: item.modelId,
        modelIds: item.modelIds,
    })), [
        {
            sheetKey: 'sheet_live',
            supported: true,
            disabled: false,
            enabled: false,
            sourceId: 'live-table',
            modelId: 'table-popup',
            modelIds: ['scrolling-barrage', 'table-popup'],
        },
        {
            sheetKey: 'sheet_unknown',
            supported: false,
            disabled: true,
            enabled: false,
            sourceId: '',
            modelId: '',
            modelIds: [],
        },
        {
            sheetKey: 'sheet_generic',
            supported: true,
            disabled: false,
            enabled: true,
            sourceId: 'generic-table',
            modelId: 'table-popup',
            modelIds: ['table-popup'],
        },
    ]);

    const defaultCatalog = buildOverlaySourceCatalog(rawData, {}, registry);
    assert.equal(defaultCatalog.find(item => item.sheetKey === 'sheet_live')?.enabled, true);
    assert.equal(defaultCatalog.find(item => item.sheetKey === 'sheet_generic')?.enabled, false);

    const legacyEnabledCatalog = buildOverlaySourceCatalog(rawData, {
        enabledSourceSheetKeys: ['sheet_generic'],
    }, registry);
    assert.equal(
        legacyEnabledCatalog.find(item => item.sheetKey === 'sheet_live')?.enabled,
        true,
        'Catalog 必须忽略未发布的 enabledSourceSheetKeys，并使用 Adapter 默认启用状态',
    );
    assert.equal(
        legacyEnabledCatalog.find(item => item.sheetKey === 'sheet_generic')?.enabled,
        false,
        'Catalog 的启用状态只能消费 sourceEnabledBySheetKey',
    );
    assert(Object.isFrozen(defaultCatalog));
    assert(defaultCatalog.every(Object.isFrozen));
}

function cloneLiveSheet(sheet) {
    return {
        ...sheet,
        content: sheet.content.map(row => [...row]),
    };
}

async function checkLiveTableSourceAdapterContract() {
    const { createLiveTableSourceAdapter } = await importModule('modules/fullscreen-overlay/sources/live-table.js');
    const adapter = createLiveTableSourceAdapter();
    const sheet = {
        name: '直播表',
        content: [
            ['推角弹幕串', '无关字段', '剧情弹幕串', '对线弹幕串'],
            ['推甲；推乙', '忽略一', '牌子：剧情甲;剧情乙', '对线甲；；对线乙'],
            ['', '只有无关字段有值', ' ', ''],
            ['推三', '忽略二', 'none', '对线三'],
        ],
    };
    const context = {
        sheetKey: 'sheet_livestream_rooms',
        tableName: sheet.name,
        sheet,
        headers: sheet.content[0],
        rows: sheet.content.slice(1),
    };

    assert.equal(adapter.id, 'live-table');
    assert.equal(adapter.modelId, 'scrolling-barrage');
    assert.deepEqual(adapter.modelIds, ['scrolling-barrage', 'table-popup']);
    assert.equal(adapter.defaultEnabled, true);
    assert.equal(adapter.matches(context), true);
    assert.equal(adapter.matches({ ...context, tableName: '直播表副本' }), false);
    assert.equal(adapter.matches({
        ...context,
        headers: ['剧情弹幕串', '推角弹幕串'],
        sheet: {
            ...sheet,
            content: [['剧情弹幕串', '推角弹幕串']],
        },
    }), false);

    const events = adapter.readEvents(context);
    assert(
        events.every(event => !Object.prototype.hasOwnProperty.call(event, 'modelId')),
        '内容源事件必须保持表现无关，最终模型只由 Catalog/调度入口决定',
    );
    assert.deepEqual(events.map(event => ({
        sourceId: event.sourceId,
        sheetKey: event.sheetKey,
        text: event.text,
    })), [
        {
            sourceId: 'live-table',
            sheetKey: 'sheet_livestream_rooms',
            text: '牌子：剧情甲',
        },
        {
            sourceId: 'live-table',
            sheetKey: 'sheet_livestream_rooms',
            text: '剧情乙',
        },
        {
            sourceId: 'live-table',
            sheetKey: 'sheet_livestream_rooms',
            text: '推甲',
        },
        {
            sourceId: 'live-table',
            sheetKey: 'sheet_livestream_rooms',
            text: '推乙',
        },
        {
            sourceId: 'live-table',
            sheetKey: 'sheet_livestream_rooms',
            text: '对线甲',
        },
        {
            sourceId: 'live-table',
            sheetKey: 'sheet_livestream_rooms',
            text: '对线乙',
        },
        {
            sourceId: 'live-table',
            sheetKey: 'sheet_livestream_rooms',
            text: '推三',
        },
        {
            sourceId: 'live-table',
            sheetKey: 'sheet_livestream_rooms',
            text: '对线三',
        },
    ]);
    assert(Object.isFrozen(events));
    assert(events.every(Object.isFrozen));

    const signature = adapter.getSignature(context);
    const selectedRowEvents = adapter.readEvents({
        ...context,
        rowSelection: {
            rowIndexes: [2],
            rowIds: [],
        },
    });
    assert.deepEqual(
        selectedRowEvents.map(event => ({
            text: event.text,
            rowIndex: event.rowIndex,
        })),
        [
            { text: '推三', rowIndex: 2 },
            { text: '对线三', rowIndex: 2 },
        ],
        '自动路径必须只读取选中的原始数据行，并保留整张表中的 0-based 数据行索引',
    );
    assert.deepEqual(
        adapter.readEvents({
            ...context,
            rowSelection: {
                rowIndexes: [],
                rowIds: [],
            },
        }),
        [],
        '显式空行范围表示本次没有可播放的当前行，不能回退为整张表',
    );

    const rowIdSheet = {
        name: '直播表',
        content: [
            ['row_id', '剧情弹幕串', '推角弹幕串', '对线弹幕串'],
            ['101', '第一行剧情', '', ''],
            ['102', '第二行剧情', '', ''],
        ],
    };
    const rowIdEvents = adapter.readEvents({
        sheetKey: context.sheetKey,
        tableName: rowIdSheet.name,
        sheet: rowIdSheet,
        rowSelection: {
            rowIndexes: [0],
            rowIds: ['102'],
        },
    });
    assert.deepEqual(
        rowIdEvents.map(event => ({
            text: event.text,
            rowIndex: event.rowIndex,
        })),
        [{ text: '第二行剧情', rowIndex: 1 }],
        '存在稳定 row_id 时必须优先按 rowIds 选择，避免旧 rowIndex 命中错误行',
    );

    assert.equal(
        adapter.getSignature({
            ...context,
            rowSelection: {
                rowIndexes: [2],
                rowIds: [],
            },
        }),
        signature,
        '直播表签名必须始终按整张表计算，不能被自动播放的行范围污染',
    );
    const irrelevantChange = cloneLiveSheet(sheet);
    irrelevantChange.content[1][1] = '无关字段已修改';
    assert.equal(adapter.getSignature({
        ...context,
        sheet: irrelevantChange,
        headers: irrelevantChange.content[0],
        rows: irrelevantChange.content.slice(1),
    }), signature);

    const semanticEquivalent = cloneLiveSheet(sheet);
    semanticEquivalent.content = [
        [...semanticEquivalent.content[0]],
        ['', '新增空白物理行', '； ; ；', ''],
        [
            '推甲 ; 推乙；；',
            '无关字段可变化',
            '牌子：剧情甲； 剧情乙 ; ',
            '对线甲 ;； 对线乙',
        ],
        [' ; ', '原空白行仍无弹幕', '', '；'],
        ['推三', '忽略二', ' NONE ;； ', '对线三'],
    ];
    assert.deepEqual(
        adapter.readEvents({
            ...context,
            sheet: semanticEquivalent,
            headers: semanticEquivalent.content[0],
            rows: semanticEquivalent.content.slice(1),
        }).map(event => event.text),
        events.map(event => event.text),
        '空白行、none 与无效分号变化不得改变可播放事件序列',
    );
    assert.equal(
        adapter.getSignature({
            ...context,
            sheet: semanticEquivalent,
            headers: semanticEquivalent.content[0],
            rows: semanticEquivalent.content.slice(1),
        }),
        signature,
        '直播表签名必须基于实际可播放事件语义，而不是原始物理行文本',
    );

    const barrageChange = cloneLiveSheet(sheet);
    barrageChange.content[1][2] = '牌子：新的剧情弹幕';
    assert.notEqual(adapter.getSignature({
        ...context,
        sheet: barrageChange,
        headers: barrageChange.content[0],
        rows: barrageChange.content.slice(1),
        rowSelection: {
            rowIndexes: [2],
            rowIds: [],
        },
    }), signature);

    const manyBarrages = cloneLiveSheet(sheet);
    manyBarrages.content = [
        ['剧情弹幕串', '推角弹幕串', '对线弹幕串'],
        [Array.from({ length: 40 }, (_, index) => `弹幕${index + 1}`).join(';'), '', ''],
    ];
    assert.equal(adapter.readEvents({
        sheetKey: context.sheetKey,
        tableName: manyBarrages.name,
        sheet: manyBarrages,
    }).length, 40);

    assert.deepEqual(
        adapter.readEvents({
            ...context,
            modelId: 'table-popup',
            rowSelection: {
                rowIndexes: [1],
                rowIds: [],
            },
        }),
        [{
            sourceId: 'live-table',
            sheetKey: 'sheet_livestream_rooms',
            rowIndex: 1,
            cells: [
                { label: '推角弹幕串', value: '' },
                { label: '无关字段', value: '只有无关字段有值' },
                { label: '剧情弹幕串', value: ' ' },
                { label: '对线弹幕串', value: '' },
            ],
        }],
        '直播表绑定普通表格弹窗时必须读取当前完整行，而不是三条弹幕串',
    );
    assert.notEqual(
        adapter.getSignature({
            ...context,
            modelId: 'table-popup',
            sheet: irrelevantChange,
            headers: irrelevantChange.content[0],
            rows: irrelevantChange.content.slice(1),
        }),
        signature,
        '直播表切到弹窗模型后，无关弹幕字段的普通单元格变化也必须进入签名',
    );
}

async function checkGenericTableSourceAdapterContract() {
    const { createGenericTableSourceAdapter } = await importModule(
        'modules/fullscreen-overlay/sources/generic-table.js',
    );
    const adapter = createGenericTableSourceAdapter();
    const sheet = {
        name: '广场表',
        content: [
            ['row_id', '标题', '内容', '备注'],
            ['101', '第一条', '完整正文', ''],
            ['102', '第二条', '后续正文', '空值也保留'],
        ],
    };
    const context = {
        sheetKey: 'sheet_square',
        tableName: sheet.name,
        sheet,
        headers: sheet.content[0],
        rows: sheet.content.slice(1),
    };

    assert.equal(adapter.id, 'generic-table');
    assert.equal(adapter.modelId, 'table-popup');
    assert.deepEqual(adapter.modelIds, ['table-popup']);
    assert.equal(adapter.defaultEnabled, false);
    assert.equal(adapter.matches(context), true);

    assert.deepEqual(
        adapter.readEvents(context),
        [{
            sourceId: 'generic-table',
            sheetKey: 'sheet_square',
            rowIndex: 0,
            cells: [
                { label: 'row_id', value: '101' },
                { label: '标题', value: '第一条' },
                { label: '内容', value: '完整正文' },
                { label: '备注', value: '' },
            ],
        }],
        '手动测试路径只读取第一条当前行，并保留空字段与完整表头顺序',
    );

    assert.deepEqual(
        adapter.readEvents({
            ...context,
            rowSelection: {
                rowIndexes: [1],
                rowIds: [],
            },
        }),
        [{
            sourceId: 'generic-table',
            sheetKey: 'sheet_square',
            rowIndex: 1,
            cells: [
                { label: 'row_id', value: '102' },
                { label: '标题', value: '第二条' },
                { label: '内容', value: '后续正文' },
                { label: '备注', value: '空值也保留' },
            ],
        }],
        '自动路径只读取审核交付的当前更新行',
    );

    assert.deepEqual(
        adapter.readEvents({
            ...context,
            rowSelection: {
                rowIndexes: [0],
                rowIds: ['102'],
            },
        }).map(event => event.rowIndex),
        [1],
        '存在 row_id 时必须优先按稳定 ID 定位当前行',
    );
    assert.equal(
        adapter.readEvents({
            ...context,
            rowSelection: { rowIndexes: [], rowIds: [] },
        }).length,
        0,
        '显式空行范围不得回退到第一行',
    );

    const signature = adapter.getSignature(context);
    const changedSheet = {
        ...sheet,
        content: sheet.content.map(row => [...row]),
    };
    changedSheet.content[2][2] = '修改后的完整正文';
    assert.notEqual(
        adapter.getSignature({
            ...context,
            sheet: changedSheet,
            headers: changedSheet.content[0],
            rows: changedSheet.content.slice(1),
        }),
        signature,
        '普通表格签名必须覆盖整张表的当前字段内容',
    );
}

async function main() {
    await checkRegistryContract();
    await checkSourceCatalogContract();
    await checkLiveTableSourceAdapterContract();
    await checkGenericTableSourceAdapterContract();
    console.log('[fullscreen-overlay-sources-contract] passed');
}

main().catch((error) => {
    console.error('[fullscreen-overlay-sources-contract] failed:', error);
    process.exitCode = 1;
});
