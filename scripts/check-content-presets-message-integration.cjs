const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const load = (file) => import(pathToFileURL(path.resolve(file)).href);

async function main() {
    const { buildContentPresetCatalog } = await load('modules/content-presets/catalog.js');
    const { __test__createContentPresetWorkshopService } = await load('modules/content-presets/workshop-service.js');
    const { resolveTableNavigationTarget } = await load('modules/table-navigation/catalog.js');
    const { __test__loadRouteRenderer } = await load('modules/phone-core/route-renderer.js');

    const rawData = {
        sheet_contacts: {
            name: '联系人表',
            orderNo: 1,
            content: [['姓名', '关系'], ['Alice', '朋友']],
        },
    };
    const preset = {
        id: 'contacts-preset', name: '联系人美化', version: '1.0.0', author: 'test', issues: [], importedAt: 1,
        files: { 'contacts.html': { content: '<main></main>' }, 'contacts.js': { content: 'export function mount() {}' } },
        items: [{
            id: 'contacts-item', activatable: true,
            target: { tableName: '联系人表', fields: ['姓名', '关系'] },
            entry: { html: 'contacts.html', mount: 'contacts.js' },
        }],
    };
    const catalog = buildContentPresetCatalog(rawData, [preset], new Map());
    const contactsTable = catalog.find((entry) => entry.sheetKey === 'sheet_contacts');
    assert.equal(contactsTable.presentation, 'generic');
    assert.equal(contactsTable.specialType, undefined);
    assert.deepEqual(contactsTable.candidates.map((item) => [item.presetId, item.itemId]), [['contacts-preset', 'contacts-item']]);

    let index = { status: 'ready', error: null, revision: 0, metadata: new Map(), activeByTable: new Map() };
    const bindingCalls = [];
    const service = __test__createContentPresetWorkshopService({
        isContentPresetFullPageRuntimeEnabled: () => true,
        listPresetRecords: async () => [preset],
        getContentPresetIndexSnapshot: () => index,
        subscribeContentPresetIndex: () => () => {},
        setActiveBinding: async (sheetKey, presetId, itemId) => {
            const binding = { sheetKey, presetId, itemId };
            bindingCalls.push(binding);
            return binding;
        },
        enqueueContentPresetMutation: async (operation, buildPatch) => {
            const result = await operation();
            const patch = buildPatch(result, index);
            index = { ...index, ...patch.indexPatch, revision: index.revision + 1 };
            return result;
        },
        invalidateContentPresetInstances: () => {},
        convergeCurrentContentPresetRoute: async () => {},
    }, { getTableData: () => rawData });

    const view = await service.getViewModel();
    assert.equal(view.tables[0].candidates.length, 1);
    await service.setActive('sheet_contacts', 'contacts-preset', 'contacts-item');
    assert.deepEqual(bindingCalls, [{ sheetKey: 'sheet_contacts', presetId: 'contacts-preset', itemId: 'contacts-item' }]);
    assert.deepEqual(index.activeByTable.get('sheet_contacts'), bindingCalls[0]);
    await assert.rejects(() => service.setActive('sheet_contacts', 'contacts-preset', 'missing'), /不可绑定/);

    const presetCalls = [];
    const originalCalls = [];
    const routeDeps = {
        getTableData: () => rawData,
        resolveTableNavigationTarget,
        renderTableViewer: (...args) => originalCalls.push(args),
    };
    const committedRoute = await __test__loadRouteRenderer('table:sheet_contacts', 101, {
        ...routeDeps,
        tryRenderContentPreset: async (_page, target) => {
            presetCalls.push(target);
            return true;
        },
    });
    assert.equal(committedRoute.routeType, 'table-generic-auto');
    await committedRoute.render({ page: 'contacts-committed' });
    assert.equal(presetCalls.length, 1);
    assert.equal(presetCalls[0].catalogEntry.presentation, 'generic');
    assert.equal(originalCalls.length, 0, '普通表的预设提交成功后不应再执行默认 renderer');

    const fallbackRoute = await __test__loadRouteRenderer('table:sheet_contacts', 102, {
        ...routeDeps,
        tryRenderContentPreset: async () => false,
    });
    await fallbackRoute.render({ page: 'contacts-fallback' });
    const fallbackCall = originalCalls.pop();
    assert.deepEqual(fallbackCall.slice(0, 2), [
        { page: 'contacts-fallback' },
        'sheet_contacts',
    ]);
    assert.equal(fallbackCall[2].forceGenericList, true);
    assert.equal(fallbackCall[2].navigationSheetKey, 'sheet_contacts');
    assert.equal(fallbackCall[2].initialTableData, rawData);
    assert.equal(fallbackCall[2].initialNavigationContext.catalog[0].sheetKey, 'sheet_contacts');

    let bypassPresetCalls = 0;
    const bypassCalls = [];
    const bypassRoute = await __test__loadRouteRenderer('table-generic:sheet_contacts', 103, {
        tryRenderContentPreset: async () => { bypassPresetCalls += 1; return true; },
        renderTableViewer: (...args) => bypassCalls.push(args),
    });
    await bypassRoute.render({ page: 'contacts-generic' });
    assert.equal(bypassPresetCalls, 0, 'table-generic: 路由必须永久绕过内容预设');
    assert.deepEqual(bypassCalls, [[
        { page: 'contacts-generic' },
        'sheet_contacts',
        { forceGenericList: true },
    ]]);

    console.log('[content-presets-message-integration-check] 检查通过');
}

main().catch((error) => {
    console.error('[content-presets-message-integration-check] 检查失败：', error);
    process.exitCode = 1;
});
