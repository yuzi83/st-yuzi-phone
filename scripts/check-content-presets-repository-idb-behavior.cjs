const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const cloneMap = source => new Map([...source].map(([key, value]) => [key, structuredClone(value)]));
const freshRepository = () => import(`${pathToFileURL(path.join(process.cwd(), 'modules/content-presets/repository.js')).href}?t=${Date.now()}-${Math.random()}`);
const turn = () => new Promise(resolve => setImmediate(resolve));

function createHarness({ seed = {}, autoComplete = true, requestError = null, deleteErrorKey = null } = {}) {
    const committed = {
        presets: new Map((seed.presets || []).map(value => [value.id, structuredClone(value)])),
        activeByTable: new Map((seed.activeByTable || []).map(value => [value.sheetKey, structuredClone(value)])),
        popupByTable: new Map((seed.popupByTable || []).map(value => [value.sheetKey, structuredClone(value)])),
    };
    const transactions = [];

    class Transaction {
        constructor(storeNames, mode) {
            this.storeNames = [...storeNames];
            this.mode = mode;
            this.staged = {
                presets: cloneMap(committed.presets),
                activeByTable: cloneMap(committed.activeByTable),
                popupByTable: cloneMap(committed.popupByTable),
            };
            this.aborted = false;
            this.completed = false;
            this.abortCalls = 0;
            this.oncomplete = null;
            this.onerror = null;
            this.onabort = null;
        }
        objectStore(name) {
            assert.ok(this.storeNames.includes(name));
            const map = this.staged[name];
            const tx = this;
            return {
                put(record) {
                    const key = name === 'presets' ? record.id : record.sheetKey;
                    map.set(key, structuredClone(record));
                },
                get(key) {
                    const request = { result: undefined, error: null, onsuccess: null, onerror: null };
                    queueMicrotask(() => {
                        request.result = structuredClone(map.get(key));
                        request.onsuccess?.();
                        if (autoComplete) setImmediate(() => tx.complete());
                    });
                    return request;
                },
                getAll() {
                    const request = { result: undefined, error: null, onsuccess: null, onerror: null };
                    queueMicrotask(() => {
                        request.result = [...map.values()].map(value => structuredClone(value));
                        request.onsuccess?.();
                        if (autoComplete) setImmediate(() => tx.complete());
                    });
                    return request;
                },
                delete(key) {
                    if ((name === 'activeByTable' || name === 'popupByTable') && key === deleteErrorKey) throw new Error('fixture binding delete failed');
                    map.delete(key);
                },
                index(indexName) {
                    assert.ok(name === 'activeByTable' || name === 'popupByTable');
                    assert.equal(indexName, 'presetId');
                    return {
                        getAll(presetId) {
                            const request = { result: undefined, error: null, onsuccess: null, onerror: null };
                            queueMicrotask(() => {
                                if (requestError) {
                                    request.error = requestError;
                                    request.onerror?.();
                                    return;
                                }
                                request.result = [...map.values()].filter(record => record.presetId === String(presetId)).map(record => structuredClone(record));
                                request.onsuccess?.();
                                if (autoComplete) setImmediate(() => tx.complete());
                            });
                            return request;
                        },
                    };
                },
            };
        }
        abort() {
            if (this.aborted || this.completed) return;
            this.abortCalls += 1;
            this.aborted = true;
            queueMicrotask(() => this.onabort?.());
        }
        complete() {
            if (this.aborted || this.completed) return;
            committed.presets = cloneMap(this.staged.presets);
            committed.activeByTable = cloneMap(this.staged.activeByTable);
            committed.popupByTable = cloneMap(this.staged.popupByTable);
            this.completed = true;
            this.oncomplete?.();
        }
    }

    const db = {
        close() {},
        onversionchange: null,
        transaction(storeNames, mode) {
            const tx = new Transaction(storeNames, mode);
            transactions.push(tx);
            return tx;
        },
    };
    const factory = {
        open() {
            const request = { result: db, error: null, onsuccess: null, onerror: null, onblocked: null, onupgradeneeded: null };
            queueMicrotask(() => request.onsuccess?.());
            return request;
        },
    };
    return { factory, committed, transactions, get lastTransaction() { return transactions.at(-1); } };
}

function validRecord(id, itemIds, name = id) {
    const manifestItems = itemIds.map(itemId => ({
        id: itemId,
        name: itemId,
        target: { tableName: '测试表', fields: ['字段'] },
        entry: { mount: 'pages/main.mjs' },
        assets: [],
    }));
    const items = manifestItems.map(item => ({
        ...item,
        target: { ...item.target, fields: [...item.target.fields] },
        entry: { ...item.entry },
        assets: [...item.assets],
        issues: [],
        activatable: true,
    }));
    return {
        id,
        name,
        version: '1.0.0',
        author: 'test',
        format: 'yuzi-beautify-preset',
        formatVersion: 2,
        apiVersion: 1,
        manifest: { id, name, version: '1.0.0', author: 'test', items: manifestItems },
        files: {
            'pages/main.mjs': {
                path: 'pages/main.mjs',
                mimeType: 'text/javascript', encoding: 'text', content: 'export function mount(context) {}',
            },
        },
        items,
        issues: [],
        importedAt: '2025-01-01T00:00:00.000Z',
    };
}

const seed = {
    presets: [
        validRecord('preset-1', ['old-a', 'old-b'], 'Old'),
        validRecord('preset-2', ['other-key', 'other'], 'Other'),
    ],
    activeByTable: [
        { sheetKey: 'sheet-a', presetId: 'preset-1', itemId: 'old-a' },
        { sheetKey: 'sheet-b', presetId: 'preset-1', itemId: 'old-b' },
        { sheetKey: 'preset-1', presetId: 'preset-2', itemId: 'other-key' },
        { sheetKey: 'sheet-c', presetId: 'preset-2', itemId: 'other' },
    ],
};

async function setup(options = {}) {
    const harness = createHarness({ seed, ...options });
    globalThis.indexedDB = harness.factory;
    return { harness, repository: await freshRepository() };
}

function assertTransaction(tx) {
    assert.deepEqual(tx.storeNames, ['presets', 'activeByTable', 'popupByTable']);
    assert.equal(tx.mode, 'readwrite');
}

async function main() {
    const originalIndexedDb = globalThis.indexedDB;
    try {
        {
            const valid = validRecord('preset-valid', ['item-valid']);
            const untrusted = { id: 'preset-untrusted', items: [{ id: 'item-untrusted', activatable: true, entry: { mount: 'pages/main.mjs' } }] };
            const malformedPath = validRecord('preset-malformed-path', ['item-malformed-path']);
            malformedPath.items[0].entry.mount = '../pages/main.mjs';
            malformedPath.files['../pages/main.mjs'] = malformedPath.files['pages/main.mjs'];
            const malformedHtml = validRecord('preset-malformed-html', ['item-malformed-html']);
            malformedHtml.items[0].entry.html = 'pages/page.html';
            malformedHtml.files['pages/page.html'] = {
                path: 'pages/page.html',
                mimeType: 'application/octet-stream', encoding: 'base64', content: 'x',
            };
            const malformedCss = validRecord('preset-malformed-css', ['item-malformed-css']);
            malformedCss.items[0].entry.css = 'pages/page.css';
            malformedCss.files['pages/page.css'] = {
                path: 'pages/page.css',
                mimeType: 'image/png', encoding: 'base64', content: 'x',
            };
            const legacyItem = validRecord('preset-legacy-item', ['item-legacy-item']);
            legacyItem.items[0].scriptMode = 'module';
            const { harness, repository } = await setup({ seed: {
                presets: [
                    valid,
                    untrusted,
                    malformedPath,
                    malformedHtml,
                    malformedCss,
                    legacyItem,
                    { ...validRecord('preset-inactive', ['item-inactive']), items: validRecord('preset-inactive', ['item-inactive']).items.map(item => ({ ...item, activatable: false })) },
                    { id: 'preset-legacy', items: [{ id: 'item-legacy', activatable: true, entry: { js: 'pages/old.js' } }] },
                ],
                activeByTable: [
                    { sheetKey: 'valid', presetId: 'preset-valid', itemId: 'item-valid' },
                    { sheetKey: 'untrusted', presetId: 'preset-untrusted', itemId: 'item-untrusted' },
                    { sheetKey: 'malformed-path', presetId: 'preset-malformed-path', itemId: 'item-malformed-path' },
                    { sheetKey: 'malformed-html', presetId: 'preset-malformed-html', itemId: 'item-malformed-html' },
                    { sheetKey: 'malformed-css', presetId: 'preset-malformed-css', itemId: 'item-malformed-css' },
                    { sheetKey: 'legacy-item', presetId: 'preset-legacy-item', itemId: 'item-legacy-item' },
                    { sheetKey: 'orphan-preset', presetId: 'missing', itemId: 'item-x' },
                    { sheetKey: 'orphan-item', presetId: 'preset-valid', itemId: 'missing' },
                    { sheetKey: 'inactive', presetId: 'preset-inactive', itemId: 'item-inactive' },
                    { sheetKey: 'legacy', presetId: 'preset-legacy', itemId: 'item-legacy' },
                    { sheetKey: '', presetId: 'preset-valid', itemId: 'item-valid' },
                ],
            } });
            assert.deepEqual((await repository.listPresetMetadata()).map(record => record.id), ['preset-valid', 'preset-inactive']);
            assert.deepEqual((await repository.listPresetRecords()).map(record => record.id), ['preset-valid', 'preset-inactive']);
            assert.equal((await repository.getPresetRecord('preset-untrusted')), null);
            assert.equal((await repository.getPresetRecord('preset-malformed-path')), null);
            assert.equal((await repository.getPresetRecord('preset-malformed-html')), null);
            assert.equal((await repository.getPresetRecord('preset-malformed-css')), null);
            assert.equal((await repository.getPresetExportRecord('preset-legacy-item')), null);
            assert.equal((await repository.getPresetExportRecord('preset-untrusted')), null);
            const bindings = await repository.loadActiveBindings();
            assert.deepEqual([...bindings], [['valid', { sheetKey: 'valid', presetId: 'preset-valid', itemId: 'item-valid' }]]);
            assert.deepEqual(harness.lastTransaction.storeNames, ['presets', 'activeByTable']);
            assert.equal(harness.lastTransaction.mode, 'readonly');
            assert.equal(harness.transactions.length, 9, '每个 repository 读取 API 必须各自使用单个事务，绑定过滤不得额外触发 N+1 查询事务');
        }

        {
            const { harness, repository } = await setup();
            const record = validRecord('preset-1', ['old-a', 'old-b'], 'New');
            const result = await repository.replacePresetRecord(record);
            assert.equal(harness.transactions.length, 1);
            assertTransaction(harness.lastTransaction);
            assert.deepEqual(result, { record, affectedSheetKeys: ['sheet-a', 'sheet-b'] });
            assert.deepEqual(harness.committed.presets.get('preset-1'), record);
            assert.equal(harness.committed.activeByTable.has('sheet-a'), false);
            assert.equal(harness.committed.activeByTable.has('sheet-b'), false);
            assert.equal(harness.committed.activeByTable.has('preset-1'), true, '不得把 presetId 错当 sheetKey 删除');
            assert.equal(harness.committed.activeByTable.has('sheet-c'), true);
        }

        {
            const { harness, repository } = await setup();
            const oldPath = 'user-assets/avatar.png';
            harness.committed.presets.get('preset-1').files[oldPath] = { path: oldPath, mimeType: 'image/png', encoding: 'base64', content: 'b2xk' };
            const path = 'user-assets/avatar.webp';
            const file = { path, mimeType: 'image/webp', encoding: 'base64', content: 'aW1hZ2U=' };
            const saved = await repository.updatePresetFiles('preset-1', { removePaths: [oldPath, path], file });
            assert.deepEqual(harness.lastTransaction.storeNames, ['presets']);
            assert.equal(harness.lastTransaction.mode, 'readwrite');
            assert.deepEqual(saved.files[path], file);
            assert.equal(oldPath in saved.files, false, '同槽旧扩展文件必须与新文件原子替换');
            assert.deepEqual(harness.committed.presets.get('preset-1').files[path], file);
            assert.equal(harness.committed.activeByTable.has('sheet-a'), true, '保存图片不得清除活动绑定');
            assert.equal(harness.committed.activeByTable.has('sheet-b'), true, '保存图片不得清除同预设的其他绑定');

            const removed = await repository.updatePresetFiles('preset-1', { removePaths: [oldPath, path] });
            assert.equal(path in removed.files, false);
            assert.equal(harness.committed.activeByTable.has('sheet-a'), true, '删除图片不得清除活动绑定');
        }

        {
            const { harness, repository } = await setup();
            const result = await repository.deletePresetRecord(' preset-1 ');
            assertTransaction(harness.lastTransaction);
            assert.deepEqual(result, { presetId: 'preset-1', affectedSheetKeys: ['sheet-a', 'sheet-b'] });
            assert.equal(harness.committed.presets.has('preset-1'), false);
            assert.equal(harness.committed.activeByTable.has('sheet-a'), false);
            assert.equal(harness.committed.activeByTable.has('sheet-b'), false);
            assert.equal(harness.committed.activeByTable.has('preset-1'), true);
        }

        {
            const { harness, repository } = await setup({ requestError: new Error('fixture binding lookup failed') });
            await assert.rejects(() => repository.replacePresetRecord(validRecord('preset-1', ['old-a', 'old-b'], 'Broken')), /fixture binding lookup failed/);
            assert.equal(harness.lastTransaction.abortCalls, 1);
            assert.equal(harness.lastTransaction.completed, false);
            assert.equal(harness.committed.presets.get('preset-1').name, 'Old');
            assert.equal(harness.committed.activeByTable.has('sheet-a'), true);
        }

        {
            const { harness, repository } = await setup({ deleteErrorKey: 'sheet-b' });
            await assert.rejects(() => repository.deletePresetRecord('preset-1'), /fixture binding delete failed/);
            assert.equal(harness.lastTransaction.abortCalls, 1);
            assert.equal(harness.lastTransaction.completed, false);
            assert.equal(harness.committed.presets.has('preset-1'), true);
            assert.equal(harness.committed.activeByTable.has('sheet-a'), true, '部分 staged 删除必须回滚');
            assert.equal(harness.committed.activeByTable.has('sheet-b'), true);
        }

        for (const [label, invoke] of [
            ['replace', repository => repository.replacePresetRecord(validRecord('preset-1', ['old-a', 'old-b'], 'Manual'))],
            ['delete', repository => repository.deletePresetRecord('preset-1')],
        ]) {
            const { harness, repository } = await setup({ autoComplete: false });
            let settled = false;
            const promise = invoke(repository).then(result => { settled = true; return result; });
            await turn();
            assert.equal(settled, false, `${label} 不得在 transaction complete 前 resolve`);
            assert.equal(harness.committed.presets.get('preset-1').name, 'Old');
            harness.lastTransaction.complete();
            await promise;
            assert.equal(settled, true);
        }

        {
            const malformedPath = validRecord('preset-malformed-path', ['item-malformed-path']);
            malformedPath.items[0].entry.mount = '../pages/main.mjs';
            malformedPath.files['../pages/main.mjs'] = malformedPath.files['pages/main.mjs'];
            const { harness, repository } = await setup({ seed: { presets: [malformedPath] } });
            await assert.rejects(
                () => repository.setActiveBinding('sheet-malformed-path', 'preset-malformed-path', 'item-malformed-path'),
                /不符合玉子美化 Runtime API 合同/,
            );
            assert.equal(harness.lastTransaction.abortCalls, 1, '拒绝畸形路径绑定时必须中止事务');
            assert.equal(harness.committed.activeByTable.has('sheet-malformed-path'), false);
            await assert.rejects(
                () => repository.replacePresetRecord(malformedPath),
                /不符合玉子美化 Runtime API 合同/,
            );
            assert.equal(harness.transactions.length, 1, 'replace 必须在开启事务前拒绝畸形路径记录');
        }

        {
            const malformedHtml = validRecord('preset-malformed-html', ['item-malformed-html']);
            malformedHtml.items[0].entry.html = 'pages/page.html';
            malformedHtml.files['pages/page.html'] = {
                path: 'pages/page.html',
                mimeType: 'application/octet-stream', encoding: 'base64', content: 'x',
            };
            const { harness, repository } = await setup({ seed: { presets: [malformedHtml] } });
            await assert.rejects(
                () => repository.setActiveBinding('sheet-malformed-html', 'preset-malformed-html', 'item-malformed-html'),
                /不符合玉子美化 Runtime API 合同/,
            );
            assert.equal(harness.lastTransaction.abortCalls, 1, '拒绝畸形 HTML 入口绑定时必须中止事务');
            await assert.rejects(
                () => repository.replacePresetRecord(malformedHtml),
                /不符合玉子美化 Runtime API 合同/,
            );
            assert.equal(harness.transactions.length, 1, 'replace 必须在开启事务前拒绝畸形 HTML 入口记录');
        }

        {
            const untrusted = { id: 'preset-untrusted', items: [{ id: 'item-untrusted', activatable: true, entry: { mount: 'pages/main.mjs' } }] };
            const { harness, repository } = await setup({ seed: { presets: [untrusted] } });
            await assert.rejects(
                () => repository.setActiveBinding('sheet-untrusted', 'preset-untrusted', 'item-untrusted'),
                /不符合玉子美化 Runtime API 合同/,
            );
            assert.equal(harness.lastTransaction.abortCalls, 1, '拒绝不可信绑定时必须中止事务');
            assert.equal(harness.committed.activeByTable.has('sheet-untrusted'), false);
        }
    } finally {
        if (originalIndexedDb === undefined) delete globalThis.indexedDB;
        else globalThis.indexedDB = originalIndexedDb;
    }

    console.log('[content-presets-repository-idb-behavior-check] 检查通过');
}

main().catch(error => {
    console.error('[content-presets-repository-idb-behavior-check] 检查失败');
    console.error(error);
    process.exitCode = 1;
});
